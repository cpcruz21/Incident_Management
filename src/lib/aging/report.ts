import type { Incident } from '@/types/incident';
import type { AgingReportData, PreviousWeekAging } from '@/types/aging';
import { REPORT_TEAMS } from '@/lib/routing/routing-engine';
import { extractAgingFromStored, getPriorAgingReports, getStoredReports } from '@/lib/storage/report-storage';
import { buildRemarksTableData, calculateAgingDistribution, calculateAgingSLA, filterOpenIncidents, toValidDate } from './calculator';
import { getReportTeamOrder } from '@/lib/report/teams';
import { carryForwardAgingRemarks, createAgingReportId } from './snapshot';

export async function loadPreviousAgingReport(beforeGeneratedAt?: Date | string): Promise<PreviousWeekAging> {
  const reports = getPriorAgingReports(await getStoredReports(), beforeGeneratedAt);
  return reports.length ? extractAgingFromStored(reports[0]) : {
    teamTotals: Object.fromEntries(REPORT_TEAMS.map(team => [team, null])),
    grandTotal: null,
  };
}

/** Creation always snapshots the last stored report's CURRENT results as last week. */
export async function createAgingReport(
  incidents: Incident[],
  reportPeriod: string,
  previousWeek?: PreviousWeekAging,
  asOf: Date = new Date()
): Promise<AgingReportData> {
  const history = getPriorAgingReports(await getStoredReports());
  const baseline = previousWeek ?? (history.length ? extractAgingFromStored(history[0]) : {
    teamTotals: Object.fromEntries(REPORT_TEAMS.map(team => [team, null])),
    grandTotal: null,
  });
  const report = calculateAgingReport(incidents, reportPeriod, baseline, asOf);
  return {
    ...report,
    reportId: createAgingReportId(),
    remarksTable: carryForwardAgingRemarks(report.remarksTable!, history.map(item => item.reportData as AgingReportData)),
  };
}

/** Reconcile an entire imported snapshot against one explicit report timestamp. */
export function calculateAgingReport(
  incidents: Incident[],
  reportPeriod: string,
  previousWeek: PreviousWeekAging,
  asOf: Date = new Date()
): AgingReportData {
  const referenceDate = toValidDate(asOf);
  if (!referenceDate) throw new Error('Choose a valid Aging as of date and time.');
  const prepared = incidents.map(incident => ({
    ...incident,
    createdTime: toValidDate(incident.createdTime) ?? undefined,
    respondedDate: toValidDate(incident.respondedDate) ?? undefined,
    completedTime: toValidDate(incident.completedTime) ?? undefined,
  }));
  const open = filterOpenIncidents(prepared);
  const invalid = open.filter(incident => !incident.createdTime);
  if (invalid.length) throw new Error(`Missing or invalid Created Time for ${invalid.map(incident => incident.requestId).join(', ')}. Correct the imported data before generating an Aging report.`);
  const future = open.filter(incident => incident.createdTime! > referenceDate);
  if (future.length) throw new Error(`Aging as of is earlier than the Created Time for ${future.map(incident => incident.requestId).join(', ')}. Check the report date or imported dates.`);
  const seen = new Set<string>();
  for (const incident of prepared) {
    const id = incident.requestId.trim().toLowerCase();
    if (seen.has(id)) throw new Error(`Duplicate Request ID ${incident.requestId} in the import. Remove duplicate rows before generating the report.`);
    seen.add(id);
  }
  const teamOrder = getReportTeamOrder(open, REPORT_TEAMS);
  const { rows: slaRows, totals: slaTotals } = calculateAgingSLA(open, teamOrder, referenceDate);
  const agingRows = calculateAgingDistribution(open, teamOrder, referenceDate);
  return {
    reportTitle: 'Aging Incident Report',
    reportPeriod: reportPeriod || `Week of ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
    generatedAt: new Date(),
    asOf: referenceDate,
    slaRows,
    slaTotals,
    agingRows,
    agingGrandTotal: agingRows.reduce((sum, row) => sum + row.totalAging, 0),
    previousWeek,
    remarksTable: buildRemarksTableData(prepared, referenceDate, reportPeriod),
    teamOrder,
  };
}
