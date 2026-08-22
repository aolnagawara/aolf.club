export const MAX_PAMPHLET_BYTES = 600 * 1024;
export const PAMPHLET_SIZE_ERROR = 'Image must be < 600 kb';
export const ALLOWED_PAMPHLET_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp'
] as const;

export type AllowedPamphletMimeType =
  (typeof ALLOWED_PAMPHLET_MIME_TYPES)[number];

export function isAllowedPamphletMimeType(
  value: string
): value is AllowedPamphletMimeType {
  return (ALLOWED_PAMPHLET_MIME_TYPES as readonly string[]).includes(
    String(value || '')
      .trim()
      .toLowerCase()
  );
}

export function pamphletByteLengthFromBase64(base64: string): number {
  const raw = String(base64 || '').replace(/\s+/g, '');
  if (!raw) {
    return 0;
  }
  const padding = raw.endsWith('==') ? 2 : raw.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((raw.length * 3) / 4) - padding);
}

export function inspectPamphletUpload(
  base64: string,
  mimeType: string
): { ok: true } | { ok: false; message: string } {
  const mime = String(mimeType || '')
    .trim()
    .toLowerCase();
  if (!isAllowedPamphletMimeType(mime)) {
    return {
      ok: false,
      message: 'Pamphlet must be a JPEG, PNG, or WebP image.'
    };
  }
  if (pamphletByteLengthFromBase64(base64) >= MAX_PAMPHLET_BYTES) {
    return {
      ok: false,
      message: PAMPHLET_SIZE_ERROR
    };
  }
  if (!String(base64 || '').trim()) {
    return {
      ok: false,
      message: 'Choose a pamphlet image to upload.'
    };
  }
  return { ok: true };
}
