import * as XLSX from 'xlsx';
import { toPng } from 'html-to-image';
import type { Incident } from '@/types/incident';
import type { WeeklyReportData } from '@/types/sla';
import type { AgingReportData } from '@/types/aging';
import { AGING_BUCKET_ORDER, AGING_BUCKET_LABELS } from '@/types/aging';
import type { MonthlyReportData } from '@/types/monthly';
import { ALL_TICKETS_COLUMNS, CLOSED_TICKETS_COLUMNS, FIRST_RESPONSE_COLUMNS, getIncidentMonthlyValue } from '@/types/monthly';
import { filterAcceptableFirstResponse } from '@/lib/monthly/calculator';
import { REPORT_TEAMS } from '@/lib/routing/routing-engine';

/**
 * Checks whether an incident was re-assigned/routed away from its initial technician/team.
 */
export function isIncidentReassigned(inc: Incident): boolean {
  if (inc.wasReassigned) return true;
  const rawRow = inc.rawData || {};
  const techKey = Object.keys(rawRow).find(
    (k) =>
      k.toLowerCase() === 'technician' ||
      k.toLowerCase() === 'assigned team' ||
      k.toLowerCase() === 'auto assigned group/technician' ||
      k.toLowerCase().includes('technician')
  );
  const rawTech = techKey && rawRow[techKey] !== undefined && rawRow[techKey] !== null
    ? String(rawRow[techKey]).trim()
    : (inc.sourceTeam || '').trim();
  const assigned = (inc.assignedTeam || '').trim();

  if (rawTech && assigned && rawTech.toLowerCase() !== assigned.toLowerCase()) {
    return true;
  }
  return false;
}

/**
 * Builds raw incident rows with preserved original technician,
 * re-assigned technician, reassignment status, and routing reason.
 */
export function buildExtractedIncidentRows(
  incidents: Incident[],
  onlyReassigned: boolean = false
): Record<string, unknown>[] {
  const targetIncidents = onlyReassigned
    ? incidents.filter(isIncidentReassigned)
    : incidents;

  return targetIncidents.map((inc) => {
    // Preserve the exact raw data uploaded or fallback to core fields
    const row: Record<string, unknown> =
      inc.rawData && Object.keys(inc.rawData).length > 0
        ? { ...inc.rawData }
        : {
            RequestID: inc.requestId,
            Technician: inc.sourceTeam,
            Department: inc.department || '',
            Category: inc.category || '',
            Subcategory: inc.subCategory || '',
            Item: inc.item || '',
            Priority: inc.priority || '',
            'Request Status': inc.requestStatus || '',
          };

    // Find the technician / assigned team column in the raw data
    const techKey = Object.keys(row).find(
      (k) =>
        k.toLowerCase() === 'technician' ||
        k.toLowerCase() === 'assigned team' ||
        k.toLowerCase() === 'auto assigned group/technician' ||
        k.toLowerCase().includes('technician')
    ) || 'Technician';

    const originalTech =
      row[techKey] !== undefined && row[techKey] !== null && String(row[techKey]).trim() !== ''
        ? String(row[techKey])
        : (inc.sourceTeam || '');

    const reassigned = isIncidentReassigned(inc);

    // Keep the original raw technician in techKey
    row[techKey] = originalTech;

    // Explicit clear columns for technician tracking and reporting
    row['Original Technician'] = originalTech;
    row['Re-assigned Technician'] = inc.assignedTeam || originalTech;
    row['Final Team'] = inc.assignedTeam || originalTech;
    row['Was Reassigned'] = reassigned ? 'TRUE' : 'FALSE';
    row['Routing Reason'] =
      inc.routingReason || (reassigned ? 'Reassigned by routing rules' : 'Unchanged');

    return row;
  });
}

