'use client';

import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import type { AgingReportData, AgingRemarksRow, AgingBucket } from '@/types/aging';
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

  const formattedDate = useMemo(() => {
    try {
      if (data.generatedAt) {
        const d =
          typeof data.generatedAt === 'string'
            ? new Date(data.generatedAt)
            : data.generatedAt;
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
        }
      }
      return data.reportPeriod || 'Current Week';
    } catch {
      return data.reportPeriod || 'Current Week';
    }
  }, [data.generatedAt, data.reportPeriod]);

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

  // Local unsaved row modifications
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
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 4500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, deptFilter, teamFilter, severityFilter, onlyUnsavedFilter, sortBy, pageSize]);

  // Load backend metadata
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

  // Normalize responsible team
  const normalizeResponsibleTeam = useCallback((resp: string | undefined, _contextStr = ''): string => {
    const raw = (resp || '').trim();
    if (!raw) return '';

    const validSubTeams = ['ISS MT', 'ISS Binondo', 'SDS', 'POS DB', 'ECS HRAD', 'ISMS Support', 'PSD', 'HR'];
    if (validSubTeams.includes(raw)) return raw;

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

  const getAllowedTeams = useCallback((_deptName?: string): string[] => {
    return ['ISS MT', 'ISS Binondo', 'SDS', 'POS DB', 'ECS HRAD', 'ISMS Support', 'PSD', 'HR'];
  }, []);

  // Compute Base Remarks Table rows
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
      const dbRecord = dbAssignments[row.requestId];
      let dept = dbRecord?.department || row.department;
      let resp = dbRecord?.responsibleOrDependency || row.responsibleOrDependency;
      let update = dbRecord?.recentUpdate !== undefined ? dbRecord.recentUpdate : row.recentUpdate;
      let lastUpdated = dbRecord?.updatedAt || row.lastUpdated;
      let updatedBy = dbRecord?.updatedBy || row.updatedBy;
      let isUnsaved = false;

      const localEdit = unsavedEdits[row.requestId];
      if (localEdit) {
        if (localEdit.department !== undefined) dept = localEdit.department;
        if (localEdit.responsibleOrDependency !== undefined) resp = localEdit.responsibleOrDependency;
        if (localEdit.recentUpdate !== undefined) update = localEdit.recentUpdate;
        isUnsaved = true;
      }

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

  // Handle local edits
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
        setDbAssignments((prev) => ({
          ...prev,
          [row.requestId]: result.assignment!,
        }));

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
          text: `✓ Saved incident ${row.requestId} assignment successfully.`,
          type: 'success',
        });
      }
    } catch {
      setToastMessage({
        text: `Error saving incident ${row.requestId}.`,
        type: 'error',
      });
    } finally {
      setSavingRows((prev) => ({ ...prev, [row.requestId]: false }));
    }
  };

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
        const fresh = await fetchStoredAssignments();
        setDbAssignments(fresh);
        setUnsavedEdits({});
        setToastMessage({
          text: `✓ Successfully saved ${result.savedCount ?? payload.length} incident assignments.`,
          type: 'success',
        });
      }
    } catch {
      setToastMessage({ text: 'Error performing bulk save.', type: 'error' });
    } finally {
      setIsBulkSaving(false);
    }
  };

  const handleSaveCompleteReport = async () => {
    const period = data.reportPeriod || 'Current Period';
    const id = `aging-${period.toLowerCase().replace(/[^a-z0-9]/g, '-') || Date.now()}`;

    saveReport({
      id,
      type: 'aging',
      title: data.reportTitle || `Aging Incident Report - ${period}`,
      period,
      reportData: {
        ...data,
        remarksTable: remarksData,
      },
      routedIncidents,
    });

    await persistServerAgingReport({
      id,
      title: data.reportTitle || `Aging Incident Report - ${period}`,
      period,
      reportData: {
        ...data,
        remarksTable: remarksData,
      },
      routedIncidents,
      savedBy: accountName,
      savedAt: new Date().toISOString(),
    });

    setIsSaved(true);
    if (onSaveReport) onSaveReport();
    setToastMessage({
      text: '✓ Report archive saved successfully.',
      type: 'success',
    });
    setTimeout(() => setIsSaved(false), 4000);
  };

  const handleClick = (title: string, ids: string[]) => {
    if (onCellClick && ids && ids.length > 0) {
      onCellClick(title, ids);
    }
  };

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

  const filterOptions = useMemo(() => {
    const deptSet = new Set<string>();
    const teamSet = new Set<string>();

    for (const r of remarksData.rows) {
      if (r.department) deptSet.add(r.department);
      if (r.responsibleOrDependency) teamSet.add(r.responsibleOrDependency);
    }
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

    if (deptFilter !== 'ALL') {
      result = result.filter((r) => r.department === deptFilter);
    }

    if (teamFilter !== 'ALL') {
      result = result.filter((r) => r.responsibleOrDependency === teamFilter);
    }

    if (severityFilter === 'critical') {
      result = result.filter((r) => r.agingDays > 30);
    } else if (severityFilter === 'high') {
      result = result.filter((r) => r.agingDays >= 15 && r.agingDays <= 30);
    } else if (severityFilter === 'moderate') {
      result = result.filter((r) => r.agingDays >= 8 && r.agingDays <= 14);
    } else if (severityFilter === 'low') {
      result = result.filter((r) => r.agingDays < 8);
    }

    if (onlyUnsavedFilter) {
      result = result.filter((r) => Boolean(r.isUnsaved));
    }

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

  const totalItems = filteredAndSortedRows.length;
  const totalPages = pageSize === -1 ? 1 : Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = pageSize === -1 ? 0 : (safePage - 1) * pageSize;
  const endIndex = pageSize === -1 ? totalItems : Math.min(startIndex + pageSize, totalItems);

  const paginatedRows = useMemo(() => {
    if (pageSize === -1) return filteredAndSortedRows;
    return filteredAndSortedRows.slice(startIndex, endIndex);
  }, [filteredAndSortedRows, pageSize, startIndex, endIndex]);

  const handleCopyToClipboard = useCallback(() => {
    if (filteredAndSortedRows.length === 0) return;
    const headers = [
      'RequestID',
      'Department',
      'Category',
      'Sub Category',
      'Description',
      'Aging Days',
      'Recent Update',
      'Responsible or Dependency',
    ];
    const tsvRows = filteredAndSortedRows.map((r) =>
      [
        r.requestId,
        r.department,
        r.category,
        r.subCategory,
        (r.description || '').replace(/[\r\n\t]+/g, ' '),
        r.agingDays,
        (r.recentUpdate || '').replace(/[\r\n\t]+/g, ' '),
        r.responsibleOrDependency,
      ].join('\t')
    );
    const text = [headers.join('\t'), ...tsvRows].join('\n');
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setToastMessage({
          text: `✓ Copied ${filteredAndSortedRows.length} aging records to clipboard (ready to paste in Excel).`,
          type: 'success',
        });
      })
      .catch(() => {
        setToastMessage({ text: 'Could not access clipboard.', type: 'error' });
      });
  }, [filteredAndSortedRows]);

  const handleExportCSV = () => {
    if (filteredAndSortedRows.length === 0) return;
    const headers = ['RequestID', 'Department', 'Category', 'Sub Category', 'Description', 'Aging Days', 'Recent Update', 'Responsible Team'];
    const rows = filteredAndSortedRows.map((r) => [
      `"${r.requestId}"`,
      `"${r.department}"`,
      `"${r.category}"`,
      `"${r.subCategory}"`,
      `"${(r.description || '').replace(/"/g, '""')}"`,
      r.agingDays,
      `"${(r.recentUpdate || '').replace(/"/g, '""')}"`,
      `"${r.responsibleOrDependency}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Aging_Incidents_Remarks_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Calculate bucket totals
  const bucketTotals: Record<AgingBucket, number> = useMemo(() => {
    const res: Record<string, number> = {};
    for (const b of AGING_BUCKET_ORDER) {
      res[b] = data.agingRows.reduce((sum, r) => sum + (r.buckets[b] || 0), 0);
    }
    return res as Record<AgingBucket, number>;
  }, [data.agingRows]);

  const prevWeekGrand = data.previousWeek.grandTotal ?? 0;
  const currentAgingGrand = data.agingGrandTotal;
  const agingDelta = currentAgingGrand - prevWeekGrand;

  const getBucketColor = (bucket: AgingBucket, count: number) => {
    if (count === 0) return '#475569';
    switch (bucket) {
      case '>1month': return '#f87171';
      case '2-4weeks': return '#fb923c';
      case '1-2weeks': return '#fbbf24';
      case '4-6days': return '#60a5fa';
      case '1-3days': return '#38bdf8';
      case 'sameday': return '#34d399';
      default: return '#f8fafc';
    }
  };

  const getRateBadge = (rate: number | null) => {
    if (rate === null) return <span style={{ color: '#64748b' }}>—</span>;
    const isMet = rate >= 85;
    const isWarn = rate >= 70 && rate < 85;
    const bg = isMet ? '#00b050' : isWarn ? '#ffc000' : '#c00000';
    const color = isWarn ? '#000000' : '#ffffff';

    return (
      <span
        style={{
          display: 'inline-block',
          background: bg,
          color,
          fontSize: '11px',
          fontWeight: 800,
          padding: '2px 8px',
          borderRadius: '4px',
          minWidth: '52px',
          textAlign: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }}
      >
        {rate.toFixed(1)}%
      </span>
    );
  };

  return (
    <div ref={reportRef} style={{ width: '100%', maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: '18px' }} id="aging-report-canvas">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 100,
            background: toastMessage.type === 'success' ? '#064e3b' : '#7f1d1d',
            border: `1px solid ${toastMessage.type === 'success' ? '#10b981' : '#ef4444'}`,
            color: '#ffffff',
            padding: '12px 18px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 600,
            boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <span>{toastMessage.type === 'success' ? '✓' : '⚠️'}</span>
          <span>{toastMessage.text}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            style={{ background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer', marginLeft: '10px' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ══ Modern Header Bar ══ */}
      <div
        style={{
          background: 'linear-gradient(145deg, #111c30 0%, #0d1a2e 100%)',
          border: '1px solid #1e293b',
          borderRadius: '16px',
          padding: '18px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #d97706, #dc2626)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              boxShadow: '0 4px 14px rgba(217,119,6,0.3)',
            }}
          >
            ⏳
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#f8fafc', margin: 0, letterSpacing: '-0.01em' }}>
                Aging Incident Report
              </h2>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: 'rgba(245,158,11,0.15)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  color: '#fbbf24',
                }}
              >
                {data.reportPeriod || 'Current Period'}
              </span>
            </div>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '3px 0 0' }}>
              First response and resolution SLA compliance, aging distributions, and remarks follow-up
            </p>
          </div>
        </div>

        {/* Right Action Controls: Admin Actions */}
        {!isPublicView && (
          <div style={{ display: 'flex', gap: '8px' }}>
            {kpiMetrics.unsaved > 0 && (
              <button
                type="button"
                onClick={handleBulkSave}
                disabled={isBulkSaving}
                style={{
                  background: 'rgba(245,158,11,0.15)',
                  border: '1px solid #f59e0b',
                  color: '#fbbf24',
                  padding: '7px 12px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {isBulkSaving ? '💾 Saving…' : `💾 Save Unsaved (${kpiMetrics.unsaved})`}
              </button>
            )}
            <button
              type="button"
              onClick={handleSaveCompleteReport}
              style={{
                background: isSaved ? 'rgba(16,185,129,0.15)' : '#2563eb',
                border: isSaved ? '1px solid #10b981' : 'none',
                color: '#ffffff',
                padding: '7px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: isSaved ? 'none' : '0 2px 10px rgba(37,99,235,0.3)',
              }}
            >
              {isSaved ? '✓ Archived' : '💾 Archive Report'}
            </button>
          </div>
        )}
      </div>

      {/* ══ Top Tab Switcher ══ */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          overflowX: 'auto',
          borderBottom: '1px solid #1e293b',
          paddingBottom: '2px',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('aging')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'aging' ? '#17243a' : 'transparent',
            color: activeTab === 'aging' ? '#60a5fa' : '#94a3b8',
            fontWeight: activeTab === 'aging' ? 800 : 600,
            fontSize: '12px',
            cursor: 'pointer',
            borderBottom: activeTab === 'aging' ? '2px solid #2563eb' : '2px solid transparent',
            transition: 'all 0.12s ease',
          }}
        >
          <span style={{ fontSize: '14px' }}>📊</span>
          <span>Aging Module (SLA &amp; Distribution)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('remarks')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'remarks' ? '#17243a' : 'transparent',
            color: activeTab === 'remarks' ? '#60a5fa' : '#94a3b8',
            fontWeight: activeTab === 'remarks' ? 800 : 600,
            fontSize: '12px',
            cursor: 'pointer',
            borderBottom: activeTab === 'remarks' ? '2px solid #2563eb' : '2px solid transparent',
            transition: 'all 0.12s ease',
          }}
        >
          <span style={{ fontSize: '14px' }}>📝</span>
          <span>Remarks Table</span>
          {remarksData.totalRecords > 0 && (
            <span
              style={{
                background: activeTab === 'remarks' ? '#2563eb' : '#1e293b',
                color: '#ffffff',
                fontSize: '10px',
                fontWeight: 800,
                padding: '1px 6px',
                borderRadius: '999px',
              }}
            >
              {remarksData.totalRecords}
            </span>
          )}
        </button>
      </div>

      {/* ══ TAB 1: AGING MODULE (SLA & DISTRIBUTION) ══ */}
      {activeTab === 'aging' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* ── Executive Summary Cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            <div style={{ background: '#111c30', border: '1px solid #1e293b', borderRadius: '14px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Total Aging IRs</span>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#f8fafc' }}>{currentAgingGrand}</div>
              <span style={{ fontSize: '11px', color: agingDelta > 0 ? '#f87171' : '#34d399', fontWeight: 700 }}>
                {agingDelta === 0 ? '±0 vs last week' : agingDelta > 0 ? `+${agingDelta} vs last week` : `${agingDelta} vs last week`}
              </span>
            </div>

            <div style={{ background: '#111c30', border: '1px solid #1e293b', borderRadius: '14px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Critical (&gt; 1 Month)</span>
              <div style={{ fontSize: '26px', fontWeight: 900, color: bucketTotals['>1month'] > 0 ? '#f87171' : '#f8fafc' }}>{bucketTotals['>1month']}</div>
              <span style={{ fontSize: '11px', color: '#f87171' }}>Urgent follow-up</span>
            </div>

            <div style={{ background: '#111c30', border: '1px solid #1e293b', borderRadius: '14px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>High (2–4 Weeks)</span>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#fb923c' }}>{bucketTotals['2-4weeks']}</div>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Stagnant queue</span>
            </div>

            <div style={{ background: '#111c30', border: '1px solid #1e293b', borderRadius: '14px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Moderate (1–2 Wks)</span>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#fbbf24' }}>{bucketTotals['1-2weeks']}</div>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>In progress</span>
            </div>

            <div style={{ background: '#111c30', border: '1px solid #1e293b', borderRadius: '14px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Recent (&lt; 1 Wk)</span>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#34d399' }}>
                {bucketTotals['sameday'] + bucketTotals['1-3days'] + bucketTotals['4-6days']}
              </div>
              <span style={{ fontSize: '11px', color: '#10b981' }}>Standard handling</span>
            </div>

            <div style={{ background: '#111c30', border: '1px solid #1e293b', borderRadius: '14px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Overall FR SLA</span>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#60a5fa' }}>
                {formatSLAPercentage(data.slaTotals.firstResponse.slaPassRate)}
              </div>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>{data.slaTotals.totalIRs} total team IRs</span>
            </div>
          </div>

          {/* ── TABLE 1: First Response & Resolution SLA Compliance Table ── */}
          <div
            style={{
              background: '#111c30',
              border: '1px solid #1e293b',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ padding: '16px 22px', borderBottom: '1px solid #1e293b', background: 'linear-gradient(145deg, #17243a, #111c30)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '15px' }}>⚡</span>
                <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  First Response &amp; Resolution SLA Compliance
                </h3>
              </div>
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>
                Team-level SLA performance metrics for the current reporting week
              </p>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px', border: '2px solid #000000' }}>
                <thead>
                  {/* Main Group Headers (Old Design Corporate Colors) */}
                  <tr>
                    <th
                      rowSpan={2}
                      style={{
                        padding: '10px 14px',
                        textAlign: 'left',
                        background: '#4472c4',
                        color: '#ffffff',
                        fontSize: '11px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        border: '1px solid #1f3864',
                        width: '180px',
                      }}
                    >
                      FINAL TEAM
                    </th>
                    <th
                      rowSpan={2}
                      style={{
                        padding: '10px 12px',
                        textAlign: 'center',
                        background: '#2f5597',
                        color: '#ffffff',
                        fontSize: '10px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        border: '1px solid #1f3864',
                        width: '90px',
                      }}
                    >
                      TOTAL IRS
                    </th>
                    <th
                      colSpan={3}
                      style={{
                        padding: '10px 14px',
                        textAlign: 'center',
                        background: '#5b9bd5',
                        color: '#ffffff',
                        fontSize: '11px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        border: '1px solid #1f3864',
                      }}
                    >
                      FIRST RESPONSE
                    </th>
                    <th
                      colSpan={3}
                      style={{
                        padding: '10px 14px',
                        textAlign: 'center',
                        background: '#70ad47',
                        color: '#ffffff',
                        fontSize: '11px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        border: '1px solid #1f3864',
                      }}
                    >
                      RESOLUTION TIME
                    </th>
                  </tr>
                  {/* Sub-column Headers */}
                  <tr>
                    <th style={{
                      padding: '7px 8px',
                      textAlign: 'center',
                      background: '#c00000',
                      color: '#ffffff',
                      fontSize: '10px',
                      fontWeight: 700,
                      border: '1px solid #1f3864',
                      whiteSpace: 'nowrap'
                    }}>
                      Failed
                    </th>
                    <th style={{
                      padding: '7px 8px',
                      textAlign: 'center',
                      background: '#548235',
                      color: '#ffffff',
                      fontSize: '10px',
                      fontWeight: 700,
                      border: '1px solid #1f3864',
                      whiteSpace: 'nowrap'
                    }}>
                      Passed
                    </th>
                    <th style={{
                      padding: '7px 10px',
                      textAlign: 'center',
                      background: '#1f4e79',
                      color: '#ffffff',
                      fontSize: '10px',
                      fontWeight: 800,
                      border: '1px solid #1f3864',
                      whiteSpace: 'nowrap'
                    }}>
                      SLA Pass Rate
                    </th>

                    <th style={{
                      padding: '7px 8px',
                      textAlign: 'center',
                      background: '#c00000',
                      color: '#ffffff',
                      fontSize: '10px',
                      fontWeight: 700,
                      border: '1px solid #1f3864',
                      whiteSpace: 'nowrap'
                    }}>
                      Failed
                    </th>
                    <th style={{
                      padding: '7px 8px',
                      textAlign: 'center',
                      background: '#548235',
                      color: '#ffffff',
                      fontSize: '10px',
                      fontWeight: 700,
                      border: '1px solid #1f3864',
                      whiteSpace: 'nowrap'
                    }}>
                      Passed
                    </th>
                    <th style={{
                      padding: '7px 10px',
                      textAlign: 'center',
                      background: '#1f4e79',
                      color: '#ffffff',
                      fontSize: '10px',
                      fontWeight: 800,
                      border: '1px solid #1f3864',
                      whiteSpace: 'nowrap'
                    }}>
                      SLA Pass Rate
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.slaRows.map((row) => (
                    <tr
                      key={row.teamName}
                      style={{ borderBottom: '1px solid #cbd5e1' }}
                    >
                      <td style={{ padding: '9px 16px', fontWeight: 700, background: '#d6e4f0', color: '#1f3864', border: '1px solid #94a3b8' }}>
                        {row.teamName}
                      </td>
                      <td
                        style={{ padding: '9px 12px', textAlign: 'center', cursor: 'pointer', background: '#ffffff', color: '#000000', fontWeight: 700, border: '1px solid #cbd5e1' }}
                        onClick={() => handleClick(`${row.teamName} — Total IRs`, row.incidentIds)}
                        title="Click to view total incidents"
                      >
                        {row.totalIRs > 0 ? row.totalIRs : 0}
                      </td>

                      {/* First Response */}
                      <td
                        style={{
                          padding: '9px 12px',
                          textAlign: 'center',
                          cursor: row.firstResponse.failed > 0 ? 'pointer' : 'default',
                          background: row.firstResponse.failed > 0 ? '#fce4ec' : '#ffffff',
                          color: row.firstResponse.failed > 0 ? '#c00000' : '#64748b',
                          fontWeight: row.firstResponse.failed > 0 ? 800 : 500,
                          border: '1px solid #cbd5e1',
                        }}
                        onClick={() => handleClick(`${row.teamName} — FR Failed`, row.firstResponse.failedIds)}
                        title="Click to view First Response failed incidents"
                      >
                        {row.firstResponse.failed}
                      </td>
                      <td
                        style={{ padding: '9px 12px', textAlign: 'center', cursor: 'pointer', background: '#ffffff', color: '#000000', fontWeight: 700, border: '1px solid #cbd5e1' }}
                        onClick={() => handleClick(`${row.teamName} — FR Passed`, row.firstResponse.passedIds)}
                        title="Click to view First Response passed incidents"
                      >
                        {row.firstResponse.passed}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'center', background: '#ffffff', border: '1px solid #cbd5e1' }}>
                        {getRateBadge(row.firstResponse.slaPassRate)}
                      </td>

                      {/* Resolution Time */}
                      <td
                        style={{
                          padding: '9px 12px',
                          textAlign: 'center',
                          cursor: row.resolutionTime.failed > 0 ? 'pointer' : 'default',
                          background: row.resolutionTime.failed > 0 ? '#fce4ec' : '#ffffff',
                          color: row.resolutionTime.failed > 0 ? '#c00000' : '#64748b',
                          fontWeight: row.resolutionTime.failed > 0 ? 800 : 500,
                          border: '1px solid #cbd5e1',
                        }}
                        onClick={() => handleClick(`${row.teamName} — RT Failed`, row.resolutionTime.failedIds)}
                        title="Click to view Resolution failed incidents"
                      >
                        {row.resolutionTime.failed}
                      </td>
                      <td
                        style={{ padding: '9px 12px', textAlign: 'center', cursor: 'pointer', background: '#ffffff', color: '#000000', fontWeight: 700, border: '1px solid #cbd5e1' }}
                        onClick={() => handleClick(`${row.teamName} — RT Passed`, row.resolutionTime.passedIds)}
                        title="Click to view Resolution passed incidents"
                      >
                        {row.resolutionTime.passed}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'center', background: '#ffffff', border: '1px solid #cbd5e1' }}>
                        {getRateBadge(row.resolutionTime.slaPassRate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#ffd966', fontWeight: 900, border: '2px solid #000000' }}>
                    <td style={{ padding: '10px 16px', background: '#ffd966', color: '#000000', fontSize: '11px', textTransform: 'uppercase', border: '1px solid #b38600' }}>
                      TOTAL
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', background: '#ffd966', color: '#000000', border: '1px solid #b38600' }}>
                      {data.slaTotals.totalIRs}
                    </td>

                    {/* FR Totals */}
                    <td style={{ padding: '10px 12px', textAlign: 'center', background: '#ffd966', color: data.slaTotals.firstResponse.failed > 0 ? '#c00000' : '#000000', border: '1px solid #b38600' }}>
                      {data.slaTotals.firstResponse.failed}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', background: '#ffd966', color: '#000000', border: '1px solid #b38600' }}>
                      {data.slaTotals.firstResponse.passed}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', background: '#ffd966', border: '1px solid #b38600' }}>
                      {getRateBadge(data.slaTotals.firstResponse.slaPassRate)}
                    </td>

                    {/* RT Totals */}
                    <td style={{ padding: '10px 12px', textAlign: 'center', background: '#ffd966', color: data.slaTotals.resolutionTime.failed > 0 ? '#c00000' : '#000000', border: '1px solid #b38600' }}>
                      {data.slaTotals.resolutionTime.failed}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', background: '#ffd966', color: '#000000', border: '1px solid #b38600' }}>
                      {data.slaTotals.resolutionTime.passed}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', background: '#ffd966', border: '1px solid #b38600' }}>
                      {getRateBadge(data.slaTotals.resolutionTime.slaPassRate)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ── TABLE 2: Aging Incident Report Distribution Matrix ── */}
          <div
            style={{
              background: '#111c30',
              border: '1px solid #1e293b',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ padding: '16px 22px', borderBottom: '1px solid #1e293b', background: 'linear-gradient(145deg, #17243a, #111c30)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '15px' }}>📅</span>
                <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Aging Incident Report (Distribution Matrix)
                </h3>
              </div>
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>
                Incident distribution across aging brackets with weekly comparisons per team
              </p>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px', border: '2px solid #000000' }}>
                <thead>
                  <tr>
                    <th
                      rowSpan={2}
                      style={{
                        padding: '10px 14px',
                        textAlign: 'left',
                        background: '#4472c4',
                        color: '#ffffff',
                        fontSize: '11px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        border: '1px solid #1f3864',
                        width: '180px',
                      }}
                    >
                      FINAL TEAM
                    </th>
                    <th
                      colSpan={6}
                      style={{
                        padding: '10px 14px',
                        textAlign: 'center',
                        background: '#d9e1f2',
                        color: '#1f3864',
                        fontSize: '12px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        border: '1px solid #1f3864',
                      }}
                    >
                      AGING INCIDENT REPORT
                    </th>
                    <th
                      rowSpan={2}
                      style={{
                        padding: '10px 12px',
                        textAlign: 'center',
                        background: '#c00000',
                        color: '#ffffff',
                        fontSize: '10px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        border: '1px solid #1f3864',
                        width: '110px',
                      }}
                    >
                      <div>TOTAL AGING IRS</div>
                      <div style={{ fontSize: '10px', fontWeight: 700 }}>as of this week</div>
                    </th>
                    <th
                      rowSpan={2}
                      style={{
                        padding: '10px 12px',
                        textAlign: 'center',
                        background: '#ffc000',
                        color: '#000000',
                        fontSize: '10px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        border: '1px solid #1f3864',
                        width: '110px',
                      }}
                    >
                      <div>TOTAL AGING IRS</div>
                      <div style={{ fontSize: '10px', fontWeight: 700 }}>as of last week</div>
                    </th>
                  </tr>
                  <tr>
                    {AGING_BUCKET_ORDER.map((b) => (
                      <th
                        key={b}
                        style={{
                          padding: '8px 10px',
                          textAlign: 'center',
                          background: '#4472c4',
                          color: '#ffffff',
                          fontSize: '10px',
                          fontWeight: 700,
                          border: '1px solid #1f3864',
                          minWidth: '85px',
                        }}
                      >
                        {AGING_BUCKET_LABELS[b]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.agingRows.map((row) => {
                    const prevWeekTotal = data.previousWeek.teamTotals[row.teamName];
                    return (
                      <tr
                        key={row.teamName}
                        style={{ borderBottom: '1px solid #cbd5e1' }}
                      >
                        <td style={{ padding: '9px 16px', fontWeight: 700, background: '#d6e4f0', color: '#1f3864', border: '1px solid #94a3b8' }}>
                          {row.teamName}
                        </td>

                        {/* Bucket Cells */}
                        {AGING_BUCKET_ORDER.map((bucket) => {
                          const count = row.buckets[bucket] || 0;
                          const ids = row.bucketIncidentIds[bucket] || [];
                          return (
                            <td
                              key={bucket}
                              style={{
                                padding: '9px 10px',
                                textAlign: 'center',
                                cursor: count > 0 ? 'pointer' : 'default',
                                background: '#ffffff',
                                color: '#000000',
                                fontWeight: count > 0 ? 800 : 400,
                                border: '1px solid #cbd5e1',
                              }}
                              onClick={() => {
                                if (count > 0) handleClick(`${row.teamName} — ${AGING_BUCKET_LABELS[bucket]}`, ids);
                              }}
                              title={count > 0 ? `Click to view ${count} incidents in ${AGING_BUCKET_LABELS[bucket]}` : ''}
                            >
                              {count > 0 ? count : '—'}
                            </td>
                          );
                        })}

                        {/* Total This Week */}
                        <td
                          style={{
                            padding: '9px 12px',
                            textAlign: 'center',
                            fontWeight: 800,
                            background: '#ffffff',
                            color: '#c00000',
                            fontSize: '13px',
                            border: '1px solid #cbd5e1',
                            cursor: row.totalAging > 0 ? 'pointer' : 'default',
                          }}
                          onClick={() => {
                            if (row.totalAging > 0) handleClick(`${row.teamName} — Total Aging IRs`, row.incidentIds);
                          }}
                        >
                          {row.totalAging > 0 ? row.totalAging : '—'}
                        </td>

                        {/* Total Last Week */}
                        <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 800, background: '#ffffff', color: '#c00000', fontSize: '13px', border: '1px solid #cbd5e1' }}>
                          {prevWeekTotal !== null && prevWeekTotal !== undefined ? prevWeekTotal : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#ffd966', fontWeight: 900, border: '2px solid #000000' }}>
                    <td style={{ padding: '10px 16px', background: '#ffd966', color: '#000000', fontSize: '11px', textTransform: 'uppercase', border: '1px solid #b38600' }}>
                      TOTAL
                    </td>
                    {AGING_BUCKET_ORDER.map((bucket) => {
                      const count = bucketTotals[bucket] || 0;
                      return (
                        <td
                          key={bucket}
                          style={{
                            padding: '10px 10px',
                            textAlign: 'center',
                            background: '#ffd966',
                            color: '#000000',
                            fontWeight: 800,
                            border: '1px solid #b38600',
                          }}
                        >
                          {count > 0 ? count : '—'}
                        </td>
                      );
                    })}
                    <td style={{ padding: '10px 12px', textAlign: 'center', background: '#ffd966', color: '#c00000', fontWeight: 900, fontSize: '14px', border: '1px solid #b38600' }}>
                      {data.agingGrandTotal > 0 ? data.agingGrandTotal : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', background: '#ffd966', color: '#c00000', fontWeight: 900, fontSize: '14px', border: '1px solid #b38600' }}>
                      {data.previousWeek.grandTotal !== null ? data.previousWeek.grandTotal : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══ TAB 2: REMARKS TABLE (ENHANCED MODERN DATA TABLE) ══ */}
      {activeTab === 'remarks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* ── Summary KPI Cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            <div style={{ background: '#111c30', border: '1px solid #1e293b', borderRadius: '14px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Total Records</span>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#f8fafc' }}>{kpiMetrics.total}</div>
              <span style={{ fontSize: '11px', color: '#64748b' }}>Open aging queue</span>
            </div>

            <div style={{ background: '#111c30', border: '1px solid #1e293b', borderRadius: '14px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Critical (&gt; 30d)</span>
              <div style={{ fontSize: '26px', fontWeight: 900, color: kpiMetrics.critical > 0 ? '#f87171' : '#64748b' }}>{kpiMetrics.critical}</div>
              <span style={{ fontSize: '11px', color: '#f87171' }}>Urgent follow-up</span>
            </div>

            <div style={{ background: '#111c30', border: '1px solid #1e293b', borderRadius: '14px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>High (15–30d)</span>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#fb923c' }}>{kpiMetrics.high}</div>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Stagnant queue</span>
            </div>

            <div style={{ background: '#111c30', border: '1px solid #1e293b', borderRadius: '14px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Moderate (8–14d)</span>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#fbbf24' }}>{kpiMetrics.moderate}</div>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Active investigation</span>
            </div>

            <div style={{ background: '#111c30', border: '1px solid #1e293b', borderRadius: '14px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Recent (&lt; 8d)</span>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#34d399' }}>{kpiMetrics.low}</div>
              <span style={{ fontSize: '11px', color: '#10b981' }}>Standard handling</span>
            </div>
          </div>

          {/* ── Segmented Category Filter Chips ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                setSeverityFilter('ALL');
                setOnlyUnsavedFilter(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '8px',
                border: 'none',
                background: severityFilter === 'ALL' && !onlyUnsavedFilter ? '#2563eb' : '#111c30',
                color: severityFilter === 'ALL' && !onlyUnsavedFilter ? '#ffffff' : '#94a3b8',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <span>All</span>
              <span style={{ background: 'rgba(255,255,255,0.2)', padding: '1px 6px', borderRadius: '999px', fontSize: '10px' }}>
                {kpiMetrics.total}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSeverityFilter('critical');
                setOnlyUnsavedFilter(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '8px',
                border: severityFilter === 'critical' ? '1px solid #ef4444' : '1px solid transparent',
                background: severityFilter === 'critical' ? '#ef4444' : 'rgba(239,68,68,0.1)',
                color: severityFilter === 'critical' ? '#ffffff' : '#f87171',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <span>Critical (&gt; 30d)</span>
              <span style={{ background: 'rgba(255,255,255,0.25)', padding: '1px 6px', borderRadius: '999px', fontSize: '10px' }}>
                {kpiMetrics.critical}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSeverityFilter('high');
                setOnlyUnsavedFilter(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '8px',
                border: severityFilter === 'high' ? '1px solid #f97316' : '1px solid transparent',
                background: severityFilter === 'high' ? '#f97316' : 'rgba(249,115,22,0.1)',
                color: severityFilter === 'high' ? '#ffffff' : '#fb923c',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <span>High (15–30d)</span>
              <span style={{ background: 'rgba(255,255,255,0.25)', padding: '1px 6px', borderRadius: '999px', fontSize: '10px' }}>
                {kpiMetrics.high}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSeverityFilter('moderate');
                setOnlyUnsavedFilter(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '8px',
                border: severityFilter === 'moderate' ? '1px solid #f59e0b' : '1px solid transparent',
                background: severityFilter === 'moderate' ? '#f59e0b' : 'rgba(245,158,11,0.1)',
                color: severityFilter === 'moderate' ? '#ffffff' : '#fbbf24',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <span>Moderate (8–14d)</span>
              <span style={{ background: 'rgba(255,255,255,0.25)', padding: '1px 6px', borderRadius: '999px', fontSize: '10px' }}>
                {kpiMetrics.moderate}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSeverityFilter('low');
                setOnlyUnsavedFilter(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '8px',
                border: severityFilter === 'low' ? '1px solid #10b981' : '1px solid transparent',
                background: severityFilter === 'low' ? '#10b981' : 'rgba(16,185,129,0.1)',
                color: severityFilter === 'low' ? '#ffffff' : '#34d399',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <span>Recent (&lt; 8d)</span>
              <span style={{ background: 'rgba(255,255,255,0.25)', padding: '1px 6px', borderRadius: '999px', fontSize: '10px' }}>
                {kpiMetrics.low}
              </span>
            </button>

            {!isPublicView && kpiMetrics.unsaved > 0 && (
              <button
                type="button"
                onClick={() => setOnlyUnsavedFilter(!onlyUnsavedFilter)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: '1px solid #f59e0b',
                  background: onlyUnsavedFilter ? '#f59e0b' : 'rgba(245,158,11,0.15)',
                  color: onlyUnsavedFilter ? '#ffffff' : '#fbbf24',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <span>● Unsaved</span>
                <span style={{ background: 'rgba(255,255,255,0.25)', padding: '1px 6px', borderRadius: '999px', fontSize: '10px' }}>
                  {kpiMetrics.unsaved}
                </span>
              </button>
            )}

            {/* Quick Export Actions */}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={handleCopyToClipboard}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid #1e293b',
                  color: '#94a3b8',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
                title="Copy filtered rows to clipboard for Excel"
              >
                <span>📋</span> Copy TSV
              </button>
              <button
                type="button"
                onClick={handleExportCSV}
                style={{
                  background: 'rgba(16,185,129,0.12)',
                  border: '1px solid rgba(16,185,129,0.3)',
                  color: '#34d399',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
                title="Export filtered records to CSV"
              >
                <span>📥</span> Export CSV
              </button>
            </div>
          </div>

          {/* ── Search & Filter Toolbar ── */}
          <div
            style={{
              background: '#111c30',
              border: '1px solid #1e293b',
              borderRadius: '14px',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            {/* Search Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px' }}>
              <span style={{ fontSize: '14px', color: '#64748b' }}>🔍</span>
              <input
                type="text"
                placeholder="Search Request ID, department, description, remarks, team…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  background: '#091426',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  padding: '7px 12px',
                  fontSize: '12px',
                  color: '#f8fafc',
                  outline: 'none',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Dropdowns */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                style={{ background: '#091426', border: '1px solid #1e293b', borderRadius: '8px', padding: '6px 10px', fontSize: '11px', color: '#94a3b8', outline: 'none', cursor: 'pointer' }}
              >
                <option value="ALL">Dept: All ({filterOptions.departments.length})</option>
                {filterOptions.departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                style={{ background: '#091426', border: '1px solid #1e293b', borderRadius: '8px', padding: '6px 10px', fontSize: '11px', color: '#94a3b8', outline: 'none', cursor: 'pointer' }}
              >
                <option value="ALL">Team: All ({filterOptions.teams.length})</option>
                {filterOptions.teams.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                style={{ background: '#091426', border: '1px solid #1e293b', borderRadius: '8px', padding: '6px 10px', fontSize: '11px', color: '#94a3b8', outline: 'none', cursor: 'pointer' }}
              >
                <option value="aging-desc">Sort: Aging (High → Low)</option>
                <option value="aging-asc">Sort: Aging (Low → High)</option>
                <option value="id-asc">Sort: Request ID (A-Z)</option>
                <option value="dept-asc">Sort: Department (A-Z)</option>
                <option value="recent-update">Sort: Has Recent Update</option>
              </select>

              {(searchQuery || deptFilter !== 'ALL' || teamFilter !== 'ALL' || severityFilter !== 'ALL' || onlyUnsavedFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setDeptFilter('ALL');
                    setTeamFilter('ALL');
                    setSeverityFilter('ALL');
                    setOnlyUnsavedFilter(false);
                  }}
                  style={{ background: 'transparent', border: '1px solid #243650', color: '#94a3b8', borderRadius: '6px', padding: '5px 10px', fontSize: '11px', cursor: 'pointer' }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* ── THE REMARKS TABLE (ENHANCED MODERN SAAS TABLE) ── */}
          <div
            style={{
              background: '#111c30',
              border: '1px solid #1e293b',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ overflowX: 'auto', flex: 1 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#091426', borderBottom: '1px solid #1e293b' }}>
                    <th style={{ padding: '12px 14px', textAlign: 'center', color: '#64748b', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', width: '110px' }}>
                      RequestID
                    </th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', color: '#64748b', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', width: '130px' }}>
                      Department
                    </th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', color: '#64748b', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', width: '130px' }}>
                      Category
                    </th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', color: '#64748b', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', width: '130px' }}>
                      Sub Category
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', color: '#64748b', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: '220px' }}>
                      Description
                    </th>
                    <th style={{ padding: '12px 14px', textAlign: 'center', color: '#64748b', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', width: '100px' }}>
                      Aging Days
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', color: '#64748b', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: '250px' }}>
                      Recent Update
                    </th>
                    <th style={{ padding: '12px 14px', textAlign: 'center', color: '#64748b', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', width: '150px' }}>
                      Responsible Team
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                        No matching aging incidents found.
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((row) => {
                      const isRowUnsaved = Boolean(row.isUnsaved);
                      const isSaving = Boolean(savingRows[row.requestId]);
                      const currentTeam = normalizeResponsibleTeam(row.responsibleOrDependency);
                      const allowedTeams = getAllowedTeams(row.department);

                      const severityColor =
                        row.agingDays > 30 ? '#ef4444' : row.agingDays >= 15 ? '#f97316' : row.agingDays >= 8 ? '#f59e0b' : '#10b981';

                      const severityBg =
                        row.agingDays > 30 ? 'rgba(239,68,68,0.12)' : row.agingDays >= 15 ? 'rgba(249,115,22,0.12)' : row.agingDays >= 8 ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)';

                      const severityBorder =
                        row.agingDays > 30 ? 'rgba(239,68,68,0.3)' : row.agingDays >= 15 ? 'rgba(249,115,22,0.3)' : row.agingDays >= 8 ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)';

                      return (
                        <tr
                          key={row.requestId}
                          style={{
                            borderBottom: '1px solid rgba(30,41,59,0.7)',
                            background: isRowUnsaved && !isPublicView ? 'rgba(245,158,11,0.05)' : 'transparent',
                            transition: 'background 0.12s ease',
                          }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = 'rgba(37,99,235,0.06)')}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = isRowUnsaved && !isPublicView ? 'rgba(245,158,11,0.05)' : 'transparent')}
                        >
                          {/* 1. Request ID with Drilldown Modal */}
                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleClick(`Incident Details — ${row.requestId}`, [row.requestId])}
                              style={{
                                background: 'rgba(37,99,235,0.15)',
                                border: '1px solid rgba(37,99,235,0.35)',
                                color: '#60a5fa',
                                fontWeight: 800,
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                cursor: 'pointer',
                              }}
                              title="Click to view full incident details"
                            >
                              {row.requestId}
                            </button>
                            {isRowUnsaved && !isPublicView && (
                              <span style={{ color: '#f59e0b', fontSize: '9px', marginLeft: '4px' }}>●</span>
                            )}
                          </td>

                          {/* 2. Department */}
                          <td style={{ padding: '12px 14px', color: '#93c5fd', fontWeight: 600 }}>
                            {isPublicView ? (
                              <span style={{ background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>
                                {row.department || 'Not Assigned'}
                              </span>
                            ) : (
                              <select
                                value={row.department || 'Not Assigned'}
                                onChange={(e) => handleDepartmentChange(row, e.target.value)}
                                style={{ background: '#091426', border: '1px solid #1e293b', color: '#93c5fd', borderRadius: '6px', padding: '4px 6px', fontSize: '11px', outline: 'none' }}
                              >
                                <option value="Not Assigned">Not Assigned</option>
                                {availableDepartments.filter((d) => d !== 'Not Assigned').map((d) => (
                                  <option key={d} value={d}>{d}</option>
                                ))}
                              </select>
                            )}
                          </td>

                          {/* 3. Category */}
                          <td style={{ padding: '12px 14px', color: '#cbd5e1' }} title={row.category}>
                            {row.category || '—'}
                          </td>

                          {/* 4. Sub Category */}
                          <td style={{ padding: '12px 14px', color: '#94a3b8' }} title={row.subCategory}>
                            {row.subCategory || '—'}
                          </td>

                          {/* 5. Description */}
                          <td style={{ padding: '12px 16px', color: '#f8fafc', lineHeight: 1.5 }} title={row.description}>
                            <div style={{ maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                              {row.description || '—'}
                            </div>
                          </td>

                          {/* 6. Aging Days (Color-coded Pill) */}
                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                background: severityBg,
                                border: `1px solid ${severityBorder}`,
                                color: severityColor,
                                fontSize: '11px',
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: '6px',
                                minWidth: '40px',
                              }}
                            >
                              {row.agingDays}d
                            </span>
                          </td>

                          {/* 7. Recent Update */}
                          <td style={{ padding: '12px 16px', color: '#e2e8f0', lineHeight: 1.5 }}>
                            {isPublicView ? (
                              <div>
                                <div style={{ fontSize: '11px', color: row.recentUpdate ? '#f8fafc' : '#64748b' }}>
                                  {row.recentUpdate || 'No recent update recorded.'}
                                </div>
                                {row.lastUpdated && (
                                  <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px' }}>
                                    🕒 {new Date(row.lastUpdated).toLocaleDateString()} {row.updatedBy ? `by ${row.updatedBy}` : ''}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <textarea
                                  value={row.recentUpdate || ''}
                                  onChange={(e) => handleRemarksChange(row, e.target.value)}
                                  placeholder="Type recent update notes…"
                                  rows={2}
                                  style={{
                                    width: '100%',
                                    background: '#091426',
                                    border: '1px solid #1e293b',
                                    borderRadius: '6px',
                                    padding: '5px 8px',
                                    fontSize: '11px',
                                    color: '#f8fafc',
                                    outline: 'none',
                                    resize: 'vertical',
                                  }}
                                />
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  {row.lastUpdated && (
                                    <span style={{ fontSize: '9px', color: '#64748b' }}>
                                      🕒 {new Date(row.lastUpdated).toLocaleDateString()}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleSaveRow(row)}
                                    disabled={isSaving}
                                    style={{
                                      background: isRowUnsaved ? '#2563eb' : 'transparent',
                                      border: isRowUnsaved ? 'none' : '1px solid #1e293b',
                                      color: isRowUnsaved ? '#ffffff' : '#64748b',
                                      borderRadius: '4px',
                                      padding: '2px 6px',
                                      fontSize: '10px',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      marginLeft: 'auto',
                                    }}
                                  >
                                    {isSaving ? 'Saving…' : isRowUnsaved ? '💾 Save' : '✓'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </td>

                          {/* 8. Responsible Team */}
                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                            {isPublicView ? (
                              <span
                                style={{
                                  display: 'inline-block',
                                  background: 'rgba(8,145,178,0.12)',
                                  border: '1px solid rgba(8,145,178,0.3)',
                                  color: '#38bdf8',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {currentTeam || '—'}
                              </span>
                            ) : (
                              <select
                                value={currentTeam}
                                onChange={(e) => handleResponsibleChange(row, e.target.value)}
                                style={{ background: '#091426', border: '1px solid #1e293b', color: '#38bdf8', borderRadius: '6px', padding: '4px 6px', fontSize: '11px', outline: 'none' }}
                              >
                                {(!currentTeam || currentTeam === 'Not Assigned') && <option value="">-- Team --</option>}
                                {allowedTeams.map((t) => (
                                  <option key={t} value={t}>{t}</option>
                                ))}
                              </select>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div style={{ padding: '12px 20px', borderTop: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                    Showing {startIndex + 1}–{Math.min(endIndex, totalItems)} of {totalItems} records
                  </span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    style={{ background: '#091426', border: '1px solid #1e293b', color: '#94a3b8', borderRadius: '6px', padding: '3px 8px', fontSize: '11px' }}
                  >
                    <option value={10}>10 per page</option>
                    <option value={25}>25 per page</option>
                    <option value={50}>50 per page</option>
                    <option value={-1}>Show All</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setCurrentPage((p) => p - 1)}
                    style={{
                      background: '#091426',
                      border: '1px solid #1e293b',
                      color: safePage <= 1 ? '#475569' : '#94a3b8',
                      padding: '5px 12px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: safePage <= 1 ? 'default' : 'pointer',
                    }}
                  >
                    ← Prev
                  </button>
                  <span style={{ fontSize: '11px', color: '#f8fafc', padding: '5px 10px', fontWeight: 700 }}>
                    Page {safePage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setCurrentPage((p) => p + 1)}
                    style={{
                      background: '#091426',
                      border: '1px solid #1e293b',
                      color: safePage >= totalPages ? '#475569' : '#94a3b8',
                      padding: '5px 12px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: safePage >= totalPages ? 'default' : 'pointer',
                    }}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
