import type { ApiRequest, ApiResponse } from '../_lib/http/responses.js';
import { readSessionUser } from '../_lib/auth/session.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({
      success: false,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Method not allowed.'
      }
    });
  }

  const user = await readSessionUser(req);
  return res.status(200).json({
    user: user
      ? {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture
        }
      : null
  });
}
