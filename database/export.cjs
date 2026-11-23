const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { parseArgs } = require('node:util');

require('../scripts/register-typescript.cjs');
const { DEFAULT_DEPARTMENT_MAPPINGS } = require('../src/lib/departments/mappings.ts');

const appDir = path.resolve(__dirname, '..');
const reportTypes = ['weekly', 'monthly', 'aging'];

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

function parseJson(text, source) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON in ${source}.`);
  }
}

function readJson(file) {
  const text = readText(file);
  return text === undefined ? undefined : parseJson(text, file);
}

function readCategory(dataDir, category, name, fallback) {
  const current = readJson(path.join(dataDir, category, name));
  if (current !== undefined) return current;
  const legacy = readJson(path.join(dataDir, name));
  return legacy === undefined ? fallback : legacy;
}

function listFiles(directory, pattern) {
  try {
    return fs.readdirSync(directory).filter(name => pattern.test(name)).sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function sqlValue(value) {
  if (value === null) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (Number.isSafeInteger(value)) return String(value);
  if (typeof value !== 'string' || value.includes('\0')) {
    throw new Error('A record has a missing or invalid SQL value.');
  }
  return "'" + value.replaceAll("'", "''") + "'";
}

function writeRows(write, table, columns, records, toValues) {
  const header = `INSERT INTO incident_management.${table} (${columns}) VALUES\n`;
  let batch = [];
  for (const [index, record] of records.entries()) {
    batch.push('  (' + toValues(record, index + 1).map(sqlValue).join(', ') + ')');
    if (batch.length === 200) {
      write(header + batch.join(',\n') + ';\n');
      batch = [];
    }
  }
  if (batch.length) write(header + batch.join(',\n') + ';\n');
  return records.length;
}

function exportData(dataDir, write) {
  const counts = {};
  for (const type of reportTypes) {
    const archived = readJson(path.join(dataDir, type, 'archive.json')) ?? [];
    counts[`${type} archived`] = writeRows(write, 'archived_reports',
      'report_type, report_id, period, title, saved_at, source_order, payload',
      archived, (report, order) => [
        type, report.id, report.period, report.title, report.savedAt, order, JSON.stringify(report),
      ]);

    const published = readCategory(dataDir, type, `${type}-reports.json`, []);
    counts[`${type} published`] = writeRows(write, 'published_reports',
      'report_type, report_id, period, title, saved_at, server_saved_at, source_order, payload',
      published, (report, order) => [
        type, report.id, report.period, report.title, report.savedAt, report.serverSavedAt ?? null,
        order, JSON.stringify(report),
      ]);
  }

  const assignments = readCategory(dataDir, 'follow-ups', 'incident-assignments.json', {});
  counts['incident assignments'] = writeRows(write, 'incident_assignments',
    'request_id, department, responsible_or_dependency, recent_update, updated_at, updated_by, payload',
    Object.entries(assignments), ([id, assignment]) => [
      id, assignment.department, assignment.responsibleOrDependency, assignment.recentUpdate ?? null,
      assignment.updatedAt, assignment.updatedBy, JSON.stringify(assignment),
    ]);

  const overrides = readCategory(dataDir, 'configuration', 'department-mappings.json', {});
  const mappings = Object.entries({ ...DEFAULT_DEPARTMENT_MAPPINGS, ...overrides });
  counts['department mappings'] = writeRows(write, 'department_mappings',
    'department, allowed_teams, is_override', mappings, ([department, teams]) => [
      department, JSON.stringify(teams), Object.hasOwn(overrides, department),
    ]);

  const analytics = readCategory(dataDir, 'analytics', 'ir-analytics.json', null);
  const { batches = [], tickets = [], ...metadata } = analytics ?? {};
  counts['IR analytics settings'] = writeRows(write, 'ir_analytics_state',
    'singleton, server_saved_at, metadata', analytics === null ? [] : [metadata], state => [
      true, state.serverSavedAt ?? null, JSON.stringify(state),
    ]);
  counts['IR analytics batches'] = writeRows(write, 'ir_import_batches',
    'batch_id, imported_at, source_order, payload', batches, (batch, order) => [
      batch.id, batch.importedAt, order, JSON.stringify(batch),
    ]);
  counts['IR analytics tickets'] = writeRows(write, 'ir_tickets',
    'row_key, batch_id, ir_id, ticket_id, status_category, source_order, payload',
    tickets, (ticket, order) => [
      ticket.rowKey, ticket.importBatchId, ticket.irId, ticket.ticketId, ticket.statusCategory,
      order, JSON.stringify(ticket),
    ]);

  const usersDir = path.join(dataDir, 'users');
  const accounts = listFiles(usersDir, /^(super-admin|admin-[a-z0-9._-]{3,64})\.json$/)
    .map(name => readJson(path.join(usersDir, name)));
  counts['accounts'] = writeRows(write, 'accounts',
    'account_id, username, display_name, role', accounts, account => [
      account.id, account.username, account.name, account.role,
    ]);
  writeRows(write, 'account_credentials',
    'account_id, password_salt, password_hash, session_key', accounts, account => [
      account.id, account.salt, account.hash, randomBytes(32).toString('hex'),
    ]);

  const auditDir = path.join(dataDir, 'audit');
  const events = listFiles(auditDir, /^events-\d{4}-\d{2}-\d{2}\.jsonl$/).flatMap(name => {
    const file = path.join(auditDir, name);
    return readText(file).split('\n').flatMap((line, index) =>
      line.trim() ? [parseJson(line, `${file} line ${index + 1}`)] : []);
  });
  counts['audit events'] = writeRows(write, 'audit_events',
    'event_id, occurred_at, action, outcome, actor_username, target_type, target_id, source_order, payload',
    events, (event, order) => [
      event.id, event.timestamp, event.action, event.outcome, event.actor?.username ?? null,
      event.target.type, event.target.id ?? null, order, JSON.stringify(event),
    ]);
  return counts;
}

function main() {
  const { values } = parseArgs({ options: { 'data-dir': { type: 'string' }, output: { type: 'string' } } });
  const dataDir = path.resolve(values['data-dir'] || process.env.SMAC_DATA_DIR || path.join(appDir, 'data'));
  const output = path.resolve(values.output || path.join(appDir, 'data', 'postgresql', 'incident-management.sql'));
  if (!fs.statSync(dataDir).isDirectory()) throw new Error(`Data directory is invalid: ${dataDir}`);

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8').trimEnd();
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const file = fs.openSync(output, 'wx', 0o600);
  let complete = false;
  let counts;
  try {
    const write = text => fs.writeFileSync(file, text, 'utf8');
    write('-- SMAC Incident Management PostgreSQL import. Contains private data.\n');
    write("BEGIN;\nSET LOCAL client_encoding = 'UTF8';\nSET LOCAL standard_conforming_strings = on;\n\n");
    write(schema + '\n\n');
    counts = exportData(dataDir, write);
    write('COMMIT;\n');
    complete = true;
  } finally {
    fs.closeSync(file);
    if (!complete) fs.unlinkSync(output);
  }
  console.log(`Wrote ${output}`);
  for (const [table, count] of Object.entries(counts)) console.log(`  ${table}: ${count}`);
}

try {
  main();
} catch (error) {
  console.error(`PostgreSQL export failed: ${error.message}`);
  process.exitCode = 1;
}
