'use client';

import { ArrowLeft, FileSpreadsheet, RotateCcw } from 'lucide-react';

interface ReportWorkflowHeaderProps {
  title: string;
  fileName: string | null;
  onBack: () => void;
  onReset: () => void;
  busy?: boolean;
}

export function ReportWorkflowHeader({ title, fileName, onBack, onReset, busy }: ReportWorkflowHeaderProps) {
  return (
    <header className="report-workflow-header">
      <div className="report-workflow-heading">
        <button className="admin-secondary report-workflow-back" type="button" aria-label="Back to dashboard"
          title="Back to dashboard" onClick={onBack}>
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <h1>{title}</h1>
      </div>
      {fileName && (
        <div className="report-source-file">
          <span title={fileName}><FileSpreadsheet size={17} aria-hidden="true" /><span>{fileName}</span></span>
          <button className="admin-secondary" type="button" onClick={onReset} disabled={busy}>
            <RotateCcw size={15} aria-hidden="true" /> Reset
          </button>
        </div>
      )}
    </header>
  );
}
