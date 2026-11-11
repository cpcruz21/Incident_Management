'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Moon, Sun } from 'lucide-react';
import type { AgingReportData } from '@/types/aging';
import type { MonthlyReportData } from '@/types/monthly';
import type { WeeklyReportData } from '@/types/sla';
import type { Incident } from '@/types/incident';
import { AgingReportTable } from '@/components/aging/AgingReportTable';
import { MonthlyReportTable } from '@/components/monthly/MonthlyReportTable';
import { SLAReportTable } from '@/components/report/SLAReportTable';
import { DetailModal } from '@/components/report/DetailModal';
import {
  fetchServerAgingReports,
  fetchServerMonthlyReports,
  fetchServerWeeklyReports,
} from '@/lib/api/client';
import { getLegacyStoredReports } from '@/lib/storage/report-storage';
import { IRAnalyticsDashboard } from '@/components/ir-analytics/IRAnalyticsDashboard';

type ReportTabType = 'weekly' | 'aging' | 'monthly' | 'ir-analytics';
type DashboardTheme = 'light' | 'night';
const DASHBOARD_THEME_KEY = 'smac_dashboard_theme';

interface PublishedAgingReport {
  id: string;
  title: string;
  period: string;
  reportData: AgingReportData;
  routedIncidents?: Incident[];
  savedAt?: string;
  savedBy?: string;
}

interface PublishedMonthlyReport {
  id: string;
  title: string;
  period: string;
  reportData: MonthlyReportData;
  routedIncidents?: Incident[];
  savedAt?: string;
  savedBy?: string;
}

interface PublishedWeeklyReport extends Omit<PublishedAgingReport, 'reportData'> {
  reportData: WeeklyReportData;
}

