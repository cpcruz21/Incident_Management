/** Monthly Report – Type definitions */

import type { Incident } from './incident';
import type { SLAReport, TeamSLAResult } from './sla';

// ─── Column sets ──────────────────────────────────────────────
/** The full column list for the "All Tickets" sheet */
export const ALL_TICKETS_COLUMNS = [
  'RequestID',
  'Technician',
  'Affected Client/Department',
  'Category',
  'Sub Category',
  'Item',
  'If others, please specify',
  'System/Application/Server name:',
  'Impact Details',
  'Priority',
  'Description',
  'Findings',
  'Resolution:',
  'Identified Root cause of the Problem',
  'Root Cause Type',
  'Identified Root Cause',
  'Revised Root Cause Type',
  'Revised Identified Root Cause',
  'Lessons Learned',
  'Accomplished By',
  'Request Status',
  'Closing Comments',
  'Closure Code',
  'Closure Comments',
  'Location of the Incident:',
  'Created Time',
  'Date/Time Occurred:',
  'Assigned Time',
  'First Response Overdue Status',
  'Responded Date',
  'Response Due By Time',
  'Due By Time',
  'Time Elapsed',
  'Resolved Time',
  'Overdue Status',
  'Completed Time',
  'Duration',
  'Did it exceed 24 hours?\nFALSE',
  'Remarks',
] as const;

/** The column list for the "Closed Tickets" sheet */
export const CLOSED_TICKETS_COLUMNS = [
  'RequestID',
  'Technician',
  'Affected Client/Department',
  'Category',
  'Sub Category',
  'Item',
  'If others, please specify',
  'System/Application/Server name:',
  'Impact Details',
  'Priority',
  'Description',
  'Findings',
  'Resolution:',
  'Identified Root cause of the Problem',
  'Root Cause Type',
  'Identified Root Cause',
  'Lessons Learned',
  'Accomplished By',
  'Request Status',
  'Closing Comments',
  'Closure Code',
  'Closure Comments',
  'Location of the Incident:',
  'Created Time',
  'Date/Time Occurred:',
  'Assigned Time',
  'First Response Overdue Status',
  'Responded Date',
  'Response Due By Time',
  'Due By Time',
  'Time Elapsed',
  'Resolved Time',
  'Overdue Status',
  'Completed Time',
  'Duration',
  'Did it exceed 24 hours?\nFALSE',
  'Remarks',
] as const;

/** Acceptable First Response specific columns */
export const FIRST_RESPONSE_COLUMNS = [
  'Request ID',
  'Technician',
  'Category',
  'Sub Cat',
  'Status',
  'Created Time',
  'Response Time',
  'First Response Overdue Status',
  'Did it exceed 24 hrs ? FALSE',
] as const;

/** Helper: extract column value from an incident */
export function getIncidentMonthlyValue(inc: Incident, colName: string): string {
  const lc = colName.toLowerCase().replace(/[\r\n\s:?_]/g, '');

  // Special overrides for First Response metrics
  if (lc === 'firstresponseoverduestatus') {
    return inc.firstResponseOverdue ? 'TRUE' : 'FALSE';
  }
  if (lc.includes('exceed') && lc.includes('24')) {
    if (inc.rawData) {
      for (const [k, v] of Object.entries(inc.rawData)) {
        if (/exceed.*24/i.test(k)) {
          return String(v ?? '');
        }
      }
    }
    return 'FALSE';
  }

  if (inc.rawData) {
    if (inc.rawData[colName] !== undefined && inc.rawData[colName] !== null) {
      return String(inc.rawData[colName]);
    }
    for (const [k, v] of Object.entries(inc.rawData)) {
      if (k.toLowerCase().replace(/[\r\n\s:?_]/g, '') === lc) {
        return v !== undefined && v !== null ? String(v) : '';
      }
    }
    // Match common column aliases
    if (lc === 'subcat') {
      const v = inc.rawData['Sub Category'] || inc.rawData['SubCategory'] || inc.rawData['Sub-Category'];
      if (v !== undefined && v !== null) return String(v);
    }
    if (lc === 'status') {
      const v = inc.rawData['Request Status'] || inc.rawData['Status'];
      if (v !== undefined && v !== null) return String(v);
    }
    if (lc === 'responsetime') {
      const v = inc.rawData['Responded Date'] || inc.rawData['Response Time'];
      if (v !== undefined && v !== null) return String(v);
    }
  }

  const key = lc;
  switch (key) {
    case 'requestid': return inc.requestId || '';
    case 'technician': return inc.assignedTeam || inc.sourceTeam || '';
    case 'category': return inc.category || '';
    case 'subcat':
    case 'subcategory': return inc.subCategory || '';
    case 'item': return inc.item || '';
    case 'priority': return inc.priority || '';
    case 'description': return inc.description || '';
    case 'status':
    case 'requeststatus': return inc.requestStatus || '';
    case 'createdtime': return inc.rawData?.['Created Time'] ? String(inc.rawData['Created Time']) : (inc.createdTime ? inc.createdTime.toLocaleString() : '');
    case 'responsetime':
    case 'respondeddate': return inc.rawData?.['Responded Date'] ? String(inc.rawData['Responded Date']) : (inc.respondedDate ? inc.respondedDate.toLocaleString() : '');
    case 'completedtime': return inc.rawData?.['Completed Time'] ? String(inc.rawData['Completed Time']) : (inc.completedTime ? inc.completedTime.toLocaleString() : '');
    case 'firstresponseoverduestatus': return inc.firstResponseOverdue ? 'TRUE' : 'FALSE';
    case 'overduestatus': return inc.resolutionOverdue ? 'TRUE' : 'FALSE';
    case 'revisedrootcausetype': return inc.revisedRootCauseType || '';
    case 'revisedidentifiedrootcause': return inc.revisedIdentifiedRootCause || '';
    default: return '';
  }
}

