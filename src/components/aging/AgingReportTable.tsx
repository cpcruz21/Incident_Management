'use client';

import React, { useRef, useState, useMemo, useEffect, useCallback, useId } from 'react';
import { ChartColumn, Download, Flame, NotebookText, Trash2, Edit2, Check, X } from 'lucide-react';
import type { AgingReportData, AgingRemarksRow, AgingBucket, RemarksTableData, HighImpactIncident } from '@/types/aging';
import type { Incident } from '@/types/incident';
import { AGING_BUCKET_ORDER, AGING_BUCKET_LABELS } from '@/types/aging';
import { buildRemarksTableData } from '@/lib/aging/calculator';
import { saveAgingSnapshot } from '@/lib/aging/snapshot';
import { fetchDepartmentMappings } from '@/lib/api/client';
import { DEFAULT_DEPARTMENT_MAPPINGS } from '@/lib/departments/mappings';
import { RequestIdLink } from '@/components/report/RequestIdLink';
import { SLAMetricHeading } from '@/components/report/SLATableLabels';
import { ReportImageExport } from '@/components/report/ReportImageExport';
import { ReportDetailsStrip } from '@/components/report/ReportDetailsStrip';
import { HighImpactInput } from '@/components/aging/HighImpactInput';

interface AgingReportTableProps {
  data: AgingReportData;
  onCellClick?: (title: string, incidentIds: string[]) => void;
  routedIncidents?: Incident[];
  onSaveReport?: (data: AgingReportData) => void;
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

const DATE_SPLIT_REGEX = /(\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?:[ \t]*-[ \t]*)?)/g;
const IS_DATE_PATTERN = /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?:[ \t]*-[ \t]*)?$/;

