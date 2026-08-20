import type { ApiRequest, ApiResponse } from '../_lib/http/responses.js';
import { buildGoogleAuthUrl, createOAuthState } from '../_lib/auth/oauth.js';
import { appendSetCookie, serializeCookie } from '../_lib/auth/cookies.js';
import { reportApiError, sendApiError } from '../_lib/http/errors.js';

const OAUTH_STATE_COOKIE = 'aolf_oauth_state';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const context = {
    route: 'GET /api/auth/signin',
    action: 'start_google_signin',
    startedAt: Date.now(),
    messages: { internal: 'Unable to start sign in. Please try again.' }
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
    const state = createOAuthState();
    appendSetCookie(
      res,
      serializeCookie(OAUTH_STATE_COOKIE, state, {
        maxAge: 10 * 60,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        httpOnly: true,
        path: '/'
      })
    );

    const redirectUrl = buildGoogleAuthUrl(state);
    res.status(302);
    res.setHeader('Location', redirectUrl);
    return res.end();
  } catch (error) {
    reportApiError(error, context);
    res.status(302);
    res.setHeader('Location', '/volunteer?error=signin_unavailable');
    return res.end();
  }
}
