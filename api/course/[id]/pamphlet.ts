import type { ApiRequest, ApiResponse } from '../../_lib/http/responses.js';
import { getApiDataStore } from '../../_lib/storage/dataStore.js';

const COURSE_ID_PATTERN = /^[A-Za-z0-9_-]{21}$/;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Cache-Control', 'public, max-age=60');

  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(405).end('Method not allowed.');
  }

  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!COURSE_ID_PATTERN.test(id)) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(404).end('Pamphlet not found.');
  }

  try {
    const pamphlet = await getApiDataStore().getPublicCoursePamphlet(id);
    if (!pamphlet) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(404).end('Pamphlet not found.');
    }
    res.setHeader('Content-Type', pamphlet.mimeType || 'image/jpeg');
    return res.status(200).end(pamphlet.bytes);
  } catch {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(404).end('Pamphlet not found.');
  }
}
