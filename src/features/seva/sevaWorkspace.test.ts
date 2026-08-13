import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sevaWorkspace } from './sevaWorkspace';
import { getLeadCompositeKey } from './leadLifecycle';
import type { SevaWorkspaceContext, CampaignType, Lead } from './types';
import type { UpdateLeadResponse } from '../../../shared/contracts/appContracts';
import { MockLeadRepository } from '../../repositories/mock/mockLeadRepository';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createLead(
  app: SevaWorkspaceContext,
  campaignId = 'cmpLeads01AbcDefGhIJk',
  campaignType: CampaignType = 'Leads',
  id = '+91 99999 00000'
): Lead {
  app.selectedCampaignId = campaignId;
  app.campaignType = campaignType;
  app.qualityOptions = [
    { value: campaignType === 'Members' ? 'Active' : 'Hot', label: 'Quality' }
  ];
  app.statusOptions = ['Response', 'Reached'];
  return app.normalizeLead({
    id,
    name: 'Original name',
    quality: campaignType === 'Members' ? 'Active' : 'Hot',
    status: 'Response',
    notes: 'Original note',
    campaignId,
    campaignType
  });
}

describe('Seva workspace lead lifecycle', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('serializes and coalesces saves without clearing a newer edit', async () => {
    const firstResponse = deferred<UpdateLeadResponse>();
    const secondResponse = deferred<UpdateLeadResponse>();
    const updateLead = vi
      .fn()
      .mockImplementationOnce(() => firstResponse.promise)
      .mockImplementationOnce(() => secondResponse.promise);
    vi.stubGlobal('window', { appRuntime: { updateLead } });

    const app = sevaWorkspace();
    const lead = createLead(app);
    app.leads = [lead];
    app.activateCard(lead);

    lead.notes = 'First revision';
    app.markLeadDirty(lead);
    const firstSave = app.commitLeadChanges(lead);
    expect(updateLead).toHaveBeenCalledTimes(1);

    lead.notes = 'Latest revision';
    app.markLeadDirty(lead);
    const secondSave = app.commitLeadChanges(lead);
    expect(updateLead).toHaveBeenCalledTimes(1);

    firstResponse.resolve({
      success: true,
      lead: { id: lead.id, lastUpdated: 'first saved' }
    });
    await vi.waitFor(() => expect(updateLead).toHaveBeenCalledTimes(2));
    expect(lead.isDirty).toBe(true);
    expect(lead._originalData?.notes).toBe('Original note');

    secondResponse.resolve({
      success: true,
      lead: { id: lead.id, lastUpdated: 'latest saved' }
    });
    await expect(Promise.all([firstSave, secondSave])).resolves.toEqual([
      true,
      true
    ]);

    expect(lead.isDirty).toBe(false);
    expect(lead._originalData?.notes).toBe('Latest revision');
    expect(lead.lastUpdated).toBe('latest saved');
    expect(updateLead.mock.calls[0][0].notes).toBe('First revision');
    expect(updateLead.mock.calls[1][0]).toMatchObject({
      notes: 'Latest revision',
      campaignId: lead.campaignId,
      campaignType: lead.campaignType
    });
  });

  it('keeps an edit made during a save dirty until a later flush saves it', async () => {
    const firstResponse = deferred<UpdateLeadResponse>();
    const updateLead = vi
      .fn()
      .mockImplementationOnce(() => firstResponse.promise)
      .mockResolvedValueOnce({
        success: true,
        lead: { id: '+91 99999 00000', lastUpdated: 'latest saved' }
      });
    vi.stubGlobal('window', { appRuntime: { updateLead } });

    const app = sevaWorkspace();
    const lead = createLead(app);
    app.leads = [lead];
    lead.notes = 'First revision';
    app.markLeadDirty(lead);
    const firstSave = app.commitLeadChanges(lead);

    lead.notes = 'Edit made while saving';
    app.markLeadDirty(lead);
    firstResponse.resolve({
      success: true,
      lead: { id: lead.id, lastUpdated: 'first saved' }
    });
    await expect(firstSave).resolves.toBe(true);

    expect(updateLead).toHaveBeenCalledTimes(1);
    expect(lead._originalData?.notes).toBe('First revision');
    expect(lead.notes).toBe('Edit made while saving');
    expect(lead.isDirty).toBe(true);

    await expect(app.flushPendingSaves()).resolves.toBe(true);

    expect(updateLead).toHaveBeenCalledTimes(2);
    expect(updateLead.mock.calls[1][0].notes).toBe('Edit made while saving');
    expect(lead._originalData?.notes).toBe('Edit made while saving');
    expect(lead.isDirty).toBe(false);
  });

  it('preserves custom quality and status when saving an unrelated edit', async () => {
    const updateLead = vi.fn(async (payload) => ({
      success: true as const,
      lead: { id: payload.id, lastUpdated: 'saved' }
    }));
    vi.stubGlobal('window', { appRuntime: { updateLead } });

    const app = sevaWorkspace();
    app.qualityOptions = [{ value: 'Hot', label: 'Hot' }];
    app.statusOptions = ['Response', 'Connected'];
    const lead = app.normalizeLead({
      id: 'custom-values-lead',
      name: 'Custom values',
      quality: 'Very Warm',
      status: 'Left Voicemail',
      notes: 'Original note',
      campaignId: 'cmpLeads01AbcDefGhIJk',
      campaignType: 'Leads'
    });
    app.leads = [lead];

    expect(lead.quality).toBe('Very Warm');
    expect(lead.status).toBe('Left Voicemail');

    lead.notes = 'Only the note changed';
    app.markLeadDirty(lead);
    await expect(app.commitLeadChanges(lead)).resolves.toBe(true);

    expect(updateLead).toHaveBeenCalledWith(
      expect.objectContaining({
        notes: 'Only the note changed',
        quality: 'Very Warm',
        status: 'Left Voicemail'
      })
    );
  });

  it('defers name-filter invalidation until editing finishes', () => {
    const app = sevaWorkspace();
    const lead = createLead(app);
    app.leads = [lead];
    app.activateCard(lead);

    lead.notes = 'Notes do not participate in filtering';
    app.markLeadDirty(lead);
    expect(lead._nameLower).toBe('original name');

    lead.name = 'Searchable new name';
    app.markLeadDirty(lead);
    expect(lead._nameLower).toBe('original name');

    app.finishNameEditing(lead);
    expect(lead._nameLower).toBe('searchable new name');
  });

  it('preserves pagination for data edits and resets it for criteria changes', () => {
    const app = sevaWorkspace();
    app.leads = Array.from({ length: 60 }, (_, index) =>
      createLead(
        app,
        'cmpLeads01AbcDefGhIJk',
        'Leads',
        'lead-' + String(index).padStart(2, '0')
      )
    );

    expect(app.visibleLeads()).toHaveLength(25);
    app.loadMoreLeads();
    expect(app.visibleLeads()).toHaveLength(50);

    const editedLead = app.leads[30];
    editedLead.name = 'Renamed on the second page';
    app.markLeadDirty(editedLead);
    app.finishNameEditing(editedLead);
    expect(app.visibleLeads()).toHaveLength(50);
    expect(app.visibleLeadLimit).toBe(50);

    app.searchQuery = 'Renamed';
    app.filteredLeads();
    expect(app.visibleLeadLimit).toBe(25);

    app.searchQuery = '';
    app.filteredLeads();
    app.loadMoreLeads();
    expect(app.visibleLeadLimit).toBe(50);
    app.selectedCampaignId = 'cmpMembs01AbcDefGhIJK';
    app.filteredLeads();
    expect(app.visibleLeadLimit).toBe(25);
  });

  it('flushes an edited lead before loading another campaign', async () => {
    const saveResponse = deferred<UpdateLeadResponse>();
    const updateLead = vi.fn(() => saveResponse.promise);
    vi.stubGlobal('window', { appRuntime: { updateLead } });

    const app = sevaWorkspace();
    const lead = createLead(app);
    app.leads = [lead];
    app.activateCard(lead);
    lead.notes = 'Save before switching';
    app.markLeadDirty(lead);
    const loadBootstrap = vi.fn(async () => undefined);
    app.loadBootstrap = loadBootstrap;

    const switching = app.onCampaignChange('cmpMembs01AbcDefGhIJK');
    expect(app.isCampaignSwitching).toBe(true);
    expect(updateLead).toHaveBeenCalledTimes(1);
    expect(loadBootstrap).not.toHaveBeenCalled();

    saveResponse.resolve({
      success: true,
      lead: { id: lead.id, lastUpdated: 'saved' }
    });
    await switching;

    expect(loadBootstrap).toHaveBeenCalledWith('cmpMembs01AbcDefGhIJK');
    expect(lead.isDirty).toBe(false);
    expect(app.isCampaignSwitching).toBe(false);
  });

  it('preserves the current campaign view when a target load fails', async () => {
    const loadBootstrap = vi.fn().mockRejectedValue(new Error('Target failed'));
    vi.stubGlobal('window', { appRuntime: { loadBootstrap } });

    const app = sevaWorkspace();
    const currentCampaign = {
      id: 'cmpLeads01AbcDefGhIJk',
      name: 'Current campaign',
      type: 'Leads' as const
    };
    const targetCampaign = {
      id: 'cmpMembs01AbcDefGhIJK',
      name: 'Target campaign',
      type: 'Members' as const
    };
    const lead = createLead(app, currentCampaign.id, currentCampaign.type);
    const currentLeads = [lead];
    app.volunteerEmail = 'volunteer@example.com';
    app.isVolunteerModalOpen = false;
    app.campaigns = [currentCampaign, targetCampaign];
    app.appConfig.campaigns = app.campaigns;
    app.selectedCampaign = currentCampaign;
    app.leads = currentLeads;

    await app.onCampaignChange(targetCampaign.id);

    expect(loadBootstrap).toHaveBeenCalledWith(targetCampaign.id);
    expect(app.selectedCampaignId).toBe(currentCampaign.id);
    expect(app.selectedCampaign).toBe(currentCampaign);
    expect(app.leads).toBe(currentLeads);
    expect(app.leads[0]).toBe(lead);
    expect(app.authError).toBe('Target failed');
    expect(app.isCampaignSwitching).toBe(false);
    expect(app.isLoadingBootstrap).toBe(false);
  });

  it('keeps the card identity stable when campaignId changes', () => {
    const app = sevaWorkspace();
    const lead = createLead(app);
    app.leads = [lead];

    const stableKey = getLeadCompositeKey(lead);
    lead.campaignId = 'cmpLeads02AbcDefGhIJk';

    expect(getLeadCompositeKey(lead)).toBe(stableKey);
    expect(app.getLeadByKey(stableKey)).toBe(lead);
  });

  it('uses mobile for contact actions while keeping id as the identity', () => {
    vi.stubGlobal('window', { location: { href: '' } });
    const app = sevaWorkspace();
    const lead = app.normalizeLead({
      id: 'stableLead01AbcDefGhI',
      mobile: '+91 98765 43210',
      name: 'Mobile contact',
      campaignId: 'cmpLeads01AbcDefGhIJk',
      campaignType: 'Leads'
    });

    expect(app.getLeadKey(lead)).toContain('stableLead01AbcDefGhI');
    expect(lead._phoneDigits).toBe('919876543210');
    expect(app.buildWhatsappHref(lead)).toContain('919876543210');
    expect(app.buildWhatsappHref(lead)).not.toContain('91919876543210');
    app.dialLead(lead);
    expect(window.location.href).toBe('tel:+919876543210');
  });

  it('does not use a stable id as a missing mobile number', () => {
    vi.stubGlobal('window', {
      location: { href: 'https://example.test/seva' }
    });
    const app = sevaWorkspace();
    const lead = app.normalizeLead({
      id: 'stable-lead-1234567890',
      mobile: '',
      name: 'No mobile',
      campaignId: 'cmpLeads01AbcDefGhIJk',
      campaignType: 'Leads'
    });

    expect(lead._phoneDigits).toBe('');
    expect(app.getTelHref(lead.mobile)).toBe('');
    expect(app.buildWhatsappHref(lead)).toBe('');

    app.dialLead(lead);
    expect(window.location.href).toBe('https://example.test/seva');
  });

  it('preserves explicit international WhatsApp numbers and prefixes local ones', () => {
    const app = sevaWorkspace();
    app.appConfig.whatsappCountryCode = '91';
    const internationalLead = app.normalizeLead({
      id: 'international-lead',
      mobile: '+1 415 555 2671',
      name: 'International mobile',
      campaignId: 'cmpLeads01AbcDefGhIJk',
      campaignType: 'Leads'
    });
    const localLead = app.normalizeLead({
      id: 'local-lead',
      mobile: '98765 43210',
      name: 'Local mobile',
      campaignId: 'cmpLeads01AbcDefGhIJk',
      campaignType: 'Leads'
    });

    expect(app.buildWhatsappHref(internationalLead)).toContain(
      'https://wa.me/14155552671?'
    );
    expect(app.buildWhatsappHref(internationalLead)).not.toContain(
      'https://wa.me/9114155552671?'
    );
    expect(app.buildWhatsappHref(localLead)).toContain(
      'https://wa.me/919876543210?'
    );
  });

  it.each([
    {
      campaignType: 'Leads' as const,
      qualityPlaceholder: 'Quality',
      qualityOption: 'Hot',
      statusOption: 'Connected'
    },
    {
      campaignType: 'Members' as const,
      qualityPlaceholder: 'Engagement',
      qualityOption: 'Active',
      statusOption: 'Reached'
    }
  ])(
    'keeps $campaignType placeholders visible but excludes them from option sheets',
    ({ campaignType, qualityPlaceholder, qualityOption, statusOption }) => {
      const app = sevaWorkspace();
      app.campaignType = campaignType;
      app.qualityOptions = [qualityOption, qualityPlaceholder].map((value) => ({
        value,
        label: value
      }));
      app.statusOptions = ['Response', statusOption];
      const lead = app.normalizeLead({
        id: 'lead-with-placeholders',
        name: 'Placeholder lead',
        campaignId: 'cmpLeads01AbcDefGhIJk',
        campaignType
      });

      expect(lead.quality).toBe(qualityPlaceholder);
      expect(lead.status).toBe('Response');

      app.openOptionSheet('quality', lead);
      expect(app.currentOptionValue).toBe(qualityPlaceholder);
      expect(app.optionSheetOptions.map((item) => item.value)).toEqual([
        qualityOption
      ]);

      app.closeOptionSheet();
      app.openOptionSheet('status', lead);
      expect(app.currentOptionValue).toBe('Response');
      expect(app.optionSheetOptions.map((item) => item.value)).toEqual([
        statusOption
      ]);
    }
  );
});

