import { NextResponse } from 'next/server';
import { changePassword, createAdmin, deleteAdmin, getAdminSession, getCredentials, isUsername, listAccounts, requireAdmin } from '@/lib/server/auth';
import { recordAudit } from '@/lib/server/audit';
import { isValidPassword, PASSWORD_REQUIREMENTS } from '@/lib/users/password-policy';

export const dynamic = 'force-dynamic';

function requireSuperAdmin(request?: Request) {
  return requireAdmin(request) || (getAdminSession()?.role !== 'super-admin'
    ? NextResponse.json({ error: 'Super admin access is required.' }, { status: 403 })
    : null);
}

export function GET() {
  const denied = requireSuperAdmin();
  if (denied) return denied;
  return NextResponse.json({ accounts: listAccounts() }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const denied = requireSuperAdmin(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
  if (!name || name.length > 100 || !isUsername(username)) {
    recordAudit(getAdminSession(), 'account.created', { type: 'account' }, 'failure', 'invalid_input');
    return NextResponse.json({ error: 'Enter a name and a username of 3 to 64 letters, numbers, periods, underscores, or hyphens.' }, { status: 400 });
  }
  if (!isValidPassword(body?.password)) {
    recordAudit(getAdminSession(), 'account.created', { type: 'account', id: username }, 'failure', 'invalid_input');
    return NextResponse.json({ error: PASSWORD_REQUIREMENTS }, { status: 400 });
  }
  const created = await createAdmin(username, name, body.password);
  if (!created) {
    recordAudit(getAdminSession(), 'account.created', { type: 'account', id: username }, 'failure', 'username_unavailable');
    return NextResponse.json({ error: 'That username is unavailable.' }, { status: 409 });
  }
  recordAudit(getAdminSession(), 'account.created', { type: 'account', id: created.account.username });
  return NextResponse.json(created, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: Request) {
  const denied = requireSuperAdmin(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (typeof body?.id !== 'string' || !isValidPassword(body?.password)) {
    return NextResponse.json({ error: PASSWORD_REQUIREMENTS }, { status: 400 });
  }
  const account = listAccounts().find(item => item.id === body.id);
  if (!account) return NextResponse.json({ error: 'The account no longer exists.' }, { status: 404 });
  if (account.role !== 'admin') return NextResponse.json({ error: 'Use your own account settings to change the super-admin password.' }, { status: 403 });
  const credentials = getCredentials(account.username);
  if (!credentials) return NextResponse.json({ error: 'The account no longer exists.' }, { status: 404 });
  const updated = await changePassword(credentials, body.password);
  if (!updated) return NextResponse.json({ error: 'The account changed. Refresh the account list and try again.' }, { status: 409 });
  recordAudit(getAdminSession(), 'account.password_reset', { type: 'account', id: account.username });
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request: Request) {
  const denied = requireSuperAdmin(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (typeof body?.id !== 'string') return NextResponse.json({ error: 'Choose an account to delete.' }, { status: 400 });
  const account = listAccounts().find(item => item.id === body.id);
  if (!account) return NextResponse.json({ error: 'The account no longer exists.' }, { status: 404 });
  if (account.role !== 'admin') return NextResponse.json({ error: 'The super-admin account cannot be deleted.' }, { status: 403 });
  if (!deleteAdmin(account)) return NextResponse.json({ error: 'The account no longer exists.' }, { status: 404 });
  recordAudit(getAdminSession(), 'account.deleted', { type: 'account', id: account.username });
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
