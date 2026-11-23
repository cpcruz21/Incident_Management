import type { Incident } from '@/types/incident';
import type { TeamSLAResult } from '@/types/sla';
import type {
  MonthlyReportData,
  MonthlyKPI,
  MonthlyTechnicianSLA,
  RootCauseRow,
} from '@/types/monthly';
import { generateMonthlyRemarks } from './remarks';
import { evaluateFirstResponseOverdue, evaluateResolutionOverdue } from '@/lib/sla/calculator';
import { getImportedSLAStatus } from '@/lib/sla/status';
import { isCreatedOutsideOfficeHours, toValidDate } from '@/lib/aging/calculator';
import { applyReportTicketEdit, findAcceptableFRCandidate as findReportCandidate } from '@/lib/report/ticket-edits';
import { getImportedTechnician, getTechnician } from './technician';
import { isMonthlyClosedTicket } from './ticket-status';

export { getTechnician } from './technician';

export const MONTHLY_DEFAULT_TECHNICIANS = [
  'ECS HRAD',
  'ECS ISS Binondo',
  'ECS ISS MT',
  'ECS SDS',
  'ECS ISMS Support',
  'ECS PSD',
];

const KPI_TARGET = 85; // 85% threshold


export function isRawFirstResponseOverdue(inc: Incident): boolean {
  return getImportedSLAStatus(inc, 'firstResponse') ?? Boolean(inc.firstResponseOverdue);
}

export function isFirstResponseFailed(inc: Incident, referenceDate?: Date): boolean {
  if (inc.acceptableFirstResponseApproval) return false;

  // If non-ISS and created outside office hours / weekend -> excused (acceptable / NOT failed)
  const iss = isISS24x7(inc);
  if (!iss && isCreatedOutsideOfficeHours(inc)) {
    return false;
  }

  return getImportedSLAStatus(inc, 'firstResponse') ?? (
    inc.firstResponseOverdue || evaluateFirstResponseOverdue(inc, iss ? 'ECS ISS' : getTechnician(inc), referenceDate)
  );
}

export function isResolutionFailed(inc: Incident): boolean {
  const completed = toValidDate(inc.completedTime);
  return getImportedSLAStatus(inc, 'resolution') ?? (
    inc.resolutionOverdue || Boolean(completed && evaluateResolutionOverdue(inc, completed))
  );
}


export function filterClosedTickets(incidents: Incident[]): Incident[] {
  return incidents.filter(isMonthlyClosedTicket);
}

/**
 * Determine whether a given technician is an ISS 24/7 team.
 * Exception: ISS teams (ISS Binondo, ECS ISS MT / ISS Makati) operate 24/7
 * and do NOT get the after-hours / weekend exception.
 */
export function isISS24x7(inc: Incident): boolean {
  const team = (inc.assignedTeam || inc.sourceTeam || inc.department || '').toLowerCase().trim();
  const tech = (
    (typeof inc.rawData?.['Technician'] === 'string' ? inc.rawData['Technician'] : '') ||
    (typeof inc.rawData?.['technician'] === 'string' ? inc.rawData['technician'] : '') ||
    inc.sourceTeam ||
    ''
  ).toLowerCase().trim();
  const dept = (
    (typeof inc.rawData?.['Department'] === 'string' ? inc.rawData['Department'] : '') ||
    (typeof inc.rawData?.['department'] === 'string' ? inc.rawData['department'] : '') ||
    inc.department ||
    ''
  ).toLowerCase().trim();

  return (
    team === 'ecs iss' ||
    team.includes('iss') ||
    team.includes('binondo') ||
    team.includes('makati') ||
    tech.includes('iss') ||
    tech.includes('binondo') ||
    tech.includes('makati') ||
    dept.includes('iss binondo') ||
    dept.includes('iss makati') ||
    dept.includes('ecs iss')
  );
}
export { isCreatedOutsideOfficeHours };

/**
 * Filter incidents that have acceptable first response.
 *
 * In the monthly SLA report, "Acceptable First Response" lists ONLY the incidents
 * that LAPSED (raw First Response Overdue Status = TRUE), BUT were excused and accepted
 * because they were filed beyond office hours (before 8:30 AM / after 5:30 PM, or on weekends)
 * for all departments EXCEPT ISS Binondo and ISS Makati (which operate 24/7),
 * or were explicitly verified and accepted by an administrator.
 */
export function filterAcceptableFirstResponse(incidents: Incident[]): Incident[] {
  return incidents.filter((inc) => {
    if (inc.acceptableFirstResponseApproval) return true;

    if (!isRawFirstResponseOverdue(inc)) return false;

    if (isISS24x7(inc)) return false;

    // 3. For all other departments: only accepted if created outside office hours / weekend
    return isCreatedOutsideOfficeHours(inc);
  });
}

