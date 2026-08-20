export const DEFAULT_COURSE_WHATSAPP_TEMPLATE =
  'Hi {name}, you are invited to {course} ({dates}).\n\n{courseUrl}';

export const DEFAULT_HP_WHATSAPP_TEMPLATE = `_*🌿✨HAPPINESS PROGRAM by The Art of Living ✨🌿*_

😌 Feeling stressed, tired, or overwhelmed?
Take a pause and discover the power of your breath through Sudarshan Kriya™️ — a life-transforming breathing technique practiced by millions across the globe. 🌍💙

*Benefits You'll Experience:*
*Reduces Stress & Anxiety 😌*
*Improves Sleep Quality 😴✨*
*Boosts Energy Levels ⚡*
*Enhances Focus & Mental Clarity 🎯🧠*
*Strengthens Immunity 💪🛡️*
*Promotes Emotional Balance 😊🌸*
*Increases Self-Confidence 🌟*
*Improves Productivity & Creativity 💡🚀*
*Relieves Body Aches & Tension 🧘‍♀️💆‍♂️*
*Brings More Joy, Peace & Happiness 💖🌈*

📅 Dates: *28 – 30 August*
🌅 Morning Batch: *6:30 – 9:30 A.M.*
🌇 Evening Batch: *6:00 – 9:00 P.M.*

_📍Venue:_
*Art of Living Nagavara Center*
*Manyata Tech Park,*
*Behind Elements Mall*
*North Bengaluru*

📞 For Registration & Details:
{courseUrl}
https://aolt.in/874234

📲 8884560660
📲 8884561661

 _🌸 A simple breath. A powerful shift. A happier you. 🌸_`;

export const DEFAULT_COURSE_TEMPLATE_TYPES = Object.freeze([
  'HP',
  'VTP',
  'DSN',
  'IP',
  'IP2',
  'Sahaj',
  'YES+'
]);

export function normalizeCourseType(value) {
  return String(value || '').trim();
}

export function templateForCourseType(courseType) {
  return normalizeCourseType(courseType).toUpperCase() === 'HP'
    ? DEFAULT_HP_WHATSAPP_TEMPLATE
    : DEFAULT_COURSE_WHATSAPP_TEMPLATE;
}

export function defaultCourseTemplateRows() {
  return DEFAULT_COURSE_TEMPLATE_TYPES.map((courseType) => [
    courseType,
    templateForCourseType(courseType)
  ]);
}

export function currentCourseMonth(now = new Date()) {
  return (
    String(now.getFullYear()) +
    '-' +
    String(now.getMonth() + 1).padStart(2, '0')
  );
}

export function formatCourseMonthLabel(month) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(month || '').trim());
  if (!match) {
    return String(month || '').trim();
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return date.toLocaleString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

export function formatCourseTitle(courseType, month) {
  const type = normalizeCourseType(courseType) || 'Course';
  const label = formatCourseMonthLabel(month);
  return label ? type + ' · ' + label : type;
}

export function publicCoursePamphletPath(id) {
  return '/course/' + encodeURIComponent(String(id || '')) + '/pamphlet';
}

export function publicCourseSlug(courseType, month) {
  const type = normalizeCourseType(courseType)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(month || '').trim());
  if (!type || !match) {
    return '';
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  const abbr = date
    .toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
    .toLowerCase()
    .replace('.', '');
  return type + '-' + abbr;
}

export function publicCoursePath(courseType, month) {
  const slug = publicCourseSlug(courseType, month);
  return slug ? '/c/' + encodeURIComponent(slug) : '';
}

export function isCourseNanoId(value) {
  return /^[A-Za-z0-9_-]{21}$/.test(String(value || '').trim());
}

export function pickPublicCourseByKey(courses, key) {
  const wanted = String(key || '').trim();
  if (!wanted) {
    return null;
  }
  const list = Array.isArray(courses) ? courses : [];
  if (isCourseNanoId(wanted)) {
    return list.find((course) => course && course.id === wanted) || null;
  }
  const slug = wanted.toLowerCase();
  const matches = list.filter(
    (course) =>
      publicCourseSlug(course?.courseType, course?.month) === slug
  );
  matches.sort((left, right) => {
    if (Boolean(left.isActive) !== Boolean(right.isActive)) {
      return left.isActive ? -1 : 1;
    }
    const monthCmp = String(right.month || '').localeCompare(
      String(left.month || '')
    );
    if (monthCmp) {
      return monthCmp;
    }
    return String(right.updatedAt || '').localeCompare(
      String(left.updatedAt || '')
    );
  });
  return matches[0] || null;
}

export function defaultCourseTemplates() {
  return defaultCourseTemplateRows().map(([courseType, template]) => ({
    courseType,
    template
  }));
}
