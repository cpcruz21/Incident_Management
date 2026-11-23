'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Archive, CalendarClock, CalendarRange, ChartColumnIncreasing,
  Check, ChevronDown, Circle, ClipboardList, Clock3, House, LogOut, Menu, TrendingUp, UserRound,
} from 'lucide-react';
import { isAdmin, type Account } from '@/lib/auth';
import { StoredReportsList } from '@/components/report/StoredReportsList';
import { UserManagement } from './UserManagement';
import { AuditLog } from './AuditLog';
import { IncidentLogo } from './IncidentLogo';
import { IncidentOverviewCharts, type IncidentStatusCount } from './IncidentOverviewCharts';
import { AppearanceSwitch } from './AppearanceSwitch';
import { AppFooter } from './AppFooter';
import { useAppearancePreference } from './useAppearancePreference';
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
  closed: number;
  averageDays: number | null;
  trend: { label: string; value: number }[];
  importedStatuses: IncidentStatusCount[];
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
  const profileButton = useRef<HTMLButtonElement>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, changeTheme] = useAppearancePreference('smac_admin_theme');
  const sidebarToggleLabel = sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
  const initials = account.name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();

  function select(view: DashboardView) {
    setNavigationOpen(false);
    setProfileOpen(false);
    if (view !== activeView) onSelectReport(view);
  }

  return (
    <div className="admin-shell" data-theme={theme} data-sidebar-collapsed={sidebarCollapsed}>
      <aside className="admin-sidebar" id="admin-sidebar">
        <div className="admin-brand-row">
          <button className="admin-brand" type="button" aria-label="Incident Management home" onClick={() => select('dashboard')}>
            <IncidentLogo />
            <strong className="admin-brand-title">Incident Management</strong>
          </button>
          <button
            className="admin-nav-toggle admin-nav-toggle-mobile" type="button" aria-expanded={navigationOpen}
            aria-controls="admin-navigation" aria-label={navigationOpen ? 'Close navigation' : 'Open navigation'}
            title={navigationOpen ? 'Close navigation' : 'Open navigation'}
            onClick={() => setNavigationOpen(!navigationOpen)}
          >
            <Menu size={22} aria-hidden="true" />
          </button>
          <button
            className="admin-nav-toggle admin-nav-toggle-desktop"
            type="button"
            aria-controls="admin-sidebar"
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarToggleLabel}
            title={sidebarToggleLabel}
            onClick={() => {
              setProfileOpen(false);
              setSidebarCollapsed((collapsed) => !collapsed);
            }}
          >
            <Menu size={22} aria-hidden="true" />
          </button>
        </div>
        <div id="admin-navigation" className="admin-navigation" data-open={navigationOpen}>
          <nav aria-label="Admin workspace">
            {navigation
              .filter(({ view }) => account.role === 'super-admin' || (view !== 'users' && view !== 'audit'))
              .map(({ view, label, Icon }) => (
                <button
                  key={view} type="button" onClick={() => select(view)}
                  aria-label={label}
                  aria-current={activeView === view ? 'page' : undefined}
                  title={sidebarCollapsed ? label : undefined}
                >
                  <Icon size={22} aria-hidden="true" />
                  <span className="admin-nav-label">{label}</span>
                </button>
              ))}
          </nav>
          <div className="admin-profile" onKeyDown={(event) => {
            if (event.key === 'Escape' && profileOpen) {
              setProfileOpen(false);
              profileButton.current?.focus();
            }
          }}>
            <button ref={profileButton} className="admin-profile-button" type="button"
              aria-label={`${account.name} account menu`} aria-expanded={profileOpen} aria-controls="admin-profile-actions"
              onClick={() => setProfileOpen((open) => !open)}>
              <span className="admin-avatar" aria-hidden="true">{initials}</span>
              <span><strong>{account.name}</strong><small>{account.role === 'super-admin' ? 'Super Administrator' : 'Administrator'}</small></span>
              <ChevronDown size={17} aria-hidden="true" />
            </button>
            <div className="admin-profile-actions" id="admin-profile-actions" hidden={!profileOpen}>
              <button type="button" onClick={() => select('account')}><UserRound size={20} aria-hidden="true" /> Account Settings</button>
              <div className="admin-profile-appearance">
                <span aria-hidden="true">Appearance</span>
                <AppearanceSwitch label="Admin appearance" value={theme} onChange={changeTheme} />
              </div>
              <button type="button" onClick={onLogout}><LogOut size={20} aria-hidden="true" /> Sign out</button>
            </div>
            {logoutError && <p className="admin-error" role="alert">{logoutError}</p>}
          </div>
        </div>
      </aside>
      <div className="admin-content">
        {activeView === 'dashboard' && <HomeOverview />}
        {activeView === 'archive' && (
          <StoredReportsList onOpenReport={onOpenStoredReport} canDelete={isAdmin(account)} />
        )}
        {activeView === 'users' && <main className="admin-page"><UserManagement account={account} /></main>}
        {activeView === 'account' && <main className="admin-page"><UserManagement account={account} personalOnly /></main>}
        {activeView === 'audit' && account.role === 'super-admin' && <main className="admin-page admin-audit-page"><header className="users-page-header"><h1>Audit Logs</h1></header><AuditLog /></main>}
        {children}
        <AppFooter />
      </div>
    </div>
  );
}

function HomeOverview() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState(false);

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

  const importedOpen = overview?.importedStatuses.find(({ label }) => label?.toLowerCase() === 'open')?.count;
  const metrics = [
    ['total', 'Total incidents', overview?.total, ChartColumnIncreasing],
    ['open', 'Open incidents', overview ? importedOpen ?? 0 : null, Circle],
    ['closed', 'Closed incidents', overview?.closed, Check],
    ['resolution', 'Avg. resolution time', overview?.averageDays == null ? null : `${overview.averageDays.toFixed(1)} days`, Clock3],
  ] as const;

  return (
    <main className="admin-page admin-home">
      <header className="admin-home-header">
        <h1><span className="admin-home-greeting">Welcome to</span> SMAC Reporting</h1>
      </header>
      {loadError && <p className="admin-error" role="alert">Could not load incident analytics.</p>}
      <dl className="admin-metrics">
        {metrics.map(([kind, label, value, Icon]) => (
          <div key={kind} data-metric={kind}>
            <dt>{label}</dt>
            <dd>
              <span className="admin-metric-value">{value?.toLocaleString() ?? '\u2014'}</span>
              <span className="admin-metric-icon" aria-hidden="true"><Icon size={27} /></span>
            </dd>
          </div>
        ))}
      </dl>
      <IncidentOverviewCharts trend={overview?.trend} statuses={overview?.importedStatuses} unavailable={loadError} />
    </main>
  );
}
