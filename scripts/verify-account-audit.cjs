const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHmac } = require('node:crypto');
const Module = require('node:module');
const directory = fs.mkdtempSync(path.join(process.cwd(), '.test-account-audit-'));
process.env.SMAC_DATA_DIR = directory;
require('./register-typescript.cjs');
const cookieJar = new Map();
const load = Module._load;
Module._load = function(name, ...args) {
  if (name === 'next/headers') return { cookies: () => ({ get: key => cookieJar.has(key) ? { value: cookieJar.get(key) } : undefined, set: (key, value) => cookieJar.set(key, value) }) };
  return load.call(this, name, ...args);
};
const auth = require('../src/lib/server/auth.ts');
const users = require('../src/app/api/admin/users/route.ts');
const sessions = require('../src/app/api/auth/session/route.ts');
const auditRoute = require('../src/app/api/admin/audit/route.ts');
const archive = require('../src/app/api/reports/archive/route.ts');
const { recordAudit, readAudit } = require('../src/lib/server/audit.ts');
const { dataFile, writeJson } = require('../src/lib/server/data-files.ts');
const owner = { id: 'super-admin', name: 'Test Owner', username: 'test.owner', role: 'super-admin', salt: 'test-salt', hash: '00'.repeat(64), sessionKey: 'owner-test-session-secret' };
function signIn(credentials) {
  const payload = `${Buffer.from(credentials.username).toString('base64url')}.${Date.now() + 60_000}`;
  cookieJar.set('smac_admin_session', `${payload}.${createHmac('sha256', credentials.sessionKey).update(payload).digest('base64url')}`);
}
const base = 'http://localhost:4317';
function request(method, body) { return new Request(`${base}/api/admin/users`, { method, headers: { 'Content-Type': 'application/json', origin: base, host: 'localhost:4317' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
const auditRequest = (query = '') => new Request(`${base}/api/admin/audit${query}`);

async function main() {
  writeJson(dataFile('users', 'super-admin.json'), owner);
  assert.equal(auditRoute.GET(auditRequest()).status, 401);
  assert.equal((await users.POST(request('POST', { name: 'Test Administrator', username: 'test.admin' }))).status, 401);
  signIn(owner);
  assert.equal((await users.POST(request('POST', { name: 'Test Administrator', username: 'test.admin' }))).status, 400);
  assert.equal((await users.POST(request('POST', { name: 'Test Administrator', username: 'test.admin', password: 'short' }))).status, 400);
  assert.equal((await users.POST(request('POST', { name: 'Test Administrator', username: 'test.admin', password: 'Abcdefgh' }))).status, 400);
  assert.equal((await users.POST(request('POST', { name: 'Test Administrator', username: 'test.admin', password: '1234567!' }))).status, 400);
  assert.equal(auth.getCredentials('test.admin'), null, 'invalid passwords must not create an account');
  const initialPassword = 'First!23';
  const createdResponse = await users.POST(request('POST', { name: 'Test Administrator', username: 'test.admin', password: initialPassword }));
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.account.name, 'Test Administrator');
  assert.equal(created.account.username, 'test.admin');
  assert.equal(created.password, undefined, 'creation response must not echo the password');
  assert.equal((await users.POST(request('POST', { name: 'Duplicate', username: 'test.admin', password: initialPassword }))).status, 409);
  assert.equal((await users.PATCH(request('PATCH', { id: 'super-admin', password: 'test-owner-protected-password' }))).status, 403);
  assert.equal((await users.DELETE(request('DELETE', { id: 'super-admin' }))).status, 403);
  assert.equal((await users.PATCH(request('PATCH', { id: 'test.admin', password: 'short' }))).status, 400);
  assert.equal((await users.PATCH(request('PATCH', { id: 'test.admin', password: 'LettersOnlyPassword' }))).status, 400);
  const loginResponse = await sessions.POST(request('POST', { username: 'test.admin', password: initialPassword }));
  assert.equal(loginResponse.status, 200, 'account must accept the exact password chosen by the super admin');
  assert.equal((await loginResponse.json()).account.name, 'Test Administrator');

  const beforeReset = auth.getCredentials('test.admin');
  signIn(beforeReset);
  const oldCookie = cookieJar.get('smac_admin_session');
  assert.equal(users.GET().status, 403);
  assert.equal(auditRoute.GET(auditRequest()).status, 403);
  assert.equal((await users.PATCH(request('PATCH', { id: 'test.admin', password: 'test-forbidden-reset-password' }))).status, 403);
  assert.equal((await users.DELETE(request('DELETE', { id: 'test.admin' }))).status, 403);

  signIn(owner);
  const newPassword = 'Reset!23';
  assert.equal((await users.PATCH(request('PATCH', { id: 'test.admin', password: newPassword }))).status, 204);
  cookieJar.set('smac_admin_session', oldCookie);
  assert.equal(auth.getAdminSession(), null, 'password reset must revoke existing sessions');
  assert.equal((await sessions.POST(request('POST', { username: 'test.admin', password: initialPassword }))).status, 401);
  assert.equal((await sessions.POST(request('POST', { username: 'test.admin', password: newPassword }))).status, 200);
  assert.equal((await sessions.PATCH(request('PATCH', { currentPassword: newPassword, password: 'LettersOnlyPassword' }))).status, 400);
  const ownPassword = 'Ownpass!';
  assert.equal((await sessions.PATCH(request('PATCH', { currentPassword: newPassword, password: ownPassword }))).status, 204);
  const adminCookie = cookieJar.get('smac_admin_session');

  const report = { id: 'test-weekly', type: 'weekly', title: 'Synthetic report', period: 'Test period', savedAt: new Date().toISOString(), savedAtFormatted: 'Test', reportData: {} };
  assert.equal((await archive.POST(request('POST', { reports: [report] }))).status, 204);
  assert.equal((await archive.DELETE(request('DELETE', { type: 'weekly', id: report.id }))).status, 403);
  signIn(owner);
  assert.equal((await archive.DELETE(request('DELETE', { type: 'weekly', id: report.id }))).status, 204);
  assert.equal((await archive.DELETE(request('DELETE', { type: 'weekly', id: report.id }))).status, 204);
  assert.equal(readAudit().entries.filter(entry => entry.action === 'report.deleted').length, 1, 'no deletion event for an absent report');
  assert.equal((await users.DELETE(request('DELETE', { id: 'test.admin' }))).status, 204);
  cookieJar.set('smac_admin_session', adminCookie);
  assert.equal(auth.getAdminSession(), null, 'deleting account must revoke its sessions');
  assert.equal((await users.DELETE(request('DELETE', { id: 'test.admin' }))).status, 401);
  signIn(owner);
  assert.equal((await users.DELETE(request('DELETE', { id: 'test.admin' }))).status, 404);

  const response = auditRoute.GET(auditRequest());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const page = await response.json();
  assert.ok(page.entries.some(entry => entry.actor?.name === 'Test Administrator' && entry.actor?.username === 'test.admin'), 'audit entries must preserve the display name separately from the username');
  for (const action of ['account.created', 'account.password_reset', 'account.password_changed', 'account.deleted', 'auth.sign_in', 'report.archived', 'report.deleted']) assert.ok(page.entries.some(entry => entry.action === action), action);
  assert.ok(page.entries.some(entry => entry.outcome === 'failure'));
  assert.equal(auditRoute.GET(auditRequest('?group=unknown')).status, 400);
  assert.equal(auditRoute.GET(auditRequest('?cursor=../../secret')).status, 400);
  const failed = await auditRoute.GET(auditRequest('?outcome=failure&group=auth')).json();
  assert.ok(failed.entries.length);
  assert.ok(failed.entries.every(entry => entry.outcome === 'failure' && entry.action.startsWith('auth.')));

  recordAudit({ ...owner, password: 'actor-password-must-not-log' }, 'report.archived', { type: 'reports', count: 2, token: 'target-token-must-not-log' });
  for (let i = 0; i < 60; i++) recordAudit(owner, 'report.archived', { type: 'reports', id: `synthetic-${i}` });
  const first = readAudit({ limit: 25 });
  assert.equal(first.entries.length, 25); assert.ok(first.nextCursor);
  recordAudit(owner, 'report.archived', { type: 'reports', id: 'new-after-first-page' });
  const second = readAudit({ limit: 25, cursor: first.nextCursor });
  assert.equal(second.entries.length, 25);
  assert.ok(second.entries.every(entry => !first.entries.some(other => other.id === entry.id)));
  assert.equal(readAudit({ query: 'synthetic-59' }).entries.length, 1);
  const file = dataFile('audit', `events-${new Date().toISOString().slice(0, 10)}.jsonl`);
  const persisted = fs.readFileSync(file, 'utf8');
  for (const secret of [initialPassword, newPassword, ownPassword, owner.sessionKey, owner.hash, 'actor-password-must-not-log', 'target-token-must-not-log']) assert.ok(!persisted.includes(secret), 'audit must exclude credentials');
  fs.appendFileSync(file, '{malformed-line}\n');
  fs.appendFileSync(file, `${JSON.stringify({ ...first.entries[0], timestamp: 'invalid-date' })}\n`);
  fs.appendFileSync(file, `${JSON.stringify({ ...first.entries[0], actor: { name: 42 } })}\n`);
  assert.equal(readAudit().storageWarning, true);
  assert.ok(readAudit().entries.length);
  console.log('Account/audit integration passed: create, reset, delete, session revocation, sign-in/password events, archive events, super-admin-only access, filtering, pagination, persistence, and credential exclusion. All data was isolated in a temporary directory.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  const absolute = path.resolve(directory);
  if (path.dirname(absolute) !== path.resolve(process.cwd()) || !path.basename(absolute).startsWith('.test-account-audit-')) throw new Error('Refusing to remove an unexpected test path');
  fs.rmSync(absolute, { recursive: true, force: true });
});
