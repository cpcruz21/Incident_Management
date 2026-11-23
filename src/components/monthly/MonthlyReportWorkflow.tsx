'use client';

import React, { useReducer, useCallback, useState, useEffect } from 'react';
import type { Account } from '@/lib/auth';
import { isAdmin } from '@/lib/auth';
import type { ColumnMapping, Incident } from '@/types/incident';
import type { MonthlyReportData } from '@/types/monthly';

import { readIncidentUpload } from '@/lib/excel/incident-upload';
import { toValidDate } from '@/lib/aging/calculator';
import { approveAcceptableFR, calculateMonthlyReport, refreshStoredMonthlyReport } from '@/lib/monthly/calculator';
import { updateMonthlyRootCause, type MonthlyRootCauseField } from '@/lib/monthly/root-cause';

import { Stepper } from '@/components/ui/Stepper';
import { ReportWorkflowHeader } from '@/components/report/ReportWorkflowHeader';
import { ReportSetup } from '@/components/report/ReportSetup';
import { ValidationSummaryView } from '@/components/validation/ValidationSummary';
import { MonthlyReportTable } from '@/components/monthly/MonthlyReportTable';
import { MonthlyPeriodPicker, type MonthlyPeriodSelection } from '@/components/monthly/MonthlyPeriodPicker';
import { ReportExportButton } from '@/components/report/ReportExportButton';
import { DetailModal } from '@/components/report/DetailModal';
import { saveReport, type StoredReport } from '@/lib/storage/report-storage';
import { persistServerMonthlyReport } from '@/lib/api/client';

import { DEFAULT_COLUMN_MAPPING } from '@/types/incident';


type MonthlyStep = 'upload' | 'validation' | 'report';
type MonthlyArchiveTarget = Pick<StoredReport, 'id' | 'title' | 'period' | 'savedAt'> & {
  syncPublished: boolean;
};

