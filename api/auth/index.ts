import type { ApiRequest, ApiResponse } from '../_lib/http/responses.js';
import {
  buildGoogleAuthUrl,
  createOAuthState,
  getUserFromAuthCode
} from '../_lib/auth/oauth.js';
import {
  appendSetCookie,
  parseCookies,
  serializeCookie
} from '../_lib/auth/cookies.js';
import {
  clearSessionCookie,
  readSessionUser,
  setSessionCookie
} from '../_lib/auth/session.js';
import { getApiDataStore } from '../_lib/storage/dataStore.js';
import { reportApiError, sendApiError } from '../_lib/http/errors.js';

const OAUTH_STATE_COOKIE = 'aolf_oauth_state';

function firstQueryValue(req: ApiRequest, name: string): string {
  const value = req.query[name];
  if (Array.isArray(value)) {
    return String(value[0] || '');
  }
  return String(value || '');
}

function authAction(req: ApiRequest): string {
  return firstQueryValue(req, 'action').trim().toLowerCase() || 'session';
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

async function handleSignin(req: ApiRequest, res: ApiResponse) {
  const context = {
    route: 'GET /api/auth?action=signin',
    action: 'start_google_signin',
    startedAt: Date.now(),
    messages: { internal: 'Unable to start sign in. Please try again.' }
  };

  if (req.method !== 'GET') {
    return methodNotAllowed(res, context, 'GET');
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

    res.status(302);
    res.setHeader('Location', buildGoogleAuthUrl(state));
    return res.end();
  } catch (error) {
    reportApiError(error, context);
    res.status(302);
    res.setHeader('Location', '/seva?error=signin_unavailable');
    return res.end();
  }
}

async function handleCallback(req: ApiRequest, res: ApiResponse) {
  const context = {
    route: 'GET /api/auth?action=callback',
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
    return methodNotAllowed(res, context, 'GET');
  }

  const queryCode = firstQueryValue(req, 'code');
  const queryState = firstQueryValue(req, 'state');
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
    const allowed = await getApiDataStore().isUserAllowed(sessionUser);
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

async function handleSession(req: ApiRequest, res: ApiResponse) {
  const context = {
    route: 'GET /api/auth?action=session',
    action: 'read_session',
    startedAt: Date.now(),
    messages: { internal: 'Unable to verify session. Please try again.' }
  };

  if (req.method !== 'GET') {
    return methodNotAllowed(res, context, 'GET');
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

async function handleSignout(req: ApiRequest, res: ApiResponse) {
  const context = {
    route: 'POST /api/auth?action=signout',
    action: 'sign_out',
    startedAt: Date.now(),
    messages: { internal: 'Unable to sign out right now.' }
  };

  if (req.method !== 'POST') {
    return methodNotAllowed(res, context, 'POST');
  }

  try {
    clearSessionCookie(res);
    return res.status(200).json({ success: true });
  } catch (error) {
    return sendApiError(res, error, context);
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const action = authAction(req);
  if (action === 'signin') {
    return handleSignin(req, res);
  }
  if (action === 'callback') {
    return handleCallback(req, res);
  }
  if (action === 'signout') {
    return handleSignout(req, res);
  }
  if (action === 'session') {
    return handleSession(req, res);
  }

  const context = {
    route: String(req.method || 'UNKNOWN') + ' /api/auth',
    action: 'unknown_auth_action',
    startedAt: Date.now(),
    messages: { validation: 'Unknown auth action.' }
  };
  return sendApiError(res, new Error('Unknown auth action.'), context, {
    status: 404,
    code: 'NOT_FOUND',
    message: 'Unknown auth action.',
    retryable: false,
    category: 'not_found'
  });
}