describe('mock lead repository identity', () => {
  it('filters by campaign and updates only the composite match', async () => {
    const repository = new MockLeadRepository();
    const leads = await repository.getBootstrap('cmpLeads01AbcDefGhIJk');
    const members = await repository.getBootstrap('cmpMembs01AbcDefGhIJK');

    expect(
      leads.leads.every((lead) => lead.campaignId === leads.campaignId)
    ).toBe(true);
    expect(
      members.leads.every((lead) => lead.campaignId === members.campaignId)
    ).toBe(true);

    const duplicateId = members.leads[0].id;
    await repository.updateLead({
      id: duplicateId,
      campaignId: members.campaignId,
      campaignType: 'Members',
      notes: 'Updated member only'
    });

    const refreshedMembers = await repository.getBootstrap(members.campaignId);
    const refreshedLeads = await repository.getBootstrap(leads.campaignId);
    expect(
      refreshedMembers.leads.find((lead) => lead.id === duplicateId)?.notes
    ).toBe('Updated member only');
    expect(
      refreshedLeads.leads.find((lead) => lead.id === duplicateId)?.notes
    ).toBe('Requested morning callback');
  });

  it('rejects unknown campaigns and missing stable-id updates', async () => {
    const repository = new MockLeadRepository();

    await expect(repository.getBootstrap('x'.repeat(21))).rejects.toThrow(
      'Campaign not found'
    );
    await expect(
      repository.updateLead({
        id: 'missing-lead',
        campaignId: 'cmpLeads01AbcDefGhIJk',
        campaignType: 'Leads',
        notes: 'Must not report success'
      })
    ).rejects.toThrow('Lead not found for type');
  });
});

