'use client';

import { ArrowRight, ChevronDown, ChevronRight, FileSpreadsheet, FileText, Folder, History, Plus, Search, Trash2, X } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatWeeklyReportRange } from '@/lib/report/weekly-period';
import { deleteStoredReport, getStoredReports, type StoredReport } from '@/lib/storage/report-storage';
import { ReportWorkflowHeader } from './ReportWorkflowHeader';

const folders = [
  { type: 'weekly', label: 'Weekly Reviews' },
  { type: 'monthly', label: 'Monthly Review' },
  { type: 'aging', label: 'Aging Trends' },
] as const;

type ArchiveDestination = { category: StoredReport['type']; month?: string };
type ArchiveLocation = ArchiveDestination | null;
type ArchiveSort = '' | 'newest' | 'oldest' | 'title';
type ArchiveFolderEntry = { label: string; count: number; savedAt?: string; location: ArchiveDestination };

const monthName = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' });
const months = Array.from({ length: 12 }, (_, index) => monthName.format(new Date(Date.UTC(2000, index, 1))));
const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function lastUpdated(savedAt: string): string {
  const days = Math.floor(Math.max(0, Date.now() - Date.parse(savedAt)) / 86_400_000);
  if (!Number.isFinite(days)) return 'Last updated date unavailable';
  const when = days >= 365 ? relativeTime.format(-Math.floor(days / 365), 'year')
    : days >= 30 ? relativeTime.format(-Math.floor(days / 30), 'month')
    : relativeTime.format(-days, 'day');
  return `Last updated ${when}`;
}

function sortArchiveItems<T>(
  items: T[],
  sort: ArchiveSort,
  details: (item: T) => { label: string; savedAt?: string },
): T[] {
  if (!sort) return items;
  return [...items].sort((a, b) => {
    const left = details(a);
    const right = details(b);
    if (sort === 'title') return left.label.localeCompare(right.label, 'en', { numeric: true });
    const leftTime = Date.parse(left.savedAt ?? '');
    const rightTime = Date.parse(right.savedAt ?? '');
    if (!Number.isFinite(leftTime)) return Number.isFinite(rightTime) ? 1 : 0;
    if (!Number.isFinite(rightTime)) return -1;
    return sort === 'oldest' ? leftTime - rightTime : rightTime - leftTime;
  });
}

const reportSortDetails = (report: StoredReport) => ({ label: report.title, savedAt: report.savedAt });

function monthKey(report: StoredReport): string {
  const period = report.period?.trim() ?? '';
  if (report.type === 'weekly') {
    const end = formatWeeklyReportRange(period).to;
    const parts = end?.match(/^(\d{2})-\d{2}-(\d{4})/);
    if (parts) return `${parts[2]}-${parts[1]}`;
  }
  if (report.type === 'monthly') {
    const parts = /^([a-z]+)\s+(\d{4})$/i.exec(period);
    if (parts) {
      const index = months.findIndex((name) => name.toLowerCase() === parts[1].toLowerCase());
      if (index >= 0) return `${parts[2]}-${String(index + 1).padStart(2, '0')}`;
    }
  }
  const asOf = report.type === 'aging' && 'asOf' in report.reportData && report.reportData.asOf;
  const extraction = asOf ? new Date(asOf) : null;
  const date = extraction && Number.isFinite(extraction.getTime()) ? extraction : new Date(report.savedAt);
  if (!Number.isFinite(date.getTime())) return '';
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  if (!key) return 'Undated';
  const month = months[Number(key.slice(-2)) - 1];
  return `${month} ${key.slice(0, -3)}`;
}

function groupReports(reports: StoredReport[]) {
  return folders.map((folder) => {
    const items = reports.filter((report) => report.type === folder.type);
    const grouped = new Map<string, StoredReport[]>();
    for (const report of items) {
      const key = monthKey(report);
      const group = grouped.get(key);
      if (group) group.push(report);
      else grouped.set(key, [report]);
    }
    return {
      ...folder,
      count: items.length,
      savedAt: items[0]?.savedAt,
      months: Array.from(grouped, ([key, reports]) => ({ key, reports }))
        .sort((a, b) => b.key.localeCompare(a.key)),
    };
  });
}

