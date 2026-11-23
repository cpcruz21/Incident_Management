'use client';

import React, { memo, useRef, useState } from 'react';
import type { WeeklyReportData } from '@/types/sla';
import type { Incident } from '@/types/incident';
import { saveReport, type StoredReport } from '@/lib/storage/report-storage';
import { formatWeeklyReportRange } from '@/lib/report/weekly-period';
import { ArchiveReportButton } from './ArchiveReportButton';
import { WeeklySLACount, WeeklySLASummary } from './WeeklySLASummary';
import { SLAMetricHeading } from './SLATableLabels';
import { ReportDetailsStrip } from './ReportDetailsStrip';
import { ReportImageExport } from './ReportImageExport';
import { ReportTicketActions } from './ReportTicketActions';
import { ReportResultHeader } from './ReportResultHeader';
import { SLAObjectives } from './SLAObjectives';
import type { ReportTicketAction } from '@/lib/report/ticket-edits';

interface SLAReportTableProps {
  data: WeeklyReportData;
  headingLevel?: 1 | 2;
  onCellClick?: (title: string, incidentIds: string[]) => void;
  routedIncidents?: Incident[];
  onSaveReport?: (report: StoredReport) => void;
  archiveId?: string;
  archiveSavedAt?: string;
  isPublicView?: boolean;
  periodControl?: React.ReactNode;
  onEditTicket?: (action: ReportTicketAction, requestId: string) => void;
  exportAction?: React.ReactNode;
}

