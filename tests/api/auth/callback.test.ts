import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ApiRequest,
  ApiResponse
} from '../../../api/_lib/http/responses.js';
import { SheetsRequestError } from '../../../api/_lib/sheets/client.js';

const { mockGetUserFromAuthCode, mockSetSessionCookie, mockStore } = vi.hoisted(
  () => ({
    mockGetUserFromAuthCode: vi.fn(),
    mockSetSessionCookie: vi.fn(),
    mockStore: { isUserAllowed: vi.fn() }
  })
);

vi.mock('../../../api/_lib/auth/oauth.js', () => ({
  getUserFromAuthCode: mockGetUserFromAuthCode
}));

vi.mock('../../../api/_lib/auth/session.js', () => ({
  setSessionCookie: mockSetSessionCookie
}));

vi.mock('../../../api/_lib/storage/dataStore.js', () => ({
  getApiDataStore: () => mockStore
}));

import handler from '../../../api/auth/callback.js';

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

const request: ApiRequest = {
  method: 'GET',
  headers: { cookie: 'aolf_oauth_state=expected-state' },
  query: { code: 'auth-code', state: 'expected-state' }
};

describe('Google OAuth callback error distinction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGetUserFromAuthCode.mockResolvedValue({
      id: 'user-1',
      email: 'volunteer@example.com'
    });
  });

  it('redirects a completed authorization denial as forbidden', async () => {
    mockStore.isUserAllowed.mockResolvedValue(false);
    const { response, state, headers } = createResponse();

    await handler(request, response);

    expect(state.statusCode).toBe(302);
    expect(headers.get('Location')).toBe('/login?error=forbidden');
  });

  it('redirects a Sheets timeout as an upstream timeout, not forbidden', async () => {
    mockStore.isUserAllowed.mockRejectedValue(
      new SheetsRequestError(
        'Google Sheets authenticated request timed out.',
        'timeout',
        'access',
        'values.get',
        10_000,
        true,
        undefined,
        undefined,
        'authenticated_request'
      )
    );
    const { response, state, headers } = createResponse();

    await handler(request, response);

    expect(state.statusCode).toBe(302);
    expect(headers.get('Location')).toBe('/login?error=upstream_timeout');
  });
});
