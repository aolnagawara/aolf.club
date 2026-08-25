import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResponse } from '../../../api/_lib/http/responses.js';

const { mockReadSessionUser, mockAssignMembers } = vi.hoisted(() => ({
  mockReadSessionUser: vi.fn(),
  mockAssignMembers: vi.fn()
}));

vi.mock('../../../api/_lib/auth/session.js', () => ({
  readSessionUser: mockReadSessionUser
}));

vi.mock('../../../api/_lib/storage/dataStore.js', () => ({
  getApiDataStore: () => ({
    createLeadForAuthorizedUser: vi.fn(),
    updateLeadForAuthorizedUser: vi.fn(),
    deleteLeadForAuthorizedUser: vi.fn(),
    assignMembersForAuthorizedUser: mockAssignMembers
  })
}));

import leadHandler from '../../../api/leads/index.js';

function createResponse() {
  const state: { statusCode: number; body: unknown; allow: string } = {
    statusCode: 0,
    body: undefined,
    allow: ''
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
    setHeader(name, value) {
      if (name === 'Allow') {
        state.allow = String(value);
      }
    },
    getHeader() {
      return undefined;
    },
    end() {}
  };
  return { response, state };
}

describe('assign members API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockReadSessionUser.mockResolvedValue({
      id: 'user-1',
      email: 'volunteer@example.com'
    });
  });

  it('assigns members for the authenticated volunteer', async () => {
    const body = {
      campaignId: 'cmpMembs01AbcDefGhIJK',
      count: 5,
      engagementLevels: ['Active']
    };
    const value = {
      success: true,
      requestedCount: 5,
      assignedCount: 1,
      remainingCapacity: 98,
      members: []
    };
    mockAssignMembers.mockResolvedValue({ allowed: true, value });
    const { response, state } = createResponse();

    await leadHandler(
      { method: 'POST', headers: {}, query: { action: 'assign' }, body },
      response
    );

    expect(mockAssignMembers).toHaveBeenCalledWith(
      { id: 'user-1', email: 'volunteer@example.com' },
      body
    );
    expect(state).toEqual({ statusCode: 200, body: value, allow: '' });
  });

  it('rejects unauthenticated and non-POST requests', async () => {
    mockReadSessionUser.mockResolvedValue(null);
    const unauthenticated = createResponse();
    await leadHandler(
      {
        method: 'POST',
        headers: {},
        query: { action: 'assign' },
        body: {}
      },
      unauthenticated.response
    );
    expect(unauthenticated.state).toMatchObject({
      statusCode: 401,
      body: { success: false, error: { code: 'UNAUTHENTICATED' } }
    });

    const wrongMethod = createResponse();
    await leadHandler(
      {
        method: 'GET',
        headers: {},
        query: { action: 'assign' },
        body: {}
      },
      wrongMethod.response
    );
    expect(wrongMethod.state.statusCode).toBe(405);
    expect(wrongMethod.state.allow).toBe('POST');
  });
});
