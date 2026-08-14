import type { ApiRequest, ApiResponse } from '../_lib/http/responses.js';
import { clearSessionCookie } from '../_lib/auth/session.js';
import { sendApiError } from '../_lib/http/errors.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const context = {
    route: 'POST /api/auth/signout',
    action: 'sign_out',
    startedAt: Date.now(),
    messages: { internal: 'Unable to sign out right now.' }
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
    clearSessionCookie(res);
    return res.status(200).json({ success: true });
  } catch (error) {
    return sendApiError(res, error, context);
  }
}
