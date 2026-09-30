import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequest, ApiResponse } from '../../api/_lib/http/responses.js';
import { SheetsRequestError } from '../../api/_lib/sheets/client.js';

const { mockReadSessionUser, mockStore } = vi.hoisted(() => ({
  mockReadSessionUser: vi.fn(),
  mockStore: { getBootstrapForAuthorizedUser: vi.fn() }
}));

vi.mock('../../api/_lib/auth/session.js', () => ({
  readSessionUser: mockReadSessionUser
}));

vi.mock('../../api/_lib/storage/dataStore.js', () => ({
  getApiDataStore: () => mockStore
}));

import handler from '../../api/bootstrap.js';

function createResponse() {
  const state: { statusCode: number; body: unknown } = {
    statusCode: 0,
    body: undefined
  };
  const response: ApiResponse = {
    status(code) {
      state.statusCode = code;
      return response;
    },
    json(body) {
      state.body = body;
      return response;
    },
    setHeader() {},
    getHeader() {
      return undefined;
    },
    end() {}
  };
  return { response, state };
}

const request: ApiRequest = { method: 'GET', headers: {}, query: {} };

describe('bootstrap error propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockReadSessionUser.mockResolvedValue({
      id: 'user-1',
      email: 'volunteer@example.com'
    });
  });

  it('keeps a completed allowlist denial separate from infrastructure failure', async () => {
    mockStore.getBootstrapForAuthorizedUser.mockResolvedValue({
      allowed: false
    });
    const { response, state } = createResponse();

    await handler(request, response);

    expect(state).toMatchObject({
      statusCode: 403,
      body: {
        success: false,
        error: {
          code: 'FORBIDDEN',
          retryable: false,
          traceId: expect.any(String)
        }
      }
    });
  });

  it('returns a retryable 504 for a Sheets authorization timeout', async () => {
    mockStore.getBootstrapForAuthorizedUser.mockRejectedValue(
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
    const { response, state } = createResponse();

    await handler(request, response);

    expect(state).toMatchObject({
      statusCode: 504,
      body: {
        success: false,
        error: {
          code: 'UPSTREAM_TIMEOUT',
          message: 'Unable to load data right now. Please try again.',
          retryable: true,
          traceId: expect.any(String)
        }
      }
    });
    expect(console.error).toHaveBeenCalledWith(
      '[api-error]',
      expect.objectContaining({
        upstream: 'google_sheets',
        target: 'access',
        timeoutStage: 'authenticated_request'
      })
    );
  });

  it('forwards the requested assignee to the store', async () => {
    mockStore.getBootstrapForAuthorizedUser.mockResolvedValue({
      allowed: true,
      value: { success: true }
    });
    const { response, state } = createResponse();

    await handler(
      {
        method: 'GET',
        headers: {},
        query: {
          campaignId: 'all',
          assignee: 'other-volunteer@example.com'
        }
      },
      response
    );

    expect(state.statusCode).toBe(200);
    expect(mockStore.getBootstrapForAuthorizedUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'volunteer@example.com' }),
      'all',
      'other-volunteer@example.com'
    );
  });

  it('rejects an assignee outside the allowed list', async () => {
    mockStore.getBootstrapForAuthorizedUser.mockRejectedValue(
      new Error('VOLUNTEER_NOT_ALLOWED')
    );
    const { response, state } = createResponse();

    await handler(
      {
        method: 'GET',
        headers: {},
        query: { assignee: 'stranger@example.com' }
      },
      response
    );

    expect(state.statusCode).toBe(400);
    expect(state.body).toMatchObject({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The selected volunteer is not in the allowed list.'
      }
    });
  });
});
