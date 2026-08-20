import type { ApiRequest, ApiResponse } from '../_lib/http/responses.js';
import { readSessionUser } from '../_lib/auth/session.js';
import { getApiDataStore } from '../_lib/storage/dataStore.js';
import { sendApiError } from '../_lib/http/errors.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const isCreate = req.method === 'POST';
  const context = {
    route: String(req.method || 'UNKNOWN') + ' /api/courses',
    action: isCreate ? 'create_course' : 'list_courses',
    startedAt: Date.now(),
    messages: {
      validation: 'Invalid course details.',
      timeout: 'Unable to load courses right now. Please try again.',
      upstream: 'Unable to load courses right now. Please try again.',
      upstreamPermission:
        'Unable to access courses. Please contact an admin if this continues.',
      internal: 'Unable to load courses.'
    }
  };

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
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

    const store = getApiDataStore();
    const result = isCreate
      ? await store.createCourseForAuthorizedUser(user, req.body)
      : await store.listCoursesForAuthorizedUser(user);
    if (!result.allowed) {
      return sendApiError(res, new Error('Authorization denied.'), context, {
        status: 403,
        code: 'FORBIDDEN',
        message: 'Your account is not authorized to access this application.',
        retryable: false,
        category: 'authorization_denied'
      });
    }
    return res.status(isCreate ? 201 : 200).json(result.value);
  } catch (error) {
    return sendApiError(res, error, context);
  }
}
