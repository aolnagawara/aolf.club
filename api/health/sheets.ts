import {
  getApiDataStore,
  type ApiDataStore
} from '../_lib/storage/dataStore.js';
import { getSheetsEnv } from '../_lib/config/env.js';
import type { ApiRequest, ApiResponse } from '../_lib/http/responses.js';
import { getSheetLayout, type SheetLayout } from '../_lib/sheets/layout.js';
import {
  createSheetsOperation,
  readSheetValuesBatch,
  type SheetsOperation,
  type SpreadsheetTarget
} from '../_lib/sheets/client.js';
import { getTabName } from '../_lib/sheets/table.js';
import type { AuthorizationDiagnostics } from '../_lib/sheets/store.js';
import { readSessionUser, type SessionUser } from '../_lib/auth/session.js';
import { sendApiError } from '../_lib/http/errors.js';

const MAX_HEALTH_DATA_ROWS = 200;

type HealthDependencies = {
  readSessionUser: (req: ApiRequest) => Promise<SessionUser | null>;
  getApiDataStore: () => ApiDataStore;
  getSheetsEnv: typeof getSheetsEnv;
  getSheetLayout: () => SheetLayout;
  readSheetValuesBatch: (
    target: SpreadsheetTarget,
    ranges: readonly string[],
    operation?: SheetsOperation
  ) => Promise<string[][][]>;
};

function getHeaderRange(range: string): string {
  return getTabName(range) + '!1:1';
}

function getFirstColumnProbeRange(range: string): string {
  const separatorIndex = range.indexOf('!');
  const a1Range = separatorIndex >= 0 ? range.slice(separatorIndex + 1) : range;
  const firstColumn =
    a1Range.match(/^\$?([A-Za-z]+)/)?.[1]?.toUpperCase() || 'A';
  return (
    getTabName(range) +
    '!' +
    firstColumn +
    '1:' +
    firstColumn +
    String(MAX_HEALTH_DATA_ROWS + 1)
  );
}

function countDataRows(rows: string[][]): number {
  return rows
    .slice(1)
    .filter((row) => row.some((value) => String(value || '').trim().length > 0))
    .length;
}

