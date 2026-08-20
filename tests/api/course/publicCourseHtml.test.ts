import { describe, expect, it } from 'vitest';
import {
  PUBLIC_COURSE_CONTENT_FIELDS,
  renderPublicCourseHtml,
  toPublicCourseView
} from '../../../api/_lib/courses/publicHtml.js';

const COURSE = {
  id: 'crsHpNcr01AbcDefGhiJK',
  title: 'HP · August 2026',
  courseType: 'HP',
  month: '2026-08',
  whatsappTemplate: 'Join {course} in {dates}. {courseUrl}',
  hasPamphlet: true
};

describe('public course HTML', () => {
  it('includes OG tags in the first HTML response without client JS', () => {
    const rendered = renderPublicCourseHtml({
      course: toPublicCourseView(COURSE),
      origin: 'https://aolf.club',
      logoUrl: 'https://aolf.club/assets/aolf-connect-logo.png'
    });

    expect(rendered.status).toBe(200);
    expect(rendered.html).toContain('property="og:title"');
    expect(rendered.html).toContain('property="og:description"');
    expect(rendered.html).toContain('property="og:image"');
    expect(rendered.html).toContain('property="og:url"');
    expect(rendered.html).toContain(
      'content="https://aolf.club/course/crsHpNcr01AbcDefGhiJK/pamphlet"'
    );
    expect(rendered.html).toContain(
      'content="https://aolf.club/course/crsHpNcr01AbcDefGhiJK"'
    );
    expect(rendered.html).not.toContain('alpinejs');
    expect(rendered.html).not.toContain('sevaWorkspace');
    expect(PUBLIC_COURSE_CONTENT_FIELDS).toHaveLength(5);
  });

  it('uses the public Blob URL for og:image when one is stored', () => {
    const blobUrl =
      'https://store123.public.blob.vercel-storage.com/courses/crsHpNcr01AbcDefGhiJK/pamphlet.png';
    const rendered = renderPublicCourseHtml({
      course: toPublicCourseView({
        ...COURSE,
        pamphletImageUrl: blobUrl
      }),
      origin: 'https://aolf.club',
      logoUrl: 'https://aolf.club/assets/aolf-connect-logo.png'
    });

    expect(rendered.html).toContain('content="' + blobUrl + '"');
    expect(rendered.html).not.toContain(
      'content="https://aolf.club/course/crsHpNcr01AbcDefGhiJK/pamphlet"'
    );
  });

  it('escapes stored markup and omits audit fields', () => {
    const rendered = renderPublicCourseHtml({
      course: toPublicCourseView({
        ...COURSE,
        title: '<script>alert(1)</script>',
        whatsappTemplate: 'Hello <b>there</b>'
      }),
      origin: 'https://aolf.club',
      logoUrl: 'https://aolf.club/assets/aolf-connect-logo.png'
    });

    expect(rendered.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(rendered.html).not.toContain('<script>alert(1)</script>');
    expect(rendered.html).not.toContain('volunteer@example.com');
    expect(rendered.html).not.toContain('GOOGLE_SHEETS');
    expect(rendered.html).not.toContain('whatsappTemplate');
    expect(rendered.html).not.toContain('pamphletFileId');
  });

  it('returns a non-leaking 404 for a missing course', () => {
    const rendered = renderPublicCourseHtml({
      course: null,
      origin: 'https://aolf.club',
      logoUrl: 'https://aolf.club/assets/aolf-connect-logo.png'
    });

    expect(rendered.status).toBe(404);
    expect(rendered.html).toContain('Course not found');
    expect(rendered.html).not.toContain('/pamphlet');
    expect(rendered.html).not.toContain('og:image');
  });
});
