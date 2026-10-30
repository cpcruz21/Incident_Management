'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { AgingReportData } from '@/types/aging';
import type { MonthlyReportData } from '@/types/monthly';
import type { Incident } from '@/types/incident';
import { AgingReportTable } from '@/components/aging/AgingReportTable';
import { MonthlyReportTable } from '@/components/monthly/MonthlyReportTable';
import { DetailModal } from '@/components/report/DetailModal';
import {
  fetchServerAgingReports,
  fetchServerMonthlyReports,
} from '@/lib/api/client';
import { getStoredReports } from '@/lib/storage/report-storage';
import { exportAsPng } from '@/lib/report/export';
import { IRAnalyticsDashboard } from '@/components/ir-analytics/IRAnalyticsDashboard';

type ReportTabType = 'aging' | 'monthly' | 'ir-analytics';

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

export default function PublicDashboardPage() {
  const [activeTab, setActiveTab] = useState<ReportTabType>('ir-analytics');

  const [agingReports, setAgingReports] = useState<PublishedAgingReport[]>([]);
  const [monthlyReports, setMonthlyReports] = useState<PublishedMonthlyReport[]>([]);

  const [selectedAgingId, setSelectedAgingId] = useState<string>('');
  const [selectedMonthlyId, setSelectedMonthlyId] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    title: string;
    incidentIds: string[];
  }>({ isOpen: false, title: '', incidentIds: [] });

  const adminLoggedIn = false;

  const loadReports = useCallback(async (isInitial = false) => {
    if (isInitial) setIsLoading(true);

    const agingList: PublishedAgingReport[] = [];
    const monthlyList: PublishedMonthlyReport[] = [];

    try {
      const serverAging = await fetchServerAgingReports();
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
      const serverMonthly = await fetchServerMonthlyReports();
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
      const localReports = getStoredReports();
      for (const r of localReports) {
        if (r.type === 'aging' && r.reportData) {
          const alreadyAdded = agingList.some((x) => x.id === r.id);
          if (!alreadyAdded) {
            agingList.push({
              id: r.id,
              title: r.title,
              period: r.period,
              reportData: r.reportData as AgingReportData,
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
    } catch {}

    setAgingReports(agingList);
    setMonthlyReports(monthlyList);
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
    } catch {}

    const handleStorage = (e: StorageEvent) => {
      if (e.key?.includes('smac_report') || e.key?.includes('aging_report') || e.key?.includes('monthly_report')) {
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

  const handleCellClick = (title: string, ids: string[]) => {
    setModalState({ isOpen: true, title, incidentIds: ids });
  };

  const handleExportPng = async () => {
    try {
      if (activeTab === 'aging') {
        await exportAsPng(
          'aging-report-canvas',
          `Public_Aging_Dashboard_${activeAgingReport?.period?.replace(/\s+/g, '_') || 'Report'}.png`
        );
      } else if (activeTab === 'monthly') {
        await exportAsPng(
          'monthly-report-canvas',
          `Public_Monthly_Dashboard_${activeMonthlyReport?.period?.replace(/\s+/g, '_') || 'Report'}.png`
        );
      } else {
        await exportAsPng(
          'ir-analytics-container',
          `Public_IR_Analytics_Dashboard_${new Date().toISOString().slice(0, 10)}.png`
        );
      }
    } catch {
      alert('Failed to export dashboard image.');
    }
  };

  // ─── Nav Tab descriptor ────────────────────────────────────────────────────
  const tabs: { key: ReportTabType; icon: string; label: string; count?: number }[] = [
    { key: 'ir-analytics', icon: '📈', label: 'Dashboard' },
    { key: 'aging', icon: '⏳', label: 'Aging Tickets', count: agingReports.length || undefined },
    { key: 'monthly', icon: '📊', label: 'Monthly SLA', count: monthlyReports.length || undefined },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: '#060f1e',
      color: '#f8fafc',
      fontFamily: "var(--font-sans), 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    }}>

      {/* ═══════════════════ TOPBAR ═══════════════════ */}
      <header style={{
        background: 'linear-gradient(180deg, #0c1a30 0%, #091426 100%)',
        borderBottom: '1px solid rgba(37,99,235,0.22)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: '0 4px 24px rgba(0,0,0,0.45)',
      }}>
        {/* Thin accent bar at top */}
        <div style={{ height: '3px', background: 'linear-gradient(90deg, #2563eb 0%, #7c3aed 50%, #06b6d4 100%)' }} />

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 28px',
          height: '66px',
          gap: '16px',
          flexWrap: 'wrap',
        }}>
          {/* ── Brand ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              overflow: 'hidden',
              background: '#101f36',
              border: '1px solid #1e3a5f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
            }}>
              <img
                src="/images/EQUI.png"
                alt="Equicom"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.12em', color: '#38bdf8', textTransform: 'uppercase' }}>
                Incident Management
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#f8fafc', lineHeight: 1.2, letterSpacing: '-0.01em' }}>
                SMAC Reporting
              </div>
            </div>
          </div>

          {/* ── Navigation Tabs ── */}
          <nav style={{
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
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
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: isActive ? '#2563eb' : 'transparent',
                    color: isActive ? '#ffffff' : '#94a3b8',
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
                      background: isActive ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)',
                      color: isActive ? '#ffffff' : '#94a3b8',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, flexWrap: 'wrap' }}>
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
              color: '#34d399',
              fontWeight: 700,
              cursor: 'default',
            }}
              title={lastSyncTime ? `Last sync: ${lastSyncTime.toLocaleTimeString()}` : 'Auto-sync active'}
            >
              <span style={{
                width: '7px', height: '7px', borderRadius: '50%', background: '#10b981',
                boxShadow: '0 0 0 3px rgba(16,185,129,0.35)',
                animation: 'pulse 2s infinite',
                display: 'inline-block',
              }} />
              Live Dashboard
            </div>

            {/* Period selector */}
            {activeTab === 'aging' && agingReports.length > 0 && (
              <select
                value={selectedAgingId}
                onChange={(e) => setSelectedAgingId(e.target.value)}
                style={{
                  background: '#111c30',
                  color: '#f8fafc',
                  border: '1px solid #1e3a5f',
                  borderRadius: '8px',
                  padding: '7px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  outline: 'none',
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
                value={selectedMonthlyId}
                onChange={(e) => setSelectedMonthlyId(e.target.value)}
                style={{
                  background: '#111c30',
                  color: '#f8fafc',
                  border: '1px solid #1e3a5f',
                  borderRadius: '8px',
                  padding: '7px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  outline: 'none',
                  maxWidth: '200px',
                }}
              >
                {monthlyReports.map((r, i) => (
                  <option key={r.id} value={r.id}>{r.period || r.title}{i === 0 ? ' (Latest)' : ''}</option>
                ))}
              </select>
            )}

            {/* Export */}
            <button
              type="button"
              onClick={handleExportPng}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(37,99,235,0.18)',
                border: '1px solid rgba(37,99,235,0.4)',
                color: '#93c5fd',
                borderRadius: '8px',
                padding: '7px 14px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              📥 Export PNG
            </button>
          </div>
        </div>
      </header>

      {/* ═══════════════════ MAIN CONTENT ═══════════════════ */}
      <main style={{ padding: '28px 32px 60px', maxWidth: '1600px', margin: '0 auto' }}>

        {/* ── IR Analytics Dashboard Tab ── */}
        {activeTab === 'ir-analytics' && (
          <IRAnalyticsDashboard
            agingReports={agingReports}
            monthlyReports={monthlyReports}
          />
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
      <footer style={{
        marginTop: '60px',
        borderTop: '1px solid rgba(37,99,235,0.18)',
        background: 'linear-gradient(180deg, #091426 0%, #050b16 100%)',
        padding: '24px 20px',
        textAlign: 'center',
      }}>
        <p style={{
          margin: 0,
          fontSize: '12px',
          color: '#94a3b8',
          letterSpacing: '0.02em',
          fontWeight: 500,
        }}>
          &copy; 2026 Equitable Computer Services Inc. All rights reserved.
        </p>
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
        ::-webkit-scrollbar-track { background: #091426; }
        ::-webkit-scrollbar-thumb { background: #243650; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #2563eb; }
        select option { background: #111c30; color: #f8fafc; }
      `}</style>
    </div>
  );
}

// ── Shared Helper Components ──────────────────────────────────────────────────

function LoadingState({ label }: { label: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '80px 20px', color: '#94a3b8' }}>
      <div style={{ fontSize: '36px', marginBottom: '16px', animation: 'spin 1.2s linear infinite', display: 'inline-block' }}>⏳</div>
      <p style={{ fontSize: '15px', fontWeight: 600, color: '#64748b' }}>{label}</p>
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
      background: 'linear-gradient(145deg, #0d1a2e, #0a1525)',
      border: '1px solid #1e3a5f',
      borderRadius: '20px',
      padding: '64px 32px',
      textAlign: 'center',
      maxWidth: '600px',
      margin: '60px auto',
    }}>
      <div style={{ fontSize: '52px', marginBottom: '18px' }}>{icon}</div>
      <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#fff', marginBottom: '10px' }}>{title}</h2>
      <p style={{ color: '#64748b', fontSize: '14px', lineHeight: 1.7, marginBottom: '24px', maxWidth: '420px', margin: '0 auto 24px' }}>{description}</p>
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
