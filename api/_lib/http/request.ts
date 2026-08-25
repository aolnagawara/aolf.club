import type { ApiRequest, ApiResponse } from './responses.js';
import { sendApiError } from './errors.js';

export function firstQueryValue(req: ApiRequest, name: string): string {
  const value = req.query[name];
  if (Array.isArray(value)) {
    return String(value[0] || '');
  }
  return String(value || '');
}

export function headerValue(
  headers: ApiRequest['headers'],
  name: string
): string {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return String(value[0] || '');
  }
  return String(value || '');
}

export function methodNotAllowed(
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
