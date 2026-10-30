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

          {/* 2. Overdue Status Completion Tables (Matching User Reference Image 2) */}
          <div className="weekly-overdue-section">
            {/* Resolution Table */}
            <div className="weekly-overdue-block">
              <h3 className="weekly-overdue-title">Resolution</h3>
              <table className="weekly-overdue-table">
                <tbody>
                  <tr>
                    <td className="weekly-overdue-label" rowSpan={2}>
                      Overdue Status
                    </td>
                    <td className="weekly-overdue-status">PASSED</td>
                    <td
                      className="weekly-overdue-count cell-interactive"
                      onClick={() => handleClick('Resolution Passed', resPassedIds)}
                      title="Click to view passed resolution tickets"
                    >
                      {resPassed}
                    </td>
                    <td className="weekly-overdue-rate" rowSpan={2}>
                      {resRate !== null && resRate !== undefined ? `${resRate.toFixed(2)}%` : 'N/A'}
                    </td>
                  </tr>
                  <tr>
                    <td className="weekly-overdue-status">FAILED</td>
                    <td
                      className="weekly-overdue-count cell-interactive"
                      onClick={() => handleClick('Resolution Failed', resFailedIds)}
                      title="Click to view failed resolution tickets"
                    >
                      {resFailed}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* First Response Table */}
            <div className="weekly-overdue-block">
              <h3 className="weekly-overdue-title">First Response</h3>
              <table className="weekly-overdue-table">
                <tbody>
                  <tr>
                    <td className="weekly-overdue-label" rowSpan={2}>
                      Overdue Status
                    </td>
                    <td className="weekly-overdue-status">PASSED</td>
                    <td
                      className="weekly-overdue-count cell-interactive"
                      onClick={() => handleClick('First Response Passed', frPassedIds)}
                      title="Click to view passed first response tickets"
                    >
                      {frCompPassed}
                    </td>
                    <td className="weekly-overdue-rate" rowSpan={2}>
                      {frCompRate !== null && frCompRate !== undefined ? `${frCompRate.toFixed(2)}%` : 'N/A'}
                    </td>
                  </tr>
                  <tr>
                    <td className="weekly-overdue-status">FAILED</td>
                    <td
                      className="weekly-overdue-count cell-interactive"
                      onClick={() => handleClick('First Response Failed', frFailedIds)}
                      title="Click to view failed first response tickets"
                    >
                      {frCompFailed}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Corporate Footer (matching original document) */}
            <div className="weekly-company-footer">
              <span className="weekly-company-name" style={{ color: '#0070c0', fontWeight: 700 }}>
                Equitable Computer Services, Inc.
              </span>
              <span className="weekly-footer-date">Reporting Date: {formattedDate || 'Current Week'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
