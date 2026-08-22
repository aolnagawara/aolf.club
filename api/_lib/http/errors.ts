import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import type { ApiErrorCode } from '../../../shared/contracts/appContracts.js';
import { SheetsRequestError } from '../sheets/client.js';
import type { ApiResponse } from './responses.js';

const MAX_LOG_MESSAGE_CHARS = 500;

export type ApiErrorMessages = {
  validation?: string;
  timeout?: string;
  upstream?: string;
  upstreamPermission?: string;
  internal?: string;
};

export type ApiErrorContext = {
  route: string;
  action: string;
  startedAt?: number;
  messages?: ApiErrorMessages;
};

export type ApiErrorOverride = {
  status: number;
  code: ApiErrorCode;
  message: string;
  retryable: boolean;
  category?: string;
};

export type ReportedApiError = {
  traceId: string;
  status: number;
  code: ApiErrorCode;
  message: string;
  retryable: boolean;
};

function redactLogMessage(value: string): string {
  return value
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(
      /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi,
      '[REDACTED PRIVATE KEY]'
    )
    .replace(
      /(access[_-]?token|refresh[_-]?token|authorization|client[_-]?secret|session[_-]?secret)\s*[:=]\s*[^\s,;]+/gi,
      '$1=[REDACTED]'
    )
    .slice(0, MAX_LOG_MESSAGE_CHARS);
}

function getErrorType(error: unknown): string {
  if (error instanceof Error) {
    return error.name || error.constructor.name || 'Error';
  }
  return typeof error;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return redactLogMessage(error.message);
  }
  return redactLogMessage(String(error));
}

function classifyApiError(
  error: unknown,
  context: ApiErrorContext,
  override?: ApiErrorOverride
): ApiErrorOverride {
  if (override) {
    return override;
  }

  if (error instanceof SheetsRequestError) {
    if (error.kind === 'timeout') {
      return {
        status: 504,
        code: 'UPSTREAM_TIMEOUT',
        message:
          context.messages?.timeout ||
          'Unable to access data right now. Please try again.',
        retryable: true,
        category: 'upstream_timeout'
      };
    }

    if (error.kind === 'network') {
      return {
        status: 503,
        code: 'UPSTREAM_ERROR',
        message:
          context.messages?.upstream ||
          'Unable to access data right now. Please try again.',
        retryable: true,
        category: 'upstream_network'
      };
    }

    const permissionFailure =
      error.kind === 'permission' || error.kind === 'authentication';
    return {
      status: 502,
      code: 'UPSTREAM_ERROR',
      message: permissionFailure
        ? context.messages?.upstreamPermission ||
          context.messages?.upstream ||
          'Unable to access data right now. Please contact an admin if this continues.'
        : context.messages?.upstream ||
          'Unable to access data right now. Please try again.',
      retryable: permissionFailure ? false : error.retryable,
      category: permissionFailure
        ? 'upstream_authentication_or_permission'
        : 'upstream_failure'
    };
  }

  if (error instanceof ZodError) {
    return {
      status: 400,
      code: 'VALIDATION_ERROR',
      message:
        context.messages?.validation || 'Some provided details are invalid.',
      retryable: false,
      category: 'validation'
    };
  }

  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    message:
      context.messages?.internal ||
      'Unable to complete this action. Please try again.',
    retryable: false,
    category: 'internal'
  };
}

export function reportApiError(
  error: unknown,
  context: ApiErrorContext,
  override?: ApiErrorOverride
): ReportedApiError {
  const classified = classifyApiError(error, context, override);
  const traceId = randomUUID();
  const durationMs = Math.max(
    0,
    Date.now() - (context.startedAt || Date.now())
  );
  const sheetsDetails =
    error instanceof SheetsRequestError
      ? {
          upstream: 'google_sheets',
          target: error.target,
          sheetsAction: error.action,
          upstreamStatus: error.upstreamStatus,
          timeoutStage: error.timeoutStage,
          upstreamError: error.safeUpstreamError,
          sheetsDurationMs: error.durationMs
        }
      : {};

  console.error('[api-error]', {
    traceId,
    route: context.route,
    action: context.action,
    durationMs,
    category: classified.category,
    errorType: getErrorType(error),
    errorMessage: getErrorMessage(error),
    ...sheetsDetails
  });

  return {
    traceId,
    status: classified.status,
    code: classified.code,
    message: classified.message,
    retryable: classified.retryable
  };
}

export function sendApiError(
  res: ApiResponse,
  error: unknown,
  context: ApiErrorContext,
  override?: ApiErrorOverride
) {
  const reported = reportApiError(error, context, override);
  return res.status(reported.status).json({
    success: false,
    error: {
      code: reported.code,
      message: reported.message,
      retryable: reported.retryable,
      traceId: reported.traceId
    }
  });
}
