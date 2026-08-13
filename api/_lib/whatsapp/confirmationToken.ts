import { createHmac, timingSafeEqual } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { getWhatsAppSignatureEnv } from '../config/env.js';
import {
  normalizeEmail,
  normalizeIndianMobile,
  normalizeSpaces
} from '../http/normalization.js';
import type { PendingLeadConfirmation } from './pendingStore.js';

const CONFIRM_ACTION = 'confirm_save';
const EDIT_ACTION = 'edit_lead';
const MAX_BUTTON_ID_CHARS = 256;
const MAX_INFLATED_TOKEN_BYTES = 8_192;
const SIGNATURE_BYTES = 12;
const TOKEN_VERSION = '1';

type ConfirmationAction = typeof CONFIRM_ACTION | typeof EDIT_ACTION;
type TokenPayload = [
  version: string,
  expiresAtBase36: string,
  volunteerEmail: string,
  volunteerPhone: string,
  mobile: string,
  name: string,
  course: string,
  leadQuality: string,
  month: string,
  notes: string
];

function sign(encodedPayload: string): string {
  return createHmac('sha256', getWhatsAppSignatureEnv().META_APP_SECRET)
    .update(encodedPayload)
    .digest()
    .subarray(0, SIGNATURE_BYTES)
    .toString('base64url');
}

function buttonId(action: ConfirmationAction, token = ''): string {
  return token ? `${action}.${token}` : action;
}

export function createConfirmationToken(
  pending: PendingLeadConfirmation
): string | null {
  const payload: TokenPayload = [
    TOKEN_VERSION,
    pending.expiresAt.toString(36),
    pending.volunteerEmail,
    pending.volunteerPhone,
    pending.parsed.mobile,
    pending.parsed.name,
    pending.parsed.course,
    pending.parsed.leadQuality,
    pending.parsed.month,
    pending.parsed.notes
  ];
  const encodedPayload = deflateRawSync(
    Buffer.from(JSON.stringify(payload))
  ).toString('base64url');
  const token = `${encodedPayload}.${sign(encodedPayload)}`;

  return buttonId(CONFIRM_ACTION, token).length <= MAX_BUTTON_ID_CHARS
    ? token
    : null;
}

export function buildConfirmationButtonId(
  action: ConfirmationAction,
  token = ''
): string {
  return buttonId(action, token);
}

export function parseConfirmationButtonId(buttonIdValue: string): {
  action: ConfirmationAction;
  token: string;
} | null {
  const value = String(buttonIdValue || '').trim();
  for (const action of [CONFIRM_ACTION, EDIT_ACTION] as const) {
    if (value === action) {
      return { action, token: '' };
    }
    const prefix = `${action}.`;
    if (value.startsWith(prefix)) {
      return { action, token: value.slice(prefix.length) };
    }
  }
  return null;
}

export function readConfirmationToken(
  token: string,
  volunteerPhone: string
): PendingLeadConfirmation | null {
  const [encodedPayload, suppliedSignature, extra] = String(token || '').split(
    '.'
  );
  if (!encodedPayload || !suppliedSignature || extra) {
    return null;
  }

  const expectedSignature = sign(encodedPayload);
  try {
    if (
      !timingSafeEqual(
        Buffer.from(suppliedSignature),
        Buffer.from(expectedSignature)
      )
    ) {
      return null;
    }
  } catch {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(
      inflateRawSync(Buffer.from(encodedPayload, 'base64url'), {
        maxOutputLength: MAX_INFLATED_TOKEN_BYTES
      }).toString('utf8')
    ) as unknown;
  } catch {
    return null;
  }

  if (
    !Array.isArray(payload) ||
    payload.length !== 10 ||
    payload.some((value) => typeof value !== 'string')
  ) {
    return null;
  }

  const [
    version,
    expiresAtBase36,
    volunteerEmailRaw,
    volunteerPhoneRaw,
    mobileRaw,
    nameRaw,
    courseRaw,
    leadQualityRaw,
    monthRaw,
    notesRaw
  ] = payload as TokenPayload;
  const expiresAt = Number.parseInt(expiresAtBase36, 36);
  const canonicalPhone = normalizeIndianMobile(volunteerPhone);
  const tokenPhone = normalizeIndianMobile(volunteerPhoneRaw);
  const volunteerEmail = normalizeEmail(volunteerEmailRaw);
  const mobile = normalizeIndianMobile(mobileRaw);
  const name = normalizeSpaces(nameRaw);
  if (
    version !== TOKEN_VERSION ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Date.now() ||
    !canonicalPhone ||
    tokenPhone !== canonicalPhone ||
    !volunteerEmail ||
    !mobile ||
    !name
  ) {
    return null;
  }

  const originalMessage = [
    name,
    mobile,
    normalizeSpaces(courseRaw),
    normalizeSpaces(leadQualityRaw),
    normalizeSpaces(monthRaw),
    normalizeSpaces(notesRaw)
  ]
    .filter(Boolean)
    .join(' ');
  const parsed = {
    mobile,
    name,
    course: normalizeSpaces(courseRaw),
    leadQuality: normalizeSpaces(leadQualityRaw),
    month: normalizeSpaces(monthRaw),
    notes: normalizeSpaces(notesRaw),
    originalMessage
  };

  return {
    id: `token:${suppliedSignature}`,
    sourceMessageId: '',
    volunteerPhone: canonicalPhone,
    volunteerEmail,
    originalMessage,
    parsed,
    createdAt: Math.max(0, expiresAt - 300_000),
    expiresAt
  };
}
