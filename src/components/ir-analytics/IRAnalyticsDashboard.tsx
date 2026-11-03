'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type {
  NormalizedTicket,
  IRDashboardFilters,
  TechRankMode,
} from '@/types/ir-analytics';
import { DEFAULT_FILTERS } from '@/types/ir-analytics';
import {
  applyFilters,
  computeSummaryStats,
  computeMonthlyTrend,
  computeStatusDistribution,
  computeIncidentTypeDistribution,
  computeDepartmentDistribution,
  computeAgingDistribution,
  computeTechnicianRankings,
  exportToCSV,
  ticketsToExportRows,
  convertIncidentsToNormalizedTickets,
} from '@/lib/ir-analytics/engine';
import type { Incident } from '@/types/incident';
import { getStoredReports } from '@/lib/storage/report-storage';
import { fetchServerAgingReports, fetchServerMonthlyReports } from '@/lib/api/client';
import { IRSummaryCards } from './SummaryCards';
import { IRFilterBar } from './FilterBar';
import { BarChart, DonutChart, LineChart, STATUS_COLORS, AGING_COLORS } from './Charts';

export interface ReportSourceItem {
  id: string;
  name: string;
  type: 'all' | 'monthly' | 'aging' | 'weekly';
  period: string;
  ticketCount: number;
  tickets: NormalizedTicket[];
}

export interface IRAnalyticsDashboardProps {
  agingReports?: Array<{
    id: string;
    title: string;
    period: string;
    reportData?: any;
    routedIncidents?: Incident[];
  }>;
  monthlyReports?: Array<{
    id: string;
    title: string;
    period: string;
    reportData?: any;
    routedIncidents?: Incident[];
  }>;
}

