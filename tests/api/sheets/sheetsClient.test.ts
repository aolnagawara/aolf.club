import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockJwtRequest } = vi.hoisted(() => ({
  mockJwtRequest: vi.fn()
}));

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
    request = mockJwtRequest;
  }
}));

import {
  appendSheetRow,
  createSheetsOperation,
  SheetsRequestError,
  waitForSheetsOperation
} from '../../../api/_lib/sheets/client.js';

beforeEach(() => {
  mockJwtRequest.mockReset();
});

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
    mockJwtRequest.mockResolvedValue({ data: {} });

    await appendSheetRow('data', 'Leads!A:M', ['lead-1', 'Example Lead']);

    expect(mockJwtRequest).toHaveBeenCalledTimes(1);
    expect(mockJwtRequest).toHaveBeenCalledWith({
      url: 'https://sheets.googleapis.com/v4/spreadsheets/data-sheet-id/values/Leads!A%3AM:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
      method: 'POST',
      data: { values: [['lead-1', 'Example Lead']] },
      signal: expect.any(AbortSignal)
    });
  });

  it('classifies an authenticated request deadline as a retryable timeout', async () => {
    vi.useFakeTimers();
    mockJwtRequest.mockReturnValue(new Promise(() => undefined));
    const operation = createSheetsOperation(25);
    const result = appendSheetRow(
      'data',
      'Leads!A:M',
      ['lead-1'],
      operation
    ).catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(25);

    await expect(result).resolves.toMatchObject({
      name: 'SheetsRequestError',
      kind: 'timeout',
      target: 'data',
      action: 'values.append',
      retryable: true,
      timeoutStage: 'authenticated_request'
    });
    operation.dispose();
  });

  it('preserves safe Google status details without exposing the response object', async () => {
    mockJwtRequest.mockRejectedValue({
      response: {
        status: 503,
        data: {
          error: {
            status: 'UNAVAILABLE',
            message: 'Service temporarily unavailable.'
          }
        }
      },
      config: { url: 'https://sheets.googleapis.com/v4/spreadsheets/id' }
    });

    const error = await appendSheetRow(
      'data',
      'Leads!A:M',
      ['lead-1']
    ).catch((reason: unknown) => reason);

    expect(error).toEqual(expect.any(SheetsRequestError));
    expect(error).toMatchObject({
      kind: 'upstream',
      upstreamStatus: 503,
      retryable: true,
      safeUpstreamError:
        'UNAVAILABLE: Service temporarily unavailable.'
    });
  });
});
