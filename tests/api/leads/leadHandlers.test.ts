import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type {
  ApiRequest,
  ApiResponse
} from '../../../api/_lib/http/responses.js';

const { mockReadSessionUser, mockStore, mockLoadImportSheetRows } = vi.hoisted(
  () => ({
    mockReadSessionUser: vi.fn(),
    mockLoadImportSheetRows: vi.fn(),
    mockStore: {
      createLeadForAuthorizedUser: vi.fn(),
      updateLeadForAuthorizedUser: vi.fn(),
      deleteLeadForAuthorizedUser: vi.fn(),
      importLeadsForAuthorizedUser: vi.fn()
    }
  })
);

vi.mock('../../../api/_lib/auth/session.js', () => ({
  readSessionUser: mockReadSessionUser
}));

vi.mock('../../../api/_lib/storage/dataStore.js', () => ({
  getApiDataStore: () => mockStore
}));

vi.mock('../../../api/_lib/leads/importSheet.js', () => ({
  loadImportSheetRows: mockLoadImportSheetRows
}));

import { DUPLICATE_LEAD_MOBILE_MESSAGE } from '../../../shared/contracts/appContracts.js';
import leadHandler from '../../../api/leads/index.js';
import {
  LeadImportError,
  SHEET_SHARE_MESSAGE
} from '../../../shared/contracts/leadImport.js';

function createResponse() {
  const state: { statusCode: number; body: unknown } = {
    statusCode: 0,
    body: undefined
  };
  const response: ApiResponse = {
    status(code) {
      state.statusCode = code;
      return response;
    },
    json(body) {
      state.body = body;
      return response;
    },
    setHeader() {},
    getHeader() {
      return undefined;
    },
    end() {}
  };
  return { response, state };
}

describe('lead API error classification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadSessionUser.mockResolvedValue({
      id: 'user-1',
      email: 'volunteer@example.com'
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('keeps schema failures as create validation errors', async () => {
    let validationError: unknown;
    try {
      z.string().min(1).parse('');
    } catch (error) {
      validationError = error;
    }
    mockStore.createLeadForAuthorizedUser.mockRejectedValue(validationError);
    const { response, state } = createResponse();

    await leadHandler(
      { method: 'POST', headers: {}, query: {}, body: {} },
      response
    );

    expect(state).toMatchObject({
      statusCode: 400,
      body: {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid record details.',
          retryable: false,
          traceId: expect.any(String)
        }
      }
    });
    expect(console.error).toHaveBeenCalledOnce();
  });

  it('reports unexpected create failures as internal errors', async () => {
    mockStore.createLeadForAuthorizedUser.mockRejectedValue(
      new Error('Lead sheet is missing header row.')
    );
    const { response, state } = createResponse();

    await leadHandler(
      { method: 'POST', headers: {}, query: {}, body: {} },
      response
    );

    expect(state.statusCode).toBe(500);
    expect(state.body).toMatchObject({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to save the record.',
        retryable: false,
        traceId: expect.any(String)
      }
    });
    expect(console.error).toHaveBeenCalledOnce();
  });

  it('reports a duplicate lead mobile as a validation error', async () => {
    mockStore.createLeadForAuthorizedUser.mockRejectedValue(
      new Error(DUPLICATE_LEAD_MOBILE_MESSAGE)
    );
    const { response, state } = createResponse();

    await leadHandler(
      { method: 'POST', headers: {}, query: {}, body: {} },
      response
    );

    expect(state.statusCode).toBe(400);
    expect(state.body).toMatchObject({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: DUPLICATE_LEAD_MOBILE_MESSAGE,
        retryable: false
      }
    });
  });

  it('reports unexpected update failures as internal errors', async () => {
    mockStore.updateLeadForAuthorizedUser.mockRejectedValue(
      new Error('Lead sheet is missing header row.')
    );
    const request: ApiRequest = {
      method: 'PUT',
      headers: {},
      query: { id: 'lead-1' },
      body: {}
    };
    const { response, state } = createResponse();

    await leadHandler(request, response);

    expect(state.statusCode).toBe(500);
    expect(state.body).toMatchObject({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to save lead changes.',
        retryable: false,
        traceId: expect.any(String)
      }
    });
    expect(console.error).toHaveBeenCalledOnce();
  });
});

describe('lead import API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadSessionUser.mockResolvedValue({
      id: 'user-1',
      email: 'volunteer@example.com'
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('imports rows from the sheet and returns the signed-in assignee', async () => {
    mockLoadImportSheetRows.mockResolvedValue([
      ['Name', 'Mobile', 'Assigned To'],
      ['Ravi Kumar', '9123456789', 'someone@else.com']
    ]);
    mockStore.importLeadsForAuthorizedUser.mockResolvedValue({
      allowed: true,
      value: {
        success: true,
        outcome: 'imported',
        importedCount: 1,
        skippedCount: 0,
        invalidCount: 0,
        missingColumns: [],
        leads: [
          {
            id: 'importedLeadId0000001',
            name: 'Ravi Kumar',
            mobile: '9123456789',
            assignedVolunteerEmail: 'volunteer@example.com',
            notes: 'Assigned To: someone@else.com',
            campaignId: 'cmpLeads01AbcDefGhIJk',
            campaignType: 'Leads'
          }
        ]
      }
    });
    const { response, state } = createResponse();

    await leadHandler(
      {
        method: 'POST',
        headers: {},
        query: { action: 'import' },
        body: {
          sheetUrl:
            'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abc/edit',
          campaignId: 'cmpLeads01AbcDefGhIJk'
        }
      },
      response
    );

    expect(mockLoadImportSheetRows).toHaveBeenCalledOnce();
    expect(mockStore.importLeadsForAuthorizedUser).toHaveBeenCalledWith(
      { id: 'user-1', email: 'volunteer@example.com' },
      {
        campaignId: 'cmpLeads01AbcDefGhIJk',
        rows: [
          ['Name', 'Mobile', 'Assigned To'],
          ['Ravi Kumar', '9123456789', 'someone@else.com']
        ]
      }
    );
    expect(state.statusCode).toBe(200);
    expect(state.body).toMatchObject({
      importedCount: 1,
      leads: [
        expect.objectContaining({
          assignedVolunteerEmail: 'volunteer@example.com'
        })
      ]
    });
  });

  it('rejects a link that is not a Google Sheet', async () => {
    const { response, state } = createResponse();

    await leadHandler(
      {
        method: 'POST',
        headers: {},
        query: { action: 'import' },
        body: {
          sheetUrl: 'https://example.com/sheet',
          campaignId: 'cmpLeads01AbcDefGhIJk'
        }
      },
      response
    );

    expect(mockLoadImportSheetRows).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(400);
    expect(state.body).toMatchObject({
      success: false,
      error: { message: 'Paste a Google Sheets link.' }
    });
  });

  it('returns the share message when the sheet cannot be read', async () => {
    mockLoadImportSheetRows.mockRejectedValue(
      new LeadImportError('SHEET_NOT_READABLE', SHEET_SHARE_MESSAGE)
    );
    const { response, state } = createResponse();

    await leadHandler(
      {
        method: 'POST',
        headers: {},
        query: { action: 'import' },
        body: {
          sheetUrl:
            'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abc/edit',
          campaignId: 'cmpLeads01AbcDefGhIJk'
        }
      },
      response
    );

    expect(state.statusCode).toBe(400);
    expect(state.body).toMatchObject({
      success: false,
      error: { message: SHEET_SHARE_MESSAGE }
    });
  });
});
