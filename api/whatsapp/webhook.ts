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

const MAX_LOG_IDENTIFIER_CHARS = 128;

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

async function processEvent(event: IncomingWhatsAppEvent): Promise<boolean> {
  if (wasMessageProcessed(event.messageId)) {
    webhookLog('event_skipped', {
      messageId: boundedIdentifier(event.messageId),
      reason: 'duplicate'
    });
    return true;
  }

  try {
    if (event.type === 'text' && event.textBody) {
      const result = await handleIncomingText(
        event.from,
        event.textBody,
        event.messageId
      );

      if (result.action === 'show_confirmation' && result.parsed) {
        await sendConfirmationButtons(event.from, result.parsed);
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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === 'GET') {
    const verification = verifyWebhookHandshake(req);
    if (!verification.ok) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Invalid webhook verification token.'
        }
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
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' }
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
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_BODY', message: 'Invalid webhook body.' }
    });
  }

  // Signature validation deliberately happens before parsing or logging payload content.
  if (!verifyWebhookSignature(req, rawBody)) {
    webhookLog('invalid_signature');
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Invalid webhook signature.' }
    });
  }

  let payload: unknown;
  try {
    payload = parseWebhookPayload(req, rawBody);
  } catch {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_BODY', message: 'Invalid webhook JSON.' }
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

  // This app processes a handful of WhatsApp messages per day, so events are
  // handled one at a time, in delivery order - no concurrency to coordinate.
  let succeeded = true;
  for (const event of events) {
    if (!(await processEvent(event))) {
      succeeded = false;
    }
  }

  if (!succeeded) {
    return res.status(502).json({
      success: false,
      error: {
        code: 'WHATSAPP_PROCESSING_FAILED',
        message: 'One or more events failed.'
      }
    });
  }

  return res.status(200).json({ success: true });
}
