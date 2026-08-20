import type { PamphletStore } from './pamphletStore.js';

const BLOB_API_URL = 'https://vercel.com/api/blob';
const BLOB_API_VERSION = '12';
const BLOB_TIMEOUT_MS = 20_000;

export type BlobPamphletStoreOptions = {
  fetchImpl?: typeof fetch;
  getToken?: () => string;
};

function readBlobToken(): string {
  const token = String(process.env.BLOB_READ_WRITE_TOKEN || '').trim();
  if (!token) {
    throw new Error(
      'Pamphlet storage is not configured. Add BLOB_READ_WRITE_TOKEN in Vercel.'
    );
  }
  return token;
}

function extensionForMime(mimeType: string): string {
  if (mimeType === 'image/png') {
    return '.png';
  }
  if (mimeType === 'image/webp') {
    return '.webp';
  }
  return '.jpg';
}

export function isHttpsUrl(value: string): boolean {
  return /^https:\/\//i.test(String(value || '').trim());
}

function storeIdFromToken(token: string): string {
  return String(token || '').split('_')[3] || '';
}

async function withDeadline<T>(task: Promise<T>, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), BLOB_TIMEOUT_MS);
  });
  try {
    return await Promise.race([task, deadline]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string };
    };
    return String(body.error?.message || '').trim();
  } catch {
    return '';
  }
}

export function createBlobPamphletStore(
  options: BlobPamphletStoreOptions = {}
): PamphletStore {
  const fetchImpl = options.fetchImpl || fetch;
  const getToken = options.getToken || readBlobToken;

  function authHeaders(): Record<string, string> {
    const token = getToken();
    const storeId = storeIdFromToken(token);
    return {
      authorization: 'Bearer ' + token,
      'x-api-version': BLOB_API_VERSION,
      ...(storeId ? { 'x-vercel-blob-store-id': storeId } : {})
    };
  }

  return {
    async upload(courseId, pamphlet) {
      const pathname =
        'courses/' + courseId + '/pamphlet' + extensionForMime(pamphlet.mimeType);
      const response = await withDeadline(
        fetchImpl(BLOB_API_URL + '/?pathname=' + encodeURIComponent(pathname), {
          method: 'PUT',
          headers: {
            ...authHeaders(),
            'x-vercel-blob-access': 'public',
            'x-content-type': pamphlet.mimeType,
            'x-add-random-suffix': '1'
          },
          body: new Uint8Array(pamphlet.bytes)
        }),
        'Pamphlet upload timed out.'
      );
      if (!response.ok) {
        const detail = await readErrorMessage(response);
        throw new Error(detail || 'Pamphlet upload failed.');
      }
      const payload = (await response.json()) as { url?: string };
      const url = String(payload.url || '').trim();
      if (!isHttpsUrl(url)) {
        throw new Error('Pamphlet upload did not return a file url.');
      }
      return url;
    },
    async download(fileId) {
      const url = String(fileId || '').trim();
      if (!isHttpsUrl(url)) {
        return null;
      }
      try {
        const response = await withDeadline(
          fetchImpl(url, { method: 'GET' }),
          'Pamphlet download timed out.'
        );
        if (!response.ok) {
          return null;
        }
        return {
          mimeType: response.headers.get('content-type') || 'image/jpeg',
          bytes: Buffer.from(await response.arrayBuffer())
        };
      } catch {
        return null;
      }
    },
    async remove(fileId) {
      const url = String(fileId || '').trim();
      if (!isHttpsUrl(url)) {
        return;
      }
      try {
        await withDeadline(
          fetchImpl(BLOB_API_URL + '/delete', {
            method: 'POST',
            headers: {
              ...authHeaders(),
              'content-type': 'application/json'
            },
            body: JSON.stringify({ urls: [url] })
          }),
          'Pamphlet delete timed out.'
        );
      } catch {
        // Best-effort cleanup; the Courses row is the source of truth.
      }
    }
  };
}
