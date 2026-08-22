import { describe, expect, it } from 'vitest';
import {
  PUBLIC_COURSE_CONTENT_FIELDS,
  renderPublicCourseHtml,
  toPublicCourseView
} from '../../../api/_lib/courses/publicHtml.js';
import { formatWhatsappHtml } from '../../../api/_lib/courses/whatsappHtml.js';
import { publicCourseSlug } from '../../../shared/contracts/courseDefaults.mjs';

const COURSE = {
  id: 'crsHpNcr01AbcDefGhiJK',
  title: 'HP',
  courseType: 'HP',
  programCode: '',
  whatsappTemplate:
    "_*HAPPINESS PROGRAM*_\n*Benefits You'll Experience:*\nRegister at https://aolt.in/874234",
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
    expect(rendered.html).toContain('content="https://aolf.club/c/hp"');
    expect(rendered.html).not.toContain('<h1>');
    expect(rendered.html).not.toContain('<dt>Type</dt>');
    expect(rendered.html).not.toContain('<dt>Month</dt>');
    expect(rendered.html).not.toContain('alpinejs');
    expect(rendered.html).not.toContain('sevaWorkspace');
    expect(PUBLIC_COURSE_CONTENT_FIELDS).toHaveLength(3);
  });

  it('renders WhatsApp *bold* _italic_ and links as HTML', () => {
    expect(formatWhatsappHtml('_*Hello*_ and *bold* and _italic_')).toBe(
      '<em><strong>Hello</strong></em> and <strong>bold</strong> and <em>italic</em>'
    );
    const rendered = renderPublicCourseHtml({
      course: toPublicCourseView(COURSE),
      origin: 'https://aolf.club',
      logoUrl: 'https://aolf.club/assets/aolf-connect-logo.png'
    });
    expect(rendered.html).toContain(
      '<em><strong>HAPPINESS PROGRAM</strong></em>'
    );
    expect(rendered.html).toContain(
      '<strong>Benefits You&#39;ll Experience:</strong>'
    );
    expect(rendered.html).toContain('href="https://aolt.in/874234"');
    expect(rendered.html).toContain('target="_blank"');
    expect(rendered.html).not.toContain('*Benefits');
  });

  it('turns URLs and Indian mobile numbers into clickable links', () => {
    const html = formatWhatsappHtml(
      'See www.example.com and *https://aolt.in/1*\nCall 8884560660 or +91 8884561661'
    );
    expect(html).toContain('href="https://www.example.com"');
    expect(html).toContain('href="https://aolt.in/1"');
    expect(html).toContain('href="tel:8884560660"');
    expect(html).toContain('href="tel:+918884561661"');
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

    expect(rendered.html).toContain('Hello &lt;b&gt;there&lt;/b&gt;');
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

  it('renders IP age-group tabs for a shared family page', () => {
    const junior = toPublicCourseView({
      id: 'crsIpJnr01AbcDefGhiJK',
      title: 'IP · 5–8',
      courseType: 'IP',
      programCode: 'j',
      whatsappTemplate: 'Junior https://aolt.in/j',
      hasPamphlet: true,
      pamphletImageUrl:
        'https://store123.public.blob.vercel-storage.com/courses/j/pamphlet.png'
    });
    const senior = toPublicCourseView({
      id: 'crsIpSnr01AbcDefGhiJK',
      title: 'IP · 8–18',
      courseType: 'IP',
      programCode: 's',
      whatsappTemplate: 'Senior https://aolt.in/s',
      hasPamphlet: true,
      pamphletImageUrl:
        'https://store123.public.blob.vercel-storage.com/courses/s/pamphlet.png'
    });
    const rendered = renderPublicCourseHtml({
      course: junior,
      family: [junior, senior],
      origin: 'https://aolf.club',
      logoUrl: 'https://aolf.club/assets/aolf-connect-logo.png',
      pageUrl: 'https://aolf.club/c/ip-j'
    });
    expect(rendered.html).toContain('content="https://aolf.club/c/ip-j"');
    expect(rendered.html).toContain(
      'content="https://store123.public.blob.vercel-storage.com/courses/j/pamphlet.png"'
    );
    expect(rendered.html).toContain('for="tab-p0"');
    expect(rendered.html).toContain('for="tab-p1"');
    expect(rendered.html).toContain('5–8');
    expect(rendered.html).toContain('8–18');
    expect(rendered.html).toContain('href="https://aolt.in/j"');
    expect(rendered.html).toContain('href="https://aolt.in/s"');
  });
});

describe('public course slug', () => {
  it('builds a type or type-program slug', () => {
    expect(publicCourseSlug('HP', '')).toBe('hp');
    expect(publicCourseSlug('IP', 'j')).toBe('ip-j');
    expect(publicCourseSlug('YES+', '')).toBe('yes');
  });
});
