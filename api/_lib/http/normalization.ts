export function normalizeEmail(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function normalizeSpaces(value: string): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeIndianMobile(value: string): string {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  if (!digits) {
    return '';
  }

  let normalized = digits;
  if (normalized.length === 12 && normalized.startsWith('91')) {
    normalized = normalized.slice(2);
  }
  if (normalized.length === 11 && normalized.startsWith('0')) {
    normalized = normalized.slice(1);
  }
  if (normalized.length > 10) {
    normalized = normalized.slice(-10);
  }

  if (normalized.length !== 10) {
    return '';
  }

  const first = normalized[0];
  return first >= '6' && first <= '9' ? normalized : '';
}
