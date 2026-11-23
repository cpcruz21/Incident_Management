import * as XLSX from 'xlsx';
import type { Incident } from '@/types/incident';
import type { WeeklyReportData } from '@/types/sla';
import { AGING_BUCKET_ORDER, AGING_BUCKET_LABELS, type AgingRemarksRow, type AgingReportData } from '@/types/aging';
import { ALL_TICKETS_COLUMNS, getIncidentMonthlyValue, isRevisedRootCauseColumn, type MonthlyReportData } from '@/types/monthly';
import { REPORT_TEAMS } from '@/lib/routing/routing-engine';

const TECHNICIAN_HEADER = /^(?:(?:assigned |current |support )?technician(?: name)?|assigned (?:to|team)|auto assigned group\/technician|tech(?: name)?|agent(?: name)?)$/i;

function appendRoutedTicketSheets(workbook: XLSX.WorkBook, incidents: Incident[]) {
  const importedHeaders = new Set(
    incidents.flatMap(incident => Object.keys(incident.rawData ?? {})).map(header => header.trim().toLowerCase())
  );

  function routingHeader(label: string) {
    let header = label;
    for (let suffix = 2; importedHeaders.has(header.toLowerCase()); suffix++) {
      header = label + ' (' + suffix + ')';
    }
    return header;
  }

  const originalHeader = routingHeader('Original Technician');
  const reassignedHeader = routingHeader('Re-assigned Technician');
  const teamHeader = routingHeader('Final Team');
  const changedHeader = routingHeader('Was Reassigned');
  const reasonHeader = routingHeader('Routing Reason');

  const rows = incidents.map(incident => {
    const row: Record<string, string | number | boolean | undefined> =
      incident.rawData && Object.keys(incident.rawData).length > 0 ? { ...incident.rawData } : {
        RequestID: incident.requestId,
        Technician: incident.sourceTeam,
        Department: incident.department ?? '',
        Category: incident.category,
        Subcategory: incident.subCategory ?? '',
        Item: incident.item ?? '',
        Description: incident.description ?? '',
        Priority: incident.priority ?? '',
        'Request Status': incident.requestStatus ?? '',
        'Created Time': incident.createdTime?.toLocaleString() ?? '',
        'Responded Date': incident.respondedDate?.toLocaleString() ?? '',
        'Completed Time': incident.completedTime?.toLocaleString() ?? '',
        'First Response Overdue Status': incident.rawFirstResponseStatus ?? String(incident.firstResponseOverdue),
        'Overdue Status': incident.rawResolutionStatus ?? String(incident.resolutionOverdue),
        'Recent Update': incident.recentUpdate ?? '',
      };
    const columns = Object.keys(row);
    const technicianColumn = columns.find(header => header.trim().toLowerCase() === 'technician')
      ?? columns.find(header => TECHNICIAN_HEADER.test(header.trim()))
      ?? 'Technician';
    const original = String(row[technicianColumn] ?? incident.sourceTeam ?? '');
    const routed = incident.assignedTeam || original;
    const reassigned = incident.wasReassigned || Boolean(
      original.trim() && routed.trim().toLowerCase() !== original.trim().toLowerCase()
    );

    return {
      ...row,
      [technicianColumn]: routed,
      [originalHeader]: original,
      [reassignedHeader]: routed,
      [teamHeader]: routed,
      [changedHeader]: reassigned ? 'TRUE' : 'FALSE',
      [reasonHeader]: incident.routingReason || (reassigned ? 'Reassigned by routing rules' : 'Unchanged'),
    };
  });

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Raw Data');

  const reassignedRows = rows.filter(row => row[changedHeader] === 'TRUE');
  const reassignedSheet = reassignedRows.length
    ? XLSX.utils.json_to_sheet(reassignedRows)
    : XLSX.utils.aoa_to_sheet([['Note'], ['No incidents were re-assigned in this reporting period']]);
  XLSX.utils.book_append_sheet(workbook, reassignedSheet, 'Re-assigned Technicians');
}

