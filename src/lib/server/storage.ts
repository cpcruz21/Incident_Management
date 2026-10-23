import fs from 'fs';
import path from 'path';

// Data directory path
const DATA_DIR = path.join(process.cwd(), 'data');

const MAPPINGS_FILE = path.join(DATA_DIR, 'department-mappings.json');
const ASSIGNMENTS_FILE = path.join(DATA_DIR, 'incident-assignments.json');
const AGING_REPORTS_FILE = path.join(DATA_DIR, 'aging-reports.json');
const MONTHLY_REPORTS_FILE = path.join(DATA_DIR, 'monthly-reports.json');

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

// Ensure data directory exists
function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Retrieve Department -> Responsible Teams configuration
 */
export function getDepartmentMappings(): DepartmentMappingConfig {
  ensureDataDir();
  try {
    if (fs.existsSync(MAPPINGS_FILE)) {
      const content = fs.readFileSync(MAPPINGS_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      return { ...DEFAULT_DEPARTMENT_MAPPINGS, ...parsed };
    }
  } catch (error) {
    console.error('Error reading department mappings, using defaults:', error);
  }
  // Initialize with defaults if not exists
  saveDepartmentMappings(DEFAULT_DEPARTMENT_MAPPINGS);
  return DEFAULT_DEPARTMENT_MAPPINGS;
}

/**
 * Persist Department -> Responsible Teams configuration
 */
export function saveDepartmentMappings(mappings: DepartmentMappingConfig): void {
  ensureDataDir();
  fs.writeFileSync(MAPPINGS_FILE, JSON.stringify(mappings, null, 2), 'utf-8');
}

/**
 * Retrieve all persisted incident assignments
 */
export function getStoredAssignments(): StoredIncidentAssignmentsMap {
  ensureDataDir();
  try {
    if (fs.existsSync(ASSIGNMENTS_FILE)) {
      const content = fs.readFileSync(ASSIGNMENTS_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Error reading stored incident assignments:', error);
  }
  return {};
}

/**
 * Persist an assignment for an incident
 */
export function saveAssignment(assignment: StoredIncidentAssignment): StoredIncidentAssignment {
  ensureDataDir();
  const existing = getStoredAssignments();
  existing[assignment.requestId] = {
    ...existing[assignment.requestId],
    ...assignment,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(ASSIGNMENTS_FILE, JSON.stringify(existing, null, 2), 'utf-8');
  return existing[assignment.requestId];
}

/**
 * Bulk persist assignments
 */
export function saveAssignmentsBulk(
  assignments: StoredIncidentAssignment[]
): StoredIncidentAssignment[] {
  ensureDataDir();
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

  fs.writeFileSync(ASSIGNMENTS_FILE, JSON.stringify(existing, null, 2), 'utf-8');
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
export function getServerStoredAgingReports(): Record<string, unknown>[] {
  ensureDataDir();
  try {
    if (fs.existsSync(AGING_REPORTS_FILE)) {
      const content = fs.readFileSync(AGING_REPORTS_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Error reading stored aging reports:', error);
  }
  return [];
}

/**
 * Save server-persisted aging report
 */
export function saveServerStoredAgingReport(report: Record<string, unknown>): void {
  ensureDataDir();
  const existing = getServerStoredAgingReports();
  const reportId = String(report.id || `aging-${Date.now()}`);
  const filtered = existing.filter((r) => String(r.id) !== reportId);
  const updated = [{ ...report, id: reportId, serverSavedAt: new Date().toISOString() }, ...filtered];
  fs.writeFileSync(AGING_REPORTS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
}

/**
 * Get server-persisted monthly reports
 */
export function getServerStoredMonthlyReports(): Record<string, unknown>[] {
  ensureDataDir();
  try {
    if (fs.existsSync(MONTHLY_REPORTS_FILE)) {
      const content = fs.readFileSync(MONTHLY_REPORTS_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Error reading stored monthly reports:', error);
  }
  return [];
}

/**
 * Save server-persisted monthly report
 */
export function saveServerStoredMonthlyReport(report: Record<string, unknown>): void {
  ensureDataDir();
  const existing = getServerStoredMonthlyReports();
  const reportId = String(report.id || `monthly-${Date.now()}`);
  const filtered = existing.filter((r) => String(r.id) !== reportId);
  const updated = [{ ...report, id: reportId, serverSavedAt: new Date().toISOString() }, ...filtered];
  fs.writeFileSync(MONTHLY_REPORTS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
}

