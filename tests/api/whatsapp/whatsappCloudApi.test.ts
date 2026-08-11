import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequest } from '../../../api/_lib/http/responses.js';
import {
  parseWebhookPayload,
  readWebhookRawBody,
  sendConfirmationButtons,
  sendTextMessage,
  verifyWebhookHandshake,
  verifyWebhookSignature
} from '../../../api/_lib/whatsapp/cloudApi.js';

const originalEnv = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(originalEnv)) {
    process.env[key] = value;
  }
}

function createBaseRequest(): ApiRequest {
  return {
    headers: {},
    query: {},
    body: {}
  };
}

describe('whatsappCloudApi verification helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    restoreEnv();
  });

  it('validates callback handshake using verify token', () => {
    process.env.META_VERIFY_TOKEN = 'token-123';

    const req: ApiRequest = {
      ...createBaseRequest(),
      query: {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'token-123',
        'hub.challenge': 'abc123'
      }
    };

    const result = verifyWebhookHandshake(req);
    expect(result.ok).toBe(true);
    expect(result.challenge).toBe('abc123');
  });

  it('validates webhook signature using app secret', () => {
    process.env.META_APP_SECRET = 'secret-123';

    const body = { ping: 'pong' };
    const digest = createHmac('sha256', 'secret-123')
      .update(JSON.stringify(body))
      .digest('hex');
    const req: ApiRequest = {
      ...createBaseRequest(),
      headers: {
        'x-hub-signature-256': 'sha256=' + digest
      },
      body
    };

    expect(verifyWebhookSignature(req)).toBe(true);
  });

  it('verifies the exact raw JSON bytes instead of re-serialized JSON', async () => {
    process.env.META_APP_SECRET = 'secret-123';
    const rawBody = '{\n  "ping": "pong"\n}';
    const digest = createHmac('sha256', 'secret-123')
      .update(rawBody)
      .digest('hex');
    let parsedBodyGetterAccessed = false;
    const req = {
      ...createBaseRequest(),
      get body() {
        parsedBodyGetterAccessed = true;
        return { ping: 'pong' };
      },
      headers: {
        'x-hub-signature-256': 'sha256=' + digest
      },
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(rawBody.slice(0, 8));
        yield Buffer.from(rawBody.slice(8));
      }
    } as ApiRequest & AsyncIterable<Buffer>;

    const captured = await readWebhookRawBody(req);

    expect(parsedBodyGetterAccessed).toBe(false);
    expect(captured.toString('utf8')).toBe(rawBody);
    expect(verifyWebhookSignature(req, captured)).toBe(true);
    expect(parseWebhookPayload(req, captured)).toEqual({ ping: 'pong' });
  });

  it('aborts a Meta messaging request at the explicit deadline', async () => {
    vi.useFakeTimers();
    process.env.META_ACCESS_TOKEN = 'access-token';
    process.env.META_PHONE_NUMBER_ID = 'phone-id';
    process.env.META_API_VERSION = 'v21.0';
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string | URL | Request, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      })
    );

    const request = sendTextMessage('919876543210', 'Hello');
    const assertion = expect(request).rejects.toThrow(
      'WhatsApp API request timed out after 10000ms.'
    );
    await vi.advanceTimersByTimeAsync(10_001);
    await assertion;
  });

  it('sends only extracted fields in the confirmation body', async () => {
    process.env.META_ACCESS_TOKEN = 'access-token';
    process.env.META_PHONE_NUMBER_ID = 'phone-id';
    process.env.META_API_VERSION = 'v21.0';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => ''
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await sendConfirmationButtons('919876543210', {
      name: 'Sandip',
      mobile: '9876543210',
      course: 'HP',
      leadQuality: 'Hot',
      month: 'Aug',
      notes: 'Call tomorrow',
      originalMessage: 'RAW SOURCE MESSAGE THAT MUST STAY HIDDEN'
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(request.body)) as {
      interactive: { body: { text: string } };
    };
    expect(payload.interactive.body.text).toBe(
      [
        '📋 Please confirm the extracted details',
        '',
        '👤 Name      : Sandip',
        '📱 Mobile    : 9876543210',
        '📘 Course    : HP',
        '🔥 Quality   : Hot',
        '📅 Month     : Aug',
        '📝 Notes     : Call tomorrow'
      ].join('\n')
    );
    expect(payload.interactive.body.text).not.toContain('Original Message');
    expect(payload.interactive.body.text).not.toContain('RAW SOURCE MESSAGE');
  });
});
