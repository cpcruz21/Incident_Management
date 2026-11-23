import type { Incident } from '@/types/incident';

export function isMonthlyClosedTicket(incident: Incident): boolean {
  let status = incident.requestStatus?.trim();
  if (!status) {
    const entry = Object.entries(incident.rawData ?? {}).find(([key]) =>
      /^(request\s*status|ticket\s*status|status)$/i.test(key.trim())
    );
    status = String(entry?.[1] ?? '').trim();
  }
  return /^(closed?|resolved?|completed?)\b/i.test(status);
}
