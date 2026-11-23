import { NextResponse } from 'next/server';
import { getAdminSession, requireAdmin } from '@/lib/server/auth';
import { recordAudit } from '@/lib/server/audit';
import { isReportCategory, isStoredReport, listArchive, removeFromArchive, storeArchive } from '@/lib/server/archive';
import { saveServerStoredMonthlyReport, saveServerStoredWeeklyReport } from '@/lib/server/storage';
import { isWeeklyReportData, toPublicWeeklyReport } from '@/lib/report/weekly-publication';

export const dynamic = 'force-dynamic';

export function GET() {
  const denied = requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ reports: listArchive() }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.reports) || body.reports.length > 100 || !body.reports.every(isStoredReport)) {
    return NextResponse.json({ error: 'Invalid report archive payload.' }, { status: 400 });
  }
  const importLegacy = body.importLegacy === true;
  const expectedSavedAt = body.expectedSavedAt;
  const monthlyPublication = body.monthlyPublication;
  const weeklyPublication = body.weeklyPublication;
  if (expectedSavedAt !== undefined && (
    importLegacy || body.reports.length !== 1 ||
    typeof expectedSavedAt !== 'string' || !Number.isFinite(Date.parse(expectedSavedAt))
  )) {
    return NextResponse.json({ error: 'Invalid archive update.' }, { status: 400 });
  }
  if (monthlyPublication !== undefined && (
    importLegacy || body.reports.length !== 1 || body.reports[0].type !== 'monthly' || body.reports[0].privateOnly ||
    (monthlyPublication !== 'publish' && monthlyPublication !== 'update') ||
    (monthlyPublication === 'update' && expectedSavedAt === undefined)
  )) {
    return NextResponse.json({ error: 'Invalid Monthly publication request.' }, { status: 400 });
  }
  const weeklyReport = body.reports[0];
  if (weeklyPublication !== undefined && (
    weeklyPublication !== true || importLegacy || body.reports.length !== 1 ||
    weeklyReport.type !== 'weekly' || weeklyReport.privateOnly ||
    !isWeeklyReportData(weeklyReport.reportData) || weeklyReport.period !== weeklyReport.reportData.reportPeriod
  )) {
    return NextResponse.json({ error: 'Invalid Weekly publication request. Check the report period and SLA totals.' }, { status: 400 });
  }
  const account = getAdminSession();
  const reports = importLegacy ? body.reports : body.reports.map((report: import('@/lib/storage/report-storage').StoredReport) => ({
    ...report, author: account?.name,
  }));
  if (!storeArchive(reports, importLegacy, expectedSavedAt)) {
    return NextResponse.json({ error: 'This archive entry changed or was deleted. Reopen it from Archive before saving again.' }, { status: 409 });
  }
  if (reports.length) recordAudit(account, importLegacy ? 'report.imported' : 'report.archived', { type: 'reports', count: reports.length });
  if (weeklyPublication) {
    const { id, title, period, savedAt, reportData } = reports[0];
    try {
      saveServerStoredWeeklyReport({ id, title, period, savedAt, reportData: toPublicWeeklyReport(reportData) });
      recordAudit(account, 'report.published', { type: 'weekly', id });
      return NextResponse.json({ publication: 'updated' });
    } catch (error) {
      console.error('Could not update the Weekly publication:', error);
      return NextResponse.json({ publication: 'failed' });
    }
  }
  if (monthlyPublication) {
    const { id, title, period, author, savedAt, reportData, routedIncidents } = reports[0];
    try {
      const published = saveServerStoredMonthlyReport({
        id, title, period, savedBy: author, savedAt, reportData, routedIncidents,
      }, monthlyPublication === 'update');
      if (published) recordAudit(account, 'report.published', { type: 'monthly', id });
      return NextResponse.json({ publication: published ? 'updated' : 'unchanged' });
    } catch (error) {
      console.error('Could not update the Monthly publication:', error);
      return NextResponse.json({ publication: 'failed' });
    }
  }
  return new NextResponse(null, { status: 204 });
}

export async function DELETE(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (!isReportCategory(body?.type) || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'Invalid report selection.' }, { status: 400 });
  }
  if (removeFromArchive(body.type, body.id)) recordAudit(getAdminSession(), 'report.deleted', { type: body.type, id: body.id });
  return new NextResponse(null, { status: 204 });
}
