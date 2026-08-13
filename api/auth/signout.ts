import type { ApiRequest, ApiResponse } from '../_lib/http/responses.js';
import { clearSessionCookie } from '../_lib/auth/session.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      success: false,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Method not allowed.'
      }
    });
  }

  clearSessionCookie(res);
  return res.status(200).json({ success: true });
}
