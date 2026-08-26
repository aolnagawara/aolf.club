import { describe, expect, it, vi } from 'vitest';
import { createSheetsStore } from '../../../api/_lib/sheets/store.js';
import type {
  SheetsOperation,
  SpreadsheetTarget
} from '../../../api/_lib/sheets/client.js';

const CAMPAIGN_A = 'cmpLeads01AbcDefGhIJk';
const CAMPAIGN_B = 'cmpLeads02AbcDefGhIJk';
const MEMBERS_CAMPAIGN = 'cmpMembs01AbcDefGhIJK';
const USER = {
  id: 'user-1',
  email: 'volunteer@example.com',
  name: 'Volunteer'
};
const OTHER_VOLUNTEER_EMAIL = 'another.volunteer@example.com';
const LAYOUT = {
  campaignsRange: 'Campaigns!A:F',
  leadsRange: 'Leads!A:Z',
  membersRange: 'Members!A:Z',
  coursesRange: 'Activities!A:Z',
  courseTemplatesRange: 'CourseTemplates!A:B',
  shortUrlsRange: 'ShortUrls!A:C',
  configRange: 'Config!A:B',
  allowedUsersRange: 'AllowedUsers!A:Z'
};
const CONFIG_ROWS = [
  ['key', 'value'],
  ['id', 'cfgMain01AbcDefGhIJK9'],
  ['campaignId', CAMPAIGN_A],
  ['allowedUsers', JSON.stringify([USER.email])]
];
const CAMPAIGN_ROWS = [
  ['id', 'name', 'type'],
  [CAMPAIGN_A, 'August', 'Leads'],
  [CAMPAIGN_B, 'September', 'Leads'],
  [MEMBERS_CAMPAIGN, 'Member Reconnect', 'Members']
];
const LEAD_HEADERS = [
  'id',
  'name',
  'quality',
  'followUp',
  'lastUpdated',
  'status',
  'notes',
  'campaignId',
  'campaignType',
  'assignedVolunteerEmail',
  'wishlistPrograms',
  'donePrograms'
];

function createFixture(
  leadRows: string[][],
  leadHeaders = LEAD_HEADERS,
  allowedUserRows: string[][] = [
    ['email', 'name'],
    [USER.email, 'Current Volunteer'],
    [OTHER_VOLUNTEER_EMAIL, 'Another Volunteer']
  ],
  memberRows: string[][] = []
) {
  const readSheetValues = vi.fn(
    async (
      target: SpreadsheetTarget,
      range: string,
      _operation?: SheetsOperation
    ): Promise<string[][]> => {
      void _operation;
      if (target === 'access') {
        return allowedUserRows;
      }
      if (range === LAYOUT.leadsRange) {
        return [leadHeaders, ...leadRows];
      }
      if (range === LAYOUT.membersRange) {
        return [leadHeaders, ...memberRows];
      }
      return [];
    }
  );
  const readSheetValuesBatch = vi.fn(
    async (
      target: SpreadsheetTarget,
      ranges: readonly string[],
      _operation?: SheetsOperation
    ): Promise<string[][][]> => {
      void _operation;
      expect(target).toBe('data');
      expect(ranges).toEqual([LAYOUT.configRange, LAYOUT.campaignsRange]);
      return [CONFIG_ROWS, CAMPAIGN_ROWS];
    }
  );
  const updateSheetValuesBatch = vi.fn(
    async (
      target: SpreadsheetTarget,
      updates: readonly { range: string; values: string[][] }[]
    ): Promise<void> => {
      void target;
      void updates;
    }
  );
  const appendSheetRow = vi.fn(
    async (
      target: SpreadsheetTarget,
      range: string,
      rowValues: string[]
    ): Promise<void> => {
      void target;
      void range;
      void rowValues;
    }
  );
  const deleteSheetRow = vi.fn(
    async (
      target: SpreadsheetTarget,
      sheetName: string,
      rowNumber: number
    ): Promise<void> => {
      void target;
      void sheetName;
      void rowNumber;
    }
  );
  const store = createSheetsStore({
    appendSheetRow,
    deleteSheetRow,
    readSheetValues,
    readSheetValuesBatch,
    updateSheetValuesBatch,
    getSheetLayout: () => LAYOUT,
    now: () => new Date('2026-08-05T12:00:00.000Z')
  });

  return {
    appendSheetRow,
    deleteSheetRow,
    readSheetValues,
    readSheetValuesBatch,
    store,
    updateSheetValuesBatch
  };
}

