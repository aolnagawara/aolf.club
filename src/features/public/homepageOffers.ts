export const CHAPTER_WHATSAPP_NUMBER = '918884560660';

export type HomepageCtaOffer = {
  active?: boolean;
  registerPath?: string;
  label?: string;
  code?: string;
};

export type HomepageCta = {
  href: string;
  label: 'Register Now' | 'Know More';
  external: boolean;
};

export function knowMoreHref(
  label: string,
  number = CHAPTER_WHATSAPP_NUMBER
): string {
  const text = 'Hi, I would like to know more about the ' + label + '.';
  return 'https://wa.me/' + number + '?text=' + encodeURIComponent(text);
}

export function homepageCta(offer: HomepageCtaOffer): HomepageCta {
  if (offer.active && offer.registerPath) {
    return {
      href: offer.registerPath,
      label: 'Register Now',
      external: false
    };
  }
  const name =
    String(offer.label || offer.code || 'program').trim() || 'program';
  return {
    href: knowMoreHref(name),
    label: 'Know More',
    external: true
  };
}
