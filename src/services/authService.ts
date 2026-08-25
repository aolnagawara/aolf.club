import { env } from '../config/env';
import type { AuthProvider } from '../repositories/contracts';
import { HttpAuthProvider } from '../repositories/http/httpAuthProvider';
import { ApiClient } from './apiClient';

const httpAuthProvider = new HttpAuthProvider(
  new ApiClient(env.VITE_API_BASE_URL || '')
);
let mockAuthProviderPromise: Promise<AuthProvider> | null = null;

async function getProvider(): Promise<AuthProvider> {
  if (env.VITE_APP_MODE === 'api') {
    return httpAuthProvider;
  }
  if (!mockAuthProviderPromise) {
    mockAuthProviderPromise = import(
      '../repositories/mock/mockAuthProvider'
    ).then(({ MockAuthProvider }) => new MockAuthProvider());
  }
  return mockAuthProviderPromise;
}

export const authService = {
  async getSessionUser() {
    return (await getProvider()).getSessionUser();
  },
  async signIn() {
    return (await getProvider()).signIn();
  },
  async signOut() {
    return (await getProvider()).signOut();
  }
};
