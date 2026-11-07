import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sevaWorkspace } from './sevaWorkspace';
import { MockLeadRepository } from '../../repositories/mock/mockLeadRepository';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function populateAuthenticatedWorkspace() {
  const app = sevaWorkspace();
  app.authenticatedUser = {
    id: 'user-1',
    email: 'volunteer@example.com',
    name: 'Volunteer'
  };
  app.volunteerEmail = 'volunteer@example.com';
  app.isVolunteerModalOpen = false;
  app.isProfileMenuOpen = true;
  app.campaigns = [{ id: 'campaign-1', name: 'Current Seva', type: 'Leads' }];
  app.selectedCampaign = app.campaigns[0];
  app.selectedCampaignId = app.campaigns[0].id;
  app.leads = [
    app.normalizeLead({
      id: 'lead-1',
      name: 'Current lead',
      campaignId: app.selectedCampaignId,
      campaignType: 'Leads'
    })
  ];
  return app;
}

describe('Seva workspace sign-out', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens the reused lead form after authenticating on /add', async () => {
    const repository = new MockLeadRepository();
    vi.stubGlobal('window', {
      location: { pathname: '/add' },
      appRuntime: {
        getAuthenticatedUser: async () => ({
          id: 'user-1',
          email: 'volunteer@example.com'
        }),
        loadBootstrap: (campaignId: string) =>
          repository.getBootstrap(campaignId)
      }
    });
    const app = sevaWorkspace();

    await app.initializeAuthenticatedSession();

    expect(app.isVolunteerModalOpen).toBe(false);
    expect(app.isCreateRecordModalOpen).toBe(true);
    expect(app.createRecordType).toBe('Leads');
    expect(app.createRecordDraft.campaignId).toBe('cmpLeads01AbcDefGhIJk');
  });

  it('keeps the quick-add form behind sign-in when there is no session', async () => {
    const loadBootstrap = vi.fn();
    vi.stubGlobal('window', {
      location: { pathname: '/add' },
      appRuntime: { getAuthenticatedUser: async () => null, loadBootstrap }
    });
    const app = sevaWorkspace();

    await app.initializeAuthenticatedSession();

    expect(app.isVolunteerModalOpen).toBe(true);
    expect(app.isCreateRecordModalOpen).toBe(false);
    expect(loadBootstrap).not.toHaveBeenCalled();
  });

  it('flushes saves before ending the session and clearing workspace data', async () => {
    const flushResult = deferred<boolean>();
    const signOut = vi.fn(async () => undefined);
    vi.stubGlobal('window', { appRuntime: { signOut } });
    const app = populateAuthenticatedWorkspace();
    app.flushPendingSaves = vi.fn(() => flushResult.promise);

    const result = app.signOutToLanding();

    expect(app.flushPendingSaves).toHaveBeenCalledOnce();
    expect(signOut).not.toHaveBeenCalled();
    expect(app.authenticatedUser?.id).toBe('user-1');
    expect(app.leads).toHaveLength(1);

    flushResult.resolve(true);
    await result;

    expect(signOut).toHaveBeenCalledOnce();
    expect(app.authenticatedUser).toBeNull();
    expect(app.volunteerEmail).toBe('');
    expect(app.leads).toEqual([]);
    expect(app.campaigns).toEqual([]);
    expect(app.selectedCampaign).toBeNull();
    expect(app.isVolunteerModalOpen).toBe(true);
    expect(app.isProfileMenuOpen).toBe(false);
  });

  it('retains the session and workspace when pending changes cannot be saved', async () => {
    const signOut = vi.fn(async () => undefined);
    vi.stubGlobal('window', { appRuntime: { signOut } });
    const app = populateAuthenticatedWorkspace();
    const leads = app.leads;
    app.flushPendingSaves = vi.fn(async () => false);

    await app.signOutToLanding();

    expect(signOut).not.toHaveBeenCalled();
    expect(app.authenticatedUser?.id).toBe('user-1');
    expect(app.volunteerEmail).toBe('volunteer@example.com');
    expect(app.leads).toBe(leads);
    expect(app.isVolunteerModalOpen).toBe(false);
    expect(app.authError).toBe(
      'Some changes could not be saved. Please retry before signing out.'
    );
  });

  it('retains the session and workspace when the server cannot sign out', async () => {
    const signOut = vi.fn(async () => {
      throw new Error('Network unavailable.');
    });
    vi.stubGlobal('window', { appRuntime: { signOut } });
    const app = populateAuthenticatedWorkspace();
    const leads = app.leads;
    app.flushPendingSaves = vi.fn(async () => true);

    await app.signOutToLanding();

    expect(signOut).toHaveBeenCalledOnce();
    expect(app.authenticatedUser?.id).toBe('user-1');
    expect(app.leads).toBe(leads);
    expect(app.isVolunteerModalOpen).toBe(false);
    expect(app.authError).toContain('Unable to sign out right now.');
    expect(app.authError).toContain('please try signing out again');
  });
});
