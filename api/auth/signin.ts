import type { ApiRequest, ApiResponse } from '../_lib/http/responses.js';
import { buildGoogleAuthUrl, createOAuthState } from '../_lib/auth/oauth.js';
import { appendSetCookie, serializeCookie } from '../_lib/auth/cookies.js';

const OAUTH_STATE_COOKIE = 'aolf_oauth_state';

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
}
