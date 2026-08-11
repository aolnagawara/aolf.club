import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import {
  AuthenticatedUserSchema,
  type AuthenticatedUser
} from '../../../shared/contracts/appContracts.js';
import { appendSetCookie, parseCookies, serializeCookie } from './cookies.js';
import { getServerEnv } from '../config/env.js';
import type { ApiRequest, ApiResponse } from '../http/responses.js';

const SessionPayloadSchema = AuthenticatedUserSchema.omit({ id: true }).extend({
  sub: z.string().min(1)
});

function getSecret() {
  return new TextEncoder().encode(getServerEnv().SESSION_SECRET);
}

function isSecureCookie() {
  return process.env.NODE_ENV === 'production';
}

export type SessionUser = AuthenticatedUser;

export async function createSessionToken(user: SessionUser): Promise<string> {
  const parsed = AuthenticatedUserSchema.parse(user);
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({
    email: parsed.email,
    name: parsed.name,
    picture: parsed.picture
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(parsed.id)
    .setIssuedAt(now)
    .setExpirationTime(now + 7 * 24 * 60 * 60)
    .sign(getSecret());
}

export async function readSessionUser(
  req: ApiRequest
): Promise<SessionUser | null> {
  const env = getServerEnv();
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[env.SESSION_COOKIE_NAME];
  if (!token) {
    return null;
  }

  try {
    const verified = await jwtVerify(token, getSecret(), {
      algorithms: ['HS256']
    });
    const payload = SessionPayloadSchema.parse(verified.payload);
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(res: ApiResponse, user: SessionUser) {
  const env = getServerEnv();
  const token = await createSessionToken(user);
  appendSetCookie(
    res,
    serializeCookie(env.SESSION_COOKIE_NAME, token, {
      maxAge: 7 * 24 * 60 * 60,
      secure: isSecureCookie(),
      sameSite: 'Lax',
      httpOnly: true,
      path: '/'
    })
  );
}

export function clearSessionCookie(res: ApiResponse) {
  const env = getServerEnv();
  appendSetCookie(
    res,
    serializeCookie(env.SESSION_COOKIE_NAME, '', {
      maxAge: 0,
      secure: isSecureCookie(),
      sameSite: 'Lax',
      httpOnly: true,
      path: '/'
    })
  );
}
