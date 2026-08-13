import type { Campaign } from '../../../shared/contracts/appContracts.js';
import {
  DEFAULT_PROGRAMS,
  getDefaultQualityOptionsForCampaignType
} from '../../../src/config/campaignDefaults.js';
import { nanoid } from 'nanoid';
import {
  normalizeEmail,
  normalizeIndianMobile,
  normalizeSpaces
} from '../http/normalization.js';
import { getSheetLayout } from '../sheets/layout.js';
import {
  appendSheetRow,
  readSheetValues,
  updateSheetValuesBatch
} from '../sheets/client.js';
import {
  columnLabel,
  findHeaderIndex,
  getTabName,
  parseJsonValue,
  rowsToCampaigns,
  rowsToConfigMap,
  rowsToTable
} from '../sheets/table.js';
import {
  getPendingLead,
  removePendingLead,
  schedulePendingLeadTimeout,
  type PendingLeadConfirmation,
  upsertPendingLead
} from './pendingStore.js';
import {
  parseLeadMessage,
  type LeadParserCatalog,
  type ParsedLeadMessage,
  type ParserTerm
} from './leadParser.js';

const DEFAULT_MONTH_TERMS = [
  ['Jan', ['January']],
  ['Feb', ['February']],
  ['Mar', ['March']],
  ['Apr', ['April']],
  ['May', []],
  ['Jun', ['June']],
  ['Jul', ['July']],
  ['Aug', ['August']],
  ['Sep', ['September']],
  ['Oct', ['October']],
  ['Nov', ['November']],
  ['Dec', ['December']]
] as const;

const DEFAULT_LEAD_QUALITY = 'Hot';

type VolunteerInfo = {
  email: string;
  mobile: string;
};

function toShortMonth(monthValue: string): string {
  if (!monthValue) {
    return '';
  }

  const lowered = monthValue.toLowerCase();
  const match = DEFAULT_MONTH_TERMS.find(([shortName, aliases]) => {
    if (shortName.toLowerCase() === lowered) {
      return true;
    }

    return aliases.some((alias) => alias.toLowerCase() === lowered);
  });

  return match ? match[0] : '';
}

function getCurrentShortMonth(): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    timeZone: 'Asia/Kolkata'
  }).format(new Date());
}

function buildTermsFromList(values: string[]): ParserTerm[] {
  return values
    .map((value) => normalizeSpaces(value))
    .filter(Boolean)
    .map((value) => ({
      canonical: value,
      aliases: []
    }));
}

async function loadParserCatalog(): Promise<LeadParserCatalog> {
  const layout = getSheetLayout();
  const configRows = await readSheetValues('data', layout.configRange);
  const configMap = rowsToConfigMap(configRows);
  const programs = parseJsonValue<Array<{ code?: string; label?: string }>>(
    configMap.programs,
    []
  );
  const configuredPrograms = programs.length ? programs : DEFAULT_PROGRAMS;
  const courseTerms: ParserTerm[] = configuredPrograms
    .map((program) => {
      const code = normalizeSpaces(program.code || '');
      const label = normalizeSpaces(program.label || '');
      if (!code && !label) {
        return null;
      }

      return {
        canonical: code || label,
        aliases: [label].filter(Boolean)
      } as ParserTerm;
    })
    .filter((item): item is ParserTerm => Boolean(item));

  const qualityTerms = buildTermsFromList(
    getDefaultQualityOptionsForCampaignType('Leads')
  );

  const customMonths = parseJsonValue<string[]>(configMap.months, []);
  const monthTerms: ParserTerm[] = customMonths.length
    ? buildTermsFromList(customMonths).map((term) => ({
        canonical: toShortMonth(term.canonical) || term.canonical,
        aliases: [term.canonical]
      }))
    : DEFAULT_MONTH_TERMS.map(([shortName, aliases]) => ({
        canonical: shortName,
        aliases: [...aliases]
      }));

  return {
    courses: courseTerms,
    leadQualities: qualityTerms,
    months: monthTerms
  };
}

async function loadCampaigns(): Promise<Campaign[]> {
  const layout = getSheetLayout();
  return rowsToCampaigns(await readSheetValues('data', layout.campaignsRange));
}

async function findVolunteerByPhone(
  fromPhone: string
): Promise<VolunteerInfo | null> {
  const normalizedFrom = normalizeIndianMobile(fromPhone);
  if (!normalizedFrom) {
    return null;
  }

  const layout = getSheetLayout();
  const rows = await readSheetValues('access', layout.allowedUsersRange);
  const { headers, records } = rowsToTable(rows);
  if (!headers.length) {
    return null;
  }

  const emailIndex = findHeaderIndex(headers, [
    'email',
    'volunteerEmail',
    'volunteer_email'
  ]);
  const mobileIndex = findHeaderIndex(headers, [
    'mobile',
    'phone',
    'volunteerMobile'
  ]);
  if (emailIndex < 0 || mobileIndex < 0) {
    return null;
  }

  const emailHeader = headers[emailIndex];
  const mobileHeader = headers[mobileIndex];

  for (const { record } of records) {
    const candidate = normalizeIndianMobile(record[mobileHeader] || '');
    if (!candidate || candidate !== normalizedFrom) {
      continue;
    }

    const email = normalizeEmail(record[emailHeader] || '');
    if (!email) {
      continue;
    }

    return {
      email,
      mobile: candidate
    };
  }

  return null;
}

