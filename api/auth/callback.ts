import type { ApiRequest, ApiResponse } from '../_lib/http/responses.js';
import { getUserFromAuthCode } from '../_lib/auth/oauth.js';
import {
  appendSetCookie,
  parseCookies,
  serializeCookie
} from '../_lib/auth/cookies.js';
import { setSessionCookie } from '../_lib/auth/session.js';
import { getApiDataStore } from '../_lib/storage/dataStore.js';

const OAUTH_STATE_COOKIE = 'aolf_oauth_state';

function redirectToLoginWithError(res: ApiResponse, errorCode: string) {
  res.status(302);
  res.setHeader('Location', '/login?error=' + encodeURIComponent(errorCode));
  return res.end();
}

function clearOAuthStateCookie(res: ApiResponse) {
  appendSetCookie(
    res,
    serializeCookie(OAUTH_STATE_COOKIE, '', {
      maxAge: 0,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      httpOnly: true,
      path: '/'
    })
  );
}

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

  const queryCode = typeof req.query.code === 'string' ? req.query.code : '';
  const queryState = typeof req.query.state === 'string' ? req.query.state : '';
  const cookies = parseCookies(req.headers.cookie);
  const stateCookie = cookies[OAUTH_STATE_COOKIE] || '';

  if (!queryCode || !queryState || queryState !== stateCookie) {
    clearOAuthStateCookie(res);
    return redirectToLoginWithError(res, 'invalid_oauth_state');
  }

  try {
    const sessionUser = await getUserFromAuthCode(queryCode);

    const dataStore = getApiDataStore();
    const allowed = await dataStore.isUserAllowed(sessionUser);
    if (!allowed) {
      clearOAuthStateCookie(res);
      return redirectToLoginWithError(res, 'forbidden');
    }

    await setSessionCookie(res, sessionUser);
    clearOAuthStateCookie(res);
    res.status(302);
    res.setHeader('Location', '/seva');
    return res.end();
  } catch (error) {
    clearOAuthStateCookie(res);

    const message = error instanceof Error ? error.message : '';
    if (message.includes('Google Sheets API error')) {
      return redirectToLoginWithError(res, 'upstream_error');
    }

    return redirectToLoginWithError(res, 'oauth_failed');
  }
}
