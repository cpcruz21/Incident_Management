/**
 * Report Storage Service
 * Persists generated reports in the private server archive.
 */

import type { Incident } from '@/types/incident';
import type { WeeklyReportData } from '@/types/sla';
import type { AgingReportData } from '@/types/aging';
import type { MonthlyReportData } from '@/types/monthly';

const STORAGE_KEY = 'smac_incident_stored_reports';

export interface StoredReport {
  id: string;
  type: 'weekly' | 'aging' | 'monthly';
  title: string;
  period: string;
  savedAt: string; // ISO date string
  savedAtFormatted: string;
  author?: string;
  reportData: WeeklyReportData | AgingReportData | MonthlyReportData;
  routedIncidents?: Incident[];
}

/**
 * Retrieve all stored reports from localStorage
 */
export function getLegacyStoredReports(): StoredReport[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (err) {
    console.error('Failed to load stored reports:', err);
    return [];
  }
}

async function archiveRequest(method: string, body?: unknown) {
  const response = await fetch('/api/reports/archive', {
    method,
    cache: 'no-store',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error || 'The report archive is unavailable.');
  }
  return response;
}

let migration: Promise<void> | undefined;

export function migrateLegacyReports() {
  migration ??= (async () => {
    const legacy = getLegacyStoredReports();
    for (let index = 0; index < legacy.length; index += 10) {
      const reports = legacy.slice(index, index + 10).map((report) => ({
        ...report,
        type: report.type || ('currentWeek' in report.reportData ? 'weekly' :
          'agingRows' in report.reportData ? 'aging' : 'monthly'),
      }));
      await archiveRequest('POST', { reports, importLegacy: true });
    }
    if (legacy.length) localStorage.removeItem(STORAGE_KEY);
  })().finally(() => { migration = undefined; });
  return migration;
}

export async function getStoredReports(): Promise<StoredReport[]> {
  await migrateLegacyReports();
  const response = await archiveRequest('GET');
  const { reports } = await response.json() as { reports: StoredReport[] };
  return reports.map((report) => ({
    ...report,
    ...(report.type === 'aging' ? { reportData: { ...report.reportData, reportId: report.id } } : {}),
    routedIncidents: report.routedIncidents?.map((incident) => ({
      ...incident,
      createdTime: incident.createdTime ? new Date(incident.createdTime) : undefined,
      respondedDate: incident.respondedDate ? new Date(incident.respondedDate) : undefined,
      completedTime: incident.completedTime ? new Date(incident.completedTime) : undefined,
    })),
  }));
}

export async function saveReport(params: {
  id?: string;
  type: 'weekly' | 'aging' | 'monthly';
  title: string;
  period: string;
  author?: string;
  reportData: WeeklyReportData | AgingReportData | MonthlyReportData;
  routedIncidents?: Incident[];
}): Promise<StoredReport> {
  const now = new Date();
  const formattedDate = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const reportId = params.id || `report-${params.type}-${now.getTime()}-${Math.random().toString(36).slice(2)}`;

  const record: StoredReport = {
    id: reportId,
    type: params.type,
    title: params.title,
    period: params.period,
    savedAt: now.toISOString(),
    savedAtFormatted: formattedDate,
    author: params.author,
    reportData: params.reportData,
    routedIncidents: params.routedIncidents || [],
  };

  await archiveRequest('POST', { reports: [record] });
  return record;
}

/**
 * Delete a stored report by ID
 */
export async function deleteStoredReport(report: StoredReport): Promise<void> {
  await archiveRequest('DELETE', { id: report.id, type: report.type });
}

import { REPORT_TEAMS } from '@/lib/routing/routing-engine';
import type { PreviousWeekSLA } from '@/types/sla';
import type { PreviousWeekAging } from '@/types/aging';

/**
 * Extract PreviousWeekSLA values from a stored Weekly report
 */
export function extractWeeklySLAFromStored(report: StoredReport): PreviousWeekSLA {
  const data = report.reportData as WeeklyReportData;
  const firstResponse: Record<string, number | null> = {};
  const resolutionTime: Record<string, number | null> = {};

  for (const team of REPORT_TEAMS) {
    const frItem = data.currentWeek?.firstResponse?.find((t) => t.teamName === team);
    const rtItem = data.currentWeek?.resolutionTime?.find((t) => t.teamName === team);
    firstResponse[team] = frItem?.slaPassRate !== undefined ? frItem.slaPassRate : null;
    resolutionTime[team] = rtItem?.slaPassRate !== undefined ? rtItem.slaPassRate : null;
  }

  return {
    firstResponse,
    resolutionTime,
    firstResponseTotal: data.currentWeek?.firstResponseTotal?.slaPassRate ?? null,
    resolutionTimeTotal: data.currentWeek?.resolutionTimeTotal?.slaPassRate ?? null,
  };
}

/** Latest extraction first; never use the report being edited as its own comparison. */
export function getPriorAgingReports(reports: StoredReport[], beforeGeneratedAt?: Date | string): StoredReport[] {
  const cutoff = beforeGeneratedAt ? new Date(beforeGeneratedAt).getTime() : Infinity;
  const extractedAt = (report: StoredReport) => new Date(report.reportData.generatedAt || report.savedAt).getTime();
  return reports.filter((report) => report.type === 'aging' && extractedAt(report) < cutoff)
    .sort((a, b) => extractedAt(b) - extractedAt(a) || Date.parse(b.savedAt) - Date.parse(a.savedAt));
}

/** Extract aging counts and original SLA rates from the last saved extract. */
export function extractAgingFromStored(report: StoredReport): PreviousWeekAging {
  const data = report.reportData as AgingReportData;
  const teamTotals: Record<string, number | null> = {};
  const firstResponse: Record<string, number | null> = {};
  const resolutionTime: Record<string, number | null> = {};

  const teams = new Set([...REPORT_TEAMS, ...(data.teamOrder || []), ...(data.slaRows || []).map(row => row.teamName)]);
  for (const team of Array.from(teams)) {
    const row = data.agingRows?.find((r) => r.teamName === team);
    teamTotals[team] = row !== undefined ? row.totalAging : null;
    const slaRow = data.slaRows?.find((r) => r.teamName === team);
    firstResponse[team] = slaRow?.firstResponse.slaPassRate ?? null;
    resolutionTime[team] = slaRow?.resolutionTime.slaPassRate ?? null;
  }

  return {
    teamTotals,
    grandTotal: data.agingGrandTotal ?? null,
    sourcePeriod: report.period || data.reportPeriod,
    sourceReportId: report.id,
    sla: {
      firstResponse,
      resolutionTime,
      firstResponseTotal: data.slaTotals?.firstResponse.slaPassRate ?? null,
      resolutionTimeTotal: data.slaTotals?.resolutionTime.slaPassRate ?? null,
    },
  };
}
