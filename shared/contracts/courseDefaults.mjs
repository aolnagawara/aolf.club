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

export const IP_COURSE_PROGRAMS = Object.freeze([
  Object.freeze({ code: 'j', label: '5–8' }),
  Object.freeze({ code: 's', label: '8–18' })
]);

export function normalizeCourseType(value) {
  return String(value || '').trim();
}

export function isIpCourseType(courseType) {
  return normalizeCourseType(courseType).toUpperCase() === 'IP';
}

export function programsForCourseType(courseType) {
  return isIpCourseType(courseType) ? [...IP_COURSE_PROGRAMS] : [];
}

export function normalizeProgramCode(courseType, programCode) {
  const programs = programsForCourseType(courseType);
  if (!programs.length) {
    return '';
  }
  const code = String(programCode || '')
    .trim()
    .toLowerCase();
  return programs.some((item) => item.code === code) ? code : '';
}

export function programLabelFor(courseType, programCode) {
  const code = normalizeProgramCode(courseType, programCode);
  const match = programsForCourseType(courseType).find(
    (item) => item.code === code
  );
  return match ? match.label : '';
}

export function courseSlotKey(courseType, programCode) {
  return (
    normalizeCourseType(courseType).toUpperCase() +
    ':' +
    normalizeProgramCode(courseType, programCode)
  );
}

export function templateLookupKeys(courseType, programCode) {
  const type = normalizeCourseType(courseType);
  const code = normalizeProgramCode(courseType, programCode);
  if (code) {
    return [type + '-' + code, type];
  }
  return [type];
}

export function templateForCourseType(courseType, programCode) {
  const type = normalizeCourseType(courseType).toUpperCase();
  const code = normalizeProgramCode(courseType, programCode);
  if (type === 'HP' && !code) {
    return DEFAULT_HP_WHATSAPP_TEMPLATE;
  }
  return DEFAULT_COURSE_WHATSAPP_TEMPLATE;
}

export function defaultCourseTemplateRows() {
  const rows = [];
  DEFAULT_COURSE_TEMPLATE_TYPES.forEach((courseType) => {
    const programs = programsForCourseType(courseType);
    if (programs.length) {
      programs.forEach((program) => {
        rows.push([
          courseType + '-' + program.code,
          templateForCourseType(courseType, program.code)
        ]);
      });
      return;
    }
    rows.push([courseType, templateForCourseType(courseType)]);
  });
  return rows;
}

export function publicCoursePamphletPath(id) {
  return '/course/' + encodeURIComponent(String(id || '')) + '/pamphlet';
}

export function formatCourseTitle(courseType, programCode) {
  const type = normalizeCourseType(courseType) || 'Course';
  const label = programLabelFor(courseType, programCode);
  return label ? type + ' · ' + label : type;
}

export function publicCourseProgramKey(courseType, programCode) {
  const type = normalizeCourseType(courseType)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (!type) {
    return '';
  }
  const code = normalizeProgramCode(courseType, programCode);
  return code ? type + '-' + code : type;
}

export function publicCoursesPath(programKey) {
  const key = String(programKey || '')
    .trim()
    .toLowerCase();
  return key ? '/courses?program=' + encodeURIComponent(key) : '/courses';
}

export function selectActivePublicCourses(courses, programKey) {
  const activeCourses = (Array.isArray(courses) ? courses : []).filter(
    (course) => Boolean(course && course.isActive)
  );
  const wanted = String(programKey || '')
    .trim()
    .toLowerCase();
  const matched = wanted
    ? activeCourses.find(
        (course) =>
          publicCourseProgramKey(course.courseType, course.programCode) ===
          wanted
      ) ||
      activeCourses.find(
        (course) => publicCourseProgramKey(course.courseType) === wanted
      )
    : null;
  return {
    selected: matched || activeCourses[0] || null,
    courses: activeCourses,
    selectionMatched: Boolean(matched)
  };
}

export function defaultCourseTemplates() {
  return defaultCourseTemplateRows().map(([courseType, template]) => ({
    courseType,
    template
  }));
}

export const HOMEPAGE_PROGRAM_OFFERS = Object.freeze([
  Object.freeze({
    code: 'HP',
    label: 'Happiness Program'
  }),
  Object.freeze({
    code: 'IP',
    label: 'Intuition Program'
  }),
  Object.freeze({
    code: 'Sahaj',
    label: 'Sahaj Samadhi Meditation'
  })
]);

export function homepageProgramOffers(courses) {
  const list = Array.isArray(courses) ? courses : [];
  return HOMEPAGE_PROGRAM_OFFERS.map((offer) => {
    const programKey = publicCourseProgramKey(offer.code);
    const active = list.some(
      (course) =>
        Boolean(course && course.isActive) &&
        publicCourseProgramKey(course.courseType) === programKey
    );
    return {
      code: offer.code,
      label: offer.label,
      active,
      registerPath: publicCoursesPath(programKey)
    };
  });
}
