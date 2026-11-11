import type { Incident } from '@/types/incident';

/** TRUE means overdue/failed; FALSE means passed. Missing or invalid values stay unknown. */
export function isStatusOverdue(value: unknown): boolean | null {
  if (value === undefined || value === null) return null;
  const status = String(value).trim().toLowerCase();
  if (['true', 'yes', 'overdue', 'breached', 'failed', '1'].includes(status)) return true;
  if (['false', 'no', 'met', 'passed', 'pass', 'complied', 'compliant', '0'].includes(status)) return false;
  return null;
}

export function getImportedSLAStatus(incident: Incident, metric: 'firstResponse' | 'resolution'): boolean | null {
  const mapped = isStatusOverdue(metric === 'firstResponse' ? incident.rawFirstResponseStatus : incident.rawResolutionStatus);
  if (mapped !== null) return mapped;
  for (const [key, value] of Object.entries(incident.rawData || {})) {
    const name = key.toLowerCase().replace(/[\s_-]/g, '');
    const matches = metric === 'firstResponse'
      ? /^(firstresponse|fr)(overdue(status)?|sla(status)?|status)$/.test(name)
      : /^(overdue(status)?|resolution(time)?(overdue(status)?|sla(status)?|status))$/.test(name);
    if (matches) {
      const status = isStatusOverdue(value);
      if (status !== null) return status;
    }
  }
  return null;
}
