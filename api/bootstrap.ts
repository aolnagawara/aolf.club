import type { ApiRequest, ApiResponse } from './_lib/http/responses.js';
import { readSessionUser } from './_lib/auth/session.js';
import { getApiDataStore } from './_lib/storage/dataStore.js';
import { sendApiError } from './_lib/http/errors.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const startedAt = Date.now();
  const context = {
    route: 'GET /api/bootstrap',
    action: 'load_bootstrap',
    startedAt,
    messages: {
      timeout: 'Unable to load data right now. Please try again.',
      upstream: 'Unable to load data right now. Please try again.',
      upstreamPermission:
        'Unable to access data right now. Please contact an admin if this continues.',
      internal: 'Unable to load application data.'
    }
  };

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
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

    const campaignId =
      typeof req.query.campaignId === 'string'
        ? req.query.campaignId
        : undefined;
    const result = await getApiDataStore().getBootstrapForAuthorizedUser(
      user,
      campaignId
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

    return res.status(200).json(result.value);
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
    return sendApiError(res, error, context);
  }
}