export const SLAReportTable = memo(function SLAReportTable({
  data,
  headingLevel,
  onCellClick,
  routedIncidents,
  onSaveReport,
  archiveId,
  archiveSavedAt,
  isPublicView = false,
  periodControl,
  onEditTicket,
  exportAction,
}: SLAReportTableProps) {
  const reportCardRef = useRef<HTMLDivElement>(null);
  const objectivesRef = useRef<HTMLDivElement>(null);
  const responseSummaryRef = useRef<HTMLElement>(null);
  const resolutionSummaryRef = useRef<HTMLElement>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const handleSave = async () => {
    if (isPublicView || saving) return;
    setSaving(true);
    setIsSaved(false);
    setSaveError('');
    try {
      const report = await saveReport({
        id: archiveId,
        expectedSavedAt: archiveSavedAt,
        weeklyPublication: true,
        type: 'weekly',
        title: data.reportTitle,
        period: data.reportPeriod,
        reportData: data,
        routedIncidents,
      });
      onSaveReport?.(report);
      if (report.publication !== 'updated') {
        setSaveError('The report was archived, but the live dashboard could not be updated. Archive it again to retry.');
        return;
      }
      setIsSaved(true);
      try {
        const channel = new BroadcastChannel('smac_report_updates');
        channel.postMessage({ type: 'report_published', reportType: 'weekly', id: report.id });
        channel.close();
      } catch { /* Other dashboard sessions refresh on focus or at their next poll. */ }
      setTimeout(() => setIsSaved(false), 4000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save the weekly report to the archive.');
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
  const handleTicketEdit = (action: ReportTicketAction, id: string) => {
    onEditTicket?.(action, id);
    setIsSaved(false);
  };
  const reportRange = formatWeeklyReportRange(data.reportPeriod || '');
  const period = data.reportPeriod || formattedDate || 'Current week';
  return (
    <div className="itsm-report-wrapper weekly-report-module" data-public-view={isPublicView}>
      <ReportResultHeader
        className="weekly-module-header"
        title="Weekly SLA Report"
        icon="📅"
        headingLevel={headingLevel ?? (isPublicView ? 2 : 1)}
        periodControl={isPublicView ? (periodControl ?? <span className="weekly-module-period">{period}</span>) : undefined}
        actions={!isPublicView && (
          <>
            <ArchiveReportButton onArchive={handleSave} saving={saving} archived={isSaved} />
            {exportAction}
          </>
        )}
      />

      {saveError && <p className="admin-error" role="alert">{saveError}</p>}

      <ReportDetailsStrip {...reportRange} totalRecords={
        <WeeklySLACount count={frTotal.total} title="Total records" ids={frTotal.incidentIds} onOpen={onCellClick} />
      }>
        <ReportImageExport
          sources={[
            ...(isPublicView ? [
              { panel: objectivesRef, title: 'Weekly SLA Objectives', filename: 'weekly-sla-objectives.png', cropToPanel: true },
            ] : []),
            { panel: responseSummaryRef, title: 'First Response', filename: 'weekly-first-response.png' },
            { panel: resolutionSummaryRef, title: 'Resolution Time', filename: 'weekly-resolution-time.png' },
            { panel: reportCardRef, title: 'Weekly SLA by Team', filename: 'weekly-sla-by-team.png' },
          ]}
          dialogTitle="Save Weekly SLA images"
          period={period}
        />
      </ReportDetailsStrip>

      <WeeklySLASummary
        data={data}
        responseRef={responseSummaryRef}
        resolutionRef={resolutionSummaryRef}
        onCellClick={onCellClick}
      />

      {!isPublicView && onEditTicket && routedIncidents && (
        <ReportTicketActions
          incidents={routedIncidents}
          failedIds={frTotal.failedIncidentIds}
          reportName="weekly report"
          busy={saving}
          onApprove={(id) => handleTicketEdit('accept-first-response', id)}
          onDelete={(id) => handleTicketEdit('delete', id)}
        />
      )}

      <div className="weekly-report-scroll">
      <div className="itsm-dashboard-canvas" id="sla-report-canvas">
        {isPublicView && <p className="weekly-table-hint">Scroll across to see all columns. Technician names stay in view.</p>}
        <div ref={reportCardRef} className="weekly-report-card" id="weekly-closed-incident-report-card">
          {!isPublicView && <h2 className="weekly-admin-table-title">SLA by technician</h2>}
          <div
            className="weekly-table-responsive"
            tabIndex={0}
            role="region"
            aria-label="Weekly SLA table"
          >
            <table className="weekly-incident-table" aria-label="Weekly SLA results by technician">
              <colgroup><col className="weekly-team-column" /></colgroup>
              <colgroup><col /><col /><col /><col /><col /></colgroup>
              <colgroup><col /><col /><col /><col /><col /></colgroup>
              <thead>
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
                <tr className="tr-weekly-subcols">
                  <th scope="col">Total # of IRs</th>
                  <th className="th-sub-failed" scope="col">Failed</th>
                  <th className="th-sub-passed" scope="col">Passed</th>
                  <th scope="col" data-period="current">SLA Pass Rate<br />This week</th>
                  <th scope="col" data-period="previous">SLA Pass Rate<br />As of last week</th>
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
                      <th className="td-weekly-team" scope="row">{team}</th>
                      <td className="td-weekly-cell">
                        {hasFrActivity ? <WeeklySLACount count={fr.total} title={`${team} — First Response Total`} ids={fr.incidentIds} onOpen={onCellClick} /> : <span className="weekly-na-text">N/A</span>}
                      </td>
                      <td className={`td-weekly-cell ${hasFrActivity && fr.failed > 0 ? 'td-weekly-failed-breach' : ''}`}>
                        {hasFrActivity ? <WeeklySLACount count={fr.failed} title={`${team} — FR Failed`} ids={fr.failedIncidentIds} onOpen={onCellClick} failed /> : <span className="weekly-na-text">N/A</span>}
                      </td>
                      <td className="td-weekly-cell" data-sla-passed={fr.passed > 0}>
                        {hasFrActivity ? <WeeklySLACount count={fr.passed} title={`${team} — First Response Passed`} ids={fr.passedIncidentIds} onOpen={onCellClick} /> : <span className="weekly-na-text">N/A</span>}
                      </td>
                      <td data-period="current">
                        {hasFrActivity && fr.slaPassRate !== null ? (
                          <span className="weekly-rate-text">{fr.slaPassRate.toFixed(2)}%</span>
                        ) : (
                          <span className="weekly-na-text">N/A</span>
                        )}
                      </td>
                      <td data-period="previous">
                        {frPrev !== null && frPrev !== undefined ? (
                          <span className="weekly-rate-text">{frPrev.toFixed(2)}%</span>
                        ) : (
                          <span className="weekly-na-text">N/A</span>
                        )}
                      </td>
                      <td className="td-weekly-cell">
                        {hasRtActivity ? <WeeklySLACount count={rt.total} title={`${team} — Resolution Time Total`} ids={rt.incidentIds} onOpen={onCellClick} /> : <span className="weekly-na-text">N/A</span>}
                      </td>
                      <td className={`td-weekly-cell ${hasRtActivity && rt.failed > 0 ? 'td-weekly-failed-breach' : ''}`}>
                        {hasRtActivity ? <WeeklySLACount count={rt.failed} title={`${team} — RT Failed`} ids={rt.failedIncidentIds} onOpen={onCellClick} failed /> : <span className="weekly-na-text">N/A</span>}
                      </td>
                      <td className="td-weekly-cell" data-sla-passed={rt.passed > 0}>
                        {hasRtActivity ? <WeeklySLACount count={rt.passed} title={`${team} — Resolution Time Passed`} ids={rt.passedIncidentIds} onOpen={onCellClick} /> : <span className="weekly-na-text">N/A</span>}
                      </td>
                      <td data-period="current">
                        {hasRtActivity && rt.slaPassRate !== null ? (
                          <span className="weekly-rate-text">{rt.slaPassRate.toFixed(2)}%</span>
                        ) : (
                          <span className="weekly-na-text">N/A</span>
                        )}
                      </td>
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
                  <td><WeeklySLACount count={frTotal.total} title="Total — First Response Total" ids={frTotal.incidentIds} onOpen={onCellClick} /></td>
                  <td><WeeklySLACount count={frTotal.failed} title="Total — FR Failed" ids={frTotal.failedIncidentIds} onOpen={onCellClick} failed /></td>
                  <td data-sla-passed={frTotal.passed > 0}><WeeklySLACount count={frTotal.passed} title="Total — First Response Passed" ids={frTotal.passedIncidentIds} onOpen={onCellClick} /></td>
                  <td data-period="current">
                    {frTotal.slaPassRate != null ? `${frTotal.slaPassRate.toFixed(2)}%` : 'N/A'}
                  </td>
                  <td data-period="previous">
                    {data.previousWeek.firstResponseTotal !== null && data.previousWeek.firstResponseTotal !== undefined
                      ? `${data.previousWeek.firstResponseTotal.toFixed(2)}%`
                      : 'N/A'}
                  </td>
                  <td><WeeklySLACount count={rtTotal.total} title="Total — Resolution Time Total" ids={rtTotal.incidentIds} onOpen={onCellClick} /></td>
                  <td><WeeklySLACount count={rtTotal.failed} title="Total — RT Failed" ids={rtTotal.failedIncidentIds} onOpen={onCellClick} failed /></td>
                  <td data-sla-passed={rtTotal.passed > 0}><WeeklySLACount count={rtTotal.passed} title="Total — Resolution Time Passed" ids={rtTotal.passedIncidentIds} onOpen={onCellClick} /></td>
                  <td data-period="current">
                    {rtTotal.slaPassRate != null ? `${rtTotal.slaPassRate.toFixed(2)}%` : 'N/A'}
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

      {isPublicView && <SLAObjectives label="Weekly SLA objectives" panelRef={objectivesRef} />}
    </div>
  );
});
