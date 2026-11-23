'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { PreviousWeekAging } from '@/types/aging';
import { REPORT_TEAMS } from '@/lib/routing/routing-engine';
import { SlaPercentageInput } from '@/components/report/SlaPercentageInput';
import {
  getStoredReports,
  extractAgingFromStored,
  getPriorAgingReports,
  type StoredReport,
} from '@/lib/storage/report-storage';

interface AgingPreviousWeekInputProps {
  initialValues: PreviousWeekAging;
  autoFill?: boolean;
  beforeGeneratedAt?: Date | string;
  busy?: boolean;
  onSave: (values: PreviousWeekAging) => void;
  onBack: () => void;
  onProceed: () => void;
}

export function AgingPreviousWeekInput({ initialValues, autoFill = true, beforeGeneratedAt, busy = false, onSave, onBack, onProceed }: AgingPreviousWeekInputProps) {
  const [values, setValues] = useState<PreviousWeekAging>(initialValues);
  const [storedReports, setStoredReports] = useState<StoredReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const didAutoFill = useRef(false);

  useEffect(() => {
    let active = true;
    getStoredReports()
      .then((reports) => {
        if (active) setStoredReports(getPriorAgingReports(reports, beforeGeneratedAt));
      })
      .catch(() => { if (active) setLoadError('Could not load the latest saved Aging extract. Go back and reopen this step to retry.'); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [beforeGeneratedAt]);

  useEffect(() => {
    const hasExisting = Object.values(initialValues.teamTotals).some((v) => v != null) ||
      [...Object.values(initialValues.sla?.firstResponse || {}), ...Object.values(initialValues.sla?.resolutionTime || {}),
        initialValues.sla?.firstResponseTotal, initialValues.sla?.resolutionTimeTotal].some((v) => v != null);
    if (autoFill && !didAutoFill.current && (!hasExisting || !initialValues.sla) && storedReports.length > 0) {
      didAutoFill.current = true;
      const latest = storedReports[0];
      const extracted = extractAgingFromStored(latest);
      setValues(extracted);
      onSave(extracted);
      setSelectedReportId(latest.id);
    } else {
      setValues(initialValues);
    }
  }, [initialValues, autoFill, storedReports]);

  const handleSelectStoredReport = (reportId: string) => {
    if (!reportId) {
      setSelectedReportId(null);
      return;
    }
    const found = storedReports.find((r) => r.id === reportId);
    if (found) {
      const extracted = extractAgingFromStored(found);
      setValues(extracted);
      onSave(extracted);
      setSelectedReportId(reportId);
    }
  };

  const handleClearAutofill = () => {
    setSelectedReportId(null);
    const emptyTotals: Record<string, number | null> = {};
    for (const t of REPORT_TEAMS) {
      emptyTotals[t] = null;
    }
    const empty: PreviousWeekAging = {
      teamTotals: emptyTotals,
      grandTotal: null,
    };
    setValues(empty);
    onSave(empty);
  };

  const handleSLAChange = (section: 'firstResponse' | 'resolutionTime' | 'firstResponseTotal' | 'resolutionTimeTotal', team: string | null, value: number | null) => {
    const sla = values.sla || { firstResponse: {}, resolutionTime: {}, firstResponseTotal: null, resolutionTimeTotal: null };
    const newValues = {
      ...values,
      sla: team !== null && (section === 'firstResponse' || section === 'resolutionTime')
        ? { ...sla, [section]: { ...sla[section], [team]: value } }
        : { ...sla, [section]: value },
    };
    setValues(newValues);
    onSave(newValues);
  };

  const handleCountChange = (team: string | null, rawValue: string) => {
    if (!/^\d*$/.test(rawValue)) return;
    const count = rawValue === '' ? null : Number(rawValue);
    if (count !== null && !Number.isSafeInteger(count)) return;
    const newValues = { ...values };
    if (team === null) {
      newValues.grandTotal = count;
    } else {
      newValues.teamTotals = { ...values.teamTotals, [team]: count };
      const counts = REPORT_TEAMS.map((team) => newValues.teamTotals[team]).filter((value) => value != null);
      newValues.grandTotal = counts.length ? counts.reduce((sum, value) => sum + value, 0) : null;
    }
    setValues(newValues);
    onSave(newValues);
  };

  const formatValue = (val: number | null | undefined): string => {
    if (val === null || val === undefined) return '';
    return String(val);
  };

  return (
    <div className="prevweek-container">
      <div className="prevweek-header">
        <h2>Previous Week Aging &amp; SLA</h2>
        <p className="prevweek-description">
          Last week’s records load automatically from the most recent saved Aging extract.
          Its team SLA rates and overall totals are used for comparison. You can select a different saved extract below.
        </p>
      </div>

      {isLoading && <p role="status">Loading the last Aging extract…</p>}
      {loadError && <p className="admin-error" role="alert">{loadError}</p>}
      {!isLoading && !loadError && storedReports.length === 0 && (
        <p role="status">No previous Aging extract is saved yet. Missing comparison values will be shown as —.</p>
      )}

      {storedReports.length > 0 && (
        <div className="prevweek-autofill-banner">
          <div className="prevweek-autofill-left">
            <span className="prevweek-autofill-icon">💡</span>
            <div>
              <div className="prevweek-autofill-title">
                Retrieve Last Week’s Aging &amp; SLA
              </div>
              <div className="prevweek-autofill-sub">
                {selectedReportId ? (
                  <>
                    Loaded last week’s aging counts and SLA rates from{' '}
                    <strong>
                      {storedReports.find((r) => r.id === selectedReportId)?.period ||
                        storedReports.find((r) => r.id === selectedReportId)?.title}
                    </strong>
                    . You can adjust any values below.
                  </>
                ) : (
                  'Select the report for the week you want to compare. Its aging counts and SLA pass rates will be loaded together.'
                )}
              </div>
            </div>
          </div>
          <div className="prevweek-autofill-controls">
            <select
              value={selectedReportId || ''}
              onChange={(e) => handleSelectStoredReport(e.target.value)}
              className="prevweek-autofill-select"
            >
              <option value="">-- Manual Entry / Pick Aging Stored Report --</option>
              {storedReports.map((r) => (
                <option key={r.id} value={r.id}>
                  [Aging Trend] {r.period || r.title} ({r.savedAtFormatted})
                </option>
              ))}
            </select>
            {selectedReportId && (
              <button
                type="button"
                onClick={handleClearAutofill}
                className="btn-clear-autofill"
                title="Clear auto-filled values and enter manually"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      <div className="prevweek-info-banner">
        <span className="info-icon">✨</span>
        <p>
          Enter SLA rates from 0 to 100 with up to two decimal places. Leave missing values blank. Overall SLA rates are based on all tickets.
        </p>
      </div>

      <div className="prevweek-table-wrapper aging-previous-week-table-wrapper">
        <table className="prevweek-table">
          <thead>
            <tr>
              <th className="col-team">Technician Name</th>
              <th className="col-sla">Total Aging IRs (Last Week)</th>
              <th className="col-sla">First Response SLA (%) — Last Week</th>
              <th className="col-sla">Resolution SLA (%) — Last Week</th>
            </tr>
          </thead>
          <tbody>
            {REPORT_TEAMS.map((team) => (
              <tr key={team}>
                <td className="cell-team-name">{team}</td>
                <td>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="sla-input"
                    placeholder="-"
                    value={formatValue(values.teamTotals[team])}
                    aria-label={`${team} last week aging IRs`}
                    onChange={(e) => handleCountChange(team, e.target.value)}
                  />
                </td>
                {(['firstResponse', 'resolutionTime'] as const).map((section) => (
                  <td key={section}>
                    <SlaPercentageInput
                      label={`${team} last week ${section === 'firstResponse' ? 'First Response' : 'Resolution'} SLA`}
                      value={values.sla?.[section][team]}
                      onValueChange={(value) => handleSLAChange(section, team, value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
            <tr className="row-total">
              <td className="cell-team-name"><strong>Total</strong></td>
              <td>
                <input
                  type="text"
                  inputMode="numeric"
                  className="sla-input sla-input-total"
                  placeholder="-"
                  value={formatValue(values.grandTotal)}
                  aria-label="Overall last week aging IRs"
                  onChange={(e) => handleCountChange(null, e.target.value)}
                />
              </td>
              {(['firstResponseTotal', 'resolutionTimeTotal'] as const).map((section) => (
                <td key={section}>
                  <SlaPercentageInput
                    total
                    label={`Overall last week ${section === 'firstResponseTotal' ? 'First Response' : 'Resolution'} SLA`}
                    value={values.sla?.[section]}
                    onValueChange={(value) => handleSLAChange(section, null, value)}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="prevweek-actions">
        <button className="btn btn-secondary" onClick={onBack}>
          ← Back
        </button>
        <button className="btn btn-primary" onClick={onProceed} disabled={busy || isLoading || !!loadError}>
          {busy ? 'Loading saved SLA…' : 'Generate Report →'}
        </button>
      </div>
    </div>
  );
}
