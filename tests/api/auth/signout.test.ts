import { decodeJwt, SignJWT } from 'jose';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi
} from 'vitest';
import handler from '../../../api/auth/index.js';
import type {
  ApiRequest,
  ApiResponse
} from '../../../api/_lib/http/responses.js';

const originalSessionSecret = process.env.SESSION_SECRET;
const originalSessionCookieName = process.env.SESSION_COOKIE_NAME;
const originalNodeEnv = process.env.NODE_ENV;

function createResponse() {
  const state: { statusCode: number; body: unknown } = {
    statusCode: 0,
    body: undefined
  };
  const headers = new Map<string, number | string | string[]>();
  const response: ApiResponse = {
    status(code) {
      state.statusCode = code;
      return response;
    },
    json(body) {
      state.body = body;
      return response;
    },
    setHeader(name, value) {
      headers.set(name, value);
    },
    getHeader(name) {
      return headers.get(name);
    },
    end() {}
  };
  return { response, state, headers };
}

describe('auth sign-out endpoint', () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters';
    process.env.SESSION_COOKIE_NAME = 'aolf_test_session';
    process.env.NODE_ENV = 'test';
  });

  afterAll(() => {
    if (originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSessionSecret;
    }
    if (originalSessionCookieName === undefined) {
      delete process.env.SESSION_COOKIE_NAME;
    } else {
      process.env.SESSION_COOKIE_NAME = originalSessionCookieName;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clears the session cookie for POST requests', async () => {
    const request: ApiRequest = {
      method: 'POST',
      headers: {},
      query: { action: 'signout' }
    };
    const { response, state, headers } = createResponse();

    await handler(request, response);

    expect(state).toEqual({ statusCode: 200, body: { success: true } });
    expect(headers.get('Set-Cookie')).toEqual([
      'aolf_test_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'
    ]);
  });

  it('renews a valid legacy session with a token that has no expiry', async () => {
    const legacy = await new SignJWT({
      email: 'volunteer@example.com',
      name: 'Volunteer'
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('volunteer-id')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(process.env.SESSION_SECRET));
    const { response, state, headers } = createResponse();

    await handler(
      {
        method: 'GET',
        headers: { cookie: 'aolf_test_session=' + legacy },
        query: { action: 'session' }
      },
      response
    );

    expect(state.statusCode).toBe(200);
    expect(state.body).toMatchObject({ user: { id: 'volunteer-id' } });
    expect(headers.get('Cache-Control')).toBe('no-store');
    const cookies = headers.get('Set-Cookie') as string[];
    expect(cookies[0]).toContain('Max-Age=34560000');
    const renewed = cookies[0].split(';')[0].split('=')[1];
    expect(decodeJwt(renewed)).not.toHaveProperty('exp');
  });

  it('rejects other methods without clearing the cookie', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const request: ApiRequest = {
      method: 'GET',
      headers: {},
      query: { action: 'signout' }
    };
    const { response, state, headers } = createResponse();

    await handler(request, response);

    expect(state).toMatchObject({
      statusCode: 405,
      body: {
        success: false,
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: 'Method not allowed.',
          retryable: false,
          traceId: expect.any(String)
        }
      }
    });
    expect(headers.get('Allow')).toBe('POST');
    expect(headers.has('Set-Cookie')).toBe(false);
  });
});
