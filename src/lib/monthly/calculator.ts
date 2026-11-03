/**
 * Monthly Report Calculator
 * 
 * Generates the monthly SLA dashboard data directly from the raw incident data
 * based on the Technician column (no routing engine applied).
 * 
 * Produces:
 * - Per-technician First Response & Resolution breakdown
 * - KPI summary (85% target)
 * - Auto-generated remarks / observations matching the monthly standard format
 */

import type { Incident } from '@/types/incident';
import type {
  MonthlyReportData,
  MonthlyKPI,
  MonthlyTechnicianSLA,
  RootCauseRow,
} from '@/types/monthly';
import { calculateSLAReport } from '@/lib/sla/calculator';
import { isCreatedOutsideOfficeHours, isISSTeam } from '@/lib/aging/calculator';

export const MONTHLY_DEFAULT_TECHNICIANS = [
  'ECS HRAD',
  'ECS ISS Binondo',
  'ECS ISS MT',
  'ECS SDS',
  'ECS ISMS Support',
  'ECS PSD',
];

const KPI_TARGET = 85; // 85% threshold

// ─── Helpers ─────────────────────────────────────────────────

/** Extract the actual Technician name from incident rawData or fallback */
export function getTechnician(inc: Incident): string {
  if (inc.rawData) {
    for (const [k, v] of Object.entries(inc.rawData)) {
      if (k.toLowerCase().trim() === 'technician') {
        const val = String(v ?? '').trim();
        if (val) return val;
      }
    }
  }
  return inc.sourceTeam || inc.assignedTeam || 'Unassigned';
}

/** Check whether the incident's raw First Response Overdue Status was TRUE (lapsed in SDP) */
export function isRawFirstResponseOverdue(inc: Incident): boolean {
  if (inc.rawData) {
    for (const [k, v] of Object.entries(inc.rawData)) {
      if (/first\s*response\s*overdue/i.test(k)) {
        const s = String(v ?? '').trim().toUpperCase();
        if (s === 'TRUE') return true;
        if (s === 'FALSE') return false;
      }
    }
  }
  const raw = String(inc.rawFirstResponseStatus ?? '').trim().toUpperCase();
  if (raw === 'TRUE') return true;
  if (raw === 'FALSE') return false;
  return Boolean(inc.firstResponseOverdue);
}

/** Check if First Response failed from raw data column or calculation */
export function isFirstResponseFailed(inc: Incident): boolean {
  // If non-ISS and created outside office hours / weekend -> excused (acceptable / NOT failed)
  if (!isISS24x7(inc) && isCreatedOutsideOfficeHours(inc)) {
    return false;
  }

  return isRawFirstResponseOverdue(inc);
}

/** Check if Resolution failed from raw data column or calculation */
export function isResolutionFailed(inc: Incident): boolean {
  if (inc.rawData) {
    for (const [k, v] of Object.entries(inc.rawData)) {
      if (/^overdue\s*status/i.test(k.trim())) {
        const s = String(v ?? '').trim().toUpperCase();
        if (s === 'TRUE') return true;
        if (s === 'FALSE') return false;
      }
    }
  }
  return inc.resolutionOverdue;
}


