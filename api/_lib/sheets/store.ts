import {
  AppConfigSchema,
  BootstrapResponseSchema,
  CreateCourseRequestSchema,
  CreateCourseResponseSchema,
  CreateLeadRequestSchema,
  CreateLeadResponseSchema,
  DeleteCourseRequestSchema,
  DeleteCourseResponseSchema,
  DeleteLeadRequestSchema,
  DeleteLeadResponseSchema,
  LeadSchema,
  ListCoursesResponseSchema,
  UpdateCourseRequestSchema,
  UpdateCourseResponseSchema,
  UpdateLeadRequestSchema,
  UpdateLeadResponseSchema,
  type AppConfig,
  type BootstrapResponse,
  type Campaign,
  type Course,
  type CreateCourseResponse,
  type CreateLeadResponse,
  type DeleteCourseResponse,
  type DeleteLeadResponse,
  type Lead,
  type ListCoursesResponse,
  type UpdateCourseResponse,
  type UpdateLeadRequest,
  type UpdateLeadResponse
} from '../../../shared/contracts/appContracts.js';
import { nanoid } from 'nanoid';
import {
  defaultCourseTemplates,
  pickPublicCourseByKey
} from '../../../shared/contracts/courseDefaults.mjs';
import { normalizeEmail } from '../http/normalization.js';
import {
  applyCourseDefaults,
  courseFromRow,
  courseToRow,
  resolveCourseIdColumn,
  templatesFromRows,
  toCourseResponse,
  type CourseRecord
} from '../courses/sheetMapping.js';
import { createBlobPamphletStore } from '../courses/blobPamphlet.js';
import {
  decodePamphletBase64,
  type PamphletStore
} from '../courses/pamphletStore.js';
import {
  getSheetLayout as defaultGetSheetLayout,
  type SheetLayout
} from './layout.js';
import {
  columnLabel,
  findHeaderIndex,
  getTabName,
  parseJsonValue,
  rowsToCampaigns,
  rowsToConfigMap
} from './table.js';
import {
  appendSheetRow as defaultAppendSheetRow,
  createSheetsOperation,
  deleteSheetRow as defaultDeleteSheetRow,
  readSheetValues as defaultReadSheetValues,
  readSheetValuesBatch as defaultReadSheetValuesBatch,
  updateSheetValuesBatch as defaultUpdateSheetValuesBatch,
  type SheetsOperation,
  type SpreadsheetTarget
} from './client.js';
import type { SessionUser } from '../auth/session.js';

const ASSIGNED_VOLUNTEER_EMAIL_HEADERS = [
  'assignedVolunteerEmail',
  'volunteerEmail',
  'assignedToEmail',
  'assignedTo',
  'ownerEmail'
] as const;
const ALLOWED_USERS_EMAIL_HEADERS = [
  'email',
  'volunteerEmail',
  'volunteer_email'
] as const;
const LEAD_ID_HEADERS = ['id'] as const;
const LEAD_MOBILE_HEADERS = ['mobile', 'phone'] as const;
const CAMPAIGN_ID_HEADERS = ['campaignId', 'campaign_id'] as const;
const CAMPAIGN_TYPE_HEADERS = ['campaignType', 'campaign_type'] as const;

type ReadSheetValues = (
  target: SpreadsheetTarget,
  range: string,
  operation?: SheetsOperation
) => Promise<string[][]>;
type ReadSheetValuesBatch = (
  target: SpreadsheetTarget,
  ranges: readonly string[],
  operation?: SheetsOperation
) => Promise<string[][][]>;
type SheetValueUpdate = { range: string; values: string[][] };
type UpdateSheetValuesBatch = (
  target: SpreadsheetTarget,
  updates: readonly SheetValueUpdate[],
  operation?: SheetsOperation
) => Promise<void>;
type AppendSheetRow = (
  target: SpreadsheetTarget,
  range: string,
  rowValues: string[],
  operation?: SheetsOperation
) => Promise<void>;
type DeleteSheetRow = (
  target: SpreadsheetTarget,
  sheetName: string,
  rowNumber: number,
  operation?: SheetsOperation
) => Promise<void>;

export type SheetsStoreDependencies = {
  readSheetValues?: ReadSheetValues;
  readSheetValuesBatch?: ReadSheetValuesBatch;
  updateSheetValuesBatch?: UpdateSheetValuesBatch;
  appendSheetRow?: AppendSheetRow;
  deleteSheetRow?: DeleteSheetRow;
  getSheetLayout?: () => SheetLayout;
  now?: () => Date;
  pamphletStore?: PamphletStore;
};

export type AuthorizedStoreResult<T> =
  { allowed: true; value: T } | { allowed: false };