// ─── Monthly report data model ───────────────────────────────

/** KPI target row shown in the SLA summary */
export interface MonthlyKPI {
  label: string;          // e.g. "Target Response Time"
  targetPercent: number;  // e.g. 85
  countOfPassed: number;
  totalIRs: number;
  percentageResult: number;
}

/** SLA per-technician row */
export interface MonthlyTechnicianSLA {
  technician: string;

  // First Response
  frTotal: number;
  frFailed: number;
  frPassed: number;
  frPassRate: number | null;
  frFailedIds: string[];
  frPassedIds: string[];
  frTotalIds: string[];

  // Resolution Time
  rtTotal: number;
  rtFailed: number;
  rtPassed: number;
  rtPassRate: number | null;
  rtFailedIds: string[];
  rtPassedIds: string[];
  rtTotalIds: string[];
}

/** Root cause breakdown row */
export interface RootCauseRow {
  rootCause: string;
  count: number;
  incidentIds: string[];
}

/** Full monthly report data */
export interface MonthlyReportData {
  reportTitle: string;
  reportPeriod: string;
  generatedAt: Date;

  /** All tickets in the period */
  allTickets: Incident[];

  /** Only closed/resolved tickets */
  closedTickets: Incident[];

  /** KPI summary */
  kpis: MonthlyKPI[];

  /** Per-technician SLA breakdown */
  technicianSLA: MonthlyTechnicianSLA[];

  /** Technician totals row */
  technicianTotals: MonthlyTechnicianSLA;

  /** Root cause breakdown */
  rootCauses: RootCauseRow[];

  /** Underlying SLA report (re-use existing calculator) */
  slaReport: SLAReport;

  /** Generated remarks text */
  remarks: string;

  /** Ordered list of teams */
  teamOrder: string[];
}

// ──────── Root Cause Factors & Identified Root Causes ──────────────────────────

export const ROOT_CAUSE_FACTORS: Record<string, string[]> = {
  'Human Factors': [
    'Human Error: Mistakes made by individuals due to lack of attention, knowledge, or skill.',
    'Inadequate Training: Insufficient training for personnel leading to errors or inefficiencies.',
    'Lack of Communication: Poor communication among team members or departments causing misunderstandings or errors.',
    'Non-compliance: Failure to follow established procedures or regulations.',
  ],
  'Technical Factors': [
    'Equipment Failure: Breakdown or malfunction of machinery or equipment.',
    'Software Issues: Bugs, glitches, or compatibility problems in software systems.',
    'Design Flaws: Inherent flaws in the design of products, systems, or processes.',
    'Insufficient Maintenance: Lack of proper upkeep leading to deterioration and failures.',
  ],
  'Process Factors': [
    'Inadequate Procedures: Ineffective or poorly designed processes and workflows.',
    'Poor Planning: Poor planning or scheduling resulting in issues.',
    'Inefficient Workflows: Processes that are not optimized for efficiency.',
    'Lack of Standardization: Variability in processes leading to inconsistencies.',
  ],
  'Organizational Factors': [
    'Management Issues: Poor leadership, decision-making, or management practices.',
    'Resource Limitations: Insufficient resources such as manpower, equipment, or budget.',
    'Inadequate Policies: Policies that are unclear, incomplete, or not enforced.',
    'Organizational Culture: A work environment that does not support best practices or continuous improvement.',
  ],
  'Environmental Factors': [
    'External Disruptions: Events such as natural disasters, power outages, or other external factors.',
    'Workplace Conditions: Physical conditions such as lighting, noise, or temperature that affect performance.',
    'Environmental Interference: External factors that disrupt operations, such as weather conditions.',
  ],
  'External Factors': [
    'Supplier Issues: Problems with vendors or suppliers that affect the supply chain.',
    'Regulatory Changes: Changes in laws or regulations that impact operations.',
    'Market Fluctuations: Economic or market changes that affect business conditions.',
    'Customer Demands: Changes in customer requirements or expectations.',
    'Incorrect External Information: Inaccurate, incomplete, or misleading details from clients or external parties causing errors.',
  ],
  'Security Factors': [
    'Unauthorized or Improper Access: Access to systems, areas, or data without valid authority, including misuse of credentials.',
    'Social Engineering Attacks: Deceptive actions that lead to unauthorized disclosure of sensitive information.',
    'Malicious System Interference: Introduction or execution of harmful software that disrupts operations, alters data, or damages systems.',
    'Data Protection Failure: Exposure, loss, or unauthorized processing of sensitive or personal data due to inadequate security controls.',
  ],
};

export const ROOT_CAUSE_TYPES = Object.keys(ROOT_CAUSE_FACTORS);

/** Find the parent Root Cause Type for a given Identified Root Cause string */
export function findRootCauseType(identifiedCause: string): string | undefined {
  if (!identifiedCause) return undefined;
  const clean = identifiedCause.trim().toLowerCase();
  for (const [type, causes] of Object.entries(ROOT_CAUSE_FACTORS)) {
    if (
      causes.some((c) => {
        const cLower = c.toLowerCase();
        const shortName = cLower.split(':')[0].trim();
        return cLower === clean || clean === shortName || clean.startsWith(shortName);
      })
    ) {
      return type;
    }
  }
  return undefined;
}

