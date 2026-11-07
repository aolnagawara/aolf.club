import type { AppConfig } from './contracts/appContracts.js';

/** Keep the latest handoff visible without replacing the volunteer's notes. */
export function withVolunteerTransferNote(
  notes: string,
  fromEmail: string,
  toEmail: string | undefined,
  volunteers: AppConfig['volunteers'],
  timestamp: string
): string {
  const from = fromEmail.trim().toLowerCase();
  const to = toEmail?.trim().toLowerCase();
  if (!from || !to || from === to) {
    return notes;
  }
  const label = (email: string) =>
    volunteers.find((volunteer) => volunteer.email.toLowerCase() === email)
      ?.name || email;
  const date = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(new Date(timestamp));
  const transfer = `Transferred from ${label(from)} to ${label(to)} on ${date} IST.`;
  return [transfer, notes].filter(Boolean).join('\n');
}
