import { UNSET_MEMBER_ENGAGEMENT } from './contracts/appContracts.js';

export function matchesMemberEngagement(
  quality: string | undefined,
  engagementLevel: string
): boolean {
  const requested = String(engagementLevel || '')
    .trim()
    .toLowerCase();
  if (!requested) {
    return true;
  }

  const current = String(quality || '')
    .trim()
    .toLowerCase();
  if (requested === UNSET_MEMBER_ENGAGEMENT) {
    return !current || current === 'engagement';
  }
  return current === requested;
}
