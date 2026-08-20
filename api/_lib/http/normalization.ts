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

export { normalizeIndianMobile } from '../../../shared/contracts/indianMobile.js';
