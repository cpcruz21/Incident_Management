'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { PreviousWeekSLA } from '@/types/sla';
import { REPORT_TEAMS } from '@/lib/routing/routing-engine';
import { SlaPercentageInput } from './SlaPercentageInput';
import {
  getStoredReports,
  extractWeeklySLAFromStored,
  type StoredReport,
} from '@/lib/storage/report-storage';

interface PreviousWeekInputProps {
  initialValues: PreviousWeekSLA;
  autoFill?: boolean;
  onSave: (values: PreviousWeekSLA) => void;
  onBack: () => void;
  onProceed: () => void;
}

export function PreviousWeekInput({ initialValues, autoFill = true, onSave, onBack, onProceed }: PreviousWeekInputProps) {
  const [values, setValues] = useState<PreviousWeekSLA>(initialValues);
  const [storedReports, setStoredReports] = useState<StoredReport[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const didAutoFill = useRef(false);

  const calculateTotal = (teamValues: Record<string, number | null>): number | null => {
    const validValues = Object.values(teamValues).filter(
      (v): v is number => v !== null && v !== undefined && !isNaN(v)
    );
    if (validValues.length === 0) return null;
    const sum = validValues.reduce((acc, curr) => acc + curr, 0);
    return Math.round((sum / validValues.length) * 100) / 100;
  };

  useEffect(() => {
    let active = true;
    getStoredReports()
      .then((reports) => { if (active) setStoredReports(reports.filter((report) => report.type === 'weekly')); })
      .catch((error) => console.warn('Could not load weekly archive:', error));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const hasExisting = [...Object.values(initialValues.firstResponse), ...Object.values(initialValues.resolutionTime)]
      .some((value) => value != null);
    if (autoFill && !didAutoFill.current && !hasExisting && storedReports.length > 0) {
      didAutoFill.current = true;
      const latest = storedReports[0];
      const extracted = extractWeeklySLAFromStored(latest);
      setValues(extracted);
      onSave(extracted);
      setSelectedReportId(latest.id);
    } else {
      const frTotal = initialValues.firstResponseTotal ?? calculateTotal(initialValues.firstResponse);
      const rtTotal = initialValues.resolutionTimeTotal ?? calculateTotal(initialValues.resolutionTime);
      setValues({
        ...initialValues,
        firstResponseTotal: frTotal,
        resolutionTimeTotal: rtTotal,
      });
    }
  }, [initialValues, autoFill, storedReports]);

  const handleSelectStoredReport = (reportId: string) => {
    if (!reportId) {
      setSelectedReportId(null);
      return;
    }
    const found = storedReports.find((r) => r.id === reportId);
    if (found) {
      const extracted = extractWeeklySLAFromStored(found);
      setValues(extracted);
      onSave(extracted);
      setSelectedReportId(reportId);
    }
  };

  const handleClearAutofill = () => {
    setSelectedReportId(null);
    const emptyFirst: Record<string, number | null> = {};
    const emptyRes: Record<string, number | null> = {};
    for (const t of REPORT_TEAMS) {
      emptyFirst[t] = null;
      emptyRes[t] = null;
    }
    const empty: PreviousWeekSLA = {
      firstResponse: emptyFirst,
      resolutionTime: emptyRes,
      firstResponseTotal: null,
      resolutionTimeTotal: null,
    };
    setValues(empty);
    onSave(empty);
  };

  const handleChange = (
    section: 'firstResponse' | 'resolutionTime',
    team: string,
    value: number | null
  ) => {
    const newSectionValues = { ...values[section], [team]: value };
    const totalKey = section === 'firstResponse' ? 'firstResponseTotal' : 'resolutionTimeTotal';
    const autoTotal = calculateTotal(newSectionValues);

    const newValues: PreviousWeekSLA = {
      ...values,
      [section]: newSectionValues,
      [totalKey]: autoTotal,
    };

    setValues(newValues);
    onSave(newValues);
  };

  const handleTotalChange = (
    section: 'firstResponseTotal' | 'resolutionTimeTotal',
    value: number | null
  ) => {
    const newValues = { ...values, [section]: value };
    setValues(newValues);
    onSave(newValues);
  };

  return (
    <div className="prevweek-container">
      <div className="prevweek-header">
        <h2>Previous Week SLA Values</h2>
        <p className="prevweek-description">
          Please enter the SLA pass rates from the previous week's report.
          The Total pass rate is automatically calculated based on the input data per team.
        </p>
      </div>

      {storedReports.length > 0 && (
        <div className="prevweek-autofill-banner">
          <div className="prevweek-autofill-left">
            <span className="prevweek-autofill-icon">💡</span>
            <div>
              <div className="prevweek-autofill-title">
                {selectedReportId ? 'Auto-filled from Stored Report' : 'Auto-fill from Stored Reports'}
              </div>
              <div className="prevweek-autofill-sub">
                {selectedReportId ? (
                  <>
                    Loaded previous week SLA rates from{' '}
                    <strong>
                      {storedReports.find((r) => r.id === selectedReportId)?.period ||
                        storedReports.find((r) => r.id === selectedReportId)?.title}
                    </strong>
                    . You can freely adjust any values below.
                  </>
                ) : (
                  'Select a previous weekly report from Stored Reports Archive to automatically pull last week pass rates.'
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
              <option value="">-- Manual Entry / Pick Weekly Stored Report --</option>
              {storedReports.map((r) => (
                <option key={r.id} value={r.id}>
                  [Weekly SLA] {r.period || r.title} ({r.savedAtFormatted})
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
        <span className="info-icon">📊</span>
        <p>
          Enter percentages from 0 to 100 with up to two decimal places. Leave missing values blank. The total updates when you change a team percentage.
        </p>
      </div>

      <div className="prevweek-table-wrapper">
        <table className="prevweek-table">
          <thead>
            <tr>
              <th className="col-team">Final Team</th>
              <th className="col-sla" colSpan={1}>First Response (%)</th>
              <th className="col-sla" colSpan={1}>Resolution Time (%)</th>
            </tr>
          </thead>
          <tbody>
            {REPORT_TEAMS.map((team) => (
              <tr key={team}>
                <td className="cell-team-name">{team}</td>
                <td>
                  <SlaPercentageInput
                    label={team + ' last week First Response SLA'}
                    value={values.firstResponse[team]}
                    onValueChange={(value) => handleChange('firstResponse', team, value)}
                  />
                </td>
                <td>
                  <SlaPercentageInput
                    label={team + ' last week Resolution SLA'}
                    value={values.resolutionTime[team]}
                    onValueChange={(value) => handleChange('resolutionTime', team, value)}
                  />
                </td>
              </tr>
            ))}
            <tr className="row-total">
              <td className="cell-team-name"><strong>Total</strong></td>
              <td>
                <SlaPercentageInput
                  total
                  label="Overall last week First Response SLA"
                  value={values.firstResponseTotal}
                  onValueChange={(value) => handleTotalChange('firstResponseTotal', value)}
                />
              </td>
              <td>
                <SlaPercentageInput
                  total
                  label="Overall last week Resolution SLA"
                  value={values.resolutionTimeTotal}
                  onValueChange={(value) => handleTotalChange('resolutionTimeTotal', value)}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="prevweek-actions">
        <button className="btn btn-secondary" onClick={onBack}>
          ← Back
        </button>
        <button className="btn btn-primary" onClick={onProceed}>
          Generate Report →
        </button>
      </div>
    </div>
  );
}
