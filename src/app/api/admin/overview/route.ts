import { NextResponse } from 'next/server';
import { normalizeStatus } from '@/lib/ir-analytics/engine';
import { requireAdmin } from '@/lib/server/auth';
import { listArchive } from '@/lib/server/archive';
import { getServerStoredAgingReports, getServerStoredMonthlyReports } from '@/lib/server/storage';
import type { Incident } from '@/types/incident';

export const dynamic = 'force-dynamic';

export function GET() {
  const denied = requireAdmin();
  if (denied) return denied;

  const reports = [...listArchive(), ...getServerStoredAgingReports(), ...getServerStoredMonthlyReports()];
  const ordered = reports.map((report) => ({
    rows: report.routedIncidents,
    savedAt: Date.parse(String('serverSavedAt' in report ? report.serverSavedAt : report.savedAt)) || 0,
  })).sort((a, b) => b.savedAt - a.savedAt);
  const incidents = new Map<string, Incident>();
  for (const { rows } of ordered) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows as Incident[]) {
      if (typeof row?.requestId !== 'string') continue;
      const id = row.requestId.trim().toLowerCase();
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
  for (const incident of Array.from(incidents.values())) {
    const status = normalizeStatus(String(incident.requestStatus || ''));
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
    averageDays: resolutions ? resolutionDays / resolutions : null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
