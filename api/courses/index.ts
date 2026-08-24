import type { ApiRequest, ApiResponse } from '../_lib/http/responses.js';
import { readSessionUser } from '../_lib/auth/session.js';
import { getApiDataStore } from '../_lib/storage/dataStore.js';
import { sendApiError } from '../_lib/http/errors.js';

function firstQueryValue(req: ApiRequest, name: string): string {
  const value = req.query[name];
  if (Array.isArray(value)) {
    return String(value[0] || '');
  }
  return String(value || '');
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const id = firstQueryValue(req, 'id');
  const catalog = firstQueryValue(req, 'catalog');
  const isCatalog = req.method === 'GET' && catalog === '1';
  const isMutate = req.method === 'PUT' || req.method === 'DELETE';
  const isCreate = req.method === 'POST';
  const context = {
    route: String(req.method || 'UNKNOWN') + ' /api/courses',
    action: isMutate
      ? req.method === 'DELETE'
        ? 'delete_course'
        : 'update_course'
      : isCreate
        ? 'create_course'
        : isCatalog
          ? 'list_public_homepage_offers'
          : 'list_courses',
    startedAt: Date.now(),
    messages: {
      validation: 'Invalid activity details.',
      timeout: isMutate
        ? 'Unable to save the activity right now. Please try again.'
        : 'Unable to load activities right now. Please try again.',
      upstream: isMutate
        ? 'Unable to save the activity right now. Please try again.'
        : 'Unable to load activities right now. Please try again.',
      upstreamPermission: isMutate
        ? 'Unable to save the activity. Please contact an admin if this continues.'
        : 'Unable to access activities. Please contact an admin if this continues.',
      internal: isMutate
        ? 'Unable to save the activity.'
        : 'Unable to load activities.'
    }
  };

  if (isMutate) {
    if (!id) {
      res.setHeader('Allow', 'GET, POST, PUT, DELETE');
      return sendApiError(res, new Error('Method not allowed.'), context, {
        status: 405,
        code: 'METHOD_NOT_ALLOWED',
        message: 'Method not allowed.',
        retryable: false,
        category: 'method_not_allowed'
      });
    }
  } else if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return sendApiError(res, new Error('Method not allowed.'), context, {
      status: 405,
      code: 'METHOD_NOT_ALLOWED',
      message: 'Method not allowed.',
      retryable: false,
      category: 'method_not_allowed'
    });
  }

  try {
    if (isCatalog) {
      const offers = await getApiDataStore().listPublicHomepageOffers();
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.status(200).json(offers);
    }

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
    if (isMutate) {
      const requestBody =
        typeof req.body === 'object' && req.body && !Array.isArray(req.body)
          ? req.body
          : {};
      const payload = {
        ...requestBody,
        id
      };
      const result =
        req.method === 'DELETE'
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
    }

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
    const message = error instanceof Error ? error.message : '';
    if (isMutate && message.includes('Course not found.')) {
      return sendApiError(res, error, context, {
        status: 404,
        code: 'NOT_FOUND',
        message: 'Activity not found.',
        retryable: false,
        category: 'not_found'
      });
    }
    return sendApiError(res, error, context);
  }
}
