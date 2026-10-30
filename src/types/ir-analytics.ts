/**
 * IR Analytics Dashboard — Type Definitions
 * 
 * Separate from the AgingReportData type used by the existing weekly aging report.
 * This module focuses on raw-data import, IR/ticket deduplication, and analytics.
 */

// ─── Raw import ──────────────────────────────────────────────────────────────

/** A single row exactly as imported from the CSV/Excel file */
export interface IRRawRow {
  [key: string]: string | number | undefined;
}

/** Column mapping from source column names to dashboard fields */
export interface IRColumnMapping {
  irId?: string;           // IR / Incident Report ID
  ticketId?: string;       // Ticket / Request ID (may be same as irId or separate)
  technician?: string;     // Assigned technician or agent
  incidentType?: string;   // Incident category/type
  status?: string;         // Ticket status
  createdDate?: string;    // Ticket creation date
  lastUpdated?: string;    // Last updated timestamp
  resolvedDate?: string;   // Resolution / completion date
  department?: string;     // Department or team
  remarks?: string;        // Remarks, progress notes, or delay reason
  requester?: string;      // Requester or reporter
  priority?: string;       // Priority
  description?: string;    // Description or subject
}

/** Normalized status categories */
export type TicketStatusCategory = 'open' | 'pending' | 'in-progress' | 'resolved' | 'closed' | 'unknown';

/** A normalized ticket/IR record after import and deduplication */
export interface NormalizedTicket {
  /** Unique internal row key (import batch + source row index) */
  rowKey: string;
  /** Import batch ID */
  importBatchId: string;

  /** Normalized IR ID (trimmed, case-adjusted). Empty string if blank in source. */
  irId: string;
  /** Whether the IR ID was blank in the source */
  irIdBlank: boolean;

  /** Normalized Ticket ID. Empty string if blank. */
  ticketId: string;
  /** Whether the Ticket ID was blank in the source */
  ticketIdBlank: boolean;

  technician: string;
  incidentType: string;
  rawStatus: string;
  statusCategory: TicketStatusCategory;
  department: string;
  remarks: string;
  requester: string;
  priority: string;
  description: string;

  createdDate: Date | null;
  lastUpdated: Date | null;
  resolvedDate: Date | null;

  /** Best available date for "last movement" */
  lastMovementDate: Date | null;
  /** Which field was used for lastMovementDate */
  lastMovementSource: 'resolvedDate' | 'lastUpdated' | 'createdDate' | 'none';

  /** Days since last movement (null if no movement date) */
  daysSinceMovement: number | null;
  /** Days since ticket creation */
  agingDays: number | null;

  /** Aging category label */
  agingCategory: AgingCategory;
  /** Inactivity category label */
  inactivityCategory: InactivityCategory;

  /** Original raw row data for audit */
  rawRow: IRRawRow;

  /** Duplicate detection: is this the canonical record for the ticketId? */
  isCanonicalTicket: boolean;
  /** Duplicate detection: is this the canonical record for the irId? */
  isCanonicalIR: boolean;

  /** Whether this is a duplicate of an earlier row (same ticketId from same batch) */
  isDuplicate: boolean;
  /** Conflict notes when same ID has different statuses across rows */
  conflictNote?: string;
}

/** Aging category — based on days since creation */
export type AgingCategory = '0-2d' | '3-6d' | '7-13d' | '14-29d' | '30+d' | 'resolved';
export const AGING_CATEGORY_LABELS: Record<AgingCategory, string> = {
  '0-2d': '0–2 days',
  '3-6d': '3–6 days',
  '7-13d': '7–13 days',
  '14-29d': '14–29 days',
  '30+d': '30+ days',
  'resolved': 'Resolved',
};

/** Inactivity category — based on days since last movement */
export type InactivityCategory = 'active' | '3+d' | '7+d' | '14+d' | '30+d';
export const INACTIVITY_CATEGORY_LABELS: Record<InactivityCategory, string> = {
  'active': 'Active (< 3 days)',
  '3+d': 'No movement 3+ days',
  '7+d': 'No movement 7+ days',
  '14+d': 'No movement 14+ days',
  '30+d': 'No movement 30+ days',
};

// ─── Import batch ─────────────────────────────────────────────────────────────

/** Metadata for a single import operation */
export interface ImportBatch {
  id: string;
  fileName: string;
  importedAt: string; // ISO timestamp
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  duplicateRows: number;
  uniqueIRs: number;
  uniqueTickets: number;
  columnMapping: IRColumnMapping;
  notes?: string;
}

/** Full import state stored in the analytics store */
export interface IRImportStore {
  batches: ImportBatch[];
  tickets: NormalizedTicket[];
  lastUpdated: string;
}

// ─── Analytics results ────────────────────────────────────────────────────────

/** Summary card data */
export interface IRSummaryStats {
  totalImportedRows: number;
  totalUniqueIRs: number;
  totalUniqueTickets: number;
  openTickets: number;
  pendingTickets: number;
  inProgressTickets: number;
  resolvedTickets: number;
  closedTickets: number;
  noMovement7d: number;
  noMovement14d: number;
  noMovement30d: number;
  resolutionRate: number | null; // 0-100
  avgResolutionDays: number | null;
  oldestInactiveTicketDays: number | null;
  avgDaysSinceMovement: number | null;
  /** Complete count of every unique request status in the dataset */
  statusBreakdown: StatusCountItem[];
}

/** Individual status count item for counting all request statuses */
export interface StatusCountItem {
  status: string;
  count: number;
  category: TicketStatusCategory;
  percentage: number;
  ids: string[];
}

/** Single data point in a time-series chart */
export interface TimeSeriesPoint {
  label: string;   // e.g. "Jan 2026", "W01", "2026-01-01"
  value: number;
  ids?: string[];  // ticket or IR IDs for drilldown
}

/** Single bar in a distribution chart */
export interface DistributionBar {
  label: string;
  value: number;
  ids?: string[];
}

/** Technician ranking row */
export interface TechnicianRankRow {
  rank: number;
  technician: string;
  assigned: number;
  resolved: number;
  open: number;
  pending: number;
  inProgress: number;
  noMovement7d: number;
  noMovement14d: number;
  noMovement30d: number;
  resolutionRate: number | null;
  avgResolutionDays: number | null;
  ticketIds: string[];
}

/** Aging distribution row for the bar chart */
export interface AgingDistributionRow {
  bucket: AgingCategory;
  label: string;
  count: number;
  value: number;
  ids: string[];
}

// ─── Global filter state ──────────────────────────────────────────────────────

export type DateFilterField = 'createdDate' | 'lastUpdated' | 'resolvedDate' | 'lastMovementDate';
export type TechRankMode = 'resolved' | 'assigned' | 'resolutionRate' | 'aging' | 'avgResolution';

export interface IRDashboardFilters {
  dateFrom: string;       // ISO date string or empty
  dateTo: string;
  dateField: DateFilterField;
  technician: string;     // empty = all
  status: string;         // empty = all, or TicketStatusCategory
  incidentType: string;   // empty = all
  department: string;     // empty = all
  agingCategory: string;  // empty = all
  search: string;         // ticket ID or IR ID search
  inactivityThreshold: number; // days (default 7)
  includeResolved: boolean; // include resolved in aging / inactivity views
}

export const DEFAULT_FILTERS: IRDashboardFilters = {
  dateFrom: '',
  dateTo: '',
  dateField: 'createdDate',
  technician: '',
  status: '',
  incidentType: '',
  department: '',
  agingCategory: '',
  search: '',
  inactivityThreshold: 7,
  includeResolved: false,
};

