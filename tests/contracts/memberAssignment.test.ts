import { describe, expect, it } from 'vitest';
import {
  AssignMembersRequestSchema,
  MAX_MEMBERS_PER_VOLUNTEER
} from '../../shared/contracts/appContracts';
import {
  isUnsetMemberEngagement,
  matchesMemberEngagement
} from '../../shared/memberAssignment';

describe('member assignment contract', () => {
  it('accepts a bounded count and optional engagement level', () => {
    expect(
      AssignMembersRequestSchema.parse({
        campaignId: 'cmpMembs01AbcDefGhIJK',
        count: MAX_MEMBERS_PER_VOLUNTEER
      })
    ).toMatchObject({ count: 100, engagementLevels: [] });

    expect(() =>
      AssignMembersRequestSchema.parse({
        campaignId: 'cmpMembs01AbcDefGhIJK',
        count: 101
      })
    ).toThrow();
  });

  it('matches any selected engagement and always includes unset values', () => {
    expect(matchesMemberEngagement('Active', [])).toBe(true);
    expect(matchesMemberEngagement('Active', ['active'])).toBe(true);
    expect(matchesMemberEngagement('Occasional', ['Active'])).toBe(false);
    expect(matchesMemberEngagement('', ['Active'])).toBe(true);
    expect(matchesMemberEngagement('Engagement', ['Active'])).toBe(true);
    expect(isUnsetMemberEngagement('Engagement')).toBe(true);
    expect(isUnsetMemberEngagement('Active')).toBe(false);
  });
});
