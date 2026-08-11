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
    } finally {
      window.clearTimeout(timeout);
    }
  }

  private async parseJson<T>(response: Response): Promise<T> {
    const json = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok) {
      const errorData =
        json.error && typeof json.error === 'object'
          ? (json.error as Record<string, unknown>)
          : null;

      throw new ApiClientError(
        typeof errorData?.message === 'string'
          ? errorData.message
          : 'API request failed with status ' + response.status,
        response.status,
        typeof errorData?.code === 'string' ? errorData.code : undefined
      );
    }
    return json as T;
  }
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export function isApiClientError(value: unknown): value is ApiClientError {
  return value instanceof ApiClientError;
}
