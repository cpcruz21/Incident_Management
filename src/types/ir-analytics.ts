export interface IRRawRow {
  [key: string]: string | number | undefined;
}

export interface IRColumnMapping {
  irId?: string;
  ticketId?: string;
  technician?: string;
  incidentType?: string;
  status?: string;
  createdDate?: string;
  lastUpdated?: string;
  resolvedDate?: string;
  department?: string;
  remarks?: string;
  requester?: string;
  priority?: string;
  description?: string;
}

export type TicketStatusCategory = 'open' | 'pending' | 'in-progress' | 'resolved' | 'closed' | 'unknown';

export interface NormalizedTicket {
  rowKey: string;
  importBatchId: string;

  irId: string;
  irIdBlank: boolean;

  ticketId: string;
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

  lastMovementDate: Date | null;
  lastMovementSource: 'resolvedDate' | 'lastUpdated' | 'createdDate' | 'none';

  daysSinceMovement: number | null;
  agingDays: number | null;

  agingCategory: AgingCategory;
  inactivityCategory: InactivityCategory;

  rawRow: IRRawRow;

  isCanonicalTicket: boolean;
  isCanonicalIR: boolean;

  isDuplicate: boolean;
  conflictNote?: string;
}

export type AgingCategory = '0-2d' | '3-6d' | '7-13d' | '14-29d' | '30+d' | 'resolved';
export const AGING_CATEGORY_LABELS: Record<AgingCategory, string> = {
  '0-2d': '0–2 days',
  '3-6d': '3–6 days',
  '7-13d': '7–13 days',
  '14-29d': '14–29 days',
  '30+d': '30+ days',
  'resolved': 'Resolved',
};

export type InactivityCategory = 'active' | '3+d' | '7+d' | '14+d' | '30+d';
export const INACTIVITY_CATEGORY_LABELS: Record<InactivityCategory, string> = {
  'active': 'Active (< 3 days)',
  '3+d': 'No movement 3+ days',
  '7+d': 'No movement 7+ days',
  '14+d': 'No movement 14+ days',
  '30+d': 'No movement 30+ days',
};


export interface ImportBatch {
  id: string;
  fileName: string;
  importedAt: string;
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  duplicateRows: number;
  uniqueIRs: number;
  uniqueTickets: number;
  columnMapping: IRColumnMapping;
  notes?: string;
}

export interface IRImportStore {
  batches: ImportBatch[];
  tickets: NormalizedTicket[];
  lastUpdated: string;
}


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
  resolutionRate: number | null;
  avgResolutionDays: number | null;
  oldestInactiveTicketDays: number | null;
  avgDaysSinceMovement: number | null;
  statusBreakdown: StatusCountItem[];
}

export interface StatusCountItem {
  status: string;
  count: number;
  category: TicketStatusCategory;
  percentage: number;
  ids: string[];
}

export interface TimeSeriesPoint {
  label: string;
  value: number;
  ids?: string[];
}

export interface DistributionBar {
  label: string;
  value: number;
  ids?: string[];
}

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

export interface AgingDistributionRow {
  bucket: AgingCategory;
  label: string;
  count: number;
  value: number;
  ids: string[];
}


export type DateFilterField = 'createdDate' | 'lastUpdated' | 'resolvedDate' | 'lastMovementDate';
export type TechRankMode = 'resolved' | 'assigned' | 'resolutionRate' | 'aging' | 'avgResolution';

export interface IRDashboardFilters {
  dateFrom: string;
  dateTo: string;
  dateField: DateFilterField;
  technician: string;
  status: string;
  incidentType: string;
  department: string;
  agingCategory: string;
  search: string;
  inactivityThreshold: number; // days (default 7)
  includeResolved: boolean;
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

