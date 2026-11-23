'use client';

import React, { useReducer, useCallback, useState, useEffect } from 'react';
import { AdminLogin } from '@/components/ui/AdminLogin';
import { AppFooter } from '@/components/ui/AppFooter';
import { Dashboard } from '@/components/ui/Dashboard';
import type { DashboardView } from '@/components/ui/Dashboard';
import type { Account } from '@/lib/auth';
import { isAdmin } from '@/lib/auth';

import { appReducer, initialState } from '@/lib/store';
import type { AppStep } from '@/lib/store';
import { incidentReportSteps, Stepper } from '@/components/ui/Stepper';
import { ReportWorkflowHeader } from '@/components/report/ReportWorkflowHeader';
import { ReportPeriodField, ReportSetup } from '@/components/report/ReportSetup';
import { ValidationSummaryView } from '@/components/validation/ValidationSummary';
import { RoutingPreview } from '@/components/routing/RoutingPreview';
import { PreviousWeekInput } from '@/components/report/PreviousWeekInput';
import { SLAReportTable } from '@/components/report/SLAReportTable';
import { ReportExportButton } from '@/components/report/ReportExportButton';
import { DetailModal } from '@/components/report/DetailModal';
import { AgingReportWorkflow } from '@/components/aging/AgingReportWorkflow';
import { MonthlyReportWorkflow } from '@/components/monthly/MonthlyReportWorkflow';

import { readIncidentUpload } from '@/lib/excel/incident-upload';
import { applyRouting } from '@/lib/routing/routing-engine';
import { calculateSLAReport, calculateWeeklyCompletion, refreshWeeklyTicketTotals } from '@/lib/sla/calculator';
import { applyReportTicketEdit, createReportTicketEdit, type ReportTicketAction } from '@/lib/report/ticket-edits';
import { REPORT_TEAMS } from '@/lib/routing/routing-engine';

