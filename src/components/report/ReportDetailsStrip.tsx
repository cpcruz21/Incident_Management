import type { ReactNode } from 'react';
import { CalendarCheck, CalendarDays, ListChecks } from 'lucide-react';

export function ReportDetailsStrip({ from, to, totalRecords, children }: {
  from?: string;
  to?: string;
  totalRecords: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="report-details-strip">
      <dl className="report-details" aria-label="Report details">
        <div>
          <dt><CalendarDays size={14} aria-hidden="true" />From:</dt>
          <dd>{from || '—'}</dd>
        </div>
        <div>
          <dt><CalendarCheck size={14} aria-hidden="true" />To:</dt>
          <dd>{to || '—'}</dd>
        </div>
        <div className="report-details-records">
          <dt><ListChecks size={14} aria-hidden="true" />Total records</dt>
          <dd>{totalRecords}</dd>
        </div>
      </dl>
      {children}
    </div>
  );
}
