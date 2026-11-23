'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { AgingReportData } from '@/types/aging';
import type { MonthlyReportData } from '@/types/monthly';
import type { WeeklyReportData } from '@/types/sla';
import type { Incident } from '@/types/incident';
import { AgingReportTable } from '@/components/aging/AgingReportTable';
import { MonthlyReportTable } from '@/components/monthly/MonthlyReportTable';
import { refreshStoredMonthlyReport } from '@/lib/monthly/calculator';
import { SLAReportTable } from '@/components/report/SLAReportTable';
import { DetailModal } from '@/components/report/DetailModal';
import { fetchPublishedReports } from '@/lib/api/client';
import { getLegacyStoredReports, type StoredReport } from '@/lib/storage/report-storage';
import { IRAnalyticsDashboard } from '@/components/ir-analytics/IRAnalyticsDashboard';
import { IncidentLogo } from '@/components/ui/IncidentLogo';
import { AppearanceSwitch } from '@/components/ui/AppearanceSwitch';
import { AppFooter } from '@/components/ui/AppFooter';
import { useAppearancePreference } from '@/components/ui/useAppearancePreference';

type ReportTabType = 'weekly' | 'aging' | 'monthly' | 'ir-analytics';
const DASHBOARD_THEME_KEY = 'smac_dashboard_theme';
const PUBLIC_MODULES = [
  { id: 'ir-analytics', label: 'Dashboard', icon: '📈' },
  { id: 'weekly', label: 'Weekly SLA', icon: '📅' },
  { id: 'aging', label: 'Aging', icon: '⏳' },
  { id: 'monthly', label: 'Monthly', icon: '📊' },
] as const;

type ReportModule = Exclude<ReportTabType, 'ir-analytics'>;
type ReportLoadStatus = 'loading' | 'ready' | 'error';

interface PublishedReport<T> {
  id: string;
  title: string;
  period: string;
  reportData: T;
  routedIncidents?: Incident[];
}

const INITIAL_LOAD_STATUS: Record<ReportModule, ReportLoadStatus> = {
  weekly: 'loading',
  aging: 'loading',
  monthly: 'loading',
};
const REPORT_NAMES = { weekly: 'Weekly SLA', aging: 'Aging Report', monthly: 'Monthly Report' };
const ANALYTICS_MODULES = ['aging', 'monthly'] as const;
const REPORT_LOAD_TIMEOUT_MS = 15_000;

function readPublishedReports<T extends { reportTitle?: string; reportPeriod?: string }>(
  type: ReportModule,
  records: Record<string, unknown>[],
): PublishedReport<T>[] {
  return records.flatMap((record, index) => {
    if (!record.reportData || typeof record.reportData !== 'object' || Array.isArray(record.reportData)) return [];
    const reportData = record.reportData as T;
    return [{
      id: String(record.id || type + '-' + index),
      title: String(record.title || reportData.reportTitle || REPORT_NAMES[type]),
      period: String(record.period || reportData.reportPeriod || (type === 'monthly' ? '' : 'Current Period')),
      reportData,
      routedIncidents: Array.isArray(record.routedIncidents) ? record.routedIncidents as Incident[] : undefined,
    }];
  });
}

