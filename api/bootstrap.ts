import type { ApiRequest, ApiResponse } from './_lib/http/responses.js';
import { readSessionUser } from './_lib/auth/session.js';
import { getApiDataStore } from './_lib/storage/dataStore.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
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

  const campaignId =
    typeof req.query.campaignId === 'string' ? req.query.campaignId : undefined;
  try {
    const result = await getApiDataStore().getBootstrapForAuthorizedUser(
      user,
      campaignId
    );
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
          message: 'Unable to load data from Google Sheets.'
        }
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to load application data.'
      }
    });
  }
}
