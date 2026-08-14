import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildConfirmationButtonId,
  createConfirmationToken,
  parseConfirmationButtonId,
  readConfirmationToken
} from '../../../api/_lib/whatsapp/confirmationToken.js';
import type { PendingLeadConfirmation } from '../../../api/_lib/whatsapp/pendingStore.js';

const pending: PendingLeadConfirmation = {
  id: 'pending-1',
  sourceMessageId: 'message-1',
  volunteerPhone: '9876543210',
  volunteerEmail: 'volunteer@example.com',
  originalMessage: 'Sandip 9123456789 HP Hot Aug Call tomorrow',
  parsed: {
    mobile: '9123456789',
    name: 'Sandip',
    course: 'HP',
    leadQuality: 'Hot',
    month: 'Aug',
    notes: 'Call tomorrow',
    originalMessage: 'Sandip 9123456789 HP Hot Aug Call tomorrow'
  },
  createdAt: Date.parse('2026-08-13T10:00:00.000Z'),
  expiresAt: Date.parse('2026-08-13T10:05:00.000Z')
};

describe('WhatsApp confirmation token', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T10:01:00.000Z'));
    process.env.META_APP_SECRET = 'test-meta-app-secret';
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.META_APP_SECRET;
  });

  it('round-trips an authorized pending draft within the button id limit', () => {
    const token = createConfirmationToken(pending);

    expect(token).toBeTruthy();
    const buttonId = buildConfirmationButtonId('confirm_save', token || '');
    expect(buttonId.length).toBeLessThanOrEqual(256);
    expect(parseConfirmationButtonId(buttonId)).toEqual({
      action: 'confirm_save',
      token
    });
    expect(readConfirmationToken(token || '', '919876543210')).toMatchObject({
      volunteerEmail: 'volunteer@example.com',
      volunteerPhone: '9876543210',
      parsed: pending.parsed
    });
  });

  it('rejects a token used by a different sender or after expiry', () => {
    const token = createConfirmationToken(pending) || '';

    expect(readConfirmationToken(token, '919876543211')).toBeNull();

    vi.setSystemTime(new Date('2026-08-13T10:05:00.001Z'));
    expect(readConfirmationToken(token, '919876543210')).toBeNull();
  });

  it('rejects a modified token', () => {
    const token = createConfirmationToken(pending) || '';
    const modified = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;

    expect(readConfirmationToken(modified, '919876543210')).toBeNull();
  });
});
