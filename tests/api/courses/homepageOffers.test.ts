import { describe, expect, it } from 'vitest';
import { homepageProgramOffers } from '../../../shared/contracts/courseDefaults.mjs';

describe('homepage program offers', () => {
  it('marks HP, IP, and Sahaj from active courses and ignores other types', () => {
    const offers = homepageProgramOffers([
      { courseType: 'HP', isActive: true },
      { courseType: 'DSN', isActive: true },
      { courseType: 'IP2', isActive: true },
      { activityType: 'Event', courseType: 'Sahaj', isActive: true },
      { courseType: 'Sahaj', isActive: false }
    ]);
    expect(offers).toEqual([
      {
        code: 'HP',
        label: 'Happiness Program',
        active: true,
        registerPath: '/courses?program=hp'
      },
      {
        code: 'IP',
        label: 'Intuition Program',
        active: false,
        registerPath: '/courses?program=ip'
      },
      {
        code: 'Sahaj',
        label: 'Sahaj Samadhi Meditation',
        active: false,
        registerPath: '/courses?program=sahaj'
      }
    ]);
  });

  it('treats either IP age slot as an active Intuition Program', () => {
    const offers = homepageProgramOffers([
      { courseType: 'IP', programCode: 'j', isActive: true }
    ]);
    expect(offers.find((offer) => offer.code === 'IP')).toMatchObject({
      active: true,
      registerPath: '/courses?program=ip'
    });
  });
});
