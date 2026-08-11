import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockReadSheetValues,
  mockReadSheetValuesBatch,
  mockUpdateSheetValuesBatch,
  mockAppendSheetRow
} = vi.hoisted(() => ({
  mockReadSheetValues:
    vi.fn<(target: string, range: string) => Promise<string[][]>>(),
  mockReadSheetValuesBatch:
    vi.fn<
      (target: string, ranges: readonly string[]) => Promise<string[][][]>
    >(),
  mockUpdateSheetValuesBatch: vi.fn<
    (target: string, updates: readonly unknown[]) => Promise<void>
  >(async () => {}),
  mockAppendSheetRow: vi.fn<
    (target: string, range: string, values: string[]) => Promise<void>
  >(async () => {})
}));

vi.mock('../../../api/_lib/sheets/client.js', () => ({
  readSheetValues: mockReadSheetValues,
  readSheetValuesBatch: mockReadSheetValuesBatch,
  updateSheetValuesBatch: mockUpdateSheetValuesBatch,
  appendSheetRow: mockAppendSheetRow
}));

vi.mock('../../../api/_lib/sheets/layout.js', () => ({
  getSheetLayout: () => ({
    campaignsRange: 'Campaigns!A:F',
    leadsRange: 'Leads!A:Z',
    membersRange: 'Members!A:Z',
    configRange: 'Config!A:B',
    allowedUsersRange: 'AllowedUsers!A:Z'
  })
}));

import {
  handleButtonReply,
  handleIncomingText,
  upsertLeadByMobileAndCampaign
} from '../../../api/_lib/whatsapp/leadCaptureService.js';
import {
  __resetWhatsAppStateForTests,
  getPendingLead,
  upsertPendingLead
} from '../../../api/_lib/whatsapp/pendingStore.js';

const headers = [
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
  'donePrograms',
  'mobile'
];

const parsedLead = {
  mobile: '9876543210',
  name: 'Sandip',
  course: 'HP',
  leadQuality: 'Hot',
  month: 'Aug',
  notes: 'Call tomorrow',
  originalMessage: '9876543210 Sandip HP Hot Aug Call tomorrow'
};

