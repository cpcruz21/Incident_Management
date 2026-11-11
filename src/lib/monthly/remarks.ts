import type { MonthlyKPI, MonthlyTechnicianSLA } from '@/types/monthly';

/** Explain the current month's results without assuming a previous-month trend. */
export function generateMonthlyRemarks(
  kpis: MonthlyKPI[],
  rows: MonthlyTechnicianSLA[],
  totals: MonthlyTechnicianSLA
): string {
  const fr = kpis.find((k) => k.label.includes('Response'));
  const rt = kpis.find((k) => k.label.includes('Resolution'));
  if (!fr || !rt) return '';

  const frHasData = fr.totalIRs > 0;
  const rtHasData = rt.totalIRs > 0;
  const frMet = frHasData && fr.percentageResult >= fr.targetPercent;
  const rtMet = rtHasData && rt.percentageResult >= rt.targetPercent;
  const lines: string[] = [];

  if (!frHasData && !rtHasData) {
    lines.push('There are no tickets to assess for this period. Neither KPI can be evaluated yet.');
  } else if (!rtHasData) {
    lines.push(`The first-response target was ${frMet ? 'met' : 'not met'}. Resolution performance cannot be assessed because there are no closed tickets in this period.`);
  } else if (!frHasData) {
    lines.push(`The resolution target was ${rtMet ? 'met' : 'not met'}. First-response performance cannot be assessed because there are no tickets to evaluate.`);
  } else if (frMet && rtMet) {
    lines.push('The team met both the first-response and resolution targets this period.');
  } else if (rtMet) {
    lines.push('The team met the target for resolving tickets, but first responses need improvement to reach the target.');
  } else if (frMet) {
    lines.push('The team met the first-response target, but more tickets need to be resolved within the required time.');
  } else {
    lines.push('Both first responses and ticket resolutions need improvement to meet the targets this period.');
  }

  lines.push('');
  lines.push(rtHasData
    ? `Target Resolution Time: ${rtMet ? 'Met' : 'Not met'} (${rt.percentageResult.toFixed(2)}%) - ${rt.countOfPassed} of ${rt.totalIRs} closed tickets were resolved on time; ${totals.rtFailed} were late. Target: ${rt.targetPercent}%.`
    : `Target Resolution Time: No data (N/A) - No closed tickets are available to assess resolution time. Target: ${rt.targetPercent}%.`);
  lines.push(frHasData
    ? `Target Response Time: ${frMet ? 'Met' : 'Not met'} (${fr.percentageResult.toFixed(2)}%) - ${fr.countOfPassed} of ${fr.totalIRs} tickets passed first response (on-time responses or accepted exceptions); ${totals.frFailed} were late. Target: ${fr.targetPercent}%.`
    : `Target Response Time: No data (N/A) - No tickets are available to assess first response. Target: ${fr.targetPercent}%.`);

  lines.push('');
  const byVolume = rows.filter((r) => r.frTotal > 0).sort((a, b) => b.frTotal - a.frTotal);
  if (byVolume.length > 0) {
    const top = byVolume[0];
    const leaders = byVolume.filter((r) => r.frTotal === top.frTotal);
    const rate = (value: number | null) => value === null ? 'N/A' : `${value.toFixed(2)}%`;
    if (leaders.length === 1) {
      lines.push(`${top.technician} handled the largest ticket volume (${top.frTotal} of ${totals.frTotal} tickets). Pass rates: ${rate(top.frPassRate)} first response and ${rate(top.rtPassRate)} resolution.`);
    } else {
      lines.push(`${leaders.map((r) => r.technician).join(', ')} shared the largest ticket volume (${top.frTotal} tickets each).`);
    }
  }

  const lowFR = rows.filter((r) => r.frTotal > 0 && r.frPassRate !== null && r.frPassRate < fr.targetPercent)
    .sort((a, b) => b.frFailed - a.frFailed);
  const lowRT = rows.filter((r) => r.rtTotal > 0 && r.rtPassRate !== null && r.rtPassRate < rt.targetPercent)
    .sort((a, b) => b.rtFailed - a.rtFailed);
  if (lowFR.length > 0) {
    lines.push(`First response needs attention in ${lowFR.map((r) => `${r.technician} (${r.frPassRate!.toFixed(2)}% passed; ${r.frFailed} late out of ${r.frTotal})`).join(', ')}.`);
  }
  if (lowRT.length > 0) {
    lines.push(`Resolution needs attention in ${lowRT.map((r) => `${r.technician} (${r.rtPassRate!.toFixed(2)}% passed; ${r.rtFailed} late out of ${r.rtTotal} closed tickets)`).join(', ')}.`);
  }
  const perfectRT = rows.filter((r) => r.rtTotal > 0 && r.rtPassRate === 100);
  if (perfectRT.length > 0) {
    lines.push(`All evaluated closed tickets were resolved on time for ${perfectRT.map((r) => `${r.technician} (${r.rtPassed} of ${r.rtTotal})`).join(', ')}: a 100.00% resolution pass rate.`);
  }

  const actions: string[] = [];
  const gap = (kpi: MonthlyKPI) => {
    const points = (kpi.targetPercent - kpi.percentageResult).toFixed(2);
    const needed = Math.max(0, Math.ceil(kpi.targetPercent * kpi.totalIRs / 100 - 1e-9) - kpi.countOfPassed);
    return `${points} percentage points below target; at least ${needed} more passing ${needed === 1 ? 'ticket is' : 'tickets are'} needed at the same ticket volume`;
  };
  if (frHasData && !frMet) {
    actions.push(`Monitor new-ticket intake and set response reminders${lowFR.length ? ` for ${lowFR.map((r) => r.technician).join(', ')}` : ''}. First response is ${gap(fr)}.`);
  } else if (frMet && lowFR.length > 0) {
    actions.push(`Keep the overall first-response result on target and review late responses with ${lowFR.map((r) => r.technician).join(', ')}.`);
  }
  if (rtHasData && !rtMet) {
    actions.push(`Review late resolutions and follow up before due times${lowRT.length ? ` with ${lowRT.map((r) => r.technician).join(', ')}` : ''}. Resolution is ${gap(rt)}.`);
  } else if (rtMet && lowRT.length > 0) {
    actions.push(`Keep the overall resolution result on target and review late closures with ${lowRT.map((r) => r.technician).join(', ')}.`);
  }
  if (!frHasData && !rtHasData) actions.push('Add ticket data before evaluating the KPIs.');
  else if (!rtHasData) actions.push('Assess the resolution KPI when closed tickets are available.');
  else if (!frHasData) actions.push('Add first-response ticket data before evaluating that KPI.');
  if (actions.length === 0) actions.push('Maintain response reminders and monitor resolution due times to keep both KPIs on target.');
  lines.push('', `Next steps: ${actions.join(' ')}`);
  return lines.join('\n');
}
