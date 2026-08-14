import type { ApiRequest, ApiResponse } from '../_lib/http/responses.js';
import {
  type IncomingWhatsAppEvent,
  parseIncomingWhatsAppEvents,
  parseWebhookPayload,
  readWebhookRawBody,
  sendConfirmationButtons,
  sendTextMessage,
  verifyWebhookHandshake,
  verifyWebhookSignature
} from '../_lib/whatsapp/cloudApi.js';
import {
  handleButtonReply,
  handleIncomingText
} from '../_lib/whatsapp/leadCaptureService.js';
import {
  markMessageProcessed,
  wasMessageProcessed
} from '../_lib/whatsapp/pendingStore.js';
import { sendApiError } from '../_lib/http/errors.js';

const MAX_LOG_IDENTIFIER_CHARS = 128;
const inFlightEvents = new Map<string, Promise<boolean>>();

export const config = {
  api: {
    bodyParser: false
  }
};

function boundedIdentifier(value: string): string {
  return String(value || '').slice(0, MAX_LOG_IDENTIFIER_CHARS);
}

function webhookLog(message: string, details?: Record<string, unknown>) {
  if (details) {
    console.log('[whatsapp-webhook]', message, details);
    return;
  }
  console.log('[whatsapp-webhook]', message);
}

async function processEventOnce(
  event: IncomingWhatsAppEvent
): Promise<boolean> {
  try {
    if (event.type === 'text' && event.textBody) {
      const result = await handleIncomingText(
        event.from,
        event.textBody,
        event.messageId
      );

      if (result.action === 'show_confirmation' && result.parsed) {
        await sendConfirmationButtons(
          event.from,
          result.parsed,
          result.confirmationToken
        );
      } else if (result.action === 'send_text' && result.message) {
        await sendTextMessage(event.from, result.message);
      }
    } else if (event.type === 'button' && event.buttonReplyId) {
      const result = await handleButtonReply(event.from, event.buttonReplyId);
      const messages = result.messages?.length
        ? result.messages
        : result.message
          ? [result.message]
          : [];
      for (const message of messages) {
        await sendTextMessage(event.from, message);
      }
    }

    markMessageProcessed(event.messageId);
    return true;
  } catch (error) {
    console.error('[whatsapp-webhook] event processing failed', {
      messageId: boundedIdentifier(event.messageId),
      type: event.type,
      error: boundedIdentifier(
        error instanceof Error ? error.message : String(error)
      )
    });
    return false;
  }
}

async function processEvent(event: IncomingWhatsAppEvent): Promise<boolean> {
  if (wasMessageProcessed(event.messageId)) {
    webhookLog('event_skipped', {
      messageId: boundedIdentifier(event.messageId),
      reason: 'duplicate'
    });
    return true;
  }

  const existing = inFlightEvents.get(event.messageId);
  if (existing) {
    webhookLog('event_coalesced', {
      messageId: boundedIdentifier(event.messageId),
      reason: 'duplicate_in_flight'
    });
    return existing;
  }

  const processing = processEventOnce(event);
  inFlightEvents.set(event.messageId, processing);
  try {
    return await processing;
  } finally {
    if (inFlightEvents.get(event.messageId) === processing) {
      inFlightEvents.delete(event.messageId);
    }
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const context = {
    route: String(req.method || 'UNKNOWN') + ' /api/whatsapp/webhook',
    action: 'process_whatsapp_webhook',
    startedAt: Date.now(),
    messages: {
      validation: 'Invalid webhook request.',
      internal: 'Unable to process webhook request.'
    }
  };

  if (req.method === 'GET') {
    let verification: ReturnType<typeof verifyWebhookHandshake>;
    try {
      verification = verifyWebhookHandshake(req);
    } catch (error) {
      return sendApiError(res, error, context, {
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'Webhook verification is not configured.',
        retryable: false,
        category: 'configuration'
      });
    }
    if (!verification.ok) {
      return sendApiError(res, new Error('Invalid verification token.'), context, {
        status: 403,
        code: 'FORBIDDEN',
        message: 'Invalid webhook verification token.',
        retryable: false,
        category: 'authorization_denied'
      });
    }
    res.setHeader('Content-Type', 'text/plain');
    return res.end(verification.challenge);
  }

  if (req.method !== 'POST') {
    webhookLog('method_not_allowed', {
      method: boundedIdentifier(req.method || 'UNKNOWN')
    });
    res.setHeader('Allow', ['GET', 'POST']);
    return sendApiError(res, new Error('Method not allowed.'), context, {
      status: 405,
      code: 'METHOD_NOT_ALLOWED',
      message: 'Method not allowed.',
      retryable: false,
      category: 'method_not_allowed'
    });
  }

  let rawBody: Buffer;
  try {
    rawBody = await readWebhookRawBody(req);
  } catch (error) {
    webhookLog('invalid_body', {
      error: boundedIdentifier(
        error instanceof Error ? error.message : String(error)
      )
    });
    return sendApiError(res, error, context, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid webhook body.',
      retryable: false,
      category: 'validation'
    });
  }

  // Signature validation deliberately happens before parsing or logging payload content.
  let signatureValid: boolean;
  try {
    signatureValid = verifyWebhookSignature(req, rawBody);
  } catch (error) {
    return sendApiError(res, error, context, {
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Webhook signature verification is not configured.',
      retryable: false,
      category: 'configuration'
    });
  }
  if (!signatureValid) {
    webhookLog('invalid_signature');
    return sendApiError(res, new Error('Invalid webhook signature.'), context, {
      status: 403,
      code: 'FORBIDDEN',
      message: 'Invalid webhook signature.',
      retryable: false,
      category: 'authorization_denied'
    });
  }

  let payload: unknown;
  try {
    payload = parseWebhookPayload(req, rawBody);
  } catch (error) {
    return sendApiError(res, error, context, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid webhook JSON.',
      retryable: false,
      category: 'validation'
    });
  }

  const events = parseIncomingWhatsAppEvents(payload);
  webhookLog('payload_accepted', {
    eventCount: events.length,
    senderCount: new Set(events.map((event) => event.from)).size,
    messageIds: events
      .slice(0, 10)
      .map((event) => boundedIdentifier(event.messageId))
  });

  if (!events.length) {
    return res.status(200).json({ success: true, ignored: true });
  }

  // Events in one delivery are handled in order. Concurrent deliveries of the
  // same message id are coalesced by processEvent's in-memory promise map.
  let succeeded = true;
  for (const event of events) {
    if (!(await processEvent(event))) {
      succeeded = false;
    }
  }

  if (!succeeded) {
    return sendApiError(res, new Error('One or more events failed.'), context, {
      status: 502,
      code: 'UPSTREAM_ERROR',
      message: 'One or more events failed.',
      retryable: true,
      category: 'event_processing_failed'
    });
  }

  return res.status(200).json({ success: true });
}
