import type { ApiResponse } from '../http/responses.js';

export function parseCookies(
  cookieHeader: string | undefined
): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, part) => {
      const index = part.indexOf('=');
      if (index <= 0) {
        return acc;
      }
      const key = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      try {
        acc[key] = decodeURIComponent(value);
      } catch {
        // One malformed cookie must not turn an otherwise anonymous request into
        // a server error. Ignore the unusable value and continue parsing.
      }
      return acc;
    }, {});
}

export function serializeCookie(
  name: string,
  value: string,
  options: {
    maxAge?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Lax' | 'Strict' | 'None';
    path?: string;
  } = {}
): string {
  const segments = [name + '=' + encodeURIComponent(value)];
  segments.push('Path=' + (options.path || '/'));

  if (typeof options.maxAge === 'number') {
    segments.push('Max-Age=' + Math.floor(options.maxAge));
  }
  if (options.httpOnly !== false) {
    segments.push('HttpOnly');
  }
  if (options.secure) {
    segments.push('Secure');
  }
  segments.push('SameSite=' + (options.sameSite || 'Lax'));

  return segments.join('; ');
}

export function appendSetCookie(res: ApiResponse, cookie: string) {
  const current = res.getHeader('Set-Cookie');
  if (!current) {
    res.setHeader('Set-Cookie', [cookie]);
    return;
  }

  if (Array.isArray(current)) {
    res.setHeader('Set-Cookie', [...current, cookie]);
    return;
  }

  res.setHeader('Set-Cookie', [String(current), cookie]);
}
