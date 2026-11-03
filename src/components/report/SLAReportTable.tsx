'use client';

import React, { useRef, useState } from 'react';
import type { WeeklyReportData } from '@/types/sla';
import type { Incident } from '@/types/incident';
import { formatSLAPercentage } from '@/lib/sla/calculator';
import { saveReport } from '@/lib/storage/report-storage';

interface SLAReportTableProps {
  data: WeeklyReportData;
  onCellClick?: (title: string, incidentIds: string[]) => void;
  routedIncidents?: Incident[];
  onSaveReport?: () => void;
}

interface OverdueStatusTableProps {
  title: string;
  accentColor: string;
  passed: number;
  failed: number;
  rate: number | null | undefined;
  passedIds?: string[];
  failedIds?: string[];
  onCellClick?: (title: string, ids: string[] | undefined) => void;
}

function ModernOverdueStatusTable({
  title,
  accentColor,
  passed,
  failed,
  rate,
  passedIds,
  failedIds,
  onCellClick,
}: OverdueStatusTableProps) {
  const hasRate = rate !== null && rate !== undefined;
  const isTargetMet = hasRate && rate >= 85;
  const rateColor = isTargetMet ? '#047857' : '#dc2626';
  const rateBg = isTargetMet ? '#ecfdf5' : '#fff1f2';
  const rateBorder = isTargetMet ? '#a7f3d0' : '#fecaca';

  return (
    <div style={{ marginBottom: '22px' }}>
      {/* Title with matching color bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <div
          style={{
            width: '4px',
            height: '18px',
            borderRadius: '2px',
            background: accentColor,
          }}
        />
        <h3
          style={{
            margin: 0,
            fontSize: '1.05rem',
            fontWeight: 800,
            color: '#0f172a',
            letterSpacing: '0.01em',
            fontFamily:
              "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Inter, 'Helvetica Neue', Arial, sans-serif",
          }}
        >
          {title}
        </h3>
      </div>

      <div
        style={{
          border: '1px solid #cbd5e1',
          borderTop: `3px solid ${accentColor}`,
          borderRadius: '8px',
          overflow: 'hidden',
          background: '#ffffff',
          boxShadow: '0 2px 6px rgba(15, 23, 42, 0.06)',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontFamily:
              "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Inter, 'Helvetica Neue', Arial, sans-serif",
          }}
        >
          <tbody>
            <tr>
              {/* Overdue Status (Header column) */}
              <td
                rowSpan={2}
                style={{
                  width: '28%',
                  textAlign: 'center',
                  fontWeight: 800,
                  fontSize: '0.92rem',
                  color: '#ffffff',
                  background: '#1e293b',
                  borderRight: '1px solid #334155',
                  padding: '16px 12px',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                Overdue Status
              </td>

              {/* PASSED Label */}
              <td
                style={{
                  width: '24%',
                  textAlign: 'center',
                  fontWeight: 800,
                  fontSize: '0.92rem',
                  color: '#14532d',
                  background: '#dcfce7',
                  borderRight: '1px solid #bbf7d0',
                  borderBottom: '1px solid #e2e8f0',
                  padding: '12px 14px',
                  letterSpacing: '0.05em',
                }}
              >
                ✓ PASSED
              </td>

              {/* PASSED Count */}
              <td
                onClick={() => onCellClick?.(`${title} Passed`, passedIds)}
                title={passedIds?.length ? 'Click to view passed tickets' : undefined}
                className={passedIds?.length ? 'cell-interactive' : ''}
                style={{
                  width: '20%',
                  textAlign: 'center',
                  fontWeight: 900,
                  fontSize: '1.25rem',
                  color: '#15803d',
                  background: '#f0fdf4',
                  borderRight: '1px solid #e2e8f0',
                  borderBottom: '1px solid #e2e8f0',
                  padding: '12px 14px',
                  fontVariantNumeric: 'tabular-nums',
                  cursor: passedIds?.length ? 'pointer' : 'default',
                  transition: 'background 0.15s ease',
                }}
              >
                {passed}
              </td>

              {/* Rate percentage (rowSpan=2) */}
              <td
                rowSpan={2}
                style={{
                  width: '28%',
                  textAlign: 'center',
                  verticalAlign: 'middle',
                  padding: '16px 14px',
                  background: rateBg,
                  borderLeft: `1px solid ${rateBorder}`,
                }}
              >
                <div
                  style={{
                    fontSize: '2.3rem',
                    fontWeight: 900,
                    color: rateColor,
                    lineHeight: 1,
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {hasRate ? `${rate.toFixed(2)}%` : 'N/A'}
                </div>
                <div
                  style={{
                    marginTop: '6px',
                    fontSize: '10.5px',
                    fontWeight: 700,
                    color: isTargetMet ? '#15803d' : '#b91c1c',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  {isTargetMet ? 'Target Met (≥85%)' : 'Target Missed (<85%)'}
                </div>
              </td>
            </tr>

            {/* Row 2: FAILED */}
            <tr>
              {/* FAILED Label */}
              <td
                style={{
                  textAlign: 'center',
                  fontWeight: 800,
                  fontSize: '0.92rem',
                  color: '#7f1d1d',
                  background: '#fee2e2',
                  borderRight: '1px solid #fecaca',
                  padding: '12px 14px',
                  letterSpacing: '0.05em',
                }}
              >
                ✕ FAILED
              </td>

              {/* FAILED Count */}
              <td
                onClick={() => onCellClick?.(`${title} Failed`, failedIds)}
                title={failedIds?.length ? 'Click to view failed tickets' : undefined}
                className={failedIds?.length ? 'cell-interactive' : ''}
                style={{
                  textAlign: 'center',
                  fontWeight: 900,
                  fontSize: '1.25rem',
                  color: '#b91c1c',
                  background: '#fef2f2',
                  borderRight: '1px solid #e2e8f0',
                  padding: '12px 14px',
                  fontVariantNumeric: 'tabular-nums',
                  cursor: failedIds?.length ? 'pointer' : 'default',
                  transition: 'background 0.15s ease',
                }}
              >
                {failed}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SLAReportTable({
  data,
  onCellClick,
  routedIncidents,
  onSaveReport,
}: SLAReportTableProps) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = () => {
    saveReport({
      type: 'weekly',
      title: data.reportTitle,
      period: data.reportPeriod,
      reportData: data,
      routedIncidents,
    });
    setIsSaved(true);
    if (onSaveReport) onSaveReport();
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
      });
    } catch {
      return '';
    }
  })();

  const handleClick = (title: string, ids: string[] | undefined) => {
    if (onCellClick && ids && ids.length > 0) {
      onCellClick(title, ids);
    }
  };

  const frTotal = data.currentWeek.firstResponseTotal;
  const rtTotal = data.currentWeek.resolutionTimeTotal;

  // Overdue status metrics for Resolution & First Response (matching Image 2 reference)
  const resPassed = data.weeklyCompletion?.resolution?.passed ?? rtTotal.passed;
  const resFailed = data.weeklyCompletion?.resolution?.failed ?? rtTotal.failed;
  const resRate = data.weeklyCompletion?.resolution?.slaPassRate ?? rtTotal.slaPassRate;
  const resPassedIds = data.weeklyCompletion?.resolution?.passedIncidentIds ?? rtTotal.passedIncidentIds;
  const resFailedIds = data.weeklyCompletion?.resolution?.failedIncidentIds ?? rtTotal.failedIncidentIds;

  const frCompPassed = data.weeklyCompletion?.firstResponse?.passed ?? frTotal.passed;
  const frCompFailed = data.weeklyCompletion?.firstResponse?.failed ?? frTotal.failed;
  const frCompRate = data.weeklyCompletion?.firstResponse?.slaPassRate ?? frTotal.slaPassRate;
  const frPassedIds = data.weeklyCompletion?.firstResponse?.passedIncidentIds ?? frTotal.passedIncidentIds;
  const frFailedIds = data.weeklyCompletion?.firstResponse?.failedIncidentIds ?? frTotal.failedIncidentIds;

  return (
    <div className="itsm-report-wrapper" ref={reportRef}>
      <div className="itsm-dashboard-canvas" id="sla-report-canvas">
        {/* ════ Action Toolbar ════ */}
        <div className="weekly-table-action-bar no-export">
          <div>
            <h2 className="itsm-section-title">Closed Incident Weekly Report</h2>
            <p className="itsm-section-desc">
              Weekly Service Level Agreement (SLA) metrics for First Response and Resolution Time
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              type="button"
              className={`itsm-save-btn ${isSaved ? 'is-saved' : ''}`}
              onClick={handleSave}
              title="Save report to local browser storage"
            >
              {isSaved ? '✓ Saved' : '💾 Archive Report'}
            </button>
          </div>
        </div>

        {/* ════ Printable / Exportable Weekly Report Card ════ */}
        <div className="weekly-report-card" id="weekly-closed-incident-report-card">
          {/* Header Banner */}
          <div className="weekly-report-banner">
            <h1 className="weekly-report-banner-title">
              {data.reportTitle || 'Closed Incident Weekly Report'}
            </h1>
            <p className="weekly-report-banner-period">
              {data.reportPeriod
                ? data.reportPeriod.toLowerCase().startsWith('week')
                  ? data.reportPeriod
                  : `Week of ${data.reportPeriod}`
                : `Week of ${formattedDate || 'October 23, 2026'}`}
            </p>
          </div>

          {/* 1. Closed Incident Weekly Report Table (Zero Scrollbars) */}
          <div className="weekly-table-responsive">
            <table className="weekly-incident-table">
              <thead>
                {/* Level 1: Group Headers */}
                <tr>
                  <th className="th-weekly-team" rowSpan={2}>
                    Final Team
                  </th>
                  <th className="th-weekly-fr" colSpan={5}>
                    First Response
                  </th>
                  <th className="th-weekly-rt" colSpan={5}>
                    Resolution Time
                  </th>
                </tr>

                {/* Level 2: Column Sub-Headers */}
                <tr className="tr-weekly-subcols">
                  {/* First Response Columns */}
                  <th className="th-sub-total">Total # of IRs</th>
                  <th className="th-sub-failed">Failed</th>
                  <th className="th-sub-passed">Passed</th>
                  <th className="th-sub-rate">SLA Pass Rate this week</th>
                  <th className="th-sub-rate">SLA Pass Rate as of last week</th>

                  {/* Resolution Time Columns */}
                  <th className="th-sub-total">Total # of IRs</th>
                  <th className="th-sub-failed">Failed</th>
                  <th className="th-sub-passed">Passed</th>
                  <th className="th-sub-rate">SLA Pass Rate this week</th>
                  <th className="th-sub-rate">SLA Pass Rate as of last week</th>
                </tr>
              </thead>

              <tbody>
                {data.teamOrder.map((team) => {
                  const fr = data.currentWeek.firstResponse.find((r) => r.teamName === team);
                  const rt = data.currentWeek.resolutionTime.find((r) => r.teamName === team);
                  const frPrev = data.previousWeek.firstResponse[team];
                  const rtPrev = data.previousWeek.resolutionTime[team];

                  if (!fr || !rt) return null;

                  const hasFrActivity = fr.total > 0;
                  const hasRtActivity = rt.total > 0;

                  return (
                    <tr key={team}>
                      {/* Team Name in Royal Blue */}
                      <td className="td-weekly-team">{team}</td>

                      {/* First Response: Total */}
                      <td
                        className={`td-weekly-cell ${hasFrActivity ? 'cell-interactive' : ''}`}
                        onClick={() => hasFrActivity && handleClick(`${team} — First Response Total`, fr.incidentIds)}
                        title={hasFrActivity ? 'Click to inspect incident tickets' : undefined}
                      >
                        {hasFrActivity ? fr.total : <span className="weekly-na-text">N/A</span>}
                      </td>

                      {/* First Response: Failed */}
                      <td
                        className={`td-weekly-cell ${hasFrActivity && fr.failed > 0 ? 'td-weekly-failed-breach' : ''} ${hasFrActivity ? 'cell-interactive' : ''}`}
                        onClick={() => hasFrActivity && fr.failed > 0 && handleClick(`${team} — First Response Failed`, fr.failedIncidentIds)}
                        title={hasFrActivity && fr.failed > 0 ? 'Click to inspect failed tickets' : undefined}
                      >
                        {hasFrActivity ? fr.failed : <span className="weekly-na-text">N/A</span>}
                      </td>

                      {/* First Response: Passed */}
                      <td
                        className={`td-weekly-cell ${hasFrActivity ? 'cell-interactive' : ''}`}
                        onClick={() => hasFrActivity && handleClick(`${team} — First Response Passed`, fr.passedIncidentIds)}
                        title={hasFrActivity ? 'Click to inspect passed tickets' : undefined}
                      >
                        {hasFrActivity ? fr.passed : <span className="weekly-na-text">N/A</span>}
                      </td>

                      {/* First Response: SLA Pass Rate this week */}
                      <td className="td-weekly-rate">
                        {hasFrActivity && fr.slaPassRate !== null ? (
                          <span className="weekly-rate-text">{fr.slaPassRate.toFixed(2)}%</span>
                        ) : (
                          <span className="weekly-na-text">N/A</span>
                        )}
                      </td>

                      {/* First Response: SLA Pass Rate as of last week */}
                      <td className="td-weekly-rate">
                        {frPrev !== null && frPrev !== undefined ? (
                          <span className="weekly-rate-text">{frPrev.toFixed(2)}%</span>
                        ) : (
                          <span className="weekly-na-text">N/A</span>
                        )}
                      </td>

                      {/* Resolution Time: Total */}
                      <td
                        className={`td-weekly-cell ${hasRtActivity ? 'cell-interactive' : ''}`}
                        onClick={() => hasRtActivity && handleClick(`${team} — Resolution Total`, rt.incidentIds)}
                        title={hasRtActivity ? 'Click to inspect incident tickets' : undefined}
                      >
                        {hasRtActivity ? rt.total : <span className="weekly-na-text">N/A</span>}
                      </td>

                      {/* Resolution Time: Failed */}
                      <td
                        className={`td-weekly-cell ${hasRtActivity && rt.failed > 0 ? 'td-weekly-failed-breach' : ''} ${hasRtActivity ? 'cell-interactive' : ''}`}
                        onClick={() => hasRtActivity && rt.failed > 0 && handleClick(`${team} — Resolution Failed`, rt.failedIncidentIds)}
                        title={hasRtActivity && rt.failed > 0 ? 'Click to inspect failed tickets' : undefined}
                      >
                        {hasRtActivity ? rt.failed : <span className="weekly-na-text">N/A</span>}
                      </td>

                      {/* Resolution Time: Passed */}
                      <td
                        className={`td-weekly-cell ${hasRtActivity ? 'cell-interactive' : ''}`}
                        onClick={() => hasRtActivity && handleClick(`${team} — Resolution Passed`, rt.passedIncidentIds)}
                        title={hasRtActivity ? 'Click to inspect passed tickets' : undefined}
                      >
                        {hasRtActivity ? rt.passed : <span className="weekly-na-text">N/A</span>}
                      </td>

                      {/* Resolution Time: SLA Pass Rate this week */}
                      <td className="td-weekly-rate">
                        {hasRtActivity && rt.slaPassRate !== null ? (
                          <span className="weekly-rate-text">{rt.slaPassRate.toFixed(2)}%</span>
                        ) : (
                          <span className="weekly-na-text">N/A</span>
                        )}
                      </td>

                      {/* Resolution Time: SLA Pass Rate as of last week */}
                      <td className="td-weekly-rate">
                        {rtPrev !== null && rtPrev !== undefined ? (
                          <span className="weekly-rate-text">{rtPrev.toFixed(2)}%</span>
                        ) : (
                          <span className="weekly-na-text">N/A</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* Total Row */}
                <tr className="weekly-total-row">
                  <td className="td-weekly-total-label">Total</td>

                  {/* First Response Totals: Yellow for counts, Coral for rates */}
                  <td
                    className="td-weekly-total-yellow cell-interactive"
                    onClick={() => handleClick('Total — First Response Total', frTotal.incidentIds)}
                    title="Click to view all First Response tickets"
                  >
                    {frTotal.total}
                  </td>
                  <td
                    className="td-weekly-total-yellow cell-interactive"
                    onClick={() => frTotal.failed > 0 && handleClick('Total — First Response Failed', frTotal.failedIncidentIds)}
                    title={frTotal.failed > 0 ? 'Click to view failed First Response tickets' : undefined}
                  >
                    {frTotal.failed}
                  </td>
                  <td
                    className="td-weekly-total-yellow cell-interactive"
                    onClick={() => handleClick('Total — First Response Passed', frTotal.passedIncidentIds)}
                    title="Click to view passed First Response tickets"
                  >
                    {frTotal.passed}
                  </td>
                  <td className="td-weekly-total-coral">
                    {frTotal.slaPassRate !== null ? `${frTotal.slaPassRate.toFixed(2)}%` : 'N/A'}
                  </td>
                  <td className="td-weekly-total-coral">
                    {data.previousWeek.firstResponseTotal !== null && data.previousWeek.firstResponseTotal !== undefined
                      ? `${data.previousWeek.firstResponseTotal.toFixed(2)}%`
                      : 'N/A'}
                  </td>

                  {/* Resolution Time Totals: Yellow for counts, Coral for rates */}
                  <td
                    className="td-weekly-total-yellow cell-interactive"
                    onClick={() => handleClick('Total — Resolution Total', rtTotal.incidentIds)}
                    title="Click to view all Resolution tickets"
                  >
                    {rtTotal.total}
                  </td>
                  <td
                    className="td-weekly-total-yellow cell-interactive"
                    onClick={() => rtTotal.failed > 0 && handleClick('Total — Resolution Failed', rtTotal.failedIncidentIds)}
                    title={rtTotal.failed > 0 ? 'Click to view failed Resolution tickets' : undefined}
                  >
                    {rtTotal.failed}
                  </td>
                  <td
                    className="td-weekly-total-yellow cell-interactive"
                    onClick={() => handleClick('Total — Resolution Passed', rtTotal.passedIncidentIds)}
                    title="Click to view passed Resolution tickets"
                  >
                    {rtTotal.passed}
                  </td>
                  <td className="td-weekly-total-coral">
                    {rtTotal.slaPassRate !== null ? `${rtTotal.slaPassRate.toFixed(2)}%` : 'N/A'}
                  </td>
                  <td className="td-weekly-total-coral">
                    {data.previousWeek.resolutionTimeTotal !== null && data.previousWeek.resolutionTimeTotal !== undefined
                      ? `${data.previousWeek.resolutionTimeTotal.toFixed(2)}%`
                      : 'N/A'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 2. Overdue Status Completion - Modern Tables (Same Output, Modern Way) */}
          <div className="weekly-overdue-section" style={{ marginTop: '28px' }}>
            <ModernOverdueStatusTable
              title="Resolution"
              accentColor="#059669"
              passed={resPassed}
              failed={resFailed}
              rate={resRate}
              passedIds={resPassedIds}
              failedIds={resFailedIds}
              onCellClick={handleClick}
            />
            <ModernOverdueStatusTable
              title="First Response"
              accentColor="#0284c7"
              passed={frCompPassed}
              failed={frCompFailed}
              rate={frCompRate}
              passedIds={frPassedIds}
              failedIds={frFailedIds}
              onCellClick={handleClick}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
