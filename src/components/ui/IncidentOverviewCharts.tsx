'use client';

import { useId } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { TimeSeriesPoint } from '@/types/ir-analytics';
import { AnalyticsClearButton } from './AnalyticsClearButton';
import './incident-overview-charts.css';

export interface IncidentStatusCount {
  label: string | null;
  count: number;
}

export function IncidentOverviewCharts({
  trend, statuses, unavailable = false, compact = false, selectedMonth, onMonthSelect, onStatusSelect, onClearTrend, onClearStatus,
}: {
  trend?: TimeSeriesPoint[];
  statuses?: IncidentStatusCount[];
  unavailable?: boolean;
  compact?: boolean;
  selectedMonth?: string;
  onMonthSelect?: (label: string) => void;
  onStatusSelect?: (label: string) => void;
  onClearTrend?: () => void;
  onClearStatus?: () => void;
}) {
  const heading = useId();

  return (
    <div className="incident-overview" data-compact={compact || undefined}>
      <div className="incident-overview-grid">
        <section className="incident-activity" aria-labelledby={heading}>
          <div className="analytics-panel-heading">
            <h2 id={heading} tabIndex={-1}>Incident volume over time</h2>
            <AnalyticsClearButton onClear={onClearTrend} />
          </div>
          {trend ? <IncidentTrend trend={trend} compact={compact} selectedMonth={selectedMonth} onSelect={onMonthSelect} /> : (
            <p className="incident-trend-empty" role="status">{unavailable ? 'Incident volume is unavailable.' : 'Loading incident activity…'}</p>
          )}
        </section>
        <StatusBreakdown data={statuses} unavailable={unavailable} onSelect={onStatusSelect} onClear={onClearStatus} />
      </div>
    </div>
  );
}

const primaryStatusColors = new Map([
  ['open', 'var(--status-open)'],
  ['closed', 'var(--status-closed)'],
  ['pending', 'var(--status-pending)'],
  ['pending review', 'var(--status-pending-review)'],
  ['on hold', 'var(--status-on-hold)'],
  ['awaiting problem', 'var(--status-awaiting)'],
  ['resolved', 'var(--status-resolved)'],
]);
const primaryStatuses = Array.from(primaryStatusColors.keys());
const extraStatusColors = ['var(--ui-violet)', 'var(--ui-orange)', '#408587', '#c76481', '#719336'];
const donutWidth = 280;
const donutHeight = 230;
const donutRadius = 76;
const donutLeaderRadius = donutRadius + 7;
const donutCalloutWidth = 17.5;
const donutHoleRatio = .68;

