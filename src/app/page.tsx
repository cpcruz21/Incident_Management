'use client';

import React, { useReducer, useCallback, useState, useEffect } from 'react';
import { AdminLogin } from '@/components/ui/AdminLogin';
import { Dashboard } from '@/components/ui/Dashboard';
import type { DashboardView } from '@/components/ui/Dashboard';
import type { Account } from '@/lib/auth';

import { appReducer, initialState } from '@/lib/store';
import type { AppStep } from '@/lib/store';
import { incidentReportSteps, Stepper } from '@/components/ui/Stepper';
import { ReportWorkflowHeader } from '@/components/report/ReportWorkflowHeader';
import { FileUpload } from '@/components/upload/FileUpload';
import { ValidationSummaryView } from '@/components/validation/ValidationSummary';
import { RoutingPreview } from '@/components/routing/RoutingPreview';
import { PreviousWeekInput } from '@/components/report/PreviousWeekInput';
import { SLAReportTable } from '@/components/report/SLAReportTable';
import { ExportDropdown } from '@/components/report/ExportDropdown';
import { DetailModal } from '@/components/report/DetailModal';
import { AgingReportWorkflow } from '@/components/aging/AgingReportWorkflow';
import { MonthlyReportWorkflow } from '@/components/monthly/MonthlyReportWorkflow';

import { parseFile } from '@/lib/excel/parser';
import { autoDetectMapping, mapAllRows } from '@/lib/excel/mapper';
import { applyRouting } from '@/lib/routing/routing-engine';
import { calculateSLAReport, calculateWeeklyCompletion } from '@/lib/sla/calculator';
import { exportAsPng } from '@/lib/report/export';
import { REPORT_TEAMS } from '@/lib/routing/routing-engine';

import type { ColumnMapping, Incident } from '@/types/incident';
import type { WeeklyReportData } from '@/types/sla';
import type { AgingReportData } from '@/types/aging';
import type { StoredReport } from '@/lib/storage/report-storage';

