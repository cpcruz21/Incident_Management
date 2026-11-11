import type { Account } from '@/lib/auth';

export const AUDIT_ACTION_LABELS = {
  'auth.sign_in': 'Signed in',
  'auth.sign_out': 'Signed out',
  'account.created': 'Created an account',
  'account.password_changed': 'Changed password',
  'account.password_reset': 'Reset an account password',
  'account.deleted': 'Deleted an account',
  'report.published': 'Published a report',
  'report.archived': 'Saved a report to archive',
  'report.imported': 'Imported report archives',
  'report.deleted': 'Deleted an archived report',
  'incident.updated': 'Updated incident assignments',
  'department.updated': 'Updated department mappings',
  'analytics.saved': 'Saved IR analytics',
} as const;

export type AuditAction = keyof typeof AUDIT_ACTION_LABELS;
export type AuditOutcome = 'success' | 'failure';
export interface AuditTarget {
  type: 'account' | 'session' | 'weekly' | 'monthly' | 'aging' | 'reports' | 'incident' | 'department' | 'analytics';
  id?: string;
  count?: number;
}
export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: Account | null;
  action: AuditAction;
  outcome: AuditOutcome;
  target: AuditTarget;
  reason?: 'invalid_credentials' | 'rate_limited' | 'username_unavailable' | 'invalid_input';
}
export interface AuditPage {
  entries: AuditEntry[];
  nextCursor: string | null;
  storageWarning: boolean;
}
