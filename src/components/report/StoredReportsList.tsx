'use client';

import { ArrowRight, Folder, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { deleteStoredReport, getStoredReports, type StoredReport } from '@/lib/storage/report-storage';

const folders = [
  { type: 'weekly', label: 'Weekly Reviews' },
  { type: 'monthly', label: 'Monthly Review' },
  { type: 'aging', label: 'Aging Trends' },
] as const;

export function StoredReportsList({ onOpenReport, canDelete }: {
  onOpenReport: (report: StoredReport) => void;
  canDelete: boolean;
}) {
  const [reports, setReports] = useState<StoredReport[]>([]);
  const [category, setCategory] = useState<StoredReport['type']>('weekly');
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getStoredReports()
      .then((items) => { if (active) setReports(items); })
      .catch((issue) => { if (active) setError(issue.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function remove(report: StoredReport) {
    setDeleting(true);
    setError('');
    try {
      await deleteStoredReport(report);
      setReports((items) => items.filter((item) => item.type !== report.type || item.id !== report.id));
      setSelected(null);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Could not delete the report.');
    } finally {
      setDeleting(false);
    }
  }

  const visible = reports.filter((report) => report.type === category);
  return (
    <>
      <h1>Archive</h1>
      <div className="admin-archive-tabs" role="group" aria-label="Report folders">
        {folders.map(({ type, label }) => (
          <button className="admin-secondary" key={type} type="button" aria-pressed={type === category}
            onClick={() => { setCategory(type); setSelected(null); }}>
            <Folder size={17} /> {label}
          </button>
        ))}
      </div>
      {loading && <p role="status">Loading reports...</p>}
      {error && <p className="admin-error" role="alert">{error}</p>}
      {!loading && !error && !visible.length && <p>No saved reports in this folder.</p>}
      <ul className="admin-archive-rows">
        {visible.map((report) => (
          <li key={report.id}>
            <div>
              <h3>{report.title}</h3>
              <p>{report.period} <span aria-hidden="true">|</span> <time dateTime={report.savedAt}>{report.savedAtFormatted}</time></p>
            </div>
            <div className="admin-archive-actions">
              <button className="admin-secondary" type="button" onClick={() => onOpenReport(report)}>Open <ArrowRight size={16} /></button>
              {canDelete && (selected === report.id ? (
                <>
                  <button className="admin-secondary" type="button" disabled={deleting} onClick={() => remove(report)}>Delete report</button>
                  <button className="admin-text-button" type="button" disabled={deleting} onClick={() => setSelected(null)}>Cancel</button>
                </>
              ) : (
                <button className="admin-icon-button" type="button" title="Delete report"
                  aria-label={`Delete ${report.title}`} onClick={() => setSelected(report.id)}><Trash2 size={16} /></button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