function appendMonthlySheets(
  wb: XLSX.WorkBook,
  reportData: MonthlyReportData,
  fallbackIncidents: Incident[]
): void {
  // 1. SLA Dashboard sheet
  const slaAOA: (string | number)[][] = [
    ['SLA'],
    [],
    ['', 'KPI', 'Count of Passed', 'Total IRs', 'Percentage Value Result'],
    ...reportData.kpis.map((kpi) => [
      kpi.label,
      `${kpi.targetPercent}%`,
      kpi.countOfPassed,
      kpi.totalIRs,
      `${kpi.percentageResult.toFixed(2)}%`,
    ]),
    [],
    ['Technician', 'First Response', '', '', '', 'Resolution Time', '', '', ''],
    ['', 'Total # of IRs', 'Failed', 'Passed', 'SLA Pass Rate', 'Total # of IRs', 'Failed', 'Passed', 'SLA Pass Rate'],
    ...reportData.technicianSLA.map((r) => [
      r.technician,
      r.frTotal,
      r.frFailed,
      r.frPassed,
      r.frPassRate !== null ? `${r.frPassRate.toFixed(2)}%` : '—',
      r.rtTotal,
      r.rtFailed,
      r.rtPassed,
      r.rtPassRate !== null ? `${r.rtPassRate.toFixed(2)}%` : '—',
    ]),
    [
      'Total',
      reportData.technicianTotals.frTotal,
      reportData.technicianTotals.frFailed,
      reportData.technicianTotals.frPassed,
      reportData.technicianTotals.frPassRate !== null ? `${reportData.technicianTotals.frPassRate.toFixed(2)}%` : '—',
      reportData.technicianTotals.rtTotal,
      reportData.technicianTotals.rtFailed,
      reportData.technicianTotals.rtPassed,
      reportData.technicianTotals.rtPassRate !== null ? `${reportData.technicianTotals.rtPassRate.toFixed(2)}%` : '—',
    ],
    [],
    ['Remarks for overall result'],
    ...reportData.remarks.split('\n').map((line) => [line]),
  ];
  const wsSLA = XLSX.utils.aoa_to_sheet(slaAOA);
  XLSX.utils.book_append_sheet(wb, wsSLA, 'SLA');

  const makeSheet = (incidents: Incident[], columns: readonly string[]) => {
    const rows = incidents.map((inc) => {
      const obj: Record<string, string> = {};
      for (const col of columns) {
        obj[col.replace(/\n/g, ' ')] = getIncidentMonthlyValue(inc, col);
      }
      return obj;
    });
    return XLSX.utils.json_to_sheet(rows);
  };

  const allInc = reportData.allTickets || fallbackIncidents;
  const closedInc = reportData.closedTickets || allInc.filter((i) => (i.requestStatus || '').toLowerCase().includes('clos'));
  const acceptableFR = filterAcceptableFirstResponse(allInc);

  // 2. All Tickets sheet
  XLSX.utils.book_append_sheet(wb, makeSheet(allInc, ALL_TICKETS_COLUMNS), 'All Tickets');

  // 3. Closed Tickets sheet
  XLSX.utils.book_append_sheet(wb, makeSheet(closedInc, CLOSED_TICKETS_COLUMNS), 'Closed Tickets');

  // 4. Acceptable First Response sheet
  XLSX.utils.book_append_sheet(wb, makeSheet(acceptableFR, FIRST_RESPONSE_COLUMNS), 'Acceptable First Response');

  // 5. Re-assigned Technicians sheet
  const reassignedRows = buildExtractedIncidentRows(allInc, true);
  if (reassignedRows.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reassignedRows), 'Re-assigned Technicians');
  }
}

function downloadBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function appendAgingSheets(wb: XLSX.WorkBook, reportData: AgingReportData, incidents: Incident[]): void {
  // 1. Aging Distribution Sheet
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

  // 2. SLA Compliance Sheet
  const slaRows: (string | number)[][] = [
    ['First Response & Resolution SLA', reportData.reportPeriod || ''],
    [],
    [
      'Final Team',
      'Total # of IRs',
      'FR Failed',
      'FR Passed',
      'FR Pass Rate',
      'RT Failed',
      'RT Passed',
      'RT Pass Rate',
    ],
    ...reportData.slaRows.map((r) => [
      r.teamName,
      r.totalIRs,
      r.firstResponse.failed,
      r.firstResponse.passed,
      r.firstResponse.slaPassRate !== null ? `${r.firstResponse.slaPassRate.toFixed(2)}%` : 'N/A',
      r.resolutionTime.failed,
      r.resolutionTime.passed,
      r.resolutionTime.slaPassRate !== null ? `${r.resolutionTime.slaPassRate.toFixed(2)}%` : 'N/A',
    ]),
    [
      'Total',
      reportData.slaTotals.totalIRs,
      reportData.slaTotals.firstResponse.failed,
      reportData.slaTotals.firstResponse.passed,
      reportData.slaTotals.firstResponse.slaPassRate !== null ? `${reportData.slaTotals.firstResponse.slaPassRate.toFixed(2)}%` : 'N/A',
      reportData.slaTotals.resolutionTime.failed,
      reportData.slaTotals.resolutionTime.passed,
      reportData.slaTotals.resolutionTime.slaPassRate !== null ? `${reportData.slaTotals.resolutionTime.slaPassRate.toFixed(2)}%` : 'N/A',
    ],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(slaRows), 'SLA Compliance');

  // 3. Remarks Table Sheet
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
      ...rt.rows.map((r) => [
        r.requestId,
        r.department,
        r.category,
        r.subCategory,
        r.description,
        r.agingDays,
        r.recentUpdate,
        r.responsibleOrDependency,
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(remarksSheetRows), 'Remarks Table');
  }

  // 4. Re-assigned Technicians Sheet
  const reassignedRows = buildExtractedIncidentRows(incidents, true);
  if (reassignedRows.length > 0) {
    const wsReassigned = XLSX.utils.json_to_sheet(reassignedRows);
    XLSX.utils.book_append_sheet(wb, wsReassigned, 'Re-assigned Technicians');
  } else {
    const wsEmpty = XLSX.utils.aoa_to_sheet([['Note'], ['No incidents were re-assigned in this reporting period']]);
    XLSX.utils.book_append_sheet(wb, wsEmpty, 'Re-assigned Technicians');
  }

  // 5. Raw Data Sheet
  const rows = buildExtractedIncidentRows(incidents, false);
  const wsIncidents = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, wsIncidents, 'Raw Data');
}

function appendWeeklySheets(
  wb: XLSX.WorkBook,
  reportData: WeeklyReportData,
  incidents: Incident[]
): void {
  // 1. Weekly SLA Summary sheet
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

  // 2. Re-assigned Technicians Sheet
  const reassignedRows = buildExtractedIncidentRows(incidents, true);
  if (reassignedRows.length > 0) {
    const wsReassigned = XLSX.utils.json_to_sheet(reassignedRows);
    XLSX.utils.book_append_sheet(wb, wsReassigned, 'Re-assigned Technicians');
  } else {
    const wsEmpty = XLSX.utils.aoa_to_sheet([['Note'], ['No incidents were re-assigned in this reporting period']]);
    XLSX.utils.book_append_sheet(wb, wsEmpty, 'Re-assigned Technicians');
  }

  // 3. Raw Data Sheet (All Incidents)
  const allRows = buildExtractedIncidentRows(incidents, false);
  const wsAll = XLSX.utils.json_to_sheet(allRows);
  XLSX.utils.book_append_sheet(wb, wsAll, 'Raw Data');
}

