'use client';

import React, { useId, useMemo, useRef, useState, useCallback } from 'react';
import { BarChart3, Check, ClipboardList, Clock3, FileCheck2, Search, X, ArrowDown, ArrowUp } from 'lucide-react';
import type { Incident } from '@/types/incident';
import type { MonthlyReportData } from '@/types/monthly';
import {
  ALL_TICKETS_COLUMNS, CLOSED_TICKETS_COLUMNS, FIRST_RESPONSE_COLUMNS,
  getIncidentMonthlyValue as getRawValue, ROOT_CAUSE_FACTORS, ROOT_CAUSE_TYPES, findRootCauseType,
} from '@/types/monthly';
import { saveReport } from '@/lib/storage/report-storage';
import { filterAcceptableFirstResponse } from '@/lib/monthly/calculator';
import { generateMonthlyRemarks } from '@/lib/monthly/remarks';
import { ExecutiveRemarksCard } from '@/components/monthly/ExecutiveRemarksCard';
import { AcceptableFRInput } from '@/components/monthly/AcceptableFRInput';
import { DeleteIR } from '@/components/monthly/DeleteIR';
import { RequestIdLink } from '@/components/report/RequestIdLink';
import { SLAMetricHeading } from '@/components/report/SLATableLabels';
import { ReportImageExport } from '@/components/report/ReportImageExport';

interface MonthlyReportTableProps {
  data: MonthlyReportData;
  onCellClick?: (title: string, incidentIds: string[]) => void;
  routedIncidents?: Incident[];
  isAdmin?: boolean;
  onUpdateIncident?: (requestId: string, field: 'Revised Root Cause Type' | 'Revised Identified Root Cause', value: string) => void;
  onArchiveReport?: () => void | Promise<void>;
  onAddAcceptableFR?: (requestId: string) => void;
  onDeleteIncident?: (requestId: string) => void;
  onSaveReport?: () => void | Promise<void>;
  isArchived?: boolean;
  isPublicView?: boolean;
}

type TabId = 'sla-dashboard' | 'all-tickets' | 'closed-tickets' | 'first-response' | 'powerbi';
type Drilldown = MonthlyReportTableProps['onCellClick'];

const technicianColumns = ['Total # of IRs', 'Failed', 'Passed', 'SLA Pass Rate'];

function TicketCount({ count, ids, label, onOpen }: { count: number; ids: string[]; label: string; onOpen?: Drilldown }) {
  if (!count || !onOpen || !ids?.length) return <span>{count}</span>;
  return <button type="button" className="monthly-count-link" onClick={() => onOpen(label, ids)} aria-label={`${label}: ${count} tickets`} title={`View ${count} tickets`}>{count}</button>;
}

function RateBadge({ rate, target, emptyLabel = 'N/A' }: { rate: number | null; target: number; emptyLabel?: string }) {
  const state = rate === null ? 'empty' : rate >= target ? 'met' : rate >= 70 ? 'warning' : 'below';
  const value = rate === null ? emptyLabel : `${rate.toFixed(2)}%`;
  const status = rate === null ? 'No tickets to evaluate' : `${rate >= target ? 'Target met' : 'Below target'} (${target}%)`;
  return (
    <span className={`monthly-rate monthly-rate--${state}`} title={status} aria-label={`${value}: ${status}`}>
      {value}
    </span>
  );
}