function RecentActivityList({ reports, onOpenReport }: {
  reports: StoredReport[];
  onOpenReport: (report: StoredReport) => void;
}) {
  return (
    <ul className="admin-archive-activity-list" tabIndex={0} aria-label="Archived report updates">
      {reports.map((report) => {
        const Icon = report.type === 'aging' ? FileText : FileSpreadsheet;
        return (
          <li key={`${report.type}-${report.id}`}>
            <button type="button" className="admin-archive-activity-report" data-type={report.type}
              aria-label={`Open ${report.title}, ${report.period}`} onClick={() => onOpenReport(report)}>
              <span className="admin-archive-activity-icon"><Icon size={18} aria-hidden="true" /></span>
              <span>
                <strong>{report.title}</strong>
                <time dateTime={report.savedAt} title={report.savedAtFormatted}>{lastUpdated(report.savedAt)}</time>
              </span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function StoredReportsList({ onOpenReport, canDelete }: {
  onOpenReport: (report: StoredReport) => void;
  canDelete: boolean;
}) {
  const [reports, setReports] = useState<StoredReport[] | null>(null);
  const [location, setLocation] = useState<ArchiveLocation>(null);
  const [query, setQuery] = useState('');
  const [reportType, setReportType] = useState<StoredReport['type'] | ''>('');
  const [sort, setSort] = useState<ArchiveSort>('');
  const [selected, setSelected] = useState<StoredReport | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const focusHeading = useRef(false);
  const activityDialog = useRef<HTMLDialogElement>(null);
  const activityId = useId();
  const newestReports = useMemo(() => sortArchiveItems(reports ?? [], 'newest', reportSortDetails), [reports]);
  const categories = useMemo(() => groupReports(newestReports), [newestReports]);

  useEffect(() => {
    let active = true;
    getStoredReports()
      .then((items) => { if (active) setReports(items); })
      .catch((issue) => {
        if (active) setError(issue instanceof Error ? issue.message : 'Could not load the report archive.');
      });
    return () => { active = false; };
  }, []);

  useLayoutEffect(() => {
    if (focusHeading.current) {
      heading.current?.focus({ preventScroll: true });
      focusHeading.current = false;
    }
  }, [location]);

  function navigate(next: ArchiveLocation) {
    focusHeading.current = true;
    setLocation(next);
    setSelected(null);
  }

  async function remove(report: StoredReport) {
    setDeleting(true);
    setError('');
    try {
      await deleteStoredReport(report);
      setReports((items) => items?.filter((item) => item.type !== report.type || item.id !== report.id) ?? null);
      setSelected((item) => item === report ? null : item);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Could not delete the report.');
    } finally {
      setDeleting(false);
    }
  }

  const category = categories.find((folder) => folder.type === location?.category);
  const month = location?.month;
  const term = query.trim().toLocaleLowerCase();
  const isSearching = !location && Boolean(term || reportType);
  const matchingReports = isSearching ? newestReports.filter((report) => {
    const categoryName = folders.find((folder) => folder.type === report.type)?.label;
    const searchableText = [report.title, report.period, categoryName].join(' ').toLocaleLowerCase();
    return (!reportType || report.type === reportType) && searchableText.includes(term);
  }) : category?.months.find((folder) => folder.key === month)?.reports ?? [];
  const visible = sortArchiveItems(matchingReports, sort, reportSortDetails);
  const entries = sortArchiveItems<ArchiveFolderEntry>(category ? category.months.map(({ key, reports }) => ({
    label: monthLabel(key), count: reports.length, savedAt: reports[0]?.savedAt,
    location: { category: category.type, month: key },
  })) : categories.map(({ type, label, count, savedAt }) => ({
    label, count, savedAt, location: { category: type },
  })), sort, (entry) => entry);

  return (
    <main className="app-main admin-archive">
      <ReportWorkflowHeader title={month !== undefined ? monthLabel(month) : category?.label ?? 'Archive'} headingRef={heading}>
        <div className="admin-archive-toolbar">
          {!location && (
            <>
              <label className="admin-archive-search">
                <input type="search" aria-label="Search archived reports" placeholder="Search archived reports…"
                  value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} />
                <Search size={16} aria-hidden="true" />
              </label>
              <label className="admin-archive-select admin-archive-filter">
                <Plus size={16} aria-hidden="true" />
                <select aria-label="Filter by report type" value={reportType}
                  onChange={(event) => { setReportType(event.target.value as StoredReport['type'] | ''); setSelected(null); }}>
                  <option value="">Filter</option>
                  {folders.map(({ type, label }) => <option key={type} value={type}>{label}</option>)}
                </select>
              </label>
            </>
          )}
          <label className="admin-archive-select">
            <select aria-label="Sort archived reports" value={sort}
              onChange={(event) => setSort(event.target.value as ArchiveSort)}>
              <option value="">Sort</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="title">Title A–Z</option>
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>
        </div>
      </ReportWorkflowHeader>
      <div className="admin-page admin-archive-page">
        {category && (
          <nav className="admin-archive-path" aria-label="Archive folders">
            <button className="admin-text-button" type="button" onClick={() => navigate(null)}>Archive</button>
            <ChevronRight size={15} aria-hidden="true" />
            {month !== undefined ? (
              <>
                <button className="admin-text-button" type="button" onClick={() => navigate({ category: category.type })}>{category.label}</button>
                <ChevronRight size={15} aria-hidden="true" />
                <span aria-current="page">{monthLabel(month)}</span>
              </>
            ) : <span aria-current="page">{category.label}</span>}
          </nav>
        )}
        {!reports && !error && <p role="status">Loading reports...</p>}
        {error && <p className="admin-error" role="alert">{error}</p>}
        {reports && !isSearching && month === undefined && entries.length > 0 && (
          <ul className="admin-archive-folders" data-root={!location}>
            {entries.map(({ label, count, savedAt, location: destination }) => (
              <li key={label}>
                <button className="admin-archive-folder" type="button" data-type={destination.category}
                  onClick={() => navigate(destination)}>
                  <span className="admin-archive-folder-icon"><Folder aria-hidden="true" /></span>
                  <span>
                    <strong>{label}</strong>
                    <small>{count} {count === 1 ? 'report' : 'reports'}</small>
                    {savedAt && <time dateTime={savedAt}>{lastUpdated(savedAt)}</time>}
                  </span>
                  <ChevronRight size={17} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {reports && isSearching && (
          <p className="admin-archive-result-count" role="status">
            {visible.length ? `${visible.length} matching ${visible.length === 1 ? 'report' : 'reports'}` : 'No archived reports match your search or filter.'}
          </p>
        )}
        {reports && location && !(month === undefined ? entries.length : visible.length) && <p>No saved reports in this folder.</p>}
        {visible.length > 0 && (
          <ul className="admin-archive-rows">
            {visible.map((report) => (
              <li key={`${report.type}-${report.id}`}>
                <div>
                  <h2>{report.title}</h2>
                  <p>{report.period} <span aria-hidden="true">|</span> <time dateTime={report.savedAt}>{report.savedAtFormatted}</time></p>
                </div>
                <div className="admin-archive-actions">
                  <button className="admin-secondary" type="button" onClick={() => onOpenReport(report)}
                    aria-label={`Open ${report.title}, ${report.period}`}>Open <ArrowRight size={16} aria-hidden="true" /></button>
                  {canDelete && (selected === report ? (
                    <>
                      <button className="admin-secondary" type="button" disabled={deleting} onClick={() => remove(report)}>Delete report</button>
                      <button className="admin-text-button" type="button" disabled={deleting} onClick={() => setSelected(null)}>Cancel</button>
                    </>
                  ) : (
                    <button className="admin-icon-button" type="button" title="Delete report"
                      aria-label={`Delete ${report.title}, ${report.period}`} onClick={() => setSelected(report)}><Trash2 size={16} aria-hidden="true" /></button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        {!location && !isSearching && (
          <section className="admin-archive-activity" aria-labelledby={`${activityId}-preview`}>
            <div className="admin-archive-activity-heading">
              <h2 id={`${activityId}-preview`}>Recent Activity</h2>
              <button className="admin-icon-button" type="button" title="Open Recent Activity dialog"
                aria-label="Open Recent Activity dialog" aria-haspopup="dialog" aria-controls={activityId}
                onClick={() => activityDialog.current?.showModal()}>
                <History size={17} aria-hidden="true" />
              </button>
            </div>
            {reports && (newestReports.length
              ? <RecentActivityList reports={newestReports} onOpenReport={onOpenReport} />
              : <p className="admin-archive-activity-status">No archived reports yet.</p>)}
          </section>
        )}
      </div>
      {!location && (
        <dialog ref={activityDialog} id={activityId} className="admin-archive-activity-dialog"
          aria-labelledby={`${activityId}-title`}>
          <header>
            <h2 id={`${activityId}-title`}>Recent Activity</h2>
            <button type="button" className="admin-icon-button" aria-label="Close Recent Activity"
              onClick={() => activityDialog.current?.close()}>
              <X size={20} aria-hidden="true" />
            </button>
          </header>
          {newestReports.length ? (
            <RecentActivityList reports={newestReports} onOpenReport={(report) => {
              activityDialog.current?.close();
              onOpenReport(report);
            }} />
          ) : (
            <p className="admin-archive-activity-status" role={error ? 'alert' : 'status'}>
              {error || (reports ? 'No archived reports yet.' : 'Loading archived reports…')}
            </p>
          )}
        </dialog>
      )}
    </main>
  );
}
