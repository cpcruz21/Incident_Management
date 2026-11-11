'use client';

import React, { memo, useRef, useState } from 'react';
import type { WeeklyReportData } from '@/types/sla';
import type { Incident } from '@/types/incident';
import { saveReport } from '@/lib/storage/report-storage';
import { persistServerWeeklyReport } from '@/lib/api/client';
import { toPublicWeeklyReport } from '@/lib/report/weekly-publication';
import { formatWeeklyReportRange } from '@/lib/report/weekly-period';
import { WeeklySLACount, WeeklySLASummary } from './WeeklySLASummary';
import { SLAMetricHeading } from './SLATableLabels';
import { ReportImageExport } from './ReportImageExport';
import { ReportDetailsStrip } from './ReportDetailsStrip';

interface SLAReportTableProps {
  data: WeeklyReportData;
  onCellClick?: (title: string, incidentIds: string[]) => void;
  routedIncidents?: Incident[];
  onSaveReport?: () => void;
  archiveId?: string;
  isPublicView?: boolean;
}

export const SLAReportTable = memo(function SLAReportTable({
  data,
  onCellClick,
  routedIncidents,
  onSaveReport,
  archiveId,
  isPublicView = false,
}: SLAReportTableProps) {
  const reportCardRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  const handlePublish = async () => {
    if (isPublicView) return;
    setPublishing(true);
    setSaveError('');
    try {
      const id = `weekly-${data.reportPeriod.toLowerCase().replace(/[^a-z0-9]/g, '-') || Date.now()}`;
      if (!await persistServerWeeklyReport({ id, title: data.reportTitle, period: data.reportPeriod, reportData: toPublicWeeklyReport(data) })) {
        throw new Error('Could not publish the weekly report. Check your session and try again.');
      }
      setPublished(true);
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('smac_report_updates');
        channel.postMessage({ type: 'report_published', reportType: 'weekly', id });
        channel.close();
      }
      setTimeout(() => setPublished(false), 4000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not publish the weekly report.');
    } finally { setPublishing(false); }
  };

  const handleSave = async () => {
    if (isPublicView) return;
    setSaving(true);
    setSaveError('');
    try {
      await saveReport({
        id: archiveId,
        type: 'weekly',
        title: data.reportTitle,
        period: data.reportPeriod,
        reportData: data,
        routedIncidents,
      });
      setIsSaved(true);
      onSaveReport?.();
      setTimeout(() => setIsSaved(false), 4000);
    } catch {
      setSaveError('Could not save the weekly report to the archive.');
    } finally {
      setSaving(false);
    }
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

  const frTotal = data.currentWeek.firstResponseTotal;
  const rtTotal = data.currentWeek.resolutionTimeTotal;
  const reportRange = formatWeeklyReportRange(data.reportPeriod || '');

  return (
    <div className="itsm-report-wrapper weekly-report-module" data-public-view={isPublicView}>
        <section className="weekly-module-header no-export" aria-labelledby="weekly-module-title">
          <div className="weekly-module-heading">
            <span className="weekly-module-icon" aria-hidden="true">📅</span>
            <div className="weekly-module-title-row">
              <h2 id="weekly-module-title">Weekly SLA Report</h2>
              <span className="weekly-module-period">{data.reportPeriod || formattedDate || 'Current week'}</span>
            </div>
          </div>
          {!isPublicView && <div className="weekly-module-actions">
            <button
              type="button"
              className={`itsm-save-btn ${isSaved ? 'is-saved' : ''}`}
              onClick={handleSave}
              title="Save report to the archive"
              disabled={saving || publishing}
            >
              {saving ? 'Saving...' : isSaved ? '✓ Saved' : '💾 Archive Report'}
            </button>
            <button type="button" className="admin-primary" onClick={handlePublish} disabled={saving || publishing}
              title="Publish weekly totals and request IDs to the dashboard">
              {publishing ? 'Publishing…' : published ? '✓ Published' : 'Publish to dashboard'}
            </button>
            {saveError && <span className="admin-error" role="alert">{saveError}</span>}
          </div>}
        </section>

      <ReportDetailsStrip {...reportRange} totalRecords={<WeeklySLACount count={frTotal.total} title="Total records" ids={frTotal.incidentIds} onOpen={onCellClick} />}>
        <ReportImageExport
          sources={[
            { panel: summaryRef, title: 'First Response & Resolution Time', filename: 'weekly-sla-summary.png' },
            { panel: reportCardRef, title: 'Weekly SLA by Team', filename: 'weekly-sla-by-team.png' },
          ]}
          dialogTitle="Save Weekly SLA images"
          period={data.reportPeriod}
        />
      </ReportDetailsStrip>
      <WeeklySLASummary data={data} summaryRef={summaryRef} onCellClick={onCellClick} />

      <div
        className="weekly-report-scroll"
        tabIndex={isPublicView ? undefined : 0}
        role={isPublicView ? undefined : 'region'}
        aria-label={isPublicView ? undefined : 'Weekly SLA report details'}
      >
      <div className="itsm-dashboard-canvas" id="sla-report-canvas">
        {isPublicView && <p className="weekly-table-hint">Scroll across to see all columns. Technician names stay in view.</p>}
        {/* ════ Printable / Exportable Weekly Report Card ════ */}
        <div ref={reportCardRef} className="weekly-report-card" id="weekly-closed-incident-report-card">
          {/* Header Banner */}
          {!isPublicView && <div className="weekly-report-banner">
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
          </div>}

          {/* 1. Closed Incident Weekly Report Table (Zero Scrollbars) */}
          <div
            className="weekly-table-responsive"
            tabIndex={isPublicView ? 0 : undefined}
            role={isPublicView ? 'region' : undefined}
            aria-label={isPublicView ? 'Weekly SLA table' : undefined}
          >
            <table className="weekly-incident-table" aria-label={isPublicView ? 'Weekly SLA results by technician' : undefined}>
              <colgroup><col className="weekly-team-column" /></colgroup>
              <colgroup><col /><col /><col /><col /><col /></colgroup>
              <colgroup><col /><col /><col /><col /><col /></colgroup>
              <thead>
                {/* Level 1: Group Headers */}
                <tr>
                  <th className="th-weekly-team" rowSpan={2} scope="col">
                    Technician
                  </th>
                  <th className="th-weekly-fr" colSpan={5} scope="colgroup">
                    <SLAMetricHeading metric="response" />
                  </th>
                  <th className="th-weekly-rt" colSpan={5} scope="colgroup">
                    <SLAMetricHeading metric="resolution" />
                  </th>
                </tr>

                {/* Level 2: Column Sub-Headers */}
                <tr className="tr-weekly-subcols">
                  {/* First Response Columns */}
                  <th scope="col">Total # of IRs</th>
                  <th className="th-sub-failed" scope="col">Failed</th>
                  <th className="th-sub-passed" scope="col">Passed</th>
                  <th scope="col" data-period="current">SLA Pass Rate<br />This week</th>
                  <th scope="col" data-period="previous">SLA Pass Rate<br />As of last week</th>

                  {/* Resolution Time Columns */}
                  <th scope="col">Total # of IRs</th>
                  <th className="th-sub-failed" scope="col">Failed</th>
                  <th className="th-sub-passed" scope="col">Passed</th>
                  <th scope="col" data-period="current">SLA Pass Rate<br />This week</th>
                  <th scope="col" data-period="previous">SLA Pass Rate<br />As of last week</th>
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
                      {/* Team name */}
                      <th className="td-weekly-team" scope="row">{team}</th>

                      {/* First Response: Total */}
                      <td className="td-weekly-cell">
                        {hasFrActivity ? <WeeklySLACount count={fr.total} title={`${team} — First Response Total`} ids={fr.incidentIds} onOpen={onCellClick} /> : <span className="weekly-na-text">N/A</span>}
                      </td>

                      {/* First Response: Failed */}
                      <td className={`td-weekly-cell ${hasFrActivity && fr.failed > 0 ? 'td-weekly-failed-breach' : ''}`}>
                        {hasFrActivity ? <WeeklySLACount count={fr.failed} title={`${team} — FR Failed`} ids={fr.failedIncidentIds} onOpen={onCellClick} failed /> : <span className="weekly-na-text">N/A</span>}
                      </td>

                      {/* First Response: Passed */}
                      <td className="td-weekly-cell">
                        {hasFrActivity ? <WeeklySLACount count={fr.passed} title={`${team} — First Response Passed`} ids={fr.passedIncidentIds} onOpen={onCellClick} /> : <span className="weekly-na-text">N/A</span>}
                      </td>

                      {/* First Response: SLA Pass Rate this week */}
                      <td data-period="current">
                        {hasFrActivity && fr.slaPassRate !== null ? (
                          <span className="weekly-rate-text">{fr.slaPassRate.toFixed(2)}%</span>
                        ) : (
                          <span className="weekly-na-text">N/A</span>
                        )}
                      </td>

                      {/* First Response: SLA Pass Rate as of last week */}
                      <td data-period="previous">
                        {frPrev !== null && frPrev !== undefined ? (
                          <span className="weekly-rate-text">{frPrev.toFixed(2)}%</span>
                        ) : (
                          <span className="weekly-na-text">N/A</span>
                        )}
                      </td>

                      {/* Resolution Time: Total */}
                      <td className="td-weekly-cell">
                        {hasRtActivity ? <WeeklySLACount count={rt.total} title={`${team} — Resolution Time Total`} ids={rt.incidentIds} onOpen={onCellClick} /> : <span className="weekly-na-text">N/A</span>}
                      </td>

                      {/* Resolution Time: Failed */}
                      <td className={`td-weekly-cell ${hasRtActivity && rt.failed > 0 ? 'td-weekly-failed-breach' : ''}`}>
                        {hasRtActivity ? <WeeklySLACount count={rt.failed} title={`${team} — RT Failed`} ids={rt.failedIncidentIds} onOpen={onCellClick} failed /> : <span className="weekly-na-text">N/A</span>}
                      </td>

                      {/* Resolution Time: Passed */}
                      <td className="td-weekly-cell">
                        {hasRtActivity ? <WeeklySLACount count={rt.passed} title={`${team} — Resolution Time Passed`} ids={rt.passedIncidentIds} onOpen={onCellClick} /> : <span className="weekly-na-text">N/A</span>}
                      </td>

                      {/* Resolution Time: SLA Pass Rate this week */}
                      <td data-period="current">
                        {hasRtActivity && rt.slaPassRate !== null ? (
                          <span className="weekly-rate-text">{rt.slaPassRate.toFixed(2)}%</span>
                        ) : (
                          <span className="weekly-na-text">N/A</span>
                        )}
                      </td>

                      {/* Resolution Time: SLA Pass Rate as of last week */}
                      <td data-period="previous">
                        {rtPrev !== null && rtPrev !== undefined ? (
                          <span className="weekly-rate-text">{rtPrev.toFixed(2)}%</span>
                        ) : (
                          <span className="weekly-na-text">N/A</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

              </tbody>
              <tfoot>
                <tr className="weekly-total-row">
                  <th className="td-weekly-total-label" scope="row">Total</th>

                  {/* First Response Totals */}
                  <td><WeeklySLACount count={frTotal.total} title="Total — First Response Total" ids={frTotal.incidentIds} onOpen={onCellClick} /></td>
                  <td><WeeklySLACount count={frTotal.failed} title="Total — FR Failed" ids={frTotal.failedIncidentIds} onOpen={onCellClick} failed /></td>
                  <td><WeeklySLACount count={frTotal.passed} title="Total — First Response Passed" ids={frTotal.passedIncidentIds} onOpen={onCellClick} /></td>
                  <td data-period="current">
                    {frTotal.slaPassRate !== null ? `${frTotal.slaPassRate.toFixed(2)}%` : 'N/A'}
                  </td>
                  <td data-period="previous">
                    {data.previousWeek.firstResponseTotal !== null && data.previousWeek.firstResponseTotal !== undefined
                      ? `${data.previousWeek.firstResponseTotal.toFixed(2)}%`
                      : 'N/A'}
                  </td>

                  {/* Resolution Time Totals */}
                  <td><WeeklySLACount count={rtTotal.total} title="Total — Resolution Time Total" ids={rtTotal.incidentIds} onOpen={onCellClick} /></td>
                  <td><WeeklySLACount count={rtTotal.failed} title="Total — RT Failed" ids={rtTotal.failedIncidentIds} onOpen={onCellClick} failed /></td>
                  <td><WeeklySLACount count={rtTotal.passed} title="Total — Resolution Time Passed" ids={rtTotal.passedIncidentIds} onOpen={onCellClick} /></td>
                  <td data-period="current">
                    {rtTotal.slaPassRate !== null ? `${rtTotal.slaPassRate.toFixed(2)}%` : 'N/A'}
                  </td>
                  <td data-period="previous">
                    {data.previousWeek.resolutionTimeTotal !== null && data.previousWeek.resolutionTimeTotal !== undefined
                      ? `${data.previousWeek.resolutionTimeTotal.toFixed(2)}%`
                      : 'N/A'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>


        </div>
      </div>
      </div>
    </div>
  );
});
