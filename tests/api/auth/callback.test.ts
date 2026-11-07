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
  buildGoogleAuthUrl: vi.fn(),
  createOAuthState: vi.fn(),
  getUserFromAuthCode: mockGetUserFromAuthCode
}));

vi.mock('../../../api/_lib/auth/session.js', () => ({
  clearSessionCookie: vi.fn(),
  readSessionUser: vi.fn(),
  setSessionCookie: mockSetSessionCookie
}));

vi.mock('../../../api/_lib/storage/dataStore.js', () => ({
  getApiDataStore: () => mockStore
}));

import handler from '../../../api/auth/index.js';
import {
  buildGoogleAuthUrl,
  createOAuthState
} from '../../../api/_lib/auth/oauth.js';

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
  query: { action: 'callback', code: 'auth-code', state: 'expected-state' }
};

describe('Google OAuth callback error distinction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(createOAuthState).mockReturnValue('expected-state');
    vi.mocked(buildGoogleAuthUrl).mockReturnValue(
      'https://accounts.google.com/test'
    );
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
    expect(headers.get('Location')).toBe('/seva?error=forbidden');
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
    expect(headers.get('Location')).toBe('/seva?error=upstream_timeout');
  });

  it('redirects a successful sign-in to the volunteer workspace', async () => {
    mockStore.isUserAllowed.mockResolvedValue(true);
    const { response, state, headers } = createResponse();

    await handler(request, response);

    expect(state.statusCode).toBe(302);
    expect(headers.get('Location')).toBe('/seva');
    expect(mockSetSessionCookie).toHaveBeenCalledOnce();
  });

  it('returns volunteers to /add after signing in and clears the return cookie', async () => {
    mockStore.isUserAllowed.mockResolvedValue(true);
    const { response, headers } = createResponse();

    await handler(
      {
        ...request,
        headers: {
          cookie: 'aolf_oauth_state=expected-state; aolf_oauth_return_to=%2Fadd'
        }
      },
      response
    );

    expect(headers.get('Location')).toBe('/add');
    expect(headers.get('Set-Cookie')).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^aolf_oauth_return_to=;.*Max-Age=0/)
      ])
    );
  });

  it('returns authorization errors to the quick-add sign-in page', async () => {
    mockStore.isUserAllowed.mockResolvedValue(false);
    const { response, headers } = createResponse();
    await handler(
      {
        ...request,
        headers: {
          cookie: 'aolf_oauth_state=expected-state; aolf_oauth_return_to=%2Fadd'
        }
      },
      response
    );
    expect(headers.get('Location')).toBe('/add?error=forbidden');
  });

  it('rejects external return destinations', async () => {
    mockStore.isUserAllowed.mockResolvedValue(true);
    const { response, headers } = createResponse();
    await handler(
      {
        ...request,
        headers: {
          cookie:
            'aolf_oauth_state=expected-state; aolf_oauth_return_to=https%3A%2F%2Fexample.com'
        }
      },
      response
    );
    expect(headers.get('Location')).toBe('/seva');
  });

  it.each([
    ['/add', '%2Fadd'],
    ['https://example.com', '%2Fseva']
  ])(
    'remembers only supported return pages during sign-in (%s)',
    async (returnTo, encoded) => {
      const { response, headers } = createResponse();
      await handler(
        { method: 'GET', headers: {}, query: { action: 'signin', returnTo } },
        response
      );
      expect(headers.get('Set-Cookie')).toEqual(
        expect.arrayContaining([
          expect.stringContaining('aolf_oauth_return_to=' + encoded + ';')
        ])
      );
    }
  );
});
