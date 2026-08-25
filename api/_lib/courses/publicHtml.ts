import {
  programLabelFor,
  publicCourseProgramKey,
  publicCoursesPath
} from '../../../shared/contracts/courseDefaults.mjs';
import { fillCourseWhatsappTemplate } from '../../../shared/contracts/courseMatching.js';
import { formatWhatsappHtml } from './whatsappHtml.js';

export const PUBLIC_COURSE_CONTENT_FIELDS = [
  'title',
  'detailsText',
  'imageUrl'
] as const;

export type PublicCourseView = {
  id: string;
  title: string;
  courseType: string;
  programCode: string;
  programLabel: string;
  detailsText: string;
  hasImage: boolean;
  imageUrl: string;
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

function absoluteImageUrl(origin: string, course: PublicCourseView): string {
  const stored = String(course.imageUrl || '').trim();
  if (/^https:\/\//i.test(stored)) {
    return stored;
  }
  if (course.hasImage || stored.startsWith('/')) {
    return `${origin}/course/${encodeURIComponent(course.id)}/image`;
  }
  return '';
}

export function toPublicCourseView(course: {
  id: string;
  title?: string;
  courseType?: string;
  programCode?: string;
  whatsappTemplate?: string;
  hasImage?: boolean;
  imageUrl?: string;
}): PublicCourseView {
  const courseType = course.courseType || '';
  const programCode = course.programCode || '';
  const title = course.title || '';
  const detailsText = fillCourseWhatsappTemplate(
    course.whatsappTemplate || '',
    {
      name: '',
      course: title,
      dates: '',
      registrationLink: ''
    }
  ).trim();
  return {
    id: course.id,
    title,
    courseType,
    programCode,
    programLabel: programLabelFor(courseType, programCode),
    detailsText,
    hasImage: Boolean(course.hasImage || course.imageUrl),
    imageUrl: String(course.imageUrl || '').trim()
  };
}

function renderPanel(
  origin: string,
  course: PublicCourseView,
  selected: boolean
): string {
  const imageUrl = absoluteImageUrl(origin, course);
  const image = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(course.title)} image" loading="${selected ? 'eager' : 'lazy'}" />`
    : '';
  const details = course.detailsText
    ? `<div class="details">${formatWhatsappHtml(course.detailsText)}</div>`
    : '';
  return `${image}${details}`;
}

const NOT_FOUND_HTML = `<!doctype html>
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
</html>`;

export function renderPublicCourseHtml(options: {
  selected?: PublicCourseView | null;
  courses?: PublicCourseView[];
  origin: string;
  fallbackImageUrl: string;
  programKey?: string;
}): { status: number; html: string } {
  const courses = (
    options.courses && options.courses.length
      ? options.courses
      : options.selected
        ? [options.selected]
        : []
  ).filter(Boolean);
  const selected = options.selected || courses[0] || null;
  if (!selected) {
    return { status: 404, html: NOT_FOUND_HTML };
  }

  const origin = options.origin.replace(/\/$/, '');
  const programKey = String(options.programKey || '')
    .trim()
    .toLowerCase();
  const pageUrl = origin + publicCoursesPath(programKey);
  const imageUrl = absoluteImageUrl(origin, selected);
  const ogTitle = programKey ? selected.title : 'AOLF Courses';
  const ogImage = programKey
    ? imageUrl || options.fallbackImageUrl
    : options.fallbackImageUrl;
  const ogDescription = programKey
    ? stripMarkupMarkers(selected.detailsText).slice(0, 160) || selected.title
    : 'Explore active AOLF programs, course details, and registration information.';
  const showTabs = courses.length > 1;
  let tabs = '';
  let panels = `<div class="panels"><section class="panel active">${renderPanel(origin, selected, true)}</section></div>`;
  if (showTabs) {
    tabs =
      '<nav class="tabs" role="tablist" aria-label="Active programs">' +
      courses
        .map(
          (course) =>
            `<a role="tab" aria-selected="${course.id === selected.id ? 'true' : 'false'}" class="${course.id === selected.id ? 'active' : ''}" href="${escapeHtml(
              publicCoursesPath(
                publicCourseProgramKey(course.courseType, course.programCode)
              )
            )}">${escapeHtml(course.title || course.programLabel)}</a>`
        )
        .join('') +
      '</nav>';
    panels =
      '<div class="panels">' +
      courses
        .map((course) => {
          const isSelected = course.id === selected.id;
          return (
            `<section class="panel${isSelected ? ' active' : ''}" role="tabpanel">` +
            renderPanel(origin, course, isSelected) +
            '</section>'
          );
        })
        .join('') +
      '</div>';
  }

  return {
    status: 200,
    html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(ogTitle)}</title>
    <link rel="canonical" href="${escapeHtml(pageUrl)}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(ogTitle)}" />
    <meta property="og:description" content="${escapeHtml(ogDescription)}" />
    <meta property="og:image" content="${escapeHtml(ogImage)}" />
    <meta property="og:image:alt" content="${escapeHtml(programKey ? selected.title + ' image' : 'AOLF courses')}" />
    <meta property="og:url" content="${escapeHtml(pageUrl)}" />
    <style>
      body { font-family: sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
      main { max-width: 40rem; margin: 0 auto; padding: 1.5rem; }
      img { width: 100%; height: auto; border-radius: 0.75rem; }
      .details { white-space: pre-wrap; font-size: 0.95rem; line-height: 1.45; margin-top: 0.75rem; }
      .details a { color: #0f766e; text-decoration: underline; word-break: break-word; }
      .details code { font-family: ui-monospace, monospace; font-size: 0.9em; }
      .tabs { display: flex; gap: 1.25rem; overflow-x: auto; margin: 0 0 1rem; border-bottom: 1px solid #cbd5e1; }
      .tabs a { flex: 0 0 auto; padding: 0.65rem 0.125rem 0.55rem; border-bottom: 3px solid transparent; color: #475569; font-size: 0.9rem; font-weight: 600; text-decoration: none; white-space: nowrap; }
      .tabs a:hover { color: #0f766e; }
      .tabs a:focus-visible { outline: 2px solid #0f766e; outline-offset: 2px; }
      .tabs a.active { border-color: #0f766e; color: #0f766e; }
      .panel { display: none; }
      .panel.active { display: block; }
    </style>
  </head>
  <body>
    <main>
      ${tabs}
      ${panels}
    </main>
  </body>
</html>`
  };
}
