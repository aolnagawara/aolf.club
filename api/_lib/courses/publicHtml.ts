import {
  programLabelFor,
  publicCourseFamilyPath,
  publicCourseFamilySlug,
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
  programCode: string;
  programLabel: string;
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
  programCode?: string;
  publicPath?: string;
  whatsappTemplate?: string;
  hasPamphlet?: boolean;
  pamphletImageUrl?: string;
}): PublicCourseView {
  const courseType = course.courseType || '';
  const programCode = course.programCode || '';
  const title = course.title || '';
  const publicPath =
    String(course.publicPath || '').trim() ||
    publicCoursePath(courseType, programCode);
  const detailsText = fillCourseWhatsappTemplate(
    course.whatsappTemplate || '',
    {
      name: '',
      course: title,
      dates: '',
      registrationLink: '',
      courseUrl: ''
    }
  ).trim();
  return {
    id: course.id,
    title,
    courseType,
    programCode,
    programLabel: programLabelFor(courseType, programCode),
    publicPath,
    detailsText,
    hasPamphlet: Boolean(course.hasPamphlet || course.pamphletImageUrl),
    pamphletImageUrl: String(course.pamphletImageUrl || '').trim()
  };
}

function renderPanel(origin: string, course: PublicCourseView): string {
  const pamphletUrl = absolutePamphletUrl(origin, course);
  const pamphlet = pamphletUrl
    ? `<img src="${escapeHtml(pamphletUrl)}" alt="${escapeHtml(course.title)} pamphlet" />`
    : '';
  const details = course.detailsText
    ? `<div class="details">${formatWhatsappHtml(course.detailsText)}</div>`
    : '';
  return `${pamphlet}${details}`;
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

function tabId(index: number): string {
  return 'p' + String(index);
}

export function renderPublicCourseHtml(options: {
  course?: PublicCourseView | null;
  family?: PublicCourseView[];
  origin: string;
  logoUrl: string;
  pageUrl?: string;
}): { status: number; html: string } {
  const family = (
    options.family && options.family.length
      ? options.family
      : options.course
        ? [options.course]
        : []
  ).filter(Boolean);
  const selected = options.course || family[0] || null;
  if (!selected) {
    return { status: 404, html: NOT_FOUND_HTML };
  }

  const origin = options.origin.replace(/\/$/, '');
  const pageUrl =
    options.pageUrl ||
    `${origin}${selected.publicPath || '/c/' + encodeURIComponent(selected.id)}`;
  const pamphletUrl = absolutePamphletUrl(origin, selected);
  const ogImage = pamphletUrl || options.logoUrl;
  const ogDescription =
    stripMarkupMarkers(selected.detailsText).slice(0, 160) || selected.title;
  const showTabs = family.length > 1;
  let tabInputs = '';
  let tabLabels = '';
  let panels = `<div class="panels"><section class="panel">${renderPanel(origin, selected)}</section></div>`;
  let tabCss = '.panel { display: block; }';
  if (showTabs) {
    tabInputs = family
      .map((course, index) => {
        const checked =
          course.id === selected.id ||
          (!family.some((item) => item.id === selected.id) && index === 0)
            ? ' checked'
            : '';
        return `<input class="tab-radio" type="radio" name="program" id="tab-${tabId(index)}"${checked} />`;
      })
      .join('');
    tabLabels =
      '<nav class="tabs">' +
      family
        .map(
          (course, index) =>
            `<label for="tab-${tabId(index)}">${escapeHtml(
              course.programLabel || course.title
            )}</label>`
        )
        .join('') +
      '</nav>';
    panels =
      '<div class="panels">' +
      family
        .map(
          (course, index) =>
            `<section class="panel panel-${tabId(index)}">${renderPanel(origin, course)}</section>`
        )
        .join('') +
      '</div>';
    tabCss =
      family
        .map(
          (_course, index) =>
            `#tab-${tabId(index)}:checked ~ .panels .panel-${tabId(index)} { display: block; }`
        )
        .join('\n      ') +
      '\n      ' +
      family
        .map(
          (_course, index) =>
            `#tab-${tabId(index)}:checked ~ .tabs label[for="tab-${tabId(index)}"] { background: #0f766e; color: #fff; }`
        )
        .join('\n      ');
  }

  return {
    status: 200,
    html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(selected.title)}</title>
    <meta property="og:title" content="${escapeHtml(selected.title)}" />
    <meta property="og:description" content="${escapeHtml(ogDescription)}" />
    <meta property="og:image" content="${escapeHtml(ogImage)}" />
    <meta property="og:url" content="${escapeHtml(pageUrl)}" />
    <style>
      body { font-family: sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
      main { max-width: 40rem; margin: 0 auto; padding: 1.5rem; }
      img { width: 100%; height: auto; border-radius: 0.75rem; }
      .details { white-space: pre-wrap; font-size: 0.95rem; line-height: 1.45; margin-top: 0.75rem; }
      .details a { color: #0f766e; text-decoration: underline; word-break: break-word; }
      .details code { font-family: ui-monospace, monospace; font-size: 0.9em; }
      .tab-radio { position: absolute; opacity: 0; pointer-events: none; }
      .tabs { display: flex; gap: 0.5rem; margin: 0 0 1rem; }
      .tabs label { flex: 1; text-align: center; padding: 0.6rem 0.5rem; border-radius: 0.75rem; background: #e2e8f0; font-size: 0.9rem; cursor: pointer; }
      .panel { display: none; }
      ${tabCss}
    </style>
  </head>
  <body>
    <main>
      ${tabInputs}
      ${tabLabels}
      ${panels}
    </main>
  </body>
</html>`
  };
}

export function publicPageUrlForKey(
  origin: string,
  key: string,
  selected: PublicCourseView
): string {
  const base = origin.replace(/\/$/, '');
  const wanted = String(key || '').trim().toLowerCase();
  if (wanted && publicCourseFamilySlug(selected.courseType) === wanted) {
    return base + publicCourseFamilyPath(selected.courseType);
  }
  return (
    base +
    (selected.publicPath ||
      publicCoursePath(selected.courseType, selected.programCode))
  );
}