function renderSingleColorUpdateText(text: string) {
  if (!text) return null;
  // Preserve authored line breaks and separate dated notes that run together.
  const readableText = text.replace(/\r\n?/g, '\n').replace(
    /([.!?;])[ \t]+(?=\d{1,2}\/\d{1,2}(?:\/\d{2,4})?[ \t]*-)/g,
    '$1\n\n'
  );
  const parts = readableText.split(DATE_SPLIT_REGEX);

  return parts.map((part, idx) => {
    if (part && IS_DATE_PATTERN.test(part.trim())) {
      return (
        <span
          key={idx}
          className="aging-update-date"
        >
          {part.trim()}
        </span>
      );
    }
    return <span key={idx}>{part}</span>;
  });
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
  const slaPanelRef = useRef<HTMLElement>(null);
  const distributionPanelRef = useRef<HTMLElement>(null);
  const distributionHeadingId = useId();
  const [isSaved, setIsSaved] = useState(false);
  const [activeTab, setActiveTabState] = useState<'aging' | 'remarks' | 'high-impact'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem('smac_active_report_tab');
        if (stored === 'aging' || stored === 'remarks' || stored === 'high-impact') return stored;
      } catch { }
    }
    return 'aging';
  });

  const setActiveTab = useCallback((tab: 'aging' | 'remarks' | 'high-impact') => {
    setActiveTabState(tab);
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('smac_active_report_tab', tab);
      } catch { }
    }
  }, []);

  const [highImpactIncidents, setHighImpactIncidents] = useState<HighImpactIncident[]>(
    () => data.highImpactIncidents || []
  );

  useEffect(() => {
    if (data.highImpactIncidents) {
      setHighImpactIncidents(data.highImpactIncidents);
    }
  }, [data.highImpactIncidents]);

  const [editingHighImpactId, setEditingHighImpactId] = useState<string | null>(null);
  const [editingHighImpactNote, setEditingHighImpactNote] = useState<string>('');

  // Dynamic Department Mappings from Server API
  const [deptMappings, setDeptMappings] = useState<Record<string, string[]>>(DEFAULT_DEPARTMENT_MAPPINGS);
  const [availableDepartments, setAvailableDepartments] = useState<string[]>(Object.keys(DEFAULT_DEPARTMENT_MAPPINGS));

  // Saved notes belong to this report; pending edits never affect another extract.
  const [savedRows, setSavedRows] = useState<Record<string, AgingRemarksRow>>({});
  const committedRemarks = useRef<RemarksTableData | null>(null);

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
  const [isSavingReport, setIsSavingReport] = useState(false);
  const isSavingRemarks = isBulkSaving || isSavingReport || Object.values(savingRows).some(Boolean);

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
  const [isExportingRemarks, setIsExportingRemarks] = useState(false);

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
      const mappingsRes = await fetchDepartmentMappings();

      if (mappingsRes && mappingsRes.mappings) {
        setDeptMappings(mappingsRes.mappings);
        const depts =
          mappingsRes.departments && mappingsRes.departments.length > 0
            ? mappingsRes.departments
            : Object.keys(mappingsRes.mappings);
        setAvailableDepartments(depts);
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

    if (!committedRemarks.current) {
      committedRemarks.current = { ...baseTable, rows: baseTable.rows.map(row => ({ ...row, isUnsaved: false })) };
    }
    const mergedRows: AgingRemarksRow[] = baseTable.rows.map((row) => {
      const saved = savedRows[row.requestId];
      let dept = saved?.department ?? row.department;
      let resp = saved?.responsibleOrDependency ?? row.responsibleOrDependency;
      let update = saved?.recentUpdate ?? row.recentUpdate;
      let lastUpdated = saved?.lastUpdated ?? row.lastUpdated;
      let updatedBy = saved?.updatedBy ?? row.updatedBy;
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
    savedRows,
    unsavedEdits,
    normalizeResponsibleTeam,
  ]);

  const updateAsOfDate = useMemo(() => {
    if (remarksData.periodTo) {
      const d = new Date(remarksData.periodTo);
      if (!isNaN(d.getTime())) {
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${mm}/${dd}/${yyyy}`;
      }
      const match = remarksData.periodTo.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
      if (match) {
        return `${match[1].padStart(2, '0')}/${match[2].padStart(2, '0')}/${match[3].length === 2 ? '20' + match[3] : match[3]}`;
      }
    }
    const dateObj = data.asOf ? new Date(data.asOf) : new Date(data.generatedAt);
    if (!isNaN(dateObj.getTime())) {
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(dateObj.getDate()).padStart(2, '0');
      const yyyy = dateObj.getFullYear();
      return `${mm}/${dd}/${yyyy}`;
    }
    return new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  }, [remarksData.periodTo, data.asOf, data.generatedAt]);

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

  const acceptSavedSnapshot = (snapshot: AgingReportData) => {
    const remarks = snapshot.remarksTable!;
    committedRemarks.current = remarks;
    setSavedRows(Object.fromEntries(remarks.rows.map(row => [row.requestId, row])));
  };

  const handleSaveRow = async (row: AgingRemarksRow) => {
    if (isPublicView || isSavingRemarks) return;
    const local = unsavedEdits[row.requestId];
    const base = committedRemarks.current || remarksData;
    const remarks = { ...base, rows: base.rows.map(saved => saved.requestId === row.requestId
      ? { ...row, ...local, isUnsaved: true } : saved) };
    setSavingRows(prev => ({ ...prev, [row.requestId]: true }));
    try {
      const snapshot = await saveAgingSnapshot({ ...data, highImpactIncidents }, remarks, accountName, routedIncidents);
      acceptSavedSnapshot(snapshot);
      setUnsavedEdits(prev => {
        const next = { ...prev };
        if (next[row.requestId] === local) delete next[row.requestId];
        return next;
      });
      const saved = snapshot.remarksTable!.rows.find(item => item.requestId === row.requestId)!;
      onUpdateRemarksRow?.(saved.requestId, saved.recentUpdate, saved.responsibleOrDependency,
        saved.department, saved.lastUpdated, saved.updatedBy, false);
      setToastMessage({ text: 'Saved this update to the current report.', type: 'success' });
    } catch (error) {
      setToastMessage({ text: error instanceof Error ? error.message : 'Could not save this update.', type: 'error' });
    } finally {
      setSavingRows(prev => ({ ...prev, [row.requestId]: false }));
    }
  };

  const handleBulkSave = async () => {
    if (isPublicView || isSavingRemarks) return;
    const pending = unsavedEdits;
    const keys = Object.keys(pending);
    if (!keys.length) return;
    const base = committedRemarks.current || remarksData;
    const byId = new Map(remarksData.rows.map(row => [row.requestId, row]));
    const remarks = { ...base, rows: base.rows.map(row => pending[row.requestId]
      ? { ...byId.get(row.requestId)!, isUnsaved: true } : row) };
    setIsBulkSaving(true);
    try {
      const snapshot = await saveAgingSnapshot({ ...data, highImpactIncidents }, remarks, accountName, routedIncidents);
      acceptSavedSnapshot(snapshot);
      setUnsavedEdits(prev => {
        const next = { ...prev };
        for (const id of keys) if (next[id] === pending[id]) delete next[id];
        return next;
      });
      for (const row of snapshot.remarksTable!.rows) {
        if (pending[row.requestId]) onUpdateRemarksRow?.(row.requestId, row.recentUpdate,
          row.responsibleOrDependency, row.department, row.lastUpdated, row.updatedBy, false);
      }
      setToastMessage({ text: 'Saved all pending updates to the current report.', type: 'success' });
    } catch (error) {
      setToastMessage({ text: error instanceof Error ? error.message : 'Could not save these updates.', type: 'error' });
    } finally { setIsBulkSaving(false); }
  };

  const handleSaveCompleteReport = async () => {
    if (isPublicView || isSavingRemarks) return;
    setIsSavingReport(true);
    try {
      const snapshot = await saveAgingSnapshot({ ...data, highImpactIncidents }, remarksData, accountName, routedIncidents, true);
      acceptSavedSnapshot(snapshot);
      setUnsavedEdits({});
      onSaveReport?.(snapshot);
      setIsSaved(true);
      setToastMessage({ text: 'Report saved. Earlier reports are unchanged.', type: 'success' });
      setTimeout(() => setIsSaved(false), 4000);
    } catch (error) {
      setToastMessage({ text: error instanceof Error ? error.message : 'Could not save this report.', type: 'error' });
    } finally { setIsSavingReport(false); }
  };

  const renderIncidentCount = (count: number, title: string, ids?: string[]) =>
    onCellClick && ids?.length ? (
      <button
        type="button"
        className="aging-matrix-count"
        onClick={() => onCellClick(title, ids)}
        aria-label={`${title}, ${count} incidents`}
      >
        {count}
      </button>
    ) : count;

  const unsavedCount = useMemo(() => remarksData.rows.filter(row => row.isUnsaved).length, [remarksData.rows]);

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

  const visibleRows = useMemo(() => {
    if (isPublicView || pageSize === -1) return filteredAndSortedRows;
    return filteredAndSortedRows.slice(startIndex, endIndex);
  }, [filteredAndSortedRows, isPublicView, pageSize, startIndex, endIndex]);

  const handleExportXlsx = async () => {
    if (!totalItems || isExportingRemarks) return;

    setIsExportingRemarks(true);
    try {
      const { exportAgingRemarksToXlsx } = await import('@/lib/report/export');
      exportAgingRemarksToXlsx(filteredAndSortedRows, data.reportPeriod || '');
      setToastMessage({ text: `Exported ${totalItems} aging records.`, type: 'success' });
    } catch (error) {
      const text = error instanceof Error && error.message.includes('32767')
        ? 'One of the exported fields exceeds Excel’s 32,767-character cell limit.'
        : 'Could not export the Excel workbook. Try again.';
      setToastMessage({ text, type: 'error' });
    } finally {
      setIsExportingRemarks(false);
    }
  };

  // Calculate bucket totals
  const bucketTotals: Record<AgingBucket, number> = useMemo(() => {
    const res: Record<string, number> = {};
    for (const b of AGING_BUCKET_ORDER) {
      res[b] = data.agingRows.reduce((sum, r) => sum + (r.buckets[b] || 0), 0);
    }
    return res as Record<AgingBucket, number>;
  }, [data.agingRows]);

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

  const formatComparisonRate = (rate: number | null) => rate === null ? '—' : `${rate.toFixed(1)}%`;

  return (
    <div ref={reportRef} className="aging-report" data-public-view={isPublicView} data-active-tab={activeTab} style={{ width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column' }} id="aging-report-canvas">
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
            boxShadow: '0 8px 30px var(--ui-shadow, rgba(0,0,0,0.5))',
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
        className="aging-report-header"
        style={{
          background: 'linear-gradient(145deg, var(--ui-surface, #111c30) 0%, var(--ui-surface, #0d1a2e) 100%)',
          border: '1px solid var(--ui-panel-border, var(--ui-border))',
          borderRadius: '16px',
          padding: 'var(--aging-header-padding, 18px 24px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          boxShadow: '0 4px 20px var(--ui-shadow, rgba(0,0,0,0.25))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: 'var(--aging-header-icon-size, 44px)',
              height: 'var(--aging-header-icon-size, 44px)',
              borderRadius: '12px',
              background: 'var(--aging-header-icon-background, linear-gradient(135deg, #d97706, #dc2626))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              boxShadow: 'var(--aging-header-icon-shadow, 0 4px 14px rgba(217,119,6,0.3))',
            }}
          >
            ⏳
          </div>
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ui-text, #f8fafc)', margin: 0, letterSpacing: '-0.01em' }}>
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
                  color: 'var(--ui-warning, #fbbf24)',
                }}
              >
                {data.reportPeriod || 'Current Period'}
              </span>
            </div>
          </div>
        </div>

        {/* Right Action Controls: Admin Actions */}
        {!isPublicView && (
          <div style={{ display: 'flex', gap: '8px' }}>
            {unsavedCount > 0 && (
              <button
                type="button"
                onClick={handleBulkSave}
                disabled={isSavingRemarks}
                style={{
                  background: 'rgba(245,158,11,0.15)',
                  border: '1px solid #f59e0b',
                  color: 'var(--ui-warning, #fbbf24)',
                  padding: '7px 12px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {isBulkSaving ? '💾 Saving…' : `💾 Save Unsaved (${unsavedCount})`}
              </button>
            )}
            <button
              type="button"
              onClick={handleSaveCompleteReport}
              disabled={isSavingRemarks}
              style={{
                background: isSaved ? 'rgba(16,185,129,0.15)' : '#2563eb',
                border: isSaved ? '1px solid #10b981' : 'none',
                color: isSaved ? 'var(--ui-success, #ffffff)' : '#ffffff',
                padding: '7px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: isSaved ? 'none' : '0 2px 10px rgba(37,99,235,0.3)',
              }}
            >
              {isSavingReport ? 'Saving…' : isSaved ? '✓ Archived' : '💾 Archive Report'}
            </button>
          </div>
        )}
      </div>

      <div className="aging-report-tabs" role="group" aria-label="Aging report views">
        <button type="button" aria-pressed={activeTab === 'aging'} onClick={() => setActiveTab('aging')}>
          <ChartColumn size={16} aria-hidden="true" />
          <span>SLA &amp; Distribution</span>
        </button>
        <button type="button" aria-pressed={activeTab === 'remarks'} onClick={() => setActiveTab('remarks')}>
          <NotebookText size={16} aria-hidden="true" />
          <span>Remarks Table</span>
          {remarksData.totalRecords > 0 && (
            <span className="aging-report-tab-count">{remarksData.totalRecords}</span>
          )}
        </button>
        <button type="button" aria-pressed={activeTab === 'high-impact'} onClick={() => setActiveTab('high-impact')}>
          <Flame size={16} aria-hidden="true" />
          <span>High Impact</span>
          {highImpactIncidents.length > 0 && (
            <span className="aging-report-tab-count" style={{ background: '#dc2626' }}>{highImpactIncidents.length}</span>
          )}
        </button>
      </div>

      {/* ══ TAB 1: AGING MODULE (SLA & DISTRIBUTION) ══ */}
      {activeTab === 'aging' && (
        <div className="aging-module">
          <ReportDetailsStrip
            from={remarksData.periodFrom}
            to={remarksData.periodTo}
            totalRecords={remarksData.rows.length ? remarksData.totalRecords : data.agingGrandTotal}
          >
            <ReportImageExport
              sources={[
                { panel: slaPanelRef, title: 'SLA Compliance', filename: 'aging-sla-compliance.png' },
                { panel: distributionPanelRef, title: 'Aging Distribution', filename: 'aging-distribution.png' },
              ]}
              dialogTitle="Save Aging images"
              period={data.reportPeriod}
            />
          </ReportDetailsStrip>

          <section ref={slaPanelRef} className="aging-matrix-panel" aria-label="SLA compliance">
            <div className="aging-sla-table-scroll">
              <table className="aging-sla-comparison-table" role="table" aria-label="First response and resolution by technician">
                <colgroup><col className="aging-matrix-team-column" /><col style={{ width: '10%' }} /></colgroup>
                <colgroup>
                  <col style={{ width: '6%' }} /><col style={{ width: '6%' }} />
                  <col style={{ width: '12%' }} /><col style={{ width: '12%' }} />
                </colgroup>
                <colgroup>
                  <col style={{ width: '6%' }} /><col style={{ width: '6%' }} />
                  <col style={{ width: '12%' }} /><col style={{ width: '12%' }} />
                </colgroup>
                <thead role="rowgroup">
                  <tr role="row">
                    <th className="aging-matrix-team-heading" rowSpan={2} scope="col" role="columnheader">Technician</th>
                    <th rowSpan={2} scope="col" role="columnheader">Total IRs</th>
                    <th className="aging-matrix-group" colSpan={4} scope="colgroup" role="columnheader"><SLAMetricHeading metric="response" /></th>
                    <th className="aging-matrix-group is-resolution" colSpan={4} scope="colgroup" role="columnheader"><SLAMetricHeading metric="resolution" /></th>
                  </tr>
                  <tr role="row">
                    {['response', 'resolution'].map(metric => (
                      <React.Fragment key={metric}>
                        <th className="aging-matrix-failed-heading" scope="col" role="columnheader">Failed</th>
                        <th scope="col" role="columnheader">Passed</th>
                        <th scope="col" role="columnheader" data-period="current">SLA pass rate<br />This week</th>
                        <th scope="col" role="columnheader" data-period="previous" title={data.previousWeek.sourcePeriod}>SLA pass rate<br />Last week</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {data.slaRows.map(row => (
                    <tr role="row" key={row.teamName}>
                      <th scope="row" role="rowheader">{row.teamName}</th>
                      <td role="cell" data-label="Tickets">{renderIncidentCount(row.totalIRs || 0, `${row.teamName} — Total IRs`, row.incidentIds)}</td>
                      <td role="cell" data-label="Failed" className={row.firstResponse.failed > 0 ? 'sla-failed-count' : undefined}>
                        {renderIncidentCount(row.firstResponse.failed, `${row.teamName} — FR Failed`, row.firstResponse.failedIds)}
                      </td>
                      <td role="cell" data-label="Passed">{renderIncidentCount(row.firstResponse.passed, `${row.teamName} — FR Passed`, row.firstResponse.passedIds)}</td>
                      <td role="cell" className="aging-sla-rate-cell" data-period="current" data-label="This week">{formatComparisonRate(row.firstResponse.slaPassRate)}</td>
                      <td role="cell" className="aging-sla-rate-cell" data-period="previous" data-label="Last week">{formatComparisonRate(data.previousWeek.sla?.firstResponse[row.teamName] ?? null)}</td>
                      <td role="cell" data-label="Failed" className={row.resolutionTime.failed > 0 ? 'sla-failed-count' : undefined}>
                        {renderIncidentCount(row.resolutionTime.failed, `${row.teamName} — RT Failed`, row.resolutionTime.failedIds)}
                      </td>
                      <td role="cell" data-label="Passed">{renderIncidentCount(row.resolutionTime.passed, `${row.teamName} — RT Passed`, row.resolutionTime.passedIds)}</td>
                      <td role="cell" className="aging-sla-rate-cell" data-period="current" data-label="This week">{formatComparisonRate(row.resolutionTime.slaPassRate)}</td>
                      <td role="cell" className="aging-sla-rate-cell" data-period="previous" data-label="Last week">{formatComparisonRate(data.previousWeek.sla?.resolutionTime[row.teamName] ?? null)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot role="rowgroup">
                  <tr role="row">
                    <th scope="row" role="rowheader">Total</th>
                    <td role="cell" data-label="Tickets">{data.slaTotals.totalIRs}</td>
                    <td role="cell" data-label="Failed" data-failed={data.slaTotals.firstResponse.failed > 0}>{data.slaTotals.firstResponse.failed}</td>
                    <td role="cell" data-label="Passed">{data.slaTotals.firstResponse.passed}</td>
                    <td role="cell" className="aging-sla-rate-cell" data-period="current" data-label="This week">{formatComparisonRate(data.slaTotals.firstResponse.slaPassRate)}</td>
                    <td role="cell" className="aging-sla-rate-cell" data-period="previous" data-label="Last week">{formatComparisonRate(data.previousWeek.sla?.firstResponseTotal ?? null)}</td>
                    <td role="cell" data-label="Failed" data-failed={data.slaTotals.resolutionTime.failed > 0}>{data.slaTotals.resolutionTime.failed}</td>
                    <td role="cell" data-label="Passed">{data.slaTotals.resolutionTime.passed}</td>
                    <td role="cell" className="aging-sla-rate-cell" data-period="current" data-label="This week">{formatComparisonRate(data.slaTotals.resolutionTime.slaPassRate)}</td>
                    <td role="cell" className="aging-sla-rate-cell" data-period="previous" data-label="Last week">{formatComparisonRate(data.previousWeek.sla?.resolutionTimeTotal ?? null)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section ref={distributionPanelRef} className="aging-matrix-panel" aria-labelledby={distributionHeadingId}>
            <div className="aging-sla-table-scroll">
              <table className="aging-distribution-table" role="table" aria-labelledby={distributionHeadingId}>
                <colgroup>
                  <col className="aging-matrix-team-column" />
                  {AGING_BUCKET_ORDER.map(bucket => <col key={bucket} />)}
                </colgroup>
                <colgroup><col style={{ width: '11%' }} /><col style={{ width: '11%' }} /></colgroup>
                <thead role="rowgroup">
                  <tr role="row">
                    <th className="aging-matrix-title" colSpan={AGING_BUCKET_ORDER.length + 1} scope="colgroup" role="columnheader">
                      <h3 id={distributionHeadingId}>Aging Incident Report</h3>
                    </th>
                    <th rowSpan={2} scope="col" role="columnheader" data-period="current">Total aging IRs<br />This week</th>
                    <th rowSpan={2} scope="col" role="columnheader" data-period="previous" title={data.previousWeek.sourcePeriod}>Total aging IRs<br />Last week</th>
                  </tr>
                  <tr role="row">
                    <th className="aging-matrix-team-heading" scope="col" role="columnheader">Technician</th>
                    {AGING_BUCKET_ORDER.map(bucket => (
                      <th key={bucket} scope="col" role="columnheader">{AGING_BUCKET_LABELS[bucket]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {data.agingRows.map(row => (
                    <tr role="row" key={row.teamName}>
                      <th scope="row" role="rowheader">{row.teamName}</th>
                      {AGING_BUCKET_ORDER.map(bucket => {
                        const count = row.buckets[bucket] || 0;
                        return (
                          <td role="cell" key={bucket} data-label={AGING_BUCKET_LABELS[bucket]}>
                            {count > 0 ? renderIncidentCount(count, `${row.teamName} — ${AGING_BUCKET_LABELS[bucket]}`, row.bucketIncidentIds[bucket]) : '—'}
                          </td>
                        );
                      })}
                      <td role="cell" data-period="current" data-label="This week">
                        {row.totalAging > 0 ? renderIncidentCount(row.totalAging, `${row.teamName} — Total Aging IRs`, row.incidentIds) : '—'}
                      </td>
                      <td role="cell" data-period="previous" data-label="Last week">{data.previousWeek.teamTotals[row.teamName] ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot role="rowgroup">
                  <tr role="row">
                    <th scope="row" role="rowheader">Total</th>
                    {AGING_BUCKET_ORDER.map(bucket => <td role="cell" key={bucket} data-label={AGING_BUCKET_LABELS[bucket]}>{bucketTotals[bucket] || '—'}</td>)}
                    <td role="cell" data-period="current" data-label="This week">{data.agingGrandTotal > 0 ? data.agingGrandTotal : '—'}</td>
                    <td role="cell" data-period="previous" data-label="Last week">{data.previousWeek.grandTotal ?? '—'}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ══ TAB 2: REMARKS TABLE (ENHANCED MODERN DATA TABLE) ══ */}
      {activeTab === 'remarks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* ── Search & Filter Toolbar ── */}
          <div
            className="aging-remarks-toolbar"
            style={{
              background: 'var(--ui-surface, #111c30)',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            {/* Search Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px' }}>
              <span style={{ fontSize: '14px', color: 'var(--ui-muted, #64748b)' }}>🔍</span>
              <input
                type="text"
                placeholder="Search records…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--ui-inset, #091426)',
                  border: '1px solid var(--ui-control-border)',
                  borderRadius: '8px',
                  padding: '7px 12px',
                  fontSize: '12px',
                  color: 'var(--ui-text, #f8fafc)',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{ background: 'transparent', border: 'none', color: 'var(--ui-muted, #64748b)', cursor: 'pointer' }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Dropdowns & Export Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
              >
                <option value="ALL">All Departments</option>
                {filterOptions.departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
              >
                <option value="ALL">All Teams</option>
                {filterOptions.teams.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
              >
                <option value="aging-desc">Aging: High → Low</option>
                <option value="aging-asc">Aging: Low → High</option>
                <option value="id-asc">Request ID: A-Z</option>
                <option value="dept-asc">Department: A-Z</option>
                <option value="recent-update">Has Recent Update</option>
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
                  style={{ background: 'transparent', border: '1px solid var(--ui-border, #243650)', color: 'var(--ui-secondary, #94a3b8)', borderRadius: '6px', padding: '5px 10px', fontSize: '11px', cursor: 'pointer' }}
                >
                  Clear
                </button>
              )}

              <button
                type="button"
                className="aging-export-action"
                onClick={handleExportXlsx}
                disabled={totalItems === 0 || isExportingRemarks}
                title="Export all matching rows in the current sort order"
              >
                <Download size={14} aria-hidden="true" /> {isExportingRemarks ? 'Exporting…' : 'Export XLSX'}
              </button>
            </div>
          </div>

          {/* ── THE REMARKS TABLE (ENHANCED MODERN SAAS TABLE) ── */}
          <div
            style={{
              background: 'var(--ui-surface, #111c30)',
              border: '1px solid var(--ui-panel-border, var(--ui-border))',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 4px 20px var(--ui-shadow, rgba(0,0,0,0.25))',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ overflowX: isPublicView ? undefined : 'auto', flex: 1 }}>
              <table className={isPublicView ? 'aging-public-remarks-table' : undefined} role="table" style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px' }}>
                <thead role="rowgroup">
                  <tr role="row" style={{ background: 'var(--ui-inset, #091426)', borderBottom: '1px solid var(--ui-border, #1e293b)' }}>
                    <th scope="col" role="columnheader" style={{ padding: '12px 14px', textAlign: 'center', color: 'var(--ui-muted, #64748b)', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', width: isPublicView ? '9%' : '110px' }}>
                      RequestID
                    </th>
                    <th scope="col" role="columnheader" style={{ padding: '12px 14px', textAlign: 'left', color: 'var(--ui-muted, #64748b)', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', width: isPublicView ? '11%' : '130px' }}>
                      Department
                    </th>
                    <th scope="col" role="columnheader" style={{ padding: '12px 14px', textAlign: 'left', color: 'var(--ui-muted, #64748b)', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', width: isPublicView ? '8%' : '130px' }}>
                      Category
                    </th>
                    <th scope="col" role="columnheader" style={{ padding: '12px 14px', textAlign: 'left', color: 'var(--ui-muted, #64748b)', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', width: isPublicView ? '9%' : '130px' }}>
                      Sub Category
                    </th>
                    <th scope="col" role="columnheader" style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--ui-muted, #64748b)', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', width: isPublicView ? '19%' : undefined, minWidth: isPublicView ? undefined : '220px' }}>
                      Description
                    </th>
                    <th scope="col" role="columnheader" style={{ padding: '12px 14px', textAlign: 'center', color: 'var(--ui-muted, #64748b)', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', width: isPublicView ? '7%' : '100px' }}>
                      Aging Days
                    </th>
                    <th scope="col" role="columnheader" style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--ui-muted, #64748b)', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', width: isPublicView ? '27%' : undefined, minWidth: isPublicView ? undefined : '320px' }}>
                      Recent Update
                    </th>
                    <th scope="col" role="columnheader" style={{ padding: '12px 14px', textAlign: 'center', color: 'var(--ui-muted, #64748b)', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', width: isPublicView ? '10%' : '150px' }}>
                      Responsible Team
                    </th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {filteredAndSortedRows.length === 0 ? (
                    <tr role="row">
                      <td role="cell" colSpan={8} style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--ui-muted, #64748b)', fontSize: '13px' }}>
                        No matching aging incidents found.
                      </td>
                    </tr>
                  ) : (
                    visibleRows.map((row) => {
                      const isRowUnsaved = Boolean(row.isUnsaved);
                      const isSaving = Boolean(savingRows[row.requestId]);
                      const currentTeam = normalizeResponsibleTeam(row.responsibleOrDependency);
                      const allowedTeams = getAllowedTeams(row.department);

                      const severityColor = row.agingDays > 30 ? 'var(--ui-danger)'
                        : row.agingDays >= 15 ? 'var(--ui-orange)'
                        : row.agingDays >= 8 ? 'var(--ui-warning)'
                        : 'var(--ui-success)';

                      return (
                        <tr
                          role="row"
                          key={row.requestId}
                          style={{
                            borderBottom: '1px solid var(--ui-border)',
                            background: isRowUnsaved && !isPublicView ? 'rgba(245,158,11,0.05)' : 'transparent',
                            transition: 'background 0.12s ease',
                          }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = 'rgba(37,99,235,0.06)')}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = isRowUnsaved && !isPublicView ? 'rgba(245,158,11,0.05)' : 'transparent')}
                        >
                          {/* 1. Request ID opens the matching SDP request. */}
                          <td role="cell" data-label="Request ID" style={{ padding: '12px 14px', textAlign: isPublicView ? undefined : 'center' }}>
                            <RequestIdLink requestId={row.requestId} />
                            {isRowUnsaved && !isPublicView && (
                              <span style={{ color: 'var(--ui-warning, #f59e0b)', fontSize: '9px', marginLeft: '4px' }}>●</span>
                            )}
                          </td>

                          {/* 2. Department */}
                          <td role="cell" data-label="Department" style={{ padding: '12px 14px', color: 'var(--ui-link, #93c5fd)', fontWeight: 600 }}>
                            {isPublicView ? (
                              <span style={{ color: 'var(--ui-text, #e2e8f0)', fontSize: '12px', fontWeight: 500 }}>
                                {row.department || 'Not Assigned'}
                              </span>
                            ) : (
                              <select
                                value={row.department || 'Not Assigned'}
                                disabled={isSavingRemarks}
                                onChange={(e) => handleDepartmentChange(row, e.target.value)}
                                style={{ background: 'var(--ui-inset, #091426)', border: '1px solid var(--ui-control-border)', color: 'var(--ui-link, #93c5fd)', borderRadius: '6px', padding: '4px 6px', fontSize: '11px' }}
                              >
                                <option value="Not Assigned">Not Assigned</option>
                                {availableDepartments.filter((d) => d !== 'Not Assigned').map((d) => (
                                  <option key={d} value={d}>{d}</option>
                                ))}
                              </select>
                            )}
                          </td>

                          {/* 3. Category */}
                          <td role="cell" data-label="Category" style={{ padding: '12px 14px', color: 'var(--ui-secondary, #cbd5e1)' }} title={row.category}>
                            {row.category || '—'}
                          </td>

                          {/* 4. Sub Category */}
                          <td role="cell" data-label="Sub Category" style={{ padding: '12px 14px', color: 'var(--ui-secondary, #94a3b8)' }} title={row.subCategory}>
                            {row.subCategory || '—'}
                          </td>

                          {/* 5. Description */}
                          <td role="cell" data-label="Description" style={{ padding: '12px 16px', color: 'var(--ui-text, #f8fafc)', lineHeight: 1.5 }} title={row.description}>
                            <div style={isPublicView ? { whiteSpace: 'pre-wrap' } : { maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                              {row.description || '—'}
                            </div>
                          </td>

                          {/* 6. Aging Days (Color-coded Pill) */}
                          <td role="cell" data-label="Aging Days" style={{ padding: '12px 14px', textAlign: isPublicView ? undefined : 'center' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                background: `color-mix(in srgb, ${severityColor} 9%, var(--ui-surface))`,
                                border: `1px solid ${severityColor}`,
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
                          <td role="cell" data-label="Recent Update" style={{ padding: '8px 10px', verticalAlign: 'top', minWidth: isPublicView ? undefined : '340px' }}>
                            {isPublicView ? (
                              row.recentUpdate && row.recentUpdate.trim() ? (
                                <div className="aging-update-card">
                                  {/* Update Content with Single-Color Date Chips */}
                                  <div className="aging-update-copy">
                                    {renderSingleColorUpdateText(row.recentUpdate)}
                                  </div>

                                  {row.lastUpdated && (
                                    <div className="aging-update-meta">
                                      <span>{new Date(row.lastUpdated).toLocaleDateString()}</span>
                                      {row.updatedBy && <span>by {row.updatedBy}</span>}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span style={{ color: 'var(--ui-muted, #64748b)', fontSize: '13px', display: 'inline-block', padding: '4px 6px' }}>—</span>
                              )
                            ) : (
                              <div
                                style={{
                                  background: 'rgba(56, 189, 248, 0.04)',
                                  border: '1px solid rgba(56, 189, 248, 0.22)',
                                  borderLeft: '3px solid #38bdf8',
                                  borderRadius: '8px',
                                  padding: '8px 10px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '6px',
                                }}
                              >
                                <textarea
                                  value={row.recentUpdate || ''}
                                  disabled={isSavingRemarks}
                                  onChange={(e) => handleRemarksChange(row, e.target.value)}
                                  placeholder="Type recent update notes…"
                                  aria-label={`Recent update for ${row.requestId}`}
                                  rows={3}
                                  style={{
                                    width: '100%',
                                    background: 'var(--ui-inset, #091426)',
                                    border: '1px solid var(--ui-control-border)',
                                    borderRadius: '6px',
                                    padding: '6px 8px',
                                    fontSize: '13px',
                                    lineHeight: 1.65,
                                    color: 'var(--ui-text, #f8fafc)',
                                    resize: 'vertical',
                                  }}
                                />

                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                                  {row.lastUpdated && (
                                    <span style={{ fontSize: '10px', color: 'var(--ui-secondary, #94a3b8)' }}>
                                      🕒 {new Date(row.lastUpdated).toLocaleDateString()}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleSaveRow(row)}
                                    disabled={isSavingRemarks}
                                    style={{
                                      background: isRowUnsaved ? 'var(--ui-link)' : 'transparent',
                                      border: `1px solid ${isRowUnsaved ? 'var(--ui-link)' : 'var(--ui-control-border)'}`,
                                      color: isRowUnsaved ? '#ffffff' : 'var(--ui-muted, #64748b)',
                                      borderRadius: '4px',
                                      padding: '3px 8px',
                                      fontSize: '10px',
                                      fontWeight: 700,
                                      cursor: isSaving ? 'not-allowed' : 'pointer',
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
                          <td role="cell" data-label="Responsible Team" style={{ padding: '12px 14px', textAlign: isPublicView ? undefined : 'center' }}>
                            {isPublicView ? (
                              <span style={{ color: 'var(--ui-text, #e2e8f0)', fontSize: '12px', fontWeight: 500 }}>
                                {currentTeam || '—'}
                              </span>
                            ) : (
                              <select
                                value={currentTeam}
                                disabled={isSavingRemarks}
                                onChange={(e) => handleResponsibleChange(row, e.target.value)}
                                style={{ background: 'var(--ui-inset, #091426)', border: '1px solid var(--ui-control-border)', color: 'var(--ui-link, #38bdf8)', borderRadius: '6px', padding: '4px 6px', fontSize: '11px' }}
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
            {!isPublicView && totalPages > 1 && (
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--ui-border, #1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--ui-secondary, #94a3b8)' }}>
                    Showing {startIndex + 1}–{Math.min(endIndex, totalItems)} of {totalItems} records
                  </span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    style={{ background: 'var(--ui-inset, #091426)', border: '1px solid var(--ui-control-border)', color: 'var(--ui-secondary, #94a3b8)', borderRadius: '6px', padding: '3px 8px', fontSize: '11px' }}
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
                      background: 'var(--ui-inset, #091426)',
                      border: '1px solid var(--ui-border, #1e293b)',
                      color: safePage <= 1 ? '#475569' : 'var(--ui-secondary, #94a3b8)',
                      padding: '5px 12px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: safePage <= 1 ? 'default' : 'pointer',
                    }}
                  >
                    ← Prev
                  </button>
                  <span style={{ fontSize: '11px', color: 'var(--ui-text, #f8fafc)', padding: '5px 10px', fontWeight: 700 }}>
                    Page {safePage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setCurrentPage((p) => p + 1)}
                    style={{
                      background: 'var(--ui-inset, #091426)',
                      border: '1px solid var(--ui-border, #1e293b)',
                      color: safePage >= totalPages ? '#475569' : 'var(--ui-secondary, #94a3b8)',
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

      {/* ══ TAB 3: HIGH IMPACT INCIDENTS ══ */}
      {activeTab === 'high-impact' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Admin-only: add form */}
          {!isPublicView && (
            <HighImpactInput
              remarksRows={remarksData.rows}
              routedIncidents={routedIncidents}
              existingIds={highImpactIncidents.map((h) => h.requestId)}
              accountName={accountName}
              onAdd={(item) => {
                const updated = [...highImpactIncidents, item];
                setHighImpactIncidents(updated);
                onSaveReport?.({ ...data, highImpactIncidents: updated });
              }}
            />
          )}

          {/* High Impact Incidents Table (Enhanced Modern SaaS View) */}
          {highImpactIncidents.length === 0 ? (
            <p style={{ color: 'var(--ui-muted, #64748b)', fontSize: '13px', padding: '32px 0', textAlign: 'center' }}>
              No high impact incidents designated for this period.
            </p>
          ) : (
            <div
              style={{
                background: 'var(--ui-surface, #111c30)',
                border: '1px solid var(--ui-panel-border, var(--ui-border, #1e293b))',
                borderRadius: '16px',
                overflow: 'hidden',
                boxShadow: '0 4px 20px var(--ui-shadow, rgba(0,0,0,0.2))',
              }}
            >
              {/* Table Top Header Bar */}
              <div
                style={{
                  padding: '14px 20px',
                  background: 'linear-gradient(180deg, rgba(239, 68, 68, 0.08) 0%, transparent 100%)',
                  borderBottom: '1px solid var(--ui-border, #1e293b)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '30px',
                    height: '30px',
                    borderRadius: '8px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#ef4444',
                  }}
                >
                  <Flame size={16} aria-hidden="true" />
                </div>
                <div>
                  <span style={{ fontWeight: 800, fontSize: '14px', color: 'var(--ui-text, #f8fafc)' }}>
                    High Impact Incidents
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--ui-muted, #64748b)', marginLeft: '8px' }}>
                    Priority Aging Incidents
                  </span>
                </div>
                <span
                  style={{
                    marginLeft: 'auto',
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '20px',
                    padding: '3px 12px',
                    fontSize: '11px',
                    fontWeight: 800,
                  }}
                >
                  {highImpactIncidents.length} {highImpactIncidents.length === 1 ? 'Record' : 'Records'}
                </span>
              </div>

              {/* Table with Modern Clean Styling (No Excel sheet gridlines) */}
              <div style={{ overflowX: 'auto' }}>
                <table
                  role="table"
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '12px',
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background: 'var(--ui-inset, #091426)',
                        borderBottom: '1px solid var(--ui-border, #1e293b)',
                      }}
                    >
                      <th
                        scope="col"
                        style={{
                          width: '11%',
                          padding: '12px 14px',
                          textAlign: 'center',
                          color: 'var(--ui-muted, #64748b)',
                          fontSize: '10px',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          border: 'none',
                        }}
                      >
                        IR Number
                      </th>
                      <th
                        scope="col"
                        style={{
                          width: '13%',
                          padding: '12px 14px',
                          textAlign: 'left',
                          color: 'var(--ui-muted, #64748b)',
                          fontSize: '10px',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          border: 'none',
                        }}
                      >
                        Category
                      </th>
                      <th
                        scope="col"
                        style={{
                          width: '13%',
                          padding: '12px 14px',
                          textAlign: 'left',
                          color: 'var(--ui-muted, #64748b)',
                          fontSize: '10px',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          border: 'none',
                        }}
                      >
                        Sub Category
                      </th>
                      <th
                        scope="col"
                        style={{
                          width: '31%',
                          padding: '12px 16px',
                          textAlign: 'left',
                          color: 'var(--ui-muted, #64748b)',
                          fontSize: '10px',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          border: 'none',
                        }}
                      >
                        Description
                      </th>
                      <th
                        scope="col"
                        style={{
                          width: '9%',
                          padding: '12px 14px',
                          textAlign: 'center',
                          color: 'var(--ui-muted, #64748b)',
                          fontSize: '10px',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          border: 'none',
                        }}
                      >
                        Aging Days
                      </th>
                      <th
                        scope="col"
                        style={{
                          width: '15%',
                          padding: '12px 16px',
                          textAlign: 'left',
                          color: 'var(--ui-muted, #64748b)',
                          fontSize: '10px',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          border: 'none',
                        }}
                      >
                        Update as of {updateAsOfDate}
                      </th>
                      <th
                        scope="col"
                        style={{
                          width: '8%',
                          padding: '12px 14px',
                          textAlign: 'center',
                          color: 'var(--ui-muted, #64748b)',
                          fontSize: '10px',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          border: 'none',
                        }}
                      >
                        Responsible
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {highImpactIncidents.map((item) => {
                      const isEditing = editingHighImpactId === item.requestId;
                      return (
                        <tr
                          key={item.requestId}
                          style={{
                            borderBottom: '1px solid var(--ui-border, #1e293b)',
                            transition: 'background 0.12s ease',
                          }}
                          onMouseEnter={(e) =>
                            ((e.currentTarget as HTMLTableRowElement).style.background = 'rgba(37,99,235,0.05)')
                          }
                          onMouseLeave={(e) =>
                            ((e.currentTarget as HTMLTableRowElement).style.background = 'transparent')
                          }
                        >
                          {/* 1. IR Number (Modern pill link) */}
                          <td style={{ padding: '14px 12px', textAlign: 'center', verticalAlign: 'middle', border: 'none' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                background: 'rgba(37, 99, 235, 0.08)',
                                border: '1px solid rgba(37, 99, 235, 0.22)',
                              }}
                            >
                              <RequestIdLink requestId={item.requestId} plain={true} />
                            </span>
                          </td>

                          {/* 2. Category */}
                          <td style={{ padding: '14px 14px', textAlign: 'left', verticalAlign: 'middle', border: 'none' }}>
                            <span style={{ fontWeight: 600, color: 'var(--ui-text, #f8fafc)', fontSize: '13px' }}>
                              {item.category || '—'}
                            </span>
                          </td>

                          {/* 3. Sub Category */}
                          <td style={{ padding: '14px 14px', textAlign: 'left', verticalAlign: 'middle', border: 'none' }}>
                            <span style={{ color: 'var(--ui-secondary, #94a3b8)', fontSize: '12px' }}>
                              {item.subCategory || '—'}
                            </span>
                          </td>

                          {/* 4. Description (Structured Card box) */}
                          <td style={{ padding: '14px 16px', textAlign: 'left', verticalAlign: 'middle', border: 'none' }}>
                            <div
                              style={{
                                background: 'var(--ui-inset, #091426)',
                                border: '1px solid var(--ui-control-border, #1e293b)',
                                borderRadius: '8px',
                                padding: '10px 14px',
                                fontSize: '12px',
                                lineHeight: 1.6,
                                color: 'var(--ui-text, #f1f5f9)',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                              }}
                            >
                              {item.description || '—'}
                            </div>
                          </td>

                          {/* 5. Aging Days (Modern pill badge) */}
                          <td style={{ padding: '14px 12px', textAlign: 'center', verticalAlign: 'middle', border: 'none' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                color: '#ef4444',
                                padding: '3px 10px',
                                borderRadius: '20px',
                                fontWeight: 800,
                                fontSize: '12px',
                              }}
                            >
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444' }} />
                              {item.agingDays}d
                            </span>
                          </td>

                          {/* 6. Update as of {date} (Accent card with inline edit) */}
                          <td style={{ padding: '14px 16px', textAlign: 'left', verticalAlign: 'middle', border: 'none' }}>
                            {isEditing ? (
                              <div
                                style={{
                                  background: 'var(--ui-inset, #091426)',
                                  border: '1px solid var(--ui-link, #2563eb)',
                                  borderRadius: '8px',
                                  padding: '8px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '6px',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const now = new Date();
                                      const prefix = `${now.getMonth() + 1}/${now.getDate()} - `;
                                      if (!editingHighImpactNote.startsWith(prefix)) {
                                        setEditingHighImpactNote((prev) => `${prefix}${prev}`);
                                      }
                                    }}
                                    style={{
                                      fontSize: '10px',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      border: '1px solid var(--ui-control-border)',
                                      background: 'transparent',
                                      color: 'var(--ui-link, #38bdf8)',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    + Date
                                  </button>
                                </div>
                                <textarea
                                  value={editingHighImpactNote}
                                  rows={3}
                                  onChange={(e) => setEditingHighImpactNote(e.target.value)}
                                  style={{
                                    width: '100%',
                                    padding: '6px 8px',
                                    fontSize: '12px',
                                    border: '1px solid var(--ui-control-border)',
                                    borderRadius: '4px',
                                    color: 'var(--ui-text, #f8fafc)',
                                    background: 'var(--ui-surface, #0f172a)',
                                    lineHeight: 1.5,
                                    resize: 'vertical',
                                  }}
                                />
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                                  <button
                                    type="button"
                                    onClick={() => setEditingHighImpactId(null)}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '2px',
                                      fontSize: '11px',
                                      padding: '3px 8px',
                                      border: '1px solid var(--ui-border)',
                                      borderRadius: '4px',
                                      background: 'transparent',
                                      color: 'var(--ui-muted, #94a3b8)',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <X size={12} /> Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = highImpactIncidents.map((h) =>
                                        h.requestId === item.requestId
                                          ? { ...h, recentUpdate: editingHighImpactNote.trim() }
                                          : h
                                      );
                                      setHighImpactIncidents(updated);
                                      onSaveReport?.({ ...data, highImpactIncidents: updated });
                                      setEditingHighImpactId(null);
                                      setToastMessage({ text: `Updated recent note for ${item.requestId}`, type: 'success' });
                                    }}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '2px',
                                      fontSize: '11px',
                                      padding: '3px 10px',
                                      border: 'none',
                                      borderRadius: '4px',
                                      background: '#2563eb',
                                      color: '#ffffff',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <Check size={12} /> Save
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div
                                style={{
                                  borderLeft: '3px solid #38bdf8',
                                  background: 'rgba(56, 189, 248, 0.04)',
                                  borderRadius: '0 8px 8px 0',
                                  padding: '8px 12px',
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  justifyContent: 'space-between',
                                  gap: '8px',
                                }}
                              >
                                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55, fontSize: '12px', color: 'var(--ui-text, #f8fafc)', flex: 1 }}>
                                  {item.recentUpdate ? renderSingleColorUpdateText(item.recentUpdate) : <span style={{ color: 'var(--ui-muted, #64748b)' }}>—</span>}
                                </div>
                                {!isPublicView && (
                                  <button
                                    type="button"
                                    title="Edit recent update note"
                                    onClick={() => {
                                      setEditingHighImpactId(item.requestId);
                                      setEditingHighImpactNote(item.recentUpdate || '');
                                    }}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: 'var(--ui-muted, #64748b)',
                                      cursor: 'pointer',
                                      padding: '2px',
                                      borderRadius: '4px',
                                      flexShrink: 0,
                                    }}
                                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#38bdf8')}
                                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--ui-muted, #64748b)')}
                                  >
                                    <Edit2 size={13} aria-hidden="true" />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>

                          {/* 7. Responsible */}
                          <td style={{ padding: '14px 12px', textAlign: 'center', verticalAlign: 'middle', border: 'none' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  background: 'var(--ui-inset, #091426)',
                                  border: '1px solid var(--ui-control-border, #1e293b)',
                                  color: 'var(--ui-link, #93c5fd)',
                                  fontWeight: 700,
                                  fontSize: '11px',
                                }}
                              >
                                {item.responsibleOrDependency || '—'}
                              </span>
                              {!isPublicView && (
                                <button
                                  type="button"
                                  title={`Remove ${item.requestId} from High Impact`}
                                  onClick={() => {
                                    const updated = highImpactIncidents.filter((h) => h.requestId !== item.requestId);
                                    setHighImpactIncidents(updated);
                                    onSaveReport?.({ ...data, highImpactIncidents: updated });
                                  }}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--ui-muted, #64748b)',
                                    cursor: 'pointer',
                                    padding: '3px',
                                    borderRadius: '4px',
                                  }}
                                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#ef4444')}
                                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--ui-muted, #64748b)')}
                                >
                                  <Trash2 size={13} aria-hidden="true" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