describe('Sheets store campaign and access scoping', () => {
  it('denies access when AllowedUsers is empty even if legacy Config lists the user', async () => {
    const fixture = createFixture([], LEAD_HEADERS, [['email', 'name']]);

    await expect(
      fixture.store.getBootstrapForAuthorizedUser(USER, CAMPAIGN_A)
    ).resolves.toEqual({ allowed: false });
  });

  it('filters raw rows by the selected campaign before parsing', async () => {
    const fixture = createFixture([
      [
        '',
        'Invalid row from another campaign',
        '',
        '',
        '',
        '',
        '',
        CAMPAIGN_A,
        'Leads',
        USER.email
      ],
      [
        '9876543210',
        'September lead',
        'Hot',
        'Tomorrow',
        'Yesterday',
        'Connected',
        '',
        CAMPAIGN_B,
        'Leads',
        USER.email
      ]
    ]);

    const result = await fixture.store.getBootstrapForAuthorizedUser(
      USER,
      CAMPAIGN_B
    );

    expect(result.allowed).toBe(true);
    if (!result.allowed) {
      throw new Error('Expected user to be authorized.');
    }
    expect(result.value.campaignId).toBe(CAMPAIGN_B);
    expect(result.value.config.allowedUsers).toEqual([
      USER.email,
      OTHER_VOLUNTEER_EMAIL
    ]);
    expect(result.value.config.volunteers).toEqual([
      { email: USER.email, name: 'Current Volunteer' },
      { email: OTHER_VOLUNTEER_EMAIL, name: 'Another Volunteer' }
    ]);
    expect(result.value.leads.map((lead) => lead.name)).toEqual([
      'September lead'
    ]);
    expect(fixture.readSheetValuesBatch).toHaveBeenCalledTimes(1);
    const operationArguments = [
      ...fixture.readSheetValues.mock.calls.map((call) => call[2]),
      ...fixture.readSheetValuesBatch.mock.calls.map((call) => call[2])
    ].filter(Boolean);
    expect(new Set(operationArguments).size).toBe(1);
  });

  it('assigns matching members in Sheet order without sorting candidates', async () => {
    const fixture = createFixture([], LEAD_HEADERS, undefined, [
      [
        'member-newest',
        'Newest matching member',
        'Active',
        '',
        '',
        'Response',
        '',
        MEMBERS_CAMPAIGN,
        'Members',
        ''
      ],
      [
        'member-inactive',
        'Inactive member between matches',
        'Inactive',
        '',
        '',
        'Response',
        '',
        MEMBERS_CAMPAIGN,
        'Members',
        ''
      ],
      [
        'member-owned-elsewhere',
        'Already assigned elsewhere',
        'Active',
        '',
        '',
        'Response',
        '',
        MEMBERS_CAMPAIGN,
        'Members',
        OTHER_VOLUNTEER_EMAIL
      ],
      [
        'member-next',
        'Next matching member',
        'Active',
        '',
        '',
        'Response',
        '',
        MEMBERS_CAMPAIGN,
        'Members',
        ''
      ],
      [
        'member-already-mine',
        'Already assigned to me',
        'Active',
        '',
        '',
        'Response',
        '',
        MEMBERS_CAMPAIGN,
        'Members',
        USER.email
      ]
    ]);

    const result = await fixture.store.assignMembersForAuthorizedUser(USER, {
      campaignId: MEMBERS_CAMPAIGN,
      count: 3,
      engagementLevels: ['Active']
    });

    expect(result.allowed).toBe(true);
    if (!result.allowed) {
      throw new Error('Expected user to be authorized.');
    }
    expect(result.value).toMatchObject({
      requestedCount: 3,
      assignedCount: 2,
      remainingCapacity: 97
    });
    expect(result.value.members.map((member) => member.id)).toEqual([
      'member-newest',
      'member-next'
    ]);
    expect(fixture.updateSheetValuesBatch).toHaveBeenCalledOnce();
    const updates = fixture.updateSheetValuesBatch.mock.calls[0][1];
    expect(updates).toEqual([
      { range: 'Members!J2', values: [[USER.email]] },
      {
        range: 'Members!E2',
        values: [['2026-08-05T12:00:00.000Z']]
      },
      { range: 'Members!J5', values: [[USER.email]] },
      {
        range: 'Members!E5',
        values: [['2026-08-05T12:00:00.000Z']]
      }
    ]);
  });

  it('stops assigning when the volunteer already has 100 campaign members', async () => {
    const assignedRows = Array.from({ length: 100 }, (_, index) => [
      'assigned-' + String(index),
      'Assigned member ' + String(index),
      'Active',
      '',
      '',
      'Response',
      '',
      MEMBERS_CAMPAIGN,
      'Members',
      USER.email
    ]);
    const fixture = createFixture([], LEAD_HEADERS, undefined, [
      ...assignedRows,
      [
        'member-unassigned',
        'Unassigned member',
        'Active',
        '',
        '',
        'Response',
        '',
        MEMBERS_CAMPAIGN,
        'Members',
        ''
      ]
    ]);

    const result = await fixture.store.assignMembersForAuthorizedUser(USER, {
      campaignId: MEMBERS_CAMPAIGN,
      count: 1,
      engagementLevels: []
    });

    expect(result).toMatchObject({
      allowed: true,
      value: {
        assignedCount: 0,
        remainingCapacity: 0,
        members: []
      }
    });
    expect(fixture.updateSheetValuesBatch).not.toHaveBeenCalled();
  });

  it('updates the matching stable id in the destination campaign', async () => {
    const fixture = createFixture([
      [
        '+91 98765 43210',
        'August lead',
        'Warm',
        '',
        '',
        'Response',
        '',
        CAMPAIGN_A,
        'Leads',
        USER.email
      ],
      [],
      [
        '9876543210',
        'September lead',
        'Hot',
        '',
        '',
        'Connected',
        '',
        CAMPAIGN_B,
        'Leads',
        USER.email
      ]
    ]);

    const result = await fixture.store.updateLeadForAuthorizedUser(USER, {
      id: '9876543210',
      campaignId: CAMPAIGN_B,
      campaignType: 'Leads',
      notes: 'Updated September record'
    });

    expect(result.allowed).toBe(true);
    expect(fixture.updateSheetValuesBatch).toHaveBeenCalledTimes(1);
    const [target, updates] = fixture.updateSheetValuesBatch.mock.calls[0];
    expect(target).toBe('data');
    expect(updates).toEqual(
      expect.arrayContaining([
        { range: 'Leads!G4', values: [['Updated September record']] },
        { range: 'Leads!H4', values: [[CAMPAIGN_B]] },
        { range: 'Leads!I4', values: [['Leads']] },
        {
          range: 'Leads!E4',
          values: [['2026-08-05T12:00:00.000Z']]
        }
      ])
    );
    expect(updates.map((update) => update.range)).not.toContain('Leads!B4');
  });

  it('reassigns a stable-id record only to a currently allowed volunteer', async () => {
    const fixture = createFixture([
      [
        'stable-reassign-id',
        'Reassign me',
        'Warm',
        '',
        '',
        'Response',
        '',
        CAMPAIGN_A,
        'Leads',
        USER.email
      ]
    ]);

    await fixture.store.updateLeadForAuthorizedUser(USER, {
      id: 'stable-reassign-id',
      campaignId: CAMPAIGN_A,
      campaignType: 'Leads',
      assignedVolunteerEmail: OTHER_VOLUNTEER_EMAIL
    });

    const updates = fixture.updateSheetValuesBatch.mock.calls[0][1];
    expect(updates).toContainEqual({
      range: 'Leads!J2',
      values: [[OTHER_VOLUNTEER_EMAIL]]
    });

    await expect(
      fixture.store.updateLeadForAuthorizedUser(USER, {
        id: 'stable-reassign-id',
        campaignId: CAMPAIGN_A,
        campaignType: 'Leads',
        assignedVolunteerEmail: 'not.allowed@example.com'
      })
    ).rejects.toThrow('VOLUNTEER_NOT_ALLOWED');
  });

  it('finds a stable id even when its current campaignId differs', async () => {
    const fixture = createFixture([
      [
        '9876543210',
        'Unscoped lead',
        '',
        '',
        '',
        '',
        '',
        '',
        'Leads',
        USER.email
      ]
    ]);

    await fixture.store.updateLeadForAuthorizedUser(USER, {
      id: '9876543210',
      campaignId: CAMPAIGN_B,
      campaignType: 'Leads',
      notes: 'Moved by stable id'
    });
    expect(fixture.updateSheetValuesBatch).toHaveBeenCalledOnce();
    const updates = fixture.updateSheetValuesBatch.mock.calls[0][1];
    expect(updates).toContainEqual({
      range: 'Leads!G2',
      values: [['Moved by stable id']]
    });
    expect(updates).toContainEqual({
      range: 'Leads!H2',
      values: [[CAMPAIGN_B]]
    });
  });

  it('rejects a user before reading campaign lead data', async () => {
    const fixture = createFixture([]);

    const result = await fixture.store.getBootstrapForAuthorizedUser(
      { ...USER, email: 'blocked@example.com' },
      CAMPAIGN_B
    );

    expect(result).toEqual({ allowed: false });
    expect(fixture.readSheetValuesBatch).toHaveBeenCalledTimes(1);
    expect(fixture.readSheetValues).toHaveBeenCalledTimes(1);
    expect(fixture.readSheetValues).toHaveBeenCalledWith(
      'access',
      LAYOUT.allowedUsersRange,
      expect.anything()
    );
  });

  it('rejects updates when assignment is blank instead of treating them as shared', async () => {
    const fixture = createFixture([
      [
        '9876543210',
        'Unassigned lead',
        '',
        '',
        '',
        '',
        '',
        CAMPAIGN_B,
        'Leads',
        ''
      ]
    ]);

    await expect(
      fixture.store.updateLeadForAuthorizedUser(USER, {
        id: '9876543210',
        campaignId: CAMPAIGN_B,
        campaignType: 'Leads',
        notes: 'Must not be written'
      })
    ).rejects.toThrow('FORBIDDEN_LEAD_ASSIGNMENT');
    expect(fixture.updateSheetValuesBatch).not.toHaveBeenCalled();
  });

  it('uses exact ids and maps a dedicated mobile column', async () => {
    const headers = [
      'id',
      'mobile',
      ...LEAD_HEADERS.filter((header) => header !== 'id')
    ];
    const fixture = createFixture(
      [
        [
          'lead-one',
          '9876543210',
          'First lead',
          '',
          '',
          '',
          '',
          '',
          CAMPAIGN_B,
          'Leads',
          USER.email
        ],
        [
          '9876543210',
          '9999999999',
          'Exact id lead',
          '',
          '',
          '',
          '',
          '',
          CAMPAIGN_B,
          'Leads',
          USER.email
        ]
      ],
      headers
    );

    const bootstrap = await fixture.store.getBootstrapForAuthorizedUser(
      USER,
      CAMPAIGN_B
    );
    expect(bootstrap.allowed && bootstrap.value.leads[0]).toMatchObject({
      id: 'lead-one',
      mobile: '9876543210'
    });

    await fixture.store.updateLeadForAuthorizedUser(USER, {
      id: '9876543210',
      campaignId: CAMPAIGN_B,
      campaignType: 'Leads',
      notes: 'Exact record only'
    });

    const updates = fixture.updateSheetValuesBatch.mock.calls[0][1];
    expect(updates).toContainEqual({
      range: 'Leads!H3',
      values: [['Exact record only']]
    });
  });

  it('creates an assigned record with a generated stable id', async () => {
    const fixture = createFixture([]);

    const result = await fixture.store.createLeadForAuthorizedUser(USER, {
      name: 'Created lead',
      mobile: '9876543210',
      notes: 'Created in the FAB',
      campaignId: CAMPAIGN_B,
      campaignType: 'Leads'
    });

    expect(result.allowed).toBe(true);
    if (!result.allowed) {
      throw new Error('Expected user to be authorized.');
    }
    expect(result.value.lead.id).toHaveLength(21);
    expect(result.value.lead).toMatchObject({
      name: 'Created lead',
      campaignId: CAMPAIGN_B,
      assignedVolunteerEmail: USER.email
    });
    expect(fixture.appendSheetRow).toHaveBeenCalledOnce();
    const [target, range, row] = fixture.appendSheetRow.mock.calls[0];
    expect(target).toBe('data');
    expect(range).toBe(LAYOUT.leadsRange);
    expect(row[0]).toBe(result.value.lead.id);
    expect(row[1]).toBe('Created lead');
    expect(row[7]).toBe(CAMPAIGN_B);
  });

  it('normalizes a +91 mobile and rejects an invalid create mobile', async () => {
    const headers = [
      'id',
      'mobile',
      ...LEAD_HEADERS.filter((header) => header !== 'id')
    ];
    const fixture = createFixture([], headers);

    const created = await fixture.store.createLeadForAuthorizedUser(USER, {
      name: 'Created lead',
      mobile: '+91 98765 43210',
      campaignId: CAMPAIGN_B,
      campaignType: 'Leads'
    });
    expect(created.allowed).toBe(true);
    if (!created.allowed) {
      throw new Error('Expected user to be authorized.');
    }
    expect(created.value.lead.mobile).toBe('9876543210');
    expect(fixture.appendSheetRow.mock.calls[0][2][1]).toBe('9876543210');

    await expect(
      fixture.store.createLeadForAuthorizedUser(USER, {
        name: 'Bad mobile',
        mobile: '12345',
        campaignId: CAMPAIGN_B,
        campaignType: 'Leads'
      })
    ).rejects.toThrow('Enter a valid 10-digit Indian mobile number.');
  });

  it('persists deletion by removing the physical Sheet row', async () => {
    const fixture = createFixture([
      [
        'stable-delete-id',
        'Delete me',
        'Warm',
        '',
        '',
        'Response',
        '',
        CAMPAIGN_A,
        'Leads',
        USER.email,
        '',
        ''
      ]
    ]);

    const result = await fixture.store.deleteLeadForAuthorizedUser(USER, {
      id: 'stable-delete-id',
      campaignType: 'Leads'
    });

    expect(result).toEqual({
      allowed: true,
      value: { success: true, lead: { id: 'stable-delete-id' } }
    });
    expect(fixture.deleteSheetRow).toHaveBeenCalledWith(
      'data',
      'Leads',
      2,
      expect.anything()
    );
  });
});
