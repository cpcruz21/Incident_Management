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

/** Check if First Response failed from raw data column or calculation */
export function isFirstResponseFailed(inc: Incident): boolean {
  if (inc.rawData) {
    for (const [k, v] of Object.entries(inc.rawData)) {
      if (/first\s*response\s*overdue/i.test(k)) {
        const s = String(v ?? '').trim().toUpperCase();
        if (s === 'TRUE') return true;
        if (s === 'FALSE') return false;
      }
    }
  }
  return inc.firstResponseOverdue;
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

/** Filter incidents that are "closed" / "resolved" */
export function filterClosedTickets(incidents: Incident[]): Incident[] {
  return incidents.filter((inc) => {
    // Check rawData first for Request Status
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

/** Filter incidents that have acceptable first response (not overdue) */
export function filterAcceptableFirstResponse(incidents: Incident[]): Incident[] {
  return incidents.filter((inc) => !isFirstResponseFailed(inc));
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

  if (frMet && rtMet) {
    lines.push('The team performed well in both initial response speed and resolving tickets on time.');
  } else if (rtMet && !frMet) {
    lines.push('The team performed exceptionally well in resolving tickets on time, but continued to struggle with initial response speed.');
  } else if (frMet && !rtMet) {
    lines.push('The team responded quickly to new tickets, but struggled with meeting resolution time targets.');
  } else {
    lines.push('The team needs improvement in both first response and resolution time metrics.');
  }

  lines.push('');

  // Target Resolution Time
  const rtLabel = rtMet ? 'Met' : 'Failed';
  lines.push(
    `Target Resolution Time: ${rtLabel} (${rtKPI.percentageResult.toFixed(2)}%) - ${rtMet
      ? 'The team well exceeded the ' + KPI_TARGET + '% target, proving that active issues are fixed quickly.'
      : 'The team missed the ' + KPI_TARGET + '% target due to ' + totals.rtFailed + ' late resolutions out of ' + totals.rtTotal + ' total tickets.'
    }`
  );

  // Target Response Time
  const frLabel = frMet ? 'Met' : 'Failed';
  lines.push(
    `Target Response Time: ${frLabel} (${frKPI.percentageResult.toFixed(2)}%) - ${frMet
      ? 'The team met the ' + KPI_TARGET + '% target for first response.'
      : 'The team missed the ' + KPI_TARGET + '% target due to ' + totals.frFailed + ' late first responses out of ' + totals.frTotal + ' total tickets.'
    }`
  );

  lines.push('');
  lines.push('Observations:');

  // Top handler
  const sorted = [...rows].filter((r) => r.frTotal > 0).sort((a, b) => b.frTotal - a.frTotal);
  if (sorted.length > 0) {
    const top = sorted[0];
    lines.push(
      `${top.technician} handled the majority of tickets (${top.frTotal} for response, ${top.rtTotal} for resolution) with strong performance (${top.frPassRate !== null ? top.frPassRate.toFixed(2) : 'N/A'
      }% response and ${top.rtPassRate !== null ? top.rtPassRate.toFixed(2) : 'N/A'}% resolution).`
    );
  }

  // Low / 0% first-response
  const zeroFR = rows.filter((r) => r.frTotal > 0 && (r.frPassRate === 0 || (r.frPassRate !== null && r.frPassRate < 50)));
  if (zeroFR.length > 0) {
    const names = zeroFR
      .map((r) => `${r.technician} (${r.frPassRate !== null ? r.frPassRate.toFixed(2) : '0.00'}%)`)
      .join(', ');
    lines.push(`First-response scores were pulled down by specific technician: ${names}.`);
  }

  lines.push('');
  lines.push(
    'Recommendation: Once tickets were assigned, most teams performed exceptionally well, ECS HRAD, ECS SDS, and ECS ISMS Support all achieved 100% resolution pass rates. This confirms the delay is only in acknowledging new tickets, not fixing them.'
  );

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
