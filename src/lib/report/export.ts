import * as XLSX from 'xlsx';
import { toPng } from 'html-to-image';
import type { Incident } from '@/types/incident';
import type { WeeklyReportData } from '@/types/sla';
import type { AgingReportData } from '@/types/aging';
import type { MonthlyReportData } from '@/types/monthly';
import { ALL_TICKETS_COLUMNS, CLOSED_TICKETS_COLUMNS, getIncidentMonthlyValue } from '@/types/monthly';

export function buildExtractedIncidentRows(incidents: Incident[]): Record<string, unknown>[] {
  return incidents.map((inc) => {
    // Preserve the exact raw data uploaded
    const row: Record<string, unknown> = { ...(inc.rawData || {}) };

    // Find the technician / assigned team column in the raw data
    const techKey = Object.keys(row).find(
      (k) =>
        k.toLowerCase() === 'technician' ||
        k.toLowerCase() === 'assigned team' ||
        k.toLowerCase() === 'auto assigned group/technician' ||
        k.toLowerCase().includes('technician')
    ) || 'Technician';

    // Update technician to the re-assigned team based on the calculator
    row[techKey] = inc.assignedTeam;

    // Ensure Final Team column is present
    row['Final Team'] = inc.assignedTeam;

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
      '',
      reportData.technicianTotals.rtTotal,
      reportData.technicianTotals.rtFailed,
      reportData.technicianTotals.rtPassed,
      '',
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
  const acceptableFR = allInc.filter((i) => !i.firstResponseOverdue);

  // 2. All Tickets sheet
  XLSX.utils.book_append_sheet(wb, makeSheet(allInc, ALL_TICKETS_COLUMNS), 'All Tickets');

  // 3. Closed Tickets sheet
  XLSX.utils.book_append_sheet(wb, makeSheet(closedInc, CLOSED_TICKETS_COLUMNS), 'Closed Tickets');

  // 4. Acceptable First Response sheet
  XLSX.utils.book_append_sheet(wb, makeSheet(acceptableFR, ALL_TICKETS_COLUMNS), 'Acceptable First Response');
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

  // If Remarks Table exists in an Aging Report, place it as the first sheet
  if (reportData && 'remarksTable' in reportData && reportData.remarksTable) {
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
    const wsRemarks = XLSX.utils.aoa_to_sheet(remarksSheetRows);
    XLSX.utils.book_append_sheet(wb, wsRemarks, 'Remarks Table');
  }

  const rows = buildExtractedIncidentRows(incidents);
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

  if (reportData && 'remarksTable' in reportData && reportData.remarksTable) {
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
    const wsRemarks = XLSX.utils.aoa_to_sheet(remarksSheetRows);
    XLSX.utils.book_append_sheet(wb, wsRemarks, 'Remarks Table');
  }

  const rows = buildExtractedIncidentRows(incidents);
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
  const rows = buildExtractedIncidentRows(incidents);
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  downloadBlob(csv, filename, 'text/csv;charset=utf-8;');
}

/**
 * Export extracted raw data as HTML file
 */
export function exportToHTML(
  incidents: Incident[],
  reportData?: WeeklyReportData | AgingReportData | MonthlyReportData | null,
  filename: string = 'Extracted_Incidents.html'
): void {
  const rows = buildExtractedIncidentRows(incidents);
  const ws = XLSX.utils.json_to_sheet(rows);
  const htmlTable = XLSX.utils.sheet_to_html(ws);

  let remarksHtml = '';
  if (reportData && 'technicianSLA' in reportData) {
    const md = reportData as MonthlyReportData;
    remarksHtml = `
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
  } else if (reportData && 'remarksTable' in reportData && reportData.remarksTable) {
    const rt = reportData.remarksTable;
    remarksHtml = `
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
  ${remarksHtml}
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
        if (node.classList && node.classList.contains('btn-save-report')) {
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
