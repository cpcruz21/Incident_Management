import { NextResponse } from 'next/server';
import { getAdminSession, requireAdmin } from '@/lib/server/auth';
import { recordAudit } from '@/lib/server/audit';
import { isReportCategory, isStoredReport, listArchive, removeFromArchive, storeArchive } from '@/lib/server/archive';

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
  const account = getAdminSession();
  const reports = importLegacy ? body.reports : body.reports.map((report: import('@/lib/storage/report-storage').StoredReport) => ({
    ...report, author: account?.name,
  }));
  storeArchive(reports, importLegacy);
  if (reports.length) recordAudit(account, importLegacy ? 'report.imported' : 'report.archived', { type: 'reports', count: reports.length });
  return new NextResponse(null, { status: 204 });
}

export async function DELETE(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (getAdminSession()?.role !== 'super-admin') {
    return NextResponse.json({ error: 'Super admin access is required to delete reports.' }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  if (!isReportCategory(body?.type) || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'Invalid report selection.' }, { status: 400 });
  }
  if (removeFromArchive(body.type, body.id)) recordAudit(getAdminSession(), 'report.deleted', { type: body.type, id: body.id });
  return new NextResponse(null, { status: 204 });
}
