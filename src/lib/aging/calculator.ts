
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



// Helper to safely convert any Date, string, or number to a valid Date object
export function toValidDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const d = new Date(val as string | number);
  return isNaN(d.getTime()) ? null : d;
}

// Determine which aging bucket an incident falls into based on its age in calendar days
function classifyAge(createdTime: unknown, referenceDate: unknown): AgingBucket {
  const created = toValidDate(createdTime);
  const ref = toValidDate(referenceDate) || new Date();
  if (!created) return 'sameday';

  const diffMs = ref.getTime() - created.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays > 30) return '>1month';
  if (diffDays > 14) return '2-4weeks';
  if (diffDays > 7) return '1-2weeks';
  if (diffDays > 3) return '4-6days';
  if (diffDays > 0) return '1-3days';
  return 'sameday';
}

// Filter incidents to only open/pending (not completed) 
export function filterOpenIncidents(incidents: Incident[]): Incident[] {
  return incidents.filter((inc) => {
    // If there's no completedTime, the incident is still open
    if (!inc.completedTime) return true;

    // Also include if status text indicates open/pending
    const status = (inc.requestStatus || '').toLowerCase();
    if (status.includes('open') || status.includes('pending') || status.includes('in progress')) {
      return true;
    }

    return false;
  });
}

// Aging Distribution Calculation 
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
  // Group incidents by team
  const grouped: Record<string, Incident[]> = {};
  for (const inc of incidents) {
    const team = inc.assignedTeam;
    if (!grouped[team]) grouped[team] = [];
    grouped[team].push(inc);
  }

  const results: TeamAgingResult[] = [];

  for (const team of teamOrder) {
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

//SLA Compliance Calculation

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
    const team = inc.assignedTeam;
    if (!grouped[team]) grouped[team] = [];
    grouped[team].push(inc);
  }

  const rows: AgingSLARow[] = [];
  let grandTotalIRs = 0;
  let grandFRFailed = 0;
  let grandFRPassed = 0;
  let grandRTFailed = 0;
  let grandRTPassed = 0;

  for (const team of teamOrder) {
    const teamIncidents = grouped[team] || [];
    const totalIRs = teamIncidents.length;

    const frFailedIds: string[] = [];
    const frPassedIds: string[] = [];
    const rtFailedIds: string[] = [];
    const rtPassedIds: string[] = [];

    for (const inc of teamIncidents) {
      // First Response SLA
      const frFailed = evaluateFirstResponseOverdue(inc, team, referenceDate);
      if (frFailed) {
        frFailedIds.push(inc.requestId);
      } else {
        frPassedIds.push(inc.requestId);
      }

      // Resolution Time SLA
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

//Previous Week Auto-Calculation 

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

// Utility

export function formatSLAPercentage(value: number | null): string {
  if (value === null) return 'N/A';
  return `${value.toFixed(2)}%`;
}

// Split open incidents into this-week and last-week
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

  // Find Monday of max date's week
  const day = maxDate.getDay();
  const diff = maxDate.getDate() - day + (day === 0 ? -6 : 1);
  const currentWeekStart = new Date(maxDate);
  currentWeekStart.setDate(diff);
  currentWeekStart.setHours(0, 0, 0, 0);

  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(previousWeekStart.getDate() - 7);

  // All incidents that were still open as of current week
  // and all that were still open as of previous week
  // For aging, we use createdTime to determine when the ticket was first logged
  const currentWeek: Incident[] = [];
  const previousWeek: Incident[] = [];

  for (const inc of incidents) {
    const d = toValidDate(inc.createdTime);
    if (!d) continue;

    // If created before the end of current week and still not completed, it's aging in current week
    currentWeek.push(inc);

    // If created before the previous week start, it was also aging in previous week
    if (d < currentWeekStart) {
      previousWeek.push(inc);
    }
  }

  return { currentWeek, previousWeek };
}

/** Calculate exact aging days between incident creation date and reference date */
export function calculateAgingDays(createdTime: unknown, referenceDate: unknown = new Date()): number {
  const created = toValidDate(createdTime);
  const ref = toValidDate(referenceDate) || new Date();
  if (!created) return 0;
  const diffMs = ref.getTime() - created.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Format Responsible or Dependency based on routing final assigned team + ticket context.
 * Returns the sub-team name (ISS MT, POS DB, SDS, etc.) — not the ECS-level team.
 *
 * Mapping:
 *   ECS ISS          → ISS Binondo (if "binondo" in context) or ISS MT
 *   ECS SDS          → POS DB (if POS/terminal in context) or SDS
 *   ECS ADMIN        → ECS HRAD
 *   ECS HR           → HR
 *   ECS ISMS Support → ISMS Support
 *   ECS PSD          → PSD
 */
export function formatResponsibleOrDependency(incident: Incident): string {
  const assignedTeam = incident.assignedTeam || incident.sourceTeam || 'Not Assigned';

  // Build context string from all available text fields for sub-team detection
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

  // Route to sub-team based on assigned ECS team + context
  switch (assignedTeam) {
    case 'ECS ISS':
      return allText.includes('binondo') ? 'ISS Binondo' : 'ISS MT';

    case 'ECS SDS':
      // If POS-related content, assign to POS DB; otherwise SDS
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

  // Handle legacy / unmapped source team names
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

/**
 * Build the complete Remarks Table data for all open aging incidents (limit removed for comprehensive live checking)
 */
export function buildRemarksTableData(
  incidents: Incident[],
  referenceDate: unknown = new Date(),
  reportPeriod?: string,
  minAgingDays: number = 0
): RemarksTableData {
  const refDate = toValidDate(referenceDate) || new Date();

  // Only open incidents from the raw dataset are included (excluding CABS or RRG)
  const openIncidents = filterOpenIncidents(incidents).filter((inc) => {
    const rawStr = JSON.stringify(inc.rawData || {}).toUpperCase();
    const metaStr = `${inc.category || ''} ${inc.subCategory || ''} ${inc.department || ''} ${inc.description || ''}`.toUpperCase();
    if (rawStr.includes('CABS') || rawStr.includes('RRG') || metaStr.includes('CABS') || metaStr.includes('RRG')) {
      return false;
    }
    return true;
  });

  // All open aging incidents sorted by aging days descending (no >= 8 restriction, counted accordingly)
  const eligible = openIncidents
    .map((inc) => {
      const created = toValidDate(inc.createdTime) || refDate;
      const days = calculateAgingDays(created, refDate);
      return { inc, days };
    })
    .filter((item) => item.days >= minAgingDays)
    .sort((a, b) => b.days - a.days); // Sort descending by aging days

  const rows: AgingRemarksRow[] = eligible.map(({ inc, days }) => {
    // 1. Request ID
    const requestId = inc.requestId;

    // 2. Department
    const department =
      inc.department ||
      String(inc.rawData['Department'] || inc.rawData['department'] || inc.rawData['Dept'] || '').trim() ||
      'Not Assigned';

    // 3. Category
    const category = inc.category || '';

    // 4. Sub Category
    const subCategory =
      inc.subCategory ||
      String(inc.rawData['Sub Category'] || inc.rawData['Subcategory'] || inc.rawData['subcategory'] || '').trim();

    // 5. Description
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

    // 6. Aging Days
    const agingDays = days;

    // 7. Recent Update (preserved if exists in uploaded data)
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

    // 8. Responsible or Dependency (automatically based on routing final technician)
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

  // Calculate Header Dates matching Screenshot 1
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

