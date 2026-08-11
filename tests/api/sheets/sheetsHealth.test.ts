import { describe, expect, it, vi } from 'vitest';
import { createSheetsHealthHandler } from '../../../api/health/sheets.js';
import type { ApiDataStore } from '../../../api/_lib/storage/dataStore.js';
import type { getSheetsEnv } from '../../../api/_lib/config/env.js';
import type {
  ApiRequest,
  ApiResponse
} from '../../../api/_lib/http/responses.js';
import type { SpreadsheetTarget } from '../../../api/_lib/sheets/client.js';

const USER = { id: 'user-1', email: 'volunteer@example.com' };
const REQUEST: ApiRequest = { method: 'GET', headers: {}, query: {} };
const LAYOUT = {
  campaignsRange: 'Campaigns!A:F',
  leadsRange: 'Leads!A:Z',
  membersRange: 'Members!A:Z',
  configRange: 'Config!A:B',
  allowedUsersRange: 'AllowedUsers!A:Z'
};

function createResponse() {
  const state: { statusCode: number; body: unknown } = {
    statusCode: 0,
    body: undefined
  };
  const headers = new Map<string, number | string | string[]>();
  const response: ApiResponse = {
    status(code) {
      state.statusCode = code;
      return response;
    },
    json(body) {
      state.body = body;
      return response;
    },
    setHeader(name, value) {
      headers.set(name, value);
    },
    getHeader(name) {
      return headers.get(name);
    },
    end() {}
  };
  return { response, state };
}

function createDataStore(
  allowed: boolean,
  diagnostics?: { campaignRows: number; allowedUserRows: number }
): ApiDataStore {
  return {
    authorizeUser: vi.fn(async () => ({ allowed, diagnostics })),
    isUserAllowed: vi.fn(async () => allowed)
  } as unknown as ApiDataStore;
}

describe('Sheets health endpoint access and diagnostics', () => {
  it('does not perform diagnostics for an unauthenticated request', async () => {
    const readBatch = vi.fn();
    const getDataStore = vi.fn();
    const handler = createSheetsHealthHandler({
      readSessionUser: vi.fn(async () => null),
      getApiDataStore: getDataStore,
      readSheetValuesBatch: readBatch
    });
    const { response, state } = createResponse();

    await handler(REQUEST, response);

    expect(state.statusCode).toBe(401);
    expect(getDataStore).not.toHaveBeenCalled();
    expect(readBatch).not.toHaveBeenCalled();
  });

  it('does not perform diagnostics for a user outside the allowlist', async () => {
    const readBatch = vi.fn();
    const handler = createSheetsHealthHandler({
      readSessionUser: vi.fn(async () => USER),
      getApiDataStore: () => createDataStore(false),
      readSheetValuesBatch: readBatch
    });
    const { response, state } = createResponse();

    await handler(REQUEST, response);

    expect(state.statusCode).toBe(403);
    expect(readBatch).not.toHaveBeenCalled();
  });

  it('returns correct non-empty row counts on each request', async () => {
    const dataStore = createDataStore(true, {
      campaignRows: 2,
      allowedUserRows: 2
    });
    const readBatch = vi.fn(
      async (
        target: SpreadsheetTarget,
        ranges: readonly string[]
      ): Promise<string[][][]> => {
        expect(ranges.length).toBeGreaterThan(0);
        expect(target).toBe('data');
        expect(ranges.every((range) => !/[A-Z]:[A-Z]$/.test(range))).toBe(true);
        return [
          [['id', 'name', 'type']],
          [['id', 'name']],
          [['id', 'name']],
          [['id'], ['lead-a'], ['lead-b']],
          [['id'], ['member-a']],
          [['key'], ['campaignId'], ['programs'], ['allowedUsers']]
        ];
      }
    );
    const handler = createSheetsHealthHandler({
      readSessionUser: vi.fn(async () => USER),
      getApiDataStore: () => dataStore,
      getSheetsEnv: () =>
        ({
          GOOGLE_SHEETS_DATA_SPREADSHEET_ID: 'data-sheet',
          GOOGLE_SHEETS_ACCESS_SPREADSHEET_ID: 'access-sheet'
        }) as ReturnType<typeof getSheetsEnv>,
      getSheetLayout: () => LAYOUT,
      readSheetValuesBatch: readBatch
    });

    const first = createResponse();
    const second = createResponse();
    await handler(REQUEST, first.response);
    await handler(REQUEST, second.response);

    expect(first.state.statusCode).toBe(200);
    expect(first.state.body).toMatchObject({
      success: true,
      diagnostics: {
        counts: {
          campaignRows: 2,
          leadRows: 2,
          memberRows: 1,
          configRows: 3,
          allowedUserRows: 2
        }
      }
    });
    expect(second.state.body).toEqual(first.state.body);
    expect(readBatch).toHaveBeenCalledTimes(2);
  });
});