function appendMonthlyTickets(workbook: XLSX.WorkBook, tickets: Incident[]) {
  const standardHeaders = ALL_TICKETS_COLUMNS.map(column => column.replace(/\n/g, ' '));
  const standardNames = new Set(standardHeaders.map(column => column.toLowerCase()));
  const importedHeaders = Array.from(new Set(tickets.flatMap(ticket => Object.keys(ticket.rawData ?? {}))));
  const extraHeaders = importedHeaders.filter(column =>
    !standardNames.has(column.trim().toLowerCase()) && !isRevisedRootCauseColumn(column)
  );
  const rows = tickets.map(ticket => [
    ...ALL_TICKETS_COLUMNS.map(column => getIncidentMonthlyValue(ticket, column)),
    ...extraHeaders.map(column => ticket.rawData?.[column]),
  ]);
  const sheet = XLSX.utils.aoa_to_sheet([[...standardHeaders, ...extraHeaders], ...rows]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'All Tickets');
}

function agingIncidentRowValues(row: AgingRemarksRow) {
  return [
    row.requestId,
    row.department,
    row.category,
    row.subCategory,
    row.description,
    row.agingDays,
  ];
}

function appendAgingSheets(wb: XLSX.WorkBook, reportData: AgingReportData): void {
  const bucketOrder = AGING_BUCKET_ORDER;
  const distRows: (string | number)[][] = [
    ['Aging Incident Report', reportData.reportPeriod || ''],
    [],
    [
      'FINAL TEAM',
      ...bucketOrder.map((b) => AGING_BUCKET_LABELS[b]),
      'Total Aging IRs (this week)',
      'Total Aging IRs (last week)',
    ],
    ...reportData.agingRows.map((r) => [
      r.teamName,
      ...bucketOrder.map((b) => r.buckets[b] || 0),
      r.totalAging,
      reportData.previousWeek?.teamTotals?.[r.teamName] ?? '-',
    ]),
    [
      'Total',
      ...bucketOrder.map((b) => reportData.agingRows.reduce((sum, r) => sum + (r.buckets[b] || 0), 0)),
      reportData.agingGrandTotal,
      reportData.previousWeek?.grandTotal ?? '-',
    ],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(distRows), 'Aging Distribution');

  const slaRows: (string | number)[][] = [
    ['First Response & Resolution SLA', reportData.reportPeriod || '', 'Aging as of', new Date(reportData.asOf || reportData.generatedAt).toLocaleString('en-US')],
    [],
    [
      'Final Team',
      'Total # of IRs',
      'FR Failed',
      'FR Passed',
      'FR Pass Rate This Week',
      'FR Pass Rate Last Week',
      'RT Failed',
      'RT Passed',
      'RT Pass Rate This Week',
      'RT Pass Rate Last Week',
    ],
    ...reportData.slaRows.map((r) => [
      r.teamName,
      r.totalIRs,
      r.firstResponse.failed,
      r.firstResponse.passed,
      r.firstResponse.slaPassRate !== null ? `${r.firstResponse.slaPassRate.toFixed(2)}%` : 'N/A',
      reportData.previousWeek.sla?.firstResponse[r.teamName] != null ? `${reportData.previousWeek.sla.firstResponse[r.teamName]!.toFixed(2)}%` : 'N/A',
      r.resolutionTime.failed,
      r.resolutionTime.passed,
      r.resolutionTime.slaPassRate !== null ? `${r.resolutionTime.slaPassRate.toFixed(2)}%` : 'N/A',
      reportData.previousWeek.sla?.resolutionTime[r.teamName] != null ? `${reportData.previousWeek.sla.resolutionTime[r.teamName]!.toFixed(2)}%` : 'N/A',
    ]),
    [
      'Total',
      reportData.slaTotals.totalIRs,
      reportData.slaTotals.firstResponse.failed,
      reportData.slaTotals.firstResponse.passed,
      reportData.slaTotals.firstResponse.slaPassRate !== null ? `${reportData.slaTotals.firstResponse.slaPassRate.toFixed(2)}%` : 'N/A',
      reportData.previousWeek.sla?.firstResponseTotal != null ? `${reportData.previousWeek.sla.firstResponseTotal.toFixed(2)}%` : 'N/A',
      reportData.slaTotals.resolutionTime.failed,
      reportData.slaTotals.resolutionTime.passed,
      reportData.slaTotals.resolutionTime.slaPassRate !== null ? `${reportData.slaTotals.resolutionTime.slaPassRate.toFixed(2)}%` : 'N/A',
      reportData.previousWeek.sla?.resolutionTimeTotal != null ? `${reportData.previousWeek.sla.resolutionTimeTotal.toFixed(2)}%` : 'N/A',
    ],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(slaRows), 'SLA Compliance');

  if (reportData.remarksTable) {
    const rt = reportData.remarksTable;
    const remarksSheetRows: (string | number)[][] = [
      ['Created on :', rt.createdOn],
      ['From:', rt.periodFrom, 'To:', rt.periodTo],
      ['TOTAL RECORDS', rt.totalRecords],
      [],
      [
        'RequestID',
        'Department',
        'Category',
        'Sub Category',
        'Description',
        'Aging Days',
        'Recent Update',
        'Responsible or Dependency',
      ],
      ...rt.rows.map(row => [...agingIncidentRowValues(row), row.recentUpdate, row.responsibleOrDependency]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(remarksSheetRows), 'Remarks Table');
  }
}

function appendWeeklySheets(
  wb: XLSX.WorkBook,
  reportData: WeeklyReportData
): void {
  const teams = reportData.teamOrder || REPORT_TEAMS;
  const cw = reportData.currentWeek;
  const pw = reportData.previousWeek;

  const summaryRows: (string | number)[][] = [
    [reportData.reportTitle || 'Closed Incident Weekly Report', reportData.reportPeriod || ''],
    [],
    [
      'Final Team',
      'First Response', '', '', '', '',
      'Resolution Time', '', '', '', '',
    ],
    [
      '',
      'Total # of IRs',
      'Failed',
      'Passed',
      'SLA Pass Rate this week',
      'SLA Pass Rate as of last week',
      'Total # of IRs',
      'Failed',
      'Passed',
      'SLA Pass Rate this week',
      'SLA Pass Rate as of last week',
    ],
    ...teams.map((team) => {
      const fr = cw.firstResponse.find((r) => r.teamName === team);
      const rt = cw.resolutionTime.find((r) => r.teamName === team);
      const frPrev = pw?.firstResponse?.[team];
      const rtPrev = pw?.resolutionTime?.[team];

      return [
        team,
        fr ? fr.total : 0,
        fr ? fr.failed : 0,
        fr ? fr.passed : 0,
        fr && fr.slaPassRate !== null ? `${fr.slaPassRate.toFixed(2)}%` : 'N/A',
        frPrev !== null && frPrev !== undefined ? `${frPrev.toFixed(2)}%` : '-',
        rt ? rt.total : 0,
        rt ? rt.failed : 0,
        rt ? rt.passed : 0,
        rt && rt.slaPassRate !== null ? `${rt.slaPassRate.toFixed(2)}%` : 'N/A',
        rtPrev !== null && rtPrev !== undefined ? `${rtPrev.toFixed(2)}%` : '-',
      ];
    }),
    [
      'Total',
      cw.firstResponseTotal.total,
      cw.firstResponseTotal.failed,
      cw.firstResponseTotal.passed,
      cw.firstResponseTotal.slaPassRate !== null ? `${cw.firstResponseTotal.slaPassRate.toFixed(2)}%` : 'N/A',
      pw?.firstResponseTotal !== null && pw?.firstResponseTotal !== undefined ? `${pw.firstResponseTotal.toFixed(2)}%` : '-',
      cw.resolutionTimeTotal.total,
      cw.resolutionTimeTotal.failed,
      cw.resolutionTimeTotal.passed,
      cw.resolutionTimeTotal.slaPassRate !== null ? `${cw.resolutionTimeTotal.slaPassRate.toFixed(2)}%` : 'N/A',
      pw?.resolutionTimeTotal !== null && pw?.resolutionTimeTotal !== undefined ? `${pw.resolutionTimeTotal.toFixed(2)}%` : '-',
    ],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Weekly SLA Summary');
}

export function exportToXLSX(
  incidents: Incident[],
  reportData: WeeklyReportData | AgingReportData | MonthlyReportData,
  filename: string = 'Extracted_Incidents.xlsx'
): void {
  const workbook = XLSX.utils.book_new();

  if ('technicianSLA' in reportData) {
    appendMonthlyTickets(workbook, reportData.allTickets ?? incidents);
  } else {
    appendRoutedTicketSheets(workbook, incidents);
    if ('agingRows' in reportData) {
      appendAgingSheets(workbook, reportData);
    } else {
      appendWeeklySheets(workbook, reportData);
    }
  }

  XLSX.writeFile(workbook, filename, { bookType: 'xlsx', compression: true });
}
