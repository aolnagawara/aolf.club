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

function requestBody(req: ApiRequest): Record<string, unknown> {
  return typeof req.body === 'object' && req.body && !Array.isArray(req.body)
    ? (req.body as Record<string, unknown>)
    : {};
}

function methodNotAllowed(
  res: ApiResponse,
  context: Parameters<typeof sendApiError>[2],
  allow: string
) {
  res.setHeader('Allow', allow);
  return sendApiError(res, new Error('Method not allowed.'), context, {
    status: 405,
    code: 'METHOD_NOT_ALLOWED',
    message: 'Method not allowed.',
    retryable: false,
    category: 'method_not_allowed'
  });
}

function contextFor(req: ApiRequest, action: string) {
  if (action === 'assign') {
    return {
      route: 'POST /api/leads?action=assign',
      action: 'assign_members',
      startedAt: Date.now(),
      messages: {
        validation: 'Invalid member assignment request.',
        timeout: 'Unable to assign members right now. Please try again.',
        upstream: 'Unable to assign members right now. Please try again.',
        upstreamPermission:
          'Unable to assign members. Please contact an admin if this continues.',
        internal: 'Unable to assign members.'
      }
    };
  }

  if (req.method === 'PUT' || req.method === 'DELETE') {
    return {
      route: String(req.method || 'UNKNOWN') + ' /api/leads?id=:id',
      action: req.method === 'DELETE' ? 'delete_lead' : 'update_lead',
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
  }

  return {
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
}

function sendCommonLeadError(
  res: ApiResponse,
  error: unknown,
  context: ReturnType<typeof contextFor>,
  assignment = false
) {
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
      message: assignment
        ? 'Member assignment is only available for Members Seva.'
        : reqMismatchMessage(context.action),
      retryable: false,
      category: 'validation'
    });
  }

  return sendApiError(res, error, context);
}

function reqMismatchMessage(action: string): string {
  return action === 'create_lead'
    ? 'Invalid record details.'
    : 'Campaign type does not match the selected campaign.';
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const action = firstQueryValue(req, 'action').trim().toLowerCase();
  const id = firstQueryValue(req, 'id').trim();
  const isAssign = action === 'assign';
  const isMutate = req.method === 'PUT' || req.method === 'DELETE';
  const context = contextFor(req, action);

  if (isAssign && req.method !== 'POST') {
    return methodNotAllowed(res, context, 'POST');
  }
  if (!isAssign && isMutate && !id) {
    return methodNotAllowed(res, context, 'POST, PUT, DELETE');
  }
  if (!isAssign && !isMutate && req.method !== 'POST') {
    return methodNotAllowed(res, context, 'POST, PUT, DELETE');
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
    const result = isAssign
      ? await store.assignMembersForAuthorizedUser(user, req.body)
      : req.method === 'DELETE'
        ? await store.deleteLeadForAuthorizedUser(user, {
            ...requestBody(req),
            id
          })
        : req.method === 'PUT'
          ? await store.updateLeadForAuthorizedUser(user, {
              ...requestBody(req),
              id
            })
          : await store.createLeadForAuthorizedUser(user, req.body);

    if (!result.allowed) {
      return sendApiError(res, new Error('Authorization denied.'), context, {
        status: 403,
        code: 'FORBIDDEN',
        message: 'Your account is not authorized to access this application.',
        retryable: false,
        category: 'authorization_denied'
      });
    }
    return res.status(isAssign || isMutate ? 200 : 201).json(result.value);
  } catch (error) {
    return sendCommonLeadError(res, error, context, isAssign);
  }
}
