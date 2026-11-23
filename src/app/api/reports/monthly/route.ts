import { NextResponse } from 'next/server';
import { getAdminSession, requireAdmin } from '@/lib/server/auth';
import { recordAudit } from '@/lib/server/audit';
import { refreshStoredMonthlyReport } from '@/lib/monthly/calculator';
import type { Incident } from '@/types/incident';
import type { MonthlyReportData } from '@/types/monthly';

import {
  getServerStoredMonthlyReports,
  saveServerStoredMonthlyReport,
} from '@/lib/server/storage';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const reports = getServerStoredMonthlyReports().map((report) => {
      if (!report.reportData || typeof report.reportData !== 'object') return report;
      const incidents = Array.isArray(report.routedIncidents) ? report.routedIncidents as Incident[] : undefined;
      return { ...report, reportData: refreshStoredMonthlyReport(report.reportData as MonthlyReportData, incidents) };
    });
    return NextResponse.json({
      success: true,
      reports,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retrieve monthly reports',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid monthly report payload' },
        { status: 400 }
      );
    }
    saveServerStoredMonthlyReport(body);
    recordAudit(getAdminSession(), 'report.published', { type: 'monthly', id: typeof body.id === 'string' ? body.id : undefined });
    return NextResponse.json({
      success: true,
      message: 'Monthly report persisted to server successfully',
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save monthly report',
      },
      { status: 500 }
    );
  }
}
