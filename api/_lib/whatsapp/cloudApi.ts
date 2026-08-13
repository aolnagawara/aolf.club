import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  getWhatsAppMessagingEnv,
  getWhatsAppSignatureEnv,
  getWhatsAppVerifyEnv
} from '../config/env.js';
import type { ApiRequest } from '../http/responses.js';
import type { ParsedLeadMessage } from './leadParser.js';
import { buildConfirmationButtonId } from './confirmationToken.js';

const META_REQUEST_TIMEOUT_MS = 10_000;
const MAX_META_ERROR_BODY_CHARS = 1_000;
const MAX_WEBHOOK_BODY_BYTES = 1_000_000;

export type IncomingWhatsAppEvent = {
  from: string;
  messageId: string;
  type: 'text' | 'button';
  textBody?: string;
  buttonReplyId?: string;
};

type MetaPayload = {
  field?: string;
  value?: {
    messages?: Array<{
      id?: string;
      from?: string;
      type?: string;
      text?: { body?: string };
      interactive?: {
        button_reply?: {
          id?: string;
          title?: string;
        };
      };
    }>;
  };
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          id?: string;
          from?: string;
          type?: string;
          text?: { body?: string };
          interactive?: {
            button_reply?: {
              id?: string;
              title?: string;
            };
          };
        }>;
      };
    }>;
  }>;
};

type MetaChangeValue = {
  messages?: Array<{
    id?: string;
    from?: string;
    type?: string;
    text?: { body?: string };
    interactive?: {
      button_reply?: {
        id?: string;
        title?: string;
      };
    };
  }>;
};

function extractChangeValues(body: MetaPayload): MetaChangeValue[] {
  const values: MetaChangeValue[] = [];

  if (body.value && Array.isArray(body.value.messages)) {
    values.push(body.value);
  }

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.value) {
        values.push(change.value);
      }
    }
  }

  return values;
}

function bodyAsBuffer(body: unknown): Buffer {
  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  if (typeof body === 'string') {
    return Buffer.from(body, 'utf8');
  }

  if (body == null) {
    return Buffer.alloc(0);
  }

  return Buffer.from(JSON.stringify(body) ?? '', 'utf8');
}

function assertWebhookBodySize(size: number): void {
  if (size > MAX_WEBHOOK_BODY_BYTES) {
    throw new Error('WHATSAPP_WEBHOOK_BODY_TOO_LARGE');
  }
}

export async function readWebhookRawBody(req: ApiRequest): Promise<Buffer> {
  const explicitRawBody = (req as ApiRequest & { rawBody?: unknown }).rawBody;
  if (explicitRawBody !== undefined) {
    const rawBody = bodyAsBuffer(explicitRawBody);
    assertWebhookBodySize(rawBody.byteLength);
    return rawBody;
  }

  const stream = req as ApiRequest & AsyncIterable<unknown>;
  if (typeof stream[Symbol.asyncIterator] === 'function') {
    // Vercel exposes `request.body` as a lazy parsed getter. Consume the underlying
    // IncomingMessage stream before ever touching that getter so the HMAC uses the
    // exact bytes Meta signed.
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of stream) {
      const buffer = bodyAsBuffer(chunk);
      totalBytes += buffer.byteLength;
      assertWebhookBodySize(totalBytes);
      chunks.push(buffer);
    }
    return Buffer.concat(chunks, totalBytes);
  }

  // Unit tests and non-stream adapters may provide an already materialized body.
  if (req.body !== undefined) {
    const rawBody = bodyAsBuffer(req.body);
    assertWebhookBodySize(rawBody.byteLength);
    return rawBody;
  }

  return Buffer.alloc(0);
}

export function parseWebhookPayload(
  _req: ApiRequest,
  rawBody: Uint8Array
): unknown {
  const text = Buffer.from(rawBody).toString('utf8');
  return text ? (JSON.parse(text) as unknown) : {};
}