function StatusBreakdown({ data, unavailable, onSelect, onClear }: {
  data?: IncidentStatusCount[];
  unavailable: boolean;
  onSelect?: (label: string) => void;
  onClear?: () => void;
}) {
  const heading = useId();
  const order = (label: string | null) => {
    if (label === null) return primaryStatuses.length + 1;
    const index = primaryStatuses.indexOf(label.toLowerCase());
    return index < 0 ? primaryStatuses.length : index;
  };
  const statuses = [...(data ?? [])].sort((a, b) =>
    order(a.label) - order(b.label) || b.count - a.count || (a.label ?? '').localeCompare(b.label ?? ''));
  const total = statuses.reduce((sum, { count }) => sum + count, 0);
  let offset = 0;
  let extraIndex = 0;
  const slices = statuses.map(({ label, count }) => {
    const key = label?.toLowerCase() ?? '';
    const color = label === null ? 'var(--status-missing)' :
      primaryStatusColors.get(key) ?? extraStatusColors[extraIndex++ % extraStatusColors.length];
    const share = count / total * 100;
    const start = offset;
    offset += share;
    const angle = (start + offset) * Math.PI / 100;
    const horizontal = Math.sin(angle);
    const vertical = -Math.cos(angle);
    return {
      key, name: label ?? 'No status', count, start, share, color, fill: `${color} ${start}% ${offset}%`,
      x: donutWidth / 2 + horizontal * donutRadius,
      y: donutHeight / 2 + vertical * donutRadius,
      elbowX: donutWidth / 2 + horizontal * donutLeaderRadius,
      elbowY: donutHeight / 2 + vertical * donutLeaderRadius,
    };
  });
  const StatusRow = onSelect ? 'button' : 'div';
  const callouts = ['left', 'right'].flatMap((side) => {
    const isRight = side === 'right';
    // Keep labels from colliding on narrow cards. Every category remains visible in the list.
    const points = slices.filter((slice) => (slice.x >= donutWidth / 2) === isRight)
      .sort((a, b) => b.count - a.count).slice(0, 4).sort((a, b) => a.y - b.y);
    const spacing = 46;
    let previousY = 24 - spacing;
    return points.map((point, index) => {
      const remaining = points.length - 1 - index;
      const target = donutHeight / 2 + (point.y - donutHeight / 2) * 1.45;
      const y = Math.min(donutHeight - 24 - remaining * spacing, Math.max(previousY + spacing, target));
      previousY = y;
      const inset = donutWidth * donutCalloutWidth / 100 + 2;
      return { ...point, side, labelY: y, endX: isRight ? donutWidth - inset : inset };
    });
  });

  return (
    <section className="incident-breakdown" aria-labelledby={heading}>
      <div className="analytics-panel-heading">
        <h2 id={heading} tabIndex={-1}>Status breakdown</h2>
        <AnalyticsClearButton onClear={onClear} />
      </div>
      <div className="incident-breakdown-layout">
        <div className="incident-donut-chart" style={{ aspectRatio: `${donutWidth} / ${donutHeight}` }}>
          <div className="incident-status-donut" style={{
            width: `${donutRadius * 2 / donutWidth * 100}%`,
            backgroundColor: slices.length === 1 ? slices[0].color : undefined,
            backgroundImage: slices.length > 1 ? `conic-gradient(${slices.map((slice) => slice.fill).join(', ')})` : undefined,
          }}>
            <div style={{ width: `${donutHoleRatio * 100}%` }}><strong>{data ? total.toLocaleString() : '\u2014'}</strong><span>Total</span></div>
          </div>
          <svg viewBox={`0 0 ${donutWidth} ${donutHeight}`} aria-hidden="true">
            {callouts.map(({ key, x, y, elbowX, elbowY, side, labelY, endX }) => {
              const direction = side === 'right' ? 1 : -1;
              const railX = donutWidth / 2 + direction * donutLeaderRadius;
              // Fan out from parallel rails beyond the ring so leaders keep their order.
              return <polyline key={key} points={`${x},${y} ${elbowX},${elbowY} ${railX},${elbowY} ${endX - direction * 3},${labelY} ${endX},${labelY}`} vectorEffect="non-scaling-stroke" />;
            })}
            {onSelect && slices.map(({ key, name, start, share }) => (
              <circle key={key} className="incident-donut-target" cx={donutWidth / 2} cy={donutHeight / 2}
                r={donutRadius * (1 + donutHoleRatio) / 2} strokeWidth={donutRadius * (1 - donutHoleRatio)}
                pathLength={100} strokeDasharray={`${share} 100`} strokeDashoffset={-start}
                transform={`rotate(-90 ${donutWidth / 2} ${donutHeight / 2})`}
                onClick={() => onSelect(name)} />
            ))}
          </svg>
          {callouts.map(({ key, name, count, side, labelY }) => (
            <div className="incident-donut-callout" key={key} data-side={side}
              style={{
                top: `${labelY / donutHeight * 100}%`,
                width: `${donutCalloutWidth}%`,
                [side === 'left' ? 'right' : 'left']: `${100 - donutCalloutWidth}%`,
              }} aria-hidden="true" title={name}>
              <strong>{count.toLocaleString()}</strong><span>{name}</span>
            </div>
          ))}
        </div>
        {slices.length > 0 ? (
          <ul className="incident-statuses">
            {slices.map(({ key, name, count, share, color }) => (
              <li key={key} data-status={key}>
                <StatusRow className="incident-status-row" type={onSelect ? 'button' : undefined} onClick={onSelect ? () => onSelect(name) : undefined}>
                  <span>{name}</span><strong>{count.toLocaleString()}</strong>
                  <span className="incident-status-track" aria-hidden="true">
                    <span style={{ width: `${share}%`, backgroundColor: color }} />
                  </span>
                </StatusRow>
              </li>
            ))}
          </ul>
        ) : <p className="incident-status-empty">{data ? 'No imported tickets.' : unavailable ? 'Status data is unavailable.' : 'Loading ticket statuses…'}</p>}
      </div>
    </section>
  );
}

