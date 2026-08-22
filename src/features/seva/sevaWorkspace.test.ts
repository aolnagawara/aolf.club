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
    expect(app.authError).toBe('Unable to load Seva data. Please try again.');
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
    vi.stubGlobal('window', {
      location: { href: '', origin: 'https://aolf.club' }
    });
    const app = sevaWorkspace();
    const lead = app.normalizeLead({
      id: 'stableLead01AbcDefGhI',
      mobile: '+91 98765 43210',
      name: 'Mobile contact',
      campaignId: 'cmpLeads01AbcDefGhIJk',
      campaignType: 'Leads'
    });
    const course = {
      id: 'crsHpNcr01AbcDefGhiJK',
      courseType: 'HP',
      programCode: '',
      title: 'HP',
      whatsappTemplate:
        'Hi {name}, join {course} {dates} {registrationLink} {courseUrl}',
      isActive: true,
      hasPamphlet: false,
      pamphletImageUrl: '',
      publicPath: '/c/hp',
      createdAt: '',
      updatedAt: '',
      createdBy: '',
      updatedBy: ''
    };

    expect(app.getLeadKey(lead)).toContain('stableLead01AbcDefGhI');
    expect(lead._phoneDigits).toBe('919876543210');
    expect(app.buildWhatsappHref(lead, course)).toContain('919876543210');
    expect(app.buildWhatsappHref(lead, course)).not.toContain('91919876543210');
    expect(app.buildWhatsappHref(lead, course)).toContain(
      encodeURIComponent('https://aolf.club/c/hp')
    );
    const hpTemplateHref = app.buildWhatsappHref(lead, {
      ...course,
      whatsappTemplate:
        'Hi {name}\nRegister: https://aolt.in/874234\n\n{courseUrl}'
    });
    const hpMessage = decodeURIComponent(
      hpTemplateHref.split('text=')[1] || ''
    );
    expect(hpMessage.indexOf('https://aolf.club/c/hp')).toBeLessThan(
      hpMessage.indexOf('https://aolt.in/874234')
    );
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
    vi.stubGlobal('window', {
      location: { origin: 'https://aolf.club' }
    });
    const app = sevaWorkspace();
    app.appConfig.whatsappCountryCode = '91';
    const course = {
      id: 'crsHpNcr01AbcDefGhiJK',
      courseType: 'HP',
      programCode: '',
      title: 'HP',
      whatsappTemplate: 'Hi {name}',
      isActive: true,
      hasPamphlet: false,
      pamphletImageUrl: '',
      publicPath: '/c/hp',
      createdAt: '',
      updatedAt: '',
      createdBy: '',
      updatedBy: ''
    };
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

    expect(app.buildWhatsappHref(internationalLead, course)).toContain(
      'https://wa.me/14155552671?'
    );
    expect(app.buildWhatsappHref(internationalLead, course)).not.toContain(
      'https://wa.me/9114155552671?'
    );
    expect(app.buildWhatsappHref(localLead, course)).toContain(
      'https://wa.me/919876543210?'
    );
  });

  it('uses the campaign WhatsApp message when no active course is available', async () => {
    const opened: string[] = [];
    vi.stubGlobal('window', {
      location: { origin: 'https://aolf.club' },
      open: (url: string) => {
        opened.push(url);
        return null;
      },
      appRuntime: {
        listCourses: vi.fn().mockResolvedValue({ success: true, courses: [] })
      }
    });
    const app = sevaWorkspace();
    app.campaigns = [
      {
        id: 'cmpLeads01AbcDefGhIJk',
        name: 'July Leads Campaign',
        type: 'Leads',
        message: 'Hi {name}, greetings from {campaign}.'
      }
    ];
    const lead = app.normalizeLead({
      id: 'leadCamp01AbcDefGhiJK',
      mobile: '9876543210',
      name: 'Aarav',
      campaignId: 'cmpLeads01AbcDefGhIJk',
      campaignType: 'Leads'
    });

    expect(app.buildWhatsappHref(lead)).toContain(
      'https://wa.me/919876543210?'
    );
    expect(decodeURIComponent(app.buildWhatsappHref(lead))).toContain(
      'Hi Aarav, greetings from July Leads Campaign.'
    );

    await app.openWhatsappForLead(lead);
    expect(opened).toHaveLength(1);
    expect(decodeURIComponent(opened[0])).toContain(
      'Hi Aarav, greetings from July Leads Campaign.'
    );
    expect(opened[0]).not.toContain('/course/');
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

    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    updateLead.mockImplementation(async (payload) => {
      if (payload.id === first.id) {
        await firstGate;
      }
      return {
        success: true as const,
        lead: { id: payload.id, lastUpdated: 'moved' }
      };
    });
    const movePromise = app.moveSelectedRecords(app.campaigns[1].id);
    await vi.waitFor(() => {
      expect(updateLead).toHaveBeenCalledTimes(1);
    });
    expect(updateLead.mock.calls[0][0].id).toBe(first.id);
    releaseFirst();
    await movePromise;

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

  it('rejects an invalid mobile number before creating a record', async () => {
    const campaign = {
      id: 'cmpLeads01AbcDefGhIJk',
      name: 'Current',
      type: 'Leads' as const
    };
    const createLead = vi.fn();
    vi.stubGlobal('window', { appRuntime: { createLead } });
    const app = sevaWorkspace();
    app.campaigns = [campaign];
    app.selectedCampaignId = campaign.id;
    app.openCreateRecord('Leads');
    app.createRecordDraft.name = 'New lead';
    app.createRecordDraft.mobile = '12345';

    await app.saveCreatedRecord();

    expect(createLead).not.toHaveBeenCalled();
    expect(app.authError).toBe('Enter a valid 10-digit Indian mobile number.');
    expect(app.isCreateRecordModalOpen).toBe(true);
  });
});

