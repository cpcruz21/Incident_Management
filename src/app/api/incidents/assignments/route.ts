import { NextResponse } from 'next/server';
import {
  getStoredAssignments,
  saveAssignment,
  saveAssignmentsBulk,
  isTeamAllowedForDepartment,
  getAllowedTeamsForDepartment,
  StoredIncidentAssignment,
} from '@/lib/server/storage';

export async function GET() {
  try {
    const assignments = getStoredAssignments();
    return NextResponse.json({
      success: true,
      assignments,
      total: Object.keys(assignments).length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retrieve assignments',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Check if bulk save or single item save
    if (Array.isArray(body)) {
      const validationErrors: { requestId: string; error: string }[] = [];
      const validItems: StoredIncidentAssignment[] = [];

      for (const item of body) {
        if (!item.requestId) {
          validationErrors.push({ requestId: 'unknown', error: 'Missing requestId' });
          continue;
        }

        const dept = item.department || 'Not Assigned';
        const team = item.responsibleOrDependency;

        validItems.push({
          requestId: String(item.requestId).trim(),
          department: String(dept).trim(),
          responsibleOrDependency: String(team || '').trim(),
          recentUpdate: item.recentUpdate !== undefined ? String(item.recentUpdate).trim() : undefined,
          updatedAt: new Date().toISOString(),
          updatedBy: String(item.updatedBy || 'User').trim(),
        });
      }

      const saved = saveAssignmentsBulk(validItems);
      return NextResponse.json({
        success: true,
        savedCount: saved.length,
        savedAssignments: saved,
      });
    }

    // Single item update
    const { requestId, department, responsibleOrDependency, recentUpdate, updatedBy } = body;

    if (!requestId) {
      return NextResponse.json(
        { success: false, error: 'Request ID is required' },
        { status: 400 }
      );
    }

    const dept = department || 'Not Assigned';

    const saved = saveAssignment({
      requestId: String(requestId).trim(),
      department: String(dept).trim(),
      responsibleOrDependency: String(responsibleOrDependency || '').trim(),
      recentUpdate: recentUpdate !== undefined ? String(recentUpdate).trim() : undefined,
      updatedAt: new Date().toISOString(),
      updatedBy: String(updatedBy || 'User').trim(),
    });

    return NextResponse.json({
      success: true,
      message: 'Assignment saved successfully',
      assignment: saved,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save incident assignment',
      },
      { status: 500 }
    );
  }
}