export default function PublicDashboardPage() {
  const [activeTab, setActiveTab] = useState<ReportTabType>('ir-analytics');
  const [theme, changeTheme] = useAppearancePreference(DASHBOARD_THEME_KEY);

  const [agingReports, setAgingReports] = useState<PublishedReport<AgingReportData>[]>([]);
  const [monthlyReports, setMonthlyReports] = useState<PublishedReport<MonthlyReportData>[]>([]);
  const [weeklyReports, setWeeklyReports] = useState<PublishedReport<WeeklyReportData>[]>([]);

  const [selectedAgingId, setSelectedAgingId] = useState<string>('');
  const [selectedMonthlyId, setSelectedMonthlyId] = useState<string>('');
  const [selectedWeeklyId, setSelectedWeeklyId] = useState<string>('');

  const [legacyReports, setLegacyReports] = useState<StoredReport[]>([]);
  const [loadStatus, setLoadStatus] = useState(INITIAL_LOAD_STATUS);
  const pendingLoad = useRef<AbortController | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    title: string;
    incidentIds: string[];
  }>({ isOpen: false, title: '', incidentIds: [] });

  const loadReports = useCallback(async (showLoading = false) => {
    if (pendingLoad.current && !showLoading) return;
    pendingLoad.current?.abort();
    const controller = new AbortController();
    pendingLoad.current = controller;
    if (showLoading) setLoadStatus(INITIAL_LOAD_STATUS);
    const timeout = window.setTimeout(() => controller.abort(), REPORT_LOAD_TIMEOUT_MS);
    const localReports = getLegacyStoredReports().filter(Boolean);
    setLegacyReports(localReports);

    async function loadModule<T extends { reportTitle?: string; reportPeriod?: string }>(
      type: ReportModule,
      setReports: React.Dispatch<React.SetStateAction<PublishedReport<T>[]>>,
      prepareLegacy?: (report: StoredReport) => T,
    ) {
      let published: PublishedReport<T>[] | undefined;
      try {
        published = readPublishedReports<T>(type, await fetchPublishedReports(type, controller.signal));
      } catch (error) {
        if (pendingLoad.current === controller) console.warn('Could not load published ' + type + ' reports:', error);
      }
      if (pendingLoad.current !== controller) return false;

      const reports = published ?? [];
      if (prepareLegacy) {
        for (const report of localReports) {
          if (report.type !== type || !report.reportData || reports.some(item => item.id === report.id)) continue;
          try {
            reports.push({
              id: report.id,
              title: report.title,
              period: report.period,
              reportData: prepareLegacy(report),
              routedIncidents: report.routedIncidents,
            });
          } catch (error) {
            console.warn('Could not load saved ' + type + ' report:', error);
          }
        }
      }

      setReports(previous => !published && previous.length > 0 ? previous : reports);
      setLoadStatus(previous => ({ ...previous, [type]: published ? 'ready' : 'error' }));
      return published !== undefined;
    }

    try {
      const results = await Promise.all([
        loadModule('weekly', setWeeklyReports),
        loadModule<AgingReportData>('aging', setAgingReports, report => ({ ...report.reportData as AgingReportData, reportId: report.id })),
        loadModule('monthly', setMonthlyReports, report => refreshStoredMonthlyReport(report.reportData as MonthlyReportData, report.routedIncidents)),
      ]);
      if (pendingLoad.current === controller && results.some(Boolean)) setLastSyncTime(new Date());
    } finally {
      window.clearTimeout(timeout);
      if (pendingLoad.current === controller) pendingLoad.current = null;
    }
  }, []);

  useEffect(() => {
    loadReports(true);

    const pollInterval = setInterval(() => loadReports(false), 60_000);

    const handleFocus = () => {
      if (document.visibilityState === 'visible') loadReports(false);
    };

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('smac_report_updates');
      bc.onmessage = () => loadReports(false);
    } catch { }

    const handleStorage = (e: StorageEvent) => {
      if (e.key?.includes('smac_report') || e.key?.includes('weekly_report') || e.key?.includes('aging_report') || e.key?.includes('monthly_report')) {
        loadReports(false);
      }
    };
    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorage);

    return () => {
      clearInterval(pollInterval);
      const controller = pendingLoad.current;
      pendingLoad.current = null;
      controller?.abort();
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
      if (bc) bc.close();
    };
  }, [loadReports]);

  const activeAgingReport =
    agingReports.find((r) => r.id === selectedAgingId) || agingReports[0] || null;
  const activeMonthlyReport =
    monthlyReports.find((r) => r.id === selectedMonthlyId) || monthlyReports[0] || null;
  const activeWeeklyReport = weeklyReports.find((report) => report.id === selectedWeeklyId) || weeklyReports[0] || null;

  const handleCellClick = (title: string, ids: string[]) => {
    setModalState({ isOpen: true, title, incidentIds: ids });
  };

  const visibleModules = activeTab === 'ir-analytics' ? ANALYTICS_MODULES : [activeTab];
  const unavailableModules = visibleModules.filter(type => loadStatus[type] === 'error');

  const reportCounts = { weekly: weeklyReports.length, aging: agingReports.length, monthly: monthlyReports.length };

  function changeReportView(view: ReportTabType) {
    if (view !== activeTab) {
      setActiveTab(view);
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  return (
    <div className="public-dashboard" data-theme={theme} style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      color: 'var(--ui-text, #f8fafc)',
      fontFamily: "var(--font-sans), 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    }}>

      <a href="#public-report-content" className="live-skip">Skip to report content</a>
      <header className="live-header">
        <div className="live-header-accent" aria-hidden="true" />

        <div className="live-header-row">
          <div className="live-header-brand">
            <IncidentLogo />
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.12em', color: 'var(--ui-link, #38bdf8)', textTransform: 'uppercase' }}>
                Incident Management
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ui-text, #f8fafc)', lineHeight: 1.2, letterSpacing: '-0.01em' }}>
                SMAC Reporting
              </div>
            </div>
          </div>

          <nav className="live-navigation" aria-label="Public report modules">
            {PUBLIC_MODULES.map(({ id, label, icon }) => (
              <button key={id} type="button" aria-current={activeTab === id ? 'page' : undefined}
                onClick={() => changeReportView(id)}>
                <span className="live-navigation-icon" aria-hidden="true">
                  {id === 'ir-analytics' ? <img src="/images/DASH.png" alt="" /> : icon}
                </span>
                <span>{label}</span>
                {id !== 'ir-analytics' && <span className="live-navigation-count" aria-hidden="true">{reportCounts[id]}</span>}
              </button>
            ))}
          </nav>

          <div className="live-header-controls">
            <div className="live-status"
              title={lastSyncTime ? `Last sync: ${lastSyncTime.toLocaleTimeString()}` : 'Auto-sync active'}
            >
              <span className="live-status-dot" aria-hidden="true" />
              <span className="live-status-label">Live Dashboard</span>
            </div>

            <AppearanceSwitch label="Dashboard appearance" value={theme} onChange={changeTheme} />
          </div>
        </div>
      </header>
      <main id="public-report-content" tabIndex={-1} className="live-content" style={{ flex: 1 }}>

        {unavailableModules.length > 0 && (
          <div className="public-report-load-notice" role="status">
            <span>Could not refresh {unavailableModules.map(type => REPORT_NAMES[type]).join(' and ')}.</span>
            <button type="button" onClick={() => loadReports(true)}>Try again</button>
          </div>
        )}
        {activeTab === 'ir-analytics' && (
          <IRAnalyticsDashboard agingReports={agingReports} monthlyReports={monthlyReports} legacyReports={legacyReports}
            isLoading={ANALYTICS_MODULES.some(type => loadStatus[type] === 'loading')}
            hasLoadError={unavailableModules.length > 0} />
        )}

        {activeTab === 'weekly' && (
          !activeWeeklyReport ? (
            <ReportPlaceholder status={loadStatus.weekly} loadingLabel="Loading weekly SLA reports…"
              icon="📅" title="No Published Weekly SLA Reports"
              onRetry={() => loadReports(true)} />
          ) : (
            <SLAReportTable key={activeWeeklyReport.id} data={activeWeeklyReport.reportData}
              routedIncidents={activeWeeklyReport.routedIncidents} onCellClick={handleCellClick} isPublicView
              periodControl={<ReportPeriodPicker label="Weekly SLA report period" reports={weeklyReports}
                selectedId={activeWeeklyReport.id} onSelect={setSelectedWeeklyId} />} />
          )
        )}
        {activeTab === 'aging' && (
          !activeAgingReport ? (
            <ReportPlaceholder status={loadStatus.aging} loadingLabel="Loading aging ticket reports…"
              icon="⏳"
              title="No Published Aging Reports"
              description="There are no published aging ticket reports yet. Generate and publish a report from the administrator workspace to view it here."
              onRetry={() => loadReports(true)}
            />
          ) : (
            <AgingReportTable
              key={activeAgingReport.id}
              data={activeAgingReport.reportData}
              onCellClick={handleCellClick}
              routedIncidents={activeAgingReport.routedIncidents}
              accountName="Department Guest"
              isPublicView={true}
              periodControl={<ReportPeriodPicker label="Aging report period" reports={agingReports}
                selectedId={activeAgingReport.id} onSelect={setSelectedAgingId} />}
            />
          )
        )}
        {activeTab === 'monthly' && (
          !activeMonthlyReport ? (
            <ReportPlaceholder status={loadStatus.monthly} loadingLabel="Loading monthly SLA reports…"
              icon="📊"
              title="No Published Monthly Reports"
              description="There are no published monthly SLA reports yet. Generate and publish a monthly report from the Monthly Incident Report module to view it here."
              onRetry={() => loadReports(true)}
            />
          ) : (
            <MonthlyReportTable
              key={activeMonthlyReport.id}
              data={activeMonthlyReport.reportData}
              onCellClick={handleCellClick}
              routedIncidents={activeMonthlyReport.routedIncidents}
              isAdmin={false}
              isPublicView={true}
              periodControl={<ReportPeriodPicker label="Monthly SLA report period" reports={monthlyReports}
                selectedId={activeMonthlyReport.id} onSelect={setSelectedMonthlyId} />}
            />
          )
        )}
      </main>
      <AppFooter />
      <DetailModal
        isOpen={modalState.isOpen}
        title={modalState.title}
        incidentIds={modalState.incidentIds}
        onClose={() => setModalState((prev) => ({ ...prev, isOpen: false }))}
      />
      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(16,185,129,0.35); }
          50% { box-shadow: 0 0 0 6px rgba(16,185,129,0.12); }
        }
        * {
          box-sizing: border-box;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        button, input, select, textarea {
          font-family: inherit;
        }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: var(--ui-inset, #091426); }
        ::-webkit-scrollbar-thumb { background: #243650; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #2563eb; }
        select option { background: var(--ui-surface, #111c30); color: var(--ui-text, #f8fafc); }
      `}</style>
    </div>
  );
}


function ReportPeriodPicker({ label, reports, selectedId, onSelect }: {
  label: string;
  reports: { id: string; period: string; title: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const selected = reports.find((report) => report.id === selectedId);
  return (
    <select className="live-report-select" aria-label={label} value={selectedId} title={selected?.period || selected?.title}
      onChange={(event) => onSelect(event.target.value)}>
      {reports.map((report, index) => (
        <option key={report.id} value={report.id}>
          {report.period || report.title}{index === 0 ? ' (Latest)' : ''}
        </option>
      ))}
    </select>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--ui-secondary, #94a3b8)' }}>
      <div style={{ fontSize: '36px', marginBottom: '16px', animation: 'spin 1.2s linear infinite', display: 'inline-block' }}>⏳</div>
      <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ui-muted, #64748b)' }}>{label}</p>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ReportPlaceholder({ status, loadingLabel, icon, title, description, onRetry }: {
  status: ReportLoadStatus;
  loadingLabel: string;
  icon: string;
  title: string;
  description?: string;
  onRetry: () => void;
}) {
  if (status === 'loading') return <LoadingState label={loadingLabel} />;
  if (status === 'error') return null;

  return (
    <div className="public-report-state" style={{
      background: 'var(--glass-panel, linear-gradient(145deg, var(--ui-surface, #0d1a2e), var(--ui-page, #0a1525)))',
      border: '1px solid var(--ui-panel-border)',
      borderRadius: '20px',
      padding: '64px 32px',
      textAlign: 'center',
      maxWidth: '600px',
      margin: '60px auto',
    }}>
      <div style={{ fontSize: '52px', marginBottom: '18px' }}>{icon}</div>
      <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--ui-text, #fff)', marginBottom: '10px' }}>{title}</h2>
      {description && <p style={{ color: 'var(--ui-muted, #64748b)', fontSize: '14px', lineHeight: 1.7, maxWidth: '420px', margin: '0 auto 24px' }}>{description}</p>}
      <button
        type="button"
        onClick={onRetry}
        style={{
          background: '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: '10px',
          padding: '10px 22px',
          fontSize: '13px',
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
        }}
      >
        🔄 Check Again
      </button>
    </div>
  );
}