export function verifyWebhookHandshake(req: ApiRequest): {
  ok: boolean;
  challenge: string;
} {
  let env: ReturnType<typeof getWhatsAppVerifyEnv>;
  try {
    env = getWhatsAppVerifyEnv();
  } catch {
    return { ok: false, challenge: '' };
  }

  const mode =
    typeof req.query['hub.mode'] === 'string' ? req.query['hub.mode'] : '';
  const token =
    typeof req.query['hub.verify_token'] === 'string'
      ? req.query['hub.verify_token']
      : '';
  const challenge =
    typeof req.query['hub.challenge'] === 'string'
      ? req.query['hub.challenge']
      : '';

  return {
    ok: mode === 'subscribe' && token === env.META_VERIFY_TOKEN,
    challenge
  };
}

export function verifyWebhookSignature(
  req: ApiRequest,
  rawBody: Uint8Array = bodyAsBuffer(req.body)
): boolean {
  let env: ReturnType<typeof getWhatsAppSignatureEnv>;
  try {
    env = getWhatsAppSignatureEnv();
  } catch {
    return false;
  }

  const rawSignature = req.headers['x-hub-signature-256'];
  const signature = Array.isArray(rawSignature)
    ? rawSignature[0]
    : rawSignature;

  if (!signature || !signature.startsWith('sha256=')) {
    return false;
  }

  const expected =
    'sha256=' +
    createHmac('sha256', env.META_APP_SECRET).update(rawBody).digest('hex');

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function parseIncomingWhatsAppEvents(
  payload: unknown
): IncomingWhatsAppEvent[] {
  const body = (payload || {}) as MetaPayload;
  const events: IncomingWhatsAppEvent[] = [];

  const values = extractChangeValues(body);

  for (const value of values) {
    for (const message of value.messages || []) {
      const from = String(message.from || '').trim();
      const messageId = String(message.id || '').trim();
      if (!from || !messageId) {
        continue;
      }

      if (message.type === 'text') {
        const textBody = String(message.text?.body || '').trim();
        if (!textBody) {
          continue;
        }
        events.push({ from, messageId, type: 'text', textBody });
        continue;
      }

      if (message.type === 'interactive') {
        const buttonReplyId = String(
          message.interactive?.button_reply?.id || ''
        ).trim();
        if (!buttonReplyId) {
          continue;
        }
        events.push({ from, messageId, type: 'button', buttonReplyId });
      }
    }
  }

  return events;
}

async function postToWhatsApp(payload: unknown): Promise<void> {
  const env = getWhatsAppMessagingEnv();
  const url =
    'https://graph.facebook.com/' +
    env.META_API_VERSION +
    '/' +
    env.META_PHONE_NUMBER_ID +
    '/messages';
  const abortController = new AbortController();
  const timeout = setTimeout(
    () => abortController.abort(),
    META_REQUEST_TIMEOUT_MS
  );
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + env.META_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: abortController.signal
    });
    if (!response.ok) {
      const text = (await response.text()).slice(0, MAX_META_ERROR_BODY_CHARS);
      throw new Error(
        'WhatsApp API error (' + String(response.status) + '): ' + text
      );
    }
  } catch (error) {
    if (abortController.signal.aborted) {
      throw new Error(
        `WhatsApp API request timed out after ${META_REQUEST_TIMEOUT_MS}ms.`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendTextMessage(
  to: string,
  message: string
): Promise<void> {
  await postToWhatsApp({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: {
      body: message
    }
  });
}

export async function sendConfirmationButtons(
  to: string,
  parsed: ParsedLeadMessage,
  confirmationToken = ''
): Promise<void> {
  const details = [
    '📋 Please confirm the extracted details',
    '',
    '👤 Name      : ' + (parsed.name || '-'),
    '📱 Mobile    : ' + (parsed.mobile || '-'),
    '📘 Course    : ' + (parsed.course || '-'),
    '🔥 Quality   : ' + (parsed.leadQuality || '-'),
    '📅 Month     : ' + (parsed.month || '-'),
    '📝 Notes     : ' + (parsed.notes || '-')
  ].join('\n');

  await postToWhatsApp({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: details
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: buildConfirmationButtonId('confirm_save', confirmationToken),
              title: '✅ Confirm & Save'
            }
          },
          {
            type: 'reply',
            reply: {
              id: buildConfirmationButtonId('edit_lead', confirmationToken),
              title: '✏️ Edit'
            }
          }
        ]
      }
    }
  });
}
