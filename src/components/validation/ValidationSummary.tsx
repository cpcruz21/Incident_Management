'use client';
import React, { useState } from 'react';
import type { ValidationSummary as ValidationSummaryType } from '@/types/incident';

interface ValidationSummaryProps {
  summary: ValidationSummaryType;
  onProceed: () => void;
  onBack: () => void;
  reportPeriod?: string;
  onPeriodChange?: (period: string) => void;
  isMonthly?: boolean;
}

function generateMonthOptions(): { label: string; value: string }[] {
  const options: { label: string; value: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    options.push({ label, value: label });
  }
  return options;
}

export function ValidationSummaryView({
  summary,
  onProceed,
  onBack,
  reportPeriod = '',
  onPeriodChange,
  isMonthly,
}: ValidationSummaryProps) {
  const isMonthlyTicket = isMonthly !== undefined ? isMonthly : Boolean(onPeriodChange);
  const monthOptions = isMonthlyTicket ? generateMonthOptions() : [];
  return (
    <div className="validation-container">
      <div className="validation-header">
        <h2>Data Validation Results</h2>
      </div>

      {/* Stats Cards */}
      <div className="validation-stats">
        <div className="stat-card stat-total">
          <span className="stat-value">{summary.totalRecords}</span>
          <span className="stat-label">Total Records</span>
        </div>
        <div className="stat-card stat-valid">
          <span className="stat-value">{summary.validRecords}</span>
          <span className="stat-label">Valid</span>
        </div>
        <div className="stat-card stat-invalid">
          <span className="stat-value">{summary.invalidRecords}</span>
          <span className="stat-label">Invalid</span>
        </div>
      </div>

      {/* Detected Info */}
      <div className="validation-section">
        <h3>Detected Columns ({summary.detectedColumns.length})</h3>
        <div className="tag-list">
          {summary.detectedColumns.map((col) => (
            <span key={col} className="tag tag-column">{col}</span>
          ))}
        </div>
      </div>

      <div className="validation-section">
        <h3>Detected Source Teams ({summary.detectedSourceTeams.length})</h3>
        <div className="tag-list">
          {summary.detectedSourceTeams.map((team) => (
            <span key={team} className="tag tag-team">{team}</span>
          ))}
        </div>
      </div>

      <div className="validation-section">
        <h3>Detected Categories ({summary.detectedCategories.length})</h3>
        <div className="tag-list">
          {summary.detectedCategories.map((cat) => (
            <span key={cat} className="tag tag-category">{cat}</span>
          ))}
        </div>
      </div>

      {summary.detectedSubCategories && summary.detectedSubCategories.length > 0 && (
        <div className="validation-section">
          <h3>Detected Subcategories ({summary.detectedSubCategories.length})</h3>
          <div className="tag-list">
            {summary.detectedSubCategories.slice(0, 25).map((sub) => (
              <span key={sub} className="tag tag-category" style={{ opacity: 0.9 }}>
                {sub}
              </span>
            ))}
            {summary.detectedSubCategories.length > 25 && (
              <span className="tag tag-category">+{summary.detectedSubCategories.length - 25} more</span>
            )}
          </div>
        </div>
      )}

      {/* Errors */}
      {summary.errors.length > 0 && (
        <div className="validation-section">
          <h3 className="text-error">⚠️ Errors ({summary.errors.length})</h3>
          <div className="validation-issues">
            {summary.errors.slice(0, 20).map((err, i) => (
              <div key={i} className="issue-row issue-error">
                <span className="issue-id">{err.requestId}</span>
                <span className="issue-messages">{err.messages.join(', ')}</span>
              </div>
            ))}
            {summary.errors.length > 20 && (
              <p className="issue-more">...and {summary.errors.length - 20} more errors</p>
            )}
          </div>
        </div>
      )}

      {/* Warnings */}
      {summary.warnings.length > 0 && (
        <div className="validation-section">
          <h3 className="text-warning">⚡ Warnings ({summary.warnings.length})</h3>
          <div className="validation-issues">
            {summary.warnings.slice(0, 10).map((warn, i) => (
              <div key={i} className="issue-row issue-warning">
                <span className="issue-id">{warn.requestId}</span>
                <span className="issue-messages">{warn.messages.join(', ')}</span>
              </div>
            ))}
            {summary.warnings.length > 10 && (
              <p className="issue-more">...and {summary.warnings.length - 10} more warnings</p>
            )}
          </div>
        </div>
      )}

      {/* Storage Month Selector - Only for monthly tickets */}
      {isMonthlyTicket && (
        <div className="validation-section">
          <h3>Storage Month</h3>
          <select
            className="period-input"
            value={reportPeriod}
            onChange={(e) => onPeriodChange?.(e.target.value)}
            style={{ maxWidth: '280px' }}
          >
            <option value="">-- Select Month --</option>
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Actions */}
      <div className="validation-actions">
        <button className="btn btn-secondary" onClick={onBack}>
          ← Back
        </button>
        <button
          className="btn btn-primary"
          onClick={onProceed}
          disabled={summary.validRecords === 0 || (isMonthlyTicket && !reportPeriod)}
          title={isMonthlyTicket && !reportPeriod ? 'Select a storage month before proceeding' : undefined}
        >
          Proceed →
        </button>
      </div>
    </div>
  );
}
