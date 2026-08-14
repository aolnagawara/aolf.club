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

export type SheetsRequestAction =
  | 'values.get'
  | 'values.batchGet'
  | 'values.batchUpdate'
  | 'values.append'
  | 'spreadsheets.get'
  | 'spreadsheets.batchUpdate';

export type SheetsFailureKind =
  | 'timeout'
  | 'authentication'
  | 'permission'
  | 'network'
  | 'upstream';

export class SheetsRequestError extends Error {
  constructor(
    message: string,
    public readonly kind: SheetsFailureKind,
    public readonly target: SpreadsheetTarget,
    public readonly action: SheetsRequestAction,
    public readonly durationMs: number,
    public readonly retryable: boolean,
    public readonly upstreamStatus?: number,
    public readonly safeUpstreamError?: string,
    public readonly timeoutStage?: 'authenticated_request',
    cause?: unknown
  ) {
    super(message, { cause });
    this.name = 'SheetsRequestError';
  }
}

export type SheetsOperation = {
  signal: AbortSignal;
  timeoutMs: number;
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
    timeoutMs,
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

function readErrorRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function getUpstreamStatus(error: unknown): number | undefined {
  const response = readErrorRecord(readErrorRecord(error)?.response);
  return typeof response?.status === 'number' ? response.status : undefined;
}

function getErrorCode(error: unknown): string {
  const code = readErrorRecord(error)?.code;
  return typeof code === 'string' ? code : '';
}

function getErrorRequestUrl(error: unknown): string {
  const config = readErrorRecord(readErrorRecord(error)?.config);
  const url = config?.url;
  return url instanceof URL ? url.toString() : typeof url === 'string' ? url : '';
}

function getSafeUpstreamError(error: unknown): string | undefined {
  const response = readErrorRecord(readErrorRecord(error)?.response);
  const data = readErrorRecord(response?.data);
  const nestedError = readErrorRecord(data?.error);
  const status = nestedError?.status;
  const message = nestedError?.message;
  const parts = [
    typeof status === 'string' ? status : '',
    typeof message === 'string' ? message : ''
  ].filter(Boolean);
  return parts.length ? parts.join(': ').slice(0, 300) : undefined;
}

function classifySheetsFailure(
  error: unknown,
  upstreamStatus: number | undefined
): { kind: SheetsFailureKind; retryable: boolean } {
  const requestUrl = getErrorRequestUrl(error);
  if (
    requestUrl.includes('oauth2.googleapis.com') ||
    requestUrl.includes('accounts.google.com')
  ) {
    return { kind: 'authentication', retryable: false };
  }
  if (upstreamStatus === 401 || upstreamStatus === 403) {
    return { kind: 'permission', retryable: false };
  }
  if (upstreamStatus !== undefined) {
    return {
      kind: 'upstream',
      retryable: upstreamStatus === 429 || upstreamStatus >= 500
    };
  }

  const code = getErrorCode(error).toUpperCase();
  if (
    code === 'ENOTFOUND' ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    error instanceof TypeError
  ) {
    return { kind: 'network', retryable: true };
  }
  return { kind: 'upstream', retryable: false };
}

async function callSheetsApi<T>(
  target: SpreadsheetTarget,
  action: SheetsRequestAction,
  url: string,
  init: { method: 'GET' | 'POST'; data?: unknown },
  operation?: SheetsOperation
): Promise<T> {
  const ownedOperation = operation ? null : createSheetsOperation();
  const activeOperation = operation || ownedOperation!;
  const startedAt = Date.now();

  try {
    const client = getJwtClient();
    const response = await waitForSheetsOperation(
      client.request<T>({
        url,
        method: init.method,
        data: init.data,
        signal: activeOperation.signal
      }),
      activeOperation.signal
    );
    return response.data;
  } catch (error) {
    if (activeOperation.signal.aborted) {
      throw new SheetsRequestError(
        'Google Sheets authenticated request timed out.',
        'timeout',
        target,
        action,
        Date.now() - startedAt,
        true,
        undefined,
        undefined,
        'authenticated_request',
        activeOperation.signal.reason
      );
    }
    const upstreamStatus = getUpstreamStatus(error);
    const classification = classifySheetsFailure(error, upstreamStatus);
    throw new SheetsRequestError(
      'Google Sheets authenticated request failed.',
      classification.kind,
      target,
      action,
      Date.now() - startedAt,
      classification.retryable,
      upstreamStatus,
      getSafeUpstreamError(error),
      undefined,
      error
    );
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
  const payload = await callSheetsApi<SheetsValuesResponse>(
    target,
    'values.get',
    url,
    {
      method: 'GET'
    },
    operation
  );
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

  const payload = await callSheetsApi<SheetsBatchValuesResponse>(
    target,
    'values.batchGet',
    buildBatchValuesUrl(target, ranges),
    {
      method: 'GET'
    },
    operation
  );
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
    target,
    'values.batchUpdate',
    buildBatchUpdateUrl(target),
    {
      method: 'POST',
      data: {
        valueInputOption: 'RAW',
        data: updates
      }
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
    target,
    'values.append',
    url,
    {
      method: 'POST',
      data: { values: [rowValues] }
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
  const spreadsheet = await callSheetsApi<{
    sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
  }>(
    target,
    'spreadsheets.get',
    'https://sheets.googleapis.com/v4/spreadsheets/' +
      getSpreadsheetId(target) +
      '?fields=sheets.properties',
    { method: 'GET' },
    operation
  );
  const sheetId = spreadsheet.sheets?.find(
    (sheet) => sheet.properties?.title === sheetName
  )?.properties?.sheetId;
  if (sheetId === undefined) {
    throw new Error('Sheet not found: ' + sheetName);
  }

  await callSheetsApi(
    target,
    'spreadsheets.batchUpdate',
    buildSpreadsheetBatchUpdateUrl(target),
    {
      method: 'POST',
      data: {
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
      }
    },
    operation
  );
}
