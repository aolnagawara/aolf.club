import type { ApiRequest, ApiResponse } from '../_lib/http/responses.js';
import { readSessionUser } from '../_lib/auth/session.js';
import { getApiDataStore } from '../_lib/storage/dataStore.js';
import { ZodError } from 'zod';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'PUT' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'PUT, DELETE');
    return res.status(405).json({
      success: false,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Method not allowed.'
      }
    });
  }

  const user = await readSessionUser(req);
  if (!user) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication required.'
      }
    });
  }

  try {
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
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Your account is not authorized to access this application.'
        }
      });
    }

    return res.status(200).json(result.value);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';

    if (message.includes('FORBIDDEN_LEAD_ASSIGNMENT')) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message:
            'You can only update records assigned to your volunteer account.'
        }
      });
    }

    if (message.includes('VOLUNTEER_NOT_ALLOWED')) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The selected volunteer is not in the allowed list.'
        }
      });
    }

    if (message.includes('Lead not found.')) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Lead not found.'
        }
      });
    }

    if (message.includes('CAMPAIGN_NOT_FOUND')) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Campaign not found.'
        }
      });
    }

    if (message.includes('Google Sheets API')) {
      return res.status(502).json({
        success: false,
        error: {
          code: 'UPSTREAM_ERROR',
          message: 'Unable to save lead changes to Google Sheets.'
        }
      });
    }

    if (message.includes('CAMPAIGN_TYPE_MISMATCH')) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Campaign type does not match the selected campaign.'
        }
      });
    }

    if (error instanceof ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid lead update payload.'
        }
      });
    }

    console.error('[leads-mutate] unexpected failure', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to save lead changes.'
      }
    });
  }
}
