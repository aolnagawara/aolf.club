import type { ApiRequest, ApiResponse } from './_lib/http/responses.js';
import { getApiDataStore } from './_lib/storage/dataStore.js';
import {
  renderPublicCourseHtml,
  toPublicCourseView
} from './_lib/courses/publicHtml.js';

function headerValue(headers: ApiRequest['headers'], name: string): string {
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

function getRequestOrigin(req: ApiRequest): string {
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

async function serveImage(req: ApiRequest, res: ApiResponse, id: string) {
  res.setHeader('Cache-Control', 'public, max-age=60');
  if (!id) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(404).end('Image not found.');
  }

  try {
    const image = await getApiDataStore().getPublicCourseImage(id);
    if (!image) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(404).end('Image not found.');
    }
    res.setHeader('Content-Type', image.mimeType || 'image/jpeg');
    return res.status(200).end(image.bytes);
  } catch {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(404).end('Image not found.');
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60');

  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end('Method not allowed.');
  }

  if (firstQueryValue(req, 'asset') === 'image') {
    return serveImage(req, res, firstQueryValue(req, 'id'));
  }

  const origin = getRequestOrigin(req);
  const requestedProgram = firstQueryValue(req, 'program').trim().toLowerCase();

  try {
    const page = await getApiDataStore().getPublicCourses(requestedProgram);
    const courses = page.courses.map(toPublicCourseView);
    const selected = page.selected
      ? toPublicCourseView(page.selected)
      : courses[0] || null;
    const rendered = renderPublicCourseHtml({
      selected,
      courses,
      origin,
      fallbackImageUrl: origin + '/assets/course.webp',
      programKey: page.selectionMatched ? requestedProgram : ''
    });
    return res.status(rendered.status).end(rendered.html);
  } catch {
    const missing = renderPublicCourseHtml({
      selected: null,
      origin,
      fallbackImageUrl: origin + '/assets/course.webp'
    });
    return res.status(missing.status).end(missing.html);
  }
}
