import type { Incident } from '@/types/incident';
import type {
  AgingBucket,
  TeamAgingResult,
  AgingSLARow,
  AgingSLATotals,
  PreviousWeekAging,
  AgingRemarksRow,
  RemarksTableData,
} from '@/types/aging';
import { AGING_BUCKET_ORDER } from '@/types/aging';
import { REPORT_TEAMS } from '@/lib/routing/routing-engine';
import { getIncidentTeam, getReportTeamOrder } from '@/lib/report/teams';

export function toValidDate(val: unknown): Date | null {
  if (val === undefined || val === null || val === '' || typeof val === 'boolean') return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    // Excel numeric date (days since Dec 30, 1899)
    if (val > 20000 && val < 60000) {
      const d = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(d.getTime())) return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
    }
    if (!Number.isFinite(val) || Math.abs(val) < 100000000000) return null;
    const timestamp = new Date(val);
    return isNaN(timestamp.getTime()) ? null : timestamp;
  }

  const strVal = String(val).trim();
  if (!strVal || strVal === 'Not Assigned' || strVal === '—' || strVal === '-') return null;

  if (/^\d+(?:\.\d+)?$/.test(strVal) && Number(strVal) > 20000 && Number(strVal) < 60000) return toValidDate(Number(strVal));

  // Match formats: DD-MM-YYYY, MM-DD-YYYY, or YYYY-MM-DD with / or -
  const match = strVal.match(
    /^(\d{1,4})[-/](\d{1,2})[-/](\d{1,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?)?$/i
  );
  if (match) {
    const [, p1, p2, p3, hourStr, minStr, secStr, ampm] = match;
    let year: number;
    let month: number;
    let day: number;

    const n1 = parseInt(p1, 10);
    const n2 = parseInt(p2, 10);
    const n3 = parseInt(p3, 10);

    if (n1 > 1000) {
      // YYYY-MM-DD
      year = n1;
      month = n2;
      day = n3;
    } else if (n3 > 1000) {
      year = n3;
      if (n1 > 12) {
        // Must be DD-MM-YYYY
        day = n1;
        month = n2;
      } else {
        // In SDP default is MM-DD-YYYY (e.g. 10-19-2026)
        month = n1;
        day = n2;
      }
    } else {
      return null;
    }

    let hour = parseInt(hourStr || '0', 10);
    const min = parseInt(minStr || '0', 10);
    const sec = parseInt(secStr || '0', 10);

    if (ampm) {
      if (hour < 1 || hour > 12) return null;
      if (ampm.toUpperCase() === 'PM' && hour < 12) hour += 12;
      if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
    }

    if (month < 1 || month > 12 || day < 1 || day > new Date(year, month, 0).getDate() || hour > 23 || min > 59 || sec > 59) return null;
    const parsed = new Date(year, month - 1, day, hour, min, sec);
    if (!isNaN(parsed.getTime())) return parsed;
    return null;
  }

  const iso = strVal.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (iso && (Number(iso[2]) < 1 || Number(iso[2]) > 12 || Number(iso[3]) < 1 || Number(iso[3]) > new Date(Number(iso[1]), Number(iso[2]), 0).getDate())) return null;
  const parsed = new Date(strVal);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Determine whether a team or incident belongs to ISS (24/7 SLA, no after-hours exception).
 */
export function isISSTeam(teamName?: string | null, inc?: Incident): boolean {
  const t = (teamName || inc?.assignedTeam || inc?.sourceTeam || '').toLowerCase().trim();
  const tech = (
    (typeof inc?.rawData?.['Technician'] === 'string' ? inc.rawData['Technician'] : '') ||
    (typeof inc?.rawData?.['technician'] === 'string' ? inc.rawData['technician'] : '') ||
    inc?.sourceTeam ||
    ''
  ).toLowerCase().trim();

  return (
    t === 'ecs iss' ||
    t.includes('iss') ||
    tech.includes('iss')
  );
}

export function isCreatedOutsideOfficeHours(inc: Incident): boolean {
  let created: Date | null = null;

  if (inc.rawData?.['Created Time']) {
    created = toValidDate(inc.rawData['Created Time']);
  }
  if (!created && inc.rawData) {
    for (const [k, v] of Object.entries(inc.rawData)) {
      if (/created\s*time/i.test(k) && v) {
        created = toValidDate(v);
        if (created) break;
      }
    }
  }
  if (!created && inc.createdTime) {
    created = toValidDate(inc.createdTime);
  }

  if (!created) return false;

  const day = created.getDay(); // 0 = Sunday, 6 = Saturday
  if (day === 0 || day === 6) return true; // Weekend

  const hours = created.getHours();
  const minutes = created.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  // Office hours: 8:30 AM (510 min) – 5:30 PM (1050 min)
  return timeInMinutes < 510 || timeInMinutes >= 1050;
}

function classifyAge(createdTime: unknown, referenceDate: unknown): AgingBucket {
  const created = toValidDate(createdTime);
  const ref = toValidDate(referenceDate) || new Date();
  if (!created) return 'sameday';

  const diffDays = calculateAgingDays(created, ref);

  if (diffDays > 30) return '>1month';
  if (diffDays >= 14) return '2-4weeks';
  if (diffDays >= 7) return '1-2weeks';
  if (diffDays > 3) return '4-6days';
  if (diffDays > 0) return '1-3days';
  return 'sameday';
}

export function filterOpenIncidents(incidents: Incident[]): Incident[] {
  return incidents.filter((inc) => {
    let statusText = (inc.requestStatus || '').toLowerCase().trim();
    if (!statusText && inc.rawData) {
      for (const [k, v] of Object.entries(inc.rawData)) {
        if (/^(request\s*status|ticket\s*status|status)$/i.test(k.trim())) {
          statusText = String(v ?? '').toLowerCase().trim();
          if (statusText) break;
        }
      }
    }

    if (statusText) return !/^(closed?|resolved?|completed?|cancelled|canceled)\b/.test(statusText);
    return !toValidDate(inc.completedTime);
  });
}

function createEmptyBuckets(): Record<AgingBucket, number> {
  return {
    '>1month': 0,
    '2-4weeks': 0,
    '1-2weeks': 0,
    '4-6days': 0,
    '1-3days': 0,
    'sameday': 0,
  };
}

function createEmptyBucketIds(): Record<AgingBucket, string[]> {
  return {
    '>1month': [],
    '2-4weeks': [],
    '1-2weeks': [],
    '4-6days': [],
    '1-3days': [],
    'sameday': [],
  };
}

export function calculateAgingDistribution(
  incidents: Incident[],
  teamOrder: string[] = REPORT_TEAMS,
  referenceDate: Date = new Date()
): TeamAgingResult[] {
  const grouped: Record<string, Incident[]> = {};
  for (const inc of incidents) {
    const team = getIncidentTeam(inc);
    if (!grouped[team]) grouped[team] = [];
    grouped[team].push(inc);
  }

  const results: TeamAgingResult[] = [];

  for (const team of getReportTeamOrder(incidents, teamOrder)) {
    const teamIncidents = grouped[team] || [];
    const buckets = createEmptyBuckets();
    const bucketIncidentIds = createEmptyBucketIds();
    const incidentIds: string[] = [];

    for (const inc of teamIncidents) {
      if (!inc.createdTime) continue;
      const bucket = classifyAge(inc.createdTime, referenceDate);
      buckets[bucket]++;
      bucketIncidentIds[bucket].push(inc.requestId);
      incidentIds.push(inc.requestId);
    }

    results.push({
      teamName: team,
      buckets,
      bucketIncidentIds,
      totalAging: incidentIds.length,
      incidentIds,
    });
  }

  return results;
}


import {
  evaluateFirstResponseOverdue,
  evaluateResolutionOverdue,
} from '@/lib/sla/calculator';

export function calculateAgingSLA(
  incidents: Incident[],
  teamOrder: string[] = REPORT_TEAMS,
  referenceDate: Date = new Date()
): { rows: AgingSLARow[]; totals: AgingSLATotals } {
  const grouped: Record<string, Incident[]> = {};
  for (const inc of incidents) {
    const team = getIncidentTeam(inc);
    if (!grouped[team]) grouped[team] = [];
    grouped[team].push(inc);
  }

  const rows: AgingSLARow[] = [];
  let grandTotalIRs = 0;
  let grandFRFailed = 0;
  let grandFRPassed = 0;
  let grandRTFailed = 0;
  let grandRTPassed = 0;

  for (const team of getReportTeamOrder(incidents, teamOrder)) {
    const teamIncidents = grouped[team] || [];
    const totalIRs = teamIncidents.length;

    const frFailedIds: string[] = [];
    const frPassedIds: string[] = [];
    const rtFailedIds: string[] = [];
    const rtPassedIds: string[] = [];

    for (const inc of teamIncidents) {
      const frFailed = evaluateFirstResponseOverdue(inc, team, referenceDate);
      if (frFailed) {
        frFailedIds.push(inc.requestId);
      } else {
        frPassedIds.push(inc.requestId);
      }

      const rtFailed = evaluateResolutionOverdue(inc, referenceDate);
      if (rtFailed) {
        rtFailedIds.push(inc.requestId);
      } else {
        rtPassedIds.push(inc.requestId);
      }
    }

    const frFailed = frFailedIds.length;
    const frPassed = frPassedIds.length;
    const rtFailed = rtFailedIds.length;
    const rtPassed = rtPassedIds.length;

    grandTotalIRs += totalIRs;
    grandFRFailed += frFailed;
    grandFRPassed += frPassed;
    grandRTFailed += rtFailed;
    grandRTPassed += rtPassed;

    rows.push({
      teamName: team,
      totalIRs,
      firstResponse: {
        failed: frFailed,
        passed: frPassed,
        slaPassRate: totalIRs > 0 ? (frPassed / totalIRs) * 100 : null,
        failedIds: frFailedIds,
        passedIds: frPassedIds,
      },
      resolutionTime: {
        failed: rtFailed,
        passed: rtPassed,
        slaPassRate: totalIRs > 0 ? (rtPassed / totalIRs) * 100 : null,
        failedIds: rtFailedIds,
        passedIds: rtPassedIds,
      },
      incidentIds: teamIncidents.map((i) => i.requestId),
    });
  }

  const totals: AgingSLATotals = {
    totalIRs: grandTotalIRs,
    firstResponse: {
      failed: grandFRFailed,
      passed: grandFRPassed,
      slaPassRate: grandTotalIRs > 0 ? (grandFRPassed / grandTotalIRs) * 100 : null,
    },
    resolutionTime: {
      failed: grandRTFailed,
      passed: grandRTPassed,
      slaPassRate: grandTotalIRs > 0 ? (grandRTPassed / grandTotalIRs) * 100 : null,
    },
  };

  return { rows, totals };
}


export function calculatePreviousWeekAging(
  incidents: Incident[],
  teamOrder: string[] = REPORT_TEAMS
): PreviousWeekAging {
  const grouped: Record<string, number> = {};
  for (const inc of incidents) {
    const team = inc.assignedTeam;
    grouped[team] = (grouped[team] || 0) + 1;
  }

  const teamTotals: Record<string, number | null> = {};
  for (const team of teamOrder) {
    teamTotals[team] = grouped[team] ?? null;
  }

  return {
    teamTotals,
    grandTotal: incidents.length > 0 ? incidents.length : null,
  };
}


export function formatSLAPercentage(value: number | null): string {
  if (value === null) return 'N/A';
  return `${value.toFixed(2)}%`;
}

export function splitAgingByWeek(
  incidents: Incident[]
): { currentWeek: Incident[]; previousWeek: Incident[] } {
  let maxDate = new Date(0);
  for (const inc of incidents) {
    const d = toValidDate(inc.createdTime);
    if (d && d > maxDate) maxDate = d;
  }

  if (maxDate.getTime() === 0) {
    return { currentWeek: incidents, previousWeek: [] };
  }

  const day = maxDate.getDay();
  const diff = maxDate.getDate() - day + (day === 0 ? -6 : 1);
  const currentWeekStart = new Date(maxDate);
  currentWeekStart.setDate(diff);
  currentWeekStart.setHours(0, 0, 0, 0);

  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(previousWeekStart.getDate() - 7);

  const currentWeek: Incident[] = [];
  const previousWeek: Incident[] = [];

  for (const inc of incidents) {
    const d = toValidDate(inc.createdTime);
    if (!d) continue;

    currentWeek.push(inc);

    if (d < currentWeekStart) {
      previousWeek.push(inc);
    }
  }

  return { currentWeek, previousWeek };
}

export function calculateAgingDays(createdTime: unknown, referenceDate: unknown = new Date()): number {
  const created = toValidDate(createdTime);
  const ref = toValidDate(referenceDate) || new Date();
  if (!created) return 0;
  const createdDay = Date.UTC(created.getFullYear(), created.getMonth(), created.getDate());
  const referenceDay = Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate());
  return Math.max(0, Math.round((referenceDay - createdDay) / (1000 * 60 * 60 * 24)));
}