export default function PublicDashboardPage() {
  const [activeTab, setActiveTab] = useState<ReportTabType>('ir-analytics');
  const [theme, setTheme] = useState<DashboardTheme>('light');

  useEffect(() => {
    try {
      if (localStorage.getItem(DASHBOARD_THEME_KEY) === 'night') setTheme('night');
    } catch { }
  }, []);

  const changeTheme = (next: DashboardTheme) => {
    setTheme(next);
    try { localStorage.setItem(DASHBOARD_THEME_KEY, next); } catch { }
  };

  const [agingReports, setAgingReports] = useState<PublishedAgingReport[]>([]);
  const [monthlyReports, setMonthlyReports] = useState<PublishedMonthlyReport[]>([]);
  const [weeklyReports, setWeeklyReports] = useState<PublishedWeeklyReport[]>([]);

  const [selectedAgingId, setSelectedAgingId] = useState<string>('');
  const [selectedMonthlyId, setSelectedMonthlyId] = useState<string>('');
  const [selectedWeeklyId, setSelectedWeeklyId] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    title: string;
    incidentIds: string[];
  }>({ isOpen: false, title: '', incidentIds: [] });

  const loadReports = useCallback(async (isInitial = false) => {
    if (isInitial) setIsLoading(true);

    const agingList: PublishedAgingReport[] = [];
    const monthlyList: PublishedMonthlyReport[] = [];
    const weeklyList: PublishedWeeklyReport[] = [];
    const [serverWeekly, serverAging, serverMonthly] = await Promise.all([
      fetchServerWeeklyReports(), fetchServerAgingReports(), fetchServerMonthlyReports(),
    ]);
    for (const item of serverWeekly) {
      if (item.reportData && typeof item.reportData === 'object') {
        const reportData = item.reportData as WeeklyReportData;
        weeklyList.push({
          id: String(item.id), title: String(item.title || reportData.reportTitle || 'Weekly SLA'),
          period: String(item.period || reportData.reportPeriod || 'Current Period'), reportData,
          routedIncidents: (item.routedIncidents as Incident[]) || [],
          savedAt: String(item.savedAt || item.serverSavedAt || ''), savedBy: String(item.savedBy || 'System'),
        });
      }
    }

    try {
      if (Array.isArray(serverAging)) {
        for (const item of serverAging) {
          if (item.reportData && typeof item.reportData === 'object') {
            agingList.push({
              id: String(item.id || `server-aging-${Date.now()}`),
              title: String(item.title || (item.reportData as any).reportTitle || 'Aging Report'),
              period: String(item.period || (item.reportData as any).reportPeriod || 'Current Period'),
              reportData: item.reportData as AgingReportData,
              routedIncidents: (item.routedIncidents as Incident[]) || [],
              savedAt: String(item.savedAt || (item as any).serverSavedAt || ''),
              savedBy: String(item.savedBy || 'System'),
            });
          }
        }
      }
    } catch (err) {
      console.warn('Could not load server aging reports:', err);
    }

    try {
      if (Array.isArray(serverMonthly)) {
        for (const item of serverMonthly) {
          if (item.reportData && typeof item.reportData === 'object') {
            monthlyList.push({
              id: String(item.id || `server-monthly-${Date.now()}`),
              title: String(item.title || (item.reportData as any).reportTitle || 'Monthly Report'),
              period: String(item.period || (item.reportData as any).reportPeriod || ''),
              reportData: item.reportData as MonthlyReportData,
              routedIncidents: (item.routedIncidents as Incident[]) || [],
              savedAt: String(item.savedAt || ''),
              savedBy: String(item.savedBy || 'System'),
            });
          }
        }
      }
    } catch (err) {
      console.warn('Could not load server monthly reports:', err);
    }

    try {
      const localReports = getLegacyStoredReports();
      for (const r of localReports) {
        if (r.type === 'aging' && r.reportData) {
          const alreadyAdded = agingList.some((x) => x.id === r.id);
          if (!alreadyAdded) {
            agingList.push({
              id: r.id,
              title: r.title,
              period: r.period,
              reportData: { ...(r.reportData as AgingReportData), reportId: r.id },
              routedIncidents: r.routedIncidents as Incident[] | undefined,
            });
          }
        }
        if (r.type === 'monthly' && r.reportData) {
          const alreadyAdded = monthlyList.some((x) => x.id === r.id);
          if (!alreadyAdded) {
            monthlyList.push({
              id: r.id,
              title: r.title,
              period: r.period,
              reportData: r.reportData as MonthlyReportData,
              routedIncidents: r.routedIncidents as Incident[] | undefined,
            });
          }
        }
      }
    } catch { }

    setAgingReports(agingList);
    setMonthlyReports(monthlyList);
    setWeeklyReports(weeklyList);
    setLastSyncTime(new Date());
    setIsLoading(false);
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

  // ─── Nav Tab descriptor ────────────────────────────────────────────────────
  const tabs: { key: ReportTabType; icon: string; label: string; count?: number }[] = [
    { key: 'ir-analytics', icon: '📈', label: 'Dashboard' },
    { key: 'weekly', icon: '📅', label: 'Weekly SLA', count: weeklyReports.length || undefined },
    { key: 'aging', icon: '⏳', label: 'Aging', count: agingReports.length || undefined },
    { key: 'monthly', icon: '📊', label: 'Monthly', count: monthlyReports.length || undefined },
  ];

  return (
    <div className="public-dashboard" data-theme={theme} style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--ui-page, #060f1e)',
      color: 'var(--ui-text, #f8fafc)',
      fontFamily: "var(--font-sans), 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    }}>

      {/* ═══════════════════ TOPBAR ═══════════════════ */}
      <header style={{
        background: 'linear-gradient(180deg, var(--ui-inset, #0c1a30) 0%, var(--ui-inset, #091426) 100%)',
        borderBottom: '1px solid var(--ui-panel-border)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: '0 4px 24px var(--ui-shadow, rgba(0,0,0,0.45))',
      }}>
        {/* Thin accent bar at top */}
        <div style={{ height: '3px', background: 'linear-gradient(90deg, #2563eb 0%, #7c3aed 50%, #06b6d4 100%)' }} />

        <div className="live-header-row">
          {/* ── Brand ── */}
          <div className="live-header-brand">
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              overflow: 'hidden',
              background: 'var(--ui-inset, #101f36)',
              border: '1px solid var(--ui-border, #1e3a5f)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 2px 10px var(--ui-shadow, rgba(0,0,0,0.3))',
            }}>
              <img
                className="equicom-logo-art"
                src="/images/EQUI.png"
                alt="Equicom"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.12em', color: 'var(--ui-link, #38bdf8)', textTransform: 'uppercase' }}>
                Incident Management
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ui-text, #f8fafc)', lineHeight: 1.2, letterSpacing: '-0.01em' }}>
                SMAC Reporting
              </div>
            </div>
          </div>

          {/* ── Navigation Tabs ── */}
          <nav className="live-navigation" aria-label="Public report modules" style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--ui-wash, rgba(255,255,255,0.04))',
            border: '1px solid var(--ui-panel-border)',
            borderRadius: '12px',
            padding: '4px',
            gap: '3px',
          }}>
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  aria-current={isActive ? 'page' : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: isActive ? '#2563eb' : 'transparent',
                    color: isActive ? '#ffffff' : 'var(--ui-secondary, #94a3b8)',
                    fontWeight: isActive ? 800 : 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isActive ? '0 2px 14px rgba(37,99,235,0.4)' : 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tab.key === 'ir-analytics' ? (
                    <img src="/images/DASH.png" alt="" style={{ width: '16px', height: '16px', objectFit: 'contain', opacity: isActive ? 1 : 0.6 }} />
                  ) : (
                    <span style={{ fontSize: '15px' }}>{tab.icon}</span>
                  )}
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span style={{
                      background: isActive ? '#173b9c' : 'var(--ui-wash)',
                      color: isActive ? '#ffffff' : 'var(--ui-secondary, #94a3b8)',
                      fontSize: '11px',
                      fontWeight: 800,
                      padding: '1px 7px',
                      borderRadius: '999px',
                    }}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* ── Right Controls ── */}
          <div className="live-header-actions">
            {/* Live Sync indicator */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '6px 13px',
              background: 'rgba(16,185,129,0.12)',
              border: '1px solid rgba(16,185,129,0.3)',
              borderRadius: '999px',
              fontSize: '12px',
              color: 'var(--ui-success, #34d399)',
              fontWeight: 700,
              cursor: 'default',
            }}
              title={lastSyncTime ? `Last sync: ${lastSyncTime.toLocaleTimeString()}` : 'Auto-sync active'}
            >
              <span style={{
                width: '7px', height: '7px', borderRadius: '50%', background: 'var(--ui-success)',
                boxShadow: '0 0 0 3px rgba(16,185,129,0.35)',
                animation: 'pulse 2s infinite',
                display: 'inline-block',
              }} />
              Live Dashboard
            </div>

            {/* Period selector */}
            {activeTab === 'weekly' && weeklyReports.length > 0 && (
              <select aria-label="Weekly SLA report period" value={activeWeeklyReport?.id || ''} onChange={(event) => setSelectedWeeklyId(event.target.value)}
                style={{ background: 'var(--ui-surface, #111c30)', color: 'var(--ui-text, #f8fafc)', border: '1px solid var(--ui-control-border)', borderRadius: '8px', padding: '7px 12px', fontSize: '12px', fontWeight: 600, maxWidth: '230px' }}>
                {weeklyReports.map((report, index) => <option key={report.id} value={report.id}>{report.period || report.title}{index === 0 ? ' (Latest)' : ''}</option>)}
              </select>
            )}
            {activeTab === 'aging' && agingReports.length > 0 && (
              <select
                aria-label="Aging report period"
                value={selectedAgingId}
                onChange={(e) => setSelectedAgingId(e.target.value)}
                style={{
                  background: 'var(--ui-surface, #111c30)',
                  color: 'var(--ui-text, #f8fafc)',
                  border: '1px solid var(--ui-control-border)',
                  borderRadius: '8px',
                  padding: '7px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  maxWidth: '200px',
                }}
              >
                {agingReports.map((r, i) => (
                  <option key={r.id} value={r.id}>{r.period || r.title}{i === 0 ? ' (Latest)' : ''}</option>
                ))}
              </select>
            )}

            {activeTab === 'monthly' && monthlyReports.length > 0 && (
              <select
                aria-label="Monthly SLA report period"
                value={selectedMonthlyId}
                onChange={(e) => setSelectedMonthlyId(e.target.value)}
                style={{
                  background: 'var(--ui-surface, #111c30)',
                  color: 'var(--ui-text, #f8fafc)',
                  border: '1px solid var(--ui-control-border)',
                  borderRadius: '8px',
                  padding: '7px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  maxWidth: '200px',
                }}
              >
                {monthlyReports.map((r, i) => (
                  <option key={r.id} value={r.id}>{r.period || r.title}{i === 0 ? ' (Latest)' : ''}</option>
                ))}
              </select>
            )}

          </div>

          <div className="dashboard-theme-switch" role="group" aria-label="Dashboard appearance">
            <button type="button" aria-label="Light" title="Light mode" aria-pressed={theme === 'light'} onClick={() => changeTheme('light')}>
              <Sun size={13} aria-hidden="true" />
            </button>
            <button type="button" aria-label="Night" title="Night mode" aria-pressed={theme === 'night'} onClick={() => changeTheme('night')}>
              <Moon size={13} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {/* ═══════════════════ MAIN CONTENT ═══════════════════ */}
      <main className="live-content" style={{ flex: 1 }}>

        {/* ── IR Analytics Dashboard Tab ── */}
        {activeTab === 'ir-analytics' && (
          <IRAnalyticsDashboard
            agingReports={agingReports}
            monthlyReports={monthlyReports}
          />
        )}

        {activeTab === 'weekly' && (
          isLoading ? <LoadingState label="Loading weekly SLA reports…" /> : !activeWeeklyReport ? (
            <EmptyState icon="📅" title="No Published Weekly SLA Reports"
              description="Open a weekly report in the administrator workspace and choose Publish to dashboard."
              onRetry={() => loadReports(true)} />
          ) : (
            <SLAReportTable key={activeWeeklyReport.id} data={activeWeeklyReport.reportData}
              routedIncidents={activeWeeklyReport.routedIncidents} onCellClick={handleCellClick} isPublicView />
          )
        )}

        {/* ── Aging Tab ── */}
        {activeTab === 'aging' && (
          isLoading ? (
            <LoadingState label="Loading aging ticket reports…" />
          ) : !activeAgingReport ? (
            <EmptyState
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
            />
          )
        )}

        {/* ── Monthly SLA Tab ── */}
        {activeTab === 'monthly' && (
          isLoading ? (
            <LoadingState label="Loading monthly SLA reports…" />
          ) : !activeMonthlyReport ? (
            <EmptyState
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
            />
          )
        )}
      </main>

      {/* ═══════════════════ FOOTER ═══════════════════ */}
      <footer className="admin-footer app-footer">
        <p>&copy; {new Date().getFullYear()} Equitable Computer Services Inc.</p>
      </footer>

      {/* ═══════════════════ MODAL ═══════════════════ */}
      <DetailModal
        isOpen={modalState.isOpen}
        title={modalState.title}
        incidentIds={modalState.incidentIds}
        onClose={() => setModalState((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* ═══════════════════ GLOBAL STYLES ═══════════════════ */}
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

// ── Shared Helper Components ──────────────────────────────────────────────────

function LoadingState({ label }: { label: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--ui-secondary, #94a3b8)' }}>
      <div style={{ fontSize: '36px', marginBottom: '16px', animation: 'spin 1.2s linear infinite', display: 'inline-block' }}>⏳</div>
      <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ui-muted, #64748b)' }}>{label}</p>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function EmptyState({ icon, title, description, onRetry }: {
  icon: string;
  title: string;
  description: string;
  onRetry: () => void;
}) {
  return (
    <div style={{
      background: 'linear-gradient(145deg, var(--ui-surface, #0d1a2e), var(--ui-page, #0a1525))',
      border: '1px solid var(--ui-panel-border)',
      borderRadius: '20px',
      padding: '64px 32px',
      textAlign: 'center',
      maxWidth: '600px',
      margin: '60px auto',
    }}>
      <div style={{ fontSize: '52px', marginBottom: '18px' }}>{icon}</div>
      <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--ui-text, #fff)', marginBottom: '10px' }}>{title}</h2>
      <p style={{ color: 'var(--ui-muted, #64748b)', fontSize: '14px', lineHeight: 1.7, marginBottom: '24px', maxWidth: '420px', margin: '0 auto 24px' }}>{description}</p>
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
