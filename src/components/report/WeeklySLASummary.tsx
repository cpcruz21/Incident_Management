import { ArrowDownRight, ArrowUpRight, Minus, ShieldCheck, Zap } from 'lucide-react';
import type { Ref } from 'react';
import type { WeeklyReportData, TeamSLAResult } from '@/types/sla';

type Drilldown = (title: string, incidentIds: string[]) => void;

export function WeeklySLACount({ count, title, ids, onOpen, failed = false }: {
  count: number;
  title: string;
  ids?: string[];
  onOpen?: Drilldown;
  failed?: boolean;
}) {
  if (!count || !ids?.length || !onOpen) return <>{count}</>;

  return (
    <button type="button" className={`weekly-sla-count${failed ? ' is-failed' : ''}`} onClick={() => onOpen(title, ids)}
      aria-label={`${title}, ${count} incident${count === 1 ? '' : 's'}`}>
      {count}
    </button>
  );
}

function SLACard({ title, result, previous, resolution = false, onCellClick }: {
  title: string;
  result: TeamSLAResult;
  previous: number | null;
  resolution?: boolean;
  onCellClick?: Drilldown;
}) {
  const rate = result.slaPassRate;
  const difference = rate != null && previous != null ? Number((rate - previous).toFixed(2)) : null;
  const trend = difference == null || difference === 0 ? 'neutral' : difference > 0 ? 'up' : 'down';
  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus;
  const Icon = resolution ? ShieldCheck : Zap;
  const metric = resolution ? 'RT' : 'FR';

  return (
    <article className="weekly-sla-summary-card" aria-label={`${title} weekly summary`}>
      <div className="weekly-sla-summary-heading">
        <h3><span className={`weekly-sla-summary-icon${resolution ? ' is-resolution' : ''}`}><Icon size={18} aria-hidden="true" /></span>{title}</h3>
        <span className={`weekly-sla-trend is-${trend}`} title="Change in SLA pass rate in percentage points compared with last week">
          {difference == null ? 'No previous comparison' : (
            <>
              <TrendIcon size={14} aria-hidden="true" />
              <strong>{difference > 0 ? '+' : ''}{difference.toFixed(2)} pp</strong>{' '}
              <span>vs last week</span>
            </>
          )}
        </span>
      </div>
      <div className="weekly-sla-summary-body">
        <div><div className="weekly-sla-summary-rate">{rate != null ? `${rate.toFixed(2)}%` : 'N/A'}</div><p>Pass rate this week</p></div>
        <dl className="weekly-sla-summary-counts">
          <div><dt>Total</dt><dd><WeeklySLACount count={result.total} title={`${metric} Total`} ids={result.incidentIds} onOpen={onCellClick} /></dd></div>
          <div className="is-passed"><dt>Passed</dt><dd><WeeklySLACount count={result.passed} title={`${metric} Passed`} ids={result.passedIncidentIds} onOpen={onCellClick} /></dd></div>
          <div className="is-failed"><dt>Failed</dt><dd><WeeklySLACount count={result.failed} title={`${metric} Failed`} ids={result.failedIncidentIds} onOpen={onCellClick} failed /></dd></div>
        </dl>
      </div>
    </article>
  );
}

export function WeeklySLASummary({ data, summaryRef, onCellClick }: { data: WeeklyReportData; summaryRef?: Ref<HTMLElement>; onCellClick?: Drilldown }) {
  return (
    <section ref={summaryRef} className="weekly-sla-summary" aria-label="Weekly SLA summary">
      <SLACard title="First Response" result={data.currentWeek.firstResponseTotal} previous={data.previousWeek.firstResponseTotal} onCellClick={onCellClick} />
      <SLACard title="Resolution Time" result={data.currentWeek.resolutionTimeTotal} previous={data.previousWeek.resolutionTimeTotal} onCellClick={onCellClick} resolution />
    </section>
  );
}
