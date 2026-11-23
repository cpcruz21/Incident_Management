import { dataFile, readCategory, writeJson } from './data-files';

import { formatWeeklyReportRange } from '@/lib/report/weekly-period';

const MAPPINGS_FILE = dataFile('configuration', 'department-mappings.json');
const ASSIGNMENTS_FILE = dataFile('follow-ups', 'incident-assignments.json');
const AGING_REPORTS_FILE = dataFile('aging', 'aging-reports.json');
const WEEKLY_REPORTS_FILE = dataFile('weekly', 'weekly-reports.json');
const MONTHLY_REPORTS_FILE = dataFile('monthly', 'monthly-reports.json');
const IR_ANALYTICS_FILE = dataFile('analytics', 'ir-analytics.json');

import {
  DepartmentMappingConfig,
  DEFAULT_DEPARTMENT_MAPPINGS,
} from '@/lib/departments/mappings';
export type { DepartmentMappingConfig };
export { DEFAULT_DEPARTMENT_MAPPINGS };

export interface StoredIncidentAssignment {
  requestId: string;
  department: string;
  responsibleOrDependency: string;
  recentUpdate?: string;
  updatedAt: string;
  updatedBy: string;
}

export interface StoredIncidentAssignmentsMap {
  [requestId: string]: StoredIncidentAssignment;
}

export function getDepartmentMappings(): DepartmentMappingConfig {
  const mappings = readCategory<Partial<DepartmentMappingConfig>>('configuration', 'department-mappings.json', {});
  return { ...DEFAULT_DEPARTMENT_MAPPINGS, ...mappings } as DepartmentMappingConfig;
}

export function saveDepartmentMappings(mappings: DepartmentMappingConfig): void {
  writeJson(MAPPINGS_FILE, mappings);
}

export function getStoredAssignments(): StoredIncidentAssignmentsMap {
  return readCategory('follow-ups', 'incident-assignments.json', {});
}

export function saveAssignment(assignment: StoredIncidentAssignment): StoredIncidentAssignment {
  const existing = getStoredAssignments();
  existing[assignment.requestId] = {
    ...existing[assignment.requestId],
    ...assignment,
    updatedAt: new Date().toISOString(),
  };
  writeJson(ASSIGNMENTS_FILE, existing);
  return existing[assignment.requestId];
}

export function saveAssignmentsBulk(
  assignments: StoredIncidentAssignment[]
): StoredIncidentAssignment[] {
  const existing = getStoredAssignments();
  const now = new Date().toISOString();
  const saved: StoredIncidentAssignment[] = [];

  for (const item of assignments) {
    const updated: StoredIncidentAssignment = {
      ...existing[item.requestId],
      ...item,
      updatedAt: now,
    };
    existing[item.requestId] = updated;
    saved.push(updated);
  }

  writeJson(ASSIGNMENTS_FILE, existing);
  return saved;
}

export function isTeamAllowedForDepartment(_department: string, team: string): boolean {
  if (!team || !team.trim()) return false;
  return true;
}

export function getAllowedTeamsForDepartment(department: string): string[] {
  const mappings = getDepartmentMappings();
  const deptNormalized = (department || '').trim();

  if (mappings[deptNormalized] && mappings[deptNormalized].length > 0) {
    return mappings[deptNormalized];
  }

  const matchKey = Object.keys(mappings).find(
    (k) => k.toLowerCase() === deptNormalized.toLowerCase()
  );
  if (matchKey && mappings[matchKey] && mappings[matchKey].length > 0) {
    return mappings[matchKey];
  }

  return mappings['Not Assigned'] || [
    'ISS MT',
    'ISS Binondo',
    'SDS',
    'POS DB',
    'ECS HRAD',
    'ISMS Support',
    'PSD',
    'HR',
  ];
}

export function getServerStoredWeeklyReports(): Record<string, unknown>[] {
  return readCategory('weekly', 'weekly-reports.json', []);
}

function weeklyReportDate(report: Record<string, unknown>): number {
  const end = formatWeeklyReportRange(String(report.period ?? '')).to;
  const parts = /^(\d{2})-(\d{2})-(\d{4})/.exec(end ?? '');
  if (parts) return Date.UTC(Number(parts[3]), Number(parts[1]) - 1, Number(parts[2]));
  const generatedAt = (report.reportData as { generatedAt?: string } | undefined)?.generatedAt;
  const timestamp = Date.parse(generatedAt ?? '');
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function saveServerStoredWeeklyReport(report: Record<string, unknown>): void {
  const id = String(report.id || `weekly-${Date.now()}`);
  const period = String(report.period || '');
  const existing = getServerStoredWeeklyReports();
  const matchesPeriod = (item: Record<string, unknown>) => Boolean(period) && String(item.period) === period;
  const previous = existing.find(matchesPeriod) ?? existing.find(item => String(item.id) === id);
  const updated = { ...report, id: previous?.id || id, serverSavedAt: new Date().toISOString() };
  const reports = existing.filter(item => item === previous || (!matchesPeriod(item) && String(item.id) !== id));
  if (previous) {
    reports[reports.indexOf(previous)] = updated;
  } else {
    const date = weeklyReportDate(report);
    const index = reports.findIndex(item => weeklyReportDate(item) <= date);
    reports.splice(index === -1 ? reports.length : index, 0, updated);
  }
  writeJson(WEEKLY_REPORTS_FILE, reports);
}

export function getServerStoredAgingReports(): Record<string, unknown>[] {
  return readCategory<Record<string, unknown>[]>('aging', 'aging-reports.json', []).map(report => ({
    ...report,
    ...(report.id && report.reportData && typeof report.reportData === 'object'
      ? { reportData: { ...report.reportData, reportId: String(report.id) } }
      : {}),
  }));
}

export function saveServerStoredAgingReport(report: Record<string, unknown>): void {
  const existing = getServerStoredAgingReports();
  const reportId = String(report.id || `aging-${Date.now()}`);
  const previous = existing.findIndex(item => String(item.id) === reportId);
  const updated = { ...report, id: reportId, serverSavedAt: new Date().toISOString() };
  if (previous === -1) existing.unshift(updated);
  else existing[previous] = updated;
  writeJson(AGING_REPORTS_FILE, existing);
}

export function getServerStoredMonthlyReports(): Record<string, unknown>[] {
  return readCategory('monthly', 'monthly-reports.json', []);
}

export function saveServerStoredMonthlyReport(report: Record<string, unknown>, existingOnly = false): boolean {
  const existing = getServerStoredMonthlyReports();
  const reportId = String(report.id || `monthly-${Date.now()}`);
  const reportPeriod = String(report.period || '');
  const previous = existing.find(item => String(item.id) === reportId) ??
    existing.find(item => reportPeriod !== '' && String(item.period) === reportPeriod);
  if (existingOnly && !previous) return false;

  const updatedReport = { ...previous, ...report, id: previous?.id || reportId, serverSavedAt: new Date().toISOString() };
  const updated = previous
    ? existing.map(item => item === previous ? updatedReport : item)
    : [updatedReport, ...existing];
  writeJson(MONTHLY_REPORTS_FILE, updated);
  return true;
}

export function getServerStoredIRAnalytics(): Record<string, unknown> | null {
  return readCategory('analytics', 'ir-analytics.json', null);
}

export function saveServerStoredIRAnalytics(data: Record<string, unknown>): void {
  writeJson(IR_ANALYTICS_FILE, { ...data, serverSavedAt: new Date().toISOString() });
}