export function IRAnalyticsDashboard({
  agingReports = [],
  monthlyReports = [],
}: IRAnalyticsDashboardProps) {
  const [tickets, setTickets] = useState<NormalizedTicket[]>([]);
  const [reportSources, setReportSources] = useState<ReportSourceItem[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('all');
  const [filters, setFilters] = useState<IRDashboardFilters>(DEFAULT_FILTERS);
  const [techRankMode, setTechRankMode] = useState<TechRankMode>('resolved');
  const [drilldownLabel, setDrilldownLabel] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // ── Sync data from reporting modules (Weekly, Monthly, Aging & Stored Archive) ──
  const syncModuleData = useCallback(async () => {
    const sources: ReportSourceItem[] = [];
    const allNormalizedTickets: NormalizedTicket[] = [];

    // 1. Monthly Reports
    let mReports = monthlyReports;
    if (!mReports || mReports.length === 0) {
      try {
        const serverM = await fetchServerMonthlyReports();
        if (Array.isArray(serverM)) mReports = serverM as any;
      } catch { }
    }
    if (Array.isArray(mReports)) {
      for (const m of mReports) {
        const incidents: Incident[] =
          (m.routedIncidents as Incident[]) ||
          (m.reportData as any)?.allTickets ||
          (m.reportData as any)?.closedTickets ||
          [];
        if (incidents.length > 0) {
          const norm = convertIncidentsToNormalizedTickets(incidents, `monthly-${m.id || m.period}`);
          sources.push({
            id: String(m.id || `monthly-${m.period}`),
            name: `📊 Monthly: ${m.title || 'Monthly Report'} (${m.period})`,
            type: 'monthly',
            period: m.period || '',
            ticketCount: norm.length,
            tickets: norm,
          });
          allNormalizedTickets.push(...norm);
        }
      }
    }

    // 2. Aging Reports
    let aReports = agingReports;
    if (!aReports || aReports.length === 0) {
      try {
        const serverA = await fetchServerAgingReports();
        if (Array.isArray(serverA)) aReports = serverA as any;
      } catch { }
    }
    if (Array.isArray(aReports)) {
      for (const a of aReports) {
        const incidents: Incident[] = (a.routedIncidents as Incident[]) || [];
        if (incidents.length > 0) {
          const norm = convertIncidentsToNormalizedTickets(incidents, `aging-${a.id || a.period}`);
          sources.push({
            id: String(a.id || `aging-${a.period}`),
            name: `⏳ Aging: ${a.title || 'Aging Report'} (${a.period})`,
            type: 'aging',
            period: a.period || '',
            ticketCount: norm.length,
            tickets: norm,
          });
          allNormalizedTickets.push(...norm);
        }
      }
    }

    // 3. Stored Reports Archive (Weekly / Monthly / Aging)
    try {
      const localArchive = getStoredReports();
      for (const item of localArchive) {
        const alreadyInSources = sources.some((s) => s.id === item.id);
        if (!alreadyInSources && item.routedIncidents && item.routedIncidents.length > 0) {
          const norm = convertIncidentsToNormalizedTickets(item.routedIncidents, `local-${item.type}-${item.id}`);
          sources.push({
            id: item.id,
            name: `📁 ${item.type === 'weekly' ? '📅 Weekly' : item.type === 'monthly' ? '📊 Monthly' : '⏳ Aging'}: ${item.title} (${item.period})`,
            type: item.type,
            period: item.period || '',
            ticketCount: norm.length,
            tickets: norm,
          });
          allNormalizedTickets.push(...norm);
        }
      }
    } catch { }

    // Deduplicate merged records by ticketId
    const dedupedMap = new Map<string, NormalizedTicket>();
    for (const t of allNormalizedTickets) {
      dedupedMap.set(t.ticketId, t);
    }
    const mergedTickets = Array.from(dedupedMap.values());

    setReportSources(sources);
    if (mergedTickets.length > 0) {
      setTickets(mergedTickets);
    }
    setIsLoaded(true);
  }, [agingReports, monthlyReports]);

  useEffect(() => {
    syncModuleData();
  }, [syncModuleData]);

  // Active tickets depending on selected source (or 'all' for merged)
  const sourceTickets = useMemo(() => {
    if (selectedSourceId === 'all') return tickets;
    const found = reportSources.find((s) => s.id === selectedSourceId);
    return found ? found.tickets : tickets;
  }, [selectedSourceId, reportSources, tickets]);

  const canonicalTickets = useMemo(() => sourceTickets.filter((t) => t.isCanonicalTicket), [sourceTickets]);

  // Filtered dataset
  const filteredTickets = useMemo(() => {
    return applyFilters(canonicalTickets, filters);
  }, [canonicalTickets, filters]);

  // Aggregated analytics
  const summary = useMemo(
    () => computeSummaryStats(canonicalTickets.length, filteredTickets, filters.inactivityThreshold),
    [canonicalTickets.length, filteredTickets, filters.inactivityThreshold]
  );

  const irTrend = useMemo(() => computeMonthlyTrend(filteredTickets, 'createdDate'), [filteredTickets]);
  const statusDist = useMemo(() => computeStatusDistribution(filteredTickets), [filteredTickets]);
  const typeDist = useMemo(() => computeIncidentTypeDistribution(filteredTickets), [filteredTickets]);
  const deptDist = useMemo(() => computeDepartmentDistribution(filteredTickets), [filteredTickets]);
  const agingDist = useMemo(() => computeAgingDistribution(filteredTickets, filters.includeResolved), [filteredTickets, filters.includeResolved]);
  const techRankings = useMemo(() => computeTechnicianRankings(filteredTickets), [filteredTickets]);

  // Distinct filter options
  const technicians = useMemo(() => Array.from(new Set(canonicalTickets.map((t) => t.technician))).filter(Boolean).sort(), [canonicalTickets]);
  const incidentTypes = useMemo(() => Array.from(new Set(canonicalTickets.map((t) => t.incidentType))).filter(Boolean).sort(), [canonicalTickets]);
  const departments = useMemo(() => Array.from(new Set(canonicalTickets.map((t) => t.department))).filter(Boolean).sort(), [canonicalTickets]);
  const statuses = useMemo(() => Array.from(new Set(canonicalTickets.map((t) => (t.rawStatus || t.statusCategory).trim()))).filter(Boolean).sort(), [canonicalTickets]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.technician) count++;
    if (filters.status) count++;
    if (filters.incidentType) count++;
    if (filters.department) count++;
    if (filters.agingCategory) count++;
    if (filters.dateFrom || filters.dateTo) count++;
    return count;
  }, [filters]);

  const handleCardClick = useCallback((statusFilter: string) => {
    setFilters((f) => ({ ...f, status: statusFilter === f.status ? '' : statusFilter }));
  }, []);

  const handleChartClick = useCallback((_ids: string[], label: string) => {
    setDrilldownLabel(label);
    // Filter by the clicked label if matching a status or category
    if (statuses.includes(label)) {
      setFilters((f) => ({ ...f, status: label }));
    } else if (incidentTypes.includes(label)) {
      setFilters((f) => ({ ...f, incidentType: label }));
    }
  }, [statuses, incidentTypes]);

  const clearDrilldown = () => {
    setDrilldownLabel('');
    setFilters(DEFAULT_FILTERS);
  };

  const handleExportCSV = () => {
    const rows = ticketsToExportRows(filteredTickets, new Date().toLocaleDateString());
    exportToCSV(rows, `IR_Analytics_Summary_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleExportTechnicians = () => {
    const rows = techRankings.map((r) => ({
      Rank: r.rank,
      Technician: r.technician,
      'Incidents Assigned': r.assigned,
      'Incidents Resolved': r.resolved,
      'Open Incidents': r.open,
      'Pending Incidents': r.pending,
      'In Progress': r.inProgress,
      'Stagnant 7d+': r.noMovement7d,
      'Resolution Rate (%)': r.resolutionRate !== null ? r.resolutionRate.toFixed(1) : 'N/A',
      'Avg Resolution Days': r.avgResolutionDays !== null ? r.avgResolutionDays.toFixed(1) : 'N/A',
    }));
    exportToCSV(rows, `Technician_Performance_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const sortedRankings = useMemo(() => {
    const copy = [...techRankings];
    switch (techRankMode) {
      case 'resolved': copy.sort((a, b) => b.resolved - a.resolved); break;
      case 'assigned': copy.sort((a, b) => b.assigned - a.assigned); break;
      case 'resolutionRate': copy.sort((a, b) => (b.resolutionRate ?? -1) - (a.resolutionRate ?? -1)); break;
      case 'aging': copy.sort((a, b) => b.noMovement7d - a.noMovement7d); break;
      case 'avgResolution': copy.sort((a, b) => (b.avgResolutionDays ?? -1) - (a.avgResolutionDays ?? -1)); break;
    }
    return copy.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [techRankings, techRankMode]);

  if (!isLoaded) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px', color: '#94a3b8' }}>
        <div style={{ fontSize: '36px', marginBottom: '14px' }}>⏳</div>
        <p style={{ fontSize: '15px', fontWeight: 600, color: '#64748b' }}>
          Loading incident analytics from reporting modules…
        </p>
      </div>
    );
  }

  if (canonicalTickets.length === 0) {
    return (
      <div id="ir-analytics-container">
        <DashboardHeader
          canonicalCount={0}
          summary={null}
          reportSources={reportSources}
          selectedSourceId={selectedSourceId}
          onSourceChange={setSelectedSourceId}
          onSync={syncModuleData}
          onExport={handleExportCSV}
          filteredCount={0}
          drilldownLabel={drilldownLabel}
          onClearDrilldown={clearDrilldown}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters((v) => !v)}
          activeFilterCount={activeFilterCount}
        />
        <div
          style={{
            background: 'linear-gradient(145deg, #0d1a2e, #091426)',
            border: '2px dashed #1e3a5f',
            borderRadius: '20px',
            padding: '72px 24px',
            textAlign: 'center',
            marginTop: '24px',
          }}
        >
          <div style={{ fontSize: '56px', marginBottom: '18px' }}>📊</div>
          <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#f8fafc', marginBottom: '10px' }}>
            No Published Reports Available
          </h3>
          <p style={{ fontSize: '13px', color: '#64748b', maxWidth: '480px', margin: '0 auto 24px', lineHeight: 1.8 }}>
            This public dashboard automatically aggregates analytics from published Weekly, Monthly, and Aging reports.
            Publish a report in the administrator workspace to populate live incident analytics here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div id="ir-analytics-container" style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>

      {/* ── View-Only Dashboard Header ── */}
      <DashboardHeader
        canonicalCount={canonicalTickets.length}
        summary={summary}
        reportSources={reportSources}
        selectedSourceId={selectedSourceId}
        onSourceChange={setSelectedSourceId}
        onSync={syncModuleData}
        onExport={handleExportCSV}
        filteredCount={filteredTickets.length}
        drilldownLabel={drilldownLabel}
        onClearDrilldown={clearDrilldown}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters((v) => !v)}
        activeFilterCount={activeFilterCount}
      />

      {/* ── Collapsible Advanced Filter Bar ── */}
      {showFilters && (
        <div style={{ marginBottom: '20px', animation: 'slideDown 0.2s ease' }}>
          <IRFilterBar
            filters={filters}
            onChange={setFilters}
            technicians={technicians}
            incidentTypes={incidentTypes}
            departments={departments}
            statuses={statuses}
            activeFilterCount={activeFilterCount}
          />
        </div>
      )}

      {/* ── Active Filter Chips ── */}
      {!showFilters && activeFilterCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Active Filters:</span>
          {filters.status && (
            <FilterChip label={`Status: ${filters.status}`} onRemove={() => setFilters((f) => ({ ...f, status: '' }))} />
          )}
          {filters.technician && (
            <FilterChip label={`Tech: ${filters.technician}`} onRemove={() => setFilters((f) => ({ ...f, technician: '' }))} />
          )}
          {filters.incidentType && (
            <FilterChip label={`Type: ${filters.incidentType}`} onRemove={() => setFilters((f) => ({ ...f, incidentType: '' }))} />
          )}
          {filters.department && (
            <FilterChip label={`Dept: ${filters.department}`} onRemove={() => setFilters((f) => ({ ...f, department: '' }))} />
          )}
          {filters.search && (
            <FilterChip label={`Search: "${filters.search}"`} onRemove={() => setFilters((f) => ({ ...f, search: '' }))} />
          )}
          <button
            type="button"
            onClick={() => setFilters(DEFAULT_FILTERS)}
            style={{
              fontSize: '11px',
              color: '#94a3b8',
              background: 'transparent',
              border: '1px solid #243650',
              borderRadius: '6px',
              padding: '3px 8px',
              cursor: 'pointer',
            }}
          >
            Clear All
          </button>
        </div>
      )}

      {/* ══ SECTION 1: Executive KPI Summary Cards & Dynamic Status Ribbon ══ */}
      <IRSummaryCards stats={summary} filters={filters} onCardClick={handleCardClick} />

      {/* ══ SECTION 2: Analytics Overview (1x4 Grid) ══ */}
      <SectionDivider label="Analytics Overview" />
      <div
        className="analytics-1x4-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: '12px',
          marginBottom: '14px',
          width: '100%',
        }}
      >
        <LineChart
          data={irTrend}
          title="Incident Creation Trend (Monthly)"
          color="#3b82f6"
          height={210}
          onPointClick={handleChartClick}
        />
        <DonutChart
          data={statusDist}
          title="Status Distribution"
          colorMap={STATUS_COLORS}
          onSliceClick={handleChartClick}
        />
        <BarChart
          data={agingDist}
          title="Aging & Inactivity Bracket Distribution"
          colorMap={AGING_COLORS}
          height={210}
          maxBars={5}
          onBarClick={handleChartClick}
        />
        <BarChart
          data={typeDist}
          title="Incident Category Distribution"
          height={210}
          maxBars={6}
        />
      </div>

      {/* ══ SECTION 3: Performance & Department Analytics ══ */}
      <SectionDivider label="Performance & Department Distribution" />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
          gap: '14px',
          marginBottom: '10px',
        }}
      >
        {/* Top Technicians Card with Integrated Mode Controls */}
        <TopTechniciansCard
          rankings={sortedRankings}
          rankMode={techRankMode}
          onRankModeChange={setTechRankMode}
          onTechClick={(tech) =>
            setFilters((f) => ({ ...f, technician: tech === f.technician ? '' : tech }))
          }
          activeTech={filters.technician}
        />

        {/* Resized & Elegant Incidents by Department Graph Card */}
        {deptDist.length > 0 && (
          <DepartmentRankingCard
            data={deptDist}
            total={canonicalTickets.length}
            onDeptClick={(dept) =>
              setFilters((f) => ({ ...f, department: dept === f.department ? '' : dept }))
            }
            activeDept={filters.department}
          />
        )}
      </div>
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 1100px) {
          .analytics-1x4-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }
        @media (max-width: 640px) {
          .analytics-1x4-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

function DashboardHeader({
  canonicalCount,
  summary,
  reportSources,
  selectedSourceId,
  onSourceChange,
  onSync,
  onExport,
  filteredCount,
  drilldownLabel,
  onClearDrilldown,
  showFilters,
  onToggleFilters,
  activeFilterCount,
}: {
  canonicalCount: number;
  summary: any;
  reportSources: ReportSourceItem[];
  selectedSourceId: string;
  onSourceChange: (id: string) => void;
  onSync: () => void;
  onExport: () => void;
  filteredCount: number;
  drilldownLabel: string;
  onClearDrilldown: () => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  activeFilterCount: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '12px',
        background: 'linear-gradient(145deg, #111c30 0%, #0d1a2e 100%)',
        border: '1px solid #1e293b',
        borderRadius: '16px',
        padding: '16px 22px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
      }}
    >
      {/* Left: Brand Title & Metadata */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <img
            src="/images/DASH.png"
            alt="Dashboard"
            style={{ width: '24px', height: '24px', objectFit: 'contain' }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = '/DASH.png';
            }}
          />
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#f8fafc', margin: 0, letterSpacing: '-0.01em' }}>
            IR Analytics Dashboard
          </h2>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '999px',
              background: 'rgba(37,99,235,0.15)',
              border: '1px solid rgba(37,99,235,0.3)',
              color: '#93c5fd',
            }}
          >
            {canonicalCount} Total Incidents
          </span>
        </div>
        <p style={{ fontSize: '12px', color: '#94a3b8', margin: '3px 0 0' }}>
          Real-time incident intelligence, technician performance, and operational breakdown
        </p>
      </div>

      {/* Right: View-Only Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {/* Module source selector */}
        {reportSources.length > 0 && (
          <select
            value={selectedSourceId}
            onChange={(e) => onSourceChange(e.target.value)}
            style={{
              background: '#091426',
              border: '1px solid #1e3a5f',
              borderRadius: '8px',
              color: '#e2e8f0',
              padding: '7px 12px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
              maxWidth: '260px',
            }}
          >
            <option value="all">⚡ All Published Reports</option>
            {reportSources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.ticketCount})
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  background: '#101f36',
  border: '1px solid #243650',
  color: '#94a3b8',
  borderRadius: '8px',
  padding: '6px 10px',
  fontSize: '14px',
  cursor: 'pointer',
};

