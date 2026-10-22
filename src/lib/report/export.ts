import * as XLSX from 'xlsx';
import { toPng } from 'html-to-image';
import type { Incident } from '@/types/incident';
import type { WeeklyReportData } from '@/types/sla';
import type { AgingReportData } from '@/types/aging';

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
  reportData?: WeeklyReportData | AgingReportData | null,
  filename: string = 'Extracted_Incidents.xlsx'
): void {
  const wb = XLSX.utils.book_new();

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
  reportData?: WeeklyReportData | AgingReportData | null,
  filename: string = 'Extracted_Incidents.xls'
): void {
  const wb = XLSX.utils.book_new();

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
  reportData?: WeeklyReportData | AgingReportData | null,
  filename: string = 'Extracted_Incidents.html'
): void {
  const rows = buildExtractedIncidentRows(incidents);
  const ws = XLSX.utils.json_to_sheet(rows);
  const htmlTable = XLSX.utils.sheet_to_html(ws);

  let remarksHtml = '';
  if (reportData && 'remarksTable' in reportData && reportData.remarksTable) {
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
