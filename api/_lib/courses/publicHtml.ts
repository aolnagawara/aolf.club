import {
  formatCourseMonthLabel,
  publicCoursePath
} from '../../../shared/contracts/courseDefaults.mjs';
import { fillCourseWhatsappTemplate } from '../../../shared/contracts/courseMatching.js';
import { formatWhatsappHtml } from './whatsappHtml.js';

export const PUBLIC_COURSE_CONTENT_FIELDS = [
  'title',
  'detailsText',
  'pamphletImageUrl'
] as const;

export type PublicCourseView = {
  id: string;
  title: string;
  courseType: string;
  month: string;
  publicPath: string;
  detailsText: string;
  hasPamphlet: boolean;
  pamphletImageUrl: string;
};

function escapeHtml(value: string): string {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function stripMarkupMarkers(value: string): string {
  return String(value || '')
    .replaceAll('*', '')
    .replaceAll('_', '')
    .replaceAll('~', '')
    .replaceAll('`', '')
    .replace(/\s+/g, ' ')
    .trim();
}

function absolutePamphletUrl(
  origin: string,
  course: PublicCourseView
): string {
  const stored = String(course.pamphletImageUrl || '').trim();
  if (/^https:\/\//i.test(stored)) {
    return stored;
  }
  if (course.hasPamphlet || stored.startsWith('/')) {
    return `${origin}/course/${encodeURIComponent(course.id)}/pamphlet`;
  }
  return '';
}

export function toPublicCourseView(course: {
  id: string;
  title?: string;
  courseType?: string;
  month?: string;
  publicPath?: string;
  whatsappTemplate?: string;
  hasPamphlet?: boolean;
  pamphletImageUrl?: string;
}): PublicCourseView {
  const courseType = course.courseType || '';
  const month = course.month || '';
  const title = course.title || '';
  const publicPath =
    String(course.publicPath || '').trim() ||
    publicCoursePath(courseType, month);
  const detailsText = fillCourseWhatsappTemplate(
    course.whatsappTemplate || '',
    {
      name: '',
      course: title,
      dates: formatCourseMonthLabel(month),
      registrationLink: '',
      courseUrl: ''
    }
  ).trim();
  return {
    id: course.id,
    title,
    courseType,
    month,
    publicPath,
    detailsText,
    hasPamphlet: Boolean(course.hasPamphlet || course.pamphletImageUrl),
    pamphletImageUrl: String(course.pamphletImageUrl || '').trim()
  };
}

export function renderPublicCourseHtml(options: {
  course: PublicCourseView | null;
  origin: string;
  logoUrl: string;
}): { status: number; html: string } {
  if (!options.course) {
    return {
      status: 404,
      html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Course not found</title>
  </head>
  <body>
    <main>
      <h1>Course not found</h1>
      <p>This course is not available.</p>
    </main>
  </body>
</html>`
    };
  }

  const course = options.course;
  const origin = options.origin.replace(/\/$/, '');
  const pageUrl = `${origin}${course.publicPath || '/c/' + encodeURIComponent(course.id)}`;
  const pamphletUrl = absolutePamphletUrl(origin, course);
  const ogImage = pamphletUrl || options.logoUrl;
  const ogDescription =
    stripMarkupMarkers(course.detailsText).slice(0, 160) ||
    [course.title, formatCourseMonthLabel(course.month)]
      .filter(Boolean)
      .join(' — ');
  const pamphlet = pamphletUrl
    ? `<img src="${escapeHtml(pamphletUrl)}" alt="${escapeHtml(course.title)} pamphlet" />`
    : '';
  const details = course.detailsText
    ? `<div class="details">${formatWhatsappHtml(course.detailsText)}</div>`
    : '';

  return {
    status: 200,
    html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(course.title)}</title>
    <meta property="og:title" content="${escapeHtml(course.title)}" />
    <meta property="og:description" content="${escapeHtml(ogDescription)}" />
    <meta property="og:image" content="${escapeHtml(ogImage)}" />
    <meta property="og:url" content="${escapeHtml(pageUrl)}" />
    <style>
      body { font-family: sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
      main { max-width: 40rem; margin: 0 auto; padding: 1.5rem; }
      img { width: 100%; height: auto; border-radius: 0.75rem; }
      .details { white-space: pre-wrap; font-size: 0.95rem; line-height: 1.45; }
      .details a { color: #0f766e; text-decoration: underline; word-break: break-word; }
      .details code { font-family: ui-monospace, monospace; font-size: 0.9em; }
    </style>
  </head>
  <body>
    <main>
      ${pamphlet}
      ${details}
    </main>
  </body>
</html>`
  };
}
