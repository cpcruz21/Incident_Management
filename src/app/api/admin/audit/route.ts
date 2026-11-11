import { NextResponse } from 'next/server';
import { getAdminSession, requireAdmin } from '@/lib/server/auth';
import { readAudit } from '@/lib/server/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(request: Request) {
  const denied = requireAdmin();
  if (denied) { denied.headers.set('Cache-Control', 'no-store'); return denied; }
  if (getAdminSession()?.role !== 'super-admin') return NextResponse.json({ error: 'Super admin access is required.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  const params = new URL(request.url).searchParams;
  const query = params.get('query') || '';
  const group = params.get('group') || '';
  const outcome = params.get('outcome') || '';
  const cursor = params.get('cursor') || '';
  if (query.length > 100 || (group && !['auth', 'account', 'report', 'incident', 'department', 'analytics'].includes(group)) || (outcome && !['success', 'failure'].includes(outcome)) || (cursor && !/^[a-f0-9-]{36}$/.test(cursor))) {
    return NextResponse.json({ error: 'Invalid audit filters.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    return NextResponse.json(readAudit({ query, group, outcome: outcome === 'success' || outcome === 'failure' ? outcome : undefined, cursor: cursor || undefined }), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Could not load audit logs. Refresh and try again; if this continues, check server audit storage.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
