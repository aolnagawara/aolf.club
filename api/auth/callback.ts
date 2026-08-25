import type { ApiRequest, ApiResponse } from '../_lib/http/responses.js';
import { getUserFromAuthCode } from '../_lib/auth/oauth.js';
import {
  appendSetCookie,
  parseCookies,
  serializeCookie
} from '../_lib/auth/cookies.js';
import { setSessionCookie } from '../_lib/auth/session.js';
import { getApiDataStore } from '../_lib/storage/dataStore.js';
import { reportApiError, sendApiError } from '../_lib/http/errors.js';

const OAUTH_STATE_COOKIE = 'aolf_oauth_state';

function redirectToLoginWithError(res: ApiResponse, errorCode: string) {
  res.status(302);
  res.setHeader('Location', '/seva?error=' + encodeURIComponent(errorCode));
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
  const context = {
    route: 'GET /api/auth/callback',
    action: 'complete_google_signin',
    startedAt: Date.now(),
    messages: {
      timeout: 'Unable to verify access right now. Please try again.',
      upstream: 'Unable to verify access right now. Please try again.',
      upstreamPermission:
        'Unable to verify access. Please contact an admin if this continues.',
      internal: 'Unable to complete sign in. Please try again.'
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

  const queryCode = typeof req.query.code === 'string' ? req.query.code : '';
  const queryState = typeof req.query.state === 'string' ? req.query.state : '';
  const cookies = parseCookies(req.headers.cookie);
  const stateCookie = cookies[OAUTH_STATE_COOKIE] || '';

  if (!queryCode || !queryState || queryState !== stateCookie) {
    clearOAuthStateCookie(res);
    reportApiError(new Error('Invalid OAuth state.'), context, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Unable to verify sign-in state.',
      retryable: false,
      category: 'invalid_oauth_state'
    });
    return redirectToLoginWithError(res, 'invalid_oauth_state');
  }

  try {
    const sessionUser = await getUserFromAuthCode(queryCode);

    const dataStore = getApiDataStore();
    const allowed = await dataStore.isUserAllowed(sessionUser);
    if (!allowed) {
      clearOAuthStateCookie(res);
      reportApiError(new Error('Authorization denied.'), context, {
        status: 403,
        code: 'FORBIDDEN',
        message: 'Your account is not authorized for this workspace.',
        retryable: false,
        category: 'authorization_denied'
      });
      return redirectToLoginWithError(res, 'forbidden');
    }

    await setSessionCookie(res, sessionUser);
    clearOAuthStateCookie(res);
    res.status(302);
    res.setHeader('Location', '/seva');
    return res.end();
  } catch (error) {
    clearOAuthStateCookie(res);
    const reported = reportApiError(error, context);
    if (reported.code === 'UPSTREAM_TIMEOUT') {
      return redirectToLoginWithError(res, 'upstream_timeout');
    }
    if (reported.code === 'UPSTREAM_ERROR') {
      return redirectToLoginWithError(res, 'upstream_error');
    }
    return redirectToLoginWithError(res, 'oauth_failed');
  }
}
