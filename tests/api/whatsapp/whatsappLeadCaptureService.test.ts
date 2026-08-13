import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockReadSheetValues, mockUpdateSheetValuesBatch, mockAppendSheetRow } =
  vi.hoisted(() => ({
    mockReadSheetValues:
      vi.fn<(target: string, range: string) => Promise<string[][]>>(),
    mockUpdateSheetValuesBatch: vi.fn<
      (target: string, updates: readonly unknown[]) => Promise<void>
    >(async () => {}),
    mockAppendSheetRow: vi.fn<
      (target: string, range: string, values: string[]) => Promise<void>
    >(async () => {})
  }));

vi.mock('../../../api/_lib/sheets/client.js', () => ({
  readSheetValues: mockReadSheetValues,
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
  buildShareableLeadMessage,
  handleButtonReply,
  handleIncomingText,
  upsertLeadByMobileAndCampaign
} from '../../../api/_lib/whatsapp/leadCaptureService.js';
import {
  __resetWhatsAppStateForTests,
  getPendingLead,
  upsertPendingLead
} from '../../../api/_lib/whatsapp/pendingStore.js';
import { buildConfirmationButtonId } from '../../../api/_lib/whatsapp/confirmationToken.js';

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
  it('builds an informal plain-text lead summary for team sharing', () => {
    expect(buildShareableLeadMessage(parsedLead)).toBe(
      [
        'Lead added 👍',
        '',
        'Name: Sandip',
        'Mobile: 9876543210',
        'Course: HP',
        'Quality: Hot',
        'Month: Aug',
        'Notes: Call tomorrow'
      ].join('\n')
    );
  });
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.META_APP_SECRET = 'test-meta-app-secret';
    delete process.env.WHATSAPP_PENDING_TTL_SECONDS;
    __resetWhatsAppStateForTests();
  });

  afterEach(() => {
    __resetWhatsAppStateForTests();
    vi.useRealTimers();
    delete process.env.WHATSAPP_PENDING_TTL_SECONDS;
    delete process.env.META_APP_SECRET;
  });

  it('preserves the physical Sheet row number across blank rows and matches campaignId', async () => {
    const targetRow = [
      'existing-id',
      'Sandip Old',
      'Warm',
      'Follow-up',
      '',
      'Response',
      'Existing',
      'leads-aug',
      'Leads',
      'original-owner@example.com',
      '',
      '',
      '9876543210'
    ];
    mockReadSheetValues.mockImplementation(async (_target, range) => {
      if (range === 'Leads!A:Z') {
        return [
          headers,
          [
            'other-id',
            'Other lead',
            '',
            '',
            '',
            '',
            '',
            'leads-jul',
            'Leads',
            '',
            '',
            '',
            '9876543211'
          ],
          [],
          targetRow
        ];
      }
      throw new Error('Unexpected range: ' + range);
    });

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
    expect(updates.some((update) => update.range === 'Leads!B4')).toBe(true);
    expect(updates.some((update) => update.range === 'Leads!D4')).toBe(false);
    expect(updates.some((update) => update.range === 'Leads!J4')).toBe(false);
    expect(mockReadSheetValues).toHaveBeenCalledTimes(1);
    expect(mockReadSheetValues).toHaveBeenCalledWith('data', 'Leads!A:Z');
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

    expect(result).toMatchObject({
      action: 'show_confirmation',
      parsed: parsedLead
    });
    expect(result.confirmationToken).toEqual(expect.any(String));
  });

  it('defaults a missing lead quality and month before showing confirmation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-31T20:00:00.000Z'));
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
    const message = 'Saurabh 9845702929 Need More info';

    const result = await handleIncomingText(
      '919876543210',
      message,
      'source-message-defaults'
    );

    expect(result).toMatchObject({
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
    expect(result.confirmationToken).toEqual(expect.any(String));
    await expect(getPendingLead('919876543210')).resolves.toMatchObject({
      parsed: {
        leadQuality: 'Hot',
        month: 'Sep'
      }
    });
    expect(mockReadSheetValues).not.toHaveBeenCalledWith(
      'data',
      'Campaigns!A:F'
    );
  });

  it('returns a copyable edit draft and discards the pending lead before delivery', async () => {
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

    expect(nextResult).toMatchObject({
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
    expect(nextResult.confirmationToken).toEqual(expect.any(String));
    expect(await getPendingLead('919876543210')).toMatchObject({
      id: 'source-message-new',
      parsed: { mobile: '9123456789' }
    });
  });

  it('confirms from the signed button payload after in-memory state is lost', async () => {
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
      if (target === 'data' && range === 'Leads!A:Z') {
        return [headers];
      }
      throw new Error(`Unexpected Sheet read: ${target} ${range}`);
    });

    const incoming = await handleIncomingText(
      '919876543210',
      parsedLead.originalMessage,
      'source-message-before-cold-start'
    );
    expect(incoming.confirmationToken).toBeTruthy();
    __resetWhatsAppStateForTests();

    const confirmation = await handleButtonReply(
      '919876543210',
      buildConfirmationButtonId(
        'confirm_save',
        incoming.confirmationToken || ''
      )
    );

    expect(confirmation).toMatchObject({ action: 'send_text' });
    expect(mockAppendSheetRow).toHaveBeenCalledTimes(1);
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
      if (target === 'data' && range === 'Leads!A:Z') {
        return [headers];
      }
      throw new Error(`Unexpected Sheet read: ${target} ${range}`);
    });

    await handleIncomingText(
      '919876543210',
      parsedLead.originalMessage,
      'source-message-confirmed'
    );
    const confirmation = await handleButtonReply(
      '919876543210',
      'confirm_save'
    );
    expect(mockAppendSheetRow).toHaveBeenCalledTimes(1);
    expect(confirmation).toMatchObject({ action: 'send_text' });
    await expect(getPendingLead('919876543210')).resolves.toBeNull();

    await vi.advanceTimersByTimeAsync(1_001);

    expect(mockAppendSheetRow).toHaveBeenCalledTimes(1);
  });

  it('keeps the pending lead when saving fails so confirmation can be retried', async () => {
    await upsertPendingLead(
      '919876543210',
      'volunteer@example.com',
      parsedLead,
      'source-message-retry-save'
    );
    mockReadSheetValues.mockImplementation(async (target, range) => {
      if (target === 'data' && range === 'Config!A:B') {
        return [];
      }
      if (target === 'data' && range === 'Campaigns!A:F') {
        return [
          ['id', 'name', 'type'],
          ['leads-aug', 'August Leads', 'Leads']
        ];
      }
      if (target === 'data' && range === 'Leads!A:Z') {
        return [headers];
      }
      throw new Error(`Unexpected Sheet read: ${target} ${range}`);
    });
    mockAppendSheetRow.mockRejectedValueOnce(
      new Error('Temporary Google Sheets failure')
    );

    await expect(
      handleButtonReply('919876543210', 'confirm_save')
    ).rejects.toThrow('Temporary Google Sheets failure');
    await expect(getPendingLead('919876543210')).resolves.toMatchObject({
      id: 'source-message-retry-save'
    });

    await expect(
      handleButtonReply('919876543210', 'confirm_save')
    ).resolves.toMatchObject({ action: 'send_text' });
    expect(mockAppendSheetRow).toHaveBeenCalledTimes(2);
    await expect(getPendingLead('919876543210')).resolves.toBeNull();
    expect(mockReadSheetValues).not.toHaveBeenCalledWith('data', 'Config!A:B');
  });

  it('does not save to the first Leads campaign when its name does not match the month', async () => {
    await upsertPendingLead(
      '919876543210',
      'volunteer@example.com',
      parsedLead,
      'source-message-no-campaign'
    );
    mockReadSheetValues.mockImplementation(async (target, range) => {
      if (target === 'data' && range === 'Config!A:B') {
        return [];
      }
      if (target === 'data' && range === 'Campaigns!A:F') {
        return [
          ['id', 'name', 'type'],
          ['leads-jul', 'July Leads', 'Leads'],
          ['members-aug', 'August Members', 'Members']
        ];
      }
      throw new Error(`Unexpected Sheet read: ${target} ${range}`);
    });

    await expect(
      handleButtonReply('919876543210', 'confirm_save')
    ).resolves.toEqual({
      action: 'send_text',
      message: 'No leads campaign configured. Please contact admin.'
    });
    expect(mockAppendSheetRow).not.toHaveBeenCalled();
    await expect(getPendingLead('919876543210')).resolves.toMatchObject({
      id: 'source-message-no-campaign'
    });
  });

  it('does not guess when multiple Leads campaigns match the same month', async () => {
    await upsertPendingLead(
      '919876543210',
      'volunteer@example.com',
      parsedLead,
      'source-message-ambiguous-campaign'
    );
    mockReadSheetValues.mockImplementation(async (target, range) => {
      if (target === 'data' && range === 'Config!A:B') {
        return [];
      }
      if (target === 'data' && range === 'Campaigns!A:F') {
        return [
          ['id', 'name', 'type'],
          ['leads-aug-a', 'August Leads A', 'Leads'],
          ['leads-aug-b', 'August Leads B', 'Leads']
        ];
      }
      throw new Error(`Unexpected Sheet read: ${target} ${range}`);
    });

    await expect(
      handleButtonReply('919876543210', 'confirm_save')
    ).resolves.toEqual({
      action: 'send_text',
      message: 'No leads campaign configured. Please contact admin.'
    });
    expect(mockAppendSheetRow).not.toHaveBeenCalled();
    await expect(getPendingLead('919876543210')).resolves.toMatchObject({
      id: 'source-message-ambiguous-campaign'
    });
  });
});
