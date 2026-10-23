'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { Incident } from '@/types/incident';
import type { MonthlyReportData } from '@/types/monthly';
import {
  ALL_TICKETS_COLUMNS,
  CLOSED_TICKETS_COLUMNS,
  getIncidentMonthlyValue as getRawValue,
  ROOT_CAUSE_FACTORS,
  ROOT_CAUSE_TYPES,
  findRootCauseType,
} from '@/types/monthly';
import { formatSLAPercentage } from '@/lib/sla/calculator';
import { exportAsPng } from '@/lib/report/export';

// ─── Sub-component interfaces ───────────────────────────────

interface MonthlyReportTableProps {
  data: MonthlyReportData;
  onCellClick?: (title: string, incidentIds: string[]) => void;
  routedIncidents?: Incident[];
  isAdmin?: boolean;
  onUpdateIncident?: (
    requestId: string,
    field: 'Revised Root Cause Type' | 'Revised Identified Root Cause',
    value: string
  ) => void;
}

type TabId = 'all-tickets' | 'closed-tickets' | 'first-response' | 'sla-dashboard';

// ─── Editable Revised Cell Component ────────────────────────

function EditableRevisedCell({
  value,
  requestId,
  field,
  currentType,
  isAdmin,
  onSave,
}: {
  value: string;
  requestId: string;
  field: 'Revised Root Cause Type' | 'Revised Identified Root Cause';
  currentType?: string;
  isAdmin: boolean;
  onSave?: (
    requestId: string,
    field: 'Revised Root Cause Type' | 'Revised Identified Root Cause',
    val: string
  ) => void;
}) {
  const isTypeField = field === 'Revised Root Cause Type';

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newVal = e.target.value;
    if (onSave) {
      onSave(requestId, field, newVal);

      // Auto-set Revised Root Cause Type if an identified root cause is chosen
      if (!isTypeField && newVal) {
        const parentType = findRootCauseType(newVal);
        if (parentType && (!currentType || currentType !== parentType)) {
          onSave(requestId, 'Revised Root Cause Type', parentType);
        }
      }
    }
  };

  if (!isAdmin) {
    return (
      <td className="cell-revised-highlight" title={value || 'No adjustment'}>
        <span className={value ? 'revised-value-text' : 'revised-empty-text'}>
          {value || '—'}
        </span>
      </td>
    );
  }

  return (
    <td
      className="cell-revised-highlight is-editable"
      title={`${field} (Manual Checker Dropdown)`}
    >
      <div className="revised-select-wrapper">
        <select
          className={`revised-select-input ${value ? 'has-value' : 'is-empty'} ${isTypeField ? 'is-type-select' : 'is-cause-select'}`}
          value={value || ''}
          onChange={handleChange}
          aria-label={field}
          title={value || `Select ${field}`}
        >
          <option value="">
            {isTypeField ? '-- Select Root Cause Type --' : '-- Select Identified Root Cause --'}
          </option>

          {isTypeField ? (
            <>
              {value && !ROOT_CAUSE_TYPES.includes(value) && (
                <option value={value}>{value} (Current)</option>
              )}
              {ROOT_CAUSE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </>
          ) : (
            <>
              {value &&
                !Object.values(ROOT_CAUSE_FACTORS).some((arr) => arr.includes(value)) && (
                  <option value={value}>{value} (Current)</option>
                )}
              {currentType && ROOT_CAUSE_FACTORS[currentType] ? (
                ROOT_CAUSE_FACTORS[currentType].map((cause) => (
                  <option key={cause} value={cause} title={cause}>
                    {cause}
                  </option>
                ))
              ) : (
                Object.entries(ROOT_CAUSE_FACTORS).map(([type, causes]) => (
                  <optgroup key={type} label={type}>
                    {causes.map((cause) => (
                      <option key={cause} value={cause} title={cause}>
                        {cause}
                      </option>
                    ))}
                  </optgroup>
                ))
              )}
            </>
          )}
        </select>
      </div>
    </td>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ticket Table Component
// ─────────────────────────────────────────────────────────────────────────────

function TicketTable({
  incidents,
  columns,
  title,
  emptyMessage,
  isAdmin = false,
  onUpdateIncident,
}: {
  incidents: Incident[];
  columns: readonly string[];
  title: string;
  emptyMessage: string;
  isAdmin?: boolean;
  onUpdateIncident?: (
    requestId: string,
    field: 'Revised Root Cause Type' | 'Revised Identified Root Cause',
    value: string
  ) => void;
}) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return incidents;
    const term = searchTerm.toLowerCase();
    return incidents.filter((inc) =>
      columns.some((col) => getRawValue(inc, col).toLowerCase().includes(term))
    );
  }, [incidents, searchTerm, columns]);

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      const va = getRawValue(a, sortCol).toLowerCase();
      const vb = getRawValue(b, sortCol).toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortCol, sortDir]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paginated = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
    setCurrentPage(1);
  };

  return (
    <div className="monthly-ticket-table-wrap">
      <div className="monthly-ticket-header">
        <h3 className="monthly-ticket-title">{title}</h3>
        <div className="monthly-ticket-controls">
          <span className="monthly-ticket-count">{filtered.length} ticket{filtered.length !== 1 ? 's' : ''}</span>
          <input
            type="text"
            className="monthly-ticket-search"
            placeholder="Search tickets..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          />
        </div>
      </div>

      {incidents.length === 0 ? (
        <div className="monthly-empty-state">{emptyMessage}</div>
      ) : (
        <>
          <div className="monthly-table-scroll">
            <table className="monthly-data-table">
              <thead>
                <tr>
                  <th className="monthly-row-num">#</th>
                  {columns.map((col) => {
                    const isRevisedCol =
                      col === 'Revised Root Cause Type' ||
                      col === 'Revised Identified Root Cause';
                    return (
                      <th
                        key={col}
                        className={`monthly-col-header ${sortCol === col ? 'is-sorted' : ''} ${isRevisedCol ? 'col-header-revised' : ''}`}
                        onClick={() => handleSort(col)}
                        title={`Sort by ${col}${isRevisedCol && isAdmin ? ' (Admin Editable)' : ''}`}
                      >
                        <div className="monthly-col-header-inner">
                          {isRevisedCol && (
                            <span className="revised-badge">{isAdmin ? '✏️ EDITABLE' : 'ADJUSTED'}</span>
                          )}
                          <span>{col.replace(/\n/g, ' ')}</span>
                          {sortCol === col && (
                            <span className="monthly-sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {paginated.map((inc, idx) => {
                  const rowIndex = (currentPage - 1) * pageSize + idx + 1;
                  const isOverdueFR = inc.firstResponseOverdue;
                  const isOverdueRes = inc.resolutionOverdue;
                  return (
                    <tr
                      key={inc.requestId || idx}
                      className={`monthly-data-row ${isOverdueFR || isOverdueRes ? 'has-overdue' : ''}`}
                    >
                      <td className="monthly-row-num">{rowIndex}</td>
                      {columns.map((col) => {
                        if (
                          col === 'Revised Root Cause Type' ||
                          col === 'Revised Identified Root Cause'
                        ) {
                          const val = getRawValue(inc, col);
                          const currentType =
                            getRawValue(inc, 'Revised Root Cause Type') ||
                            getRawValue(inc, 'Root Cause Type');
                          return (
                            <EditableRevisedCell
                              key={col}
                              value={val}
                              requestId={inc.requestId}
                              field={col}
                              currentType={currentType}
                              isAdmin={isAdmin}
                              onSave={onUpdateIncident}
                            />
                          );
                        }

                        const val = getRawValue(inc, col);
                        const colLower = col.toLowerCase();
                        let cellClass = '';
                        if (colLower.includes('first response overdue') && val.toLowerCase() === 'true') {
                          cellClass = 'cell-overdue-true';
                        } else if (colLower.includes('overdue status') && val.toLowerCase() === 'true') {
                          cellClass = 'cell-overdue-true';
                        } else if (colLower.includes('request status')) {
                          const status = val.toLowerCase();
                          if (status === 'closed' || status === 'resolved') cellClass = 'cell-status-closed';
                          else if (status === 'on hold') cellClass = 'cell-status-hold';
                          else if (status === 'open') cellClass = 'cell-status-open';
                        }
                        return (
                          <td key={col} className={cellClass} title={val}>
                            {val || '—'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="monthly-pagination">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => p - 1)}
                className="monthly-page-btn"
              >
                ← Prev
              </button>
              <span className="monthly-page-info">
                Page {currentPage} of {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="monthly-page-btn"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── SLA Dashboard Component ────────────────────────────────

function SLADashboard({
  data,
  onCellClick,
}: {
  data: MonthlyReportData;
  onCellClick?: (title: string, ids: string[]) => void;
}) {
  const handleClick = (title: string, ids: string[]) => {
    if (onCellClick && ids.length > 0) onCellClick(title, ids);
  };

  const getPercentClass = (val: number | null): string => {
    if (val === null) return 'sla-na';
    if (val >= 90) return 'sla-excellent';
    if (val >= 85) return 'sla-good';
    if (val >= 70) return 'sla-warning';
    return 'sla-critical';
  };

  const getKPIClass = (result: number, target: number): string => {
    return result >= target ? 'kpi-met' : 'kpi-failed';
  };

  return (
    <div className="monthly-sla-dashboard" id="monthly-report-canvas">
      {/* ════ SLA TITLE ════ */}
      <div className="monthly-sla-title-bar">
        <h2>SLA</h2>
      </div>

      {/* ════ KPI SUMMARY TABLE ════ */}
      <div className="monthly-kpi-section">
        <table className="monthly-kpi-table">
          <thead>
            <tr>
              <th className="kpi-empty"></th>
              <th className="kpi-header">KPI</th>
              <th className="kpi-header">Count of Passed</th>
              <th className="kpi-header">Total IRs</th>
              <th className="kpi-header">Percentage Value Result</th>
            </tr>
          </thead>
          <tbody>
            {data.kpis.map((kpi) => (
              <tr key={kpi.label}>
                <td className="kpi-label">{kpi.label}</td>
                <td className="kpi-target">{kpi.targetPercent}%</td>
                <td className="kpi-value">{kpi.countOfPassed}</td>
                <td className="kpi-value">{kpi.totalIRs}</td>
                <td className={`kpi-result ${getKPIClass(kpi.percentageResult, kpi.targetPercent)}`}>
                  {kpi.percentageResult.toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ════ PER-TECHNICIAN BREAKDOWN ════ */}
      <div className="monthly-tech-section">
        <table className="monthly-tech-table">
          <thead>
            <tr className="monthly-tech-header-groups">
              <th className="tech-name-header" rowSpan={2}>Technician</th>
              <th className="tech-fr-header" colSpan={4}>First Response</th>
              <th className="tech-rt-header" colSpan={4}>Resolution Time</th>
            </tr>
            <tr className="monthly-tech-header-cols">
              <th>Total # of IRs</th>
              <th>Failed</th>
              <th>Passed</th>
              <th>SLA Pass Rate</th>
              <th>Total # of IRs</th>
              <th>Failed</th>
              <th>Passed</th>
              <th>SLA Pass Rate</th>
            </tr>
          </thead>
          <tbody>
            {data.technicianSLA.map((row) => (
              <tr key={row.technician} className="monthly-tech-data-row">
                <td className="tech-name-cell">{row.technician}</td>
                {/* First Response */}
                <td
                  className="tech-cell clickable"
                  onClick={() => handleClick(`${row.technician} — First Response — Total`, row.frTotalIds)}
                >
                  {row.frTotal > 0 ? row.frTotal : '—'}
                </td>
                <td
                  className={`tech-cell clickable ${row.frFailed > 0 ? 'has-failures' : ''}`}
                  onClick={() => handleClick(`${row.technician} — First Response — Failed`, row.frFailedIds)}
                >
                  {row.frTotal > 0 ? row.frFailed : '—'}
                </td>
                <td
                  className="tech-cell clickable"
                  onClick={() => handleClick(`${row.technician} — First Response — Passed`, row.frPassedIds)}
                >
                  {row.frTotal > 0 ? row.frPassed : '—'}
                </td>
                <td className={`tech-cell tech-rate ${getPercentClass(row.frPassRate)}`}>
                  {formatSLAPercentage(row.frPassRate)}
                </td>
                {/* Resolution Time */}
                <td
                  className="tech-cell clickable"
                  onClick={() => handleClick(`${row.technician} — Resolution — Total`, row.rtTotalIds)}
                >
                  {row.rtTotal > 0 ? row.rtTotal : '—'}
                </td>
                <td
                  className={`tech-cell clickable ${row.rtFailed > 0 ? 'has-failures' : ''}`}
                  onClick={() => handleClick(`${row.technician} — Resolution — Failed`, row.rtFailedIds)}
                >
                  {row.rtTotal > 0 ? row.rtFailed : '—'}
                </td>
                <td
                  className="tech-cell clickable"
                  onClick={() => handleClick(`${row.technician} — Resolution — Passed`, row.rtPassedIds)}
                >
                  {row.rtTotal > 0 ? row.rtPassed : '—'}
                </td>
                <td className={`tech-cell tech-rate ${getPercentClass(row.rtPassRate)}`}>
                  {formatSLAPercentage(row.rtPassRate)}
                </td>
              </tr>
            ))}

            {/* Totals Row */}
            <tr className="monthly-tech-total-row">
              <td className="tech-name-cell tech-total-label">Total</td>
              <td className="tech-cell tech-total-val">{data.technicianTotals.frTotal}</td>
              <td className={`tech-cell tech-total-val ${data.technicianTotals.frFailed > 0 ? 'has-failures' : ''}`}>
                {data.technicianTotals.frFailed}
              </td>
              <td className="tech-cell tech-total-val">{data.technicianTotals.frPassed}</td>
              <td className="tech-cell tech-total-val">{/* SLA pass rate cell in total is intentionally blank per screenshot */}</td>
              <td className="tech-cell tech-total-val">{data.technicianTotals.rtTotal}</td>
              <td className={`tech-cell tech-total-val ${data.technicianTotals.rtFailed > 0 ? 'has-failures' : ''}`}>
                {data.technicianTotals.rtFailed}
              </td>
              <td className="tech-cell tech-total-val">{data.technicianTotals.rtPassed}</td>
              <td className="tech-cell tech-total-val">{/* Blank for totals */}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ════ REMARKS ════ */}
      <div className="monthly-remarks-section">
        <h3 className="monthly-remarks-title">Remarks for overall result</h3>
        <div className="monthly-remarks-body">
          {data.remarks.split('\n').map((line, i) => {
            if (!line.trim()) return <br key={i} />;
            const isBold =
              line.startsWith('Target ') ||
              line.startsWith('Observations:') ||
              line.startsWith('Recommendation:');
            return (
              <p key={i} className={isBold ? 'remarks-bold' : ''}>
                {line}
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Monthly Report Table Component ────────────────────

export function MonthlyReportTable({
  data,
  onCellClick,
  routedIncidents,
  isAdmin = false,
  onUpdateIncident,
}: MonthlyReportTableProps) {
  const [activeTab, setActiveTab] = useState<TabId>('sla-dashboard');

  const allIncidents = routedIncidents || data.allTickets;

  // Filter for Acceptable First Response (those NOT overdue)
  const acceptableFR = useMemo(
    () => allIncidents.filter((inc) => !inc.firstResponseOverdue),
    [allIncidents]
  );

  const tabs: { id: TabId; label: string; count: number; icon: string }[] = [
    { id: 'sla-dashboard', label: 'SLA Dashboard', count: 0, icon: '📊' },
    { id: 'all-tickets', label: 'All Tickets', count: allIncidents.length, icon: '📋' },
    { id: 'closed-tickets', label: 'Closed Tickets', count: data.closedTickets.length, icon: '✅' },
    { id: 'first-response', label: 'Acceptable First Response', count: acceptableFR.length, icon: '⏱️' },
  ];

  const handleExportPng = useCallback(async () => {
    try {
      await exportAsPng(
        'monthly-report-canvas',
        `Monthly_SLA_Report_${new Date().toISOString().split('T')[0]}.png`
      );
    } catch {
      alert('Failed to export as PNG');
    }
  }, []);

  return (
    <div className="monthly-report-wrapper">
      {/* Report Title */}
      <div className="monthly-report-title-bar">
        <h1 className="monthly-report-main-title">Monthly Overall Ticket Report</h1>
        <p className="monthly-report-period">{data.reportPeriod}</p>
      </div>

      {/* Tab Navigation */}
      <div className="monthly-tab-bar">
        <div className="monthly-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`monthly-tab ${activeTab === tab.id ? 'is-active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
              {tab.count > 0 && <span className="tab-badge">{tab.count}</span>}
            </button>
          ))}
        </div>
        {activeTab === 'sla-dashboard' && (
          <button className="btn btn-export monthly-png-btn" onClick={handleExportPng}>
            📷 Download PNG
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div className="monthly-tab-content">
        {activeTab === 'sla-dashboard' && (
          <SLADashboard data={data} onCellClick={onCellClick} />
        )}

        {activeTab === 'all-tickets' && (
          <TicketTable
            incidents={allIncidents}
            columns={ALL_TICKETS_COLUMNS}
            title="All Tickets"
            emptyMessage="No tickets found for this period."
            isAdmin={isAdmin}
            onUpdateIncident={onUpdateIncident}
          />
        )}

        {activeTab === 'closed-tickets' && (
          <TicketTable
            incidents={data.closedTickets}
            columns={CLOSED_TICKETS_COLUMNS}
            title="Closed Tickets"
            emptyMessage="No closed tickets found for this period."
            isAdmin={isAdmin}
            onUpdateIncident={onUpdateIncident}
          />
        )}

        {activeTab === 'first-response' && (
          <TicketTable
            incidents={acceptableFR}
            columns={ALL_TICKETS_COLUMNS}
            title="Acceptable First Response"
            emptyMessage="No tickets with acceptable first response found."
            isAdmin={isAdmin}
            onUpdateIncident={onUpdateIncident}
          />
        )}
      </div>

      {/* Footer */}
      <div className="monthly-report-footer">
        <p>
          Generated:{' '}
          {(() => {
            try {
              const d = typeof data.generatedAt === 'string' ? new Date(data.generatedAt) : data.generatedAt;
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
          })()}
        </p>
      </div>
    </div>
  );
}
