import type { PreviousWeekSLA } from './sla';

export type AgingBucket = '>1month' | '2-4weeks' | '1-2weeks' | '4-6days' | '1-3days' | 'sameday';

export const AGING_BUCKET_LABELS: Record<AgingBucket, string> = {
  '>1month': '> 1 month',
  '2-4weeks': '2 – 4 weeks',
  '1-2weeks': '1 – 2 weeks',
  '4-6days': '4 – 6 days',
  '1-3days': '1 – 3 days',
  'sameday': 'same day',
};

export const AGING_BUCKET_ORDER: AgingBucket[] = [
  '>1month',
  '2-4weeks',
  '1-2weeks',
  '4-6days',
  '1-3days',
  'sameday',
];

export interface TeamAgingResult {
  teamName: string;
  buckets: Record<AgingBucket, number>;
  bucketIncidentIds: Record<AgingBucket, string[]>;
  totalAging: number;
  incidentIds: string[];
}

export interface AgingSLARow {
  teamName: string;
  totalIRs: number;
  firstResponse: {
    failed: number;
    passed: number;
    slaPassRate: number | null;
    failedIds: string[];
    passedIds: string[];
  };
  resolutionTime: {
    failed: number;
    passed: number;
    slaPassRate: number | null;
    failedIds: string[];
    passedIds: string[];
  };
  incidentIds: string[];
}

export interface AgingSLATotals {
  totalIRs: number;
  firstResponse: {
    failed: number;
    passed: number;
    slaPassRate: number | null;
  };
  resolutionTime: {
    failed: number;
    passed: number;
    slaPassRate: number | null;
  };
}

export interface PreviousWeekAging {
  teamTotals: Record<string, number | null>;
  grandTotal: number | null;
  sla?: PreviousWeekSLA;
  sourcePeriod?: string;
  sourceReportId?: string;
}

export interface AgingRemarksRow {
  requestId: string;
  department: string;
  category: string;
  subCategory: string;
  description: string;
  agingDays: number;
  recentUpdate: string;
  responsibleOrDependency: string;
  lastUpdated?: string;
  updatedBy?: string;
  isUnsaved?: boolean;
}

export interface HighImpactIncident {
  requestId: string;
  department: string;
  category: string;
  subCategory?: string;
  description: string;
  agingDays: number;
  recentUpdate: string;
  responsibleOrDependency: string;
  impactLevel: 'Critical' | 'High' | 'Major' | 'Escalated';
  reason: string;
  addedBy?: string;
  addedAt?: string;
}

export interface RemarksTableData {
  createdOn: string;
  periodFrom: string;
  periodTo: string;
  totalRecords: number;
  rows: AgingRemarksRow[];
}

export interface AgingReportData {
  reportId?: string;
  reportTitle: string;
  reportPeriod: string;
  generatedAt: Date;
  asOf?: Date;

  slaRows: AgingSLARow[];
  slaTotals: AgingSLATotals;

  agingRows: TeamAgingResult[];
  agingGrandTotal: number;

  previousWeek: PreviousWeekAging;

  remarksTable?: RemarksTableData;

  highImpactIncidents?: HighImpactIncident[];

  teamOrder: string[];
}
