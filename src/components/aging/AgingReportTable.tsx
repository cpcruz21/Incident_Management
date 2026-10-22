'use client';

import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import type { AgingReportData, AgingRemarksRow } from '@/types/aging';
import type { Incident } from '@/types/incident';
import { AGING_BUCKET_ORDER, AGING_BUCKET_LABELS } from '@/types/aging';
import { formatSLAPercentage, buildRemarksTableData } from '@/lib/aging/calculator';
import { saveReport } from '@/lib/storage/report-storage';
import {
  fetchDepartmentMappings,
  fetchStoredAssignments,
  persistAssignment,
  persistAssignmentsBulk,
  persistServerAgingReport,
  StoredIncidentAssignmentClient,
} from '@/lib/api/client';
import { DEFAULT_DEPARTMENT_MAPPINGS } from '@/lib/departments/mappings';

interface AgingReportTableProps {
  data: AgingReportData;
  onCellClick?: (title: string, incidentIds: string[]) => void;
  routedIncidents?: Incident[];
  onSaveReport?: () => void;
  onUpdateRemarksRow?: (
    requestId: string,
    recentUpdate: string,
    responsibleOrDependency?: string,
    department?: string,
    lastUpdated?: string,
    updatedBy?: string,
    isUnsaved?: boolean
  ) => void;
  accountName?: string;
  isPublicView?: boolean;
}

