import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../services/apiClient';
import { HttpAuthProvider } from './http/httpAuthProvider';
import { MockAuthProvider } from './mock/mockAuthProvider';

describe('auth provider sign-out', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(['/add', '/add/'])(
    'preserves the quick-add destination at sign-in from %s',
    (pathname) => {
      const assign = vi.fn();
      vi.stubGlobal('window', { location: { pathname, assign } });
      const provider = new HttpAuthProvider(new ApiClient(''));
      void provider.signIn();
      expect(assign).toHaveBeenCalledWith(
        '/api/auth?action=signin&returnTo=%2Fadd'
      );
    }
  );
  it('posts to the API sign-out endpoint in API mode', async () => {
    const apiClient = new ApiClient('');
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      success: true
    });
    const provider = new HttpAuthProvider(apiClient);

    await provider.signOut();

    expect(post).toHaveBeenCalledWith('/api/auth?action=signout', {});
  });

  it('clears and can restore the mock session', async () => {
    const provider = new MockAuthProvider();

    expect(await provider.getSessionUser()).not.toBeNull();
    await provider.signOut();
    expect(await provider.getSessionUser()).toBeNull();
    await provider.signIn();
    expect(await provider.getSessionUser()).not.toBeNull();
  });
});
