export type MatchableCourse = {
  isActive: boolean;
  courseType: string;
};

export function normalizeCourseCode(value: string): string {
  return String(value || '')
    .trim()
    .toUpperCase();
}

export function findUniqueActiveCourse<T extends MatchableCourse>(
  wishlistPrograms: readonly string[],
  courses: readonly T[]
): T | null {
  const wanted = new Set(
    wishlistPrograms.map(normalizeCourseCode).filter(Boolean)
  );
  if (!wanted.size) {
    return null;
  }

  const matches = courses.filter(
    (course) =>
      course.isActive &&
      Boolean(normalizeCourseCode(course.courseType)) &&
      wanted.has(normalizeCourseCode(course.courseType))
  );
  return matches.length === 1 ? matches[0] : null;
}

export function fillCourseWhatsappTemplate(
  template: string,
  values: {
    name: string;
    course: string;
    dates: string;
    registrationLink: string;
    courseUrl: string;
  }
): string {
  return String(template || '')
    .replaceAll('{name}', values.name || 'Friend')
    .replaceAll('{course}', values.course || '')
    .replaceAll('{dates}', values.dates || '')
    .replaceAll('{registrationLink}', values.registrationLink || '')
    .replaceAll('{courseUrl}', values.courseUrl || '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const OTHER_URL_RE = /https?:\/\/[^\s]+|www\.[^\s]+/i;

export function ensureCourseUrlInMessage(
  message: string,
  courseUrl: string
): string {
  const url = String(courseUrl || '').trim();
  let text = String(message || '');
  if (!url) {
    return text;
  }

  text = text.replace(new RegExp(escapeRegExp(url), 'g'), '');
  text = text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n');

  const match = OTHER_URL_RE.exec(text);
  if (match && match.index !== undefined) {
    const before = text.slice(0, match.index).replace(/[ \t]+$/, '');
    const after = text.slice(match.index);
    const glue = before.length === 0 || before.endsWith('\n') ? '' : '\n';
    return (before + glue + url + '\n' + after)
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd();
  }

  const trimmed = text.replace(/\s+$/, '');
  if (!trimmed) {
    return url;
  }
  return trimmed + '\n\n' + url;
}
