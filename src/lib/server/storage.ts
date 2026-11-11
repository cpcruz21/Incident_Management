import { dataFile, readCategory, writeJson } from './data-files';

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

/**
 * Retrieve Department -> Responsible Teams configuration
 */
export function getDepartmentMappings(): DepartmentMappingConfig {
  const mappings = readCategory<Partial<DepartmentMappingConfig>>('configuration', 'department-mappings.json', {});
  return { ...DEFAULT_DEPARTMENT_MAPPINGS, ...mappings } as DepartmentMappingConfig;
}

/**
 * Persist Department -> Responsible Teams configuration
 */
export function saveDepartmentMappings(mappings: DepartmentMappingConfig): void {
  writeJson(MAPPINGS_FILE, mappings);
}

/**
 * Retrieve all persisted incident assignments
 */
export function getStoredAssignments(): StoredIncidentAssignmentsMap {
  return readCategory('follow-ups', 'incident-assignments.json', {});
}

/**
 * Persist an assignment for an incident
 */
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

/**
 * Bulk persist assignments
 */
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

/**
 * Backend verification: Checks whether a responsible team is valid
 */
export function isTeamAllowedForDepartment(_department: string, team: string): boolean {
  if (!team || !team.trim()) return false;
  return true;
}

/**
 * Retrieve allowed teams for a specific department
 */
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

/**
 * Get server-persisted aging reports
 */
export function getServerStoredWeeklyReports(): Record<string, unknown>[] {
  return readCategory('weekly', 'weekly-reports.json', []);
}

export function saveServerStoredWeeklyReport(report: Record<string, unknown>): void {
  const id = String(report.id || `weekly-${Date.now()}`);
  const period = String(report.period || '');
  const filtered = getServerStoredWeeklyReports().filter(item => String(item.id) !== id && (!period || String(item.period) !== period));
  writeJson(WEEKLY_REPORTS_FILE, [{ ...report, id, serverSavedAt: new Date().toISOString() }, ...filtered]);
}

export function getServerStoredAgingReports(): Record<string, unknown>[] {
  return readCategory<Record<string, unknown>[]>('aging', 'aging-reports.json', []).map(report => ({
    ...report,
    ...(report.id && report.reportData && typeof report.reportData === 'object'
      ? { reportData: { ...report.reportData, reportId: String(report.id) } }
      : {}),
  }));
}

/**
 * Save server-persisted aging report
 */
export function saveServerStoredAgingReport(report: Record<string, unknown>): void {
  const existing = getServerStoredAgingReports();
  const reportId = String(report.id || `aging-${Date.now()}`);
  // Only an explicit save of the same report may replace its snapshot.
  // Distinct extracts can legitimately have the same period label.
  const filtered = existing.filter((r) => String(r.id) !== reportId);
  const updated = [{ ...report, id: reportId, serverSavedAt: new Date().toISOString() }, ...filtered];
  writeJson(AGING_REPORTS_FILE, updated);
}

/**
 * Get server-persisted monthly reports
 */
export function getServerStoredMonthlyReports(): Record<string, unknown>[] {
  return readCategory('monthly', 'monthly-reports.json', []);
}

/**
 * Save server-persisted monthly report
 */
export function saveServerStoredMonthlyReport(report: Record<string, unknown>): void {
  const existing = getServerStoredMonthlyReports();
  const reportId = String(report.id || `monthly-${Date.now()}`);
  const reportPeriod = String(report.period || '');

  // Remove any existing entry with the same ID or the same period
  // (publishing the same month again replaces the old entry)
  const filtered = existing.filter(
    (r) => String(r.id) !== reportId && (reportPeriod === '' || String(r.period) !== reportPeriod)
  );
  const updated = [{ ...report, id: reportId, serverSavedAt: new Date().toISOString() }, ...filtered];
  writeJson(MONTHLY_REPORTS_FILE, updated);
}

/**
 * Get server-persisted IR analytics data
 */
export function getServerStoredIRAnalytics(): Record<string, unknown> | null {
  return readCategory('analytics', 'ir-analytics.json', null);
}

/**
 * Save server-persisted IR analytics data
 */
export function saveServerStoredIRAnalytics(data: Record<string, unknown>): void {
  writeJson(IR_ANALYTICS_FILE, { ...data, serverSavedAt: new Date().toISOString() });
}


