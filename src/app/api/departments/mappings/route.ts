import { NextResponse } from 'next/server';
import { getDepartmentMappings, saveDepartmentMappings } from '@/lib/server/storage';

export async function GET() {
  try {
    const mappings = getDepartmentMappings();
    return NextResponse.json({
      success: true,
      mappings,
      departments: Object.keys(mappings),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retrieve department mappings',
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
        { success: false, error: 'Invalid mappings payload' },
        { status: 400 }
      );
    }
    saveDepartmentMappings(body);
    return NextResponse.json({
      success: true,
      message: 'Department mappings updated successfully',
      mappings: getDepartmentMappings(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save department mappings',
      },
      { status: 500 }
    );
  }
}
