import { NextResponse } from 'next/server';
import { getAdminSession, requireAdmin } from '@/lib/server/auth';
import { recordAudit } from '@/lib/server/audit';

import { getServerStoredAgingReports, saveServerStoredAgingReport } from '@/lib/server/storage';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const reports = getServerStoredAgingReports();
    return NextResponse.json({
      success: true,
      reports,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retrieve reports',
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
        { success: false, error: 'Invalid report payload' },
        { status: 400 }
      );
    }
    saveServerStoredAgingReport(body);
    recordAudit(getAdminSession(), 'report.published', { type: 'aging', id: typeof body.id === 'string' ? body.id : undefined });
    return NextResponse.json({
      success: true,
      message: 'Aging report persisted to server successfully',
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save aging report',
      },
      { status: 500 }
    );
  }
}
