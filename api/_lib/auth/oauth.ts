import { OAuth2Client } from 'google-auth-library';
import { nanoid } from 'nanoid';
import { AuthenticatedUserSchema } from '../../../shared/contracts/appContracts.js';
import { getOAuthEnv, getServerEnv } from '../config/env.js';

function getRedirectUri() {
  const env = getServerEnv();
  if (env.GOOGLE_REDIRECT_URI) {
    return env.GOOGLE_REDIRECT_URI;
  }

  const host = process.env.VERCEL_URL;
  if (!host) {
    throw new Error('GOOGLE_REDIRECT_URI or VERCEL_URL is required.');
  }
  return 'https://' + host + '/api/auth/callback';
}

function getClient() {
  const env = getOAuthEnv();
  return new OAuth2Client(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    getRedirectUri()
  );
}

export function createOAuthState() {
  return nanoid();
}

export function buildGoogleAuthUrl(state: string) {
  const client = getClient();
  return client.generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    include_granted_scopes: true,
    prompt: 'select_account',
    state
  });
}

export async function getUserFromAuthCode(code: string) {
  const env = getOAuthEnv();
  const client = getClient();
  const tokenResponse = await client.getToken(code);
  const idToken = tokenResponse.tokens.id_token;
  if (!idToken) {
    throw new Error('Missing id_token from Google OAuth response.');
  }

  const ticket = await client.verifyIdToken({
    idToken,
    audience: env.GOOGLE_CLIENT_ID
  });

  const payload = ticket.getPayload();
  if (!payload) {
    throw new Error('Unable to read Google token payload.');
  }

  return AuthenticatedUserSchema.parse({
    id: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture
  });
}
