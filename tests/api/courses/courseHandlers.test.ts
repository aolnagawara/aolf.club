import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ApiResponse } from '../../../api/_lib/http/responses.js';

const { mockReadSessionUser, mockStore } = vi.hoisted(() => ({
  mockReadSessionUser: vi.fn(),
  mockStore: {
    listCoursesForAuthorizedUser: vi.fn(),
    createCourseForAuthorizedUser: vi.fn(),
    updateCourseForAuthorizedUser: vi.fn(),
    deleteCourseForAuthorizedUser: vi.fn()
  }
}));

vi.mock('../../../api/_lib/auth/session.js', () => ({
  readSessionUser: mockReadSessionUser
}));

vi.mock('../../../api/_lib/storage/dataStore.js', () => ({
  getApiDataStore: () => mockStore
}));

import createCourseHandler from '../../../api/courses/index.js';
import mutateCourseHandler from '../../../api/courses/[id].js';

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

describe('course API handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadSessionUser.mockResolvedValue({
      id: 'user-1',
      email: 'volunteer@example.com'
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('rejects unauthenticated list requests', async () => {
    mockReadSessionUser.mockResolvedValue(null);
    const { response, state } = createResponse();
    await createCourseHandler(
      { method: 'GET', headers: {}, query: {} },
      response
    );
    expect(state.statusCode).toBe(401);
  });

  it('rejects forbidden list requests', async () => {
    mockStore.listCoursesForAuthorizedUser.mockResolvedValue({
      allowed: false
    });
    const { response, state } = createResponse();
    await createCourseHandler(
      { method: 'GET', headers: {}, query: {} },
      response
    );
    expect(state.statusCode).toBe(403);
  });

  it('keeps schema failures as create validation errors', async () => {
    let validationError: unknown;
    try {
      z.string().min(1).parse('');
    } catch (error) {
      validationError = error;
    }
    mockStore.createCourseForAuthorizedUser.mockRejectedValue(validationError);
    const { response, state } = createResponse();
    await createCourseHandler(
      { method: 'POST', headers: {}, query: {}, body: {} },
      response
    );
    expect(state.statusCode).toBe(400);
    expect(state.body).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' }
    });
  });

  it('returns 404 when updating a missing course', async () => {
    mockStore.updateCourseForAuthorizedUser.mockRejectedValue(
      new Error('Course not found.')
    );
    const { response, state } = createResponse();
    await mutateCourseHandler(
      {
        method: 'PUT',
        headers: {},
        query: { id: 'crsHpNcr01AbcDefGhiJK' },
        body: { title: 'Updated' }
      },
      response
    );
    expect(state.statusCode).toBe(404);
  });
});
