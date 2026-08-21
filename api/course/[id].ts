import type { ApiRequest, ApiResponse } from '../_lib/http/responses.js';
import { getApiDataStore } from '../_lib/storage/dataStore.js';
import {
  renderPublicCourseHtml,
  toPublicCourseView,
  publicPageUrlForKey
} from '../_lib/courses/publicHtml.js';

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

function firstQueryValue(req: ApiRequest, name: string): string {
  const value = req.query[name];
  if (Array.isArray(value)) {
    return String(value[0] || '');
  }
  return String(value || '');
}

function wantsPamphlet(req: ApiRequest): boolean {
  return firstQueryValue(req, 'asset') === 'pamphlet';
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

async function servePamphlet(
  req: ApiRequest,
  res: ApiResponse,
  key: string
) {
  res.setHeader('Cache-Control', 'public, max-age=60');

  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(405).end('Method not allowed.');
  }

  if (!key) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(404).end('Pamphlet not found.');
  }

  try {
    const pamphlet = await getApiDataStore().getPublicCoursePamphlet(key);
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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const key = firstQueryValue(req, 'id');
  if (wantsPamphlet(req)) {
    return servePamphlet(req, res, key);
  }

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

  if (!key) {
    const missing = renderPublicCourseHtml({
      course: null,
      origin,
      logoUrl
    });
    return res.status(missing.status).end(missing.html);
  }

  try {
    const page = await getApiDataStore().getPublicCoursePage(key);
    const family = page.family.map(toPublicCourseView);
    const selected = page.selected
      ? toPublicCourseView(page.selected)
      : family[0] || null;
    const rendered = renderPublicCourseHtml({
      course: selected,
      family,
      origin,
      logoUrl,
      pageUrl: selected ? publicPageUrlForKey(origin, key, selected) : undefined
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
