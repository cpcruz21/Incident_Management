export interface RawIncidentRow {
  [key: string]: string | number | undefined;
}

export interface ColumnMapping {
  requestId: string;
  technician: string;
  priority: string;
  requestStatus: string;
  createdTime: string;
  respondedDate: string;
  firstResponseOverdueStatus: string;
  completedTime: string;
  overdueStatus: string;
  category: string;
  subCategory?: string;
  item?: string;
  department: string;
  requester: string;
  description?: string;
  recentUpdate?: string;
}

export const DEFAULT_COLUMN_MAPPING: ColumnMapping = {
  requestId: 'RequestID',
  technician: 'Technician',
  priority: 'Priority',
  requestStatus: 'Request Status',
  createdTime: 'Created Time',
  respondedDate: 'Responded Date',
  firstResponseOverdueStatus: 'First Response Overdue Status',
  completedTime: 'Completed Time',
  overdueStatus: 'Overdue Status',
  category: 'Category',
  subCategory: 'Subcategory',
  item: 'Item',
  department: 'Department',
  requester: 'Requester',
  description: 'Description',
  recentUpdate: 'Recent Update',
};

export interface Incident {
  requestId: string;

  sourceTeam: string;

  category: string;

  subCategory?: string;

  item?: string;

  department?: string;

  description?: string;

  recentUpdate?: string;

  assignedTeam: string;

  routingReason: string;

  wasReassigned: boolean;

  priority?: string;
  requestStatus?: string;

  createdTime?: Date;
  respondedDate?: Date;
  completedTime?: Date;

  firstResponseOverdue: boolean;

  acceptableFirstResponseApproval?: {
    approvedBy: string;
    approvedAt: string;
  };

  resolutionOverdue: boolean;

  rawFirstResponseStatus?: string | number | boolean;

  rawResolutionStatus?: string | number | boolean;

  rawData: RawIncidentRow;

  revisedRootCauseType?: string;
  revisedIdentifiedRootCause?: string;
}

export interface ValidationResult {
  incident: Partial<Incident>;
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ValidationSummary {
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  errors: { requestId: string; messages: string[] }[];
  warnings: { requestId: string; messages: string[] }[];
  detectedColumns: string[];
  detectedSourceTeams: string[];
  detectedCategories: string[];
  detectedSubCategories?: string[];
  detectedItems?: string[];
}