interface MonthlyState {
  step: MonthlyStep;
  fileName: string | null;
  rawData: Record<string, unknown>[] | null;
  columns: string[];
  columnMapping: ColumnMapping;
  incidents: Incident[];
  validationSummary: import('@/types/incident').ValidationSummary | null;
  reportData: MonthlyReportData | null;
  archiveTarget: MonthlyArchiveTarget | null;
  reportPeriod: MonthlyPeriodSelection;
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
  | { type: 'SET_ARCHIVE_TARGET'; target: MonthlyArchiveTarget }
  | { type: 'SET_ACCEPTABLE_FR'; incidents: Incident[]; data: MonthlyReportData }
  | { type: 'DELETE_INCIDENT'; incidents: Incident[]; data: MonthlyReportData }
  | { type: 'SET_PERIOD'; period: MonthlyPeriodSelection }
  | { type: 'SET_STORAGE_DESTINATION'; destination: 'both' | 'local' | 'server' }
  | { type: 'SET_PROCESSING'; val: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | {
    type: 'UPDATE_INCIDENT_FIELD';
    requestId: string;
    field: MonthlyRootCauseField;
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
  archiveTarget: null,
  reportPeriod: { month: '', year: '' },
  storageDestination: 'both',
  isProcessing: false,
  error: null,
  detailModal: { isOpen: false, title: '', incidentIds: [] },
};

function reducer(state: MonthlyState, action: MonthlyAction): MonthlyState {
  switch (action.type) {
    case 'SET_STEP': return { ...state, step: action.step, error: null };
    case 'SET_FILE':
      return {
        ...state,
        fileName: action.fileName,
        rawData: action.rawData,
        columns: action.columns,
        reportData: null,
        archiveTarget: null,
        detailModal: init.detailModal,
        error: null,
      };
    case 'SET_MAPPING': return { ...state, columnMapping: action.mapping };
    case 'SET_VALIDATION': return { ...state, incidents: action.incidents, validationSummary: action.summary };
    case 'SET_REPORT': return { ...state, reportData: action.data };
    case 'SET_ARCHIVE_TARGET': return { ...state, archiveTarget: action.target };
    case 'SET_ACCEPTABLE_FR': return { ...state, incidents: action.incidents, reportData: action.data };
    case 'DELETE_INCIDENT': return { ...state, incidents: action.incidents, reportData: action.data };
    case 'SET_PERIOD': return { ...state, reportPeriod: action.period };
    case 'SET_STORAGE_DESTINATION': return { ...state, storageDestination: action.destination };
    case 'SET_PROCESSING': return { ...state, isProcessing: action.val };
    case 'SET_ERROR': return { ...state, error: action.error };
    case 'UPDATE_INCIDENT_FIELD': {
      const updateList = (list: Incident[]) => list.map((inc) => inc.requestId === action.requestId
        ? updateMonthlyRootCause(inc, action.field, action.value)
        : inc);

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


const STEPS: readonly { id: MonthlyStep; label: string }[] = [
  { id: 'upload', label: 'Upload' },
  { id: 'validation', label: 'Validation' },
  { id: 'report', label: 'Report' },
];


interface MonthlyReportWorkflowProps {
  account: Account;
  initialStoredReport?: Omit<MonthlyArchiveTarget, 'syncPublished'> & {
    data: MonthlyReportData;
    incidents?: Incident[];
    privateOnly?: boolean;
  } | null;
}

export function MonthlyReportWorkflow({
  account,
  initialStoredReport,
}: MonthlyReportWorkflowProps) {
  const [state, dispatch] = useReducer(reducer, init);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const { month, year } = state.reportPeriod;
  const reportPeriod = month && year ? `${month} ${year}` : '';

  useEffect(() => {
    if (initialStoredReport?.data) {
      const { id, title, period, savedAt } = initialStoredReport;
      const data = refreshStoredMonthlyReport(initialStoredReport.data, initialStoredReport.incidents);
      const incidents = initialStoredReport.incidents?.length ? initialStoredReport.incidents : data.allTickets ?? [];
      dispatch({ type: 'SET_REPORT', data: { ...data, allTickets: incidents, closedTickets: data.closedTickets ?? [] } });
      dispatch({ type: 'SET_ARCHIVE_TARGET', target: { id, title, period, savedAt, syncPublished: !initialStoredReport.privateOnly } });
      dispatch({ type: 'SET_STORAGE_DESTINATION', destination: 'local' });
      dispatch({
        type: 'SET_VALIDATION',
        incidents,
        summary: {
          totalRecords: incidents.length,
          validRecords: incidents.length,
          invalidRecords: 0,
          errors: [],
          warnings: [],
          detectedColumns: [],
          detectedSourceTeams: [],
          detectedCategories: [],
        },
      });
      const [month = '', year = ''] = (initialStoredReport.period || initialStoredReport.data.reportPeriod || '').trim().split(/\s+/);
      dispatch({ type: 'SET_PERIOD', period: { month, year } });
      dispatch({ type: 'SET_STEP', step: 'report' });
      setSaved(false);
    }
  }, [initialStoredReport]);

  const handleFileSelected = useCallback(async (file: File) => {
    dispatch({ type: 'SET_PROCESSING', val: true });
    dispatch({ type: 'SET_ERROR', error: null });

    try {
      const { data, columns, mapping, incidents, validationSummary } = await readIncidentUpload(file);
      dispatch({ type: 'SET_FILE', fileName: file.name, rawData: data, columns });
      dispatch({ type: 'SET_MAPPING', mapping });
      dispatch({ type: 'SET_VALIDATION', incidents, summary: validationSummary });
      dispatch({ type: 'SET_STEP', step: 'validation' });
    } finally {
      dispatch({ type: 'SET_PROCESSING', val: false });
    }
  }, []);

  const handleGenerateReport = useCallback(() => {
    if (!reportPeriod) return;
    const report = calculateMonthlyReport(state.incidents, reportPeriod);
    dispatch({ type: 'SET_REPORT', data: report });
    dispatch({ type: 'SET_STEP', step: 'report' });
    setSaved(false);
    setSaveError('');
  }, [state.incidents, reportPeriod]);

  const handleStepClick = useCallback((step: MonthlyStep) => {
    if (step === 'upload') {
      dispatch({ type: 'SET_STEP', step: 'upload' });
    } else if (step === 'validation' && state.validationSummary && reportPeriod) {
      dispatch({ type: 'SET_STEP', step: 'validation' });
    } else if (step === 'report' && state.reportData) {
      dispatch({ type: 'SET_STEP', step: 'report' });
    }
  }, [state.validationSummary, state.reportData, reportPeriod]);

  const handleCellClick = useCallback((title: string, ids: string[]) => {
    dispatch({ type: 'OPEN_MODAL', title, ids });
  }, []);

  const handleUpdateIncident = useCallback(
    (
      requestId: string,
      field: MonthlyRootCauseField,
      value: string
    ) => {
      if (!isAdmin(account)) return;
      dispatch({
        type: 'UPDATE_INCIDENT_FIELD',
        requestId,
        field,
        value,
      });
      setSaved(false);
    },
    [account]
  );

  const handleAddAcceptableFR = useCallback((requestId: string) => {
    if (!isAdmin(account) || !state.reportData) throw new Error('Admin access is required.');
    const referenceDate = toValidDate(state.reportData.generatedAt) ?? undefined;
    const incidents = approveAcceptableFR(
      state.incidents.length > 0 ? state.incidents : state.reportData.allTickets,
      requestId,
      account.name,
      referenceDate
    );
    const calculated = calculateMonthlyReport(incidents, state.reportData.reportPeriod, state.reportData.teamOrder, referenceDate);
    dispatch({
      type: 'SET_ACCEPTABLE_FR',
      incidents,
      data: { ...state.reportData, ...calculated, reportTitle: state.reportData.reportTitle },
    });
    setSaved(false);
  }, [account, state.incidents, state.reportData]);

  const handleDeleteIncident = useCallback((requestId: string) => {
    if (!isAdmin(account) || !state.reportData) throw new Error('Admin access is required.');
    const currentIncidents = state.incidents.length > 0 ? state.incidents : state.reportData.allTickets;
    const remainingIncidents = currentIncidents.filter(
      (inc) => inc.requestId && inc.requestId.trim().toLowerCase() !== requestId.trim().toLowerCase()
    );
    if (remainingIncidents.length === currentIncidents.length) {
      throw new Error(`Incident with Request ID "${requestId}" not found.`);
    }
    const calculated = calculateMonthlyReport(
      remainingIncidents,
      state.reportData.reportPeriod,
      state.reportData.teamOrder,
      toValidDate(state.reportData.generatedAt) ?? undefined
    );
    dispatch({
      type: 'DELETE_INCIDENT',
      incidents: remainingIncidents,
      data: { ...state.reportData, ...calculated, reportTitle: state.reportData.reportTitle },
    });
    setSaved(false);
  }, [account, state.incidents, state.reportData]);

  const { archiveTarget, reportData, incidents } = state;
  const handleSaveReport = useCallback(async (destination: MonthlyState['storageDestination']) => {
    if (saving || !isAdmin(account) || !reportData) return;
    setSaving(true);
    setSaveError('');
    setSaved(false);
    const period = archiveTarget?.period ?? (reportData.reportPeriod || 'Monthly Period');
    const title = archiveTarget?.title ?? (reportData.reportTitle || `Monthly Overall Ticket Report - ${period}`);
    const id = archiveTarget?.id ?? `monthly-${period.toLowerCase().replace(/[^a-z0-9]/g, '-') || Date.now()}`;
    const syncPublished = archiveTarget?.syncPublished ?? false;

    try {
      let published: boolean;
      if (destination !== 'server') {
        const record = await saveReport({
          id: destination === 'local' ? archiveTarget?.id : id,
          type: 'monthly',
          title,
          period,
          author: account.name,
          privateOnly: destination === 'local' && !syncPublished ? true : undefined,
          reportData,
          routedIncidents: incidents,
          expectedSavedAt: archiveTarget?.savedAt,
          monthlyPublication: destination === 'both' ? 'publish' : syncPublished ? 'update' : undefined,
        });
        published = record.publication === 'updated';
        dispatch({
          type: 'SET_ARCHIVE_TARGET',
          target: { id: record.id, title, period, savedAt: record.savedAt, syncPublished: syncPublished || published },
        });
        if (record.publication === 'failed') throw new Error('Saved to Archive. The public dashboard update failed. Try saving again.');
      } else {
        published = await persistServerMonthlyReport({
          id,
          title,
          period,
          savedBy: account.name,
          savedAt: new Date().toISOString(),
          reportData,
          routedIncidents: incidents,
        });
        if (!published) throw new Error('Could not publish the monthly report.');
      }

      if (published) {
        try {
          if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
            const bc = new BroadcastChannel('smac_report_updates');
            bc.postMessage({ type: 'report_saved', reportType: 'monthly', id });
            bc.close();
          }
        } catch { }
      }
      setSaved(destination !== 'server');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save the monthly report.');
    } finally {
      setSaving(false);
    }
  }, [archiveTarget, reportData, incidents, saving, account]);

  const resetReport = () => {
    dispatch({ type: 'RESET' });
    setSaved(false);
    setSaveError('');
  };

  const showingReport = state.step === 'report' && Boolean(state.reportData);
  const showWorkflow = !showingReport || state.rawData !== null;

  return (
    <main className="app-main" data-report-setup={state.step === 'upload' || undefined}>
      {showWorkflow && (
        <>
          <ReportWorkflowHeader
            title="Generate Monthly Report"
            fileName={state.fileName}
            busy={state.isProcessing || saving}
            onReset={resetReport}
          />
          <Stepper
            steps={STEPS}
            currentStep={state.step}
            onStepClick={handleStepClick}
            busy={state.isProcessing || saving}
            availableSteps={state.validationSummary && reportPeriod ? ['upload', 'validation'] : ['upload']}
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
        {state.step === 'upload' && (
          <ReportSetup onFileSelected={handleFileSelected} isProcessing={state.isProcessing}
            disabledReason={reportPeriod ? undefined : 'Select the month and year to upload.'}>
            <MonthlyPeriodPicker value={state.reportPeriod} disabled={state.isProcessing}
              onChange={period => dispatch({ type: 'SET_PERIOD', period })} />
            <div className="report-setup-field">
              <label htmlFor="storage-destination">Save report to</label>
              <select
                id="storage-destination"
                value={state.storageDestination}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_STORAGE_DESTINATION',
                    destination: e.target.value as 'both' | 'local' | 'server',
                  })
                }
              >
                <option value="both">Archive and publish</option>
                <option value="server">Publish to public dashboard</option>
                <option value="local">Private archive only</option>
              </select>
            </div>
          </ReportSetup>
        )}
        {state.step === 'validation' && state.validationSummary && (
          <ValidationSummaryView
            summary={state.validationSummary}
            onProceed={handleGenerateReport}
            onBack={() => dispatch({ type: 'SET_STEP', step: 'upload' })}
          />
        )}
        {state.step === 'report' && state.reportData && (
          <MonthlyReportTable
            data={state.reportData}
            headingLevel={showWorkflow ? 2 : 1}
            onCellClick={handleCellClick}
            routedIncidents={state.incidents}
            isAdmin={isAdmin(account)}
            onUpdateIncident={handleUpdateIncident}
            onAddAcceptableFR={handleAddAcceptableFR}
            onDeleteIncident={handleDeleteIncident}
            onSaveReport={() => handleSaveReport(state.storageDestination)}
            onSaveChanges={() => handleSaveReport(state.storageDestination)}
            isArchived={saved}
            saving={saving}
            saveError={saveError}
            exportAction={
              <ReportExportButton
                account={account}
                incidents={state.incidents}
                reportData={state.reportData}
                baseFilename="SMAC_Monthly_Incident_Report"
              />
            }
          />
        )}
      </div>
      <DetailModal
        isOpen={state.detailModal.isOpen}
        title={state.detailModal.title}
        incidentIds={state.detailModal.incidentIds}
        onClose={() => dispatch({ type: 'CLOSE_MODAL' })}
      />
    </main>
  );
}
