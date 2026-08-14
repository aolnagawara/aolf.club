import type { ApiRequest, ApiResponse } from '../_lib/http/responses.js';
import { readSessionUser } from '../_lib/auth/session.js';
import { getApiDataStore } from '../_lib/storage/dataStore.js';
import { sendApiError } from '../_lib/http/errors.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const action = req.method === 'DELETE' ? 'delete_lead' : 'update_lead';
  const context = {
    route: String(req.method || 'UNKNOWN') + ' /api/leads/[id]',
    action,
    startedAt: Date.now(),
    messages: {
      validation: 'Invalid lead update payload.',
      timeout: 'Unable to save your changes right now. Please try again.',
      upstream: 'Unable to save your changes right now. Please try again.',
      upstreamPermission:
        'Unable to save your changes. Please contact an admin if this continues.',
      internal: 'Unable to save lead changes.'
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

    const result =
      req.method === 'DELETE'
        ? await getApiDataStore().deleteLeadForAuthorizedUser(user, payload)
        : await getApiDataStore().updateLeadForAuthorizedUser(user, payload);
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

    if (message.includes('FORBIDDEN_LEAD_ASSIGNMENT')) {
      return sendApiError(res, error, context, {
        status: 403,
        code: 'FORBIDDEN',
        message:
          'You can only update records assigned to your volunteer account.',
        retryable: false,
        category: 'authorization_denied'
      });
    }

    if (message.includes('VOLUNTEER_NOT_ALLOWED')) {
      return sendApiError(res, error, context, {
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'The selected volunteer is not in the allowed list.',
        retryable: false,
        category: 'validation'
      });
    }

    if (message.includes('Lead not found.')) {
      return sendApiError(res, error, context, {
        status: 404,
        code: 'NOT_FOUND',
        message: 'Lead not found.',
        retryable: false,
        category: 'not_found'
      });
    }

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
        message: 'Campaign type does not match the selected campaign.',
        retryable: false,
        category: 'validation'
      });
    }
    return sendApiError(res, error, context);
  }
}
