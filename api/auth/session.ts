import type { ApiRequest, ApiResponse } from '../_lib/http/responses.js';
import { readSessionUser } from '../_lib/auth/session.js';
import { sendApiError } from '../_lib/http/errors.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const context = {
    route: 'GET /api/auth/session',
    action: 'read_session',
    startedAt: Date.now(),
    messages: { internal: 'Unable to verify session. Please try again.' }
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
    return res.status(200).json({
      user: user
        ? {
            id: user.id,
            email: user.email,
            name: user.name,
            picture: user.picture
          }
        : null
    });
  } catch (error) {
    return sendApiError(res, error, context);
  }
}
