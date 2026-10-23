import { NextResponse } from 'next/server';
import {
  getServerStoredMonthlyReports,
  saveServerStoredMonthlyReport,
} from '@/lib/server/storage';

export async function GET() {
  try {
    const reports = getServerStoredMonthlyReports();
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
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid monthly report payload' },
        { status: 400 }
      );
    }
    saveServerStoredMonthlyReport(body);
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