describe('Seva workspace course management', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('sends a clear pamphlet request when an existing pamphlet is removed', async () => {
    const existingCourse = {
      id: 'crsHpNcr01AbcDefGhiJK',
      courseType: 'HP',
      programCode: '',
      title: 'Weekend Happiness Program',
      whatsappTemplate: 'Hi {name}',
      isActive: true,
      hasPamphlet: true,
      pamphletImageUrl: '/course/crsHpNcr01AbcDefGhiJK/pamphlet',
      publicPath: '/c/hp',
      createdAt: '',
      updatedAt: '',
      createdBy: '',
      updatedBy: ''
    };
    const updateCourse = vi.fn(async (payload) => ({
      success: true as const,
      course: {
        ...existingCourse,
        hasPamphlet: false,
        pamphletImageUrl: '',
        updatedAt: 'saved',
        ...payload
      }
    }));
    vi.stubGlobal('window', { appRuntime: { updateCourse } });

    const app = sevaWorkspace();
    app.courses = [existingCourse];
    app.openCourseEditor(existingCourse);
    app.clearCoursePamphlet();

    expect(app.courseDraft.hasPamphlet).toBe(false);
    expect(app.courseDraft.clearPamphlet).toBe(true);
    expect(app.courseDraft.pamphletPreviewUrl).toBe('');

    await app.saveCourse();

    expect(updateCourse).toHaveBeenCalledWith(
      expect.objectContaining({
        id: existingCourse.id,
        clearPamphlet: true,
        pamphletBase64: '',
        pamphletMimeType: ''
      })
    );
    expect(app.courses[0].hasPamphlet).toBe(false);
  });

  it('uses a non-duplicate subtitle in the WhatsApp course picker', () => {
    const app = sevaWorkspace();
    app.appConfig.programs = [{ code: 'HP', label: 'Happiness Program' }];
    const course = {
      id: 'crsHpNcr01AbcDefGhiJK',
      courseType: 'HP',
      programCode: '',
      title: 'Weekend Happiness Program',
      whatsappTemplate: 'Hi {name}',
      isActive: true,
      hasPamphlet: false,
      pamphletImageUrl: '',
      publicPath: '/c/hp',
      createdAt: '',
      updatedAt: '',
      createdBy: '',
      updatedBy: ''
    };

    expect(app.courseDisplayTitle(course)).toBe('Happiness Program');
    expect(app.coursePickerSubtitle(course)).toBe('Weekend Happiness Program');
    expect(app.coursePickerSubtitle({ ...course, title: 'Happiness Program' }))
      .toBe('/c/hp');
  });
});

describe('Seva workspace program editor', () => {
  it('applies selected programs to the card summary without a reload', () => {
    const app = sevaWorkspace();
    app.appConfig.programs = [
      { code: 'HP', label: 'Happiness Program' },
      { code: 'DSN', label: 'Divya Samaj Nirman' }
    ];
    app.appConfig.showDonePrograms = true;
    app.refreshProgramCaches();
    const lead = createLead(app);
    app.leads = [lead];

    app.openProgramEditor(lead);
    app.toggleProgramSelection('wishlist', 'HP');
    app.toggleProgramSelection('done', 'DSN');
    app.saveProgramEditor();

    expect(lead.wishlistPrograms).toEqual(['HP']);
    expect(lead.donePrograms).toEqual(['DSN']);
    expect(lead.programSummary).toContain('HP');
    expect(lead.programSummary).toContain('DSN');
    expect(app.getProgramSummary(lead)).toBe(lead.programSummary);
    expect(lead.isDirty).toBe(true);
    expect(app.isProgramEditorOpen).toBe(false);
  });

  it('discards program editor selections on close', () => {
    const app = sevaWorkspace();
    app.appConfig.programs = [{ code: 'HP', label: 'Happiness Program' }];
    app.refreshProgramCaches();
    const lead = createLead(app);
    app.leads = [lead];

    app.openProgramEditor(lead);
    app.toggleProgramSelection('wishlist', 'HP');
    app.closeProgramEditor();

    expect(lead.wishlistPrograms).toEqual([]);
    expect(app.getProgramSummary(lead)).toBe('✏️ Program');
    expect(lead.isDirty).toBe(false);
  });
});
