import type { ApiRequest, ApiResponse } from '../_lib/http/responses.js';
import { readSessionUser } from '../_lib/auth/session.js';
import { getApiDataStore } from '../_lib/storage/dataStore.js';
import { sendApiError } from '../_lib/http/errors.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const isDelete = req.method === 'DELETE';
  const context = {
    route: String(req.method || 'UNKNOWN') + ' /api/courses/[id]',
    action: isDelete ? 'delete_course' : 'update_course',
    startedAt: Date.now(),
    messages: {
      validation: 'Invalid course details.',
      timeout: 'Unable to save the course right now. Please try again.',
      upstream: 'Unable to save the course right now. Please try again.',
      upstreamPermission:
        'Unable to save the course. Please contact an admin if this continues.',
      internal: 'Unable to save the course.'
    }
  };

  if (req.method !== 'PUT' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'PUT, DELETE');
    return sendApiError(res, new Error('Method not allowed.'), context, {
      status: 405,
      code: 'METHOD_NOT_ALLOWED',
      message: 'Method not allowed.',
      retryable: false,
      category: 'method_not_allowed'
    });
  }

  try {
    const user = await readSessionUser(req);
    if (!user) {
      return sendApiError(res, new Error('Authentication required.'), context, {
        status: 401,
        code: 'UNAUTHENTICATED',
        message: 'Authentication required.',
        retryable: false,
        category: 'unauthenticated'
      });
    }

    const id = typeof req.query.id === 'string' ? req.query.id : '';
    const requestBody =
      typeof req.body === 'object' && req.body && !Array.isArray(req.body)
        ? req.body
        : {};
    const payload = {
      ...requestBody,
      id
    };

    const store = getApiDataStore();
    const result = isDelete
      ? await store.deleteCourseForAuthorizedUser(user, payload)
      : await store.updateCourseForAuthorizedUser(user, payload);
    if (!result.allowed) {
      return sendApiError(res, new Error('Authorization denied.'), context, {
        status: 403,
        code: 'FORBIDDEN',
        message: 'Your account is not authorized to access this application.',
        retryable: false,
        category: 'authorization_denied'
      });
    }
    return res.status(200).json(result.value);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Course not found.')) {
      return sendApiError(res, error, context, {
        status: 404,
        code: 'NOT_FOUND',
        message: 'Course not found.',
        retryable: false,
        category: 'not_found'
      });
    }
    return sendApiError(res, error, context);
  }
}
