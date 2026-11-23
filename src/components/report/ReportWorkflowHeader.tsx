'use client';

import { FileSpreadsheet, RotateCcw } from 'lucide-react';
import type { ReactNode, Ref } from 'react';

interface ReportWorkflowHeaderProps {
  title: string;
  headingRef?: Ref<HTMLHeadingElement>;
  fileName?: string | null;
  onReset?: () => void;
  busy?: boolean;
  children?: ReactNode;
}

export function ReportWorkflowHeader({ title, headingRef, fileName, onReset, busy, children }: ReportWorkflowHeaderProps) {
  return (
    <header className="report-workflow-header">
      <h1 className="report-workflow-heading" ref={headingRef} tabIndex={headingRef ? -1 : undefined}>{title}</h1>
      {fileName && (
        <div className="report-source-file">
          <span title={fileName}><FileSpreadsheet size={17} aria-hidden="true" /><span>{fileName}</span></span>
          {onReset && (
            <button className="admin-secondary" type="button" onClick={onReset} disabled={busy}>
              <RotateCcw size={15} aria-hidden="true" /> Reset
            </button>
          )}
        </div>
      )}
      {children}
    </header>
  );
}
