import type { ApiRequest, ApiResponse } from '../_lib/http/responses.js';
import { readSessionUser } from '../_lib/auth/session.js';
import { getApiDataStore } from '../_lib/storage/dataStore.js';
import { sendApiError } from '../_lib/http/errors.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const context = {
    route: 'POST /api/leads',
    action: 'create_lead',
    startedAt: Date.now(),
    messages: {
      validation: 'Invalid record details.',
      timeout: 'Unable to save the record right now. Please try again.',
      upstream: 'Unable to save the record right now. Please try again.',
      upstreamPermission:
        'Unable to save the record. Please contact an admin if this continues.',
      internal: 'Unable to save the record.'
    }
  };

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
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

    const result = await getApiDataStore().createLeadForAuthorizedUser(
      user,
      req.body
    );
    if (!result.allowed) {
      return sendApiError(res, new Error('Authorization denied.'), context, {
        status: 403,
        code: 'FORBIDDEN',
        message: 'Your account is not authorized to access this application.',
        retryable: false,
        category: 'authorization_denied'
      });
    }
    return res.status(201).json(result.value);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('CAMPAIGN_NOT_FOUND')) {
      return sendApiError(res, error, context, {
        status: 404,
        code: 'NOT_FOUND',
        message: 'Campaign not found.',
        retryable: false,
        category: 'not_found'
      });
    }
    if (message.includes('CAMPAIGN_TYPE_MISMATCH')) {
      return sendApiError(res, error, context, {
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid record details.',
        retryable: false,
        category: 'validation'
      });
    }
    return sendApiError(res, error, context);
  }
}
