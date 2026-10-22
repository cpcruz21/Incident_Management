'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { AgingReportData } from '@/types/aging';
import type { Incident } from '@/types/incident';
import { AgingReportTable } from '@/components/aging/AgingReportTable';
import { DetailModal } from '@/components/report/DetailModal';
import { fetchServerAgingReports } from '@/lib/api/client';
import { getStoredReports } from '@/lib/storage/report-storage';
import { exportAsPng } from '@/lib/report/export';

interface PublishedReportItem {
  id: string;
  title: string;
  period: string;
  reportData: AgingReportData;
  routedIncidents?: Incident[];
  savedAt?: string;
  savedBy?: string;
}

export default function PublicDashboardPage() {
  const [reports, setReports] = useState<PublishedReportItem[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    title: string;
    incidentIds: string[];
  }>({
    isOpen: false,
    title: '',
    incidentIds: [],
  });

  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Load published reports from server and local storage
  const loadReports = useCallback(async (isInitial = false) => {
    if (isInitial) setIsLoading(true);
    const combinedList: PublishedReportItem[] = [];

    // 1. Fetch from server backend API
    try {
      const serverReports = await fetchServerAgingReports();
      if (Array.isArray(serverReports)) {
        for (const item of serverReports) {
          if (item.reportData && typeof item.reportData === 'object') {
            combinedList.push({
              id: String(item.id || `server-${Date.now()}`),
              title: String(item.title || (item.reportData as any).reportTitle || 'Aging Report'),
              period: String(item.period || (item.reportData as any).reportPeriod || 'Current Period'),
              reportData: item.reportData as AgingReportData,
              routedIncidents: (item.routedIncidents as Incident[]) || [],
              savedAt: String(item.savedAt || item.serverSavedAt || ''),
              savedBy: String(item.savedBy || 'System'),
            });
          }
        }
      }
    } catch (err) {
      console.warn('Could not load server aging reports:', err);
    }

    // 2. Fetch from browser localStorage as fallback/supplement
    try {
      const localReports = getStoredReports();
      for (const item of localReports) {
        if (item.type === 'aging' && item.reportData) {
          // Avoid duplicate IDs
          if (!combinedList.some((r) => r.id === item.id)) {
            combinedList.push({
              id: item.id,
              title: item.title,
              period: item.period,
              reportData: item.reportData as AgingReportData,
              routedIncidents: item.routedIncidents,
              savedAt: item.savedAt,
              savedBy: item.author || 'Admin',
            });
          }
        }
      }
    } catch (err) {
      console.warn('Could not load local storage reports:', err);
    }

    setReports((prev) => {
      // Check if reports actually changed before replacing to prevent component thrashing
      const prevIds = prev.map((r) => `${r.id}-${r.savedAt}`).join('|');
      const nextIds = combinedList.map((r) => `${r.id}-${r.savedAt}`).join('|');
      return prevIds === nextIds ? prev : combinedList;
    });
    setLastSyncTime(new Date());

    // Auto-select latest or preserve valid selected report
    setSelectedReportId((prev) => {
      if (prev && combinedList.some((r) => r.id === prev)) {
        return prev;
      }
      return combinedList[0]?.id || '';
    });

    if (isInitial) setIsLoading(false);
  }, []);

  // Set up real-time auto-synchronization: polling, focus, BroadcastChannel, and storage events
  useEffect(() => {
    loadReports(true);

    // 1. Continuous polling interval every 10 seconds (silent background refresh)
    const pollInterval = setInterval(() => {
      loadReports(false);
    }, 10000);

    // 2. Refresh immediately when window/tab is focused
    const handleFocus = () => {
      loadReports(false);
    };
    window.addEventListener('focus', handleFocus);

    // 3. BroadcastChannel for instant 0-second sync across tabs when admin saves
    let bc: BroadcastChannel | null = null;
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        bc = new BroadcastChannel('smac_reports_sync');
        bc.onmessage = () => {
          loadReports(false);
        };
      }
    } catch {
      // BroadcastChannel optional
    }

    // 4. LocalStorage event listener for cross-tab updates
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'smac_report_last_saved' || e.key === 'incident_reports') {
        loadReports(false);
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
      if (bc) {
        bc.close();
      }
    };
  }, [loadReports]);

  // Selected report object
  const activeReport = reports.find((r) => r.id === selectedReportId) || reports[0] || null;

  const handleCellClick = (title: string, ids: string[]) => {
    setModalState({
      isOpen: true,
      title,
      incidentIds: ids,
    });
  };

  const handleExportPng = async () => {
    try {
      await exportAsPng(
        'aging-report-canvas',
        `Public_Aging_Dashboard_${activeReport?.period ? activeReport.period.replace(/\s+/g, '_') : 'Report'}.png`
      );
    } catch {
      alert('Failed to export dashboard image.');
    }
  };

  return (
    <div className="public-dashboard-container" style={{ minHeight: '100vh', background: '#091426', color: '#f8fafc' }}>
      {/* ═══════ TOPBAR ═══════ */}
      <header
        className="public-topbar"
        style={{
          height: '74px',
          background: '#0d1a2e',
          borderBottom: '1px solid #243650',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 2rem',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ height: '56px', width: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img
              src="/images/EQUI.png"
              alt="Equicom Logo"
              style={{ width: '100%', height: '100%', objectFit: 'contain', transform: 'scale(1.15)' }}
            />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <p
                style={{
                  margin: 0,
                  fontSize: '10px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.14em',
                  color: 'rgb(125, 211, 252)',
                }}
              >
                INCIDENT MANAGEMENT
              </p>
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: '28px',
                fontWeight: 800,
                color: '#ffffff',
                lineHeight: 1.15,
                letterSpacing: '-0.01em',
              }}
            >
              SMAC REPORTING
            </h1>
          </div>
        </div>

        {/* Action Controls & Report Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          {/* Real-time status indicator */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '999px',
              fontSize: '11px',
              color: '#34d399',
              fontWeight: 600,
            }}
            title={lastSyncTime ? `Auto-sync active. Last checked: ${lastSyncTime.toLocaleTimeString()}` : 'Live Auto-Sync Active'}
          >
            <span className="live-pulse-dot" />
            <span>Live Sync Active</span>
          </div>

          {reports.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label
                htmlFor="public-report-select"
                style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}
              >
                Published Report:
              </label>
              <select
                id="public-report-select"
                value={selectedReportId}
                onChange={(e) => setSelectedReportId(e.target.value)}
                style={{
                  background: '#14253f',
                  color: '#ffffff',
                  border: '1px solid #334e68',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {reports.map((r, index) => (
                  <option key={r.id} value={r.id}>
                    {r.period || r.title} {index === 0 ? '(Latest)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={() => loadReports(false)}
            title="Refresh dashboard data from server"
            style={{
              background: '#1e293b',
              color: '#e2e8f0',
              border: '1px solid #475569',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>🔄</span> Refresh
          </button>

          <button
            type="button"
            onClick={handleExportPng}
            style={{
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>📷</span> Download PNG
          </button>
        </div>
      </header>

      {/* ═══════ MAIN CONTENT ═══════ */}
      <main style={{ padding: '24px 32px 48px', maxWidth: '100%', margin: '0 auto' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '6rem 0', color: '#94a3b8' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
            <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>Loading department aging dashboard...</p>
          </div>
        ) : !activeReport ? (
          <div
            style={{
              background: '#101f36',
              border: '1px solid #263a57',
              borderRadius: '16px',
              padding: '4rem 2rem',
              textAlign: 'center',
              maxWidth: '680px',
              margin: '4rem auto',
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ffffff', marginBottom: '0.5rem' }}>
              No Published Aging Reports Found
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              There are currently no published aging incident reports stored on the server. Once a report is generated and archived from the administrator workspace, it will immediately be accessible on this public dashboard.
            </p>
            <button
              type="button"
              onClick={() => loadReports(true)}
              style={{
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 18px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🔄 Check Again
            </button>
          </div>
        ) : (
          <AgingReportTable
            key={activeReport.id}
            data={activeReport.reportData}
            onCellClick={handleCellClick}
            routedIncidents={activeReport.routedIncidents}
            accountName="Department Guest"
            isPublicView={true}
          />
        )}
      </main>

      {/* ═══════ DETAIL DRILLDOWN MODAL ═══════ */}
      <DetailModal
        isOpen={modalState.isOpen}
        title={modalState.title}
        incidentIds={modalState.incidentIds}
        onClose={() => setModalState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
