import { NextResponse } from 'next/server';
import { getServerStoredIRAnalytics, saveServerStoredIRAnalytics } from '@/lib/server/storage';

export async function GET() {
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
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid IR analytics payload' },
        { status: 400 }
      );
    }
    saveServerStoredIRAnalytics(body);
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

