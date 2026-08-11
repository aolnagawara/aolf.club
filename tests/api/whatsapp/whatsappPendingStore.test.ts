import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetWhatsAppStateForTests,
  getPendingLead,
  markMessageProcessed,
  removePendingLead,
  schedulePendingLeadTimeout,
  upsertPendingLead,
  wasMessageProcessed
} from '../../../api/_lib/whatsapp/pendingStore.js';

const parsedLead = {
  mobile: '9876543210',
  name: 'Sandip',
  course: 'HP',
  leadQuality: 'Hot',
  month: 'Aug',
  notes: '',
  originalMessage: '9876543210 Sandip HP Hot Aug'
};

describe('WhatsApp pending confirmation store', () => {
  beforeEach(() => {
    delete process.env.APP_DATA_MODE;
    delete process.env.WHATSAPP_PENDING_TTL_SECONDS;
    __resetWhatsAppStateForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.APP_DATA_MODE;
    delete process.env.WHATSAPP_PENDING_TTL_SECONDS;
  });

  it('keeps coordination in memory even when lead data uses Sheets', async () => {
    process.env.APP_DATA_MODE = 'sheets';
    const created = await upsertPendingLead(
      '919876543210',
      'volunteer@example.com',
      parsedLead,
      'source-message-memory'
    );

    await expect(getPendingLead('919876543210')).resolves.toEqual(created);
  });

  it('does not let a stale pending id remove a newer pending lead', async () => {
    await upsertPendingLead(
      '919876543210',
      'volunteer@example.com',
      parsedLead,
      'source-old'
    );
    await upsertPendingLead(
      '919876543210',
      'volunteer@example.com',
      { ...parsedLead, name: 'New Lead' },
      'source-new'
    );

    const removed = await removePendingLead('919876543210', 'source-old');

    expect(removed).toBe(false);
    expect((await getPendingLead('919876543210'))?.id).toBe('source-new');
  });

  it('removes only the pending lead with the expected id', async () => {
    await upsertPendingLead(
      '919876543210',
      'volunteer@example.com',
      parsedLead,
      'source-new'
    );

    await removePendingLead('919876543210', 'source-old');
    expect((await getPendingLead('919876543210'))?.id).toBe('source-new');

    await removePendingLead('919876543210', 'source-new');
    await expect(getPendingLead('919876543210')).resolves.toBeNull();
  });

  it('drops a pending lead from memory when its timeout fires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T12:00:00.000Z'));
    process.env.WHATSAPP_PENDING_TTL_SECONDS = '1';
    const pending = await upsertPendingLead(
      '919876543210',
      'volunteer@example.com',
      parsedLead,
      'source-expiring'
    );
    schedulePendingLeadTimeout(pending);

    await vi.advanceTimersByTimeAsync(1_001);

    await expect(getPendingLead('919876543210')).resolves.toBeNull();
  });

  it('keeps processed-message de-duplication bounded by the in-memory TTL', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T12:00:00.000Z'));
    process.env.WHATSAPP_PENDING_TTL_SECONDS = '1';

    expect(wasMessageProcessed('message-1')).toBe(false);
    markMessageProcessed('message-1');
    expect(wasMessageProcessed('message-1')).toBe(true);

    await vi.advanceTimersByTimeAsync(1_001);

    expect(wasMessageProcessed('message-1')).toBe(false);
  });
});