export function findAcceptableFRCandidate(incidents: Incident[], requestId: string, referenceDate?: Date): Incident {
  return findReportCandidate(incidents, requestId, (incident) => isFirstResponseFailed(incident, referenceDate),
    (incident) => filterAcceptableFirstResponse([incident]).length > 0);
}

export function approveAcceptableFR(
  incidents: Incident[],
  requestId: string,
  approvedBy: string,
  referenceDate?: Date
): Incident[] {
  const candidate = findAcceptableFRCandidate(incidents, requestId, referenceDate);
  const approval = { approvedBy, approvedAt: new Date().toISOString() };
  return applyReportTicketEdit(incidents, { requestId: candidate.requestId, approval });
}

function groupByTechnician(incidents: Incident[]): Map<string, Incident[]> {
  const groups = new Map<string, Incident[]>();
  for (const inc of incidents) {
    const tech = getTechnician(inc);
    const group = groups.get(tech);
    if (group) group.push(inc);
    else groups.set(tech, [inc]);
  }
  return groups;
}

function getTechnicianOrder(incidents: Incident[], preferred = MONTHLY_DEFAULT_TECHNICIANS): string[] {
  const found = new Set<string>();
  for (const inc of incidents) {
    const t = getTechnician(inc);
    if (t) found.add(t);
  }

  const result: string[] = [];
  for (const p of preferred) {
    if (found.has(p)) {
      result.push(p);
      found.delete(p);
    }
  }
  found.forEach((r) => {
    result.push(r);
  });

  return result.length > 0 ? result : preferred;
}

function buildTechnicianSLA(
  allIncidents: Incident[],
  closedIncidents: Incident[],
  technicians: string[],
  referenceDate: Date
): { rows: MonthlyTechnicianSLA[]; totals: MonthlyTechnicianSLA } {
  const frGroups = groupByTechnician(allIncidents);
  const rtGroups = groupByTechnician(closedIncidents);

  const rows: MonthlyTechnicianSLA[] = [];

  for (const tech of technicians) {
    const frInc = frGroups.get(tech) || [];
    const rtInc = rtGroups.get(tech) || [];

    const frFailedIds: string[] = [];
    const frPassedIds: string[] = [];
    const rtFailedIds: string[] = [];
    const rtPassedIds: string[] = [];
    for (const incident of frInc) {
      const ids = isFirstResponseFailed(incident, referenceDate) ? frFailedIds : frPassedIds;
      ids.push(incident.requestId);
    }
    for (const incident of rtInc) {
      const ids = isResolutionFailed(incident) ? rtFailedIds : rtPassedIds;
      ids.push(incident.requestId);
    }

    rows.push({
      technician: tech,
      frTotal: frInc.length,
      frFailed: frFailedIds.length,
      frPassed: frPassedIds.length,
      frPassRate: frInc.length > 0 ? (frPassedIds.length / frInc.length) * 100 : null,
      frFailedIds,
      frPassedIds,
      frTotalIds: frInc.map((i) => i.requestId),
      rtTotal: rtInc.length,
      rtFailed: rtFailedIds.length,
      rtPassed: rtPassedIds.length,
      rtPassRate: rtInc.length > 0 ? (rtPassedIds.length / rtInc.length) * 100 : null,
      rtFailedIds,
      rtPassedIds,
      rtTotalIds: rtInc.map((i) => i.requestId),
    });
  }

  const totalFrTotal = rows.reduce((s, r) => s + r.frTotal, 0);
  const totalFrFailed = rows.reduce((s, r) => s + r.frFailed, 0);
  const totalFrPassed = rows.reduce((s, r) => s + r.frPassed, 0);
  const totalRtTotal = rows.reduce((s, r) => s + r.rtTotal, 0);
  const totalRtFailed = rows.reduce((s, r) => s + r.rtFailed, 0);
  const totalRtPassed = rows.reduce((s, r) => s + r.rtPassed, 0);

  const totals: MonthlyTechnicianSLA = {
    technician: 'Total',
    frTotal: totalFrTotal,
    frFailed: totalFrFailed,
    frPassed: totalFrPassed,
    frPassRate: totalFrTotal > 0 ? (totalFrPassed / totalFrTotal) * 100 : null,
    frFailedIds: rows.flatMap((r) => r.frFailedIds),
    frPassedIds: rows.flatMap((r) => r.frPassedIds),
    frTotalIds: rows.flatMap((r) => r.frTotalIds),
    rtTotal: totalRtTotal,
    rtFailed: totalRtFailed,
    rtPassed: totalRtPassed,
    rtPassRate: totalRtTotal > 0 ? (totalRtPassed / totalRtTotal) * 100 : null,
    rtFailedIds: rows.flatMap((r) => r.rtFailedIds),
    rtPassedIds: rows.flatMap((r) => r.rtPassedIds),
    rtTotalIds: rows.flatMap((r) => r.rtTotalIds),
  };

  return { rows, totals };
}

