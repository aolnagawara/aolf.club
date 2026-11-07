import type { AuthProvider } from '../contracts';
import {
  AuthenticatedUserSchema,
  type AuthenticatedUser
} from '../../../shared/contracts/appContracts';
import { ApiClient } from '../../services/apiClient';

export class HttpAuthProvider implements AuthProvider {
  constructor(private readonly apiClient: ApiClient) {}

  async getSessionUser(): Promise<AuthenticatedUser | null> {
    const response = await this.apiClient.get<{ user?: unknown }>(
      '/api/auth?action=session'
    );
    if (!response.user) {
      return null;
    }
    return AuthenticatedUserSchema.parse(response.user);
  }

  async signIn(): Promise<AuthenticatedUser> {
    if (typeof window !== 'undefined') {
      const returnTo = /^\/add\/?$/.test(window.location.pathname)
        ? '&returnTo=%2Fadd'
        : '';
      window.location.assign('/api/auth?action=signin' + returnTo);
    }

    return new Promise<AuthenticatedUser>(() => {
      // OAuth sign-in redirects the browser and this promise never resolves in-page.
    });
  }

  async signOut(): Promise<void> {
    await this.apiClient.post('/api/auth?action=signout', {});
  }
}