describe('Seva workspace selection and bulk actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('enters selection on long press and exits after the final deselection', () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {
      getSelection: () => ({ removeAllRanges: vi.fn() })
    });
    const app = sevaWorkspace();
    const lead = createLead(app);
    app.leads = [lead];

    app.handleCardPointerDown(
      { button: 0, clientX: 10, clientY: 10 } as PointerEvent,
      lead
    );
    vi.advanceTimersByTime(500);

    expect(app.isSelectionMode()).toBe(true);
    expect(app.isLeadSelected(lead)).toBe(true);
    app.toggleLeadSelection(lead);
    expect(app.isSelectionMode()).toBe(false);
  });

  it('moves selected records by stable id and immediately removes them', async () => {
    const updateLead = vi.fn(async (payload) => ({
      success: true as const,
      lead: { id: payload.id, lastUpdated: 'moved' }
    }));
    vi.stubGlobal('window', { appRuntime: { updateLead } });
    const app = sevaWorkspace();
    const first = createLead(app, undefined, undefined, 'stable-lead-one');
    const second = createLead(app, undefined, undefined, 'stable-lead-two');
    app.leads = [first, second];
    app.campaigns = [
      { id: 'cmpLeads01AbcDefGhIJk', name: 'Current', type: 'Leads' },
      { id: 'cmpLeads02AbcDefGhIJk', name: 'Next', type: 'Leads' }
    ];
    app.selectedCampaignId = app.campaigns[0].id;
    app.toggleLeadSelection(first);
    app.toggleLeadSelection(second);

    await app.moveSelectedRecords(app.campaigns[1].id);

    expect(updateLead).toHaveBeenCalledTimes(2);
    expect(updateLead.mock.calls.map((call) => call[0].id)).toEqual([
      first.id,
      second.id
    ]);
    expect(updateLead.mock.calls[0][0].campaignId).toBe(app.campaigns[1].id);
    expect(app.leads).toEqual([]);
    expect(app.selectedCount()).toBe(0);
  });

  it('confirms, persists, and locally removes a bulk deletion', async () => {
    const deleteLead = vi.fn(async ({ id }) => ({
      success: true as const,
      lead: { id }
    }));
    const confirm = vi.fn(() => true);
    vi.stubGlobal('window', { appRuntime: { deleteLead }, confirm });
    const app = sevaWorkspace();
    const lead = createLead(app, undefined, undefined, 'stable-delete-id');
    app.leads = [lead];
    app.toggleLeadSelection(lead);

    await app.deleteSelectedRecords();

    expect(confirm).toHaveBeenCalledOnce();
    expect(deleteLead).toHaveBeenCalledWith({
      id: lead.id,
      campaignType: lead.campaignType
    });
    expect(app.leads).toEqual([]);
    expect(app.selectedCount()).toBe(0);
  });

  it('lists allowed volunteers and removes records reassigned away from the current user', async () => {
    const updateLead = vi.fn(async (payload) => ({
      success: true as const,
      lead: { id: payload.id, lastUpdated: 'reassigned' }
    }));
    vi.stubGlobal('window', { appRuntime: { updateLead } });
    const app = sevaWorkspace();
    const campaign = {
      id: 'cmpLeads01AbcDefGhIJk',
      name: 'Current',
      type: 'Leads' as const
    };
    const lead = createLead(
      app,
      campaign.id,
      campaign.type,
      'stable-reassign-id'
    );
    lead.assignedVolunteerEmail = 'volunteer@example.com';
    app.leads = [lead];
    app.campaigns = [campaign];
    app.selectedCampaignId = campaign.id;
    app.volunteerEmail = 'volunteer@example.com';
    app.appConfig.allowedUsers = [
      'volunteer@example.com',
      'another.volunteer@example.com'
    ];
    app.appConfig.volunteers = [
      { email: 'volunteer@example.com', name: 'Current Volunteer' },
      {
        email: 'another.volunteer@example.com',
        name: 'Another Volunteer'
      }
    ];
    app.toggleLeadSelection(lead);

    app.openReassignVolunteerSheet();
    expect(app.optionSheetOptions).toEqual([
      {
        value: 'another.volunteer@example.com',
        label: 'Another Volunteer'
      }
    ]);
    await app.applyOptionSelection('another.volunteer@example.com');

    expect(updateLead).toHaveBeenCalledWith(
      expect.objectContaining({
        id: lead.id,
        assignedVolunteerEmail: 'another.volunteer@example.com'
      })
    );
    expect(app.leads).toEqual([]);
    expect(app.selectedCount()).toBe(0);
  });

  it('adds a new record to the current campaign without reloading', async () => {
    const campaign = {
      id: 'cmpLeads01AbcDefGhIJk',
      name: 'Current',
      type: 'Leads' as const
    };
    const createLead = vi.fn(async (payload) => ({
      success: true as const,
      lead: {
        id: 'newStableLeadId12345x',
        mobile: payload.mobile,
        name: payload.name,
        quality: 'Quality',
        followUp: 'Follow-up',
        lastUpdated: 'Just now',
        status: 'Response',
        notes: payload.notes || '',
        campaignId: payload.campaignId,
        campaignType: payload.campaignType,
        assignedVolunteerEmail: 'volunteer@example.com',
        wishlistPrograms: '',
        donePrograms: ''
      }
    }));
    vi.stubGlobal('window', { appRuntime: { createLead } });
    const app = sevaWorkspace();
    app.campaigns = [campaign];
    app.selectedCampaignId = campaign.id;
    app.openCreateRecord('Leads');
    app.createRecordDraft.name = 'New lead';
    app.createRecordDraft.mobile = '9876543210';

    await app.saveCreatedRecord();

    expect(createLead).toHaveBeenCalledOnce();
    expect(app.leads[0]).toMatchObject({
      id: 'newStableLeadId12345x',
      name: 'New lead'
    });
    expect(app.isCreateRecordModalOpen).toBe(false);
  });
});