describe('WhatsApp lead Sheet upsert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.WHATSAPP_PENDING_TTL_SECONDS;
    __resetWhatsAppStateForTests();
    mockReadSheetValuesBatch.mockResolvedValue([[], []]);
  });

  afterEach(() => {
    __resetWhatsAppStateForTests();
    vi.useRealTimers();
    delete process.env.WHATSAPP_PENDING_TTL_SECONDS;
  });

  it('preserves the physical Sheet row number across blank rows and matches campaignId', async () => {
    const targetRow = [
      '9876543210',
      'Sandip Old',
      'Warm',
      'Follow-up',
      '',
      'Response',
      'Existing',
      'leads-aug',
      'Leads',
      'volunteer@example.com',
      '',
      '',
      ''
    ];
    mockReadSheetValues.mockImplementation(async (_target, range) => {
      if (range === 'Leads!1:1') {
        return [headers];
      }
      if (range === 'Leads!A4:M4') {
        return [targetRow];
      }
      throw new Error('Unexpected range: ' + range);
    });
    mockReadSheetValuesBatch.mockResolvedValue([
      [['9876543211'], [], ['9876543210']],
      [['leads-jul'], [], ['leads-aug']]
    ]);

    const result = await upsertLeadByMobileAndCampaign(
      'volunteer@example.com',
      parsedLead,
      { id: 'leads-aug', name: 'August Leads', type: 'Leads' }
    );

    expect(result).toEqual({ action: 'updated' });
    expect(mockUpdateSheetValuesBatch).toHaveBeenCalledTimes(1);
    const updates = mockUpdateSheetValuesBatch.mock.calls[0][1] as Array<{
      range: string;
      values: string[][];
    }>;
    expect(updates.length).toBeGreaterThan(0);
    expect(updates.every((update) => update.range.endsWith('4'))).toBe(true);
    expect(updates.some((update) => update.range === 'Leads!M4')).toBe(true);
    expect(updates.some((update) => update.range === 'Leads!D4')).toBe(false);
    expect(mockReadSheetValuesBatch).toHaveBeenCalledWith('data', [
      'Leads!M2:M',
      'Leads!H2:H'
    ]);
    expect(mockAppendSheetRow).not.toHaveBeenCalled();
  });

  it('rejects a lead sheet without the required campaignId header', async () => {
    mockReadSheetValues.mockResolvedValue([
      headers.filter((header) => header !== 'campaignId')
    ]);

    await expect(
      upsertLeadByMobileAndCampaign('volunteer@example.com', parsedLead, {
        id: 'leads-aug',
        name: 'August Leads',
        type: 'Leads'
      })
    ).rejects.toThrow('Lead sheet must contain campaignId column.');
    expect(mockUpdateSheetValuesBatch).not.toHaveBeenCalled();
    expect(mockAppendSheetRow).not.toHaveBeenCalled();
  });

  it('creates a stable Nano ID and stores mobile in its dedicated column', async () => {
    mockReadSheetValues.mockResolvedValue([headers]);
    mockReadSheetValuesBatch.mockResolvedValue([[], [], []]);

    const result = await upsertLeadByMobileAndCampaign(
      'volunteer@example.com',
      parsedLead,
      { id: 'leads-aug', name: 'August Leads', type: 'Leads' }
    );

    expect(result).toEqual({ action: 'created' });
    const appended = mockAppendSheetRow.mock.calls[0][2];
    expect(appended[0]).toMatch(/^[A-Za-z0-9_-]{21}$/);
    expect(appended[headers.indexOf('mobile')]).toBe('9876543210');
  });

  it('resends confirmation details when the same source message is retried', async () => {
    await upsertPendingLead(
      '919876543210',
      'volunteer@example.com',
      parsedLead,
      'source-message-1'
    );
    mockReadSheetValues.mockResolvedValue([
      ['email', 'name', 'mobile'],
      ['volunteer@example.com', 'Volunteer', '919876543210']
    ]);

    const result = await handleIncomingText(
      '919876543210',
      parsedLead.originalMessage,
      'source-message-1'
    );

    expect(result).toEqual({
      action: 'show_confirmation',
      parsed: parsedLead
    });
    expect(mockReadSheetValuesBatch).not.toHaveBeenCalled();
  });

  it('defaults a missing lead quality and month before showing confirmation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00.000Z'));
    mockReadSheetValues.mockImplementation(async (target, range) => {
      if (target === 'access' && range === 'AllowedUsers!A:Z') {
        return [
          ['email', 'name', 'mobile'],
          ['volunteer@example.com', 'Volunteer', '919876543210']
        ];
      }
      if (target === 'data' && range === 'Config!A:B') {
        return [
          ['key', 'value'],
          [
            'programs',
            JSON.stringify([{ code: 'HP', label: 'Happiness Program' }])
          ]
        ];
      }
      if (target === 'data' && range === 'Campaigns!A:F') {
        return [['id', 'name', 'type']];
      }
      throw new Error(`Unexpected Sheet read: ${target} ${range}`);
    });
    const message = 'Saurabh 9845702929 HP Need More info';

    const result = await handleIncomingText(
      '919876543210',
      message,
      'source-message-defaults'
    );

    expect(result).toEqual({
      action: 'show_confirmation',
      parsed: {
        mobile: '9845702929',
        name: 'Saurabh',
        course: 'HP',
        leadQuality: 'Hot',
        month: 'Sep',
        notes: 'Need More info',
        originalMessage: message
      }
    });
    await expect(getPendingLead('919876543210')).resolves.toMatchObject({
      parsed: {
        leadQuality: 'Hot',
        month: 'Sep'
      }
    });
  });

  it('returns a copyable edit draft and discards the pending lead only after delivery completes', async () => {
    vi.useFakeTimers();
    process.env.WHATSAPP_PENDING_TTL_SECONDS = '1';
    mockReadSheetValues.mockImplementation(async (target, range) => {
      if (target === 'access' && range === 'AllowedUsers!A:Z') {
        return [
          ['email', 'name', 'mobile'],
          ['volunteer@example.com', 'Volunteer', '919876543210']
        ];
      }
      if (target === 'data' && range === 'Config!A:B') {
        return [
          ['key', 'value'],
          [
            'programs',
            JSON.stringify([{ code: 'HP', label: 'Happiness Program' }])
          ]
        ];
      }
      if (target === 'data' && range === 'Campaigns!A:F') {
        return [
          ['id', 'name', 'type'],
          ['leads-sep', 'September Leads', 'Leads']
        ];
      }
      throw new Error(`Unexpected Sheet read: ${target} ${range}`);
    });
    const editableParsedLead = {
      ...parsedLead,
      course: 'HP,DSN'
    };
    await upsertPendingLead(
      '919876543210',
      'volunteer@example.com',
      editableParsedLead,
      'source-message-old'
    );

    const editResult = await handleButtonReply('919876543210', 'edit_lead');

    expect(editResult).toEqual({
      action: 'send_text',
      messages: [
        'Copy the next message, correct any details, and send it back.',
        'Sandip 9876543210 HP,DSN Hot Aug Call tomorrow'
      ]
    });
    await expect(getPendingLead('919876543210')).resolves.toBeNull();
    await vi.advanceTimersByTimeAsync(1_001);
    expect(mockAppendSheetRow).not.toHaveBeenCalled();

    const newMessage =
      '9123456789 Priya HP Warm Sep New lead after abandoned edit';
    const nextResult = await handleIncomingText(
      '919876543210',
      newMessage,
      'source-message-new'
    );

    expect(nextResult).toEqual({
      action: 'show_confirmation',
      parsed: {
        mobile: '9123456789',
        name: 'Priya',
        course: 'HP',
        leadQuality: 'Warm',
        month: 'Sep',
        notes: 'New lead after abandoned edit',
        originalMessage: newMessage
      }
    });
    expect(await getPendingLead('919876543210')).toMatchObject({
      id: 'source-message-new',
      parsed: { mobile: '9123456789' }
    });
  });

  it('discards an extracted lead when confirmation times out without a response', async () => {
    vi.useFakeTimers();
    process.env.WHATSAPP_PENDING_TTL_SECONDS = '1';
    mockReadSheetValues.mockImplementation(async (target, range) => {
      if (target === 'access' && range === 'AllowedUsers!A:Z') {
        return [
          ['email', 'name', 'mobile'],
          ['volunteer@example.com', 'Volunteer', '919876543210']
        ];
      }
      if (target === 'data' && range === 'Config!A:B') {
        return [
          ['key', 'value'],
          [
            'programs',
            JSON.stringify([{ code: 'HP', label: 'Happiness Program' }])
          ]
        ];
      }
      if (target === 'data' && range === 'Campaigns!A:F') {
        return [['id', 'name', 'type']];
      }
      throw new Error(`Unexpected Sheet read: ${target} ${range}`);
    });

    await expect(
      handleIncomingText(
        '919876543210',
        parsedLead.originalMessage,
        'source-message-timeout'
      )
    ).resolves.toMatchObject({ action: 'show_confirmation' });
    expect(mockAppendSheetRow).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_001);

    expect(mockAppendSheetRow).not.toHaveBeenCalled();
    await expect(getPendingLead('919876543210')).resolves.toBeNull();
  });

  it('cancels automatic save after an explicit confirmation completes', async () => {
    vi.useFakeTimers();
    process.env.WHATSAPP_PENDING_TTL_SECONDS = '1';
    mockReadSheetValues.mockImplementation(async (target, range) => {
      if (target === 'access' && range === 'AllowedUsers!A:Z') {
        return [
          ['email', 'name', 'mobile'],
          ['volunteer@example.com', 'Volunteer', '919876543210']
        ];
      }
      if (target === 'data' && range === 'Config!A:B') {
        return [
          ['key', 'value'],
          [
            'programs',
            JSON.stringify([{ code: 'HP', label: 'Happiness Program' }])
          ]
        ];
      }
      if (target === 'data' && range === 'Campaigns!A:F') {
        return [
          ['id', 'name', 'type'],
          ['leads-aug', 'August Leads', 'Leads']
        ];
      }
      if (target === 'data' && range === 'Leads!1:1') {
        return [headers];
      }
      throw new Error(`Unexpected Sheet read: ${target} ${range}`);
    });

    await handleIncomingText(
      '919876543210',
      parsedLead.originalMessage,
      'source-message-confirmed'
    );
    const confirmation = await handleButtonReply('919876543210', 'confirm_save');
    expect(mockAppendSheetRow).toHaveBeenCalledTimes(1);
    expect(confirmation).toMatchObject({ action: 'send_text' });
    await expect(getPendingLead('919876543210')).resolves.toBeNull();

    await vi.advanceTimersByTimeAsync(1_001);

    expect(mockAppendSheetRow).toHaveBeenCalledTimes(1);
  });
});