export function exportToXLSX(
  incidents: Incident[],
  reportData?: WeeklyReportData | AgingReportData | MonthlyReportData | null,
  filename: string = 'Extracted_Incidents.xlsx'
): void {
  const wb = XLSX.utils.book_new();

  // If Monthly Report Data
  if (reportData && 'technicianSLA' in reportData) {
    appendMonthlySheets(wb, reportData as MonthlyReportData, incidents);
    XLSX.writeFile(wb, filename);
    return;
  }

  // If Aging Report Data
  if (reportData && 'agingRows' in reportData) {
    appendAgingSheets(wb, reportData as AgingReportData, incidents);
    XLSX.writeFile(wb, filename);
    return;
  }

  // If Weekly Report Data
  if (reportData && 'currentWeek' in reportData) {
    appendWeeklySheets(wb, reportData as WeeklyReportData, incidents);
    XLSX.writeFile(wb, filename);
    return;
  }

  const reassignedRows = buildExtractedIncidentRows(incidents, true);
  if (reassignedRows.length > 0) {
    const wsReassigned = XLSX.utils.json_to_sheet(reassignedRows);
    XLSX.utils.book_append_sheet(wb, wsReassigned, 'Re-assigned Technicians');
  }

  const rows = buildExtractedIncidentRows(incidents, false);
  const wsIncidents = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, wsIncidents, 'Raw Data');

  XLSX.writeFile(wb, filename);
}

/**
 * Export extracted raw data and Remarks Table as XLS
 */
export function exportToXLS(
  incidents: Incident[],
  reportData?: WeeklyReportData | AgingReportData | MonthlyReportData | null,
  filename: string = 'Extracted_Incidents.xls'
): void {
  const wb = XLSX.utils.book_new();

  if (reportData && 'technicianSLA' in reportData) {
    appendMonthlySheets(wb, reportData as MonthlyReportData, incidents);
    XLSX.writeFile(wb, filename, { bookType: 'biff8' });
    return;
  }

  if (reportData && 'agingRows' in reportData) {
    appendAgingSheets(wb, reportData as AgingReportData, incidents);
    XLSX.writeFile(wb, filename, { bookType: 'biff8' });
    return;
  }

  if (reportData && 'currentWeek' in reportData) {
    appendWeeklySheets(wb, reportData as WeeklyReportData, incidents);
    XLSX.writeFile(wb, filename, { bookType: 'biff8' });
    return;
  }

  const reassignedRows = buildExtractedIncidentRows(incidents, true);
  if (reassignedRows.length > 0) {
    const wsReassigned = XLSX.utils.json_to_sheet(reassignedRows);
    XLSX.utils.book_append_sheet(wb, wsReassigned, 'Re-assigned Technicians');
  }

  const rows = buildExtractedIncidentRows(incidents, false);
  const wsIncidents = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, wsIncidents, 'Raw Data');
  XLSX.writeFile(wb, filename, { bookType: 'biff8' });
}

/**
 * Export extracted raw data as CSV
 */
export function exportToCSV(
  incidents: Incident[],
  filename: string = 'Extracted_Incidents.csv'
): void {
  const rows = buildExtractedIncidentRows(incidents, false);
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  downloadBlob(csv, filename, 'text/csv;charset=utf-8;');
}

/**
 * Export ONLY re-assigned technician incidents raw data as CSV
 */
export function exportReassignedToCSV(
  incidents: Incident[],
  filename: string = 'Reassigned_Technician_Raw_Data.csv'
): void {
  const rows = buildExtractedIncidentRows(incidents, true);
  const ws = XLSX.utils.json_to_sheet(
    rows.length > 0 ? rows : [{ Note: 'No incidents were re-assigned in this reporting period' }]
  );
  const csv = XLSX.utils.sheet_to_csv(ws);
  downloadBlob(csv, filename, 'text/csv;charset=utf-8;');
}

/**
 * Export ONLY re-assigned technician incidents raw data as XLSX
 */