export function formatResponsibleOrDependency(incident: Incident): string {
  const assignedTeam = incident.assignedTeam || incident.sourceTeam || 'Not Assigned';

  const allText = [
    incident.sourceTeam,
    incident.category,
    incident.subCategory,
    incident.description,
    incident.department,
    String(incident.rawData?.['Description'] || ''),
    String(incident.rawData?.['Subject'] || ''),
    String(incident.rawData?.['Location'] || ''),
    String(incident.rawData?.['Branch'] || ''),
    String(incident.rawData?.['Site'] || ''),
    String(incident.rawData?.['Technician'] || ''),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  switch (assignedTeam) {
    case 'ECS ISS':
      return allText.includes('binondo') ? 'ISS Binondo' : 'ISS MT';

    case 'ECS SDS':
      if (allText.includes('pos') || allText.includes('terminal'))
        return 'POS DB';
      return 'SDS';

    case 'ECS ADMIN':
      return 'ECS HRAD';

    case 'ECS HR':
      return 'HR';

    case 'ECS ISMS Support':
      return 'ISMS Support';

    case 'ECS PSD':
      return 'PSD';

    default:
      break;
  }

  const lower = assignedTeam.toLowerCase();
  if (lower.includes('iss')) return allText.includes('binondo') ? 'ISS Binondo' : 'ISS MT';
  if (lower.includes('pos') || lower === 'pos db') return 'POS DB';
  if (lower === 'sds') return 'SDS';
  if (lower === 'hrad' || lower === 'hr admin' || lower === 'admin') return 'ECS HRAD';
  if (lower === 'isms support') return 'ISMS Support';
  if (lower === 'psd') return 'PSD';
  if (lower === 'hr') return 'HR';

  return assignedTeam;
}

export function buildRemarksTableData(
  incidents: Incident[],
  referenceDate: unknown = new Date(),
  reportPeriod?: string,
  minAgingDays: number = 0
): RemarksTableData {
  const refDate = toValidDate(referenceDate) || new Date();

  const openIncidents = filterOpenIncidents(incidents).filter((inc) => {
    const isExcluded = (val: unknown): boolean => {
      if (!val) return false;
      const s = String(val).toUpperCase();
      return s.includes('CABS') || s.includes('RRG');
    };

    if (
      isExcluded(inc.category) ||
      isExcluded(inc.subCategory) ||
      isExcluded(inc.department) ||
      isExcluded(inc.description)
    ) {
      return false;
    }

    if (inc.rawData) {
      for (const val of Object.values(inc.rawData)) {
        if (isExcluded(val)) return false;
      }
    }
    return true;
  });

  const eligible = openIncidents
    .map((inc) => {
      const created = toValidDate(inc.createdTime) || refDate;
      const days = calculateAgingDays(created, refDate);
      return { inc, days };
    })
    .filter((item) => item.days >= minAgingDays)
    .sort((a, b) => b.days - a.days);

  const rows: AgingRemarksRow[] = eligible.map(({ inc, days }) => {
    const requestId = inc.requestId;

    const department =
      inc.department ||
      String(inc.rawData['Department'] || inc.rawData['department'] || inc.rawData['Dept'] || '').trim() ||
      'Not Assigned';

    const category = inc.category || '';

    const subCategory =
      inc.subCategory ||
      String(inc.rawData['Sub Category'] || inc.rawData['Subcategory'] || inc.rawData['subcategory'] || '').trim();

    const description =
      inc.description ||
      String(
        inc.rawData['Description'] ||
        inc.rawData['description'] ||
        inc.rawData['Subject'] ||
        inc.rawData['subject'] ||
        inc.rawData['Summary'] ||
        ''
      ).trim();

    const agingDays = days;

    const recentUpdate =
      inc.recentUpdate ||
      String(
        inc.rawData['Recent Update'] ||
        inc.rawData['recent update'] ||
        inc.rawData['Remarks'] ||
        inc.rawData['remarks'] ||
        inc.rawData['Latest Update'] ||
        ''
      ).trim();

    const responsibleOrDependency = formatResponsibleOrDependency(inc);

    return {
      requestId,
      department,
      category,
      subCategory,
      description,
      agingDays,
      recentUpdate,
      responsibleOrDependency,
    };
  });

  const createdOnFormatted = refDate.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });

  const toDate = new Date(refDate);
  const fromDate = new Date(refDate);
  fromDate.setDate(fromDate.getDate() - 7);

  const formatWithTime = (d: Date) => {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = '13';
    const min = '00';
    return `${mm}-${dd}-${yyyy} ${hh}:${min}`;
  };

  return {
    createdOn: createdOnFormatted,
    periodFrom: formatWithTime(fromDate),
    periodTo: formatWithTime(toDate),
    totalRecords: rows.length,
    rows,
  };
}

