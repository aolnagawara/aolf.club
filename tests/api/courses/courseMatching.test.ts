import { describe, expect, it } from 'vitest';
import {
  ensureCourseUrlInMessage,
  fillCourseWhatsappTemplate,
  findUniqueActiveCourse
} from '../../../shared/contracts/courseMatching.js';

const hp = {
  id: 'crsHpNcr01AbcDefGhiJK',
  isActive: true,
  courseType: 'HP'
};
const hpInactive = {
  id: 'crsHpOld01AbcDefGhiJK',
  isActive: false,
  courseType: 'HP'
};
const dsn = {
  id: 'crsDsnNcr01AbcDefGhiJK',
  isActive: true,
  courseType: 'DSN'
};

describe('unique active course matching', () => {
  it('returns the only active course whose code is on the wishlist', () => {
    expect(findUniqueActiveCourse(['HP', 'SSDY'], [hp, hpInactive, dsn])).toEqual(
      hp
    );
  });

  it('returns null when zero or multiple active courses match', () => {
    expect(findUniqueActiveCourse(['HP'], [hpInactive])).toBeNull();
    expect(findUniqueActiveCourse(['HP'], [hp, { ...hp, id: 'crsHpTwo01AbcDefGhiJK' }])).toBeNull();
    expect(findUniqueActiveCourse([], [hp])).toBeNull();
  });

  it('does not include inactive courses in the picker set', () => {
    const activeOnly = [hp, hpInactive, dsn].filter((course) => course.isActive);
    expect(activeOnly.map((course) => course.id)).toEqual([hp.id, dsn.id]);
  });

  it('appends the public course URL when the template omitted it', () => {
    const filled = fillCourseWhatsappTemplate('Hi {name}', {
      name: 'Aarav',
      course: 'HP',
      dates: 'August 2026',
      registrationLink: '',
      courseUrl: 'https://aolf.club/c/hp-aug'
    });
    expect(
      ensureCourseUrlInMessage(filled, 'https://aolf.club/c/hp-aug')
    ).toContain('https://aolf.club/c/hp-aug');
  });

  it('places the course URL immediately before the first other URL', () => {
    const courseUrl = 'https://aolf.club/c/hp-aug';
    const filled = fillCourseWhatsappTemplate(
      'Hi {name}\nRegister: https://aolt.in/874234\n\n{courseUrl}',
      {
        name: 'Aarav',
        course: 'HP',
        dates: 'August 2026',
        registrationLink: '',
        courseUrl
      }
    );
    const message = ensureCourseUrlInMessage(filled, courseUrl);
    expect(message.indexOf(courseUrl)).toBeGreaterThan(
      message.indexOf('Hi Aarav')
    );
    expect(message.indexOf(courseUrl)).toBeLessThan(
      message.indexOf('https://aolt.in/874234')
    );
    expect(message.match(new RegExp(courseUrl.replace(/\//g, '\\/'), 'g'))).toHaveLength(
      1
    );
  });
});