function IncidentTrend({ trend, compact, selectedMonth, onSelect }: {
  trend: TimeSeriesPoint[];
  compact: boolean;
  selectedMonth?: string;
  onSelect?: (label: string) => void;
}) {
  const fill = useId();
  if (!trend.length) return <p className="incident-trend-empty">No dated incidents to chart.</p>;
  const latest = trend[trend.length - 1];
  const previous = trend[trend.length - 2];
  const change = latest.value - (previous?.value ?? latest.value);
  const Direction = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
  const peak = trend.reduce((highest, entry) => entry.value >= highest.value ? entry : highest);
  const maximum = Math.max(4, peak.value);
  const magnitude = 10 ** Math.floor(Math.log10(maximum / 4));
  const step = ([1, 2, 5].find((value) => value * magnitude * 4 >= maximum) ?? 10) * magnitude;
  const ticks = [4, 3, 2, 1, 0].map((index) => step * index);
  const width = 600;
  const height = 200;
  const points = trend.map((entry, index) => ({
    ...entry,
    x: (index + 0.5) / trend.length * width,
    y: (1 - entry.value / ticks[0]) * height,
  }));
  const line = points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const middle = (previous.x + point.x) / 2;
    return `${path} C ${middle} ${previous.y} ${middle} ${point.y} ${point.x} ${point.y}`;
  }, '');
  const area = `${line} L ${points[points.length - 1].x} ${height} H ${points[0].x} Z`;
  return (
    <>
      <dl className="incident-trend-scoreboard">
        {previous && (
          <div>
            <dt>Month over month</dt>
            <dd data-direction={change < 0 ? 'down' : undefined}><Direction size={17} aria-hidden="true" />{change === 0 ? 'No change' : `${change > 0 ? 'Up' : 'Down'} ${Math.abs(change).toLocaleString()}`}</dd>
            <dd>{compact ? `(${latest.label} vs ${previous.label})` : (
              <>{latest.label} ({latest.value.toLocaleString()}) vs {previous.label} ({previous.value.toLocaleString()})</>
            )}</dd>
          </div>
        )}
        <div>
          <dt>Peak in chart</dt>
          <dd>{peak.value.toLocaleString()} {peak.value === 1 ? 'ticket' : 'tickets'}</dd>
          <dd>{compact ? `(${peak.label})` : peak.label}</dd>
        </div>
      </dl>
      <figure className="incident-trend" aria-label="Monthly incident counts">
        <div className="incident-trend-axis" aria-hidden="true">
          {ticks.map((tick) => <span key={tick}>{tick.toLocaleString()}</span>)}
        </div>
        <div className="incident-trend-plot">
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id={fill} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity=".82" />
                <stop offset="100%" stopColor="currentColor" stopOpacity=".06" />
              </linearGradient>
            </defs>
            {ticks.map((tick, index) => (
              <line key={tick} x1="0" x2={width} y1={index * height / 4} y2={index * height / 4} vectorEffect="non-scaling-stroke" />
            ))}
            {points.map(({ label, x }) => <line key={label} x1={x} x2={x} y1="0" y2={height} vectorEffect="non-scaling-stroke" />)}
            <path d={area} fill={`url(#${fill})`} />
            <path d={line} className="incident-trend-line" vectorEffect="non-scaling-stroke" />
          </svg>
          {points.map(({ label, value, x, y }) => (
            <button key={label} className="incident-trend-point" type="button"
              style={{ left: `${x / width * 100}%`, top: `${y / height * 100}%` }}
              data-high={y < height / 4}
              aria-pressed={onSelect ? selectedMonth === label : undefined}
              aria-label={`${label}, ${value.toLocaleString()} ${value === 1 ? 'incident' : 'incidents'}`}
              onClick={(event) => onSelect ? onSelect(label) : event.currentTarget.focus()}>
              <span aria-hidden="true">{label} · {value.toLocaleString()}</span>
            </button>
          ))}
        </div>
        <div className="incident-trend-months" aria-hidden="true">
          {trend.map(({ label }) => <span key={label}>{label}</span>)}
        </div>
      </figure>
    </>
  );
}
