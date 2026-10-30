/**
 * IR Analytics Engine
 * 
 * Pure calculation functions for the IR Analytics Dashboard.
 * No UI dependencies. All functions accept normalized tickets and filters.
 */

import type {
  IRRawRow,
  IRColumnMapping,
  NormalizedTicket,
  ImportBatch,
  TicketStatusCategory,
  AgingCategory,
  InactivityCategory,
  IRSummaryStats,
  StatusCountItem,
  TimeSeriesPoint,
  DistributionBar,
  TechnicianRankRow,
  AgingDistributionRow,
  IRDashboardFilters,
} from '@/types/ir-analytics';
import type { Incident } from '@/types/incident';
import { toValidDate } from '@/lib/aging/calculator';

// ─── Status normalization ─────────────────────────────────────────────────────

const OPEN_PATTERNS = /^open$/i;
const PENDING_PATTERNS = /pending/i;
const IN_PROGRESS_PATTERNS = /in.?progress|in.?work|working|assigned|ongoing|active/i;
const RESOLVED_PATTERNS = /resolved|resolve/i;
const CLOSED_PATTERNS = /close|closed|complete|completed|cancel|cancelled/i;

export function normalizeStatus(raw: string): TicketStatusCategory {
  const s = (raw || '').trim();
  if (!s) return 'unknown';
  if (CLOSED_PATTERNS.test(s)) return 'closed';
  if (RESOLVED_PATTERNS.test(s)) return 'resolved';
  if (OPEN_PATTERNS.test(s)) return 'open';
  if (PENDING_PATTERNS.test(s)) return 'pending';
  if (IN_PROGRESS_PATTERNS.test(s)) return 'in-progress';
  return 'unknown';
}