function resolveLeadCampaign(
  campaigns: Campaign[],
  monthShort: string
): Campaign | null {
  const leadsCampaigns = campaigns.filter(
    (campaign) => campaign.type === 'Leads'
  );
  if (!leadsCampaigns.length) {
    return null;
  }

  const shortMonth = toShortMonth(monthShort);
  if (!shortMonth) {
    return null;
  }
  const longMonth =
    DEFAULT_MONTH_TERMS.find(
      ([shortName]) => shortName === shortMonth
    )?.[1]?.[0] || shortMonth;

  const matches = leadsCampaigns.filter((campaign) => {
    const lowered = campaign.name.toLowerCase();
    return (
      lowered.includes(shortMonth.toLowerCase()) ||
      lowered.includes(longMonth.toLowerCase())
    );
  });

  return matches.length === 1 ? matches[0] : null;
}

function appendNotes(existing: string, extra: string): string {
  const current = normalizeSpaces(existing);
  const incoming = normalizeSpaces(extra);
  if (!incoming) {
    return current;
  }
  if (!current) {
    return incoming;
  }
  if (current.split(' | ').some((part) => normalizeSpaces(part) === incoming)) {
    return current;
  }
  return current + ' | ' + incoming;
}

type UpsertResult = {
  action: 'created' | 'updated';
};

export async function upsertLeadByMobileAndCampaign(
  volunteerEmail: string,
  parsed: ParsedLeadMessage,
  campaign: Campaign
): Promise<UpsertResult> {
  const layout = getSheetLayout();
  const tabName = getTabName(layout.leadsRange);
  const { headers, records } = rowsToTable(
    await readSheetValues('data', layout.leadsRange)
  );
  if (!headers.length) {
    throw new Error('Lead sheet is missing header row.');
  }

  const idIndex = findHeaderIndex(headers, ['id']);
  const mobileHeaderIndex = findHeaderIndex(headers, ['mobile', 'phone']);
  const campaignIdIndex = findHeaderIndex(headers, ['campaignId']);

  if (idIndex < 0) {
    throw new Error('Lead sheet must contain id column.');
  }
  if (mobileHeaderIndex < 0) {
    throw new Error('Lead sheet must contain mobile/phone column.');
  }
  if (campaignIdIndex < 0) {
    throw new Error('Lead sheet must contain campaignId column.');
  }

  const mobileHeader = headers[mobileHeaderIndex];
  const campaignIdHeader = headers[campaignIdIndex];
  const existingLead = records.find(
    ({ record }) =>
      normalizeIndianMobile(record[mobileHeader] || '') === parsed.mobile &&
      normalizeSpaces(record[campaignIdHeader] || '') === campaign.id
  );

  const now = new Date().toISOString();
  if (existingLead) {
    const { record: row, rowNumber: targetRowNumber } = existingLead;
    const merged: Record<string, string> = {
      name: parsed.name || row.name || '',
      quality: parsed.leadQuality || row.quality || 'Quality',
      notes: appendNotes(row.notes || '', parsed.notes),
      campaignId: campaign.id,
      campaignType: 'Leads',
      assignedVolunteerEmail: row.assignedVolunteerEmail || volunteerEmail,
      wishlistPrograms: parsed.course || row.wishlistPrograms || '',
      lastUpdated: now
    };
    merged[mobileHeader] = parsed.mobile;

    const updates = Object.entries(merged).flatMap(([header, value]) => {
      const headerIndex = headers.indexOf(header);
      if (headerIndex < 0 || row[header] === value) {
        return [];
      }
      const cell = `${tabName}!${columnLabel(headerIndex + 1)}${targetRowNumber}`;
      return [{ range: cell, values: [[value]] }];
    });
    await updateSheetValuesBatch('data', updates);
    return { action: 'updated' };
  }

  const rowRecord: Record<string, string> = {
    id: nanoid(),
    name: parsed.name,
    quality: parsed.leadQuality || 'Quality',
    followUp: 'Follow-up',
    lastUpdated: now,
    status: 'Response',
    notes: parsed.notes,
    campaignId: campaign.id,
    campaignType: 'Leads',
    assignedVolunteerEmail: volunteerEmail,
    wishlistPrograms: parsed.course,
    donePrograms: ''
  };
  rowRecord[mobileHeader] = parsed.mobile;

  await appendSheetRow(
    'data',
    `${tabName}!A:${columnLabel(headers.length)}`,
    headers.map((header) => rowRecord[header] ?? '')
  );
  return { action: 'created' };
}

