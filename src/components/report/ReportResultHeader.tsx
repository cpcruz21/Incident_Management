import { useId, type ReactNode } from 'react';

export function ReportResultHeader({ title, icon, headingLevel = 1, className, periodLabel, periodControl, actions }: {
  title: string;
  icon: string;
  headingLevel?: 1 | 2;
  className?: string;
  periodLabel?: string;
  periodControl?: ReactNode;
  actions?: ReactNode;
}) {
  const id = useId();
  const Heading = headingLevel === 1 ? 'h1' : 'h2';

  return (
    <section className={`report-result-header no-export ${className ?? ''}`.trim()} aria-labelledby={id}>
      <div className="report-result-heading">
        <span className="report-result-icon" aria-hidden="true">{icon}</span>
        <div className="report-result-title">
          <Heading id={id}>{title}</Heading>
          {periodLabel && <span className="report-result-period">{periodLabel}</span>}
        </div>
      </div>
      {periodControl}
      {actions && <div className="report-result-actions" role="group" aria-label="Report actions">{actions}</div>}
    </section>
  );
}