type MetadataSnapshot = {
  config: AppConfig;
  defaultCampaignId: string;
  allowedUsers: Set<string>;
  volunteers: Array<{ email: string; name: string }>;
  diagnostics: AuthorizationDiagnostics;
};

export type AuthorizationDiagnostics = {
  campaignRows: number;
  allowedUserRows: number;
};

export type StoreAuthorizationResult = {
  allowed: boolean;
  diagnostics?: AuthorizationDiagnostics;
};

type LeadColumnMap = {
  id: number;
  mobile: number;
  name: number;
  quality: number;
  followUp: number;
  lastUpdated: number;
  status: number;
  notes: number;
  campaignId: number;
  campaignType: number;
  assignedVolunteerEmail: number;
  wishlistPrograms: number;
  donePrograms: number;
};

function parseEmailCell(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(/[\n,;]+/)
    .map((value) => normalizeEmail(value))
    .filter(Boolean);
}

function splitCsv(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return String(raw)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function toCsv(raw: string | string[] | undefined): string {
  const values = Array.isArray(raw) ? raw : splitCsv(raw);
  return values
    .map((value) => String(value).trim())
    .filter(Boolean)
    .filter((value, index, allValues) => allValues.indexOf(value) === index)
    .join(',');
}

function parseOptionalBoolean(raw: string | undefined): boolean | undefined {
  const value = String(raw || '')
    .trim()
    .toLowerCase();
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return undefined;
}

function resolveLeadColumns(headers: string[]): LeadColumnMap {
  const id = findHeaderIndex(headers, LEAD_ID_HEADERS);
  const mobile = findHeaderIndex(headers, LEAD_MOBILE_HEADERS);
  return {
    id,
    mobile,
    name: findHeaderIndex(headers, ['name']),
    quality: findHeaderIndex(headers, ['quality']),
    followUp: findHeaderIndex(headers, ['followUp']),
    lastUpdated: findHeaderIndex(headers, ['lastUpdated']),
    status: findHeaderIndex(headers, ['status']),
    notes: findHeaderIndex(headers, ['notes']),
    campaignId: findHeaderIndex(headers, CAMPAIGN_ID_HEADERS),
    campaignType: findHeaderIndex(headers, CAMPAIGN_TYPE_HEADERS),
    assignedVolunteerEmail: findHeaderIndex(
      headers,
      ASSIGNED_VOLUNTEER_EMAIL_HEADERS
    ),
    wishlistPrograms: findHeaderIndex(headers, ['wishlistPrograms']),
    donePrograms: findHeaderIndex(headers, ['donePrograms'])
  };
}

function getCell(row: string[], columnIndex: number): string {
  return columnIndex >= 0 ? String(row[columnIndex] || '').trim() : '';
}

function countNonEmptyDataRows(rows: string[][]): number {
  return rows
    .slice(1)
    .filter((row) => row.some((value) => String(value || '').trim())).length;
}

function buildAppConfig(
  rawConfig: Record<string, string>,
  campaigns: Campaign[]
): AppConfig {
  return AppConfigSchema.parse({
    id: rawConfig.id || 'cfgMain01AbcDefGhIJK9',
    campaigns,
    programs: parseJsonValue(rawConfig.programs, []),
    programDisplayOrder: parseJsonValue(rawConfig.programDisplayOrder, []),
    showDonePrograms: parseOptionalBoolean(rawConfig.showDonePrograms),
    uiByType: parseJsonValue(rawConfig.uiByType, undefined),
    qualityMetaMap: parseJsonValue(rawConfig.qualityMetaMap, undefined),
    statusIconMap: parseJsonValue(rawConfig.statusIconMap, undefined),
    defaultStatusIcon: rawConfig.defaultStatusIcon,
    defaultCampaignMessage: rawConfig.defaultCampaignMessage,
    whatsappCountryCode: rawConfig.whatsappCountryCode,
    allowedUsers: []
  });
}

function buildAllowedUsers(rows: string[][]): Set<string> {
  const headers = (rows[0] || []).map((value) => String(value || '').trim());
  const emailColumnIndex = ALLOWED_USERS_EMAIL_HEADERS.map((candidate) =>
    headers.findIndex(
      (header) => header.toLowerCase() === candidate.toLowerCase()
    )
  ).find((index) => index >= 0);
  const resolvedEmailColumnIndex = emailColumnIndex ?? -1;
  const startIndex = resolvedEmailColumnIndex >= 0 ? 1 : 0;
  const emails = new Set<string>();

  for (let index = startIndex; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const cell =
      resolvedEmailColumnIndex >= 0
        ? row[resolvedEmailColumnIndex] || ''
        : row[0] || '';
    parseEmailCell(cell).forEach((email) => emails.add(email));
  }

  return emails;
}

function getVolunteerFallbackName(email: string): string {
  const localPart = email.split('@')[0] || 'Volunteer';
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildAllowedVolunteers(
  rows: string[][],
  allowedUsers: Set<string>
): Array<{ email: string; name: string }> {
  const namesByEmail = new Map<string, string>();
  const headers = (rows[0] || []).map((value) => String(value || '').trim());
  const emailColumnIndex = ALLOWED_USERS_EMAIL_HEADERS.map((candidate) =>
    headers.findIndex(
      (header) => header.toLowerCase() === candidate.toLowerCase()
    )
  ).find((index) => index >= 0);
  const nameColumnIndex = ['name', 'volunteerName', 'fullName']
    .map((candidate) =>
      headers.findIndex(
        (header) => header.toLowerCase() === candidate.toLowerCase()
      )
    )
    .find((index) => index >= 0);
  const resolvedEmailColumnIndex = emailColumnIndex ?? -1;
  const resolvedNameColumnIndex = nameColumnIndex ?? -1;
  const startIndex = resolvedEmailColumnIndex >= 0 ? 1 : 0;

  for (let index = startIndex; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const emailCell =
      resolvedEmailColumnIndex >= 0
        ? row[resolvedEmailColumnIndex] || ''
        : row[0] || '';
    const name =
      resolvedNameColumnIndex >= 0
        ? String(row[resolvedNameColumnIndex] || '').trim()
        : '';
    parseEmailCell(emailCell).forEach((email) => {
      namesByEmail.set(email, name || getVolunteerFallbackName(email));
    });
  }

  return [...allowedUsers].map((email) => ({
    email,
    name: namesByEmail.get(email) || getVolunteerFallbackName(email)
  }));
}

function selectCampaign(
  snapshot: MetadataSnapshot,
  requestedCampaignId?: string | null
): Campaign {
  const requestedId = String(requestedCampaignId || '').trim();
  if (requestedId) {
    const requestedCampaign = snapshot.config.campaigns.find(
      (campaign) => campaign.id === requestedId
    );
    if (!requestedCampaign) {
      throw new Error('CAMPAIGN_NOT_FOUND');
    }
    return requestedCampaign;
  }

  const defaultCampaign =
    snapshot.config.campaigns.find(
      (campaign) => campaign.id === snapshot.defaultCampaignId
    ) || snapshot.config.campaigns[0];
  if (!defaultCampaign) {
    throw new Error('No campaign found in Config sheet.');
  }
  return defaultCampaign;
}

function resolveUpdateCampaign(
  snapshot: MetadataSnapshot,
  payload: Pick<UpdateLeadRequest, 'campaignId' | 'campaignType'>
): Campaign {
  const campaign = snapshot.config.campaigns.find(
    (item) => item.id === payload.campaignId
  );
  if (!campaign) {
    throw new Error('CAMPAIGN_NOT_FOUND');
  }
  if (campaign.type !== payload.campaignType) {
    throw new Error('CAMPAIGN_TYPE_MISMATCH');
  }
  return campaign;
}

function rowMatchesCampaign(
  row: string[],
  columns: LeadColumnMap,
  selectedCampaign: Campaign
): boolean {
  const recordCampaignType = getCell(row, columns.campaignType);
  if (recordCampaignType && recordCampaignType !== selectedCampaign.type) {
    return false;
  }
  return getCell(row, columns.campaignId) === selectedCampaign.id;
}

function mapRowToLead(
  row: string[],
  columns: LeadColumnMap,
  selectedCampaign: Campaign
): Lead {
  const id = getCell(row, columns.id);
  return LeadSchema.parse({
    id,
    mobile: getCell(row, columns.mobile),
    name: getCell(row, columns.name),
    quality: getCell(row, columns.quality),
    followUp: getCell(row, columns.followUp),
    lastUpdated: getCell(row, columns.lastUpdated),
    status: getCell(row, columns.status),
    notes: getCell(row, columns.notes),
    campaignId: getCell(row, columns.campaignId) || selectedCampaign.id,
    campaignType: getCell(row, columns.campaignType) || selectedCampaign.type,
    assignedVolunteerEmail: normalizeEmail(
      getCell(row, columns.assignedVolunteerEmail)
    ),
    wishlistPrograms: toCsv(getCell(row, columns.wishlistPrograms)),
    donePrograms: toCsv(getCell(row, columns.donePrograms))
  });
}

export function createSheetsStore(dependencies: SheetsStoreDependencies = {}) {
  const readSheetValues =
    dependencies.readSheetValues || defaultReadSheetValues;
  const readSheetValuesBatch =
    dependencies.readSheetValuesBatch || defaultReadSheetValuesBatch;
  const updateSheetValuesBatch =
    dependencies.updateSheetValuesBatch || defaultUpdateSheetValuesBatch;
  const appendSheetRow = dependencies.appendSheetRow || defaultAppendSheetRow;
  const deleteSheetRow = dependencies.deleteSheetRow || defaultDeleteSheetRow;
  const getSheetLayout = dependencies.getSheetLayout || defaultGetSheetLayout;
  const now = dependencies.now || (() => new Date());
  const pamphletStore =
    dependencies.pamphletStore || createBlobPamphletStore();

  async function withStoreOperation<T>(
    operation: SheetsOperation | undefined,
    task: (activeOperation: SheetsOperation) => Promise<T>
  ): Promise<T> {
    const ownedOperation = operation ? null : createSheetsOperation();
    try {
      return await task(operation || ownedOperation!);
    } finally {
      ownedOperation?.dispose();
    }
  }

  // Config/campaigns/allowed-users are small sheets read fresh on every call - at
  // this app's volume (a handful of volunteers, <=50 leads each) that's nowhere
  // near Google Sheets API limits, so no caching layer is needed.
  async function loadMetadataSnapshot(
    operation: SheetsOperation
  ): Promise<MetadataSnapshot> {
    const layout = getSheetLayout();
    const [dataRows, allowedUserRows] = await Promise.all([
      readSheetValuesBatch(
        'data',
        [layout.configRange, layout.campaignsRange],
        operation
      ),
      readSheetValues('access', layout.allowedUsersRange, operation)
    ]);
    const rawConfig = rowsToConfigMap(dataRows[0] || []);
    const campaigns = rowsToCampaigns(dataRows[1] || []);
    const config = buildAppConfig(rawConfig, campaigns);
    const defaultCampaignId =
      rawConfig.campaignId || config.campaigns[0]?.id || '';
    if (!defaultCampaignId) {
      throw new Error('No campaignId configured in Config sheet.');
    }

    // AllowedUsers is the documented access-control source. An empty sheet must
    // deny access rather than silently reviving users left in legacy Config data.
    const allowedUsers = buildAllowedUsers(allowedUserRows);

    return {
      config,
      defaultCampaignId,
      allowedUsers,
      volunteers: buildAllowedVolunteers(allowedUserRows, allowedUsers),
      diagnostics: {
        campaignRows: countNonEmptyDataRows(dataRows[1] || []),
        allowedUserRows: countNonEmptyDataRows(allowedUserRows)
      }
    };
  }

  function isUserAllowed(
    snapshot: MetadataSnapshot,
    user: SessionUser
  ): boolean {
    return snapshot.allowedUsers.has(normalizeEmail(user.email));
  }

  async function getBootstrap(
    user: SessionUser,
    snapshot: MetadataSnapshot,
    operation: SheetsOperation,
    campaignId?: string | null
  ): Promise<BootstrapResponse> {
    const selectedCampaign = selectCampaign(snapshot, campaignId);
    const layout = getSheetLayout();
    const range =
      selectedCampaign.type === 'Members'
        ? layout.membersRange
        : layout.leadsRange;
    const rows = await readSheetValues('data', range, operation);
    const headers = (rows[0] || []).map((value) => String(value || '').trim());
    const leadColumns = resolveLeadColumns(headers);
    const requestedEmail = normalizeEmail(user.email);
    const leads: Lead[] = [];

    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] || [];
      if (!rowMatchesCampaign(row, leadColumns, selectedCampaign)) {
        continue;
      }
      const assignedEmail = normalizeEmail(
        getCell(row, leadColumns.assignedVolunteerEmail)
      );
      if (assignedEmail !== requestedEmail) {
        continue;
      }
      leads.push(mapRowToLead(row, leadColumns, selectedCampaign));
    }

    return BootstrapResponseSchema.parse({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture
      },
      campaignId: selectedCampaign.id,
      config: {
        ...snapshot.config,
        allowedUsers: [...snapshot.allowedUsers],
        volunteers: snapshot.volunteers
      },
      leads
    });
  }

  async function updateLead(
    user: SessionUser,
    snapshot: MetadataSnapshot,
    operation: SheetsOperation,
    rawPayload: unknown
  ): Promise<UpdateLeadResponse> {
    const payload = UpdateLeadRequestSchema.parse(rawPayload);
    const selectedCampaign = resolveUpdateCampaign(snapshot, payload);
    const layout = getSheetLayout();
    const baseRange =
      selectedCampaign.type === 'Members'
        ? layout.membersRange
        : layout.leadsRange;
    const tabName = getTabName(baseRange);
    const rows = await readSheetValues('data', baseRange, operation);
    const headers = (rows[0] || []).map((value) => String(value || '').trim());
    if (!headers.length) {
      throw new Error('Lead sheet is missing header row.');
    }

    const columns = resolveLeadColumns(headers);
    if (columns.id < 0) {
      throw new Error('Lead sheet header must contain an id column.');
    }

    const requestedEmail = normalizeEmail(user.email);
    type Candidate = { rowNumber: number; values: string[] };
    let exactMatch: Candidate | null = null;

    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] || [];
      if (getCell(row, columns.id) === payload.id) {
        exactMatch ||= { rowNumber: rowIndex + 1, values: row };
      }
    }

    const target = exactMatch;
    if (!target) {
      throw new Error('Lead not found.');
    }

    const assignedVolunteerEmail = normalizeEmail(
      getCell(target.values, columns.assignedVolunteerEmail)
    );
    if (assignedVolunteerEmail !== requestedEmail) {
      throw new Error('FORBIDDEN_LEAD_ASSIGNMENT');
    }

    const targetVolunteerEmail =
      payload.assignedVolunteerEmail === undefined
        ? undefined
        : normalizeEmail(payload.assignedVolunteerEmail);
    if (
      targetVolunteerEmail !== undefined &&
      !snapshot.allowedUsers.has(targetVolunteerEmail)
    ) {
      throw new Error('VOLUNTEER_NOT_ALLOWED');
    }

    const targetRowNumber = target.rowNumber;
    const timestamp = now().toISOString();
    const updatesByColumn = new Map<number, string>();
    const setUpdate = (columnIndex: number, value: string | undefined) => {
      if (columnIndex >= 0 && value !== undefined) {
        updatesByColumn.set(columnIndex, value);
      }
    };
    setUpdate(columns.name, payload.name);
    setUpdate(columns.status, payload.status);
    setUpdate(columns.quality, payload.quality);
    setUpdate(columns.followUp, payload.followUp);
    setUpdate(columns.notes, payload.notes);
    setUpdate(columns.assignedVolunteerEmail, targetVolunteerEmail);
    setUpdate(
      columns.wishlistPrograms,
      payload.wishlistPrograms === undefined
        ? undefined
        : toCsv(payload.wishlistPrograms)
    );
    setUpdate(
      columns.donePrograms,
      payload.donePrograms === undefined
        ? undefined
        : toCsv(payload.donePrograms)
    );
    setUpdate(columns.campaignId, selectedCampaign.id);
    setUpdate(columns.campaignType, selectedCampaign.type);
    setUpdate(columns.lastUpdated, timestamp);

    await updateSheetValuesBatch(
      'data',
      [...updatesByColumn.entries()].map(([columnIndex, value]) => ({
        range:
          tabName +
          '!' +
          columnLabel(columnIndex + 1) +
          String(targetRowNumber),
        values: [[value]]
      })),
      operation
    );

    return UpdateLeadResponseSchema.parse({
      success: true,
      lead: { id: payload.id, lastUpdated: timestamp }
    });
  }

  async function createLead(
    user: SessionUser,
    snapshot: MetadataSnapshot,
    operation: SheetsOperation,
    rawPayload: unknown
  ): Promise<CreateLeadResponse> {
    const payload = CreateLeadRequestSchema.parse(rawPayload);
    const campaign = resolveUpdateCampaign(snapshot, payload);
    const layout = getSheetLayout();
    const baseRange =
      campaign.type === 'Members' ? layout.membersRange : layout.leadsRange;
    const rows = await readSheetValues('data', baseRange, operation);
    const headers = (rows[0] || []).map((value) => String(value || '').trim());
    if (!headers.length) {
      throw new Error('Lead sheet is missing header row.');
    }
    const columns = resolveLeadColumns(headers);
    if (columns.id < 0 || columns.campaignId < 0) {
      throw new Error('Lead sheet must contain id and campaignId columns.');
    }

    const timestamp = now().toISOString();
    const id = nanoid();
    const row = Array<string>(headers.length).fill('');
    const setCell = (columnIndex: number, value: string) => {
      if (columnIndex >= 0) {
        row[columnIndex] = value;
      }
    };
    setCell(columns.id, id);
    setCell(columns.mobile, payload.mobile);
    setCell(columns.name, payload.name);
    setCell(
      columns.quality,
      campaign.type === 'Members' ? 'Engagement' : 'Quality'
    );
    setCell(columns.followUp, 'Follow-up');
    setCell(columns.lastUpdated, timestamp);
    setCell(columns.status, 'Response');
    setCell(columns.notes, payload.notes || '');
    setCell(columns.campaignId, campaign.id);
    setCell(columns.campaignType, campaign.type);
    setCell(columns.assignedVolunteerEmail, normalizeEmail(user.email));

    await appendSheetRow('data', baseRange, row, operation);

    const lead = LeadSchema.parse({
      id,
      mobile: payload.mobile,
      name: payload.name,
      quality: campaign.type === 'Members' ? 'Engagement' : 'Quality',
      followUp: 'Follow-up',
      lastUpdated: timestamp,
      status: 'Response',
      notes: payload.notes || '',
      campaignId: campaign.id,
      campaignType: campaign.type,
      assignedVolunteerEmail: normalizeEmail(user.email),
      wishlistPrograms: '',
      donePrograms: ''
    });
    return CreateLeadResponseSchema.parse({ success: true, lead });
  }

  async function deleteLead(
    user: SessionUser,
    operation: SheetsOperation,
    rawPayload: unknown
  ): Promise<DeleteLeadResponse> {
    const payload = DeleteLeadRequestSchema.parse(rawPayload);
    const layout = getSheetLayout();
    const baseRange =
      payload.campaignType === 'Members'
        ? layout.membersRange
        : layout.leadsRange;
    const rows = await readSheetValues('data', baseRange, operation);
    const headers = (rows[0] || []).map((value) => String(value || '').trim());
    const columns = resolveLeadColumns(headers);
    if (columns.id < 0) {
      throw new Error('Lead sheet header must contain an id column.');
    }
    const rowIndex = rows.findIndex(
      (row, index) => index > 0 && getCell(row, columns.id) === payload.id
    );
    if (rowIndex < 0) {
      throw new Error('Lead not found.');
    }
    if (
      normalizeEmail(
        getCell(rows[rowIndex], columns.assignedVolunteerEmail)
      ) !== normalizeEmail(user.email)
    ) {
      throw new Error('FORBIDDEN_LEAD_ASSIGNMENT');
    }
    const rowNumber = rowIndex + 1;
    await deleteSheetRow('data', getTabName(baseRange), rowNumber, operation);
    return DeleteLeadResponseSchema.parse({
      success: true,
      lead: { id: payload.id }
    });
  }

  async function readCourseRows(
    operation: SheetsOperation
  ): Promise<{ headers: string[]; rows: string[][] }> {
    const layout = getSheetLayout();
    const rows = await readSheetValues('data', layout.coursesRange, operation);
    const headers = (rows[0] || []).map((value) => String(value || '').trim());
    if (!headers.length || resolveCourseIdColumn(headers) < 0) {
      throw new Error('Course sheet is missing header row.');
    }
    return { headers, rows };
  }

  function parseCourseAt(
    headers: string[],
    rows: string[][],
    rowIndex: number
  ): CourseRecord | null {
    return courseFromRow(headers, rows[rowIndex] || []);
  }

  async function listCourseTemplates(
    operation: SheetsOperation
  ): Promise<ListCoursesResponse['templates']> {
    try {
      const rows = await readSheetValues(
        'data',
        getSheetLayout().courseTemplatesRange,
        operation
      );
      const parsed = templatesFromRows(rows);
      if (!parsed.length) {
        return defaultCourseTemplates();
      }
      const merged = new Map(
        defaultCourseTemplates().map((item) => [item.courseType, item.template])
      );
      parsed.forEach((item) => {
        if (item.template.trim()) {
          merged.set(item.courseType, item.template);
        }
      });
      return [...merged.entries()].map(([courseType, template]) => ({
        courseType,
        template
      }));
    } catch {
      return defaultCourseTemplates();
    }
  }

  async function listCourses(
    operation: SheetsOperation
  ): Promise<ListCoursesResponse> {
    const [{ headers, rows }, templates] = await Promise.all([
      readCourseRows(operation),
      listCourseTemplates(operation)
    ]);
    const courses = rows
      .slice(1)
      .map((row) => courseFromRow(headers, row))
      .filter((course): course is CourseRecord => Boolean(course))
      .map(toCourseResponse);
    return ListCoursesResponseSchema.parse({
      success: true,
      courses,
      templates
    });
  }

  async function getCourseByPublicKey(
    operation: SheetsOperation,
    key: string
  ): Promise<CourseRecord | null> {
    const wanted = String(key || '').trim();
    if (!wanted) {
      return null;
    }
    const { headers, rows } = await readCourseRows(operation);
    const courses = rows
      .slice(1)
      .map((row, index) => parseCourseAt(headers, rows, index + 1))
      .filter((course): course is CourseRecord => Boolean(course));
    return pickPublicCourseByKey(courses, wanted);
  }

  async function createCourse(
    user: SessionUser,
    operation: SheetsOperation,
    rawPayload: unknown
  ): Promise<CreateCourseResponse> {
    const payload = CreateCourseRequestSchema.parse(rawPayload);
    const { headers } = await readCourseRows(operation);
    const timestamp = now().toISOString();
    const id = nanoid();
    let pamphletFileId = '';
    let pamphletMimeType = '';
    if (payload.pamphletBase64.trim()) {
      const pamphlet = decodePamphletBase64(
        payload.pamphletBase64,
        payload.pamphletMimeType
      );
      pamphletFileId = await pamphletStore.upload(id, pamphlet);
      pamphletMimeType = payload.pamphletMimeType;
    }
    const course = applyCourseDefaults(
      payload,
      timestamp,
      normalizeEmail(user.email),
      { id, pamphletFileId, pamphletMimeType }
    );
    await appendSheetRow(
      'data',
      getSheetLayout().coursesRange,
      courseToRow(headers, course),
      operation
    );
    return CreateCourseResponseSchema.parse({
      success: true,
      course: toCourseResponse(course)
    });
  }

  async function updateCourse(
    user: SessionUser,
    operation: SheetsOperation,
    rawPayload: unknown
  ): Promise<UpdateCourseResponse> {
    const payload = UpdateCourseRequestSchema.parse(rawPayload);
    const { headers, rows } = await readCourseRows(operation);
    const idColumn = resolveCourseIdColumn(headers);
    const rowIndex = rows.findIndex(
      (row, index) => index > 0 && getCell(row, idColumn) === payload.id
    );
    if (rowIndex < 0) {
      throw new Error('Course not found.');
    }
    const existing = parseCourseAt(headers, rows, rowIndex);
    if (!existing) {
      throw new Error('Course not found.');
    }
    const timestamp = now().toISOString();
    let pamphletFileId = existing.pamphletFileId;
    let pamphletMimeType = existing.pamphletMimeType;
    if (payload.clearPamphlet && pamphletFileId) {
      await pamphletStore.remove(pamphletFileId);
      pamphletFileId = '';
      pamphletMimeType = '';
    }
    if (payload.pamphletBase64.trim()) {
      const pamphlet = decodePamphletBase64(
        payload.pamphletBase64,
        payload.pamphletMimeType
      );
      const nextId = await pamphletStore.upload(payload.id, pamphlet);
      if (pamphletFileId && pamphletFileId !== nextId) {
        await pamphletStore.remove(pamphletFileId);
      }
      pamphletFileId = nextId;
      pamphletMimeType = payload.pamphletMimeType;
    }
    const course = applyCourseDefaults(
      payload,
      timestamp,
      normalizeEmail(user.email),
      { id: payload.id, existing, pamphletFileId, pamphletMimeType }
    );
    const rowNumber = rowIndex + 1;
    const lastColumn = columnLabel(headers.length);
    await updateSheetValuesBatch(
      'data',
      [
        {
          range:
            getTabName(getSheetLayout().coursesRange) +
            '!A' +
            String(rowNumber) +
            ':' +
            lastColumn +
            String(rowNumber),
          values: [courseToRow(headers, course)]
        }
      ],
      operation
    );
    return UpdateCourseResponseSchema.parse({
      success: true,
      course: toCourseResponse(course)
    });
  }

  async function deleteCourse(
    operation: SheetsOperation,
    rawPayload: unknown
  ): Promise<DeleteCourseResponse> {
    const payload = DeleteCourseRequestSchema.parse(rawPayload);
    const { headers, rows } = await readCourseRows(operation);
    const idColumn = resolveCourseIdColumn(headers);
    const rowIndex = rows.findIndex(
      (row, index) => index > 0 && getCell(row, idColumn) === payload.id
    );
    if (rowIndex < 0) {
      throw new Error('Course not found.');
    }
    const existing = parseCourseAt(headers, rows, rowIndex);
    if (existing?.pamphletFileId) {
      await pamphletStore.remove(existing.pamphletFileId);
    }
    await deleteSheetRow(
      'data',
      getTabName(getSheetLayout().coursesRange),
      rowIndex + 1,
      operation
    );
    return DeleteCourseResponseSchema.parse({
      success: true,
      course: { id: payload.id }
    });
  }

  async function loadPublicCoursePamphlet(
    id: string,
    operation: SheetsOperation
  ) {
    const course = await getCourseByPublicKey(operation, id);
    if (!course?.pamphletFileId) {
      return null;
    }
    const pamphlet = await pamphletStore.download(course.pamphletFileId);
    if (!pamphlet) {
      return null;
    }
    return {
      mimeType: course.pamphletMimeType || pamphlet.mimeType,
      bytes: pamphlet.bytes
    };
  }

  return {
    async authorizeUser(
      user: SessionUser,
      operation?: SheetsOperation
    ): Promise<StoreAuthorizationResult> {
      return withStoreOperation(operation, async (activeOperation) => {
        const snapshot = await loadMetadataSnapshot(activeOperation);
        return {
          allowed: isUserAllowed(snapshot, user),
          diagnostics: snapshot.diagnostics
        };
      });
    },

    async isUserAllowed(user: SessionUser, operation?: SheetsOperation) {
      return withStoreOperation(operation, async (activeOperation) =>
        isUserAllowed(await loadMetadataSnapshot(activeOperation), user)
      );
    },

    async getBootstrapForAuthorizedUser(
      user: SessionUser,
      campaignId?: string | null,
      operation?: SheetsOperation
    ): Promise<AuthorizedStoreResult<BootstrapResponse>> {
      return withStoreOperation(operation, async (activeOperation) => {
        const snapshot = await loadMetadataSnapshot(activeOperation);
        if (!isUserAllowed(snapshot, user)) {
          return { allowed: false };
        }
        return {
          allowed: true,
          value: await getBootstrap(user, snapshot, activeOperation, campaignId)
        };
      });
    },

    async updateLeadForAuthorizedUser(
      user: SessionUser,
      payload: unknown,
      operation?: SheetsOperation
    ): Promise<AuthorizedStoreResult<UpdateLeadResponse>> {
      return withStoreOperation(operation, async (activeOperation) => {
        const snapshot = await loadMetadataSnapshot(activeOperation);
        if (!isUserAllowed(snapshot, user)) {
          return { allowed: false };
        }
        return {
          allowed: true,
          value: await updateLead(user, snapshot, activeOperation, payload)
        };
      });
    },

    async createLeadForAuthorizedUser(
      user: SessionUser,
      payload: unknown,
      operation?: SheetsOperation
    ): Promise<AuthorizedStoreResult<CreateLeadResponse>> {
      return withStoreOperation(operation, async (activeOperation) => {
        const snapshot = await loadMetadataSnapshot(activeOperation);
        if (!isUserAllowed(snapshot, user)) {
          return { allowed: false };
        }
        return {
          allowed: true,
          value: await createLead(user, snapshot, activeOperation, payload)
        };
      });
    },

    async deleteLeadForAuthorizedUser(
      user: SessionUser,
      payload: unknown,
      operation?: SheetsOperation
    ): Promise<AuthorizedStoreResult<DeleteLeadResponse>> {
      return withStoreOperation(operation, async (activeOperation) => {
        const snapshot = await loadMetadataSnapshot(activeOperation);
        if (!isUserAllowed(snapshot, user)) {
          return { allowed: false };
        }
        return {
          allowed: true,
          value: await deleteLead(user, activeOperation, payload)
        };
      });
    },

    async listCoursesForAuthorizedUser(
      user: SessionUser,
      operation?: SheetsOperation
    ): Promise<AuthorizedStoreResult<ListCoursesResponse>> {
      return withStoreOperation(operation, async (activeOperation) => {
        const snapshot = await loadMetadataSnapshot(activeOperation);
        if (!isUserAllowed(snapshot, user)) {
          return { allowed: false };
        }
        return {
          allowed: true,
          value: await listCourses(activeOperation)
        };
      });
    },

    async createCourseForAuthorizedUser(
      user: SessionUser,
      payload: unknown,
      operation?: SheetsOperation
    ): Promise<AuthorizedStoreResult<CreateCourseResponse>> {
      return withStoreOperation(operation, async (activeOperation) => {
        const snapshot = await loadMetadataSnapshot(activeOperation);
        if (!isUserAllowed(snapshot, user)) {
          return { allowed: false };
        }
        return {
          allowed: true,
          value: await createCourse(user, activeOperation, payload)
        };
      });
    },

    async updateCourseForAuthorizedUser(
      user: SessionUser,
      payload: unknown,
      operation?: SheetsOperation
    ): Promise<AuthorizedStoreResult<UpdateCourseResponse>> {
      return withStoreOperation(operation, async (activeOperation) => {
        const snapshot = await loadMetadataSnapshot(activeOperation);
        if (!isUserAllowed(snapshot, user)) {
          return { allowed: false };
        }
        return {
          allowed: true,
          value: await updateCourse(user, activeOperation, payload)
        };
      });
    },

    async deleteCourseForAuthorizedUser(
      user: SessionUser,
      payload: unknown,
      operation?: SheetsOperation
    ): Promise<AuthorizedStoreResult<DeleteCourseResponse>> {
      return withStoreOperation(operation, async (activeOperation) => {
        const snapshot = await loadMetadataSnapshot(activeOperation);
        if (!isUserAllowed(snapshot, user)) {
          return { allowed: false };
        }
        return {
          allowed: true,
          value: await deleteCourse(activeOperation, payload)
        };
      });
    },

    async getPublicCourseById(
      id: string,
      operation?: SheetsOperation
    ): Promise<Course | null> {
      return withStoreOperation(operation, async (activeOperation) => {
        const course = await getCourseByPublicKey(activeOperation, id);
        return course ? toCourseResponse(course) : null;
      });
    },

    async getPublicCoursePamphlet(
      id: string,
      operation?: SheetsOperation
    ) {
      return withStoreOperation(operation, async (activeOperation) =>
        loadPublicCoursePamphlet(id, activeOperation)
      );
    }
  };
}
