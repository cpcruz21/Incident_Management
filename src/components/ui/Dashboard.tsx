'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  Archive, ArrowRight, Bell, CalendarClock, CalendarRange, ChevronDown, ClipboardList, House,
  LogOut, Menu, Plus, TrendingUp, UserRound,
} from 'lucide-react';
import type { Account } from '@/lib/auth';
import { StoredReportsList } from '@/components/report/StoredReportsList';
import { UserManagement } from './UserManagement';
import { AuditLog } from './AuditLog';
import { migrateLegacyReports, type StoredReport } from '@/lib/storage/report-storage';
import './admin.css';

export type DashboardView = 'dashboard' | 'weekly' | 'monthly' | 'aging' | 'archive' | 'users' | 'audit' | 'account';

const navigation = [
  { view: 'dashboard', label: 'Home', Icon: House },
  { view: 'weekly', label: 'Weekly Reviews', Icon: CalendarClock },
  { view: 'monthly', label: 'Monthly Review', Icon: CalendarRange },
  { view: 'aging', label: 'Aging Trends', Icon: TrendingUp },
  { view: 'archive', label: 'Archive', Icon: Archive },
  { view: 'users', label: 'User Management', Icon: UserRound },
  { view: 'audit', label: 'Audit Logs', Icon: ClipboardList },
] as const;

interface Overview {
  total: number;
  open: number;
  closed: number;
  pending: number;
  unknown: number;
  averageDays: number | null;
  trend: { label: string; value: number }[];
}

interface DashboardProps {
  account: Account;
  activeView: DashboardView;
  onSelectReport: (view: DashboardView) => void;
  onOpenStoredReport: (report: StoredReport) => void;
  onLogout: () => void;
  logoutError: string;
  children?: ReactNode;
}

export function Dashboard({
  account, activeView, onSelectReport, onOpenStoredReport, onLogout, logoutError, children,
}: DashboardProps) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarToggleLabel = sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
  const initials = account.name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();

  function select(view: DashboardView) {
    setNavigationOpen(false);
    setProfileOpen(false);
    if (view !== activeView) onSelectReport(view);
  }

  return (
    <div className="admin-shell" data-sidebar-collapsed={sidebarCollapsed}>
      <aside className="admin-sidebar" id="admin-sidebar">
        <div className="admin-brand-row">
          <button className="admin-brand" type="button" onClick={() => select('dashboard')}>
            <span className="equicom-logo"><img className="equicom-logo-art" src="/images/EQUI.png" width="82" height="72" alt="Equicom" /></span>
            <strong className="admin-brand-title">Incident Management</strong>
          </button>
          <button
            className="admin-nav-toggle admin-nav-toggle-mobile" type="button" aria-expanded={navigationOpen}
            aria-controls="admin-navigation" aria-label={navigationOpen ? 'Close navigation' : 'Open navigation'}
            title={navigationOpen ? 'Close navigation' : 'Open navigation'}
            onClick={() => setNavigationOpen(!navigationOpen)}
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <button
            className="admin-nav-toggle admin-nav-toggle-desktop"
            type="button"
            aria-controls="admin-navigation"
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarToggleLabel}
            title={sidebarToggleLabel}
            onClick={() => {
              setProfileOpen(false);
              setSidebarCollapsed((collapsed) => !collapsed);
            }}
          >
            <Menu size={20} aria-hidden="true" />
          </button>
        </div>
        <div id="admin-navigation" className="admin-navigation" data-open={navigationOpen}>
          <nav aria-label="Admin workspace">
            {navigation.filter(item => item.view !== 'audit' || account.role === 'super-admin').map(({ view, label, Icon }) => (
              <button
                key={view} type="button" onClick={() => select(view)}
                aria-current={activeView === view ? 'page' : undefined}
              >
                <Icon size={23} aria-hidden="true" /> {view === 'users' && account.role === 'admin' ? 'Account Settings' : label}
              </button>
            ))}
          </nav>
          <div className="admin-profile">
            {profileOpen && (
              <div className="admin-profile-actions">
                <button type="button" onClick={() => select('account')}><UserRound size={16} /> Account settings</button>
                <button type="button" onClick={onLogout}><LogOut size={16} /> Sign out</button>
              </div>
            )}
            <button className="admin-profile-button" type="button" aria-expanded={profileOpen}
              onClick={() => setProfileOpen(!profileOpen)}>
              <span className="admin-avatar" aria-hidden="true">{initials}</span>
              <span><strong>{account.name}</strong><small>{account.role === 'super-admin' ? 'Super Administrator' : 'Administrator'}</small></span>
              <ChevronDown size={17} aria-hidden="true" />
            </button>
            {logoutError && <p className="admin-error" role="alert">{logoutError}</p>}
          </div>
        </div>
        {sidebarCollapsed && (
          <span className="admin-avatar admin-collapsed-avatar" role="img" aria-label={account.name} title={account.name}>
            {initials}
          </span>
        )}
      </aside>
      <div className="admin-content">
        {activeView === 'dashboard' && <HomeOverview onSelect={onSelectReport} />}
        {activeView === 'archive' && (
          <main className="admin-page">
            <StoredReportsList onOpenReport={onOpenStoredReport} canDelete={account.role === 'super-admin'} />
          </main>
        )}
        {activeView === 'users' && <main className="admin-page"><UserManagement account={account} /></main>}
        {activeView === 'account' && <main className="admin-page"><UserManagement account={account} personalOnly /></main>}
        {activeView === 'audit' && account.role === 'super-admin' && <main className="admin-page admin-audit-page"><header className="users-page-header"><h1>Audit Logs</h1></header><AuditLog /></main>}
        {children}
        <footer className="admin-footer app-footer">
          <p>&copy; {new Date().getFullYear()} Equitable Computer Services Inc.</p>
        </footer>
      </div>
    </div>
  );
}

