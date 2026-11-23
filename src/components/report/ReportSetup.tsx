'use client';

import { useId, type ReactNode } from 'react';
import { FileUpload } from '@/components/upload/FileUpload';

interface ReportSetupProps {
  children: ReactNode;
  hint?: ReactNode;
  isProcessing: boolean;
  onFileSelected: (file: File) => Promise<void>;
  disabledReason?: string;
}

export function ReportSetup({ children, hint, isProcessing, onFileSelected, disabledReason }: ReportSetupProps) {
  const headingId = useId();

  return (
    <section className="report-setup" aria-labelledby={headingId}>
      <div className="report-setup-heading">
        <h2 id={headingId}>Report setup</h2>
        {hint}
      </div>
      <div className="report-setup-fields">{children}</div>
      <FileUpload onFileSelected={onFileSelected} isProcessing={isProcessing} disabledReason={disabledReason} />
    </section>
  );
}

export function ReportPeriodField({ value, onChange }: {
  value: string;
  onChange: (period: string) => void;
}) {
  const id = useId();

  return (
    <div className="report-setup-field">
      <label htmlFor={id}>Report period <span>(optional)</span></label>
      <input id={id} type="text" placeholder="e.g., September 29 - October 5, 2026"
        value={value} onChange={event => onChange(event.target.value)} />
    </div>
  );
}
