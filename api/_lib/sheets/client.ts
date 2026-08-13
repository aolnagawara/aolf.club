import { JWT } from 'google-auth-library';
import {
  buildGoogleSheetsAppendUrl,
  buildGoogleSheetsValuesUrl
} from '../../../shared/contracts/googleSheetsUrls.mjs';
import { getSheetsEnv } from '../config/env.js';

export type SpreadsheetTarget = 'data' | 'access';

type SheetsValuesResponse = {
  values?: string[][];
};

type SheetsBatchValuesResponse = {
  valueRanges?: Array<{
    values?: string[][];
  }>;
};

type SheetsBatchUpdate = {
  range: string;
  values: string[][];
};

const SHEETS_OPERATION_TIMEOUT_MS = 10_000;

export type SheetsOperation = {
  signal: AbortSignal;
  dispose: () => void;
};

export function createSheetsOperation(
  timeoutMs = SHEETS_OPERATION_TIMEOUT_MS
): SheetsOperation {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(
      new Error(
        'Google Sheets API operation timed out after ' +
          String(timeoutMs) +
          'ms.'
      )
    );
  }, timeoutMs);

  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeout);
    }
  };
}

let jwtClient: JWT | null = null;

function getJwtClient() {
  if (jwtClient) {
    return jwtClient;
  }

  const env = getSheetsEnv();
  const privateKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(
    /\\n/g,
    '\n'
  );

  jwtClient = new JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  return jwtClient;
}

function getSpreadsheetId(target: SpreadsheetTarget) {
  const env = getSheetsEnv();
  return target === 'access'
    ? env.GOOGLE_SHEETS_ACCESS_SPREADSHEET_ID
    : env.GOOGLE_SHEETS_DATA_SPREADSHEET_ID;
}

function buildValuesUrl(target: SpreadsheetTarget, range: string, query = '') {
  return buildGoogleSheetsValuesUrl(getSpreadsheetId(target), range, query);
}

function buildBatchValuesUrl(
  target: SpreadsheetTarget,
  ranges: readonly string[]
) {
  const spreadsheetId = getSpreadsheetId(target);
  const query = new URLSearchParams({ majorDimension: 'ROWS' });
  ranges.forEach((range) => query.append('ranges', range));
  return (
    'https://sheets.googleapis.com/v4/spreadsheets/' +
    spreadsheetId +
    '/values:batchGet?' +
    query
  );
}

function buildBatchUpdateUrl(target: SpreadsheetTarget) {
  return (
    'https://sheets.googleapis.com/v4/spreadsheets/' +
    getSpreadsheetId(target) +
    '/values:batchUpdate'
  );
}

function buildSpreadsheetBatchUpdateUrl(target: SpreadsheetTarget) {
  return (
    'https://sheets.googleapis.com/v4/spreadsheets/' +
    getSpreadsheetId(target) +
    ':batchUpdate'
  );
}

async function parseResponseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

export function waitForSheetsOperation<T>(
  promise: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }

  return new Promise<T>((resolve, reject) => {
    const handleAbort = () => reject(signal.reason);
    signal.addEventListener('abort', handleAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', handleAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', handleAbort);
        reject(error);
      }
    );
  });
}

async function callSheetsApi(
  url: string,
  init: RequestInit,
  operation?: SheetsOperation
): Promise<unknown> {
  const ownedOperation = operation ? null : createSheetsOperation();
  const activeOperation = operation || ownedOperation!;

  try {
    const client = getJwtClient();
    const token = await waitForSheetsOperation(
      client.getAccessToken(),
      activeOperation.signal
    );
    const accessToken = typeof token === 'string' ? token : token?.token;
    if (!accessToken) {
      throw new Error(
        'Unable to obtain Service Account access token for Google Sheets API.'
      );
    }

    const res = await fetch(url, {
      ...init,
      signal: activeOperation.signal,
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        ...(init.headers || {})
      }
    });

    if (!res.ok) {
      const body = await parseResponseJson(res);
      throw new Error(
        'Google Sheets API error (' +
          String(res.status) +
          '): ' +
          JSON.stringify(body)
      );
    }

    return await parseResponseJson(res);
  } catch (error) {
    if (activeOperation.signal.aborted) {
      const reason = activeOperation.signal.reason;
      throw reason instanceof Error
        ? reason
        : new Error('Google Sheets API operation timed out.');
    }
    throw error;
  } finally {
    ownedOperation?.dispose();
  }
}

export async function readSheetValues(
  target: SpreadsheetTarget,
  range: string,
  operation?: SheetsOperation
): Promise<string[][]> {
  const url = buildValuesUrl(target, range);
  const payload = (await callSheetsApi(
    url,
    {
      method: 'GET'
    },
    operation
  )) as SheetsValuesResponse;
  return Array.isArray(payload.values) ? payload.values : [];
}

export async function readSheetValuesBatch(
  target: SpreadsheetTarget,
  ranges: readonly string[],
  operation?: SheetsOperation
): Promise<string[][][]> {
  if (!ranges.length) {
    return [];
  }

  const payload = (await callSheetsApi(
    buildBatchValuesUrl(target, ranges),
    {
      method: 'GET'
    },
    operation
  )) as SheetsBatchValuesResponse;
  const valueRanges = Array.isArray(payload.valueRanges)
    ? payload.valueRanges
    : [];
  return ranges.map((_, index) => {
    const values = valueRanges[index]?.values;
    return Array.isArray(values) ? values : [];
  });
}

export async function updateSheetValuesBatch(
  target: SpreadsheetTarget,
  updates: readonly SheetsBatchUpdate[],
  operation?: SheetsOperation
) {
  if (!updates.length) {
    return;
  }

  await callSheetsApi(
    buildBatchUpdateUrl(target),
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data: updates
      })
    },
    operation
  );
}

export async function appendSheetRow(
  target: SpreadsheetTarget,
  range: string,
  rowValues: string[],
  operation?: SheetsOperation
) {
  const url = buildGoogleSheetsAppendUrl(
    getSpreadsheetId(target),
    range,
    'valueInputOption=RAW&insertDataOption=INSERT_ROWS'
  );
  await callSheetsApi(
    url,
    {
      method: 'POST',
      body: JSON.stringify({ values: [rowValues] })
    },
    operation
  );
}

export async function deleteSheetRow(
  target: SpreadsheetTarget,
  sheetName: string,
  rowNumber: number,
  operation?: SheetsOperation
) {
  const spreadsheet = (await callSheetsApi(
    'https://sheets.googleapis.com/v4/spreadsheets/' +
      getSpreadsheetId(target) +
      '?fields=sheets.properties',
    { method: 'GET' },
    operation
  )) as {
    sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
  };
  const sheetId = spreadsheet.sheets?.find(
    (sheet) => sheet.properties?.title === sheetName
  )?.properties?.sheetId;
  if (sheetId === undefined) {
    throw new Error('Sheet not found: ' + sheetName);
  }

  await callSheetsApi(
    buildSpreadsheetBatchUpdateUrl(target),
    {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: rowNumber - 1,
                endIndex: rowNumber
              }
            }
          }
        ]
      })
    },
    operation
  );
}
