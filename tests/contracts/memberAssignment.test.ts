import { describe, expect, it } from 'vitest';
import {
  AssignMembersRequestSchema,
  MAX_MEMBERS_PER_VOLUNTEER,
  UNSET_MEMBER_ENGAGEMENT
} from '../../shared/contracts/appContracts';
import { matchesMemberEngagement } from '../../shared/memberAssignment';

describe('member assignment contract', () => {
  it('accepts a bounded count and optional engagement level', () => {
    expect(
      AssignMembersRequestSchema.parse({
        campaignId: 'cmpMembs01AbcDefGhIJK',
        count: MAX_MEMBERS_PER_VOLUNTEER
      })
    ).toMatchObject({ count: 100, engagementLevel: '' });

    expect(() =>
      AssignMembersRequestSchema.parse({
        campaignId: 'cmpMembs01AbcDefGhIJK',
        count: 101
      })
    ).toThrow();
  });

  it('matches exact engagement values and treats the placeholder as not set', () => {
    expect(matchesMemberEngagement('Active', '')).toBe(true);
    expect(matchesMemberEngagement('Active', 'active')).toBe(true);
    expect(matchesMemberEngagement('Occasional', 'Active')).toBe(false);
    expect(matchesMemberEngagement('', UNSET_MEMBER_ENGAGEMENT)).toBe(true);
    expect(matchesMemberEngagement('Engagement', UNSET_MEMBER_ENGAGEMENT)).toBe(
      true
    );
    expect(matchesMemberEngagement('Active', UNSET_MEMBER_ENGAGEMENT)).toBe(
      false
    );
  });
});
