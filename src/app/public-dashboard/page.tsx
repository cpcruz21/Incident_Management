'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { AgingReportData } from '@/types/aging';
import type { MonthlyReportData } from '@/types/monthly';
import type { Incident } from '@/types/incident';
import type { Account } from '@/lib/auth';
import { isAdmin, findAccountByPin } from '@/lib/auth';
import { AgingReportTable } from '@/components/aging/AgingReportTable';
import { MonthlyReportTable } from '@/components/monthly/MonthlyReportTable';
import { DetailModal } from '@/components/report/DetailModal';
import {
  fetchServerAgingReports,
  fetchServerMonthlyReports,
  persistServerMonthlyReport,
} from '@/lib/api/client';
import { getStoredReports, saveReport } from '@/lib/storage/report-storage';
import { exportAsPng } from '@/lib/report/export';

type ReportTabType = 'aging' | 'monthly';

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
  const [activeTab, setActiveTab] = useState<ReportTabType>('aging');

  // Published reports collections
  const [agingReports, setAgingReports] = useState<PublishedAgingReport[]>([]);
  const [monthlyReports, setMonthlyReports] = useState<PublishedMonthlyReport[]>([]);

  // Selected report IDs
  const [selectedAgingId, setSelectedAgingId] = useState<string>('');
  const [selectedMonthlyId, setSelectedMonthlyId] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Authentication & Admin status
  const [currentAccount, setCurrentAccount] = useState<Account | null>(null);
  const [showPinModal, setShowPinModal] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Drilldown modal state
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    title: string;
    incidentIds: string[];
  }>({
    isOpen: false,
    title: '',
    incidentIds: [],
  });

  // Check stored active session on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('smac_active_session');
      if (stored) {
        setCurrentAccount(JSON.parse(stored));
      }
    } catch {}
  }, []);

  const adminLoggedIn = useMemo(() => isAdmin(currentAccount), [currentAccount]);

  // Load all reports (Aging & Monthly) from server and local storage
  const loadReports = useCallback(async (isInitial = false) => {
    if (isInitial) setIsLoading(true);

    const agingList: PublishedAgingReport[] = [];
    const monthlyList: PublishedMonthlyReport[] = [];

    // 1. Fetch Aging Reports from server backend
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

    // 2. Fetch Monthly Reports from server backend
    try {
      const serverMonthly = await fetchServerMonthlyReports();
      if (Array.isArray(serverMonthly)) {
        for (const item of serverMonthly) {
          if (item.reportData && typeof item.reportData === 'object') {
            monthlyList.push({
              id: String(item.id || `server-monthly-${Date.now()}`),
              title: String(item.title || (item.reportData as any).reportTitle || 'Monthly Report'),
              period: String(item.period || (item.reportData as any).reportPeriod || 'Monthly Period'),
              reportData: item.reportData as MonthlyReportData,
              routedIncidents: (item.routedIncidents as Incident[]) || [],
              savedAt: String(item.savedAt || (item as any).serverSavedAt || ''),
              savedBy: String(item.savedBy || 'System'),
            });
          }
        }
      }
    } catch (err) {
      console.warn('Could not load server monthly reports:', err);
    }

    // 3. Fetch from browser localStorage as fallback / local additions
    try {
      const localReports = getStoredReports();
      for (const item of localReports) {
        if (item.type === 'aging' && item.reportData) {
          if (!agingList.some((r) => r.id === item.id)) {
            agingList.push({
              id: item.id,
              title: item.title,
              period: item.period,
              reportData: item.reportData as AgingReportData,
              routedIncidents: item.routedIncidents,
              savedAt: item.savedAt,
              savedBy: item.author || 'Admin',
            });
          }
        } else if (item.type === 'monthly' && item.reportData) {
          if (!monthlyList.some((r) => r.id === item.id)) {
            monthlyList.push({
              id: item.id,
              title: item.title,
              period: item.period,
              reportData: item.reportData as MonthlyReportData,
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

    // Update Aging list
    setAgingReports((prev) => {
      const prevKey = prev.map((r) => `${r.id}-${r.savedAt}`).join('|');
      const nextKey = agingList.map((r) => `${r.id}-${r.savedAt}`).join('|');
      return prevKey === nextKey ? prev : agingList;
    });

    // Update Monthly list
    setMonthlyReports((prev) => {
      const prevKey = prev.map((r) => `${r.id}-${r.savedAt}`).join('|');
      const nextKey = monthlyList.map((r) => `${r.id}-${r.savedAt}`).join('|');
      return prevKey === nextKey ? prev : monthlyList;
    });

    setLastSyncTime(new Date());

    // Auto-select latest or maintain selection
    setSelectedAgingId((prev) => {
      if (prev && agingList.some((r) => r.id === prev)) return prev;
      return agingList[0]?.id || '';
    });

    setSelectedMonthlyId((prev) => {
      if (prev && monthlyList.some((r) => r.id === prev)) return prev;
      return monthlyList[0]?.id || '';
    });

    if (isInitial) setIsLoading(false);
  }, []);

  // Real-time synchronization
  useEffect(() => {
    loadReports(true);

    const pollInterval = setInterval(() => {
      loadReports(false);
    }, 10000);

    const handleFocus = () => {
      loadReports(false);
    };
    window.addEventListener('focus', handleFocus);

    let bc: BroadcastChannel | null = null;
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        bc = new BroadcastChannel('smac_reports_sync');
        bc.onmessage = () => {
          loadReports(false);
        };
      }
    } catch {}

    const handleStorage = (e: StorageEvent) => {
      if (
        e.key === 'smac_report_last_saved' ||
        e.key === 'smac_incident_stored_reports' ||
        e.key === 'smac_active_session'
      ) {
        loadReports(false);
        try {
          const stored = localStorage.getItem('smac_active_session');
          setCurrentAccount(stored ? JSON.parse(stored) : null);
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
      if (bc) bc.close();
    };
  }, [loadReports]);

  // Active reports
  const activeAgingReport =
    agingReports.find((r) => r.id === selectedAgingId) || agingReports[0] || null;
  const activeMonthlyReport =
    monthlyReports.find((r) => r.id === selectedMonthlyId) || monthlyReports[0] || null;

  const handleCellClick = (title: string, ids: string[]) => {
    setModalState({
      isOpen: true,
      title,
      incidentIds: ids,
    });
  };

  // Handle Admin Manual Modification on Monthly Tickets (Revised Root Cause Dropdowns)
  const handleUpdateMonthlyIncident = useCallback(
    async (
      requestId: string,
      field: 'Revised Root Cause Type' | 'Revised Identified Root Cause',
      value: string
    ) => {
      if (!adminLoggedIn || !activeMonthlyReport) return;

      const updateIncidentList = (list: Incident[]) =>
        list.map((inc) => {
          if (inc.requestId === requestId) {
            const raw = { ...(inc.rawData || {}), [field]: value };
            return {
              ...inc,
              rawData: raw,
              revisedRootCauseType:
                field === 'Revised Root Cause Type' ? value : inc.revisedRootCauseType,
              revisedIdentifiedRootCause:
                field === 'Revised Identified Root Cause'
                  ? value
                  : inc.revisedIdentifiedRootCause,
            };
          }
          return inc;
        });

      const updatedAllTickets = updateIncidentList(activeMonthlyReport.reportData.allTickets || []);
      const updatedClosedTickets = updateIncidentList(
        activeMonthlyReport.reportData.closedTickets || []
      );
      const updatedRouted = updateIncidentList(activeMonthlyReport.routedIncidents || []);

      const updatedReportData: MonthlyReportData = {
        ...activeMonthlyReport.reportData,
        allTickets: updatedAllTickets,
        closedTickets: updatedClosedTickets,
      };

      const updatedItem: PublishedMonthlyReport = {
        ...activeMonthlyReport,
        reportData: updatedReportData,
        routedIncidents: updatedRouted,
        savedAt: new Date().toISOString(),
      };

      // 1. Update state
      setMonthlyReports((prev) =>
        prev.map((r) => (r.id === activeMonthlyReport.id ? updatedItem : r))
      );

      // 2. Persist to localStorage
      try {
        saveReport({
          id: activeMonthlyReport.id,
          type: 'monthly',
          title: activeMonthlyReport.title,
          period: activeMonthlyReport.period,
          author: currentAccount?.name || 'Admin',
          reportData: updatedReportData,
          routedIncidents: updatedRouted,
        });
      } catch (e) {
        console.warn('Failed to save to localStorage:', e);
      }

      // 3. Persist to server backend
      try {
        await persistServerMonthlyReport({
          id: activeMonthlyReport.id,
          title: activeMonthlyReport.title,
          period: activeMonthlyReport.period,
          savedBy: currentAccount?.name || 'Admin',
          savedAt: new Date().toISOString(),
          reportData: updatedReportData,
          routedIncidents: updatedRouted,
        });
      } catch (e) {
        console.warn('Failed to persist to server:', e);
      }

      setSaveToast(`Saved adjustment for ticket ${requestId}`);
      setTimeout(() => setSaveToast(null), 3000);
    },
    [adminLoggedIn, activeMonthlyReport, currentAccount]
  );

  // Handle Export PNG
  const handleExportPng = async () => {
    try {
      if (activeTab === 'aging') {
        await exportAsPng(
          'aging-report-canvas',
          `Public_Aging_Dashboard_${activeAgingReport?.period ? activeAgingReport.period.replace(/\s+/g, '_') : 'Report'}.png`
        );
      } else {
        await exportAsPng(
          'monthly-report-canvas',
          `Public_Monthly_Dashboard_${activeMonthlyReport?.period ? activeMonthlyReport.period.replace(/\s+/g, '_') : 'Report'}.png`
        );
      }
    } catch {
      alert('Failed to export dashboard image.');
    }
  };

  // Admin Login via PIN Modal
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const account = findAccountByPin(pinInput);
    if (account && isAdmin(account)) {
      setCurrentAccount(account);
      try {
        localStorage.setItem('smac_active_session', JSON.stringify(account));
      } catch {}
      setShowPinModal(false);
      setPinInput('');
      setPinError(null);
    } else {
      setPinError('Invalid PIN code. Please try again.');
    }
  };

  const handleAdminLogout = () => {
    setCurrentAccount(null);
    try {
      localStorage.removeItem('smac_active_session');
    } catch {}
  };

  return (
    <div
      className="public-dashboard-container"
      style={{ minHeight: '100vh', background: '#091426', color: '#f8fafc' }}
    >
      {/* ───────────────── TOPBAR ───────────────── */}
      <header
        className="public-topbar"
        style={{
          minHeight: '74px',
          background: '#0d1a2e',
          borderBottom: '1px solid #243650',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 2rem',
          position: 'sticky',
          top: 0,
          zIndex: 40,
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div
            style={{
              height: '52px',
              width: '60px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
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
                fontSize: '24px',
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

        {/* Report Type Tabs */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: '#101f36',
            padding: '4px',
            borderRadius: '10px',
            border: '1px solid #243650',
            gap: '4px',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('aging')}
            style={{
              padding: '7px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'aging' ? '#2563eb' : 'transparent',
              color: activeTab === 'aging' ? '#ffffff' : '#94a3b8',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.15s ease',
            }}
          >
            <span>⏳ Aging Tickets Report</span>
            {agingReports.length > 0 && (
              <span
                style={{
                  background: activeTab === 'aging' ? 'rgba(255,255,255,0.25)' : '#1e293b',
                  padding: '1px 6px',
                  borderRadius: '999px',
                  fontSize: '11px',
                }}
              >
                {agingReports.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('monthly')}
            style={{
              padding: '7px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'monthly' ? '#2563eb' : 'transparent',
              color: activeTab === 'monthly' ? '#ffffff' : '#94a3b8',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.15s ease',
            }}
          >
            <span>📊 Monthly SLA Report</span>
            {monthlyReports.length > 0 && (
              <span
                style={{
                  background: activeTab === 'monthly' ? 'rgba(255,255,255,0.25)' : '#1e293b',
                  padding: '1px 6px',
                  borderRadius: '999px',
                  fontSize: '11px',
                }}
              >
                {monthlyReports.length}
              </span>
            )}
          </button>
        </div>

        {/* Controls & User Session */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Live Sync Status */}
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
            title={
              lastSyncTime
                ? `Auto-sync active. Last checked: ${lastSyncTime.toLocaleTimeString()}`
                : 'Live Auto-Sync Active'
            }
          >
            <span className="live-pulse-dot" />
            <span>Live Sync</span>
          </div>

          {/* Period Selector */}
          {activeTab === 'aging' && agingReports.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label
                htmlFor="aging-select"
                style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}
              >
                Period:
              </label>
              <select
                id="aging-select"
                value={selectedAgingId}
                onChange={(e) => setSelectedAgingId(e.target.value)}
                style={{
                  background: '#14253f',
                  color: '#ffffff',
                  border: '1px solid #334e68',
                  borderRadius: '8px',
                  padding: '6px 10px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {agingReports.map((r, index) => (
                  <option key={r.id} value={r.id}>
                    {r.period || r.title} {index === 0 ? '(Latest)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {activeTab === 'monthly' && monthlyReports.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label
                htmlFor="monthly-select"
                style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}
              >
                Period:
              </label>
              <select
                id="monthly-select"
                value={selectedMonthlyId}
                onChange={(e) => setSelectedMonthlyId(e.target.value)}
                style={{
                  background: '#14253f',
                  color: '#ffffff',
                  border: '1px solid #334e68',
                  borderRadius: '8px',
                  padding: '6px 10px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {monthlyReports.map((r, index) => (
                  <option key={r.id} value={r.id}>
                    {r.period || r.title} {index === 0 ? '(Latest)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Refresh */}
          <button
            type="button"
            onClick={() => loadReports(false)}
            title="Refresh dashboard data from server"
            style={{
              background: '#1e293b',
              color: '#e2e8f0',
              border: '1px solid #475569',
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>🔄</span> Refresh
          </button>

          {/* Download PNG */}
          <button
            type="button"
            onClick={handleExportPng}
            style={{
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>📥</span> PNG
          </button>

          {/* Admin Role Status / Login Button */}
          {adminLoggedIn ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  background: '#047857',
                  color: '#ecfdf5',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                }}
                title="Admin mode active: You have permissions to edit data"
              >
                ✏️ ADMIN (EDIT MODE)
              </span>
              <button
                type="button"
                onClick={handleAdminLogout}
                style={{
                  background: 'transparent',
                  border: '1px solid #334155',
                  color: '#94a3b8',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
                title="Switch back to read-only guest view"
              >
                Logout
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setShowPinModal(true);
                setPinError(null);
                setPinInput('');
              }}
              style={{
                background: '#1e293b',
                color: '#38bdf8',
                border: '1px solid #0284c7',
                borderRadius: '8px',
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
              title="Authenticate with PIN to edit data"
            >
              <span>🔒</span> Admin Login
            </button>
          )}
        </div>
      </header>

      {/* Save Toast Notification */}
      {saveToast && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: '#065f46',
            color: '#ecfdf5',
            padding: '10px 18px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>✓</span>
          <span>{saveToast}</span>
        </div>
      )}

      {/* ───────────────── MAIN CONTENT ───────────────── */}
      <main style={{ padding: '24px 32px 48px', maxWidth: '100%', margin: '0 auto' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '6rem 0', color: '#94a3b8' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
            <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>Loading live dashboard reports...</p>
          </div>
        ) : activeTab === 'aging' ? (
          /* TAB 1: AGING TICKETS */
          !activeAgingReport ? (
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
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
              <h2
                style={{
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  color: '#ffffff',
                  marginBottom: '0.5rem',
                }}
              >
                No Published Aging Reports Found
              </h2>
              <p
                style={{
                  color: '#94a3b8',
                  fontSize: '0.95rem',
                  lineHeight: 1.6,
                  marginBottom: '1.5rem',
                }}
              >
                There are currently no published aging incident reports on the server. Generate and
                publish an aging report from the administrator workspace to view it here.
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
              key={activeAgingReport.id}
              data={activeAgingReport.reportData}
              onCellClick={handleCellClick}
              routedIncidents={activeAgingReport.routedIncidents}
              accountName={currentAccount?.name || 'Department Guest'}
              isPublicView={!adminLoggedIn}
            />
          )
        ) : (
          /* TAB 2: MONTHLY REPORT */
          !activeMonthlyReport ? (
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
              <h2
                style={{
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  color: '#ffffff',
                  marginBottom: '0.5rem',
                }}
              >
                No Published Monthly Reports Found
              </h2>
              <p
                style={{
                  color: '#94a3b8',
                  fontSize: '0.95rem',
                  lineHeight: 1.6,
                  marginBottom: '1.5rem',
                }}
              >
                There are currently no published monthly SLA reports on the server. Generate and
                publish a monthly report from the Monthly Incident Report module to view it here.
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
            <div>
              {adminLoggedIn && (
                <div
                  style={{
                    background: '#1e3a8a22',
                    border: '1px solid #3b82f644',
                    borderRadius: '10px',
                    padding: '10px 16px',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                    <span style={{ fontSize: '16px' }}>✏️</span>
                    <span>
                      <strong>Admin Edit Mode Active:</strong> You can edit the manual checker{' '}
                      <strong style={{ color: '#facc15' }}>Revised Root Cause Type</strong> and{' '}
                      <strong style={{ color: '#facc15' }}>Revised Identified Root Cause</strong>{' '}
                      columns directly from the dropdowns below. Changes are saved automatically.
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      background: '#3b82f633',
                      color: '#93c5fd',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontWeight: 600,
                    }}
                  >
                    Auto-Save Active
                  </span>
                </div>
              )}
              <MonthlyReportTable
                key={activeMonthlyReport.id}
                data={activeMonthlyReport.reportData}
                onCellClick={handleCellClick}
                routedIncidents={activeMonthlyReport.routedIncidents}
                isAdmin={adminLoggedIn}
                onUpdateIncident={handleUpdateMonthlyIncident}
              />
            </div>
          )
        )}
      </main>

      {/* ───────────────── DRILLDOWN MODAL ───────────────── */}
      <DetailModal
        isOpen={modalState.isOpen}
        title={modalState.title}
        incidentIds={modalState.incidentIds}
        onClose={() => setModalState((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* ───────────────── PIN LOGIN MODAL ───────────────── */}
      {showPinModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => setShowPinModal(false)}
        >
          <div
            style={{
              background: '#0d1a2e',
              border: '1px solid #243650',
              borderRadius: '16px',
              padding: '28px',
              maxWidth: '380px',
              width: '90%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔐</div>
              <h3 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                Admin Authentication
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
                Enter Administrator PIN to unlock editing on the Live Dashboard.
              </p>
            </div>

            <form onSubmit={handlePinSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <input
                  type="password"
                  autoFocus
                  maxLength={6}
                  placeholder="Enter PIN (e.g. 1234)"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    fontSize: '18px',
                    letterSpacing: '0.25em',
                    textAlign: 'center',
                    background: '#14253f',
                    border: pinError ? '1.5px solid #ef4444' : '1.5px solid #334e68',
                    borderRadius: '8px',
                    color: '#ffffff',
                    outline: 'none',
                  }}
                />
                {pinError && (
                  <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#f87171', textAlign: 'center' }}>
                    {pinError}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowPinModal(false)}
                  style={{
                    flex: 1,
                    padding: '9px',
                    borderRadius: '8px',
                    background: 'transparent',
                    border: '1px solid #334155',
                    color: '#94a3b8',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '9px',
                    borderRadius: '8px',
                    background: '#2563eb',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Unlock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
