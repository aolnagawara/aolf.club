import Alpine from 'alpinejs';
import './styles/main.css';
import {
  DEFAULT_CENTER_WHATSAPP_NUMBER,
  homepageProgramOffers
} from '../shared/contracts/courseDefaults.mjs';
import { homepageCta } from './features/public/homepageOffers';

declare global {
  interface Window {
    Alpine: typeof Alpine;
  }
}

type CatalogOffer = {
  code: string;
  label: string;
  active: boolean;
  registerPath: string;
};

function homepagePrograms() {
  return {
    offers: homepageProgramOffers([]) as CatalogOffer[],
    whatsappNumber: DEFAULT_CENTER_WHATSAPP_NUMBER,
    cta(code: string) {
      const offer = this.offers.find(
        (item: CatalogOffer) => item.code === code
      ) || {
        code,
        label: code,
        active: false,
        registerPath: ''
      };
      return homepageCta(offer, this.whatsappNumber);
    },
    centerWhatsappHref(text = '') {
      const number =
        String(this.whatsappNumber || '').replace(/\D/g, '') ||
        DEFAULT_CENTER_WHATSAPP_NUMBER;
      const message = String(text || '').trim();
      return message
        ? 'https://wa.me/' + number + '?text=' + encodeURIComponent(message)
        : 'https://wa.me/' + number;
    },
    async init() {
      try {
        const response = await fetch('/api/courses?catalog=1');
        if (!response.ok) {
          return;
        }
        const body = (await response.json()) as {
          offers?: CatalogOffer[];
          whatsappNumber?: string;
        };
        if (body.whatsappNumber) {
          this.whatsappNumber = body.whatsappNumber;
        }
        if (!Array.isArray(body.offers)) {
          return;
        }
        const byCode: Record<string, CatalogOffer> = {};
        for (const offer of body.offers) {
          if (offer?.code) {
            byCode[offer.code] = offer;
          }
        }
        this.offers = this.offers.map(
          (offer: CatalogOffer) => byCode[offer.code] || offer
        );
      } catch {
        // Keep Know More defaults when the catalog is unavailable.
      }
    }
  };
}

window.Alpine = Alpine;
Alpine.data('homepagePrograms', homepagePrograms);
Alpine.start();
