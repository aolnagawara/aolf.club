import { describe, expect, it } from 'vitest';
import { normalizeIndianMobile } from '../../../api/_lib/http/normalization.js';
import { rowsToTable } from '../../../api/_lib/sheets/table.js';
import { SHEET_HEADERS } from '../../../shared/contracts/sheetContract.mjs';

describe('shared sheet primitives', () => {
  it.each([
    ['9876543210', '9876543210'],
    ['+91 98765 43210', '9876543210'],
    ['09876543210', '9876543210'],
    ['001919876543210', ''],
    ['12345678909876543210', ''],
    ['not-a-phone', '']
  ])('normalizes %s consistently', (input, expected) => {
    expect(normalizeIndianMobile(input)).toBe(expected);
  });

  it('preserves physical row numbers when blank rows are present', () => {
    const table = rowsToTable([
      ['id', 'campaignId'],
      ['first', 'campaign-a'],
      [],
      ['second', 'campaign-b']
    ]);

    expect(
      table.records.map(({ rowNumber, record }) => ({
        rowNumber,
        id: record.id
      }))
    ).toEqual([
      { rowNumber: 2, id: 'first' },
      { rowNumber: 4, id: 'second' }
    ]);
  });

  it('keeps the dedicated mobile column append-only for legacy row compatibility', () => {
    expect(SHEET_HEADERS.leads.at(-1)).toBe('mobile');
    expect(SHEET_HEADERS.members).toEqual(SHEET_HEADERS.leads);
    expect(SHEET_HEADERS.courses).toEqual([
      'id',
      'activityType',
      'courseType',
      'programCode',
      'title',
      'whatsappTemplate',
      'imageFileId',
      'imageMimeType',
      'isActive',
      'createdAt',
      'updatedAt',
      'createdBy',
      'updatedBy'
    ]);
    expect(SHEET_HEADERS.shortUrls).toEqual([
      'slug',
      'destinationUrl',
      'isActive'
    ]);
  });
});
