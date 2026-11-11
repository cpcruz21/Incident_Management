import { NextResponse } from 'next/server';
import { getAdminSession, requireAdmin } from '@/lib/server/auth';
import { recordAudit } from '@/lib/server/audit';

import { getServerStoredIRAnalytics, saveServerStoredIRAnalytics } from '@/lib/server/storage';

export async function GET() {
  const denied = requireAdmin();
  if (denied) return denied;
  try {
    const data = getServerStoredIRAnalytics();
    return NextResponse.json({
      success: true,
      data: data || { batches: [], tickets: [] },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retrieve IR analytics',
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
        { success: false, error: 'Invalid IR analytics payload' },
        { status: 400 }
      );
    }
    saveServerStoredIRAnalytics(body);
    recordAudit(getAdminSession(), 'analytics.saved', { type: 'analytics' });
    return NextResponse.json({
      success: true,
      message: 'IR analytics persisted to server successfully',
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save IR analytics',
      },
      { status: 500 }
    );
  }
}