function SectionDivider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '12px 0 16px' }}>
      <div style={{ height: '1px', background: 'linear-gradient(90deg, #1e3a5f, transparent)', flex: 1 }} />
      <span
        style={{
          fontSize: '11px',
          fontWeight: 800,
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <div style={{ height: '1px', background: 'linear-gradient(270deg, #1e3a5f, transparent)', flex: 1 }} />
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        background: 'rgba(37,99,235,0.14)',
        border: '1px solid rgba(37,99,235,0.3)',
        color: '#93c5fd',
        fontSize: '11px',
        fontWeight: 600,
        borderRadius: '999px',
        padding: '3px 10px 3px 8px',
      }}
    >
      <span>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        style={{
          background: 'none',
          border: 'none',
          color: '#94a3b8',
          cursor: 'pointer',
          padding: 0,
          fontSize: '12px',
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}

function TopTechniciansCard({
  rankings,
  rankMode,
  onRankModeChange,
  onTechClick,
  activeTech,
}: {
  rankings: ReturnType<typeof computeTechnicianRankings>;
  rankMode: TechRankMode;
  onRankModeChange: (mode: TechRankMode) => void;
  onTechClick: (tech: string) => void;
  activeTech?: string;
}) {
  const top8 = rankings.slice(0, 8);
  const maxVal = Math.max(
    ...top8.map((r) =>
      rankMode === 'resolved' ? r.resolved
        : rankMode === 'assigned' ? r.assigned
          : rankMode === 'resolutionRate' ? Math.round(r.resolutionRate ?? 0)
            : r.noMovement7d
    ),
    1
  );

  const modeLabels: Record<TechRankMode, string> = {
    resolved: 'Incidents Resolved',
    assigned: 'Incidents Assigned',
    resolutionRate: 'Resolution Rate (%)',
    aging: 'Stagnant (7d+)',
    avgResolution: 'Avg Days',
  };

  const techGradients = [
    'linear-gradient(90deg, #2563eb, #60a5fa)',
    'linear-gradient(90deg, #7c3aed, #a78bfa)',
    'linear-gradient(90deg, #059669, #34d399)',
    'linear-gradient(90deg, #d97706, #fbbf24)',
    'linear-gradient(90deg, #dc2626, #f87171)',
    'linear-gradient(90deg, #0891b2, #38bdf8)',
    'linear-gradient(90deg, #c026d3, #e879f9)',
    'linear-gradient(90deg, #475569, #94a3b8)',
  ];

  return (
    <div
      style={{
        background: '#111c30',
        border: '1px solid #1e293b',
        borderRadius: '16px',
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
      }}
    >
      {/* Header: Title + Inline Mode Pills */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '15px' }}>👥</span>
            <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Top Technicians
            </h3>
          </div>
          <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>
            Ranked by {modeLabels[rankMode]}
          </p>
        </div>

        {/* Integrated Filter Pills */}
        <div style={{ display: 'flex', gap: '4px', background: '#091426', padding: '3px', borderRadius: '8px', border: '1px solid #1e3a5f' }}>
          {([
            { key: 'resolved' as TechRankMode, label: 'Resolved' },
            { key: 'assigned' as TechRankMode, label: 'Assigned' },
            { key: 'resolutionRate' as TechRankMode, label: 'Rate' },
            { key: 'aging' as TechRankMode, label: 'Stagnant' },
          ]).map(({ key, label }) => {
            const isSelected = rankMode === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onRankModeChange(key)}
                style={{
                  background: isSelected ? '#2563eb' : 'transparent',
                  color: isSelected ? '#ffffff' : '#94a3b8',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.12s ease',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, justifyContent: 'space-around' }}>
        {top8.map((r, i) => {
          const val =
            rankMode === 'resolved' ? r.resolved
              : rankMode === 'assigned' ? r.assigned
                : rankMode === 'resolutionRate' ? Math.round(r.resolutionRate ?? 0)
                  : r.noMovement7d;

          const pctWidth = maxVal > 0 && val > 0 ? Math.max(3, (val / maxVal) * 100) : 0;
          const isSelected = activeTech?.toLowerCase() === r.technician.toLowerCase();
          const grad = techGradients[i % techGradients.length];
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;

          return (
            <div
              key={r.technician}
              onClick={() => onTechClick(r.technician)}
              style={{
                cursor: 'pointer',
                padding: '7px 12px',
                borderRadius: '8px',
                background: isSelected ? 'rgba(37,99,235,0.18)' : 'transparent',
                border: isSelected ? '1px solid #3b82f6' : '1px solid transparent',
                transition: 'all 0.12s ease',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)';
              }}
              onMouseLeave={(e) => {
                if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, paddingRight: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', width: '20px', flexShrink: 0, textAlign: 'center' }}>
                    {medal}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: isSelected ? '#60a5fa' : '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.technician}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: val > 0 ? '#f8fafc' : '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                    {val}
                    {rankMode === 'resolutionRate' ? '%' : ''}
                  </span>
                  <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>
                    {rankMode === 'resolved' ? 'res.' : rankMode === 'assigned' ? 'assign.' : rankMode === 'aging' ? 'stagn.' : ''}
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ width: '100%', height: '6px', background: '#091426', borderRadius: '999px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${pctWidth}%`,
                    height: '100%',
                    background: val > 0 ? grad : 'transparent',
                    borderRadius: '999px',
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DepartmentRankingCard({
  data,
  total,
  onDeptClick,
  activeDept,
}: {
  data: { label: string; value: number; ids?: string[] }[];
  total: number;
  onDeptClick: (dept: string) => void;
  activeDept?: string;
}) {
  const top8 = data.slice(0, 8);
  const maxVal = Math.max(...top8.map((d) => d.value), 1);
  const grandTotal = total > 0 ? total : data.reduce((s, d) => s + d.value, 0) || 1;

  const deptGradients = [
    'linear-gradient(90deg, #2563eb, #60a5fa)',
    'linear-gradient(90deg, #7c3aed, #a78bfa)',
    'linear-gradient(90deg, #059669, #34d399)',
    'linear-gradient(90deg, #d97706, #fbbf24)',
    'linear-gradient(90deg, #dc2626, #f87171)',
    'linear-gradient(90deg, #0891b2, #38bdf8)',
    'linear-gradient(90deg, #c026d3, #e879f9)',
    'linear-gradient(90deg, #475569, #94a3b8)',
  ];

  return (
    <div
      style={{
        background: '#111c30',
        border: '1px solid #1e293b',
        borderRadius: '16px',
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
      }}
    >
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '15px' }}>🏢</span>
            <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Incidents by Department
            </h3>
          </div>
          <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>
            Top 8 organizational units by volume
          </p>
        </div>

        {/* Badge */}
        <div
          style={{
            background: 'rgba(56,189,248,0.12)',
            border: '1px solid rgba(56,189,248,0.3)',
            color: '#38bdf8',
            fontSize: '11px',
            fontWeight: 800,
            padding: '3px 10px',
            borderRadius: '999px',
          }}
        >
          {data.length} Departments
        </div>
      </div>

      {/* Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, justifyContent: 'space-around' }}>
        {top8.map((d, i) => {
          const pct = ((d.value / grandTotal) * 100).toFixed(1);
          const pctWidth = Math.max(3, (d.value / maxVal) * 100);
          const isSelected = activeDept?.toLowerCase() === d.label.toLowerCase();
          const grad = deptGradients[i % deptGradients.length];

          return (
            <div
              key={d.label}
              onClick={() => onDeptClick(d.label)}
              style={{
                cursor: 'pointer',
                padding: '7px 12px',
                borderRadius: '8px',
                background: isSelected ? 'rgba(59,130,246,0.18)' : 'transparent',
                border: isSelected ? '1px solid #3b82f6' : '1px solid transparent',
                transition: 'all 0.12s ease',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)';
              }}
              onMouseLeave={(e) => {
                if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
              }}
            >
              {/* Row text */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, paddingRight: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', width: '20px', flexShrink: 0, textAlign: 'center' }}>
                    {i + 1}
                  </span>
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: isSelected ? '#60a5fa' : '#f8fafc',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={d.label}
                  >
                    {d.label}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>
                    {pct}%
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc', fontVariantNumeric: 'tabular-nums' }}>
                    {d.value}
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ width: '100%', height: '6px', background: '#091426', borderRadius: '999px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${pctWidth}%`,
                    height: '100%',
                    background: grad,
                    borderRadius: '999px',
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

