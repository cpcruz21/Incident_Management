'use client';

import React, { useReducer, useCallback, useState, useEffect } from 'react';
import type { Account } from '@/lib/auth';
import { isAdmin } from '@/lib/auth';
import type { ColumnMapping, Incident } from '@/types/incident';
import type { MonthlyReportData } from '@/types/monthly';

import { parseFile } from '@/lib/excel/parser';
import { autoDetectMapping, mapAllRows } from '@/lib/excel/mapper';
import { calculateMonthlyReport } from '@/lib/monthly/calculator';

import { FileUpload } from '@/components/upload/FileUpload';
import { ValidationSummaryView } from '@/components/validation/ValidationSummary';
import { MonthlyReportTable } from '@/components/monthly/MonthlyReportTable';
import { ExportDropdown } from '@/components/report/ExportDropdown';
import { DetailModal } from '@/components/report/DetailModal';
import { saveReport } from '@/lib/storage/report-storage';
import { persistServerMonthlyReport } from '@/lib/api/client';

import { DEFAULT_COLUMN_MAPPING } from '@/types/incident';

// ─── Local state ────────────────────────────────────────────

type MonthlyStep = 'upload' | 'validation' | 'report';

interface MonthlyState {
  step: MonthlyStep;
  fileName: string | null;
  rawData: Record<string, unknown>[] | null;
  columns: string[];
  columnMapping: ColumnMapping;
  incidents: Incident[];
  validationSummary: import('@/types/incident').ValidationSummary | null;
  reportData: MonthlyReportData | null;
  reportPeriod: string;
  storageDestination: 'both' | 'local' | 'server';
  isProcessing: boolean;
  error: string | null;
  detailModal: { isOpen: boolean; title: string; incidentIds: string[] };
}