export default function HomePage() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [currentAccount, setCurrentAccount] = useState<Account | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try { localStorage.removeItem('smac_active_session'); } catch { }
    fetch('/api/auth/session', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => setCurrentAccount(result?.account || null))
      .catch(() => setCurrentAccount(null))
      .finally(() => setMounted(true));
  }, []);

  const handleLogin = useCallback((account: Account) => {
    setCurrentAccount(account);
  }, []);

  const [activeView, setActiveView] = useState<DashboardView>('dashboard');
  const [weeklyArchiveId, setWeeklyArchiveId] = useState<string>();
  const [agingStoredReport, setAgingStoredReport] = useState<{
    data: AgingReportData;
    incidents?: Incident[];
  } | null>(null);
  const [monthlyStoredReport, setMonthlyStoredReport] = useState<{
    data: import('@/types/monthly').MonthlyReportData;
    incidents?: Incident[];
    period?: string;
  } | null>(null);

  const handleOpenStoredReport = useCallback((storedReport: StoredReport) => {
    if (storedReport.type === 'weekly') {
      setWeeklyArchiveId(storedReport.id);
      dispatch({
        type: 'LOAD_STORED_REPORT',
        reportData: storedReport.reportData as WeeklyReportData,
        routedIncidents: storedReport.routedIncidents || [],
      });
      setActiveView('weekly');
    } else if (storedReport.type === 'aging') {
      setAgingStoredReport({
        data: storedReport.reportData as AgingReportData,
        incidents: storedReport.routedIncidents,
      });
      setActiveView('aging');
    } else if (storedReport.type === 'monthly') {
      setMonthlyStoredReport({
        data: storedReport.reportData as import('@/types/monthly').MonthlyReportData,
        incidents: storedReport.routedIncidents,
        period: storedReport.period,
      });
      setActiveView('monthly');
    }
  }, []);

  //FILE UPLOAD
  const handleFileSelected = useCallback(async (file: File) => {
    dispatch({ type: 'SET_PROCESSING', isProcessing: true });
    dispatch({ type: 'SET_ERROR', error: null });

    try {
      const result = await parseFile(file);

      if (!result.success) {
        dispatch({ type: 'SET_ERROR', error: result.errors.join('. ') });
        return;
      }

      // Auto-detect column mapping
      const detectedMapping = autoDetectMapping(result.columns);
      const fullMapping: ColumnMapping = {
        ...state.columnMapping,
        ...detectedMapping,
      };
      // Map and validate
      const { incidents, validationSummary } = mapAllRows(result.data, fullMapping);
      setWeeklyArchiveId(undefined);
      dispatch({
        type: 'SET_FILE',
        fileName: file.name,
        rawData: result.data as Record<string, unknown>[],
        columns: result.columns,
      });
      dispatch({ type: 'SET_COLUMN_MAPPING', mapping: fullMapping });
      dispatch({ type: 'SET_VALIDATION', incidents, summary: validationSummary });

      // Auto-advance to validation
      dispatch({ type: 'SET_STEP', step: 'validation' });
    } catch (error) {
      dispatch({
        type: 'SET_ERROR',
        error: `Failed to process file: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      dispatch({ type: 'SET_PROCESSING', isProcessing: false });
    }
  }, [state.columnMapping]);

  //ROUTING
  const handleProceedToRouting = useCallback(() => {
    const { routedIncidents, summary } = applyRouting(state.incidents, state.routingConfig);
    dispatch({ type: 'SET_ROUTING_RESULT', incidents: routedIncidents, summary });
    dispatch({ type: 'SET_STEP', step: 'routing' });
  }, [state.incidents, state.routingConfig]);

  // PREVIOUS WEEK
  const handleProceedToPreviousWeek = useCallback(() => {
    dispatch({ type: 'SET_STEP', step: 'previous-week' });
  }, []);

  //REPORT GENERATION 
  const handleGenerateReport = useCallback(() => {
    const currentWeekReport = state.reportData?.currentWeek ?? calculateSLAReport(state.routedIncidents, REPORT_TEAMS);
    const weeklyCompletion = state.reportData?.weeklyCompletion ?? calculateWeeklyCompletion(state.routedIncidents);
    setWeeklyArchiveId((id) => id || `report-weekly-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    const reportData: WeeklyReportData = {
      reportTitle: 'Closed Incident Weekly Report',
      reportPeriod: state.reportPeriod || `Week of ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
      generatedAt: new Date(),
      currentWeek: currentWeekReport,
      previousWeek: state.previousWeekSLA,
      weeklyCompletion,
      teamOrder: currentWeekReport.firstResponse.map(row => row.teamName),
    };

    dispatch({ type: 'SET_REPORT_DATA', data: reportData });
    dispatch({ type: 'SET_STEP', step: 'report' });
  }, [state.routedIncidents, state.previousWeekSLA, state.reportPeriod, state.reportData]);

  //NAVIGATION
  const handleStepClick = useCallback((step: AppStep) => {
    dispatch({ type: 'SET_STEP', step });
  }, []);

  // EXPORT
  const handleExportPng = useCallback(async () => {
    try {
      await exportAsPng('sla-report-canvas', `SLA_Report_${new Date().toISOString().split('T')[0]}.png`);
    } catch {
      dispatch({ type: 'SET_ERROR', error: 'Failed to export report as PNG' });
    }
  }, []);

  // DETAIL MODAL 
  const handleCellClick = useCallback((title: string, incidentIds: string[]) => {
    dispatch({ type: 'OPEN_DETAIL_MODAL', title, incidentIds });
  }, []);


  const [agingKey, setAgingKey] = useState(0);
  const [logoutError, setLogoutError] = useState('');

  const handleLogout = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/session', { method: 'DELETE' });
      if (!response.ok) throw new Error('Sign-out failed');
      setCurrentAccount(null);
      setActiveView('dashboard');
      dispatch({ type: 'RESET' });
      setAgingStoredReport(null);
      setMonthlyStoredReport(null);
      setLogoutError('');
    } catch {
      setLogoutError('Could not sign out. Try again.');
    }
  }, []);

  const handleSelectReport = useCallback((view: DashboardView) => {
    if (view === 'weekly') {
      dispatch({ type: 'RESET' });
      setWeeklyArchiveId(undefined);
      setActiveView('weekly');
    } else if (view === 'aging') {
      setAgingStoredReport(null);
      setAgingKey((key) => key + 1);
      setActiveView('aging');
    } else {
      if (view === 'monthly') setMonthlyStoredReport(null);
      setActiveView(view);
    }
  }, []);

  if (!mounted) return <main className="admin-login" role="status">Checking session...</main>;
  if (!currentAccount) return <AdminLogin onLogin={handleLogin} />;

  function workspace(content?: React.ReactNode) {
    return currentAccount && (
      <Dashboard
        account={currentAccount}
        activeView={activeView}
        onSelectReport={handleSelectReport}
        onOpenStoredReport={handleOpenStoredReport}
        onLogout={handleLogout}
        logoutError={logoutError}
      >
        {content}
      </Dashboard>
    );
  }

  // 3) Monthly Report Module
  if (activeView === 'monthly') {
    return workspace(
      <MonthlyReportWorkflow
        account={currentAccount}
        initialStoredReport={monthlyStoredReport}
        onBack={() => {
          setActiveView('dashboard');
          dispatch({ type: 'RESET' });
          setMonthlyStoredReport(null);
        }}
      />
    );
  }

  // 4) Aging Trends Module
  if (activeView === 'aging') {
    return workspace(
      <AgingReportWorkflow
        key={agingStoredReport ? `stored-${agingStoredReport.data.reportId || agingStoredReport.data.generatedAt}` : `new-${agingKey}`}
        account={currentAccount}
        onBack={() => {
          setAgingStoredReport(null);
          setActiveView('dashboard');
          dispatch({ type: 'RESET' });
        }}
        initialReportData={agingStoredReport?.data}
        initialRoutedIncidents={agingStoredReport?.incidents}
      />
    );
  }

  if (activeView !== 'weekly') return workspace();

  // 5) Weekly SLA Report (existing workflow)
  return workspace(
    <main className="app-main">
      <ReportWorkflowHeader
        title="Weekly SLA Report"
        fileName={state.fileName}
        busy={state.isProcessing}
        onBack={() => {
          setActiveView('dashboard');
          dispatch({ type: 'RESET' });
        }}
        onReset={() => {
          dispatch({ type: 'RESET' });
          setWeeklyArchiveId(undefined);
        }}
      />
      <Stepper
        steps={incidentReportSteps}
        currentStep={state.currentStep}
        onStepClick={handleStepClick}
        busy={state.isProcessing}
        availableSteps={[
          'upload',
          ...(state.validationSummary ? ['validation' as const] : []),
          ...(state.routingSummary ? ['routing' as const, 'previous-week' as const] : []),
          ...(state.reportData && !state.routingSummary ? ['previous-week' as const] : []),
        ]}
      />

      {/* Error Banner */}
      {state.error && (
        <div className="error-banner report-workflow-error" role="alert">
          <span>{state.error}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => dispatch({ type: 'SET_ERROR', error: null })}>✕</button>
        </div>
      )}

      {/* Main Content */}
      <div className="app-content">
        {/* STEP 1: Upload */}
        {state.currentStep === 'upload' && (
          <section className="report-setup" aria-labelledby="report-setup-title">
            <h2 id="report-setup-title">Report setup</h2>
            <div className="report-setup-fields">
              <div className="report-setup-field">
                <label htmlFor="report-period">
                  Report period <span>(optional)</span>
                </label>
                <input
                  id="report-period"
                  type="text"
                  placeholder="e.g., September 29 - October 5, 2026"
                  value={state.reportPeriod}
                  onChange={(e) => dispatch({ type: 'SET_REPORT_PERIOD', period: e.target.value })}
                />
              </div>
            </div>
            <FileUpload onFileSelected={handleFileSelected} isProcessing={state.isProcessing} />
          </section>
        )}

        {/* STEP 2: Validation */}
        {state.currentStep === 'validation' && state.validationSummary && (
          <ValidationSummaryView
            summary={state.validationSummary}
            onProceed={handleProceedToRouting}
            onBack={() => dispatch({ type: 'SET_STEP', step: 'upload' })}
          />
        )}

        {/* STEP 3: Routing */}
        {state.currentStep === 'routing' && state.routingSummary && (
          <RoutingPreview
            summary={state.routingSummary}
            onProceed={handleProceedToPreviousWeek}
            onBack={() => dispatch({ type: 'SET_STEP', step: 'validation' })}
          />
        )}

        {/* STEP 4: Previous Week */}
        {state.currentStep === 'previous-week' && (
          <PreviousWeekInput
            initialValues={state.previousWeekSLA}
            autoFill={!state.reportData}
            onSave={(values) => dispatch({ type: 'SET_PREVIOUS_WEEK', previousWeek: values })}
            onBack={() => dispatch({ type: 'SET_STEP', step: state.reportData ? 'report' : 'routing' })}
            onProceed={handleGenerateReport}
          />
        )}

        {/* STEP 5: Report */}
        {state.currentStep === 'report' && state.reportData && (
          <div className="report-step">
            <div className="report-actions-bar">
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    dispatch({ type: 'SET_STEP', step: 'previous-week' });
                  }}
                >
                  Edit previous week
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    dispatch({ type: 'RESET' });
                    setWeeklyArchiveId(undefined);
                  }}
                  title="Create a new report from scratch"
                >
                  + New Report
                </button>
              </div>
              <div className="report-export-buttons">
                <ExportDropdown
                  incidents={state.routedIncidents}
                  reportData={state.reportData}
                  baseFilename="SMAC_Incident_Report"
                  targetElementId="weekly-closed-incident-report-card"
                  onExportPng={handleExportPng}
                />
              </div>
            </div>

            <SLAReportTable
              data={state.reportData}
              onCellClick={handleCellClick}
              routedIncidents={state.routedIncidents}
              archiveId={weeklyArchiveId}
            />
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <DetailModal
        isOpen={state.detailModal.isOpen}
        title={state.detailModal.title}
        incidentIds={state.detailModal.incidentIds}
        onClose={() => dispatch({ type: 'CLOSE_DETAIL_MODAL' })}
      />

    </main>
  );
}
