import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/_lib/config/env.js', () => ({
  getSheetsEnv: () => ({
    GOOGLE_SHEETS_DATA_SPREADSHEET_ID: 'data-sheet-id',
    GOOGLE_SHEETS_ACCESS_SPREADSHEET_ID: 'access-sheet-id',
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'service@example.com',
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: 'private-key'
  })
}));

vi.mock('google-auth-library', () => ({
  JWT: class {
    async getAccessToken() {
      return 'access-token';
    }
  }
}));

import {
  appendSheetRow,
  createSheetsOperation,
  waitForSheetsOperation
} from '../../../api/_lib/sheets/client.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Sheets operation deadline', () => {
  it('applies one deadline to every awaited phase of an operation', async () => {
    vi.useFakeTimers();
    const operation = createSheetsOperation(25);
    const neverCompletes = new Promise<never>(() => undefined);
    const result = waitForSheetsOperation(
      neverCompletes,
      operation.signal
    ).catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(25);

    await expect(result).resolves.toMatchObject({
      message: 'Google Sheets API operation timed out after 25ms.'
    });
    operation.dispose();
  });

  it('uses the Google Sheets :append endpoint for inserted rows', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await appendSheetRow('data', 'Leads!A:M', ['lead-1', 'Example Lead']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://sheets.googleapis.com/v4/spreadsheets/data-sheet-id/values/Leads!A%3AM:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS'
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ values: [['lead-1', 'Example Lead']] })
    });
  });
});
