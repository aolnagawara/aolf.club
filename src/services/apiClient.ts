import type { ApiErrorCode } from '../../shared/contracts/appContracts';

export type ApiClientErrorCode =
  ApiErrorCode | 'NETWORK_ERROR' | 'TIMEOUT' | 'INVALID_RESPONSE';

export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 15_000
  ) {}

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path, {
      method: 'GET',
      credentials: 'include'
    });
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  }

  async delete<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.baseUrl + path, {
        ...init,
        signal: controller.signal
      });
      return this.parseJson<T>(response);
    } catch (error) {
      if (isApiClientError(error)) {
        throw error;
      }
      if (controller.signal.aborted) {
        throw new ApiClientError(
          'The request is taking too long. Please try again.',
          0,
          'TIMEOUT',
          true
        );
      }
      throw new ApiClientError(
        'Unable to reach the server right now. Please check your connection and try again.',
        0,
        'NETWORK_ERROR',
        true
      );
    } finally {
      window.clearTimeout(timeout);
    }
  }

  private async parseJson<T>(response: Response): Promise<T> {
    let json: Record<string, unknown>;
    try {
      json = (await response.json()) as Record<string, unknown>;
    } catch {
      if (response.ok) {
        throw new ApiClientError(
          'The server returned an unexpected response. Please try again.',
          response.status,
          'INVALID_RESPONSE',
          true
        );
      }
      json = {};
    }
    if (!response.ok) {
      const errorData =
        json.error && typeof json.error === 'object'
          ? (json.error as Record<string, unknown>)
          : null;

      throw new ApiClientError(
        typeof errorData?.message === 'string'
          ? errorData.message
          : 'Unable to complete the request. Please try again.',
        response.status,
        typeof errorData?.code === 'string'
          ? (errorData.code as ApiClientErrorCode)
          : undefined,
        typeof errorData?.retryable === 'boolean' ? errorData.retryable : false,
        typeof errorData?.traceId === 'string' ? errorData.traceId : undefined
      );
    }
    return json as T;
  }
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: ApiClientErrorCode,
    public readonly retryable = false,
    public readonly traceId?: string
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export function isApiClientError(value: unknown): value is ApiClientError {
  return value instanceof ApiClientError;
}

export function toUserErrorMessage(error: unknown, fallback: string): string {
  if (!isApiClientError(error)) {
    return fallback;
  }
  if (error.code === 'FORBIDDEN') {
    return 'You do not have permission to perform this action.';
  }
  if (error.code === 'UNAUTHENTICATED') {
    return 'Your session has expired. Please sign in again.';
  }
  return error.message || fallback;
}