export function AgingReportTable({
  data,
  onCellClick,
  routedIncidents,
  onSaveReport,
  onUpdateRemarksRow,
  accountName = 'System User',
  isPublicView = false,
}: AgingReportTableProps) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [activeTab, setActiveTabState] = useState<'aging' | 'remarks'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem('smac_active_report_tab');
        if (stored === 'aging' || stored === 'remarks') return stored;
      } catch { }
    }
    return 'aging';
  });

  const setActiveTab = useCallback((tab: 'aging' | 'remarks') => {
    setActiveTabState(tab);
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('smac_active_report_tab', tab);
      } catch { }
    }
  }, []);

  // Dynamic Department Mappings from Server API
  const [deptMappings, setDeptMappings] = useState<Record<string, string[]>>(DEFAULT_DEPARTMENT_MAPPINGS);
  const [availableDepartments, setAvailableDepartments] = useState<string[]>(Object.keys(DEFAULT_DEPARTMENT_MAPPINGS));

  // Stored assignments from database
  const [dbAssignments, setDbAssignments] = useState<Record<string, StoredIncidentAssignmentClient>>({});

  // Local unsaved row modifications: requestId -> partial row data
  const [unsavedEdits, setUnsavedEdits] = useState<
    Record<
      string,
      {
        department?: string;
        responsibleOrDependency?: string;
        recentUpdate?: string;
      }
    >
  >({});

  // Loading / saving spinners per row
  const [savingRows, setSavingRows] = useState<Record<string, boolean>>({});
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  // Toast / feedback message
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  // Filter & Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'critical' | 'high' | 'moderate' | 'low'>('ALL');
  const [onlyUnsavedFilter, setOnlyUnsavedFilter] = useState(false);
  const [sortBy, setSortBy] = useState<'aging-desc' | 'aging-asc' | 'id-asc' | 'dept-asc' | 'recent-update'>('aging-desc');

  // Auto-dismiss toast
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 4500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Load Department Mappings and Stored Assignments from backend API
  const loadBackendData = useCallback(async () => {
    try {
      const [mappingsRes, assignmentsRes] = await Promise.all([
        fetchDepartmentMappings(),
        fetchStoredAssignments(),
      ]);

      if (mappingsRes && mappingsRes.mappings) {
        setDeptMappings(mappingsRes.mappings);
        const depts =
          mappingsRes.departments && mappingsRes.departments.length > 0
            ? mappingsRes.departments
            : Object.keys(mappingsRes.mappings);
        setAvailableDepartments(depts);
      }

      if (assignmentsRes) {
        setDbAssignments(assignmentsRes);
      }
    } catch (err) {
      console.warn('Could not load backend metadata:', err);
    }
  }, []);

  useEffect(() => {
    loadBackendData();

    // Listen for cross-tab or server assignment sync without remounting or resetting tabs
    let bc: BroadcastChannel | null = null;
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        bc = new BroadcastChannel('smac_reports_sync');
        bc.onmessage = () => {
          loadBackendData();
        };
      }
    } catch { }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'smac_report_last_saved') {
        loadBackendData();
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('storage', handleStorage);
      if (bc) bc.close();
    };
  }, [loadBackendData]);

  // Normalize ambiguous team names to valid sub-team names.
  // Valid sub-teams: ISS MT, ISS Binondo, SDS, POS DB, ECS HRAD, ISMS Support, PSD, HR
  const normalizeResponsibleTeam = useCallback((resp: string | undefined, _contextStr = ''): string => {
    const raw = (resp || '').trim();
    if (!raw) return '';

    // Already a valid sub-team name → pass through as-is
    const validSubTeams = ['ISS MT', 'ISS Binondo', 'SDS', 'POS DB', 'ECS HRAD', 'ISMS Support', 'PSD', 'HR'];
    if (validSubTeams.includes(raw)) return raw;

    // Normalize ambiguous / ECS-level names to sub-team
    const lower = raw.toLowerCase();
    if (raw === 'ISS' || raw === 'ECS ISS' || raw === 'ISS Makati') return 'ISS MT';
    if (lower === 'ecs sds') return 'SDS';
    if (lower === 'ecs admin' || lower === 'hr admin' || lower === 'hrad' || lower === 'admin') return 'ECS HRAD';
    if (lower === 'ecs isms support') return 'ISMS Support';
    if (lower === 'ecs psd') return 'PSD';
    if (lower === 'ecs hr') return 'HR';
    if (lower === 'pos db' || lower.includes('pos')) return 'POS DB';

    return raw;
  }, []);

  // Retrieve allowed teams dynamically (all sub-teams available for selection)
  const getAllowedTeams = useCallback(
    (_deptName?: string): string[] => {
      const defaultTeams = [
        'ISS MT',
        'ISS Binondo',
        'SDS',
        'POS DB',
        'ECS HRAD',
        'ISMS Support',
        'PSD',
        'HR',
      ];
      return defaultTeams;
    },
    []
  );

  // Compute Base Remarks Table rows (combining router output, DB persistence, and local unsaved edits)
  const remarksData = useMemo(() => {
    let baseTable = data.remarksTable;
    if (!baseTable || baseTable.rows.length === 0) {
      if (routedIncidents && routedIncidents.length > 0) {
        baseTable = buildRemarksTableData(
          routedIncidents,
          new Date(data.generatedAt || Date.now()),
          data.reportPeriod
        );
      }
    }

    if (!baseTable) {
      return {
        createdOn: '',
        periodFrom: '',
        periodTo: '',
        totalRecords: 0,
        rows: [],
      };
    }

    const mergedRows: AgingRemarksRow[] = baseTable.rows.map((row) => {
      // 1. Check if there are persisted assignments in the database for this incident
      const dbRecord = dbAssignments[row.requestId];
      let dept = dbRecord?.department || row.department;
      let resp = dbRecord?.responsibleOrDependency || row.responsibleOrDependency;
      let update = dbRecord?.recentUpdate !== undefined ? dbRecord.recentUpdate : row.recentUpdate;
      let lastUpdated = dbRecord?.updatedAt || row.lastUpdated;
      let updatedBy = dbRecord?.updatedBy || row.updatedBy;
      let isUnsaved = false;

      // 2. Check if user made unsaved local edits
      const localEdit = unsavedEdits[row.requestId];
      if (localEdit) {
        if (localEdit.department !== undefined) dept = localEdit.department;
        if (localEdit.responsibleOrDependency !== undefined) resp = localEdit.responsibleOrDependency;
        if (localEdit.recentUpdate !== undefined) update = localEdit.recentUpdate;
        isUnsaved = true;
      }

      // 3. Normalize ISS
      resp = normalizeResponsibleTeam(resp, `${dept} ${row.description}`);

      return {
        ...row,
        department: dept,
        responsibleOrDependency: resp,
        recentUpdate: update,
        lastUpdated,
        updatedBy,
        isUnsaved,
      };
    });

    return {
      ...baseTable,
      rows: mergedRows,
      totalRecords: mergedRows.length,
    };
  }, [
    data.remarksTable,
    data.generatedAt,
    data.reportPeriod,
    routedIncidents,
    dbAssignments,
    unsavedEdits,
    normalizeResponsibleTeam,
  ]);

  // Handle local department change for a row (preserves automated responsible team)
  const handleDepartmentChange = (row: AgingRemarksRow, newDept: string) => {
    if (isPublicView) return;
    const currentResp = unsavedEdits[row.requestId]?.responsibleOrDependency ?? row.responsibleOrDependency;
    setUnsavedEdits((prev) => ({
      ...prev,
      [row.requestId]: {
        ...prev[row.requestId],
        department: newDept,
        isUnsaved: true,
      },
    }));

    if (onUpdateRemarksRow) {
      onUpdateRemarksRow(
        row.requestId,
        unsavedEdits[row.requestId]?.recentUpdate ?? row.recentUpdate,
        currentResp,
        newDept,
        row.lastUpdated,
        row.updatedBy,
        true
      );
    }
  };

  // Handle local responsible team change for a row
  const handleResponsibleChange = (row: AgingRemarksRow, newTeam: string) => {
    if (isPublicView) return;
    const normalized = normalizeResponsibleTeam(newTeam);
    setUnsavedEdits((prev) => ({
      ...prev,
      [row.requestId]: {
        ...prev[row.requestId],
        responsibleOrDependency: normalized,
      },
    }));

    if (onUpdateRemarksRow) {
      onUpdateRemarksRow(
        row.requestId,
        unsavedEdits[row.requestId]?.recentUpdate ?? row.recentUpdate,
        normalized,
        unsavedEdits[row.requestId]?.department ?? row.department,
        row.lastUpdated,
        row.updatedBy,
        true
      );
    }
  };

  // Handle local recent update remarks change
  const handleRemarksChange = (row: AgingRemarksRow, newRemarks: string) => {
    if (isPublicView) return;
    setUnsavedEdits((prev) => ({
      ...prev,
      [row.requestId]: {
        ...prev[row.requestId],
        recentUpdate: newRemarks,
      },
    }));

    if (onUpdateRemarksRow) {
      onUpdateRemarksRow(
        row.requestId,
        newRemarks,
        unsavedEdits[row.requestId]?.responsibleOrDependency ?? row.responsibleOrDependency,
        unsavedEdits[row.requestId]?.department ?? row.department,
        row.lastUpdated,
        row.updatedBy,
        true
      );
    }
  };

  // Save single row changes to backend database
  const handleSaveRow = async (row: AgingRemarksRow) => {
    const local = unsavedEdits[row.requestId];
    const deptToSave = local?.department ?? row.department;
    const teamToSave = local?.responsibleOrDependency ?? row.responsibleOrDependency;
    const updateToSave = local?.recentUpdate ?? row.recentUpdate;



    setSavingRows((prev) => ({ ...prev, [row.requestId]: true }));

    try {
      const result = await persistAssignment({
        requestId: row.requestId,
        department: deptToSave,
        responsibleOrDependency: teamToSave,
        recentUpdate: updateToSave,
        updatedBy: accountName,
      });

      if (result.success && result.assignment) {
        // Update local DB cache
        setDbAssignments((prev) => ({
          ...prev,
          [row.requestId]: result.assignment!,
        }));

        // Remove from unsaved
        setUnsavedEdits((prev) => {
          const next = { ...prev };
          delete next[row.requestId];
          return next;
        });

        if (onUpdateRemarksRow) {
          onUpdateRemarksRow(
            row.requestId,
            updateToSave,
            teamToSave,
            deptToSave,
            result.assignment.updatedAt,
            accountName,
            false
          );
        }

        setToastMessage({
          text: `✓ Saved incident ${row.requestId} assignment successfully to database.`,
          type: 'success',
        });

        // Broadcast to public dashboard for real-time live update
        if (typeof window !== 'undefined') {
          try {
            const bc = new BroadcastChannel('smac_reports_sync');
            bc.postMessage({ type: 'ASSIGNMENT_SAVED', timestamp: Date.now() });
            bc.close();
          } catch { }
          try {
            localStorage.setItem('smac_report_last_saved', String(Date.now()));
          } catch { }
        }
      } else {
        setToastMessage({
          text: `Save failed: ${result.error || 'Server rejected assignment'}`,
          type: 'error',
        });
      }
    } catch (err) {
      setToastMessage({
        text: `Network error saving incident ${row.requestId}. Please try again.`,
        type: 'error',
      });
    } finally {
      setSavingRows((prev) => ({ ...prev, [row.requestId]: false }));
    }
  };

  // Bulk save all unsaved rows
  const handleBulkSave = async () => {
    const unsavedKeys = Object.keys(unsavedEdits);
    if (unsavedKeys.length === 0) return;

    setIsBulkSaving(true);
    const payload: StoredIncidentAssignmentClient[] = [];

    for (const reqId of unsavedKeys) {
      const row = remarksData.rows.find((r) => r.requestId === reqId);
      if (!row) continue;
      const local = unsavedEdits[reqId];
      payload.push({
        requestId: reqId,
        department: local.department ?? row.department,
        responsibleOrDependency: local.responsibleOrDependency ?? row.responsibleOrDependency,
        recentUpdate: local.recentUpdate ?? row.recentUpdate,
        updatedBy: accountName,
      });
    }

    try {
      const result = await persistAssignmentsBulk(payload);
      if (result.success) {
        // Fetch fresh assignments from DB
        const fresh = await fetchStoredAssignments();
        setDbAssignments(fresh);
        setUnsavedEdits({});

        setToastMessage({
          text: `✓ Successfully persisted ${result.savedCount ?? payload.length} incident assignments to database.`,
          type: 'success',
        });

        // Broadcast to public dashboard for real-time live update
        if (typeof window !== 'undefined') {
          try {
            const bc = new BroadcastChannel('smac_reports_sync');
            bc.postMessage({ type: 'BULK_ASSIGNMENTS_SAVED', timestamp: Date.now() });
            bc.close();
          } catch { }
          try {
            localStorage.setItem('smac_report_last_saved', String(Date.now()));
          } catch { }
        }
      } else {
        setToastMessage({
          text: `Bulk save error: ${result.error || 'Some records failed validation'}`,
          type: 'error',
        });
      }
    } catch {
      setToastMessage({
        text: 'Network error during bulk save.',
        type: 'error',
      });
    } finally {
      setIsBulkSaving(false);
    }
  };

  // Overall Report Save (both local storage and server aging-reports)
  const handleSaveCompleteReport = async () => {
    const completeData: AgingReportData = {
      ...data,
      remarksTable: remarksData,
    };

    saveReport({
      type: 'aging',
      title: completeData.reportTitle,
      period: completeData.reportPeriod,
      reportData: completeData,
      routedIncidents,
    });

    // Also persist report to server backend
    await persistServerAgingReport({
      id: `aging-${Date.now()}`,
      title: completeData.reportTitle,
      period: completeData.reportPeriod,
      reportData: completeData,
      routedIncidents,
      savedBy: accountName,
      savedAt: new Date().toISOString(),
    });

    // Broadcast to public dashboard for real-time live update
    if (typeof window !== 'undefined') {
      try {
        const bc = new BroadcastChannel('smac_reports_sync');
        bc.postMessage({ type: 'REPORT_SAVED', timestamp: Date.now() });
        bc.close();
      } catch { }
      try {
        localStorage.setItem('smac_report_last_saved', String(Date.now()));
      } catch { }
    }

    setIsSaved(true);
    if (onSaveReport) onSaveReport();
    setToastMessage({
      text: '✓ Report archive saved successfully (both local storage and server database).',
      type: 'success',
    });
    setTimeout(() => setIsSaved(false), 4000);
  };

  const formattedDate = (() => {
    try {
      const d =
        typeof data.generatedAt === 'string'
          ? new Date(data.generatedAt)
          : data.generatedAt;
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  })();

  const getPercentageClass = (value: number | null): string => {
    if (value === null) return 'sla-na';
    if (value >= 90) return 'sla-excellent';
    if (value >= 70) return 'sla-good';
    if (value >= 50) return 'sla-warning';
    return 'sla-critical';
  };

  const handleClick = (title: string, ids: string[]) => {
    if (onCellClick && ids && ids.length > 0) {
      onCellClick(title, ids);
    }
  };

  // Calculate aging grand totals per bucket for Tab 1
  const bucketTotals: Record<string, number> = {};
  for (const bucket of AGING_BUCKET_ORDER) {
    bucketTotals[bucket] = data.agingRows.reduce((sum, row) => sum + row.buckets[bucket], 0);
  }

  // KPI Metrics Calculation for Remarks Table
  const kpiMetrics = useMemo(() => {
    const rows = remarksData.rows;
    let critical = 0; // > 30 days
    let high = 0; // 15 - 30 days
    let moderate = 0; // 8 - 14 days
    let low = 0; // < 8 days
    let unsaved = 0;

    for (const r of rows) {
      if (r.agingDays > 30) critical++;
      else if (r.agingDays >= 15) high++;
      else if (r.agingDays >= 8) moderate++;
      else low++;

      if (r.isUnsaved) unsaved++;
    }

    return {
      total: rows.length,
      critical,
      high,
      moderate,
      low,
      unsaved,
    };
  }, [remarksData.rows]);

  // Unique lists of departments and teams found in the current rows for quick filters
  const filterOptions = useMemo(() => {
    const deptSet = new Set<string>();
    const teamSet = new Set<string>();

    for (const r of remarksData.rows) {
      if (r.department) deptSet.add(r.department);
      if (r.responsibleOrDependency) teamSet.add(r.responsibleOrDependency);
    }

    // Also include configured departments
    for (const d of availableDepartments) {
      deptSet.add(d);
    }

    return {
      departments: Array.from(deptSet).sort(),
      teams: Array.from(teamSet).sort(),
    };
  }, [remarksData.rows, availableDepartments]);

  // Filtered & Sorted remarks rows
  const filteredAndSortedRows = useMemo(() => {
    let result = [...remarksData.rows];

    // 1. Text Search Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (r) =>
          r.requestId.toLowerCase().includes(q) ||
          r.department.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          r.subCategory.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.recentUpdate.toLowerCase().includes(q) ||
          r.responsibleOrDependency.toLowerCase().includes(q) ||
          String(r.agingDays).includes(q)
      );
    }

    // 2. Department Filter
    if (deptFilter !== 'ALL') {
      result = result.filter((r) => r.department.toLowerCase() === deptFilter.toLowerCase());
    }

    // 3. Team Filter
    if (teamFilter !== 'ALL') {
      result = result.filter(
        (r) => r.responsibleOrDependency.toLowerCase() === teamFilter.toLowerCase()
      );
    }

    // 4. Severity Filter
    if (severityFilter === 'critical') {
      result = result.filter((r) => r.agingDays > 30);
    } else if (severityFilter === 'high') {
      result = result.filter((r) => r.agingDays >= 15 && r.agingDays <= 30);
    } else if (severityFilter === 'moderate') {
      result = result.filter((r) => r.agingDays >= 8 && r.agingDays <= 14);
    } else if (severityFilter === 'low') {
      result = result.filter((r) => r.agingDays < 8);
    }

    // 5. Unsaved Only Filter
    if (onlyUnsavedFilter) {
      result = result.filter((r) => Boolean(r.isUnsaved));
    }

    // 6. Sorting
    result.sort((a, b) => {
      if (sortBy === 'aging-desc') return b.agingDays - a.agingDays;
      if (sortBy === 'aging-asc') return a.agingDays - b.agingDays;
      if (sortBy === 'id-asc') return a.requestId.localeCompare(b.requestId);
      if (sortBy === 'dept-asc') return a.department.localeCompare(b.department);
      if (sortBy === 'recent-update') {
        const hasA = Boolean(a.recentUpdate && a.recentUpdate.trim().length > 0);
        const hasB = Boolean(b.recentUpdate && b.recentUpdate.trim().length > 0);
        if (hasA === hasB) return b.agingDays - a.agingDays;
        return hasA ? -1 : 1;
      }
      return 0;
    });

    return result;
  }, [
    remarksData.rows,
    searchQuery,
    deptFilter,
    teamFilter,
    severityFilter,
    onlyUnsavedFilter,
    sortBy,
  ]);

  return (
    <div className="aging-report-wrapper" ref={reportRef} style={{ width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'hidden', boxSizing: 'border-box' }}>
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className={`aging-toast-notification toast-${toastMessage.type}`} role="alert">
          <span className="toast-icon">
            {toastMessage.type === 'success' ? '✓' : toastMessage.type === 'error' ? '⚠️' : 'ℹ️'}
          </span>
          <span className="toast-text">{toastMessage.text}</span>
          <button
            type="button"
            className="toast-close-btn"
            onClick={() => setToastMessage(null)}
            title="Dismiss notification"
          >
            ✕
          </button>
        </div>
      )}

      {/* ═══════ TOP TAB NAVIGATION SWITCHER ═══════ */}
      <div className="report-tab-switcher-container">
        <div className="report-tab-switcher">
          <button
            type="button"
            className={`report-tab-btn ${activeTab === 'aging' ? 'active' : ''}`}
            onClick={() => setActiveTab('aging')}
          >
            <span className="tab-icon">📊</span>
            <span>Aging Module (SLA & Distribution)</span>
          </button>
          <button
            type="button"
            className={`report-tab-btn ${activeTab === 'remarks' ? 'active' : ''}`}
            onClick={() => setActiveTab('remarks')}
          >
            <span className="tab-icon">📝</span>
            <span>Remarks Table</span>
            {remarksData.totalRecords > 0 && (
              <span className="remarks-count-pill">{remarksData.totalRecords}</span>
            )}
            {!isPublicView && kpiMetrics.unsaved > 0 && (
              <span className="unsaved-badge-pill" title={`${kpiMetrics.unsaved} unsaved changes`}>
                ● {kpiMetrics.unsaved} Unsaved
              </span>
            )}
          </button>
        </div>

        {/* Action Controls for Global Save - hidden on public insights dashboard */}
        {!isPublicView && (
          <div className="tab-bar-actions">
            {kpiMetrics.unsaved > 0 && (
              <button
                type="button"
                className="btn btn-primary btn-save-bulk"
                onClick={handleBulkSave}
                disabled={isBulkSaving}
                title="Save all modified incident assignments to database"
              >
                {isBulkSaving ? '💾 Saving All...' : `💾 Save All Unsaved (${kpiMetrics.unsaved})`}
              </button>
            )}
            <button
              type="button"
              className={`btn-save-report ${isSaved ? 'is-saved' : ''}`}
              onClick={handleSaveCompleteReport}
              title="Save complete report data to system archive"
            >
              {isSaved ? (
                <>
                  <span className="save-icon">✓</span> Archive Saved
                </>
              ) : (
                <>
                  <span className="save-icon">💾</span> Archive Report
                </>
              )}
            </button>
          </div>
        )}
      </div>

      <div className="aging-report-canvas" id="aging-report-canvas">

        {activeTab === 'aging' && (
          <div className="aging-module-container">
            {/* ═══════ TABLE 1: SLA COMPLIANCE ═══════ */}
            <div className="aging-section-header aging-sla-header">
              <h1 className="aging-report-title">Aging IR</h1>
              <p className="aging-report-period">{data.reportPeriod}</p>
            </div>

            <div className="aging-table-responsive-wrapper" style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden', minWidth: 0 }}>
              <table className="aging-sla-table" style={{ width: '100%', maxWidth: '100%', tableLayout: 'fixed', wordBreak: 'break-word' }}>
                <thead>
                  <tr className="aging-header-groups">
                    <th className="aging-col-tech" rowSpan={2}>Final Team</th>
                    <th className="aging-col-total-irs" rowSpan={2}>Total # of IRs</th>
                    <th className="aging-header-fr" colSpan={3}>First Response</th>
                    <th className="aging-header-rt" colSpan={3}>Resolution Time</th>
                  </tr>
                  <tr className="aging-header-sub">
                    <th className="aging-sub-failed">Failed</th>
                    <th className="aging-sub-passed">Passed</th>
                    <th className="aging-sub-sla">SLA Pass Rate this week</th>
                    <th className="aging-sub-failed">Failed</th>
                    <th className="aging-sub-passed">Passed</th>
                    <th className="aging-sub-sla">SLA Pass Rate this week</th>
                  </tr>
                </thead>
                <tbody>
                  {data.slaRows.map((row) => (
                    <tr key={row.teamName} className="aging-data-row">
                      <td className="aging-cell-tech">{row.teamName}</td>
                      <td
                        className="aging-cell-num clickable"
                        onClick={() => handleClick(`${row.teamName} — Total IRs`, row.incidentIds)}
                      >
                        {row.totalIRs > 0 ? row.totalIRs : 0}
                      </td>
                      {/* First Response */}
                      <td
                        className={`aging-cell-num clickable ${row.firstResponse.failed > 0 ? 'aging-has-failures' : ''}`}
                        onClick={() => handleClick(`${row.teamName} — FR Failed`, row.firstResponse.failedIds)}
                      >
                        {row.totalIRs > 0 ? row.firstResponse.failed : 0}
                      </td>
                      <td
                        className="aging-cell-num clickable"
                        onClick={() => handleClick(`${row.teamName} — FR Passed`, row.firstResponse.passedIds)}
                      >
                        {row.totalIRs > 0 ? row.firstResponse.passed : 0}
                      </td>
                      <td className={`aging-cell-sla ${getPercentageClass(row.firstResponse.slaPassRate)}`}>
                        {row.totalIRs > 0 ? formatSLAPercentage(row.firstResponse.slaPassRate) : 'N/A'}
                      </td>
                      {/* Resolution Time */}
                      <td
                        className={`aging-cell-num clickable ${row.resolutionTime.failed > 0 ? 'aging-has-failures' : ''}`}
                        onClick={() => handleClick(`${row.teamName} — RT Failed`, row.resolutionTime.failedIds)}
                      >
                        {row.totalIRs > 0 ? row.resolutionTime.failed : 0}
                      </td>
                      <td
                        className="aging-cell-num clickable"
                        onClick={() => handleClick(`${row.teamName} — RT Passed`, row.resolutionTime.passedIds)}
                      >
                        {row.totalIRs > 0 ? row.resolutionTime.passed : 0}
                      </td>
                      <td className={`aging-cell-sla ${getPercentageClass(row.resolutionTime.slaPassRate)}`}>
                        {row.totalIRs > 0 ? formatSLAPercentage(row.resolutionTime.slaPassRate) : 'N/A'}
                      </td>
                    </tr>
                  ))}

                  {/* Total Row */}
                  <tr className="aging-total-row">
                    <td className="aging-cell-tech aging-total-label">Total</td>
                    <td className="aging-total-val">{data.slaTotals.totalIRs}</td>
                    <td className={`aging-total-val ${data.slaTotals.firstResponse.failed > 0 ? 'aging-has-failures' : ''}`}>
                      {data.slaTotals.firstResponse.failed}
                    </td>
                    <td className="aging-total-val">{data.slaTotals.firstResponse.passed}</td>
                    <td className={`aging-total-sla ${getPercentageClass(data.slaTotals.firstResponse.slaPassRate)}`}>
                      {formatSLAPercentage(data.slaTotals.firstResponse.slaPassRate)}
                    </td>
                    <td className={`aging-total-val ${data.slaTotals.resolutionTime.failed > 0 ? 'aging-has-failures' : ''}`}>
                      {data.slaTotals.resolutionTime.failed}
                    </td>
                    <td className="aging-total-val">{data.slaTotals.resolutionTime.passed}</td>
                    <td className={`aging-total-sla ${getPercentageClass(data.slaTotals.resolutionTime.slaPassRate)}`}>
                      {formatSLAPercentage(data.slaTotals.resolutionTime.slaPassRate)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ═══════ TABLE 2: AGING DISTRIBUTION ═══════ */}
            <div className="aging-section-header aging-dist-header">
              <h1 className="aging-report-title">Aging Incident Report</h1>
            </div>

            <div className="aging-table-responsive-wrapper" style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden', minWidth: 0 }}>
              <table className="aging-dist-table" style={{ width: '100%', maxWidth: '100%', tableLayout: 'fixed', wordBreak: 'break-word' }}>
                <thead>
                  <tr className="aging-dist-header-groups">
                    <th className="aging-col-tech" rowSpan={2}>FINAL TEAM</th>
                    <th className="aging-dist-main-header" colSpan={6}>Aging Incident Report</th>
                    <th className="aging-dist-this-week" rowSpan={2}>
                      <div className="aging-week-label">Total Aging IRs</div>
                      <div className="aging-week-sub">as of this week</div>
                    </th>
                    <th className="aging-dist-last-week" rowSpan={2}>
                      <div className="aging-week-label">Total Aging IRs</div>
                      <div className="aging-week-sub">as of last week</div>
                    </th>
                  </tr>
                  <tr className="aging-dist-header-sub">
                    {AGING_BUCKET_ORDER.map((bucket) => (
                      <th key={bucket} className="aging-bucket-header">
                        {AGING_BUCKET_LABELS[bucket]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.agingRows.map((row) => {
                    const prevWeekTotal = data.previousWeek.teamTotals[row.teamName];
                    return (
                      <tr key={row.teamName} className="aging-dist-data-row">
                        <td className="aging-cell-tech">{row.teamName}</td>
                        {AGING_BUCKET_ORDER.map((bucket) => (
                          <td
                            key={bucket}
                            className={`aging-bucket-cell clickable ${row.buckets[bucket] > 0 ? 'aging-bucket-filled' : ''}`}
                            onClick={() =>
                              handleClick(
                                `${row.teamName} — ${AGING_BUCKET_LABELS[bucket]}`,
                                row.bucketIncidentIds[bucket]
                              )
                            }
                          >
                            {row.buckets[bucket] > 0 ? row.buckets[bucket] : ''}
                          </td>
                        ))}
                        <td className="aging-this-week-cell">
                          {row.totalAging > 0 ? row.totalAging : '-'}
                        </td>
                        <td className="aging-last-week-cell">
                          {prevWeekTotal !== null && prevWeekTotal !== undefined ? prevWeekTotal : '-'}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Total Row */}
                  <tr className="aging-dist-total-row">
                    <td className="aging-cell-tech aging-total-label">Total</td>
                    {AGING_BUCKET_ORDER.map((bucket) => (
                      <td key={bucket} className="aging-dist-total-val">
                        {bucketTotals[bucket] > 0 ? bucketTotals[bucket] : ''}
                      </td>
                    ))}
                    <td className="aging-dist-grand-this">
                      {data.agingGrandTotal > 0 ? data.agingGrandTotal : '-'}
                    </td>
                    <td className="aging-dist-grand-last">
                      {data.previousWeek.grandTotal !== null ? data.previousWeek.grandTotal : '-'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════ */}
        {/* TAB 2: REMARKS TABLE (FOR AGING DAYS >= 8)               */}
        {/* ═════════════════════════════════════════════════════════ */}
        {activeTab === 'remarks' && (
          <div className="remarks-table-section">

            {/* Report Date and Summary Information */}
            <div className="remarks-meta-header-panel">
              <div className="report-summary-panel">
                {/* 1. Created On */}
                <div className="summary-field field-created">
                  <span className="summary-label">Created on :</span>
                  <span className="summary-value summary-date">
                    {remarksData.createdOn || formattedDate}
                  </span>
                </div>

                {/* 2. Total Records */}
                <div className="summary-field field-total">
                  <span className="summary-label">TOTAL RECORDS :</span>
                  <span className="summary-value summary-total">
                    {remarksData.totalRecords}
                  </span>
                </div>

                {/* 3. From */}
                <div className="summary-field field-from">
                  <span className="summary-label">From :</span>
                  <span className="summary-value summary-date">
                    {remarksData.periodFrom || 'N/A'}
                  </span>
                </div>

                {/* 4. To */}
                <div className="summary-field field-to">
                  <span className="summary-label">To :</span>
                  <span className="summary-value summary-date">
                    {remarksData.periodTo || 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Comprehensive Toolbar: Search, Filters, Sorting, Actions */}
            <div className="remarks-advanced-toolbar">
              <div className="toolbar-search-group">
                <div className="search-input-wrapper">
                  <span className="search-icon">🔍</span>
                  <input
                    type="text"
                    placeholder="Search Request ID, Dept, Desc, Remarks, Team..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="remarks-search-input"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="search-clear-btn"
                      onClick={() => setSearchQuery('')}
                      title="Clear search"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              <div className="toolbar-filters-group">
                {/* Department Filter */}
                <div className="filter-select-wrapper">
                  <label htmlFor="dept-filter-select" className="filter-label">Dept:</label>
                  <select
                    id="dept-filter-select"
                    value={deptFilter}
                    onChange={(e) => setDeptFilter(e.target.value)}
                    className="filter-select"
                  >
                    <option value="ALL">All Departments ({filterOptions.departments.length})</option>
                    {filterOptions.departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Responsible Team Filter */}
                <div className="filter-select-wrapper">
                  <label htmlFor="team-filter-select" className="filter-label">Team:</label>
                  <select
                    id="team-filter-select"
                    value={teamFilter}
                    onChange={(e) => setTeamFilter(e.target.value)}
                    className="filter-select"
                  >
                    <option value="ALL">All Teams ({filterOptions.teams.length})</option>
                    {filterOptions.teams.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Severity Filter */}
                <div className="filter-select-wrapper">
                  <label htmlFor="sev-filter-select" className="filter-label">Aging:</label>
                  <select
                    id="sev-filter-select"
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value as any)}
                    className="filter-select"
                  >
                    <option value="ALL">All Aging Days</option>
                    <option value="critical">Critical (&gt; 30 Days)</option>
                    <option value="high">High (15–30 Days)</option>
                    <option value="moderate">Moderate (8–14 Days)</option>
                    <option value="low">Recent / Standard (&lt; 8 Days)</option>
                  </select>
                </div>

                {/* Sort Order */}
                <div className="filter-select-wrapper">
                  <label htmlFor="sort-by-select" className="filter-label">Sort:</label>
                  <select
                    id="sort-by-select"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="filter-select"
                  >
                    <option value="aging-desc">Aging Days (High → Low)</option>
                    <option value="aging-asc">Aging Days (Low → High)</option>
                    <option value="id-asc">Request ID (Ascending)</option>
                    <option value="dept-asc">Department (A → Z)</option>
                    <option value="recent-update">Has Recent Update</option>
                  </select>
                </div>

                {/* Unsaved Only Toggle - hidden in public view */}
                {!isPublicView && kpiMetrics.unsaved > 0 && (
                  <button
                    type="button"
                    className={`btn-filter-toggle ${onlyUnsavedFilter ? 'active' : ''}`}
                    onClick={() => setOnlyUnsavedFilter(!onlyUnsavedFilter)}
                    title="Toggle viewing only records with unsaved edits"
                  >
                    ● Only Unsaved ({kpiMetrics.unsaved})
                  </button>
                )}
              </div>
            </div>

            {!isPublicView && kpiMetrics.unsaved > 0 && (
              <div className="unsaved-prompt-text">
                ⚠️ You have <strong>{kpiMetrics.unsaved}</strong> unsaved record{kpiMetrics.unsaved > 1 ? 's' : ''}.
                Click <strong>&quot;Save All Unsaved&quot;</strong> in the toolbar above to persist your changes.
              </div>
            )}
            <div className="remarks-table-scroll-wrap" style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden' }}>
              <table className="remarks-main-table" style={{ width: '100%', maxWidth: '100%', tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th style={{ width: '8%', textAlign: 'center' }}>RequestID</th>
                    <th style={{ width: '13%', textAlign: 'center' }}>Department</th>
                    <th style={{ width: '14%', textAlign: 'left' }}>Category</th>
                    <th style={{ width: '14%', textAlign: 'left' }}>Sub Category</th>
                    <th style={{ width: '21%', textAlign: 'left' }}>Description</th>
                    <th style={{ width: '6%', textAlign: 'center' }}>Aging Days</th>
                    <th style={{ width: '12%', textAlign: 'left' }}>Recent Update</th>
                    <th style={{ width: '12%', textAlign: 'center' }}>Responsible or Dependency</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="remarks-empty-cell">
                        <div className="empty-state-content">
                          <span className="empty-state-icon">🔍</span>
                          <p className="empty-state-title">No matching aging incidents found</p>
                          <p className="empty-state-sub">
                            Try adjusting your search query or clear active department/severity filters.
                          </p>
                          {(searchQuery || deptFilter !== 'ALL' || teamFilter !== 'ALL' || severityFilter !== 'ALL' || onlyUnsavedFilter) && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                setSearchQuery('');
                                setDeptFilter('ALL');
                                setTeamFilter('ALL');
                                setSeverityFilter('ALL');
                                setOnlyUnsavedFilter(false);
                              }}
                            >
                              Reset All Filters
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredAndSortedRows.map((row: AgingRemarksRow) => {
                      const hasUpdate = Boolean(row.recentUpdate && row.recentUpdate.trim().length > 0);
                      const isRowUnsaved = Boolean(row.isUnsaved);

                      // Get dynamically allowed teams based on THIS record's department
                      const allowedTeams = getAllowedTeams(row.department);

                      const currentTeam = normalizeResponsibleTeam(row.responsibleOrDependency);

                      return (
                        <tr
                          key={row.requestId}
                          className={`remarks-data-row ${isRowUnsaved && !isPublicView ? 'row-unsaved-highlight' : ''}`}
                        >
                          {/* 1. Request ID with Drilldown */}
                          <td className="remarks-cell-id" style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="remarks-id-link"
                              onClick={() => handleClick(`Incident Details — ${row.requestId}`, [row.requestId])}
                              title="Click to view detailed incident modal"
                            >
                              {row.requestId}
                            </button>
                            {isRowUnsaved && !isPublicView && <span className="row-unsaved-dot" title="Unsaved changes">●</span>}
                          </td>

                          {/* 2. Department (Locked text on public dashboard, interactive select on admin) */}
                          <td className="remarks-cell-dept">
                            {isPublicView ? (
                              <span className="remarks-locked-dept-badge">
                                {row.department || 'Not Assigned'}
                              </span>
                            ) : (
                              <select
                                className="remarks-dept-select"
                                value={row.department || 'Not Assigned'}
                                onChange={(e) => handleDepartmentChange(row, e.target.value)}
                                title="Department (changing department updates available responsible teams)"
                              >
                                <option value="Not Assigned">Not Assigned</option>
                                {availableDepartments
                                  .filter((d) => d !== 'Not Assigned')
                                  .map((d) => (
                                    <option key={d} value={d}>
                                      {d}
                                    </option>
                                  ))}
                                {row.department &&
                                  !availableDepartments.includes(row.department) &&
                                  row.department !== 'Not Assigned' && (
                                    <option value={row.department}>{row.department}</option>
                                  )}
                              </select>
                            )}
                          </td>

                          {/* 3. Category */}
                          <td className="remarks-cell-cat" title={row.category}>
                            {row.category ? row.category.replace(/\s*\/\s*/g, ' / ') : '-'}
                          </td>

                          {/* 4. Sub Category */}
                          <td className="remarks-cell-subcat" title={row.subCategory}>
                            {row.subCategory ? row.subCategory.replace(/\s*\/\s*/g, ' / ') : '-'}
                          </td>

                          {/* 5. Description */}
                          <td className="remarks-cell-desc" title={row.description}>
                            <div className="desc-clamp-text">{row.description || '-'}</div>
                          </td>

                          {/* 6. Aging Days (Red Text with severity badge) */}
                          <td className="remarks-cell-aging red-highlight-text" style={{ textAlign: 'center' }}>
                            <span
                              className={`aging-days-badge ${row.agingDays > 30
                                ? 'badge-critical'
                                : row.agingDays >= 15
                                  ? 'badge-high'
                                  : row.agingDays >= 8
                                    ? 'badge-moderate'
                                    : 'badge-low'
                                }`}
                            >
                              {row.agingDays}
                            </span>
                          </td>

                          {/* 7. Recent Update (Locked text on public dashboard, textarea on admin) */}
                          <td className={`remarks-cell-update ${hasUpdate ? 'cell-has-update' : ''}`}>
                            {isPublicView ? (
                              <div className="remarks-locked-update-wrap">
                                {row.recentUpdate && row.recentUpdate.trim() ? (
                                  <div className="remarks-locked-update-text">
                                    {row.recentUpdate}
                                  </div>
                                ) : (
                                  <span className="remarks-locked-no-update">-</span>
                                )}
                                {row.lastUpdated && (
                                  <div className="update-meta-caption">
                                    🕒 {new Date(row.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{' '}
                                    {row.updatedBy ? `by ${row.updatedBy}` : ''}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="update-textarea-container">
                                <textarea
                                  className={`remarks-update-textarea ${hasUpdate ? 'update-active' : ''}`}
                                  value={row.recentUpdate || ''}
                                  placeholder="Type or paste recent update notes..."
                                  rows={2}
                                  onChange={(e) => handleRemarksChange(row, e.target.value)}
                                />
                                {row.lastUpdated && (
                                  <div className="update-meta-caption">
                                    🕒 {new Date(row.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{' '}
                                    {row.updatedBy ? `by ${row.updatedBy}` : ''}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>

                          {/* 8. Responsible or Dependency (Locked text on public dashboard, select on admin) */}
                          <td className="remarks-cell-resp">
                            {isPublicView ? (
                              <span className="remarks-locked-team-badge">
                                {currentTeam || '-'}
                              </span>
                            ) : (
                              <div className="resp-select-container">
                                <select
                                  className="remarks-resp-select"
                                  value={currentTeam}
                                  title={`Select responsible or dependency team for "${row.requestId}"`}
                                  onChange={(e) => handleResponsibleChange(row, e.target.value)}
                                >
                                  {(!currentTeam || currentTeam === 'Not Assigned') && (
                                    <option value="">-- Select Responsible Team --</option>
                                  )}

                                  {/* Render allowed teams */}
                                  {allowedTeams.map((team) => (
                                    <option key={team} value={team}>
                                      {team}
                                    </option>
                                  ))}

                                  {currentTeam && !allowedTeams.includes(currentTeam) && (
                                    <option key={currentTeam} value={currentTeam}>
                                      {currentTeam}
                                    </option>
                                  )}
                                </select>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
