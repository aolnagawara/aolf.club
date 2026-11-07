import { describe, expect, it } from 'vitest';
import {
  createCourseForUser,
  createLeadForUser,
  deleteCourseForUser,
  deleteLeadForUser,
  getBootstrapForUser,
  getPublicCourses,
  importLeadsForUser,
  updateLeadForUser
} from '../../../api/_lib/storage/mockStore.js';

describe('mock store campaign selection', () => {
  it('saves a target course and keeps notes through successive volunteer transfers', async () => {
    const user = { id: 'user-1', email: 'volunteer@example.com' };
    const other = { id: 'user-2', email: 'other-volunteer@example.com' };
    const campaignId = 'cmpLeads01AbcDefGhIJk';
    const created = await createLeadForUser(user, {
      name: 'Transfer with course',
      mobile: '9000000091',
      notes: 'Original handoff context',
      campaignId,
      campaignType: 'Leads',
      wishlistPrograms: 'HP'
    });
    try {
      expect(created.lead.wishlistPrograms).toBe('HP');
      await updateLeadForUser(user, {
        id: created.lead.id,
        campaignId,
        campaignType: 'Leads',
        assignedVolunteerEmail: other.email
      });
      const received = await getBootstrapForUser(other, 'all');
      const lead = received.leads.find((item) => item.id === created.lead.id)!;
      expect(lead.notes).toContain('Transferred from ');
      expect(lead.notes).toContain('Original handoff context');
      expect(lead.wishlistPrograms).toBe('HP');

      await updateLeadForUser(other, {
        id: created.lead.id,
        campaignId,
        campaignType: 'Leads',
        assignedVolunteerEmail: user.email
      });
      await updateLeadForUser(user, {
        id: created.lead.id,
        campaignId,
        campaignType: 'Leads',
        assignedVolunteerEmail: user.email
      });
      const returned = await getBootstrapForUser(user, 'all');
      const notes = returned.leads.find(
        (item) => item.id === created.lead.id
      )!.notes;
      expect(notes.match(/Transferred from /g)).toHaveLength(2);
      expect(notes).toContain('Original handoff context');
    } finally {
      const current = await getBootstrapForUser(user, 'all');
      const owner = current.leads.some((lead) => lead.id === created.lead.id)
        ? user
        : other;
      await deleteLeadForUser(owner, {
        id: created.lead.id,
        campaignType: 'Leads'
      });
    }
  });
  it('rejects an unknown requested campaign like the Sheets store', async () => {
    await expect(
      getBootstrapForUser(
        { id: 'user-1', email: 'volunteer@example.com' },
        'missingCampaign00000x'
      )
    ).rejects.toThrow('CAMPAIGN_NOT_FOUND');
  });

  it('returns assigned leads from every leads campaign for the all scope', async () => {
    const result = await getBootstrapForUser(
      { id: 'user-1', email: 'volunteer@example.com' },
      'all'
    );

    expect(result.campaignId).toBe('all');
    expect(result.leads.map((lead) => lead.name)).toEqual(['Aarav Sharma']);
    expect(result.leads.every((lead) => lead.campaignType === 'Leads')).toBe(
      true
    );
  });

  it('returns another allowed volunteer when that assignee is requested', async () => {
    const result = await getBootstrapForUser(
      { id: 'user-1', email: 'volunteer@example.com' },
      'all',
      'other-volunteer@example.com'
    );

    expect(result.leads.map((lead) => lead.name)).toEqual(['Nisha Verma']);
  });

  it('rejects a new lead when that mobile already exists', async () => {
    await expect(
      createLeadForUser(
        { id: 'user-1', email: 'volunteer@example.com' },
        {
          name: 'Again',
          mobile: '9876543210',
          campaignId: 'cmpLeads01AbcDefGhIJk',
          campaignType: 'Leads'
        }
      )
    ).rejects.toThrow('This mobile number is already a lead.');
  });

  it('assigns imported leads to the signed-in user and skips existing lead mobiles', async () => {
    const createdIds: string[] = [];
    try {
      const result = await importLeadsForUser(
        { id: 'user-1', email: 'Volunteer@Example.com' },
        {
          campaignId: 'cmpLeads01AbcDefGhIJk',
          rows: [
            ['Name', 'Mobile', 'Assigned To', 'Location'],
            ['Aarav Sharma', '9876543210', 'someone@else.com', 'Hebbal'],
            ['Nisha Verma', '9123456780', 'someone@else.com', 'Indiranagar'],
            ['New Person', '9090909090', 'someone@else.com', 'Hebbal'],
            ['Member Number', '9988776655', 'someone@else.com', 'JP Nagar']
          ]
        }
      );
      createdIds.push(...result.leads.map((lead) => lead.id));

      expect(result.importedCount).toBe(2);
      expect(result.skippedCount).toBe(2);
      expect(
        result.leads.every(
          (lead) => lead.assignedVolunteerEmail === 'volunteer@example.com'
        )
      ).toBe(true);
      expect(result.leads.map((lead) => lead.mobile).sort()).toEqual([
        '9090909090',
        '9988776655'
      ]);
      expect(
        result.leads.find((lead) => lead.mobile === '9090909090')?.notes
      ).toBe('Assigned To: someone@else.com\nLocation: Hebbal');
    } finally {
      for (const id of createdIds) {
        await deleteLeadForUser(
          { id: 'user-1', email: 'volunteer@example.com' },
          { id, campaignType: 'Leads' }
        );
      }
    }
  });
});

describe('mock store courses', () => {
  it('creates and deletes a course used by the public reader', async () => {
    const created = await createCourseForUser(
      { id: 'user-1', email: 'volunteer@example.com' },
      { activityType: 'Course', courseType: 'Sahaj', isActive: true }
    );
    expect(created.course.title).toBe('Sahaj');
    await expect(getPublicCourses('sahaj')).resolves.toMatchObject({
      selected: { title: 'Sahaj' },
      selectionMatched: true
    });
    await deleteCourseForUser({ id: created.course.id });
    await expect(getPublicCourses('sahaj')).resolves.toMatchObject({
      selectionMatched: false
    });
  });
});
