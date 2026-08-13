import type { Campaign } from '../../../shared/contracts/appContracts.js';

export type SheetRowRecord = {
  rowNumber: number;
  values: string[];
  record: Record<string, string>;
};

export type SheetTable = {
  headers: string[];
  records: SheetRowRecord[];
};

export function parseJsonValue<T>(raw: string | undefined, fallback: T): T {
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function columnLabel(columnNumber: number): string {
  let dividend = columnNumber;
  let label = '';
  while (dividend > 0) {
    const modulo = (dividend - 1) % 26;
    label = String.fromCharCode(65 + modulo) + label;
    dividend = Math.floor((dividend - modulo) / 26);
  }
  return label || 'A';
}

export function getTabName(range: string): string {
  const index = range.indexOf('!');
  return index >= 0 ? range.slice(0, index) : range;
}

export function findHeaderIndex(
  headers: string[],
  candidates: readonly string[]
): number {
  const indexByHeader = new Map<string, number>();
  headers.forEach((header, index) => {
    const normalized = header.toLowerCase();
    if (!indexByHeader.has(normalized)) {
      indexByHeader.set(normalized, index);
    }
  });
  for (const candidate of candidates) {
    const index = indexByHeader.get(candidate.toLowerCase());
    if (index !== undefined) {
      return index;
    }
  }
  return -1;
}

export function rowsToTable(rows: string[][]): SheetTable {
  if (!rows.length) {
    return { headers: [], records: [] };
  }

  const headers = (rows[0] || []).map((value) => String(value || '').trim());
  const records: SheetRowRecord[] = [];

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const values = rows[rowIndex] || [];
    const record: Record<string, string> = {};
    let hasValue = false;

    for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
      const header = headers[columnIndex];
      if (!header) {
        continue;
      }
      const value = String(values[columnIndex] || '').trim();
      hasValue ||= Boolean(value);
      record[header] = value;
    }

    if (hasValue) {
      records.push({ rowNumber: rowIndex + 1, values, record });
    }
  }

  return { headers, records };
}

export function rowsToConfigMap(rows: string[][]): Record<string, string> {
  const map: Record<string, string> = {};
  if (!rows.length) {
    return map;
  }

  const firstRow = rows[0] || [];
  const hasHeader =
    firstRow.length >= 2 &&
    String(firstRow[0] || '')
      .trim()
      .toLowerCase() === 'key';
  for (let index = hasHeader ? 1 : 0; index < rows.length; index += 1) {
    const [keyRaw = '', valueRaw = ''] = rows[index] || [];
    const key = String(keyRaw || '').trim();
    if (key) {
      map[key] = String(valueRaw || '');
    }
  }
  return map;
}

export function rowsToCampaigns(rows: string[][]): Campaign[] {
  if (!rows.length) {
    return [];
  }

  const headers = (rows[0] || []).map((value) =>
    String(value || '')
      .trim()
      .toLowerCase()
  );
  const idIndex = headers.indexOf('id');
  const nameIndex = headers.indexOf('name');
  const typeIndex = headers.indexOf('type');
  const messageIndex = headers.indexOf('message');
  const showDoneProgramsIndex = headers.indexOf('showdoneprograms');
  if (idIndex < 0 || nameIndex < 0 || typeIndex < 0) {
    return [];
  }

  const campaigns: Campaign[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const id = String(row[idIndex] || '').trim();
    const name = String(row[nameIndex] || '').trim();
    const type = String(row[typeIndex] || '').trim() as Campaign['type'];
    if (!id || !name || (type !== 'Leads' && type !== 'Members')) {
      continue;
    }

    const campaign: Campaign = { id, name, type };
    const message = String(row[messageIndex] || '').trim();
    if (message) {
      campaign.message = message;
    }
    if (showDoneProgramsIndex >= 0) {
      const flag = String(row[showDoneProgramsIndex] || '')
        .trim()
        .toLowerCase();
      if (flag === 'true' || flag === 'false') {
        campaign.showDonePrograms = flag === 'true';
      }
    }
    campaigns.push(campaign);
  }

  return campaigns;
}
