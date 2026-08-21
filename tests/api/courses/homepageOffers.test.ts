import { describe, expect, it } from 'vitest';
import { homepageProgramOffers } from '../../../shared/contracts/courseDefaults.mjs';

describe('homepage program offers', () => {
  it('marks HP, IP, and Sahaj from active courses and ignores other types', () => {
    const offers = homepageProgramOffers([
      { courseType: 'HP', isActive: true },
      { courseType: 'DSN', isActive: true },
      { courseType: 'IP2', isActive: true },
      { courseType: 'Sahaj', isActive: false }
    ]);
    expect(offers).toEqual([
      {
        code: 'HP',
        label: 'Happiness Program',
        active: true,
        registerPath: '/c/hp'
      },
      {
        code: 'IP',
        label: 'Intuition Program',
        active: false,
        registerPath: '/c/ip'
      },
      {
        code: 'Sahaj',
        label: 'Sahaj Samadhi Meditation',
        active: false,
        registerPath: '/c/sahaj'
      }
    ]);
  });

  it('treats either IP age slot as an active Intuition Program', () => {
    const offers = homepageProgramOffers([
      { courseType: 'IP', programCode: 'j', isActive: true }
    ]);
    expect(offers.find((offer) => offer.code === 'IP')).toMatchObject({
      active: true,
      registerPath: '/c/ip'
    });
  });
});
