'use client';

import React, { useState, useMemo, useCallback, useRef } from 'react';
import { SlidersHorizontal, Zap } from 'lucide-react';
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
import type { StoredReport } from '@/lib/storage/report-storage';
import { IncidentOverviewCharts } from '@/components/ui/IncidentOverviewCharts';
import { AnalyticsClearButton } from '@/components/ui/AnalyticsClearButton';
import { IRSummaryCards } from './SummaryCards';
import { IRFilterBar } from './FilterBar';
import { BarChart, CHART_COLORS, AGING_COLORS, analyticsChartColor } from './Charts';

export interface ReportSourceItem {
  id: string;
  name: string;
  type: 'all' | 'monthly' | 'aging' | 'weekly';
  period: string;
  ticketCount: number;
  tickets: NormalizedTicket[];
}

interface AnalyticsReport {
  id: string;
  title: string;
  period: string;
  routedIncidents?: Incident[];
}

export interface IRAnalyticsDashboardProps {
  agingReports: AnalyticsReport[];
  monthlyReports: (AnalyticsReport & {
    reportData: { allTickets?: Incident[]; closedTickets?: Incident[] };
  })[];
  legacyReports: StoredReport[];
  isLoading: boolean;
  hasLoadError: boolean;
}

const SOURCE_ICONS = { monthly: '📊', aging: '⏳', weekly: '📅' };
const FILTER_KEYS = Object.keys(DEFAULT_FILTERS) as (keyof IRDashboardFilters)[];
type ClearPanel = 'toolbar' | 'trend' | 'status' | 'aging' | 'technicians' | 'departments';