function EditableRevisedCell({ value, requestId, field, currentType, isAdmin, onSave }: {
  value: string;
  requestId: string;
  field: 'Revised Root Cause Type' | 'Revised Identified Root Cause';
  currentType?: string;
  isAdmin: boolean;
  onSave?: MonthlyReportTableProps['onUpdateIncident'];
}) {
  const isType = field === 'Revised Root Cause Type';
  return (
    <td className="monthly-revised-cell cell-revised-highlight is-editable">
      {isAdmin && onSave ? (
        <>
          <select value={value || ''} aria-label={`${field} for ${requestId}`} onChange={event => {
            const next = event.target.value;
            onSave(requestId, field, next);
            if (!isType && next) {
              const parent = findRootCauseType(next);
              if (parent && parent !== currentType) onSave(requestId, 'Revised Root Cause Type', parent);
            }
          }}>
            <option value="">{isType ? 'Select root cause type' : 'Select identified root cause'}</option>
            {isType ? <>
              {value && !ROOT_CAUSE_TYPES.includes(value) && <option value={value}>{value} (Current)</option>}
              {ROOT_CAUSE_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
            </> : <>
              {value && !Object.values(ROOT_CAUSE_FACTORS).some(causes => causes.includes(value)) && <option value={value}>{value} (Current)</option>}
              {Object.entries(ROOT_CAUSE_FACTORS).map(([type, causes]) => (
                <optgroup key={type} label={type}>{causes.map(cause => <option key={cause} value={cause}>{cause}</option>)}</optgroup>
              ))}
            </>}
          </select>
          {value && <span className="monthly-revision-value">{value}</span>}
        </>
      ) : <span>{value || '—'}</span>}
    </td>
  );
}

function MonthlySLADashboard({ data, onCellClick }: { data: MonthlyReportData; onCellClick?: Drilldown }) {
  const kpiPanelRef = useRef<HTMLDivElement>(null);
  const technicianSlaPanelRef = useRef<HTMLDivElement>(null);
  const slaAndKpiPanelRef = useRef<HTMLDivElement>(null);

  const fr = data.kpis.find(k => k.label.toLowerCase().includes('response'));
  const rt = data.kpis.find(k => k.label.toLowerCase().includes('resolution'));
  const frTarget = fr?.targetPercent ?? 85;
  const rtTarget = rt?.targetPercent ?? 85;
  const totals = data.technicianTotals;
  const remarks = useMemo(() => generateMonthlyRemarks(data.kpis, data.technicianSLA, totals), [data.kpis, data.technicianSLA, totals]);
  const filenamePeriod = (data.reportPeriod || 'monthly').toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return (
    <div className="monthly-sla-content">
      {/* Top Action Bar with Save Images Export */}
      <div
        className="monthly-sla-toolbar no-export"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
            Performance Metrics
          </span>
          <span style={{ fontSize: '12px', color: '#cbd5e1' }}>
            ({data.reportPeriod || 'Monthly Review'})
          </span>
        </div>
        <ReportImageExport
          sources={[
            {
              panel: slaAndKpiPanelRef,
              title: 'SLA & KPI Summary',
              filename: `monthly-sla-and-kpi-${filenamePeriod}.png`,
            },
            {
              panel: kpiPanelRef,
              title: 'Monthly KPI Results',
              filename: `monthly-kpi-results-${filenamePeriod}.png`,
            },
            {
              panel: technicianSlaPanelRef,
              title: 'Technician SLA Performance',
              filename: `monthly-technician-sla-${filenamePeriod}.png`,
            },
          ]}
          dialogTitle="Save Monthly SLA & KPI Images"
          period={data.reportPeriod || ''}
        />
      </div>

      {/* SLA & KPI Tables Capture Zone (strictly excludes Remarks) */}
      <div
        ref={slaAndKpiPanelRef}
        className="monthly-sla-kpi-capture-zone"
        style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
      >
        <div ref={kpiPanelRef} className="monthly-report-scroll monthly-summary-scroll" role="region" aria-label="Monthly KPI results table" tabIndex={0}>
          <table className="monthly-summary-table monthly-paper-table">
            <caption className="monthly-sr-only">Monthly KPI targets, passing tickets, and results</caption>
            <colgroup>
              <col style={{ width: '28%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <thead><tr>
              <th scope="colgroup" colSpan={2}>KPI</th>
              <th scope="col">Count of Passed</th>
              <th scope="col">Total IRs</th>
              <th scope="col">Percentage Value Result</th>
            </tr></thead>
            <tbody>{data.kpis.map(kpi => {
              const isResponse = kpi === fr;
              const passedIds = isResponse ? totals.frPassedIds : kpi === rt ? totals.rtPassedIds : [];
              const totalIds = isResponse ? totals.frTotalIds : kpi === rt ? totals.rtTotalIds : [];
              return (
                <tr key={kpi.label}>
                  <th scope="row">{kpi.label}</th>
                  <td className="monthly-kpi-target">{kpi.targetPercent}%</td>
                  <td><TicketCount count={kpi.countOfPassed} ids={passedIds} label={`${kpi.label} — Passed`} onOpen={onCellClick} /></td>
                  <td><TicketCount count={kpi.totalIRs} ids={totalIds} label={`${kpi.label} — Total`} onOpen={onCellClick} /></td>
                  <td className="monthly-result-value"><RateBadge rate={kpi.totalIRs ? kpi.percentageResult : null} target={kpi.targetPercent} emptyLabel="0.00%" /></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>

        <div ref={technicianSlaPanelRef} className="monthly-report-scroll monthly-technician-scroll" role="region" aria-label="Technician SLA performance table" tabIndex={0}>
          <table className="monthly-technician-table monthly-paper-table">
            <caption className="monthly-sr-only">First-response and resolution totals and pass rates by technician</caption>
            <colgroup>
              <col style={{ width: '20%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
            </colgroup>
            <thead>
              <tr>
                <td className="monthly-technician-corner" />
                <th scope="colgroup" colSpan={4} className="monthly-fr-group">
                  <SLAMetricHeading metric="response" />
                </th>
                <th scope="colgroup" colSpan={4} className="monthly-rt-group">
                  <SLAMetricHeading metric="resolution" />
                </th>
              </tr>
              <tr>
                <th scope="col" className="monthly-technician-heading">Technician</th>
                {['fr', 'rt'].flatMap(group => technicianColumns.map(label => (
                  <th key={`${group}-${label}`} scope="col" className={label === 'Failed' ? 'monthly-failed-heading' : label === 'SLA Pass Rate' ? 'monthly-rate-heading' : undefined}>
                    {label}
                  </th>
                )))}
              </tr>
            </thead>
            <tbody>
              {data.technicianSLA.map(row => (
                <tr key={row.technician}>
                  <th scope="row">{row.technician}</th>
                  <td><TicketCount count={row.frTotal} ids={row.frTotalIds} label={`${row.technician} — First Response — Total`} onOpen={onCellClick} /></td>
                  <td className={row.frFailed > 0 ? 'monthly-failed-count' : ''}><TicketCount count={row.frFailed} ids={row.frFailedIds} label={`${row.technician} — First Response — Failed`} onOpen={onCellClick} /></td>
                  <td><TicketCount count={row.frPassed} ids={row.frPassedIds} label={`${row.technician} — First Response — Passed`} onOpen={onCellClick} /></td>
                  <td><RateBadge rate={row.frPassRate} target={frTarget} /></td>
                  <td><TicketCount count={row.rtTotal} ids={row.rtTotalIds} label={`${row.technician} — Resolution — Total`} onOpen={onCellClick} /></td>
                  <td className={row.rtFailed > 0 ? 'monthly-failed-count' : ''}><TicketCount count={row.rtFailed} ids={row.rtFailedIds} label={`${row.technician} — Resolution — Failed`} onOpen={onCellClick} /></td>
                  <td><TicketCount count={row.rtPassed} ids={row.rtPassedIds} label={`${row.technician} — Resolution — Passed`} onOpen={onCellClick} /></td>
                  <td><RateBadge rate={row.rtPassRate} target={rtTarget} /></td>
                </tr>
              ))}
              {!data.technicianSLA.length && <tr><td colSpan={9} className="monthly-empty">No technician data for this period.</td></tr>}
            </tbody>
            <tfoot><tr>
              <th scope="row">Total</th>
              <td><TicketCount count={totals.frTotal} ids={totals.frTotalIds} label="Total — First Response — Total" onOpen={onCellClick} /></td>
              <td className={totals.frFailed > 0 ? 'monthly-failed-count' : ''}><TicketCount count={totals.frFailed} ids={totals.frFailedIds} label="Total — First Response — Failed" onOpen={onCellClick} /></td>
              <td><TicketCount count={totals.frPassed} ids={totals.frPassedIds} label="Total — First Response — Passed" onOpen={onCellClick} /></td>
              <td><RateBadge rate={totals.frPassRate} target={frTarget} /></td>
              <td><TicketCount count={totals.rtTotal} ids={totals.rtTotalIds} label="Total — Resolution — Total" onOpen={onCellClick} /></td>
              <td className={totals.rtFailed > 0 ? 'monthly-failed-count' : ''}><TicketCount count={totals.rtFailed} ids={totals.rtFailedIds} label="Total — Resolution — Failed" onOpen={onCellClick} /></td>
              <td><TicketCount count={totals.rtPassed} ids={totals.rtPassedIds} label="Total — Resolution — Passed" onOpen={onCellClick} /></td>
              <td><RateBadge rate={totals.rtPassRate} target={rtTarget} /></td>
            </tr></tfoot>
          </table>
        </div>
      </div>

      {/* Remarks for overall result is strictly outside the capture zone */}
      <ExecutiveRemarksCard remarks={remarks} />
    </div>
  );
}

function EnhancedTicketGrid({ incidents, columns, title, emptyMessage, isAdmin = false, onUpdateIncident, acceptable = false }: {
  incidents: Incident[]; columns: readonly string[]; title: string; emptyMessage: string;
  isAdmin?: boolean; onUpdateIncident?: MonthlyReportTableProps['onUpdateIncident']; acceptable?: boolean;
}) {
  const controlId = useId();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const statuses = useMemo(() => Array.from(new Set(incidents.map(inc => inc.requestStatus || getRawValue(inc, 'Request Status')).filter(Boolean))).sort(), [incidents]);
  const filtered = useMemo(() => incidents.filter(inc => {
    if (statusFilter !== 'ALL' && (inc.requestStatus || getRawValue(inc, 'Request Status')).toLowerCase() !== statusFilter.toLowerCase()) return false;
    const term = searchTerm.trim().toLowerCase();
    return !term || columns.some(col => getRawValue(inc, col).toLowerCase().includes(term));
  }), [incidents, statusFilter, searchTerm, columns]);
  const sorted = useMemo(() => !sortCol ? filtered : [...filtered].sort((a, b) => {
    const order = getRawValue(a, sortCol).localeCompare(getRawValue(b, sortCol), undefined, { numeric: true, sensitivity: 'base' });
    return sortDir === 'asc' ? order : -order;
  }), [filtered, sortCol, sortDir]);
  const totalPages = pageSize === -1 ? 1 : Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const start = pageSize === -1 ? 0 : (page - 1) * pageSize;
  const paginated = pageSize === -1 ? sorted : sorted.slice(start, start + pageSize);
  const resetFilters = () => { setSearchTerm(''); setStatusFilter('ALL'); setCurrentPage(1); };

  return (
    <section className="monthly-panel monthly-ticket-panel" aria-label={title}>
      <div className="monthly-panel-heading">
        <div><h3>{title}</h3><p role="status">{filtered.length} of {incidents.length} tickets{searchTerm.trim() || statusFilter !== 'ALL' ? ' match your filters' : ''}</p></div>
        <div className="monthly-ticket-controls">
          <div className="monthly-filter-field"><label htmlFor={`${controlId}-search`}>Search tickets</label><div className="monthly-search-field">
            <Search size={16} aria-hidden="true" /><input id={`${controlId}-search`} type="search" placeholder="Request ID or any detail" value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }} />
            {searchTerm && <button type="button" className="monthly-icon-button" aria-label="Clear ticket search" onClick={() => { setSearchTerm(''); setCurrentPage(1); }}><X size={16} aria-hidden="true" /></button>}
          </div></div>
          {statuses.length > 0 && <div className="monthly-filter-field"><label htmlFor={`${controlId}-status`}>Status</label><select id={`${controlId}-status`} value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}><option value="ALL">All statuses</option>{statuses.map(status => <option key={status} value={status}>{status}</option>)}</select></div>}
          <div className="monthly-filter-field"><label htmlFor={`${controlId}-size`}>Rows per page</label><select id={`${controlId}-size`} value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}>{[10, 25, 50].map(size => <option key={size} value={size}>{size}</option>)}<option value={-1}>All</option></select></div>
        </div>
      </div>
      {!incidents.length ? <p className="monthly-empty">{emptyMessage}</p> : <>
        <p className="monthly-table-hint">Scroll horizontally to view all columns. Select a column heading to sort.</p>
        <div className="monthly-report-scroll monthly-ticket-scroll" role="region" aria-label={`${title} table`} tabIndex={0}>
          <table className="monthly-records-table">
            <caption className="monthly-sr-only">{title}, with sortable columns</caption>
            <thead><tr><th scope="col" className="monthly-row-index">#</th>{columns.map((col, index) => {
              const isRevisedCol = col === 'Revised Root Cause Type' || col === 'Revised Identified Root Cause';
              return (
                <th
                  key={col}
                  scope="col"
                  className={`${index === 0 ? 'monthly-ticket-id' : ''} ${isRevisedCol ? 'col-header-revised' : ''}`.trim() || undefined}
                  aria-sort={sortCol === col ? sortDir === 'asc' ? 'ascending' : 'descending' : undefined}
                >
                  <button type="button" className="monthly-sort-button" onClick={() => { if (sortCol === col) setSortDir(dir => dir === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('asc'); } setCurrentPage(1); }}>
                    {col.replace(/\n/g, ' ')}{sortCol === col && (sortDir === 'asc' ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />)}
                  </button>
                </th>
              );
            })}</tr></thead>
            <tbody>{paginated.map((inc, index) => <tr key={inc.requestId || index}>
              <td className="monthly-row-index">{start + index + 1}</td>
              {columns.map((col, columnIndex) => {
                const value = getRawValue(inc, col);
                if (col === 'Revised Root Cause Type' || col === 'Revised Identified Root Cause') return <EditableRevisedCell key={col} value={value} requestId={inc.requestId} field={col} currentType={getRawValue(inc, 'Revised Root Cause Type') || getRawValue(inc, 'Root Cause Type')} isAdmin={isAdmin} onSave={onUpdateIncident} />;
                const normalized = col.toLowerCase();
                if (normalized.includes('request status') || normalized === 'status') {
                  const closed = /^(closed|resolved|completed)$/i.test(value);
                  return <td key={col}><span className={`monthly-status monthly-status--${closed ? 'met' : 'info'}`}>{value || '—'}</span></td>;
                }
                if (normalized.includes('overdue status')) {
                  if (acceptable) return <td key={col}><span className="monthly-status monthly-status--met" title={inc.acceptableFirstResponseApproval ? 'First response exception verified and accepted by an administrator' : 'Accepted after-hours filing for a non-ISS department'}>{inc.acceptableFirstResponseApproval ? 'ACCEPTED (ADMIN)' : 'ACCEPTED (AFTER-HOURS)'}</span></td>;
                  const flag = value.trim().toLowerCase();
                  return <td key={col}><span className={`monthly-status monthly-status--${flag === 'true' ? 'below' : flag === 'false' ? 'met' : 'neutral'}`}>{flag === 'true' ? 'Overdue' : flag === 'false' ? 'On time' : 'Not specified'}</span></td>;
                }
                const long = /description|findings|resolution:|root.?cause|comments|remarks|details|lessons|if others|system\/application/.test(normalized);
                return <td key={col} className={columnIndex === 0 ? 'monthly-ticket-id' : long ? 'monthly-long-cell' : undefined}>{normalized.replace(/\s/g, '') === 'requestid' && value ? <RequestIdLink requestId={value} /> : value || '—'}</td>;
              })}
            </tr>)}</tbody>
          </table>
        </div>
        {!filtered.length && <div className="monthly-empty" role="status"><p>No tickets match your filters.</p><button type="button" className="monthly-secondary-button" onClick={resetFilters}>Clear filters</button></div>}
        {filtered.length > 0 && <div className="monthly-record-pagination">
          <span>Showing {start + 1}–{start + paginated.length} of {filtered.length} tickets</span>
          {totalPages > 1 && <div className="monthly-pagination-controls" aria-label="Ticket pagination">
            <button type="button" className="monthly-secondary-button" disabled={page <= 1} onClick={() => setCurrentPage(page - 1)}>Previous</button>
            <span>Page {page} of {totalPages}</span>
            <button type="button" className="monthly-secondary-button" disabled={page >= totalPages} onClick={() => setCurrentPage(page + 1)}>Next</button>
          </div>}
        </div>}
      </>}
    </section>
  );
}

export function MonthlyReportTable({ data, onCellClick, routedIncidents, isAdmin = false, isPublicView = false, onUpdateIncident, onArchiveReport, onAddAcceptableFR, onDeleteIncident, onSaveReport, isArchived = false }: MonthlyReportTableProps) {
  const [activeTab, setActiveTab] = useState<TabId>('sla-dashboard');
  const [internalSaved, setInternalSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archiveError, setArchiveError] = useState('');
  const tabsId = useId();
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const allIncidents = routedIncidents?.length ? routedIncidents : data.allTickets;
  const acceptableFR = useMemo(() => filterAcceptableFirstResponse(allIncidents), [allIncidents]);
  const savedState = isArchived || internalSaved;
  const handleSaveReport = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setArchiveError('');
    try {
      if (onSaveReport) await onSaveReport();
      else if (onArchiveReport) await onArchiveReport();
      else {
        const period = data.reportPeriod || 'Monthly Period';
        await saveReport({ id: `monthly-${period.toLowerCase().replace(/[^a-z0-9]/g, '-') || Date.now()}`, type: 'monthly', title: data.reportTitle || `Monthly Overall Ticket Report - ${period}`, period, reportData: data, routedIncidents });
        setInternalSaved(true);
        setTimeout(() => setInternalSaved(false), 4000);
      }
    } catch (error) {
      setArchiveError(error instanceof Error ? error.message : 'Could not save the monthly report to the archive.');
    } finally { setSaving(false); }
  }, [saving, onSaveReport, onArchiveReport, data, routedIncidents]);
  const tabs = [
    { id: 'sla-dashboard' as const, label: 'SLA dashboard', count: null, Icon: BarChart3 },
    { id: 'all-tickets' as const, label: 'All tickets', count: allIncidents.length, Icon: ClipboardList },
    { id: 'closed-tickets' as const, label: 'Closed tickets', count: data.closedTickets.length, Icon: FileCheck2 },
    { id: 'first-response' as const, label: 'Acceptable first response', count: acceptableFR.length, Icon: Clock3 },
    { id: 'powerbi' as const, label: 'Power BI dashboard', count: null, Icon: BarChart3 },
  ];

  return (
    <div className="monthly-report-module" id="monthly-report-canvas" data-public-view={isPublicView}>
      <header className="monthly-module-header">
        <div className="monthly-module-heading"><span className="monthly-module-icon" aria-hidden="true">📊</span><div className="monthly-module-title"><h2>Monthly SLA Report</h2><span className="monthly-period">{data.reportPeriod || 'Monthly review'}</span></div></div>
        {!isPublicView && <button type="button" className={`monthly-save-button${savedState ? ' is-saved' : ''}`} onClick={handleSaveReport} disabled={saving} aria-busy={saving}>{savedState && <Check size={16} aria-hidden="true" />}{saving ? 'Saving…' : savedState ? 'Archived' : 'Archive report'}</button>}
      </header>
      {archiveError && <p className="monthly-error" role="alert">{archiveError}</p>}
      <div className="monthly-module-tabs" role="tablist" aria-label="Monthly report sections">
        {tabs.map((tab, index) => (
          <button key={tab.id} ref={element => { tabButtons.current[index] = element; }} type="button" role="tab" id={`${tabsId}-${tab.id}`} aria-controls={`${tabsId}-panel-${tab.id}`} aria-selected={activeTab === tab.id} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)} onKeyDown={event => {
            let next: number;
            if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
            else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = tabs.length - 1;
            else return;
            event.preventDefault(); setActiveTab(tabs[next].id); tabButtons.current[next]?.focus();
          }}><tab.Icon size={16} aria-hidden="true" /><span>{tab.label}</span>{tab.count !== null && <span className="monthly-tab-count">{tab.count}</span>}</button>
        ))}
      </div>
      {tabs.map(tab => <div key={tab.id} role="tabpanel" id={`${tabsId}-panel-${tab.id}`} aria-labelledby={`${tabsId}-${tab.id}`} hidden={activeTab !== tab.id} tabIndex={0}>
        {activeTab === tab.id && <>
          {tab.id === 'sla-dashboard' && <MonthlySLADashboard data={data} onCellClick={onCellClick} />}
          {tab.id === 'all-tickets' && <>
            {isAdmin && !isPublicView && onDeleteIncident && <DeleteIR incidents={allIncidents} onDelete={onDeleteIncident} />}
            <EnhancedTicketGrid incidents={allIncidents} columns={ALL_TICKETS_COLUMNS} title="All incidents" emptyMessage="No tickets found for this period." isAdmin={isAdmin && !isPublicView} onUpdateIncident={onUpdateIncident} />
          </>}
          {tab.id === 'closed-tickets' && <>
            {isAdmin && !isPublicView && onDeleteIncident && <DeleteIR incidents={data.closedTickets} onDelete={onDeleteIncident} />}
            <EnhancedTicketGrid incidents={data.closedTickets} columns={CLOSED_TICKETS_COLUMNS} title="Closed incidents" emptyMessage="No closed tickets found for this period." isAdmin={isAdmin && !isPublicView} onUpdateIncident={onUpdateIncident} />
          </>}
          {tab.id === 'first-response' && <>
            {isAdmin && !isPublicView && onAddAcceptableFR && <AcceptableFRInput incidents={allIncidents} onAdd={onAddAcceptableFR} />}
            <EnhancedTicketGrid incidents={acceptableFR} columns={FIRST_RESPONSE_COLUMNS} title="Acceptable first response" emptyMessage="No accepted first-response exceptions for this period." isAdmin={isAdmin && !isPublicView} onUpdateIncident={onUpdateIncident} acceptable />
          </>}
          {tab.id === 'powerbi' && <section className="monthly-panel monthly-powerbi"><div className="monthly-panel-heading"><h3>Power BI SLA report</h3></div><div className="monthly-powerbi-frame"><iframe title="Monthly Incident Report" src="https://app.powerbi.com/view?r=eyJrIjoiMGMwZjQ2MzItODg0NS00YzhhLThjZTAtYTk1OGI1Y2MzMDRiIiwidCI6IjA0MjUwYzE0LTBiNzAtNGY5Zi04Yzg3LWU5OGZiOTM0NjI4ZiIsImMiOjEwfQ%3D%3D" allowFullScreen /></div></section>}
        </>}
      </div>)}
    </div>
  );
}
