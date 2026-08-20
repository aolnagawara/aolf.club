import type { ApiRequest, ApiResponse } from '../_lib/http/responses.js';
import { getApiDataStore } from '../_lib/storage/dataStore.js';
import {
  renderPublicCourseHtml,
  toPublicCourseView
} from '../_lib/courses/publicHtml.js';

const COURSE_ID_PATTERN = /^[A-Za-z0-9_-]{21}$/;

function headerValue(
  headers: ApiRequest['headers'],
  name: string
): string {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return String(value[0] || '');
  }
  return String(value || '');
}

export function getRequestOrigin(req: ApiRequest): string {
  const forwardedHost = headerValue(req.headers, 'x-forwarded-host')
    .split(',')[0]
    .trim();
  const host = (
    forwardedHost ||
    headerValue(req.headers, 'host').split(',')[0].trim() ||
    'aolf.club'
  ).replace(/\/$/, '');
  const proto =
    headerValue(req.headers, 'x-forwarded-proto').split(',')[0].trim() ||
    'https';
  return proto + '://' + host;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60');

  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    const notAllowed = renderPublicCourseHtml({
      course: null,
      origin: getRequestOrigin(req),
      logoUrl: ''
    });
    return res.status(405).end(notAllowed.html);
  }

  const origin = getRequestOrigin(req);
  const logoUrl = origin + '/assets/aolf-connect-logo.png';
  const id = typeof req.query.id === 'string' ? req.query.id : '';

  if (!COURSE_ID_PATTERN.test(id)) {
    const missing = renderPublicCourseHtml({
      course: null,
      origin,
      logoUrl
    });
    return res.status(missing.status).end(missing.html);
  }

  try {
    const course = await getApiDataStore().getPublicCourseById(id);
    const rendered = renderPublicCourseHtml({
      course: course ? toPublicCourseView(course) : null,
      origin,
      logoUrl
    });
    return res.status(rendered.status).end(rendered.html);
  } catch {
    const missing = renderPublicCourseHtml({
      course: null,
      origin,
      logoUrl
    });
    return res.status(missing.status).end(missing.html);
  }
}