export function exportReassignedToXLSX(
  incidents: Incident[],
  filename: string = 'Reassigned_Technician_Raw_Data.xlsx'
): void {
  const wb = XLSX.utils.book_new();
  const rows = buildExtractedIncidentRows(incidents, true);
  const ws = XLSX.utils.json_to_sheet(
    rows.length > 0 ? rows : [{ Note: 'No incidents were re-assigned in this reporting period' }]
  );
  XLSX.utils.book_append_sheet(wb, ws, 'Re-assigned Technicians');
  XLSX.writeFile(wb, filename);
}

/**
 * Export extracted raw data as HTML file
 */
export function exportToHTML(
  incidents: Incident[],
  reportData?: WeeklyReportData | AgingReportData | MonthlyReportData | null,
  filename: string = 'Extracted_Incidents.html'
): void {
  const rows = buildExtractedIncidentRows(incidents, false);
  const ws = XLSX.utils.json_to_sheet(rows);
  const htmlTable = XLSX.utils.sheet_to_html(ws);

  let summaryHtml = '';
  if (reportData && 'technicianSLA' in reportData) {
    const md = reportData as MonthlyReportData;
    summaryHtml = `
    <div style="margin-bottom: 30px;">
      <h2 style="background: #fff2cc; color: #000; padding: 8px 16px; border: 1px solid #d6b656; font-size: 18px; margin-bottom: 16px; text-align: center;">SLA Summary</h2>
      
      <table style="border-collapse: collapse; max-width: 550px; margin-bottom: 24px; font-size: 13px;">
        <thead>
          <tr style="background: #d9e1f2;">
            <th style="border: 1px solid #b4c6e7; padding: 6px 12px;"></th>
            <th style="border: 1px solid #b4c6e7; padding: 6px 12px;">KPI</th>
            <th style="border: 1px solid #b4c6e7; padding: 6px 12px;">Count of Passed</th>
            <th style="border: 1px solid #b4c6e7; padding: 6px 12px;">Total IRs</th>
            <th style="border: 1px solid #b4c6e7; padding: 6px 12px;">Percentage Value Result</th>
          </tr>
        </thead>
        <tbody>
          ${md.kpis.map((k) => `
            <tr>
              <td style="border: 1px solid #d1d5db; padding: 6px 12px; font-weight: bold;">${k.label}</td>
              <td style="border: 1px solid #d1d5db; padding: 6px 12px; text-align: center; color: #0066cc; font-weight: bold;">${k.targetPercent}%</td>
              <td style="border: 1px solid #d1d5db; padding: 6px 12px; text-align: center; font-weight: bold;">${k.countOfPassed}</td>
              <td style="border: 1px solid #d1d5db; padding: 6px 12px; text-align: center; font-weight: bold;">${k.totalIRs}</td>
              <td style="border: 1px solid #d1d5db; padding: 6px 12px; text-align: center; font-weight: bold; color: ${k.percentageResult >= k.targetPercent ? '#16a34a' : '#dc2626'};">${k.percentageResult.toFixed(2)}%</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <h3 style="color: #1f4e79; margin-bottom: 8px;">Remarks for overall result</h3>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; margin-bottom: 24px; font-size: 13px; line-height: 1.6;">
        ${md.remarks.split('\n').map((line) => line ? `<p style="margin: 4px 0;">${line}</p>` : '<br/>').join('')}
      </div>
    </div>
    `;
  } else if (reportData && 'currentWeek' in reportData) {
    const wd = reportData as WeeklyReportData;
    summaryHtml = `
    <div style="margin-bottom: 30px;">
      <h2 style="color: #1f4e79; margin-bottom: 4px;">${wd.reportTitle || 'Closed Incident Weekly Report'}</h2>
      <p style="color: #6b7280; font-size: 13px; margin-bottom: 16px;">${wd.reportPeriod || ''}</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 800px; font-size: 12px; margin-bottom: 24px;">
        <thead>
          <tr style="background: #1f4e79; color: #fff;">
            <th style="padding: 6px 10px; border: 1px solid #d1d5db;">Final Team</th>
            <th style="padding: 6px 10px; border: 1px solid #d1d5db;">FR Total</th>
            <th style="padding: 6px 10px; border: 1px solid #d1d5db;">FR Pass Rate</th>
            <th style="padding: 6px 10px; border: 1px solid #d1d5db;">RT Total</th>
            <th style="padding: 6px 10px; border: 1px solid #d1d5db;">RT Pass Rate</th>
          </tr>
        </thead>
        <tbody>
          ${(wd.teamOrder || REPORT_TEAMS).map((team) => {
            const fr = wd.currentWeek.firstResponse.find((r) => r.teamName === team);
            const rt = wd.currentWeek.resolutionTime.find((r) => r.teamName === team);
            return `
              <tr>
                <td style="padding: 6px 10px; border: 1px solid #d1d5db; font-weight: bold; color: #1d4ed8;">${team}</td>
                <td style="padding: 6px 10px; border: 1px solid #d1d5db; text-align: center;">${fr ? fr.total : 0}</td>
                <td style="padding: 6px 10px; border: 1px solid #d1d5db; text-align: center;">${fr && fr.slaPassRate !== null ? `${fr.slaPassRate.toFixed(2)}%` : 'N/A'}</td>
                <td style="padding: 6px 10px; border: 1px solid #d1d5db; text-align: center;">${rt ? rt.total : 0}</td>
                <td style="padding: 6px 10px; border: 1px solid #d1d5db; text-align: center;">${rt && rt.slaPassRate !== null ? `${rt.slaPassRate.toFixed(2)}%` : 'N/A'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    `;
  } else if (reportData && 'agingRows' in reportData && (reportData as AgingReportData).remarksTable) {
    const rt = (reportData as AgingReportData).remarksTable!;
    summaryHtml = `
    <div style="margin-bottom: 30px;">
      <h2 style="color: #000; margin-bottom: 12px;">Remarks Table (Aging Days &ge; 8)</h2>
      <table style="border: 2px solid #000; border-collapse: collapse; max-width: 450px; margin-bottom: 16px;">
        <tr>
          <td style="border: 1px solid #000; padding: 6px 12px; font-weight: bold; width: 50%;">Created on :</td>
          <td style="border: 1px solid #000; padding: 6px 12px; color: #ff0000; font-weight: bold; text-align: center;">${rt.createdOn}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 6px 12px; font-weight: bold;">From: <span style="color: #ff0000;">${rt.periodFrom}</span></td>
          <td style="border: 1px solid #000; padding: 6px 12px; font-weight: bold;">To: <span style="color: #ff0000;">${rt.periodTo}</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 6px 12px; font-weight: bold;">TOTAL RECORDS</td>
          <td style="border: 1px solid #000; padding: 6px 12px; color: #ff0000; font-weight: bold; text-align: center;">${rt.totalRecords}</td>
        </tr>
      </table>

      <table style="border-collapse: collapse; width: 100%; border: 1px solid #000; font-size: 11px;">
        <thead>
          <tr style="background: #cccccc; color: #000; font-weight: bold; text-align: center;">
            <th style="border: 1px solid #000; padding: 6px;">RequestID</th>
            <th style="border: 1px solid #000; padding: 6px;">Department</th>
            <th style="border: 1px solid #000; padding: 6px;">Category</th>
            <th style="border: 1px solid #000; padding: 6px;">Sub Category</th>
            <th style="border: 1px solid #000; padding: 6px;">Description</th>
            <th style="border: 1px solid #000; padding: 6px;">Aging Days</th>
            <th style="border: 1px solid #000; padding: 6px;">Recent Update</th>
            <th style="border: 1px solid #000; padding: 6px;">Responsible or Dependency</th>
          </tr>
        </thead>
        <tbody>
          ${rt.rows.map((r) => `
            <tr>
              <td style="border: 1px solid #000; padding: 5px; text-align: center; color: #0066cc; font-weight: bold;">${r.requestId}</td>
              <td style="border: 1px solid #000; padding: 5px; text-align: center;">${r.department}</td>
              <td style="border: 1px solid #000; padding: 5px;">${r.category}</td>
              <td style="border: 1px solid #000; padding: 5px;">${r.subCategory || '-'}</td>
              <td style="border: 1px solid #000; padding: 5px;">${r.description || '-'}</td>
              <td style="border: 1px solid #000; padding: 5px; text-align: center; color: #cc0000; font-weight: bold;">${r.agingDays}</td>
              <td style="border: 1px solid #000; padding: 5px; ${r.recentUpdate ? 'background: #00e600; font-weight: 500;' : ''}">${r.recentUpdate || ''}</td>
              <td style="border: 1px solid #000; padding: 5px; text-align: center; font-weight: bold;">${r.responsibleOrDependency}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    `;
  }

  // Re-assigned incidents section in HTML
  let reassignedHtml = '';
  const reassignedIncidents = incidents.filter(isIncidentReassigned);
  if (reassignedIncidents.length > 0) {
    const reassignedTable = XLSX.utils.sheet_to_html(
      XLSX.utils.json_to_sheet(buildExtractedIncidentRows(incidents, true))
    );
    reassignedHtml = `
    <div style="margin-bottom: 30px;">
      <h2 style="color: #0d9488; margin-bottom: 4px;">Re-assigned Technician Raw Incidents (${reassignedIncidents.length})</h2>
      <p class="meta">Incidents where technician assignment was re-routed based on department/category rules</p>
      ${reassignedTable}
    </div>
    `;
  }

  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Extracted Incident Data & Remarks Table</title>
  <style>
    body { font-family: 'Calibri', 'Segoe UI', Arial, sans-serif; margin: 24px; background: #ffffff; color: #111827; }
    h2 { color: #1f4e79; margin-bottom: 4px; }
    p.meta { color: #6b7280; font-size: 13px; margin-bottom: 20px; }
    table { border-collapse: collapse; width: 100%; font-size: 12px; margin-bottom: 24px; }
    th, td { border: 1px solid #d1d5db; padding: 6px 10px; text-align: left; }
    th { background: #1f4e79; color: #ffffff; font-weight: 600; }
    tr:nth-child(even) { background: #f9fafb; }
    tr:hover { background: #f3f4f6; }
  </style>
</head>
<body>
  ${summaryHtml}
  ${reassignedHtml}
  <h2>Extracted Raw Incident Data</h2>
  <p class="meta">Generated: ${new Date().toLocaleString()}</p>
  ${htmlTable}
</body>
</html>`;

  downloadBlob(fullHtml, filename, 'text/html;charset=utf-8;');
}

/**
 * Export report as PDF (triggers print dialog)
 */
export function exportToPDF(): void {
  window.print();
}

/**
 * Export table as high-resolution PNG on pure white background
 */
export async function exportAsPng(elementId: string, filename: string = 'sla-report.png'): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with id "${elementId}" not found`);
  }

  try {
    const dataUrl = await toPng(element, {
      quality: 1.0,
      pixelRatio: 2.5,
      backgroundColor: '#ffffff',
      filter: (node: HTMLElement) => {
        if (node.classList && (
          node.classList.contains('btn-save-report') ||
          node.classList.contains('weekly-table-action-bar') ||
          node.classList.contains('no-export')
        )) {
          return false;
        }
        return true;
      },
      style: {
        background: '#ffffff',
        backgroundColor: '#ffffff',
        transform: 'scale(1)',
        transformOrigin: 'top left',
        margin: '0',
        overflow: 'visible',
        overflowX: 'visible',
        overflowY: 'visible',
        scrollbarWidth: 'none',
      },
    });

    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.click();
  } catch (error) {
    console.error('Failed to export as PNG:', error);
    throw error;
  }
}