export function isActiveTicket(t: NormalizedTicket): boolean {
  return t.statusCategory !== 'resolved' && t.statusCategory !== 'closed';
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function safeDate(val: unknown): Date | null {
  if (!val) return null;
  return toValidDate(val);
}

export function daysBetween(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null;
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function daysAgo(d: Date | null, referenceDate: Date = new Date()): number | null {
  if (!d) return null;
  const ms = referenceDate.getTime() - d.getTime();
  if (ms < 0) return null; // future date
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function classifyAging(days: number | null): AgingCategory {
  if (days === null) return '0-2d';
  if (days <= 2) return '0-2d';
  if (days <= 6) return '3-6d';
  if (days <= 13) return '7-13d';
  if (days <= 29) return '14-29d';
  return '30+d';
}

function classifyInactivity(days: number | null): InactivityCategory {
  if (days === null) return 'active';
  if (days >= 30) return '30+d';
  if (days >= 14) return '14+d';
  if (days >= 7) return '7+d';
  if (days >= 3) return '3+d';
  return 'active';
}

// ─── Auto-detect column mapping ───────────────────────────────────────────────

export function autoDetectIRMapping(columns: string[]): IRColumnMapping {
  const mapping: IRColumnMapping = {};

  const matchers: { field: keyof IRColumnMapping; patterns: RegExp[] }[] = [
    {
      field: 'irId',
      patterns: [/^ir[\s_-]?id$/i, /^incident[\s_-]?(?:report[\s_-]?)?id$/i, /^ir[\s_-]?no/i, /^ir\s*#/i, /^report[\s_-]?id$/i],
    },
    {
      field: 'ticketId',
      patterns: [/^ticket[\s_-]?id$/i, /^request[\s_-]?id$/i, /^ticket[\s_-]?no/i, /^sr[\s_-]?no/i, /^id$/i, /^ref[\s_-]?no/i],
    },
    {
      field: 'technician',
      patterns: [/technician/i, /assigned[\s_-]?to/i, /^tech$/i, /^agent$/i, /^owner$/i],
    },
    {
      field: 'incidentType',
      patterns: [/^category$/i, /incident[\s_-]?type/i, /^type$/i, /^classification$/i],
    },
    {
      field: 'status',
      patterns: [/^status$/i, /request[\s_-]?status/i, /ticket[\s_-]?status/i, /^state$/i],
    },
    {
      field: 'createdDate',
      patterns: [/created[\s_-]?(time|date|at)/i, /open[\s_-]?date/i, /date[\s_-]?(?:created|opened)/i, /submitted[\s_-]?at/i],
    },
    {
      field: 'lastUpdated',
      patterns: [/last[\s_-]?updated?/i, /updated?[\s_-]?(at|time|date)/i, /modified[\s_-]?at/i],
    },
    {
      field: 'resolvedDate',
      patterns: [/resolved?[\s_-]?(time|date|at)/i, /completed?[\s_-]?(time|date)/i, /closed[\s_-]?(time|date)/i],
    },
    {
      field: 'department',
      patterns: [/department/i, /^dept$/i, /^team$/i, /affected[\s_-]?(?:client|dept|department)/i],
    },
    {
      field: 'remarks',
      patterns: [/^remarks?$/i, /recent[\s_-]?update/i, /latest[\s_-]?update/i, /^notes?$/i, /progress[\s_-]?notes?/i, /delay[\s_-]?reason/i],
    },
    {
      field: 'requester',
      patterns: [/requester/i, /requested[\s_-]?by/i, /caller/i, /reporter/i, /reported[\s_-]?by/i],
    },
    {
      field: 'priority',
      patterns: [/^priority$/i, /severity/i, /urgency/i],
    },
    {
      field: 'description',
      patterns: [/^description$/i, /^subject$/i, /^summary$/i, /short[\s_-]?description/i, /^details?$/i],
    },
  ];

  for (const col of columns) {
    for (const matcher of matchers) {
      if (!mapping[matcher.field]) {
        for (const pattern of matcher.patterns) {
          if (pattern.test(col.trim())) {
            mapping[matcher.field] = col;
            break;
          }
        }
      }
    }
  }

  // If no separate irId was found but ticketId was, use ticketId as irId too
  if (!mapping.irId && mapping.ticketId) {
    mapping.irId = mapping.ticketId;
  }

  return mapping;
}

// ─── Normalize a raw row ──────────────────────────────────────────────────────

function getString(row: IRRawRow, col: string | undefined): string {
  if (!col) return '';
  const val = row[col];
  if (val === undefined || val === null) return '';
  return String(val).trim();
}

function getDate(row: IRRawRow, col: string | undefined): Date | null {
  if (!col) return null;
  return safeDate(row[col]);
}

export function normalizeRow(
  row: IRRawRow,
  mapping: IRColumnMapping,
  rowIndex: number,
  batchId: string,
  referenceDate: Date = new Date()
): NormalizedTicket {
  const rawIrId = getString(row, mapping.irId);
  const rawTicketId = getString(row, mapping.ticketId);

  // Normalize IDs: trim whitespace only (case preserved for numeric IDs)
  const irId = rawIrId;
  const ticketId = rawTicketId || rawIrId; // Fall back to IR ID if no separate ticket ID

  const createdDate = getDate(row, mapping.createdDate);
  const lastUpdated = getDate(row, mapping.lastUpdated);
  const resolvedDate = getDate(row, mapping.resolvedDate);

  // Best available "last movement" date
  let lastMovementDate: Date | null = null;
  let lastMovementSource: NormalizedTicket['lastMovementSource'] = 'none';

  if (resolvedDate) {
    lastMovementDate = resolvedDate;
    lastMovementSource = 'resolvedDate';
  } else if (lastUpdated) {
    lastMovementDate = lastUpdated;
    lastMovementSource = 'lastUpdated';
  } else if (createdDate) {
    lastMovementDate = createdDate;
    lastMovementSource = 'createdDate';
  }

  const rawStatus = getString(row, mapping.status);
  const statusCategory = normalizeStatus(rawStatus);

  const daysSinceMovement = daysAgo(lastMovementDate, referenceDate);
  const agingDays = daysAgo(createdDate, referenceDate);

  // If resolved/closed, label as 'resolved' for aging display
  const agingCategory: AgingCategory =
    statusCategory === 'resolved' || statusCategory === 'closed'
      ? 'resolved'
      : classifyAging(agingDays);

  const inactivityCategory: InactivityCategory =
    (statusCategory === 'resolved' || statusCategory === 'closed')
      ? 'active'
      : classifyInactivity(daysSinceMovement);

  return {
    rowKey: `${batchId}-row${rowIndex}`,
    importBatchId: batchId,
    irId,
    irIdBlank: !irId,
    ticketId,
    ticketIdBlank: !ticketId,
    technician: getString(row, mapping.technician) || 'Unassigned',
    incidentType: getString(row, mapping.incidentType),
    rawStatus,
    statusCategory,
    department: getString(row, mapping.department),
    remarks: getString(row, mapping.remarks),
    requester: getString(row, mapping.requester),
    priority: getString(row, mapping.priority),
    description: getString(row, mapping.description),
    createdDate,
    lastUpdated,
    resolvedDate,
    lastMovementDate,
    lastMovementSource,
    daysSinceMovement,
    agingDays,
    agingCategory,
    inactivityCategory,
    rawRow: row,
    isCanonicalTicket: true,  // set later in deduplication
    isCanonicalIR: true,
    isDuplicate: false,
  };
}

// ─── Import & deduplication ───────────────────────────────────────────────────

/**
 * Process a list of raw rows into normalized, deduplicated tickets.
 * 
 * Deduplication rules:
 * - Tickets with the same non-blank ticketId from the SAME import batch are duplicates.
 * - Across batches, we prefer the latest batch's record (replacing the older one).
 * - Blank IDs are kept as individual rows (never merged).
 */
export function processImportBatch(
  rows: IRRawRow[],
  mapping: IRColumnMapping,
  batchId: string,
  existingTickets: NormalizedTicket[] = [],
  referenceDate: Date = new Date()
): {
  newTickets: NormalizedTicket[];
  batchStats: {
    totalRows: number;
    acceptedRows: number;
    rejectedRows: number;
    duplicateRows: number;
    uniqueIRs: number;
    uniqueTickets: number;
  };
} {
  const normalized: NormalizedTicket[] = rows.map((row, i) =>
    normalizeRow(row, mapping, i, batchId, referenceDate)
  );

  // Deduplicate within new batch: for the same non-blank ticketId, keep the last row
  const batchByTicketId = new Map<string, NormalizedTicket>();
  const batchDuplicates = new Set<string>(); // rowKeys of duplicate rows

  for (const t of normalized) {
    if (!t.ticketIdBlank) {
      const existing = batchByTicketId.get(t.ticketId);
      if (existing) {
        // Mark the earlier one as duplicate, keep the later one
        existing.isDuplicate = true;
        existing.isCanonicalTicket = false;
        batchDuplicates.add(existing.rowKey);
        // Note conflict if statuses differ
        if (existing.statusCategory !== t.statusCategory) {
          t.conflictNote = `Conflict: earlier row had status "${existing.rawStatus}", using latest`;
        }
      }
      batchByTicketId.set(t.ticketId, t);
    }
  }

  // Merge with existing tickets from previous batches
  // For each new canonical ticket, if a ticket with the same non-blank ticketId
  // already exists in the store, replace it (new batch wins for current status)
  const existingByTicketId = new Map<string, NormalizedTicket>();
  for (const t of existingTickets) {
    if (!t.ticketIdBlank && t.isCanonicalTicket) {
      existingByTicketId.set(t.ticketId, t);
    }
  }

  const resolvedResult: NormalizedTicket[] = [...existingTickets];

  for (const t of normalized) {
    if (t.isDuplicate) continue; // Skip within-batch duplicates

    if (!t.ticketIdBlank && existingByTicketId.has(t.ticketId)) {
      // Replace existing canonical record with new batch's version
      const idx = resolvedResult.findIndex(
        (r) => r.isCanonicalTicket && r.ticketId === t.ticketId
      );
      if (idx !== -1) {
        resolvedResult.splice(idx, 1);
      }
    }
    resolvedResult.push(t);
  }

  // Mark canonical IRs
  const irSeen = new Set<string>();
  for (const t of resolvedResult) {
    if (t.irIdBlank) {
      t.isCanonicalIR = true; // blank IDs are always their own
    } else if (!irSeen.has(t.irId)) {
      irSeen.add(t.irId);
      t.isCanonicalIR = true;
    } else {
      t.isCanonicalIR = false;
    }
  }

  // Mark canonical tickets
  const ticketSeen = new Set<string>();
  for (const t of resolvedResult) {
    if (t.ticketIdBlank) {
      t.isCanonicalTicket = true;
    } else if (!ticketSeen.has(t.ticketId)) {
      ticketSeen.add(t.ticketId);
      t.isCanonicalTicket = true;
    } else {
      t.isCanonicalTicket = false;
    }
  }

  const accepted = normalized.filter((t) => !t.isDuplicate).length;
  const rejected = 0; // Rows without any ID are still accepted but flagged
  const duplicateCount = normalized.filter((t) => t.isDuplicate).length;

  const uniqueTicketIds = new Set(
    normalized.filter((t) => !t.isDuplicate && !t.ticketIdBlank).map((t) => t.ticketId)
  );
  const uniqueIRIds = new Set(
    normalized.filter((t) => !t.isDuplicate && !t.irIdBlank).map((t) => t.irId)
  );

  return {
    newTickets: resolvedResult,
    batchStats: {
      totalRows: rows.length,
      acceptedRows: accepted,
      rejectedRows: rejected,
      duplicateRows: duplicateCount,
      uniqueTickets: uniqueTicketIds.size,
      uniqueIRs: uniqueIRIds.size,
    },
  };
}

// ─── Filtering ────────────────────────────────────────────────────────────────

export function applyFilters(
  tickets: NormalizedTicket[],
  filters: IRDashboardFilters
): NormalizedTicket[] {
  const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
  const dateTo = filters.dateTo ? new Date(filters.dateTo + 'T23:59:59') : null;
  const searchLower = filters.search.toLowerCase();

  return tickets.filter((t) => {
    // Canonical only — don't count duplicates in analytics
    if (!t.isCanonicalTicket) return false;

    // Search
    if (searchLower) {
      const matchId = t.ticketId.toLowerCase().includes(searchLower) ||
        t.irId.toLowerCase().includes(searchLower) ||
        t.description.toLowerCase().includes(searchLower);
      if (!matchId) return false;
    }

    // Status filter: match exact rawStatus or normalized statusCategory
    if (filters.status) {
      const target = filters.status.toLowerCase().trim();
      const matchRaw = (t.rawStatus || '').toLowerCase().trim() === target;
      const matchCat = (t.statusCategory || '').toLowerCase().trim() === target;
      if (!matchRaw && !matchCat) return false;
    }

    // Technician filter
    if (filters.technician && t.technician !== filters.technician) return false;

    // Incident type filter
    if (filters.incidentType && t.incidentType !== filters.incidentType) return false;

    // Department filter
    if (filters.department && t.department !== filters.department) return false;

    // Aging category filter
    if (filters.agingCategory && t.agingCategory !== filters.agingCategory) return false;

    // Date range filter
    if (dateFrom || dateTo) {
      let dateVal: Date | null = null;
      switch (filters.dateField) {
        case 'createdDate': dateVal = t.createdDate; break;
        case 'lastUpdated': dateVal = t.lastUpdated; break;
        case 'resolvedDate': dateVal = t.resolvedDate; break;
        case 'lastMovementDate': dateVal = t.lastMovementDate; break;
      }
      if (!dateVal) return false;
      if (dateFrom && dateVal < dateFrom) return false;
      if (dateTo && dateVal > dateTo) return false;
    }

    return true;
  });
}

// ─── Status counting & breakdown ─────────────────────────────────────────────

/**
 * For all request status: get it, count it, compute percentage, and retain IDs.
 * Satisfies the requirement: "for all request status, get it and count it."
 */
export function computeAllRequestStatusCounts(tickets: NormalizedTicket[]): StatusCountItem[] {
  const map = new Map<string, { count: number; ids: string[]; category: TicketStatusCategory }>();
  const total = tickets.length;

  for (const t of tickets) {
    const raw = (t.rawStatus || 'Unknown').trim();
    const entry = map.get(raw) || { count: 0, ids: [], category: t.statusCategory };
    entry.count++;
    entry.ids.push(t.ticketId || t.rowKey);
    map.set(raw, entry);
  }

  return Array.from(map.entries())
    .map(([status, { count, ids, category }]) => ({
      status,
      count,
      category,
      percentage: total > 0 ? (count / total) * 100 : 0,
      ids,
    }))
    .sort((a, b) => b.count - a.count);
}

// ─── Summary stats ────────────────────────────────────────────────────────────

export function computeSummaryStats(
  allRawRows: number,
  filteredTickets: NormalizedTicket[],
  inactivityThresholdDays: number = 7
): IRSummaryStats {
  const uniqueIRs = new Set(filteredTickets.filter((t) => !t.irIdBlank).map((t) => t.irId)).size;
  const uniqueTickets = filteredTickets.length;

  const openTickets = filteredTickets.filter((t) => t.statusCategory === 'open').length;
  const pendingTickets = filteredTickets.filter((t) => t.statusCategory === 'pending').length;
  const inProgressTickets = filteredTickets.filter((t) => t.statusCategory === 'in-progress').length;
  const resolvedTickets = filteredTickets.filter((t) => t.statusCategory === 'resolved').length;
  const closedTickets = filteredTickets.filter((t) => t.statusCategory === 'closed').length;

  const activeTickets = filteredTickets.filter((t) => isActiveTicket(t));

  const noMovement7d = activeTickets.filter(
    (t) => t.daysSinceMovement !== null && t.daysSinceMovement >= 7
  ).length;
  const noMovement14d = activeTickets.filter(
    (t) => t.daysSinceMovement !== null && t.daysSinceMovement >= 14
  ).length;
  const noMovement30d = activeTickets.filter(
    (t) => t.daysSinceMovement !== null && t.daysSinceMovement >= 30
  ).length;

  // Resolution rate
  const eligibleTotal = uniqueTickets;
  const resolutionRate =
    eligibleTotal > 0
      ? ((resolvedTickets + closedTickets) / eligibleTotal) * 100
      : null;

  // Average resolution time (only tickets with both createdDate and resolvedDate)
  const withResolution = filteredTickets.filter(
    (t) => t.createdDate && t.resolvedDate
  );
  const avgResolutionDays =
    withResolution.length > 0
      ? withResolution.reduce((sum, t) => {
        const d = daysBetween(t.createdDate, t.resolvedDate);
        return sum + (d ?? 0);
      }, 0) / withResolution.length
      : null;

  // Oldest inactive ticket
  const inactiveMovementDays = activeTickets
    .map((t) => t.daysSinceMovement)
    .filter((d): d is number => d !== null);
  const oldestInactiveTicketDays =
    inactiveMovementDays.length > 0 ? Math.max(...inactiveMovementDays) : null;

  const avgDaysSinceMovement =
    inactiveMovementDays.length > 0
      ? inactiveMovementDays.reduce((a, b) => a + b, 0) / inactiveMovementDays.length
      : null;

  const statusBreakdown = computeAllRequestStatusCounts(filteredTickets);

  return {
    totalImportedRows: allRawRows,
    totalUniqueIRs: uniqueIRs,
    totalUniqueTickets: uniqueTickets,
    openTickets,
    pendingTickets,
    inProgressTickets,
    resolvedTickets,
    closedTickets,
    noMovement7d,
    noMovement14d,
    noMovement30d,
    resolutionRate,
    avgResolutionDays,
    oldestInactiveTicketDays,
    avgDaysSinceMovement,
    statusBreakdown,
  };
}

// ─── Time-series ──────────────────────────────────────────────────────────────

export function computeMonthlyTrend(
  tickets: NormalizedTicket[],
  dateField: 'createdDate' | 'resolvedDate' = 'createdDate'
): TimeSeriesPoint[] {
  const byMonth = new Map<string, { count: number; ids: string[] }>();

  for (const t of tickets) {
    const d = dateField === 'createdDate' ? t.createdDate : t.resolvedDate;
    if (!d) continue;
    const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const existing = byMonth.get(label) || { count: 0, ids: [] };
    existing.count++;
    existing.ids.push(t.ticketId || t.rowKey);
    byMonth.set(label, existing);
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, { count, ids }]) => ({
      label: formatMonthLabel(label),
      value: count,
      ids,
    }));
}

function formatMonthLabel(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(month) - 1]} ${year}`;
}

// ─── Distribution charts ───────────────────────────────────────────────────────

export function computeStatusDistribution(tickets: NormalizedTicket[]): DistributionBar[] {
  const map = new Map<string, { count: number; ids: string[] }>();
  for (const t of tickets) {
    const raw = (t.rawStatus || t.statusCategory || 'Unknown').trim();
    const key = raw.charAt(0).toUpperCase() + raw.slice(1);
    const entry = map.get(key) || { count: 0, ids: [] };
    entry.count++;
    entry.ids.push(t.ticketId || t.rowKey);
    map.set(key, entry);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(([label, { count, ids }]) => ({
      label,
      value: count,
      ids,
    }));
}

export function computeIncidentTypeDistribution(tickets: NormalizedTicket[]): DistributionBar[] {
  const map = new Map<string, { count: number; ids: string[] }>();
  for (const t of tickets) {
    const key = t.incidentType || '(Unknown)';
    const entry = map.get(key) || { count: 0, ids: [] };
    entry.count++;
    entry.ids.push(t.ticketId || t.rowKey);
    map.set(key, entry);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15)
    .map(([label, { count, ids }]) => ({ label, value: count, ids }));
}

export function computeDepartmentDistribution(tickets: NormalizedTicket[]): DistributionBar[] {
  const map = new Map<string, { count: number; ids: string[] }>();
  for (const t of tickets) {
    const key = t.department || '(Unknown)';
    const entry = map.get(key) || { count: 0, ids: [] };
    entry.count++;
    entry.ids.push(t.ticketId || t.rowKey);
    map.set(key, entry);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15)
    .map(([label, { count, ids }]) => ({ label, value: count, ids }));
}

// ─── Aging distribution ───────────────────────────────────────────────────────

export function computeAgingDistribution(
  tickets: NormalizedTicket[],
  includeResolved: boolean = false
): AgingDistributionRow[] {
  const eligible = includeResolved
    ? tickets
    : tickets.filter((t) => isActiveTicket(t));

  const buckets: Record<AgingCategory, { count: number; ids: string[] }> = {
    '0-2d': { count: 0, ids: [] },
    '3-6d': { count: 0, ids: [] },
    '7-13d': { count: 0, ids: [] },
    '14-29d': { count: 0, ids: [] },
    '30+d': { count: 0, ids: [] },
    'resolved': { count: 0, ids: [] },
  };

  for (const t of eligible) {
    const bucket = t.agingCategory;
    buckets[bucket].count++;
    buckets[bucket].ids.push(t.ticketId || t.rowKey);
  }

  const labels: Record<AgingCategory, string> = {
    '0-2d': '0–2 days',
    '3-6d': '3–6 days',
    '7-13d': '7–13 days',
    '14-29d': '14–29 days',
    '30+d': '30+ days',
    'resolved': 'Resolved',
  };

  const order: AgingCategory[] = ['0-2d', '3-6d', '7-13d', '14-29d', '30+d'];
  if (includeResolved) order.push('resolved');

  return order.map((bucket) => ({
    bucket,
    label: labels[bucket],
    count: buckets[bucket].count,
    value: buckets[bucket].count,
    ids: buckets[bucket].ids,
  }));
}

// ─── Technician rankings ──────────────────────────────────────────────────────

export function computeTechnicianRankings(tickets: NormalizedTicket[]): TechnicianRankRow[] {
  const map = new Map<string, {
    assigned: NormalizedTicket[];
    resolved: NormalizedTicket[];
    open: NormalizedTicket[];
    pending: NormalizedTicket[];
    inProgress: NormalizedTicket[];
    noMovement7d: NormalizedTicket[];
    noMovement14d: NormalizedTicket[];
    noMovement30d: NormalizedTicket[];
    resolutionDays: number[];
  }>();

  for (const t of tickets) {
    const tech = t.technician || 'Unassigned';
    if (!map.has(tech)) {
      map.set(tech, {
        assigned: [], resolved: [], open: [], pending: [], inProgress: [],
        noMovement7d: [], noMovement14d: [], noMovement30d: [], resolutionDays: [],
      });
    }
    const entry = map.get(tech)!;
    entry.assigned.push(t);

    switch (t.statusCategory) {
      case 'resolved': entry.resolved.push(t); break;
      case 'closed': entry.resolved.push(t); break;
      case 'open': entry.open.push(t); break;
      case 'pending': entry.pending.push(t); break;
      case 'in-progress': entry.inProgress.push(t); break;
    }

    if (isActiveTicket(t)) {
      if (t.daysSinceMovement !== null && t.daysSinceMovement >= 7) entry.noMovement7d.push(t);
      if (t.daysSinceMovement !== null && t.daysSinceMovement >= 14) entry.noMovement14d.push(t);
      if (t.daysSinceMovement !== null && t.daysSinceMovement >= 30) entry.noMovement30d.push(t);
    }

    if (t.createdDate && t.resolvedDate) {
      const d = daysBetween(t.createdDate, t.resolvedDate);
      if (d !== null && d >= 0) entry.resolutionDays.push(d);
    }
  }

  const rows: TechnicianRankRow[] = Array.from(map.entries()).map(([tech, data]) => {
    const total = data.assigned.length;
    const resolvedCount = data.resolved.length;
    const resolutionRate = total > 0 ? (resolvedCount / total) * 100 : null;
    const avgResolutionDays =
      data.resolutionDays.length > 0
        ? data.resolutionDays.reduce((a, b) => a + b, 0) / data.resolutionDays.length
        : null;

    return {
      rank: 0,
      technician: tech,
      assigned: total,
      resolved: resolvedCount,
      open: data.open.length,
      pending: data.pending.length,
      inProgress: data.inProgress.length,
      noMovement7d: data.noMovement7d.length,
      noMovement14d: data.noMovement14d.length,
      noMovement30d: data.noMovement30d.length,
      resolutionRate,
      avgResolutionDays,
      ticketIds: data.assigned.map((t) => t.ticketId || t.rowKey),
    };
  });

  // Sort by resolved count descending
  rows.sort((a, b) => b.resolved - a.resolved);
  rows.forEach((r, i) => { r.rank = i + 1; });

  return rows;
}

// ─── Export helpers ───────────────────────────────────────────────────────────

export function exportToCSV(rows: Record<string, unknown>[], filename: string): void {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((h) => {
        const val = row[h];
        const str = val === null || val === undefined ? '' : String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      }).join(',')
    ),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ticketsToExportRows(
  tickets: NormalizedTicket[],
  reportDate: string
): Record<string, unknown>[] {
  return tickets.map((t) => ({
    'Report Date': reportDate,
    'Ticket ID': t.ticketId,
    'IR ID': t.irId,
    'Technician': t.technician,
    'Incident Type': t.incidentType,
    'Status': t.rawStatus,
    'Status Category': t.statusCategory,
    'Department': t.department,
    'Priority': t.priority,
    'Created Date': t.createdDate?.toLocaleString() ?? '',
    'Last Updated': t.lastUpdated?.toLocaleString() ?? '',
    'Resolved Date': t.resolvedDate?.toLocaleString() ?? '',
    'Last Movement Date': t.lastMovementDate?.toLocaleString() ?? '',
    'Last Movement Source': t.lastMovementSource,
    'Days Since Movement': t.daysSinceMovement ?? '',
    'Aging Days': t.agingDays ?? '',
    'Aging Category': t.agingCategory,
    'Inactivity Category': t.inactivityCategory,
    'Remarks': t.remarks,
    'Description': t.description,
  }));
}

// ─── Module report integration ───────────────────────────────────────────────

/**
 * Converts Incidents from generated module reports (Weekly, Monthly, Aging)
 * into NormalizedTicket records for the IR Analytics Dashboard.
 * Enables the dashboard to automatically pull data from reporting modules.
 */
export function convertIncidentsToNormalizedTickets(
  incidents: Incident[],
  batchId: string = 'stored-reports',
  referenceDate: Date = new Date()
): NormalizedTicket[] {
  const result: NormalizedTicket[] = [];

  for (let i = 0; i < incidents.length; i++) {
    const inc = incidents[i];
    const raw = inc.rawData || {};

    const rawId = (
      inc.requestId ||
      String(raw['RequestID'] || raw['Request ID'] || raw['IR ID'] || raw['Ticket ID'] || raw['id'] || '')
    ).trim();

    if (!rawId) continue;

    // Request status: capture exact status from raw data or incident property
    let rawStatus = (
      inc.requestStatus ||
      String(raw['Request Status'] || raw['Status'] || raw['status'] || raw['Ticket Status'] || '')
    ).trim();

    if (!rawStatus) rawStatus = 'Unknown';
    const statusCategory = normalizeStatus(rawStatus);

    // Technician
    const technician = (
      String(raw['Technician'] || '') ||
      inc.assignedTeam ||
      inc.sourceTeam ||
      'Unassigned'
    ).trim();

    // Department
    const department = (
      inc.department ||
      String(raw['Department'] || raw['Affected Client/Department'] || raw['Dept'] || '')
    ).trim();

    // Incident type / category
    const incidentType = (
      inc.category ||
      String(raw['Category'] || raw['Incident Type'] || raw['Type'] || '')
    ).trim();

    // Dates
    const createdDate = toValidDate(inc.createdTime) || toValidDate(raw['Created Time']) || null;
    const resolvedDate = toValidDate(inc.completedTime) || toValidDate(raw['Completed Time']) || toValidDate(raw['Resolved Time']) || null;
    const lastUpdated = toValidDate(raw['Last Updated Date']) || toValidDate(raw['Assigned Time']) || toValidDate(raw['Responded Date']) || null;

    // Movement tracking
    let lastMovementDate: Date | null = null;
    let lastMovementSource: NormalizedTicket['lastMovementSource'] = 'none';

    if (resolvedDate) {
      lastMovementDate = resolvedDate;
      lastMovementSource = 'resolvedDate';
    } else if (lastUpdated) {
      lastMovementDate = lastUpdated;
      lastMovementSource = 'lastUpdated';
    } else if (createdDate) {
      lastMovementDate = createdDate;
      lastMovementSource = 'createdDate';
    }

    const daysSinceMovement = daysAgo(lastMovementDate, referenceDate);
    const agingDays = daysAgo(createdDate, referenceDate);

    const agingCategory: AgingCategory =
      statusCategory === 'resolved' || statusCategory === 'closed'
        ? 'resolved'
        : classifyAging(agingDays);

    const inactivityCategory: InactivityCategory =
      statusCategory === 'resolved' || statusCategory === 'closed'
        ? 'active'
        : classifyInactivity(daysSinceMovement);

    // Remarks & descriptions
    const remarks = (
      inc.recentUpdate ||
      String(raw['Recent Update'] || raw['Remarks'] || raw['remarks'] || raw['Latest Update'] || raw['Resolution:'] || '')
    ).trim();

    const description = (
      inc.description ||
      String(raw['Description'] || raw['Subject'] || raw['Summary'] || '')
    ).trim();

    result.push({
      rowKey: `${batchId}-${rawId}-${i}`,
      importBatchId: batchId,
      irId: rawId,
      irIdBlank: false,
      ticketId: rawId,
      ticketIdBlank: false,
      technician: technician || 'Unassigned',
      incidentType: incidentType || '(Not specified)',
      rawStatus,
      statusCategory,
      department: department || 'Not Assigned',
      remarks,
      requester: String(raw['Requester'] || '').trim(),
      priority: inc.priority || String(raw['Priority'] || '').trim(),
      description,
      createdDate,
      lastUpdated,
      resolvedDate,
      lastMovementDate,
      lastMovementSource,
      daysSinceMovement,
      agingDays,
      agingCategory,
      inactivityCategory,
      rawRow: raw as IRRawRow,
      isCanonicalTicket: true,
      isCanonicalIR: true,
      isDuplicate: false,
    });
  }

  // Deduplicate tickets: if the same ticket appears across multiple reports, keep latest
  const byTicket = new Map<string, NormalizedTicket>();
  for (const t of result) {
    byTicket.set(t.ticketId, t);
  }

  return Array.from(byTicket.values());
}

