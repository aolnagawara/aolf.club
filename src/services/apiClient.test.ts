import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiClient,
  ApiClientError,
  toUserErrorMessage
} from './apiClient';

describe('ApiClient error handling', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('preserves the structured backend error contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            error: {
              code: 'UPSTREAM_TIMEOUT',
              message: 'Unable to load data right now. Please try again.',
              retryable: true,
              traceId: 'trace-123'
            }
          }),
          { status: 504, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    const error = await new ApiClient('').get('/api/bootstrap').catch(
      (reason: unknown) => reason
    );

    expect(error).toEqual(expect.any(ApiClientError));
    expect(error).toMatchObject({
      status: 504,
      code: 'UPSTREAM_TIMEOUT',
      retryable: true,
      traceId: 'trace-123',
      message: 'Unable to load data right now. Please try again.'
    });
  });

  it('turns a browser network exception into a safe retryable error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    const error = await new ApiClient('').get('/api/bootstrap').catch(
      (reason: unknown) => reason
    );

    expect(error).toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
      retryable: true,
      message:
        'Unable to reach the server right now. Please check your connection and try again.'
    });
  });

  it('turns the browser deadline into a safe retryable timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout
    });
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    const result = new ApiClient('', 25)
      .get('/api/bootstrap')
      .catch((reason: unknown) => reason);

    await vi.advanceTimersByTimeAsync(25);

    await expect(result).resolves.toMatchObject({
      status: 0,
      code: 'TIMEOUT',
      retryable: true,
      message: 'The request is taking too long. Please try again.'
    });
  });

  it('does not expose arbitrary technical exception messages to users', () => {
    expect(
      toUserErrorMessage(
        new Error('UND_ERR_CONNECT_TIMEOUT'),
        'Unable to save your changes. Please try again.'
      )
    ).toBe('Unable to save your changes. Please try again.');
  });
});
