import { describe, expect, it } from 'vitest';
import {
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
  id: 'crsDsnNc01AbcDefGhiJK',
  isActive: true,
  courseType: 'DSN'
};

describe('unique active course matching', () => {
  it('returns the only active course whose code is on the wishlist', () => {
    expect(
      findUniqueActiveCourse(['HP', 'SSDY'], [hp, hpInactive, dsn])
    ).toEqual(hp);
  });

  it('returns null when zero or multiple active courses match', () => {
    expect(findUniqueActiveCourse(['HP'], [hpInactive])).toBeNull();
    expect(
      findUniqueActiveCourse(
        ['HP'],
        [hp, { ...hp, id: 'crsHpTwo01AbcDefGhiJK' }]
      )
    ).toBeNull();
    expect(findUniqueActiveCourse([], [hp])).toBeNull();
  });

  it('does not include inactive courses in the picker set', () => {
    const activeOnly = [hp, hpInactive, dsn].filter(
      (course) => course.isActive
    );
    expect(activeOnly.map((course) => course.id)).toEqual([hp.id, dsn.id]);
  });

  it('fills known WhatsApp template tokens and strips the retired courseUrl token', () => {
    const filled = fillCourseWhatsappTemplate(
      'Hi {name}, join {course} {dates} {registrationLink} {courseUrl}',
      {
        name: 'Aarav',
        course: 'HP',
        dates: 'August 2026',
        registrationLink: 'https://aolt.in/874234'
      }
    );
    expect(filled).toBe(
      'Hi Aarav, join HP August 2026 https://aolt.in/874234 '
    );
    expect(filled).not.toContain('/courses');
  });
});
