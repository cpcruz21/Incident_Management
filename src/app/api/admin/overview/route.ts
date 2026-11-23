import { NextResponse } from 'next/server';
import { normalizeStatus } from '@/lib/ir-analytics/engine';
import { normalizeReportRequestId } from '@/lib/report/ticket-edits';
import { sdpDisplayId } from '@/lib/sdp/request-id';
import { requireAdmin } from '@/lib/server/auth';
import { listArchive } from '@/lib/server/archive';
import type { Incident } from '@/types/incident';

export const dynamic = 'force-dynamic';

export function GET() {
  const denied = requireAdmin();
  if (denied) return denied;

  const reports = listArchive().sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
  const incidents = new Map<string, Incident>();
  for (const { routedIncidents } of reports) {
    if (!Array.isArray(routedIncidents)) continue;
    for (const row of routedIncidents) {
      if (typeof row?.requestId !== 'string') continue;
      const id = sdpDisplayId(row.requestId) ?? normalizeReportRequestId(row.requestId);
      if (id && !incidents.has(id)) incidents.set(id, row);
    }
  }

  let open = 0;
  let pending = 0;
  let closed = 0;
  let unknown = 0;
  let resolutionDays = 0;
  let resolutions = 0;
  const counts = new Map<string, number>();
  const importedStatuses = new Map<string, { label: string | null; count: number }>();
  for (const incident of Array.from(incidents.values())) {
    const imported = String(incident.requestStatus ?? '').trim();
    const key = imported.toLowerCase();
    const entry = importedStatuses.get(key);
    if (entry) entry.count += 1;
    else importedStatuses.set(key, { label: imported || null, count: 1 });

    const status = normalizeStatus(imported);
    const created = incident.createdTime ? new Date(incident.createdTime) : null;
    const completed = incident.completedTime ? new Date(incident.completedTime) : null;
    if (status === 'closed' || status === 'resolved') {
      closed += 1;
      if (created && completed && Number.isFinite(created.getTime()) && completed >= created) {
        resolutionDays += (completed.getTime() - created.getTime()) / 86_400_000;
        resolutions += 1;
      }
    } else if (status === 'pending') pending += 1;
    else if (status === 'unknown') unknown += 1;
    else open += 1;

    if (created && Number.isFinite(created.getTime())) {
      const month = created.toISOString().slice(0, 7);
      counts.set(month, (counts.get(month) || 0) + 1);
    }
  }

  const latest = Array.from(counts.keys()).sort().at(-1);
  const trend = latest ? Array.from({ length: 6 }, (_, index) => {
    const month = new Date(`${latest}-01T00:00:00Z`);
    month.setUTCMonth(month.getUTCMonth() - (5 - index));
    return {
      label: month.toLocaleDateString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
      value: counts.get(month.toISOString().slice(0, 7)) || 0,
    };
  }) : [];

  return NextResponse.json({
    total: incidents.size, open, closed, pending, unknown, trend,
    importedStatuses: Array.from(importedStatuses.values()),
    averageDays: resolutions ? resolutionDays / resolutions : null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
