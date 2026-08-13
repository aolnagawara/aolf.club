import { describe, expect, it } from 'vitest';
import { parseCookies } from '../../../api/_lib/auth/cookies.js';

describe('cookie parsing', () => {
  it('ignores malformed encoded values without discarding valid cookies', () => {
    expect(parseCookies('broken=%E0%A4%A; session=valid%20token')).toEqual({
      session: 'valid token'
    });
  });
});
