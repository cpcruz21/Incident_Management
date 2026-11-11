import { NextResponse } from 'next/server';
import { recordAudit } from '@/lib/server/audit';
import { isValidPassword, PASSWORD_REQUIREMENTS } from '@/lib/users/password-policy';
import {
  accountFor, authenticate, changePassword, getAdminSession, getCredentials, getSuperAdmin, isUatVpnRequest, isUsername, requireAdmin, sameOrigin, writeSession,
} from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export function GET() {
  return NextResponse.json({ account: getAdminSession() }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return error('Invalid request origin.', 403);
  const body = await request.json().catch(() => null);
  if (typeof body?.username !== 'string' || body.username.length > 64 ||
      typeof body?.password !== 'string' || body.password.length > 256) {
    return error('Enter your username and password.', 400);
  }
  if (!getSuperAdmin()) return error('The super admin account must be set up before signing in.', 503);
  const credentials = getCredentials(body.username.trim().toLowerCase());
  if (credentials?.role === 'super-admin' && isUatVpnRequest()) {
    return error('Use a QA admin account on the VPN. Super-admin sign-in is available on the UAT computer.', 403);
  }
  const result = await authenticate(credentials, body.password);
  if (result === 'limited' || result === 'invalid' || !credentials) {
    const username = body.username.trim().toLowerCase();
    recordAudit(null, 'auth.sign_in', { type: 'account', ...(isUsername(username) ? { id: username } : {}) }, 'failure', result === 'limited' ? 'rate_limited' : 'invalid_credentials');
    return result === 'limited' ? error('Too many attempts. Try again in a minute.', 429) : error('Incorrect username or password.', 401);
  }
  if (getCredentials(credentials.username)?.hash !== credentials.hash) return error('Sign in again.', 409);
  writeSession(request, credentials);
  recordAudit(accountFor(credentials), 'auth.sign_in', { type: 'session' });
  return NextResponse.json({ account: accountFor(credentials) }, { headers: { 'Cache-Control': 'no-store' } });
}

export function DELETE(request: Request) {
  if (!sameOrigin(request)) return error('Invalid request origin.', 403);
  const account = getAdminSession();
  writeSession(request, null);
  if (account) recordAudit(account, 'auth.sign_out', { type: 'session' });
  return new NextResponse(null, { status: 204 });
}

export async function PATCH(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (typeof body?.currentPassword !== 'string' || body.currentPassword.length > 256 ||
      !isValidPassword(body?.password) ||
      body.password === body.currentPassword) {
    return error(`${PASSWORD_REQUIREMENTS} Choose a different password from your current one.`, 400);
  }
  const account = getAdminSession();
  const credentials = account ? getCredentials(account.username) : null;
  if (!credentials) return error('Sign in again.', 401);
  const result = await authenticate(credentials, body.currentPassword);
  if (result === 'limited' || result === 'invalid') {
    recordAudit(account, 'account.password_changed', { type: 'account', id: credentials.username }, 'failure', result === 'limited' ? 'rate_limited' : 'invalid_credentials');
    return result === 'limited' ? error('Too many attempts. Try again in a minute.', 429) : error('Incorrect current password.', 401);
  }
  const updated = await changePassword(credentials, body.password);
  if (!updated) return error('The password already changed. Sign in again.', 409);
  writeSession(request, updated);
  recordAudit(accountFor(updated), 'account.password_changed', { type: 'account', id: updated.username });
  return new NextResponse(null, { status: 204 });
}