type MonthlyAction =
  | { type: 'SET_STEP'; step: MonthlyStep }
  | { type: 'SET_FILE'; fileName: string; rawData: Record<string, unknown>[]; columns: string[] }
  | { type: 'SET_MAPPING'; mapping: ColumnMapping }
  | { type: 'SET_VALIDATION'; incidents: Incident[]; summary: import('@/types/incident').ValidationSummary }
  | { type: 'SET_REPORT'; data: MonthlyReportData }
  | { type: 'SET_PERIOD'; period: string }
  | { type: 'SET_STORAGE_DESTINATION'; destination: 'both' | 'local' | 'server' }
  | { type: 'SET_PROCESSING'; val: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | {
    type: 'UPDATE_INCIDENT_FIELD';
    requestId: string;
    field: 'Revised Root Cause Type' | 'Revised Identified Root Cause';
    value: string;
  }
  | { type: 'OPEN_MODAL'; title: string; ids: string[] }
  | { type: 'CLOSE_MODAL' }
  | { type: 'RESET' };

const init: MonthlyState = {
  step: 'upload',
  fileName: null,
  rawData: null,
  columns: [],
  columnMapping: DEFAULT_COLUMN_MAPPING,
  incidents: [],
  validationSummary: null,
  reportData: null,
  reportPeriod: '',
  storageDestination: 'both',
  isProcessing: false,
  error: null,
  detailModal: { isOpen: false, title: '', incidentIds: [] },
};

function reducer(state: MonthlyState, action: MonthlyAction): MonthlyState {
  switch (action.type) {
    case 'SET_STEP': return { ...state, step: action.step, error: null };
    case 'SET_FILE': return { ...state, fileName: action.fileName, rawData: action.rawData, columns: action.columns, error: null };
    case 'SET_MAPPING': return { ...state, columnMapping: action.mapping };
    case 'SET_VALIDATION': return { ...state, incidents: action.incidents, validationSummary: action.summary };
    case 'SET_REPORT': return { ...state, reportData: action.data };
    case 'SET_PERIOD': return { ...state, reportPeriod: action.period };
    case 'SET_STORAGE_DESTINATION': return { ...state, storageDestination: action.destination };
    case 'SET_PROCESSING': return { ...state, isProcessing: action.val };
    case 'SET_ERROR': return { ...state, error: action.error };
    case 'UPDATE_INCIDENT_FIELD': {
      const updateList = (list: Incident[]) =>
        list.map((inc) => {
          if (inc.requestId === action.requestId) {
            const raw = { ...(inc.rawData || {}), [action.field]: action.value };
            return {
              ...inc,
              rawData: raw,
              revisedRootCauseType:
                action.field === 'Revised Root Cause Type'
                  ? action.value
                  : inc.revisedRootCauseType,
              revisedIdentifiedRootCause:
                action.field === 'Revised Identified Root Cause'
                  ? action.value
                  : inc.revisedIdentifiedRootCause,
            };
          }
          return inc;
        });

      return {
        ...state,
        incidents: updateList(state.incidents),
        reportData: state.reportData
          ? {
            ...state.reportData,
            allTickets: updateList(state.reportData.allTickets),
            closedTickets: updateList(state.reportData.closedTickets),
          }
          : null,
      };
    }
    case 'OPEN_MODAL': return { ...state, detailModal: { isOpen: true, title: action.title, incidentIds: action.ids } };
    case 'CLOSE_MODAL': return { ...state, detailModal: { isOpen: false, title: '', incidentIds: [] } };
    case 'RESET': return { ...init };
    default: return state;
  }
}

// ─── Steps config ───────────────────────────────────────────

const STEPS: { id: MonthlyStep; label: string; icon: string }[] = [
  { id: 'upload', label: 'Upload', icon: '📁' },
  { id: 'validation', label: 'Validation', icon: '✅' },
  { id: 'report', label: 'Report', icon: '📊' },
];

// ─── Component ──────────────────────────────────────────────

interface MonthlyReportWorkflowProps {
  account: Account;
  onBack: () => void;
  initialStoredReport?: {
    data: MonthlyReportData;
    incidents?: Incident[];
    period?: string;
  } | null;
}

export function MonthlyReportWorkflow({
  account,
  onBack,
  initialStoredReport,
}: MonthlyReportWorkflowProps) {
  const [state, dispatch] = useReducer(reducer, init);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Load initial stored report if provided
  useEffect(() => {
    if (initialStoredReport?.data) {
      dispatch({ type: 'SET_REPORT', data: initialStoredReport.data });
      if (initialStoredReport.incidents) {
        dispatch({
          type: 'SET_VALIDATION',
          incidents: initialStoredReport.incidents,
          summary: {
            totalRecords: initialStoredReport.incidents.length,
            validRecords: initialStoredReport.incidents.length,
            invalidRecords: 0,
            errors: [],
            warnings: [],
            detectedColumns: [],
            detectedSourceTeams: [],
            detectedCategories: [],
          },
        });
      }
      if (initialStoredReport.period) {
        dispatch({ type: 'SET_PERIOD', period: initialStoredReport.period });
      }
      dispatch({ type: 'SET_STEP', step: 'report' });
    }
  }, [initialStoredReport]);

  // File upload
  const handleFileSelected = useCallback(async (file: File) => {
    dispatch({ type: 'SET_PROCESSING', val: true });
    dispatch({ type: 'SET_ERROR', error: null });

    try {
      const result = await parseFile(file);
      if (!result.success) {
        dispatch({ type: 'SET_ERROR', error: result.errors.join('. ') });
        dispatch({ type: 'SET_PROCESSING', val: false });
        return;
      }

      dispatch({
        type: 'SET_FILE',
        fileName: file.name,
        rawData: result.data as Record<string, unknown>[],
        columns: result.columns,
      });

      const detected = autoDetectMapping(result.columns);
      const fullMapping: ColumnMapping = { ...state.columnMapping, ...detected };
      dispatch({ type: 'SET_MAPPING', mapping: fullMapping });

      const { incidents, validationSummary } = mapAllRows(result.data, fullMapping);
      dispatch({ type: 'SET_VALIDATION', incidents, summary: validationSummary });
      dispatch({ type: 'SET_STEP', step: 'validation' });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: `Failed to process file: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      dispatch({ type: 'SET_PROCESSING', val: false });
    }
  }, [state.columnMapping]);

  // Generate report directly from raw incidents (no routing engine)
  const handleGenerateReport = useCallback(() => {
    const period = state.reportPeriod || new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const report = calculateMonthlyReport(state.incidents, period);
    dispatch({ type: 'SET_REPORT', data: report });
    dispatch({ type: 'SET_STEP', step: 'report' });
  }, [state.incidents, state.reportPeriod]);

  // Step click navigation
  const handleStepClick = useCallback((step: MonthlyStep) => {
    if (step === 'upload') {
      dispatch({ type: 'SET_STEP', step: 'upload' });
    } else if (step === 'validation' && state.validationSummary) {
      dispatch({ type: 'SET_STEP', step: 'validation' });
    } else if (step === 'report' && state.reportData) {
      dispatch({ type: 'SET_STEP', step: 'report' });
    }
  }, [state.validationSummary, state.reportData]);

  // Cell click (drill-down)
  const handleCellClick = useCallback((title: string, ids: string[]) => {
    dispatch({ type: 'OPEN_MODAL', title, ids });
  }, []);

  // Update incident revision field (admin manual adjustment)
  const handleUpdateIncident = useCallback(
    (
      requestId: string,
      field: 'Revised Root Cause Type' | 'Revised Identified Root Cause',
      value: string
    ) => {
      dispatch({
        type: 'UPDATE_INCIDENT_FIELD',
        requestId,
        field,
        value,
      });
    },
    []
  );

  // Save and Publish to Live Dashboard
  const handleSaveAndPublish = useCallback(async () => {
    if (!state.reportData) return;
    setSaveStatus('saving');
    try {
      const period = state.reportPeriod || state.reportData.reportPeriod || 'Monthly Period';
      const title = state.reportData.reportTitle || `Monthly Overall Ticket Report - ${period}`;
      const id = `monthly-${period.toLowerCase().replace(/[^a-z0-9]/g, '-') || Date.now()}`;

      // 1. Save to local storage (if 'both' or 'local')
      if (state.storageDestination !== 'server') {
        saveReport({
          id,
          type: 'monthly',
          title,
          period,
          author: account.name,
          reportData: state.reportData,
          routedIncidents: state.incidents,
        });
      }

      // 2. Persist to server backend (if 'both' or 'server')
      if (state.storageDestination !== 'local') {
        await persistServerMonthlyReport({
          id,
          title,
          period,
          savedBy: account.name,
          savedAt: new Date().toISOString(),
          reportData: state.reportData,
          routedIncidents: state.incidents,
        });
      }

      // 3. Notify real-time broadcast channel
      try {
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          const bc = new BroadcastChannel('smac_reports_sync');
          bc.postMessage({ type: 'report_saved', reportType: 'monthly', id });
          bc.close();
        }
      } catch { }

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3500);
    } catch (err) {
      console.error('Error saving monthly report:', err);
      dispatch({ type: 'SET_ERROR', error: 'Failed to publish monthly report to server.' });
      setSaveStatus('idle');
    }
  }, [state.reportData, state.reportPeriod, state.storageDestination, state.incidents, account.name]);

  const stepIndex = STEPS.findIndex((s) => s.id === state.step);

  return (
    <main className="app-main">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <div className="header-brand">
            <button
              className="btn btn-ghost btn-sm"
              onClick={onBack}
              style={{ marginRight: '0.5rem' }}
              title="Back to dashboard"
            >
              ←
            </button>
            <span className="brand-icon">📊</span>
            <div>
              <h1 className="brand-title">Monthly Overall Ticket Report</h1>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {state.fileName && (
              <div className="header-file-info">
                <span className="file-badge">📄 {state.fileName}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: 'RESET' })}>Reset</button>
              </div>
            )}
            <button className="header-user-badge" title="Logged in user">
              👤 {account.name}
              {isAdmin(account) && <span className="badge-role">Admin</span>}
            </button>
          </div>
        </div>
      </header>

      {/* Stepper (Unified design: Upload -> Validation -> Report) */}
      <div className="stepper-container">
        <div className="stepper">
          {STEPS.map((s, index) => {
            const isActive = s.id === state.step;
            const isCompleted = index < stepIndex;
            const isClickable = isCompleted || index <= stepIndex;

            return (
              <React.Fragment key={s.id}>
                {index > 0 && (
                  <div className={`stepper-connector ${isCompleted ? 'completed' : ''}`} />
                )}
                <button
                  className={`stepper-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isClickable ? 'clickable' : ''}`}
                  onClick={() => isClickable && handleStepClick(s.id)}
                  disabled={!isClickable}
                  type="button"
                >
                  <span className="stepper-icon">
                    {isCompleted && !isActive ? '✓' : s.icon}
                  </span>
                  <span className="stepper-label">{s.label}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Error */}
      {state.error && (
        <div className="error-banner">
          <span>⚠️ {state.error}</span>
          <button onClick={() => dispatch({ type: 'SET_ERROR', error: null })}>✕</button>
        </div>
      )}

      {/* Content */}
      <div className="app-content">
        {/* STEP 1: Upload */}
        {state.step === 'upload' && (
          <div className="step-content">
            <div className="step-intro">
              <h2>Upload Monthly Incident Data</h2>
            </div>
            <FileUpload
              onFileSelected={handleFileSelected}
              isProcessing={state.isProcessing}
            />
            <div className="period-input-section">
              <label htmlFor="monthly-period" className="period-label">
                Storage Month
              </label>
              <select
                id="monthly-period"
                className="period-input"
                value={state.reportPeriod}
                onChange={(e) => dispatch({ type: 'SET_PERIOD', period: e.target.value })}
              >
                <option value="">-- Select Month --</option>
                {(() => {
                  const opts: React.ReactNode[] = [];
                  const now = new Date();
                  for (let i = 0; i < 24; i++) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                    opts.push(<option key={label} value={label}>{label}</option>);
                  }
                  return opts;
                })()}
              </select>
            </div>
            <div className="period-input-section">
              <label htmlFor="storage-destination" className="period-label">
                Save Report To
              </label>
              <select
                id="storage-destination"
                className="period-input"
                value={state.storageDestination}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_STORAGE_DESTINATION',
                    destination: e.target.value as 'both' | 'local' | 'server',
                  })
                }
              >
                <option value="both">Server &amp; Local Storage</option>
                <option value="server">Server Only - Publish to Dashboard</option>
                <option value="local">Local Storage Only - Draft</option>
              </select>
            </div>
          </div>
        )}

        {/* STEP 2: Validation */}
        {state.step === 'validation' && state.validationSummary && (
          <ValidationSummaryView
            summary={state.validationSummary}
            isMonthly={true}
            onProceed={handleGenerateReport}
            onBack={() => dispatch({ type: 'SET_STEP', step: 'upload' })}
            reportPeriod={state.reportPeriod}
            onPeriodChange={(period) => dispatch({ type: 'SET_PERIOD', period })}
          />
        )}

        {/* STEP 3: Report */}
        {state.step === 'report' && state.reportData && (
          <div className="report-step">
            <div className="report-actions-bar">
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    if (!state.rawData) {
                      onBack();
                    } else {
                      dispatch({ type: 'SET_STEP', step: 'validation' });
                    }
                  }}
                >
                  {state.rawData ? '← Back' : '← Back to Dashboard'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => dispatch({ type: 'RESET' })}
                  title="Create a new report from scratch"
                >
                  + New Report
                </button>
              </div>
              <div>
                <ExportDropdown
                  incidents={state.incidents}
                  reportData={state.reportData as any}
                  baseFilename="SMAC_Monthly_Incident_Report"
                  targetElementId="monthly-report-canvas"
                />
              </div>
            </div>

            <MonthlyReportTable
              data={state.reportData}
              onCellClick={handleCellClick}
              routedIncidents={state.incidents}
              isAdmin={isAdmin(account)}
              onUpdateIncident={handleUpdateIncident}
              onArchiveReport={handleSaveAndPublish}
              onSaveReport={handleSaveAndPublish}
              isArchived={saveStatus === 'saved'}
            />
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <DetailModal
        isOpen={state.detailModal.isOpen}
        title={state.detailModal.title}
        incidentIds={state.detailModal.incidentIds}
        onClose={() => dispatch({ type: 'CLOSE_MODAL' })}
      />
    </main>
  );
}
