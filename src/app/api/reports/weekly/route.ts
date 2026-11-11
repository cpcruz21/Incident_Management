import { NextResponse } from 'next/server';
import { getAdminSession, requireAdmin } from '@/lib/server/auth';
import { recordAudit } from '@/lib/server/audit';
import { getServerStoredWeeklyReports, saveServerStoredWeeklyReport } from '@/lib/server/storage';
import { isWeeklyPublication, toPublicWeeklyReport } from '@/lib/report/weekly-publication';

export const dynamic = 'force-dynamic';

export function GET() {
  try {
    return NextResponse.json({ success: true, reports: getServerStoredWeeklyReports() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Could not read published weekly SLA reports:', error);
    return NextResponse.json({ success: false, error: 'Could not load published weekly reports.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (!isWeeklyPublication(body)) {
    return NextResponse.json({ success: false, error: 'Invalid weekly report. Check the report totals and SLA percentages.' }, { status: 400 });
  }
  try {
    saveServerStoredWeeklyReport({ id: body.id, title: body.title, period: body.period,
      reportData: toPublicWeeklyReport(body.reportData), savedAt: new Date().toISOString() });
    recordAudit(getAdminSession(), 'report.published', { type: 'weekly', id: typeof body.id === 'string' ? body.id : undefined });
    return NextResponse.json({ success: true, message: 'Weekly SLA published to the public dashboard.' });
  } catch (error) {
    console.error('Could not persist published weekly SLA summaries:', error);
    return NextResponse.json({ success: false, error: 'Could not publish the weekly report.' }, { status: 500 });
  }
}
