'use client';

import React, { useReducer, useCallback } from 'react';
import type { Account } from '@/lib/auth';
import { isAdmin } from '@/lib/auth';

import { agingReducer, agingInitialState } from '@/lib/aging-store';
import type { AgingStep } from '@/lib/aging-store';
import { incidentReportSteps, Stepper } from '@/components/ui/Stepper';
import { ReportWorkflowHeader } from '@/components/report/ReportWorkflowHeader';
import { ReportPeriodField, ReportSetup } from '@/components/report/ReportSetup';
import { ValidationSummaryView } from '@/components/validation/ValidationSummary';
import { RoutingPreview } from '@/components/routing/RoutingPreview';
import { AgingPreviousWeekInput } from '@/components/aging/AgingPreviousWeekInput';
import { AgingReportTable } from '@/components/aging/AgingReportTable';
import { ReportExportButton } from '@/components/report/ReportExportButton';
import { DetailModal } from '@/components/report/DetailModal';

import { readIncidentUpload } from '@/lib/excel/incident-upload';
import { applyRouting } from '@/lib/routing/routing-engine';
import { buildRemarksTableData, filterOpenIncidents, toValidDate } from '@/lib/aging/calculator';
import { createAgingReport, loadPreviousAgingReport, refreshAgingTicketTotals } from '@/lib/aging/report';
import { applyReportTicketEdit, createReportTicketEdit, type ReportTicketAction } from '@/lib/report/ticket-edits';

import type { Incident } from '@/types/incident';
import type { AgingReportData } from '@/types/aging';

interface AgingReportWorkflowProps {
  account: Account;
  initialReportData?: AgingReportData;
  initialRoutedIncidents?: Incident[];
}

