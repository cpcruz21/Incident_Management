import { appendFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Account } from '@/lib/auth';
import { AUDIT_ACTION_LABELS, type AuditAction, type AuditEntry, type AuditOutcome, type AuditPage, type AuditTarget } from '@/types/audit';
import { dataFile } from './data-files';

let writeFailed = false;

/** Construct a small allowlisted record. Never accept request bodies or credentials. */
export function recordAudit(actor: Account | null, action: AuditAction, target: AuditTarget, outcome: AuditOutcome = 'success', reason?: AuditEntry['reason']) {
  const timestamp = new Date().toISOString();
  const entry: AuditEntry = {
    id: randomUUID(), timestamp, action, outcome,
    actor: actor ? { id: actor.id, name: actor.name, username: actor.username, role: actor.role } : null,
    target: { type: target.type, ...(typeof target.id === 'string' ? { id: target.id.slice(0, 300) } : {}), ...(typeof target.count === 'number' && Number.isFinite(target.count) ? { count: target.count } : {}) },
    ...(reason ? { reason } : {}),
  };
  try {
    mkdirSync(dataFile('audit', ''), { recursive: true });
    appendFileSync(dataFile('audit', `events-${timestamp.slice(0, 10)}.jsonl`), `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  } catch {
    // A failed audit write must not turn a completed mutation into a misleading
    // failed response. Surface degraded logging to the super admin instead.
    writeFailed = true;
    console.error('Audit event could not be recorded. Check audit storage permissions and free space.');
  }
}

export interface AuditFilter {
  cursor?: string;
  query?: string;
  group?: string;
  outcome?: AuditOutcome;
  limit?: number;
}

function isStoredAuditEntry(value: unknown): value is AuditEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<AuditEntry>;
  const actor = entry.actor;
  const target = entry.target;
  const validActor = actor === null || (actor && typeof actor.name === 'string' && typeof actor.username === 'string' && typeof actor.id === 'string' && ['admin', 'super-admin'].includes(actor.role));
  const validTarget = target && ['account', 'session', 'weekly', 'monthly', 'aging', 'reports', 'incident', 'department', 'analytics'].includes(target.type)
    && (target.id === undefined || typeof target.id === 'string')
    && (target.count === undefined || Number.isSafeInteger(target.count));
  return typeof entry.id === 'string' && typeof entry.timestamp === 'string' && Number.isFinite(Date.parse(entry.timestamp))
    && typeof entry.action === 'string' && Object.hasOwn(AUDIT_ACTION_LABELS, entry.action)
    && (entry.outcome === 'success' || entry.outcome === 'failure') && !!validActor && !!validTarget
    && (entry.reason === undefined || ['invalid_credentials', 'rate_limited', 'username_unavailable', 'invalid_input'].includes(entry.reason));
}

export function readAudit(filter: AuditFilter = {}): AuditPage {
  let files: string[];
  try { files = readdirSync(dataFile('audit', '')).filter(name => /^events-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)).sort().reverse(); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return { entries: [], nextCursor: null, storageWarning: writeFailed };
  }
  const limit = Math.min(100, Math.max(1, filter.limit || 25));
  const query = filter.query?.trim().toLowerCase() || '';
  const entries: AuditEntry[] = [];
  let foundCursor = !filter.cursor;
  let storageWarning = writeFailed;
  for (const file of files) {
    const lines = readFileSync(dataFile('audit', file), 'utf8').split('\n');
    for (let index = lines.length - 1; index >= 0; index--) {
      if (!lines[index].trim()) continue;
      let entry: AuditEntry;
      try {
        entry = JSON.parse(lines[index]);
        if (!isStoredAuditEntry(entry)) throw new Error('Invalid audit entry');
      } catch { storageWarning = true; continue; }
      if (!foundCursor) { if (entry.id === filter.cursor) foundCursor = true; continue; }
      if (filter.group && !entry.action.startsWith(`${filter.group}.`)) continue;
      if (filter.outcome && entry.outcome !== filter.outcome) continue;
      if (query && ![entry.actor?.name, entry.actor?.username, entry.target.id, entry.target.type, AUDIT_ACTION_LABELS[entry.action]].some(value => value?.toLowerCase().includes(query))) continue;
      entries.push(entry);
      if (entries.length > limit) return { entries: entries.slice(0, limit), nextCursor: entries[limit - 1].id, storageWarning };
    }
  }
  if (!foundCursor) throw new Error('Audit cursor no longer exists.');
  return { entries, nextCursor: null, storageWarning };
}
