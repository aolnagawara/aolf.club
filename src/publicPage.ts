import Alpine from 'alpinejs';
import './styles/main.css';
import { homepageProgramOffers } from '../shared/contracts/courseDefaults.mjs';
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
    cta(code: string) {
      const offer = this.offers.find(
        (item: CatalogOffer) => item.code === code
      ) || {
        code,
        label: code,
        active: false,
        registerPath: ''
      };
      return homepageCta(offer);
    },
    async init() {
      try {
        const response = await fetch('/api/courses?catalog=1');
        if (!response.ok) {
          return;
        }
        const body = (await response.json()) as { offers?: CatalogOffer[] };
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
