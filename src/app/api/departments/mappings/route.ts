import { NextResponse } from 'next/server';
import { getAdminSession, requireAdmin } from '@/lib/server/auth';
import { recordAudit } from '@/lib/server/audit';

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
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid mappings payload' },
        { status: 400 }
      );
    }
    saveDepartmentMappings(body);
    recordAudit(getAdminSession(), 'department.updated', { type: 'department', count: Object.keys(body).length });
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
