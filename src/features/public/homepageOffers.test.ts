import { describe, expect, it } from 'vitest';
import {
  CHAPTER_WHATSAPP_NUMBER,
  homepageCta,
  knowMoreHref
} from './homepageOffers';

describe('homepage program CTAs', () => {
  it('sends Register Now to the public course path when the offer is active', () => {
    expect(
      homepageCta({
        active: true,
        registerPath: '/c/hp',
        label: 'Happiness Program',
        code: 'HP'
      })
    ).toEqual({
      href: '/c/hp',
      label: 'Register Now',
      external: false
    });
  });

  it('sends a WhatsApp Know More message when the offer is not active', () => {
    const cta = homepageCta({
      active: false,
      registerPath: '/c/ip',
      label: 'Intuition Program',
      code: 'IP'
    });
    expect(cta.label).toBe('Know More');
    expect(cta.external).toBe(true);
    expect(cta.href).toBe(knowMoreHref('Intuition Program'));
    expect(cta.href).toContain('https://wa.me/' + CHAPTER_WHATSAPP_NUMBER);
    expect(decodeURIComponent(cta.href)).toContain('Intuition Program');
  });
});
