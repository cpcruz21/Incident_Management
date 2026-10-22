import { NextResponse } from 'next/server';
import { getServerStoredAgingReports, saveServerStoredAgingReport } from '@/lib/server/storage';

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
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid report payload' },
        { status: 400 }
      );
    }
    saveServerStoredAgingReport(body);
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
