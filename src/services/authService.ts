import { env } from '../config/env';
import type { AuthProvider } from '../repositories/contracts';
import { MockAuthProvider } from '../repositories/mock/mockAuthProvider';
import { HttpAuthProvider } from '../repositories/http/httpAuthProvider';
import { ApiClient } from './apiClient';

function createProvider(): AuthProvider {
  if (env.VITE_APP_MODE === 'api') {
    return new HttpAuthProvider(new ApiClient(env.VITE_API_BASE_URL || ''));
  }
  return new MockAuthProvider();
}

const authProvider = createProvider();

export const authService = {
  getSessionUser() {
    return authProvider.getSessionUser();
  },
  signIn() {
    return authProvider.signIn();
  },
  signOut() {
    return authProvider.signOut();
  }
};
