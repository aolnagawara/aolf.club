import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const volunteerPageUrl = new URL('../../src/volunteer.html', import.meta.url);
const mainModuleUrl = new URL('../../src/main.ts', import.meta.url);

describe('campaign workspace actions', () => {
  it('shows refresh and members-only self-assignment controls', () => {
    const page = readFileSync(volunteerPageUrl, 'utf8');
    const mainModule = readFileSync(mainModuleUrl, 'utf8');

    expect(page).toContain('@click="refreshCurrentCampaign()"');
    expect(page).toContain('aria-label="Refresh current Seva"');
    expect(page).toContain('data-lucide="refresh-cw"');
    expect(mainModule).toContain('RefreshCw');
    expect(page).toContain('x-show="campaignType === \'Members\'"');
    expect(page).toContain('@click="openAssignMembersModal()"');
    expect(page).toContain('data-lucide="user-check"');
    expect(mainModule).toContain('UserCheck');
    expect(page.indexOf('@click="openAssignMembersModal()"')).toBeGreaterThan(
      page.indexOf('x-show="isFabOpen"')
    );
    expect(page).toContain('Assign Members to Me');
    expect(page).toContain('@submit.prevent="submitMemberAssignment()"');
    expect(page).toContain('Engagement level');
    expect(page).toContain('toggleMemberAssignmentEngagement(option.value)');
    expect(page).not.toContain('Any engagement');
    expect(page).not.toContain('Not set');
    expect(page).not.toContain('x-model="assignMembersDraft.engagementLevel"');
  });
});
