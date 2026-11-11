import { randomBytes, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const username = (process.argv[2] || 'smac-admin').toLowerCase();
if (!/^[a-z0-9._-]{3,64}$/.test(username)) {
  throw new Error('Use 3 to 64 letters, numbers, periods, underscores or hyphens.');
}
const password = randomBytes(24).toString('base64url');
const salt = randomBytes(16).toString('hex');
const hash = scryptSync(password, salt, 64, { N: 2 ** 17, maxmem: 160 * 1024 ** 2 }).toString('hex');
const directory = join(process.env.SMAC_DATA_DIR || 'data', 'users');
mkdirSync(directory, { recursive: true });
const accountFile = join(directory, 'super-admin.json');
if (existsSync(join(directory, `admin-${username}.json`))) {
  throw new Error('That username is already in use.');
}
try {
  writeFileSync(accountFile, JSON.stringify({
    id: 'super-admin', name: 'SMAC Admin', role: 'super-admin',
    username, salt, hash, sessionKey: randomBytes(32).toString('hex'),
  }), { flag: 'wx', mode: 0o600 });
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.error('The super admin account already exists. Use User Management to change its password.');
  process.exit(1);
}
console.log(`Username: ${username}\nGenerated password: ${password}`);
