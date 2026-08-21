import { describe, expect, it, vi } from 'vitest';
import { createBlobPamphletStore } from '../../../api/_lib/courses/blobPamphlet.js';

const TOKEN = 'vercel_blob_rw_store123_secret';
const BLOB_URL =
  'https://store123.public.blob.vercel-storage.com/courses/crsHpNcr01AbcDefGhiJK/pamphlet.png';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

describe('Vercel Blob pamphlet store', () => {
  it('uploads a public blob and returns the HTTPS url', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ url: BLOB_URL }));
    const store = createBlobPamphletStore({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getToken: () => TOKEN
    });
    const url = await store.upload('crsHpNcr01AbcDefGhiJK', {
      mimeType: 'image/png',
      bytes: Buffer.from('png')
    });
    expect(url).toBe(BLOB_URL);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining(
        'pathname=courses%2FcrsHpNcr01AbcDefGhiJK%2Fpamphlet.png'
      ),
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          authorization: 'Bearer ' + TOKEN,
          'x-vercel-blob-access': 'public',
          'x-content-type': 'image/png',
          'x-vercel-blob-store-id': 'store123'
        })
      })
    );
  });

  it('downloads pamphlet bytes from a public HTTPS url', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(Buffer.from('png-bytes'), {
        status: 200,
        headers: { 'content-type': 'image/png' }
      });
    });
    const store = createBlobPamphletStore({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getToken: () => TOKEN
    });
    const pamphlet = await store.download(BLOB_URL);
    expect(pamphlet?.mimeType).toBe('image/png');
    expect(Buffer.from(pamphlet?.bytes || []).toString()).toBe('png-bytes');
  });

  it('ignores non-https pamphlet ids on download and delete', async () => {
    const fetchImpl = vi.fn();
    const store = createBlobPamphletStore({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getToken: () => TOKEN
    });
    await expect(store.download('1DriveFileIdNotAUrl')).resolves.toBeNull();
    await store.remove('1DriveFileIdNotAUrl');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('deletes a blob by url', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    const store = createBlobPamphletStore({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getToken: () => TOKEN
    });
    await store.remove(BLOB_URL);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('/delete'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ urls: [BLOB_URL] })
      })
    );
  });

  it('deletes all blobs for a course id', async () => {
    const extra =
      'https://store123.public.blob.vercel-storage.com/courses/crsHpNcr01AbcDefGhiJK/pamphlet-old.png';
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('prefix=')) {
        return jsonResponse({ blobs: [{ url: extra }] });
      }
      void init;
      return jsonResponse({});
    });
    const store = createBlobPamphletStore({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getToken: () => TOKEN
    });
    await store.removeCourse('crsHpNcr01AbcDefGhiJK', BLOB_URL);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('prefix=courses%2FcrsHpNcr01AbcDefGhiJK%2F'),
      expect.objectContaining({ method: 'GET' })
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('/delete'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ urls: [BLOB_URL, extra] })
      })
    );
  });
});
