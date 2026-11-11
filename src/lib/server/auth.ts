import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { readdirSync, unlinkSync } from 'node:fs';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import type { Account } from '@/lib/auth';
import { dataFile, readJson, writeJson } from './data-files';

interface Credentials extends Account {
  salt: string;
  hash: string;
  sessionKey: string;
}

const cookieName = 'smac_admin_session';
const duration = 8 * 60 * 60;
const superAdminFile = dataFile('users', 'super-admin.json');
let attempts = 0;
let windowEnd = 0;
let verifying = false;

export function isUsername(value: string) {
  return /^[a-z0-9._-]{3,64}$/.test(value);
}

function accountFile(id: string) {
  return dataFile('users', id === 'super-admin' ? 'super-admin.json' : `admin-${id}.json`);
}

export function getSuperAdmin() {
  return readJson<Credentials | null>(superAdminFile, null);
}

export function getCredentials(username: string) {
  if (!isUsername(username)) return null;
  const superAdmin = getSuperAdmin();
  if (username === superAdmin?.username) return superAdmin;
  return readJson<Credentials | null>(dataFile('users', `admin-${username}.json`), null);
}

export function accountFor(credentials: Credentials): Account {
  const { id, name, role, username } = credentials;
  return { id, name, role, username };
}

function sign(payload: string, credentials: Credentials) {
  return createHmac('sha256', credentials.sessionKey).update(payload).digest('base64url');
}

export function isUatVpnRequest() {
  return process.env.SMAC_UAT === 'true' && headers().get('x-smac-uat-vpn') === '1';
}

export function getAdminSession(): Account | null {
  const token = cookies().get(cookieName)?.value;
  if (!token) return null;
  const [encodedUsername, expiry, signature, extra] = token.split('.');
  if (!signature || extra !== undefined || !/^\d{10,13}$/.test(expiry) || Number(expiry) <= Date.now()) return null;
  const username = Buffer.from(encodedUsername, 'base64url').toString();
  const credentials = getCredentials(username);
  if (!credentials || (credentials.role === 'super-admin' && isUatVpnRequest())) return null;
  const expected = Buffer.from(sign(`${encodedUsername}.${expiry}`, credentials));
  const actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? accountFor(credentials) : null;
}

export function writeSession(request: Request, credentials: Credentials | null) {
  const expiry = String(Date.now() + duration * 1000);
  const payload = credentials ? `${Buffer.from(credentials.username).toString('base64url')}.${expiry}` : '';
  cookies().set(cookieName, credentials ? `${payload}.${sign(payload, credentials)}` : '', {
    httpOnly: true,
    secure: new URL(request.url).protocol === 'https:' || process.env.SMAC_SECURE_COOKIES === 'true',
    sameSite: 'strict',
    path: '/',
    maxAge: credentials ? duration : 0,
  });
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return url.host === request.headers.get('host') && url.origin === origin;
  } catch {
    return false;
  }
}

export function requireAdmin(request?: Request) {
  if (request && !sameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  return getAdminSession() ? null : NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
}

function hashPassword(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 2 ** 17, maxmem: 160 * 1024 ** 2 }, (error, hash) => {
      if (error) reject(error);
      else resolve(hash);
    });
  });
}

export async function authenticate(credentials: Credentials | null, password: string) {
  if (Date.now() >= windowEnd) {
    attempts = 0;
    windowEnd = Date.now() + 60_000;
  }
  if (verifying || attempts >= 8) return 'limited';
  attempts += 1;
  verifying = true;
  try {
    const actual = await hashPassword(password, credentials?.salt || 'smac-unknown-account');
    const expected = credentials ? Buffer.from(credentials.hash, 'hex') : Buffer.alloc(64);
    if (!timingSafeEqual(actual, expected) || !credentials) {
      return 'invalid';
    }
    attempts = 0;
    return 'valid';
  } finally {
    verifying = false;
  }
}

export async function changePassword(credentials: Credentials, password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = (await hashPassword(password, salt)).toString('hex');
  if (getCredentials(credentials.username)?.hash !== credentials.hash) return null;
  const updated = { ...credentials, salt, hash, sessionKey: randomBytes(32).toString('hex') };
  writeJson(accountFile(credentials.id), updated);
  return updated;
}

export function listAccounts(): Account[] {
  return readdirSync(dataFile('users', ''))
    .filter((file) => file === 'super-admin.json' || /^admin-[a-z0-9._-]{3,64}\.json$/.test(file))
    .flatMap((file) => {
      const credentials = readJson<Credentials | null>(dataFile('users', file), null);
      return credentials ? [accountFor(credentials)] : [];
    })
    .sort((a, b) => a.role === b.role ? a.username.localeCompare(b.username) : a.role === 'super-admin' ? -1 : 1);
}

export async function createAdmin(username: string, name: string, password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = (await hashPassword(password, salt)).toString('hex');
  if (username === 'super-admin' || getCredentials(username)) return null;
  const credentials: Credentials = {
    id: username, username, name, role: 'admin', salt, hash, sessionKey: randomBytes(32).toString('hex'),
  };
  writeJson(accountFile(credentials.id), credentials);
  return { account: accountFor(credentials) };
}

export function deleteAdmin(account: Account) {
  if (account.role !== 'admin' || !isUsername(account.id)) return false;
  try { unlinkSync(accountFile(account.id)); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
