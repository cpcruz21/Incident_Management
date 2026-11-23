'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { isAdmin, type Account } from '@/lib/auth';
import type { Incident } from '@/types/incident';
import type { WeeklyReportData } from '@/types/sla';
import type { AgingReportData } from '@/types/aging';
import type { MonthlyReportData } from '@/types/monthly';

export function ReportExportButton({ account, incidents, reportData, baseFilename }: {
  account: Account | null;
  incidents: Incident[];
  reportData: WeeklyReportData | AgingReportData | MonthlyReportData;
  baseFilename: string;
}) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  if (!isAdmin(account)) return null;

  const handleExport = async () => {
    setExporting(true);
    setError('');
    try {
      const { exportToXLSX } = await import('@/lib/report/export');
      const date = new Date().toISOString().slice(0, 10);
      exportToXLSX(incidents, reportData, `${baseFilename}_${date}.xlsx`);
    } catch (error) {
      setError(error instanceof Error && error.message.includes('32767')
        ? 'An imported field exceeds Excel’s 32,767-character cell limit.'
        : 'Could not export the Excel workbook. Try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <button type="button" className="btn btn-export" onClick={handleExport} disabled={exporting}>
        <Download size={16} aria-hidden="true" /> {exporting ? 'Exporting…' : 'Export XLSX'}
      </button>
      {error && <p className="admin-error" role="alert">{error}</p>}
    </>
  );
}