function HomeOverview({ onSelect }: { onSelect: (view: DashboardView) => void }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      await migrateLegacyReports();
      const response = await fetch('/api/admin/overview', { signal: controller.signal });
      if (!response.ok) throw new Error('Unable to load overview');
      setOverview(await response.json());
    }
    load().catch(() => { if (!controller.signal.aborted) setLoadError(true); });
    return () => controller.abort();
  }, []);

  const metrics = [
    ['Total incidents', overview?.total],
    ['Open incidents', overview?.open],
    ['Closed incidents', overview?.closed],
    ['Avg. resolution time', overview?.averageDays == null ? null : `${overview.averageDays.toFixed(1)} days`],
  ] as const;

  const statuses = [
    ['Open', overview?.open, 'open'],
    ['Closed', overview?.closed, 'closed'],
    ['Pending review', overview?.pending, 'pending'],
    ...(overview?.unknown ? [['Unclassified', overview.unknown, 'unknown']] as const : []),
  ] as const;

  return (
    <main className="admin-page admin-home">
      <header className="admin-welcome">
        <div>
          <p className="admin-kicker">Welcome to</p>
          <h1>SMAC Reporting</h1>
          <p>Incident reports, weekly reviews, and performance insights.</p>
        </div>
      </header>
      <section className="admin-overview" aria-labelledby="analytics-heading">
        <div className="admin-overview-header">
          <h2 id="analytics-heading">Analytics overview</h2>
          <div className="admin-create">
            <button className="admin-primary" type="button" aria-expanded={createOpen}
              onClick={() => setCreateOpen(!createOpen)}>
              <Plus size={17} /> Create new report
            </button>
            {createOpen && (
              <div className="admin-create-options" onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setCreateOpen(false);
                  event.currentTarget.parentElement?.querySelector('button')?.focus();
                }
              }}>
                {navigation.slice(1, 4).map(({ view, label, Icon }) => (
                  <button key={view} type="button" onClick={() => onSelect(view)}><Icon size={17} /> {label}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        {loadError && <p className="admin-error" role="alert">Could not load incident analytics.</p>}
        <dl className="admin-metrics">
          {metrics.map(([label, value]) => (
            <div key={label}><dt>{label}</dt><dd>{value ?? '\u2014'}</dd></div>
          ))}
        </dl>
        <div className="admin-charts">
          <section className="admin-chart">
            <h3>Incident volume over time</h3>
            <IncidentTrend trend={overview?.trend || []} />
          </section>
          <section className="admin-chart">
            <h3>Status breakdown</h3>
            <ul className="admin-statuses">
              {statuses.map(([label, count, status]) => (
                <li key={status}><span className={`admin-dot admin-dot-${status}`} />{label}<strong>{count ?? '\u2014'}</strong></li>
              ))}
            </ul>
          </section>
        </div>
        <section className="admin-insights">
          <div>
            <h3><Bell size={15} /> Insights &amp; alerts</h3>
            <p>{overview ? `${overview.open + overview.pending} incidents open or pending review.` : 'Incident follow-ups'}</p>
          </div>
          <button className="admin-text-button" type="button" onClick={() => onSelect('weekly')}>
            View follow-ups <ArrowRight size={16} />
          </button>
        </section>
      </section>
    </main>
  );
}

function IncidentTrend({ trend }: { trend: Overview['trend'] }) {
  if (!trend.length) return <div className="admin-trend-empty">No dated incidents to chart.</div>;
  const scale = Math.max(1, ...trend.map((point) => point.value));
  const points = trend.map((point, index) => [20 + index * 92, 116 - point.value / scale * 96]);
  return (
    <figure className="admin-trend">
      <svg viewBox="0 0 500 134" role="img" aria-label={trend.map(({ label, value }) => `${label}: ${value}`).join(', ')}>
        {[20, 52, 84, 116].map((y) => <line key={y} x1="20" x2="480" y1={y} y2={y} stroke="var(--ui-border, #214359)" />)}
        <polyline points={points.map((point) => point.join(',')).join(' ')} fill="none" stroke="var(--ui-link, #31c2dd)" strokeWidth="3" />
        {points.map(([x, y], index) => (
          <circle key={x} cx={x} cy={y} r="4" fill="var(--ui-link, #31c2dd)"><title>{trend[index].label}: {trend[index].value}</title></circle>
        ))}
      </svg>
      <figcaption>{trend.map(({ label }) => <span key={label}>{label}</span>)}</figcaption>
    </figure>
  );
}
