'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { AUDIT_ACTION_LABELS, type AuditPage } from '@/types/audit';
import './user-management.css';

const targetLabels = { account: 'Account', session: 'Session', weekly: 'Weekly report', monthly: 'Monthly report', aging: 'Aging report', reports: 'Reports', incident: 'Incident', department: 'Departments', analytics: 'IR analytics' };
const reasonLabels = { invalid_credentials: 'Incorrect sign-in details', rate_limited: 'Too many attempts', username_unavailable: 'Username already in use', invalid_input: 'Invalid input' };
const formatTime = (timestamp: string) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Taipei' }).format(new Date(timestamp));

export function AuditLog({ revision = 0 }: { revision?: number }) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [outcome, setOutcome] = useState('');
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const cursor = cursors[cursors.length - 1];

  useEffect(() => { setCursors([undefined]); }, [revision]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ query, group, outcome });
        if (cursor) params.set('cursor', cursor);
        const response = await fetch(`/api/admin/audit?${params}`, { cache: 'no-store', signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not load audit logs.');
        if (!controller.signal.aborted) setData(result);
      } catch (issue) { if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : 'Could not load audit logs.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, group, outcome, cursor, refresh, revision]);

  return <section className="users-audit" aria-label="Audit log">
    <div className="users-audit-filters">
      <label className="users-search"><Search size={17} aria-hidden="true" /><span className="users-sr-only">Search audit log by person, activity, or target</span><input type="search" placeholder="Search person, activity, or target" maxLength={100} value={query} onChange={event => { setQuery(event.target.value); setCursors([undefined]); }} /></label>
      <label>Activity<select value={group} onChange={event => { setGroup(event.target.value); setCursors([undefined]); }}><option value="">All activity</option><option value="account">Accounts &amp; passwords</option><option value="auth">Sign-ins &amp; sign-outs</option><option value="report">Reports &amp; archives</option><option value="incident">Incident assignments</option><option value="department">Department mappings</option><option value="analytics">IR analytics</option></select></label>
      <label>Result<select value={outcome} onChange={event => { setOutcome(event.target.value); setCursors([undefined]); }}><option value="">All results</option><option value="success">Successful</option><option value="failure">Failed</option></select></label>
      <button type="button" className="admin-secondary users-audit-refresh" disabled={loading} onClick={() => { setCursors([undefined]); setRefresh(value => value + 1); }}>Refresh</button>
    </div>
    {data?.storageWarning && <p className="users-audit-warning" role="alert">Some recent audit entries could not be saved or read. Check server storage permissions and free space.</p>}
    {loading ? <div className="users-empty" role="status">Loading activity…</div> : error ? <div className="users-empty"><p className="admin-error" role="alert">{error}</p><button type="button" className="admin-secondary" onClick={() => { setCursors([undefined]); setRefresh(value => value + 1); }}>Try again</button></div> : data?.entries.length ? <div className="users-audit-scroll" tabIndex={0} role="region" aria-label="Audit activity table"><table className="users-audit-table"><thead><tr><th scope="col">Time (UTC+8)</th><th scope="col">Person</th><th scope="col">Activity</th><th scope="col">Target</th><th scope="col">Result</th></tr></thead><tbody>{data.entries.map(entry => <tr key={entry.id}>
      <td><time dateTime={entry.timestamp}>{formatTime(entry.timestamp)}</time></td>
      <td><strong>{entry.actor?.name || 'Unauthenticated'}</strong><small>{entry.actor?.username || 'Sign-in attempt'}</small></td>
      <td>{AUDIT_ACTION_LABELS[entry.action]}{entry.reason && <small>{reasonLabels[entry.reason]}</small>}</td>
      <td>{targetLabels[entry.target.type]}{entry.target.id && <small>{entry.target.id}</small>}{entry.target.count !== undefined && <small>{entry.target.count} records</small>}</td>
      <td><span className={`users-audit-result users-audit-result-${entry.outcome}`}>{entry.outcome === 'success' ? 'Successful' : 'Failed'}</span></td>
    </tr>)}</tbody></table></div> : <div className="users-empty"><p>{query || group || outcome ? 'No activity matches these filters.' : 'No activity recorded yet.'}</p>{(query || group || outcome) && <button type="button" className="admin-text-button" onClick={() => { setQuery(''); setGroup(''); setOutcome(''); setCursors([undefined]); }}>Clear filters</button>}</div>}
    <footer className="users-audit-footer"><span>{!loading && !error && data ? `${data.entries.length} ${data.entries.length === 1 ? 'entry' : 'entries'}` : ''}</span><div><span>Page {cursors.length}</span><button type="button" className="admin-secondary" disabled={loading || cursors.length <= 1} onClick={() => setCursors(previous => previous.slice(0, -1))}>Previous</button><button type="button" className="admin-secondary" disabled={loading || !!error || !data?.nextCursor} onClick={() => { if (data?.nextCursor) setCursors(previous => [...previous, data.nextCursor!]); }}>Next</button></div></footer>
  </section>;
}