export function IRAnalyticsDashboard({
  agingReports,
  monthlyReports,
  legacyReports,
  isLoading,
  hasLoadError,
}: IRAnalyticsDashboardProps) {
  const [selectedSourceId, setSelectedSourceId] = useState<string>('all');
  const [filters, setFilters] = useState<IRDashboardFilters>(DEFAULT_FILTERS);
  const [techRankMode, setTechRankMode] = useState<TechRankMode>('resolved');
  const [chartSelection, setChartSelection] = useState<{ chart: 'trend' | 'aging'; label: string } | null>(null);
  const [clearPanel, setClearPanel] = useState<ClearPanel>('toolbar');
  const [showFilters, setShowFilters] = useState(false);

  const { reportSources, tickets } = useMemo(() => {
    const sources: ReportSourceItem[] = [];
    const ticketsById = new Map<string, NormalizedTicket>();

    function addSource(report: AnalyticsReport, type: StoredReport['type'], incidents: Incident[] | undefined, label: string) {
      if (!Array.isArray(incidents) || incidents.length === 0) return;
      const id = report.id || type + '-' + report.period;
      try {
        const normalized = convertIncidentsToNormalizedTickets(incidents, type + '-' + id);
        sources.push({
          id,
          name: `${label} (${report.period})`,
          type,
          period: report.period || '',
          ticketCount: normalized.length,
          tickets: normalized,
        });
        for (const ticket of normalized) ticketsById.set(ticket.ticketId, ticket);
      } catch (error) {
        console.warn('Could not read incident analytics for ' + type + ' report:', error);
      }
    }

    for (const report of monthlyReports) {
      addSource(report, 'monthly', report.routedIncidents || report.reportData.allTickets || report.reportData.closedTickets,
        `${SOURCE_ICONS.monthly} Monthly: ${report.title || 'Monthly Report'}`);
    }
    for (const report of agingReports) {
      addSource(report, 'aging', report.routedIncidents, `${SOURCE_ICONS.aging} Aging: ${report.title || 'Aging Report'}`);
    }
    for (const report of legacyReports) {
      if (report && SOURCE_ICONS[report.type] && !sources.some(source => source.id === report.id)) {
        addSource(report, report.type, report.routedIncidents, `📁 ${SOURCE_ICONS[report.type]} ${report.title}`);
      }
    }

    return { reportSources: sources, tickets: Array.from(ticketsById.values()) };
  }, [agingReports, monthlyReports, legacyReports]);

  const sourceTickets = useMemo(() => {
    if (selectedSourceId === 'all') return tickets;
    const found = reportSources.find((s) => s.id === selectedSourceId);
    return found ? found.tickets : tickets;
  }, [selectedSourceId, reportSources, tickets]);

  const canonicalTickets = useMemo(() => sourceTickets.filter((t) => t.isCanonicalTicket), [sourceTickets]);

  const filteredTickets = useMemo(() => {
    return applyFilters(canonicalTickets, filters);
  }, [canonicalTickets, filters]);

  const summary = useMemo(
    () => computeSummaryStats(canonicalTickets.length, filteredTickets, filters.inactivityThreshold),
    [canonicalTickets.length, filteredTickets, filters.inactivityThreshold]
  );

  const irTrend = useMemo(() => computeMonthlyTrend(filteredTickets, 'createdDate'), [filteredTickets]);
  const statusDist = useMemo(() => computeStatusDistribution(filteredTickets).map(({ label, value }) => ({
    label, count: value,
  })), [filteredTickets]);
  const typeDist = useMemo(() => computeIncidentTypeDistribution(filteredTickets), [filteredTickets]);
  const deptDist = useMemo(() => computeDepartmentDistribution(filteredTickets), [filteredTickets]);
  const agingDist = useMemo(() => computeAgingDistribution(filteredTickets, filters.includeResolved), [filteredTickets, filters.includeResolved]);
  const techRankings = useMemo(() => computeTechnicianRankings(filteredTickets), [filteredTickets]);

  const technicians = useMemo(() => Array.from(new Set(canonicalTickets.map((t) => t.technician))).filter(Boolean).sort(), [canonicalTickets]);
  const incidentTypes = useMemo(() => Array.from(new Set(canonicalTickets.map((t) => t.incidentType))).filter(Boolean).sort(), [canonicalTickets]);
  const departments = useMemo(() => Array.from(new Set(canonicalTickets.map((t) => t.department))).filter(Boolean).sort(), [canonicalTickets]);
  const statuses = useMemo(() => Array.from(new Set(canonicalTickets.map((t) => (t.rawStatus || t.statusCategory).trim()))).filter(Boolean).sort(), [canonicalTickets]);

  const activeFilterCount = FILTER_KEYS.filter((key) => filters[key] !== DEFAULT_FILTERS[key]).length;
  const canClear = activeFilterCount > 0 || chartSelection !== null || selectedSourceId !== 'all' || techRankMode !== 'resolved';
  const panelsWithSelection: Record<ClearPanel, boolean> = {
    toolbar: true,
    trend: chartSelection?.chart === 'trend' && irTrend.some(({ label }) => label === chartSelection.label),
    status: Boolean(filters.status),
    aging: chartSelection?.chart === 'aging',
    technicians: Boolean(filters.technician) || techRankMode !== 'resolved',
    departments: Boolean(filters.department) && deptDist.length > 0,
  };
  const clearLocation = canClear ? (panelsWithSelection[clearPanel] ? clearPanel : 'toolbar') : null;

  const handleCardClick = useCallback((statusFilter: string) => {
    setClearPanel('status');
    setFilters((f) => ({ ...f, status: statusFilter === f.status ? '' : statusFilter }));
  }, []);

  function toggleChartSelection(chart: 'trend' | 'aging', label: string) {
    setClearPanel(chart);
    setChartSelection((current) => current?.chart === chart && current.label === label ? null : { chart, label });
  }

  function clearSelections() {
    setClearPanel('toolbar');
    setChartSelection(null);
    setFilters(DEFAULT_FILTERS);
    setSelectedSourceId('all');
    setTechRankMode('resolved');
  }

  function clearFor(panel: ClearPanel) {
    return clearLocation === panel ? clearSelections : undefined;
  }

  function changeSource(sourceId: string) {
    setClearPanel('toolbar');
    setSelectedSourceId(sourceId);
  }

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

  if (isLoading && tickets.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--ui-secondary, #94a3b8)' }}>
        <div style={{ fontSize: '36px', marginBottom: '14px' }}>⏳</div>
        <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ui-muted, #64748b)' }}>
          Loading incident analytics from reporting modules…
        </p>
      </div>
    );
  }

  if (canonicalTickets.length === 0) {
    if (hasLoadError) return null;

    return (
      <div id="ir-analytics-container">
        <DashboardHeader
          canonicalCount={0}
          summary={null}
          reportSources={reportSources}
          selectedSourceId={selectedSourceId}
          onSourceChange={changeSource}
          onExport={handleExportCSV}
          filteredCount={0}
          onClear={canClear ? clearSelections : undefined}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters((v) => !v)}
          activeFilterCount={activeFilterCount}
        />
        <div className="public-report-state"
          style={{
            background: 'var(--glass-panel, linear-gradient(145deg, var(--ui-surface, #0d1a2e), var(--ui-inset, #091426)))',
            border: '2px dashed var(--ui-panel-border, var(--ui-border))',
            borderRadius: '20px',
            padding: '72px 24px',
            textAlign: 'center',
            marginTop: '24px',
          }}
        >
          <div style={{ fontSize: '56px', marginBottom: '18px' }}>📊</div>
          <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ui-text, #f8fafc)', marginBottom: '10px' }}>
            No Published Reports Available
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--ui-muted, #64748b)', maxWidth: '480px', margin: '0 auto 24px', lineHeight: 1.8 }}>
            This public dashboard automatically aggregates analytics from published Weekly, Monthly, and Aging reports.
            Publish a report in the administrator workspace to populate live incident analytics here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div id="ir-analytics-container">
      <DashboardHeader
        canonicalCount={canonicalTickets.length}
        summary={summary}
        reportSources={reportSources}
        selectedSourceId={selectedSourceId}
        onSourceChange={changeSource}
        onExport={handleExportCSV}
        filteredCount={filteredTickets.length}
        onClear={clearFor('toolbar')}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters((v) => !v)}
        activeFilterCount={activeFilterCount}
      />
      <div id="analytics-advanced-filters" hidden={!showFilters}>
        {showFilters && (
          <IRFilterBar
            filters={filters}
            onChange={(next) => {
              setClearPanel('toolbar');
              setFilters(next);
            }}
            technicians={technicians}
            incidentTypes={incidentTypes}
            departments={departments}
            statuses={statuses}
            activeFilterCount={activeFilterCount}
          />
        )}
      </div>
      <IRSummaryCards stats={summary} filters={filters} onCardClick={handleCardClick} />
      <SectionDivider label="Analytics Overview" />
      <IncidentOverviewCharts trend={irTrend} statuses={statusDist} compact
        selectedMonth={chartSelection?.chart === 'trend' ? chartSelection.label : undefined}
        onMonthSelect={(label) => toggleChartSelection('trend', label)}
        onStatusSelect={(label) => {
          setClearPanel('status');
          setFilters((current) => ({ ...current, status: label }));
        }}
        onClearTrend={clearFor('trend')}
        onClearStatus={clearFor('status')}
      />
      <div className="analytics-chart-grid">
        <BarChart
          data={agingDist}
          title="Aging & Inactivity Distribution"
          colorMap={AGING_COLORS}
          cylindrical
          height={148}
          maxBars={5}
          selectedLabel={chartSelection?.chart === 'aging' ? chartSelection.label : undefined}
          onBarClick={(_, label) => toggleChartSelection('aging', label)}
          onClear={clearFor('aging')}
        />
        <BarChart
          data={typeDist}
          title="Incident Category Distribution"
          height={148}
          maxBars={6}
        />
      </div>
      <SectionDivider label="Performance & Department Distribution" />
      <div className="analytics-ranking-grid">
        <TopTechniciansCard
          rankings={sortedRankings}
          rankMode={techRankMode}
          onRankModeChange={(mode) => {
            setClearPanel('technicians');
            setTechRankMode(mode);
          }}
          onTechClick={(tech) => {
            setClearPanel('technicians');
            setFilters((f) => ({ ...f, technician: tech === f.technician ? '' : tech }));
          }}
          onClear={clearFor('technicians')}
          activeTech={filters.technician}
        />
        {deptDist.length > 0 && (
          <DepartmentRankingCard
            data={deptDist}
            total={canonicalTickets.length}
            onDeptClick={(dept) => {
              setClearPanel('departments');
              setFilters((f) => ({ ...f, department: dept === f.department ? '' : dept }));
            }}
            onClear={clearFor('departments')}
            activeDept={filters.department}
          />
        )}
      </div>
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
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
  onExport,
  filteredCount,
  onClear,
  showFilters,
  onToggleFilters,
  activeFilterCount,
}: {
  canonicalCount: number;
  summary: any;
  reportSources: ReportSourceItem[];
  selectedSourceId: string;
  onSourceChange: (id: string) => void;
  onExport: () => void;
  filteredCount: number;
  onClear?: () => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  activeFilterCount: number;
}) {
  const filtersButton = useRef<HTMLButtonElement>(null);
  const sourceSelect = useRef<HTMLSelectElement>(null);

  return (
    <div className="analytics-report-header">
      <div className="analytics-report-brand">
        <span className="analytics-report-mark"><img src="/images/DASH.png" alt="" /></span>
        <div className="analytics-report-title">
          <h2>IR Analytics Dashboard</h2>
          <span className="analytics-report-count">{canonicalCount.toLocaleString()} Total Incidents</span>
        </div>
      </div>

      <div className="analytics-report-actions">
        {canonicalCount > 0 && (
          <button ref={filtersButton} type="button" className="analytics-filter-toggle" aria-expanded={showFilters}
            aria-controls="analytics-advanced-filters" onClick={onToggleFilters}>
            <SlidersHorizontal size={15} aria-hidden="true" />
            Filters{activeFilterCount > 0 ? ' (' + activeFilterCount + ')' : ''}
          </button>
        )}
        <AnalyticsClearButton onClear={onClear} restoreFocus={() => (filtersButton.current ?? sourceSelect.current)?.focus()} />
        {reportSources.length > 0 && (
          <div className="analytics-source-picker">
            <Zap className="analytics-source-icon" size={14} aria-hidden="true" />
            <select ref={sourceSelect} className="live-report-select" aria-label="Published reports" value={selectedSourceId}
              onChange={(event) => onSourceChange(event.target.value)}>
              <option value="all">All Published Reports</option>
              {reportSources.map((source) => (
                <option key={source.id} value={source.id}>{source.name} ({source.ticketCount})</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  background: 'var(--ui-inset, #101f36)',
  border: '1px solid var(--ui-border, #243650)',
  color: 'var(--ui-secondary, #94a3b8)',
  borderRadius: '8px',
  padding: '6px 10px',
  fontSize: '14px',
  cursor: 'pointer',
};

function SectionDivider({ label }: { label: string }) {
  return <h2 className="analytics-section-title">{label}</h2>;
}

function RankingRow({ rank, label, value, comparison, width, color, selected, onClick }: {
  rank: number;
  label: string;
  value: React.ReactNode;
  comparison?: React.ReactNode;
  width: number;
  color: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="analytics-ranking-row" aria-pressed={selected} onClick={onClick}>
      <span className="analytics-ranking-index">{rank}</span>
      <span className="analytics-ranking-main">
        <span className="analytics-ranking-name">{label}</span>
        <strong>{value}</strong>
        {comparison && <span className="analytics-ranking-note">{comparison}</span>}
      </span>
      <span className="analytics-ranking-track" aria-hidden="true">
        <span style={{ width: width + '%', backgroundColor: color }} />
      </span>
    </button>
  );
}

function TopTechniciansCard({ rankings, rankMode, onRankModeChange, onTechClick, activeTech, onClear }: {
  rankings: ReturnType<typeof computeTechnicianRankings>;
  rankMode: TechRankMode;
  onRankModeChange: (mode: TechRankMode) => void;
  onTechClick: (tech: string) => void;
  activeTech?: string;
  onClear?: () => void;
}) {
  const top = rankings.slice(0, 8);
  const rankedValue = (row: (typeof top)[number]) =>
    rankMode === 'resolved' ? row.resolved
      : rankMode === 'assigned' ? row.assigned
        : rankMode === 'resolutionRate' ? Math.round(row.resolutionRate ?? 0)
          : row.noMovement7d;
  const max = Math.max(...top.map(rankedValue), 1);
  const modeLabels: Record<TechRankMode, string> = {
    resolved: 'Incidents resolved',
    assigned: 'Incidents assigned',
    resolutionRate: 'Resolution rate',
    aging: 'Stagnant (7d+)',
    avgResolution: 'Avg days',
  };
  const modeOptions = [
    { key: 'resolved', label: 'Resolved' },
    { key: 'assigned', label: 'Assigned' },
    { key: 'resolutionRate', label: 'Rate' },
    { key: 'aging', label: 'Stagnant' },
  ] as const;

  return (
    <section className="analytics-ranking-card" aria-label="Technician performance">
      <div className="analytics-ranking-heading">
        <div><h3 tabIndex={-1}>Top Technicians</h3><p>Ranked by {modeLabels[rankMode]}</p></div>
        <div className="analytics-ranking-tools">
          <div className="analytics-rank-modes" role="group" aria-label="Rank technicians by">
            {modeOptions.map(({ key, label }) => (
              <button key={key} type="button" className="analytics-rank-mode" aria-pressed={rankMode === key}
                onClick={() => onRankModeChange(key)}>{label}</button>
            ))}
          </div>
          <AnalyticsClearButton onClear={onClear} />
        </div>
      </div>
      {top.map((row, index) => {
        const value = rankedValue(row);
        return <RankingRow key={row.technician} rank={index + 1} label={row.technician}
          value={rankMode === 'resolutionRate' ? value + '%' : value}
          width={value > 0 ? Math.max(3, (value / max) * 100) : 0}
          selected={activeTech?.toLowerCase() === row.technician.toLowerCase()}
          color={analyticsChartColor(CHART_COLORS[rankMode === 'aging' ? 3 : 0])}
          onClick={() => onTechClick(row.technician)} />;
      })}
    </section>
  );
}

function DepartmentRankingCard({ data, total, onDeptClick, activeDept, onClear }: {
  data: { label: string; value: number; ids?: string[] }[];
  total: number;
  onDeptClick: (dept: string) => void;
  activeDept?: string;
  onClear?: () => void;
}) {
  const top = data.slice(0, 8);
  const max = Math.max(...top.map(item => item.value), 1);
  const grandTotal = total > 0 ? total : data.reduce((sum, item) => sum + item.value, 0) || 1;

  return (
    <section className="analytics-ranking-card" aria-label="Incidents by department">
      <div className="analytics-ranking-heading">
        <div><h3 tabIndex={-1}>Incidents by Department</h3><p>Top 8 organizational units by volume</p></div>
        <div className="analytics-ranking-tools">
          <span className="analytics-ranking-note">{data.length} departments</span>
          <AnalyticsClearButton onClear={onClear} />
        </div>
      </div>
      {top.map((item, index) => (
        <RankingRow key={item.label} rank={index + 1} label={item.label} value={item.value}
          comparison={((item.value / grandTotal) * 100).toFixed(1) + '%'}
          width={Math.max(3, (item.value / max) * 100)}
          color={analyticsChartColor(CHART_COLORS[0])}
          selected={activeDept?.toLowerCase() === item.label.toLowerCase()}
          onClick={() => onDeptClick(item.label)} />
      ))}
    </section>
  );
}