function buildKPIs(totals: MonthlyTechnicianSLA): MonthlyKPI[] {
  return [
    {
      label: 'Target Response Time',
      targetPercent: KPI_TARGET,
      countOfPassed: totals.frPassed,
      totalIRs: totals.frTotal,
      percentageResult: totals.frPassRate ?? 0,
    },
    {
      label: 'Target Resolution Time',
      targetPercent: KPI_TARGET,
      countOfPassed: totals.rtPassed,
      totalIRs: totals.rtTotal,
      percentageResult: totals.rtPassRate ?? 0,
    },
  ];
}

function buildRootCauses(incidents: Incident[]): RootCauseRow[] {
  const map = new Map<string, string[]>();

  for (const inc of incidents) {
    let rootCause = '';
    if (inc.rawData) {
      for (const [key, val] of Object.entries(inc.rawData)) {
        if (/identified\s*root\s*cause/i.test(key) || /root\s*cause\s*type/i.test(key)) {
          const v = String(val || '').trim();
          if (v && v !== 'undefined' && v !== 'null') {
            rootCause = v;
            break;
          }
        }
      }
    }
    if (!rootCause) rootCause = 'Not Specified';

    if (!map.has(rootCause)) map.set(rootCause, []);
    map.get(rootCause)!.push(inc.requestId);
  }

  return Array.from(map.entries())
    .map(([rootCause, incidentIds]) => ({ rootCause, count: incidentIds.length, incidentIds }))
    .sort((a, b) => b.count - a.count);
}


function toTeamSLAResult(row: MonthlyTechnicianSLA, metric: 'fr' | 'rt'): TeamSLAResult {
  return {
    teamName: row.technician,
    total: row[`${metric}Total`],
    failed: row[`${metric}Failed`],
    passed: row[`${metric}Passed`],
    slaPassRate: row[`${metric}PassRate`],
    incidentIds: row[`${metric}TotalIds`],
    failedIncidentIds: row[`${metric}FailedIds`],
    passedIncidentIds: row[`${metric}PassedIds`],
  };
}

export function calculateMonthlyReport(
  incidents: Incident[],
  reportPeriod: string,
  teamOrder?: string[],
  referenceDate = new Date()
): MonthlyReportData {
  const technicians = teamOrder
    ? Array.from(new Set([...teamOrder, ...getTechnicianOrder(incidents, [])]))
    : getTechnicianOrder(incidents);
  const closedTickets = filterClosedTickets(incidents);

  const { rows, totals } = buildTechnicianSLA(incidents, closedTickets, technicians, referenceDate);
  const kpis = buildKPIs(totals);
  const rootCauses = buildRootCauses(closedTickets);
  const remarks = generateMonthlyRemarks(kpis, rows, totals);

  return {
    reportTitle: 'Monthly Overall Ticket Report',
    reportPeriod,
    generatedAt: referenceDate,
    allTickets: incidents,
    closedTickets,
    kpis,
    technicianSLA: rows,
    technicianTotals: totals,
    rootCauses,
    slaReport: {
      firstResponse: rows.map((row) => toTeamSLAResult(row, 'fr')),
      resolutionTime: rows.map((row) => toTeamSLAResult(row, 'rt')),
      firstResponseTotal: toTeamSLAResult(totals, 'fr'),
      resolutionTimeTotal: toTeamSLAResult(totals, 'rt'),
    },
    remarks,
    teamOrder: technicians,
  };
}

export function refreshStoredMonthlyReport(data: MonthlyReportData, routedIncidents?: Incident[]): MonthlyReportData {
  const incidents = data.allTickets?.length ? data.allTickets : routedIncidents ?? data.allTickets;
  if (!Array.isArray(incidents)) return data;

  const hrIds = new Set(data.technicianSLA?.find((row) => row.technician === 'ECS HR')?.frTotalIds);
  const hasOutdatedTechnician = incidents.some((incident) =>
    !hrIds.has(incident.requestId) && getTechnician(incident) !== getImportedTechnician(incident)
  );
  const { firstResponseTotal, resolutionTimeTotal } = data.slaReport || {};
  const totals = data.technicianTotals;
  const summariesAgree = totals && firstResponseTotal?.total === totals.frTotal &&
    firstResponseTotal.failed === totals.frFailed && resolutionTimeTotal?.total === totals.rtTotal &&
    resolutionTimeTotal.failed === totals.rtFailed;
  if (!hasOutdatedTechnician && summariesAgree) return data;

  const refreshed = calculateMonthlyReport(incidents, data.reportPeriod, data.teamOrder, toValidDate(data.generatedAt) ?? undefined);
  return { ...data, ...refreshed, reportTitle: data.reportTitle, generatedAt: data.generatedAt };
}
