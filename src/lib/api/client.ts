import { DEFAULT_DEPARTMENT_MAPPINGS, DepartmentMappingConfig } from '@/lib/departments/mappings';

export interface StoredIncidentAssignmentClient {
  requestId: string;
  department: string;
  responsibleOrDependency: string;
  recentUpdate?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export async function fetchDepartmentMappings(): Promise<{
  mappings: DepartmentMappingConfig;
  departments: string[];
}> {
  try {
    const res = await fetch('/api/departments/mappings');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.mappings) {
        return {
          mappings: data.mappings,
          departments: data.departments || Object.keys(data.mappings),
        };
      }
    }
  } catch (error) {
    console.warn('API fetchDepartmentMappings failed, using defaults:', error);
  }
  return {
    mappings: DEFAULT_DEPARTMENT_MAPPINGS,
    departments: Object.keys(DEFAULT_DEPARTMENT_MAPPINGS),
  };
}

export async function fetchStoredAssignments(): Promise<Record<string, StoredIncidentAssignmentClient>> {
  try {
    const res = await fetch('/api/incidents/assignments');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.assignments) {
        return data.assignments;
      }
    }
  } catch (error) {
    console.warn('API fetchStoredAssignments failed:', error);
  }
  return {};
}

export async function persistAssignment(assignment: StoredIncidentAssignmentClient): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  allowedTeams?: string[];
  assignment?: StoredIncidentAssignmentClient;
}> {
  try {
    const res = await fetch('/api/incidents/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(assignment),
    });
    const data = await res.json();
    if (!res.ok) {
      return {
        success: false,
        error: data.error || 'Failed to persist assignment',
        allowedTeams: data.allowedTeams,
      };
    }
    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error saving assignment',
    };
  }
}

export async function persistAssignmentsBulk(assignments: StoredIncidentAssignmentClient[]): Promise<{
  success: boolean;
  savedCount?: number;
  error?: string;
  warnings?: { requestId: string; error: string }[];
}> {
  try {
    const res = await fetch('/api/incidents/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(assignments),
    });
    const data = await res.json();
    if (!res.ok) {
      return {
        success: false,
        error: data.error || data.message || 'Bulk save failed',
        warnings: data.errors,
      };
    }
    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error during bulk save',
    };
  }
}

export async function fetchServerAgingReports(): Promise<Record<string, unknown>[]> {
  try {
    const res = await fetch('/api/reports/aging');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.reports) {
        return data.reports;
      }
    }
  } catch (error) {
    console.warn('API fetchServerAgingReports failed:', error);
  }
  return [];
}

export async function persistServerAgingReport(report: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch('/api/reports/aging', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchServerMonthlyReports(): Promise<Record<string, unknown>[]> {
  try {
    const res = await fetch('/api/reports/monthly');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.reports) {
        return data.reports;
      }
    }
  } catch (error) {
    console.warn('API fetchServerMonthlyReports failed:', error);
  }
  return [];
}

export async function persistServerMonthlyReport(report: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch('/api/reports/monthly', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchServerIRAnalytics(): Promise<{ batches: unknown[]; tickets: unknown[] } | null> {
  try {
    const res = await fetch('/api/reports/ir-analytics');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.data) {
        return data.data;
      }
    }
  } catch (error) {
    console.warn('API fetchServerIRAnalytics failed:', error);
  }
  return null;
}

export async function persistServerIRAnalytics(data: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch('/api/reports/ir-analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.ok;
  } catch {
    return false;
  }
}