export function createSheetsHealthHandler(
  overrides: Partial<HealthDependencies> = {}
) {
  const dependencies: HealthDependencies = {
    readSessionUser,
    getApiDataStore,
    getSheetsEnv,
    getSheetLayout,
    readSheetValuesBatch,
    ...overrides
  };

  async function loadDiagnostics(
    authorizationDiagnostics: AuthorizationDiagnostics | undefined,
    operation: SheetsOperation
  ) {
    const env = dependencies.getSheetsEnv();
    const layout = dependencies.getSheetLayout();
    const headerRanges = [
      getHeaderRange(layout.campaignsRange),
      getHeaderRange(layout.leadsRange),
      getHeaderRange(layout.membersRange)
    ];
    const dataProbes = [
      authorizationDiagnostics
        ? null
        : {
            key: 'campaignRows' as const,
            range: getFirstColumnProbeRange(layout.campaignsRange)
          },
      {
        key: 'leadRows' as const,
        range: getFirstColumnProbeRange(layout.leadsRange)
      },
      {
        key: 'memberRows' as const,
        range: getFirstColumnProbeRange(layout.membersRange)
      },
      {
        key: 'configRows' as const,
        range: getFirstColumnProbeRange(layout.configRange)
      }
    ].filter((probe): probe is NonNullable<typeof probe> => Boolean(probe));
    const accessProbes = authorizationDiagnostics
      ? []
      : [
          {
            key: 'allowedUserRows' as const,
            range: getFirstColumnProbeRange(layout.allowedUsersRange)
          }
        ];
    const [dataRows, accessRows] = await Promise.all([
      dependencies.readSheetValuesBatch(
        'data',
        [...headerRanges, ...dataProbes.map((probe) => probe.range)],
        operation
      ),
      accessProbes.length
        ? dependencies.readSheetValuesBatch(
            'access',
            accessProbes.map((probe) => probe.range),
            operation
          )
        : Promise.resolve([])
    ]);
    const [campaignHeader, leadHeader, memberHeader] = dataRows;
    const countRows: Record<string, number> = {};
    const truncated: Record<string, boolean> = {};
    dataProbes.forEach((probe, index) => {
      const rows = dataRows[headerRanges.length + index] || [];
      countRows[probe.key] = countDataRows(rows);
      truncated[probe.key] = rows.length >= MAX_HEALTH_DATA_ROWS + 1;
    });
    accessProbes.forEach((probe, index) => {
      const rows = accessRows[index] || [];
      countRows[probe.key] = countDataRows(rows);
      truncated[probe.key] = rows.length >= MAX_HEALTH_DATA_ROWS + 1;
    });

    return {
      dataSpreadsheetId: env.GOOGLE_SHEETS_DATA_SPREADSHEET_ID,
      accessSpreadsheetId: env.GOOGLE_SHEETS_ACCESS_SPREADSHEET_ID,
      tabs: {
        campaigns: getTabName(layout.campaignsRange),
        leads: getTabName(layout.leadsRange),
        members: getTabName(layout.membersRange),
        config: getTabName(layout.configRange),
        allowedUsers: getTabName(layout.allowedUsersRange)
      },
      headers: {
        campaigns: campaignHeader?.[0] || [],
        leads: leadHeader?.[0] || [],
        members: memberHeader?.[0] || []
      },
      counts: {
        campaignRows:
          authorizationDiagnostics?.campaignRows ?? countRows.campaignRows ?? 0,
        leadRows: countRows.leadRows ?? 0,
        memberRows: countRows.memberRows ?? 0,
        configRows: countRows.configRows ?? 0,
        allowedUserRows:
          authorizationDiagnostics?.allowedUserRows ??
          countRows.allowedUserRows ??
          0
      },
      countProbeLimit: MAX_HEALTH_DATA_ROWS,
      truncated
    };
  }

  return async function handler(req: ApiRequest, res: ApiResponse) {
    const context = {
      route: 'GET /api/health/sheets',
      action: 'verify_sheets_health',
      startedAt: Date.now(),
      messages: {
        timeout:
          'Google Sheets connectivity verification took too long. Please try again.',
        upstream:
          'Unable to verify Google Sheets connectivity. Please try again.',
        upstreamPermission:
          'Unable to verify Google Sheets access. Please contact an admin.',
        internal: 'Unable to verify Google Sheets connectivity.'
      }
    };

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return sendApiError(res, new Error('Method not allowed.'), context, {
        status: 405,
        code: 'METHOD_NOT_ALLOWED',
        message: 'Method not allowed.',
        retryable: false,
        category: 'method_not_allowed'
      });
    }

    const operation = createSheetsOperation();
    try {
      const user = await dependencies.readSessionUser(req);
      if (!user) {
        return sendApiError(
          res,
          new Error('Authentication required.'),
          context,
          {
            status: 401,
            code: 'UNAUTHENTICATED',
            message: 'Authentication required.',
            retryable: false,
            category: 'unauthenticated'
          }
        );
      }

      const authorization = await dependencies
        .getApiDataStore()
        .authorizeUser(user, operation);
      if (!authorization.allowed) {
        return sendApiError(
          res,
          new Error('Authorization denied.'),
          context,
          {
            status: 403,
            code: 'FORBIDDEN',
            message:
              'Your account is not authorized to view Sheets diagnostics.',
            retryable: false,
            category: 'authorization_denied'
          }
        );
      }

      return res.status(200).json({
        success: true,
        diagnostics: await loadDiagnostics(authorization.diagnostics, operation)
      });
    } catch (error) {
      return sendApiError(res, error, context);
    } finally {
      operation.dispose();
    }
  };
}

export default createSheetsHealthHandler();
