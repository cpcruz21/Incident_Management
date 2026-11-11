'use client';

import React, { useReducer, useCallback } from 'react';
import type { Account } from '@/lib/auth';

import { agingReducer, agingInitialState } from '@/lib/aging-store';
import type { AgingStep } from '@/lib/aging-store';
import { incidentReportSteps, Stepper } from '@/components/ui/Stepper';
import { ReportWorkflowHeader } from '@/components/report/ReportWorkflowHeader';
import { FileUpload } from '@/components/upload/FileUpload';
import { ValidationSummaryView } from '@/components/validation/ValidationSummary';
import { RoutingPreview } from '@/components/routing/RoutingPreview';
import { AgingPreviousWeekInput } from '@/components/aging/AgingPreviousWeekInput';
import { AgingReportTable } from '@/components/aging/AgingReportTable';
import { ExportDropdown } from '@/components/report/ExportDropdown';
import { DetailModal } from '@/components/report/DetailModal';

import { parseFile } from '@/lib/excel/parser';
import { autoDetectMapping, mapAllRows } from '@/lib/excel/mapper';
import { applyRouting } from '@/lib/routing/routing-engine';
import { buildRemarksTableData, toValidDate } from '@/lib/aging/calculator';
import { createAgingReport, loadPreviousAgingReport } from '@/lib/aging/report';
import { exportAsPng } from '@/lib/report/export';

import type { ColumnMapping, Incident } from '@/types/incident';
import type { AgingReportData } from '@/types/aging';

interface AgingReportWorkflowProps {
  account: Account;
  onBack: () => void;
  initialReportData?: AgingReportData;
  initialRoutedIncidents?: Incident[];
}

export function AgingReportWorkflow({
  account,
  onBack,
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

  //FILE UPLOAD
  const handleFileSelected = useCallback(async (file: File) => {
    dispatch({ type: 'SET_PROCESSING', isProcessing: true });
    dispatch({ type: 'SET_ERROR', error: null });

    try {
      const result = await parseFile(file);

      if (!result.success) {
        dispatch({ type: 'SET_ERROR', error: result.errors.join('. ') });
        dispatch({ type: 'SET_PROCESSING', isProcessing: false });
        return;
      }

      dispatch({
        type: 'SET_FILE',
        fileName: file.name,
        rawData: result.data as Record<string, unknown>[],
        columns: result.columns,
      });

      const detectedMapping = autoDetectMapping(result.columns);
      const fullMapping: ColumnMapping = {
        ...state.columnMapping,
        ...detectedMapping,
      };
      dispatch({ type: 'SET_COLUMN_MAPPING', mapping: fullMapping });

      const { incidents, validationSummary } = mapAllRows(result.data, fullMapping);
      dispatch({ type: 'SET_VALIDATION', incidents, summary: validationSummary });
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

  //REPORT GENERATION 
  const handleGenerateReport = useCallback(async () => {
    if (state.isProcessing) return;
    if (!state.rawData && state.reportData) {
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
        state.reportData || state.previousWeekAging.sourceReportId ? state.previousWeekAging : undefined,
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
  }, [state.routedIncidents, state.previousWeekAging, state.reportPeriod, state.reportAsOf, state.rawData, state.reportData, state.isProcessing]);

  //NAVIGATION
  const handleStepClick = useCallback((step: AgingStep) => {
    dispatch({ type: 'SET_STEP', step });
  }, []);

  // EXPORT
  const handleExportPng = useCallback(async () => {
    try {
      await exportAsPng('aging-report-canvas', `Aging_Report_${new Date().toISOString().split('T')[0]}.png`);
    } catch {
      dispatch({ type: 'SET_ERROR', error: 'Failed to export report as PNG' });
    }
  }, []);

  // DETAIL MODAL 
  const handleCellClick = useCallback((title: string, incidentIds: string[]) => {
    dispatch({ type: 'OPEN_DETAIL_MODAL', title, incidentIds });
  }, []);

  // REMARKS ROW UPDATE
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

  return (
    <main className={`app-main ${state.currentStep === 'report' ? 'aging-fullscreen-dashboard' : ''}`}>
      <ReportWorkflowHeader
        title="Aging Incident Report"
        fileName={state.fileName}
        busy={state.isProcessing}
        onBack={onBack}
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

      {state.error && (
        <div className="error-banner report-workflow-error" role="alert">
          <span>{state.error}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => dispatch({ type: 'SET_ERROR', error: null })}>✕</button>
        </div>
      )}

      <div className={`app-content ${state.currentStep === 'report' ? 'aging-report-fullscreen' : ''}`}>
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
              <div className="report-setup-field">
                <label htmlFor="aging-as-of">Aging as of</label>
                <input id="aging-as-of" type="datetime-local"
                  value={state.reportAsOf || (() => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16); })()}
                  onChange={(event) => dispatch({ type: 'SET_REPORT_AS_OF', value: event.target.value })} />
                <small>Use the extraction date for a historical import.</small>
              </div>
            </div>
            <FileUpload onFileSelected={handleFileSelected} isProcessing={state.isProcessing} />
          </section>
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
          <div className="report-step">
            <div className="report-actions-bar">
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    if (!state.rawData) {
                      onBack();
                    } else {
                      dispatch({ type: 'SET_STEP', step: 'previous-week' });
                    }
                  }}
                >
                  {state.rawData ? '← Back' : '← Back to Dashboard'}
                </button>
                <button className="btn btn-secondary" onClick={() => dispatch({ type: 'SET_STEP', step: 'previous-week' })}>
                  Edit previous week
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    dispatch({ type: 'RESET' });
                  }}
                  title="Create a new aging report from scratch"
                >
                  + New Report
                </button>
              </div>
              <div className="report-export-buttons">
                <ExportDropdown
                  incidents={state.routedIncidents}
                  reportData={state.reportData}
                  baseFilename="SMAC_Aging_Report"
                  targetElementId="aging-report-canvas"
                  onExportPng={handleExportPng}
                />
              </div>
            </div>

            <AgingReportTable
              key={state.reportData.reportId || String(state.reportData.generatedAt)}
              data={state.reportData}
              onCellClick={handleCellClick}
              routedIncidents={state.routedIncidents}
              onUpdateRemarksRow={handleUpdateRemarksRow}
              onSaveReport={(data) => dispatch({ type: 'SET_REPORT_DATA', data })}
              accountName={account.name}
            />
          </div>
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
