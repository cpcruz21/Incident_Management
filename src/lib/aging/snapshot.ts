import type { AgingReportData, RemarksTableData } from '@/types/aging';
import type { Incident } from '@/types/incident';
import { saveReport } from '@/lib/storage/report-storage';
import { persistServerAgingReport } from '@/lib/api/client';

export function createAgingReportId(): string {
  return `aging-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

/** Legacy records receive their archive ID on load; this covers standalone snapshots. */
export function getAgingReportId(data: AgingReportData): string {
  return data.reportId || `aging-${new Date(data.generatedAt).getTime()}-${data.reportPeriod.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
}

/** History must be newest first. Each matching IR receives its own copy of the last saved note. */
export function carryForwardAgingRemarks(table: RemarksTableData, history: AgingReportData[]): RemarksTableData {
  const prior = new Map<string, RemarksTableData['rows'][number]>();
  for (const report of history) {
    for (const row of report.remarksTable?.rows ?? []) {
      const key = row.requestId.trim().toLowerCase();
      if (!prior.has(key)) prior.set(key, row);
    }
  }
  return {
    ...table,
    rows: table.rows.map(row => {
      const previous = prior.get(row.requestId.trim().toLowerCase());
      return previous ? {
        ...row,
        department: previous.department,
        responsibleOrDependency: previous.responsibleOrDependency,
        recentUpdate: previous.recentUpdate,
        lastUpdated: previous.lastUpdated,
        updatedBy: previous.updatedBy,
        isUnsaved: false,
      } : { ...row, isUnsaved: false };
    }),
  };
}

/** Persist only this report's snapshot, never the shared per-IR follow-up list. */
export async function saveAgingSnapshot(
  data: AgingReportData,
  remarks: RemarksTableData,
  author: string,
  incidents?: Incident[],
  publish = false
): Promise<AgingReportData> {
  const now = new Date().toISOString();
  const snapshot: AgingReportData = {
    ...data,
    reportId: getAgingReportId(data),
    remarksTable: {
      ...remarks,
      rows: remarks.rows.map(row => ({
        ...row,
        ...(row.isUnsaved ? { lastUpdated: now, updatedBy: author } : {}),
        isUnsaved: false,
      })),
    },
  };
  const report = {
    id: snapshot.reportId!,
    title: snapshot.reportTitle || `Aging Incident Report - ${snapshot.reportPeriod}`,
    period: snapshot.reportPeriod,
    reportData: snapshot,
    routedIncidents: incidents,
    savedBy: author,
    savedAt: now,
  };
  await saveReport({ ...report, type: 'aging', author });
  if (publish && !await persistServerAgingReport(report)) {
    throw new Error('This report was archived, but publication failed. Save again to update the public dashboard.');
  }
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
      const channel = new BroadcastChannel('smac_report_updates');
      channel.postMessage({ type: 'report_saved', reportType: 'aging', id: report.id });
      channel.close();
    } catch { /* Saving remains successful when notifications are unavailable. */ }
  }
  return snapshot;
}