async function savePendingLead(
  pending: PendingLeadConfirmation
): Promise<UpsertResult | null> {
  const campaigns = await loadCampaigns();
  const monthForCampaign = pending.parsed.month || getCurrentShortMonth();
  const campaign = resolveLeadCampaign(campaigns, monthForCampaign);
  if (!campaign) {
    return null;
  }

  return upsertLeadByMobileAndCampaign(
    pending.volunteerEmail,
    {
      ...pending.parsed,
      month: monthForCampaign
    },
    campaign
  );
}

function parseAndValidateLead(
  message: string,
  catalog: LeadParserCatalog
): ParsedLeadMessage {
  const parsed = parseLeadMessage(message, catalog);
  if (!parsed.mobile) {
    throw new Error('MISSING_MOBILE');
  }
  if (!parsed.name) {
    throw new Error('MISSING_NAME');
  }

  return parsed;
}

export function buildEditableLeadMessage(parsed: ParsedLeadMessage): string {
  return [
    parsed.name,
    parsed.mobile,
    parsed.course,
    parsed.leadQuality,
    parsed.month,
    parsed.notes
  ]
    .map((value) => normalizeSpaces(value))
    .filter(Boolean)
    .join(' ');
}

export function buildShareableLeadMessage(parsed: ParsedLeadMessage): string {
  return [
    'Lead added 👍',
    '',
    'Name: ' + parsed.name,
    'Mobile: ' + parsed.mobile,
    parsed.course ? 'Course: ' + parsed.course : '',
    parsed.leadQuality ? 'Quality: ' + parsed.leadQuality : '',
    parsed.month ? 'Month: ' + parsed.month : '',
    parsed.notes ? 'Notes: ' + parsed.notes : ''
  ]
    .filter((line, index) => index < 2 || Boolean(line))
    .join('\n');
}

export async function handleIncomingText(
  volunteerPhone: string,
  text: string,
  messageId = ''
): Promise<{
  action: 'ignore' | 'show_confirmation' | 'send_text';
  parsed?: ParsedLeadMessage;
  message?: string;
}> {
  const volunteer = await findVolunteerByPhone(volunteerPhone);
  if (!volunteer) {
    return {
      action: 'send_text',
      message:
        'Thank you for reaching out! 🙏 For more details about Art of Living programs and activities, please contact us at 88845 60660.'
    };
  }

  const pending = await getPendingLead(volunteerPhone);
  if (pending) {
    if (messageId && pending.sourceMessageId === messageId) {
      return {
        action: 'show_confirmation',
        parsed: pending.parsed
      };
    }
    return {
      action: 'send_text',
      message: 'Please choose Confirm & Save or Edit for the previous lead.'
    };
  }

  const catalog = await loadParserCatalog();
  let parsed: ParsedLeadMessage;
  try {
    parsed = parseAndValidateLead(text, catalog);
    parsed = {
      ...parsed,
      leadQuality: parsed.leadQuality || DEFAULT_LEAD_QUALITY,
      month: parsed.month || getCurrentShortMonth()
    };
  } catch (error) {
    const messageCode =
      error instanceof Error ? error.message : 'INVALID_MESSAGE';

    if (messageCode === 'MISSING_MOBILE') {
      return {
        action: 'send_text',
        message:
          "I couldn't find a valid mobile number. Please resend with mobile."
      };
    }

    if (messageCode === 'MISSING_NAME') {
      return {
        action: 'send_text',
        message:
          "I couldn't find the name near mobile number. Please resend in format: <name> 9876543210 HP Hot Aug"
      };
    }

    return {
      action: 'send_text',
      message: 'Unable to parse this lead. Please resend in a simple format.'
    };
  }

  const createdPending = await upsertPendingLead(
    volunteerPhone,
    volunteer.email,
    parsed,
    messageId
  );
  schedulePendingLeadTimeout(createdPending);

  return {
    action: 'show_confirmation',
    parsed
  };
}

export async function handleButtonReply(
  volunteerPhone: string,
  buttonId: string
): Promise<{
  action: 'ignore' | 'send_text';
  message?: string;
  messages?: string[];
}> {
  const pending = await getPendingLead(volunteerPhone);
  if (!pending) {
    return {
      action: 'send_text',
      message:
        'No pending lead confirmation found. Please send lead details again.'
    };
  }

  if (buttonId === 'edit_lead') {
    await removePendingLead(volunteerPhone, pending.id);
    return {
      action: 'send_text',
      messages: [
        'Copy the next message, correct any details, and send it back.',
        buildEditableLeadMessage(pending.parsed) || pending.originalMessage
      ]
    };
  }

  if (buttonId !== 'confirm_save') {
    return { action: 'ignore' };
  }

  const saved = await savePendingLead(pending);
  if (!saved) {
    return {
      action: 'send_text',
      message: 'No leads campaign configured. Please contact admin.'
    };
  }
  await removePendingLead(volunteerPhone, pending.id);

  if (saved.action === 'updated') {
    return {
      action: 'send_text',
      message:
        'ℹ️ Lead already existed for this month. Existing lead has been updated.'
    };
  }

  return {
    action: 'send_text',
    message: buildShareableLeadMessage(pending.parsed)
  };
}
