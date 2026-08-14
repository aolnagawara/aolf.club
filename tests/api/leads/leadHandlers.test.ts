import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type {
  ApiRequest,
  ApiResponse
} from '../../../api/_lib/http/responses.js';

const { mockReadSessionUser, mockStore } = vi.hoisted(() => ({
  mockReadSessionUser: vi.fn(),
  mockStore: {
    createLeadForAuthorizedUser: vi.fn(),
    updateLeadForAuthorizedUser: vi.fn(),
    deleteLeadForAuthorizedUser: vi.fn()
  }
}));

vi.mock('../../../api/_lib/auth/session.js', () => ({
  readSessionUser: mockReadSessionUser
}));

vi.mock('../../../api/_lib/storage/dataStore.js', () => ({
  getApiDataStore: () => mockStore
}));

import createLeadHandler from '../../../api/leads/index.js';
import mutateLeadHandler from '../../../api/leads/[id].js';

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

describe('lead API error classification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadSessionUser.mockResolvedValue({
      id: 'user-1',
      email: 'volunteer@example.com'
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('keeps schema failures as create validation errors', async () => {
    let validationError: unknown;
    try {
      z.string().min(1).parse('');
    } catch (error) {
      validationError = error;
    }
    mockStore.createLeadForAuthorizedUser.mockRejectedValue(validationError);
    const { response, state } = createResponse();

    await createLeadHandler(
      { method: 'POST', headers: {}, query: {}, body: {} },
      response
    );

    expect(state).toMatchObject({
      statusCode: 400,
      body: {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid record details.',
          retryable: false,
          traceId: expect.any(String)
        }
      }
    });
    expect(console.error).toHaveBeenCalledOnce();
  });

  it('reports unexpected create failures as internal errors', async () => {
    mockStore.createLeadForAuthorizedUser.mockRejectedValue(
      new Error('Lead sheet is missing header row.')
    );
    const { response, state } = createResponse();

    await createLeadHandler(
      { method: 'POST', headers: {}, query: {}, body: {} },
      response
    );

    expect(state.statusCode).toBe(500);
    expect(state.body).toMatchObject({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to save the record.',
        retryable: false,
        traceId: expect.any(String)
      }
    });
    expect(console.error).toHaveBeenCalledOnce();
  });

  it('reports unexpected update failures as internal errors', async () => {
    mockStore.updateLeadForAuthorizedUser.mockRejectedValue(
      new Error('Lead sheet is missing header row.')
    );
    const request: ApiRequest = {
      method: 'PUT',
      headers: {},
      query: { id: 'lead-1' },
      body: {}
    };
    const { response, state } = createResponse();

    await mutateLeadHandler(request, response);

    expect(state.statusCode).toBe(500);
    expect(state.body).toMatchObject({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to save lead changes.',
        retryable: false,
        traceId: expect.any(String)
      }
    });
    expect(console.error).toHaveBeenCalledOnce();
  });
});
