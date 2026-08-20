import { JWT } from 'google-auth-library';
import { getSheetsEnv } from '../config/env.js';
import type { PamphletStore } from './pamphletStore.js';

const DRIVE_TIMEOUT_MS = 20_000;

let driveJwt: JWT | null = null;

function getDriveJwt(): JWT {
  if (driveJwt) {
    return driveJwt;
  }
  const env = getSheetsEnv();
  driveJwt = new JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive.file']
  });
  return driveJwt;
}

async function withDeadline<T>(task: Promise<T>, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), DRIVE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([task, deadline]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function encodeFileId(fileId: string): string {
  return encodeURIComponent(String(fileId || ''));
}

function readGoogleResponseData<T>(response: unknown): T {
  if (typeof response !== 'object' || response === null || !('data' in response)) {
    throw new Error('Google API response was missing a body.');
  }
  return (response as { data: T }).data;
}

export function createDrivePamphletStore(): PamphletStore {
  return {
    async upload(courseId, pamphlet) {
      const boundary = '-------aolfPamphlet';
      const metadata = JSON.stringify({
        name: 'aolf-course-' + courseId + '-pamphlet',
        mimeType: pamphlet.mimeType
      });
      const body = Buffer.concat([
        Buffer.from(
          '--' +
            boundary +
            '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
            metadata +
            '\r\n--' +
            boundary +
            '\r\nContent-Type: ' +
            pamphlet.mimeType +
            '\r\n\r\n'
        ),
        pamphlet.bytes,
        Buffer.from('\r\n--' + boundary + '--')
      ]);
      const response: unknown = await withDeadline(
        getDriveJwt().request({
          url: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
          method: 'POST',
          headers: {
            'Content-Type': 'multipart/related; boundary=' + boundary
          },
          data: body
        }),
        'Pamphlet upload timed out.'
      );
      const fileId = String(
        readGoogleResponseData<{ id?: string }>(response).id || ''
      ).trim();
      if (!fileId) {
        throw new Error('Pamphlet upload did not return a file id.');
      }
      return fileId;
    },
    async download(fileId) {
      if (!fileId) {
        return null;
      }
      const client = getDriveJwt();
      const encoded = encodeFileId(fileId);
      try {
        const [meta, media] = await withDeadline(
          Promise.all([
            client.request({
              url:
                'https://www.googleapis.com/drive/v3/files/' +
                encoded +
                '?fields=mimeType',
              method: 'GET'
            }),
            client.request({
              url:
                'https://www.googleapis.com/drive/v3/files/' +
                encoded +
                '?alt=media',
              method: 'GET',
              responseType: 'arraybuffer'
            })
          ]),
          'Pamphlet download timed out.'
        );
        return {
          mimeType: String(
            readGoogleResponseData<{ mimeType?: string }>(meta).mimeType ||
              'image/jpeg'
          ),
          bytes: Buffer.from(
            readGoogleResponseData<ArrayBuffer>(media)
          )
        };
      } catch {
        return null;
      }
    },
    async remove(fileId) {
      if (!fileId) {
        return;
      }
      try {
        await withDeadline(
          getDriveJwt().request({
            url:
              'https://www.googleapis.com/drive/v3/files/' +
              encodeFileId(fileId),
            method: 'DELETE'
          }),
          'Pamphlet delete timed out.'
        );
      } catch {
        // Best-effort cleanup; the Courses row is the source of truth.
      }
    }
  };
}