import type { Incident } from '@/types/incident';
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
  const [weeklyArchive, setWeeklyArchive] = useState<{ id: string; savedAt?: string }>();
  const [agingStoredReport, setAgingStoredReport] = useState<{
    data: AgingReportData;
    incidents?: Incident[];
  } | null>(null);
  const [monthlyStoredReport, setMonthlyStoredReport] = useState<{
    id: string;
    title: string;
    savedAt: string;
    period: string;
    privateOnly?: boolean;
    data: import('@/types/monthly').MonthlyReportData;
    incidents?: Incident[];
  } | null>(null);

  const handleOpenStoredReport = useCallback((storedReport: StoredReport) => {
    if (storedReport.type === 'weekly') {
      setWeeklyArchive({ id: storedReport.id, savedAt: storedReport.savedAt });
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
        id: storedReport.id,
        title: storedReport.title,
        savedAt: storedReport.savedAt,
        period: storedReport.period,
        privateOnly: storedReport.privateOnly,
        data: storedReport.reportData as import('@/types/monthly').MonthlyReportData,
        incidents: storedReport.routedIncidents,
      });
      setActiveView('monthly');
    }
  }, []);

  const handleFileSelected = useCallback(async (file: File) => {
    dispatch({ type: 'SET_PROCESSING', isProcessing: true });
    dispatch({ type: 'SET_ERROR', error: null });

    try {
      const { data, columns, mapping, incidents, validationSummary } = await readIncidentUpload(file);
      setWeeklyArchive(undefined);
      dispatch({ type: 'SET_FILE', fileName: file.name, rawData: data, columns });
      dispatch({ type: 'SET_COLUMN_MAPPING', mapping });
      dispatch({ type: 'SET_VALIDATION', incidents, summary: validationSummary });
      dispatch({ type: 'SET_STEP', step: 'validation' });
    } finally {
      dispatch({ type: 'SET_PROCESSING', isProcessing: false });
    }
  }, []);

  const handleProceedToRouting = useCallback(() => {
    const { routedIncidents, summary } = applyRouting(state.incidents, state.routingConfig);
    dispatch({ type: 'SET_ROUTING_RESULT', incidents: routedIncidents, summary });
    dispatch({ type: 'SET_STEP', step: 'routing' });
  }, [state.incidents, state.routingConfig]);

  const handleProceedToPreviousWeek = useCallback(() => {
    dispatch({ type: 'SET_STEP', step: 'previous-week' });
  }, []);

  const handleGenerateReport = useCallback(() => {
    const currentWeekReport = state.reportData?.currentWeek ?? calculateSLAReport(state.routedIncidents, REPORT_TEAMS);
    const weeklyCompletion = state.reportData?.weeklyCompletion ?? calculateWeeklyCompletion(state.routedIncidents);
    setWeeklyArchive(archive => archive ?? { id: `report-weekly-${Date.now()}-${Math.random().toString(36).slice(2)}` });

    const reportData: WeeklyReportData = {
      reportTitle: 'Closed Incident Weekly Report',
      reportPeriod: state.reportPeriod || `Week of ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
      generatedAt: state.reportData?.generatedAt ?? new Date(),
      currentWeek: currentWeekReport,
      previousWeek: state.previousWeekSLA,
      weeklyCompletion,
      teamOrder: currentWeekReport.firstResponse.map(row => row.teamName),
    };

    dispatch({ type: 'SET_REPORT_DATA', data: reportData });
    dispatch({ type: 'SET_STEP', step: 'report' });
  }, [state.routedIncidents, state.previousWeekSLA, state.reportPeriod, state.reportData]);

  const handleWeeklyTicketEdit = (action: ReportTicketAction, requestId: string) => {
    if (!state.reportData) return;
    const failedIds = new Set(state.reportData.currentWeek.firstResponseTotal.failedIncidentIds);
    const edit = createReportTicketEdit(state.routedIncidents, requestId, action, currentAccount,
      (ticket) => failedIds.has(ticket.requestId));
    const routedIncidents = applyReportTicketEdit(state.routedIncidents, edit);
    dispatch({ type: 'SET_REPORT_TICKETS', edit, routedIncidents, data: refreshWeeklyTicketTotals(state.reportData, routedIncidents) });
  };

  const handleStepClick = useCallback((step: AppStep) => {
    dispatch({ type: 'SET_STEP', step });
  }, []);


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
      setWeeklyArchive(undefined);
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

  if (!mounted || !currentAccount) {
    return (
      <div className="admin-login-page">
        {mounted ? <AdminLogin onLogin={handleLogin} /> : <main className="admin-login" role="status">Checking session...</main>}
        <AppFooter />
      </div>
    );
  }

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

  if (activeView === 'monthly') {
    return workspace(
      <MonthlyReportWorkflow
        account={currentAccount}
        initialStoredReport={monthlyStoredReport}
      />
    );
  }

  if (activeView === 'aging') {
    return workspace(
      <AgingReportWorkflow
        key={agingStoredReport ? `stored-${agingStoredReport.data.reportId || agingStoredReport.data.generatedAt}` : `new-${agingKey}`}
        account={currentAccount}
        initialReportData={agingStoredReport?.data}
        initialRoutedIncidents={agingStoredReport?.incidents}
      />
    );
  }

  if (activeView !== 'weekly') return workspace();

  const showingWeeklyReport = state.currentStep === 'report' && Boolean(state.reportData);
  const showWeeklyWorkflow = !showingWeeklyReport || state.rawData !== null;
  const startNewWeeklyReport = () => {
    dispatch({ type: 'RESET' });
    setWeeklyArchive(undefined);
  };
  return workspace(
    <main className="app-main"
      data-report-setup={state.currentStep === 'upload' || undefined}>
      {showWeeklyWorkflow && (
        <ReportWorkflowHeader
          title="Generate Weekly Report"
          fileName={state.fileName}
          busy={state.isProcessing}
          onReset={startNewWeeklyReport}
        />
      )}
      {showWeeklyWorkflow && (
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
      )}
      {state.error && (
        <div className="error-banner report-workflow-error" role="alert">
          <span>{state.error}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => dispatch({ type: 'SET_ERROR', error: null })}>✕</button>
        </div>
      )}
      <div className={showingWeeklyReport ? 'app-content report-results-content' : 'app-content'}>
        {state.currentStep === 'upload' && (
          <ReportSetup onFileSelected={handleFileSelected} isProcessing={state.isProcessing}>
            <ReportPeriodField value={state.reportPeriod}
              onChange={period => dispatch({ type: 'SET_REPORT_PERIOD', period })} />
          </ReportSetup>
        )}
        {state.currentStep === 'validation' && state.validationSummary && (
          <ValidationSummaryView
            summary={state.validationSummary}
            onProceed={handleProceedToRouting}
            onBack={() => dispatch({ type: 'SET_STEP', step: 'upload' })}
          />
        )}
        {state.currentStep === 'routing' && state.routingSummary && (
          <RoutingPreview
            summary={state.routingSummary}
            onProceed={handleProceedToPreviousWeek}
            onBack={() => dispatch({ type: 'SET_STEP', step: 'validation' })}
          />
        )}
        {state.currentStep === 'previous-week' && (
          <PreviousWeekInput
            initialValues={state.previousWeekSLA}
            autoFill={!state.reportData}
            onSave={(values) => dispatch({ type: 'SET_PREVIOUS_WEEK', previousWeek: values })}
            onBack={() => dispatch({ type: 'SET_STEP', step: state.reportData ? 'report' : 'routing' })}
            onProceed={handleGenerateReport}
          />
        )}
        {state.currentStep === 'report' && state.reportData && (
          <SLAReportTable
            data={state.reportData}
            headingLevel={showWeeklyWorkflow ? 2 : 1}
            onCellClick={handleCellClick}
            routedIncidents={state.routedIncidents}
            archiveId={weeklyArchive?.id}
            archiveSavedAt={weeklyArchive?.savedAt}
            onSaveReport={report => setWeeklyArchive({ id: report.id, savedAt: report.savedAt })}
            onEditTicket={isAdmin(currentAccount) ? handleWeeklyTicketEdit : undefined}
            exportAction={
              <ReportExportButton
                account={currentAccount}
                incidents={state.routedIncidents}
                reportData={state.reportData}
                baseFilename="SMAC_Incident_Report"
              />
            }
          />
        )}
      </div>
      <DetailModal
        isOpen={state.detailModal.isOpen}
        title={state.detailModal.title}
        incidentIds={state.detailModal.incidentIds}
        onClose={() => dispatch({ type: 'CLOSE_DETAIL_MODAL' })}
      />

    </main>
  );
}