export function AgingReportWorkflow({
  account,
  initialReportData,
  initialRoutedIncidents,
}: AgingReportWorkflowProps) {
  const [state, dispatch] = useReducer(
    agingReducer,
    agingInitialState,
    (baseState) => {
      if (initialReportData) {
        let populatedData = initialReportData;
        if (!populatedData.remarksTable && initialRoutedIncidents && initialRoutedIncidents.length > 0) {
          const remTable = buildRemarksTableData(
            initialRoutedIncidents,
            new Date(initialReportData.generatedAt || Date.now()),
            initialReportData.reportPeriod
          );
          populatedData = { ...populatedData, remarksTable: remTable };
        }
        return {
          ...baseState,
          currentStep: 'report' as AgingStep,
          reportData: populatedData,
          previousWeekAging: populatedData.previousWeek,
          routedIncidents: initialRoutedIncidents || [],
          incidents: initialRoutedIncidents || [],
        };
      }
      return baseState;
    }
  );

  const handleFileSelected = useCallback(async (file: File) => {
    dispatch({ type: 'SET_PROCESSING', isProcessing: true });
    dispatch({ type: 'SET_ERROR', error: null });

    try {
      const { data, columns, mapping, incidents, validationSummary } = await readIncidentUpload(file);
      const asOf = toValidDate(state.reportAsOf) ?? new Date();
      const futureIncident = filterOpenIncidents(incidents).find(incident => incident.createdTime! > asOf);
      if (futureIncident) {
        throw new Error(`Aging as of is earlier than the Created Time for Request ID ${futureIncident.requestId}. Check the extraction date or the uploaded sheet.`);
      }
      dispatch({ type: 'SET_FILE', fileName: file.name, rawData: data, columns });
      dispatch({ type: 'SET_COLUMN_MAPPING', mapping });
      dispatch({ type: 'SET_VALIDATION', incidents, summary: validationSummary });
      dispatch({ type: 'SET_STEP', step: 'validation' });
    } finally {
      dispatch({ type: 'SET_PROCESSING', isProcessing: false });
    }
  }, [state.reportAsOf]);

  const handleProceedToRouting = useCallback(() => {
    const { routedIncidents, summary } = applyRouting(state.incidents, state.routingConfig);
    dispatch({ type: 'SET_ROUTING_RESULT', incidents: routedIncidents, summary });
    dispatch({ type: 'SET_STEP', step: 'routing' });
  }, [state.incidents, state.routingConfig]);

  const handleProceedToPreviousWeek = useCallback(async () => {
    dispatch({ type: 'SET_PROCESSING', isProcessing: true });
    dispatch({ type: 'SET_ERROR', error: null });
    try {
      const previousWeek = await loadPreviousAgingReport();
      dispatch({ type: 'SET_PREVIOUS_WEEK', previousWeek });
      dispatch({ type: 'SET_STEP', step: 'previous-week' });
    } catch (error) {
      dispatch({ type: 'SET_ERROR', error: error instanceof Error ? error.message : 'Could not load the last saved Aging report.' });
    } finally {
      dispatch({ type: 'SET_PROCESSING', isProcessing: false });
    }
  }, []);

  const handleGenerateReport = useCallback(async () => {
    if (state.isProcessing) return;
    if (state.reportData) {
      dispatch({ type: 'SET_REPORT_DATA', data: { ...state.reportData, previousWeek: state.previousWeekAging } });
      dispatch({ type: 'SET_STEP', step: 'report' });
      return;
    }
    dispatch({ type: 'SET_PROCESSING', isProcessing: true });
    dispatch({ type: 'SET_ERROR', error: null });
    try {
      const reportData = await createAgingReport(
        state.routedIncidents,
        state.reportPeriod,
        state.previousWeekAging,
        state.reportAsOf ? toValidDate(state.reportAsOf)! : new Date()
      );
      dispatch({ type: 'SET_PREVIOUS_WEEK', previousWeek: reportData.previousWeek });
      dispatch({ type: 'SET_REPORT_DATA', data: reportData });
      dispatch({ type: 'SET_STEP', step: 'report' });
    } catch (error) {
      dispatch({ type: 'SET_ERROR', error: error instanceof Error ? error.message : 'Could not load the last saved Aging report.' });
    } finally {
      dispatch({ type: 'SET_PROCESSING', isProcessing: false });
    }
  }, [state.routedIncidents, state.previousWeekAging, state.reportPeriod, state.reportAsOf, state.reportData, state.isProcessing]);

  const handleAgingTicketEdit = (action: ReportTicketAction, requestId: string) => {
    if (!state.reportData) return;
    const failedIds = new Set(state.reportData.slaRows.flatMap((row) => row.firstResponse.failedIds));
    const edit = createReportTicketEdit(filterOpenIncidents(state.routedIncidents), requestId, action, account,
      (ticket) => failedIds.has(ticket.requestId));
    const routedIncidents = applyReportTicketEdit(state.routedIncidents, edit);
    dispatch({ type: 'SET_REPORT_TICKETS', edit, routedIncidents, data: refreshAgingTicketTotals(state.reportData, routedIncidents, edit) });
  };

  const handleStepClick = useCallback((step: AgingStep) => {
    dispatch({ type: 'SET_STEP', step });
  }, []);


  const handleCellClick = useCallback((title: string, incidentIds: string[]) => {
    dispatch({ type: 'OPEN_DETAIL_MODAL', title, incidentIds });
  }, []);

  const handleUpdateRemarksRow = useCallback(
    (
      requestId: string,
      recentUpdate: string,
      responsibleOrDependency?: string,
      department?: string,
      lastUpdated?: string,
      updatedBy?: string,
      isUnsaved?: boolean
    ) => {
      dispatch({
        type: 'UPDATE_REMARKS_ROW',
        requestId,
        recentUpdate,
        responsibleOrDependency,
        department,
        lastUpdated,
        updatedBy,
        isUnsaved,
      });
    },
    []
  );

  const showingReport = state.currentStep === 'report' && Boolean(state.reportData);
  const showWorkflow = !showingReport || state.rawData !== null;

  return (
    <main className={showingReport ? 'app-main aging-fullscreen-dashboard' : 'app-main'}
      data-report-setup={state.currentStep === 'upload' || undefined}>
      {showWorkflow && (
        <>
          <ReportWorkflowHeader
            title="Generate Aging Report"
            fileName={state.fileName}
            busy={state.isProcessing}
            onReset={() => dispatch({ type: 'RESET' })}
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
            ]}
          />
        </>
      )}

      {state.error && (
        <div className="error-banner report-workflow-error" role="alert">
          <span>{state.error}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => dispatch({ type: 'SET_ERROR', error: null })}>✕</button>
        </div>
      )}

      <div className={showingReport ? 'app-content report-results-content' : 'app-content'}>
        {state.currentStep === 'upload' && (
          <ReportSetup onFileSelected={handleFileSelected} isProcessing={state.isProcessing}
            hint={<p id="aging-as-of-help">For historical imports, set Aging as of to the extraction date.</p>}>
            <ReportPeriodField value={state.reportPeriod}
              onChange={period => dispatch({ type: 'SET_REPORT_PERIOD', period })} />
            <div className="report-setup-field">
              <label htmlFor="aging-as-of">Aging as of</label>
              <input id="aging-as-of" type="datetime-local" aria-describedby="aging-as-of-help"
                value={state.reportAsOf || (() => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16); })()}
                onChange={(event) => dispatch({ type: 'SET_REPORT_AS_OF', value: event.target.value })} />
            </div>
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
          <AgingPreviousWeekInput
            initialValues={state.previousWeekAging}
            busy={state.isProcessing}
            autoFill={!state.reportData || !state.previousWeekAging.sla}
            beforeGeneratedAt={state.reportData?.generatedAt}
            onSave={(values) => dispatch({ type: 'SET_PREVIOUS_WEEK', previousWeek: values })}
            onBack={() => dispatch({ type: 'SET_STEP', step: state.reportData ? 'report' : 'routing' })}
            onProceed={handleGenerateReport}
          />
        )}

        {state.currentStep === 'report' && state.reportData && (
          <AgingReportTable
            key={state.reportData.reportId || String(state.reportData.generatedAt)}
            data={state.reportData}
            headingLevel={showWorkflow ? 2 : 1}
            onCellClick={handleCellClick}
            routedIncidents={state.routedIncidents}
            onUpdateRemarksRow={handleUpdateRemarksRow}
            onSaveReport={(data) => dispatch({ type: 'SET_REPORT_DATA', data })}
            onEditTicket={isAdmin(account) ? handleAgingTicketEdit : undefined}
            accountName={account.name}
            exportAction={
              <ReportExportButton
                account={account}
                incidents={state.routedIncidents}
                reportData={state.reportData}
                baseFilename="SMAC_Aging_Report"
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