export function filterClosedTickets(incidents: Incident[]): Incident[] {
  return incidents.filter((inc) => {

    if (inc.rawData) {
      for (const [k, v] of Object.entries(inc.rawData)) {
        if (/request\s*status/i.test(k)) {
          const s = String(v ?? '').toLowerCase().trim();
          if (s === 'closed' || s === 'resolved' || s === 'completed') return true;
        }
      }
    }
    const status = (inc.requestStatus || '').toLowerCase().trim();
    return (
      status === 'closed' ||
      status === 'resolved' ||
      status === 'completed' ||
      status.includes('close') ||
      status.includes('resolve')
    );
  });
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
 * for all departments EXCEPT ISS Binondo and ISS Makati (which operate 24/7).
 */
export function filterAcceptableFirstResponse(incidents: Incident[]): Incident[] {
  return incidents.filter((inc) => {
    // 1. Must be a ticket that lapsed/overdue in raw data
    if (!isRawFirstResponseOverdue(inc)) return false;

    // 2. ISS 24/7 teams (ISS Binondo, ISS Makati) get NO exception
    if (isISS24x7(inc)) return false;

    // 3. For all other departments: only accepted if created outside office hours / weekend
    return isCreatedOutsideOfficeHours(inc);
  });
}

/** Group incidents directly by their Technician */
function groupByTechnician(incidents: Incident[]): Record<string, Incident[]> {
  const groups: Record<string, Incident[]> = {};
  for (const inc of incidents) {
    const tech = getTechnician(inc);
    if (!groups[tech]) groups[tech] = [];
    groups[tech].push(inc);
  }
  return groups;
}

/** Derive dynamic technician order prioritizing default list */
function getTechnicianOrder(incidents: Incident[], preferred = MONTHLY_DEFAULT_TECHNICIANS): string[] {
  const found = new Set<string>();
  for (const inc of incidents) {
    const t = getTechnician(inc);
    if (t) found.add(t);
  }

  const result: string[] = [];
  // Add preferred technicians that appear in the data
  for (const p of preferred) {
    if (found.has(p)) {
      result.push(p);
      found.delete(p);
    }
  }
  // Add remaining technicians found in file
  found.forEach((r) => {
    result.push(r);
  });

  return result.length > 0 ? result : preferred;
}

/** Build per-technician SLA rows directly from Technician column */
function buildTechnicianSLA(
  allIncidents: Incident[],
  closedIncidents: Incident[],
  technicians: string[]
): { rows: MonthlyTechnicianSLA[]; totals: MonthlyTechnicianSLA } {
  // First Response uses ALL tickets (all IRs for the month)
  const frGroups = groupByTechnician(allIncidents);
  // Resolution Time uses only CLOSED tickets
  const rtGroups = groupByTechnician(closedIncidents);

  const rows: MonthlyTechnicianSLA[] = [];

  for (const tech of technicians) {
    const frInc = frGroups[tech] || [];
    const rtInc = rtGroups[tech] || [];

    const frFailedIds = frInc.filter(isFirstResponseFailed).map((i) => i.requestId);
    const frPassedIds = frInc.filter((i) => !isFirstResponseFailed(i)).map((i) => i.requestId);
    const rtFailedIds = rtInc.filter(isResolutionFailed).map((i) => i.requestId);
    const rtPassedIds = rtInc.filter((i) => !isResolutionFailed(i)).map((i) => i.requestId);

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

  // Totals
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

/** Build KPI summary rows */
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

/** Extract root cause breakdown */
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

/** Auto-generate remarks text from the monthly results */
function generateRemarks(
  kpis: MonthlyKPI[],
  rows: MonthlyTechnicianSLA[],
  totals: MonthlyTechnicianSLA
): string {
  const lines: string[] = [];

  const frKPI = kpis.find((k) => k.label.includes('Response'));
  const rtKPI = kpis.find((k) => k.label.includes('Resolution'));

  if (!frKPI || !rtKPI) return '';

  const frMet = frKPI.percentageResult >= KPI_TARGET;
  const rtMet = rtKPI.percentageResult >= KPI_TARGET;

  // ── Summary sentence ──────────────────────────────────────
  if (frMet && rtMet) {
    lines.push('The team performed well in both resolving tickets on time and meeting the first-response target.');
  } else if (rtMet && !frMet) {
    lines.push('The team performed exceptionally well in resolving tickets, and moved much closer to meeting the first-response target.');
  } else if (frMet && !rtMet) {
    lines.push('The team responded quickly to new tickets, but struggled to close all resolutions within the target window.');
  } else {
    lines.push('The team needs improvement in both first response and resolution time metrics this period.');
  }

  lines.push('');

  // ── KPI Lines ─────────────────────────────────────────────
  const rtLabel = rtMet ? 'Met' : 'Failed';
  lines.push(
    `Target Resolution Time: ${rtLabel} (${rtKPI.percentageResult.toFixed(2)}%) - ${
      rtMet
        ? `The team well exceeded the ${KPI_TARGET}% target, showing that active tickets are solved quickly.`
        : `The team missed the ${KPI_TARGET}% target due to ${totals.rtFailed} late resolutions out of ${totals.rtTotal} total tickets.`
    }`
  );

  const frLabel = frMet ? 'Met' : 'Failed';
  lines.push(
    `Target Response Time: ${frLabel} (${frKPI.percentageResult.toFixed(2)}%) - ${
      frMet
        ? `The team met the ${KPI_TARGET}% target for first response.`
        : `The team narrowly missed the ${KPI_TARGET}% target due to ${totals.frFailed} late first responses out of ${totals.frTotal} total tickets.`
    }`
  );

  lines.push('');

  // ── Observation 1: Top team by ticket volume ──────────────
  const sorted = [...rows].filter((r) => r.frTotal > 0).sort((a, b) => b.frTotal - a.frTotal);
  if (sorted.length > 0) {
    const top = sorted[0];
    const frRate = top.frPassRate !== null ? top.frPassRate.toFixed(2) : 'N/A';
    const rtRate = top.rtPassRate !== null ? top.rtPassRate.toFixed(2) : 'N/A';
    lines.push(
      `${top.technician} handled most of the tickets (${top.frTotal}) with strong results (${frRate}% response and ${rtRate}% resolution).`
    );
  }

  // ── Observation 2: Teams dragging down FR rate ────────────
  const lowFR = rows.filter(
    (r) => r.frTotal > 0 && r.frPassRate !== null && r.frPassRate < KPI_TARGET
  );
  if (lowFR.length > 0) {
    const names = lowFR
      .map((r) => `${r.technician} (${r.frPassRate!.toFixed(2)}%${r.frFailed > 1 ? ` with ${r.frFailed} late responses` : ''})`)
      .join(', ');
    lines.push(
      `The response target was missed mainly due to lower pass rates in ${names}.`
    );
  }

  // ── Observation 3: Perfect resolution teams ───────────────
  const perfectRT = rows.filter((r) => r.rtTotal > 0 && r.rtPassRate === 100);
  if (perfectRT.length > 0) {
    const names = perfectRT.map((r) => r.technician).join(', ');
    lines.push(
      `Once work started, execution was excellent. ${names} all achieved a 100.00% resolution pass rate. This confirms the issue is strictly with acknowledging new tickets, not solving them.`
    );
  }

  lines.push('');

  // ── Recommendation ────────────────────────────────────────
  const gapPct = Math.abs(frKPI.percentageResult - KPI_TARGET).toFixed(2);
  if (!frMet && lowFR.length > 0) {
    const teamNames = lowFR.map((r) => r.technician).join(', ');
    lines.push(
      `Provide closer monitoring and alerts for ${teamNames} during ticket intake to close the small ${gapPct}% gap and pass the response KPI.`
    );
  } else if (!rtMet) {
    lines.push(
      `Focus on faster ticket closure for teams with pending resolutions to close the ${gapPct}% gap and meet the resolution KPI.`
    );
  } else {
    lines.push(
      `Maintain current performance levels and continue tracking both KPIs to sustain compliance across all teams.`
    );
  }

  return lines.join('\n');
}

// ─── Main Calculator ────────────────────────────────────────

export function calculateMonthlyReport(
  incidents: Incident[],
  reportPeriod: string,
  teamOrder?: string[]
): MonthlyReportData {
  const technicians = teamOrder || getTechnicianOrder(incidents);
  const closedTickets = filterClosedTickets(incidents);

  // Calculate SLA report for reference
  const slaReport = calculateSLAReport(incidents, technicians);

  // Build per-technician SLA directly from raw technician values
  const { rows, totals } = buildTechnicianSLA(incidents, closedTickets, technicians);
  const kpis = buildKPIs(totals);
  const rootCauses = buildRootCauses(closedTickets);
  const remarks = generateRemarks(kpis, rows, totals);

  return {
    reportTitle: 'Monthly Overall Ticket Report',
    reportPeriod,
    generatedAt: new Date(),
    allTickets: incidents,
    closedTickets,
    kpis,
    technicianSLA: rows,
    technicianTotals: totals,
    rootCauses,
    slaReport,
    remarks,
    teamOrder: technicians,
  };
}
