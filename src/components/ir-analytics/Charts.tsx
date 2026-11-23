'use client';


import React, { useEffect, useId, useRef, useState } from 'react';
import type { DistributionBar, AgingDistributionRow } from '@/types/ir-analytics';
import { AnalyticsClearButton } from '@/components/ui/AnalyticsClearButton';


export const CHART_COLORS = [
  '#1d4ed8', '#6d28d9', '#08764c', '#995900', '#b91c1c',
  '#03698b', '#9e2072', '#475569', '#a34213', '#3e701f',
  '#006e68', '#4d55ad', '#6b4f34', '#831843', '#356079',
];

const AGING_COLORS: Record<string, string> = {
  '0–2 days': '#475569',
  '3–6 days': '#1d4ed8',
  '7–13 days': '#995900',
  '14–29 days': '#874719',
  '30+ days': '#b91c1c',
  'Resolved': '#475569',
};


export function analyticsChartColor(color: string) {
  return `color-mix(in srgb, ${color} var(--analytics-series-strength, 100%), #e5f2ff)`;
}
const HOVER_FILTER = 'brightness(var(--analytics-hover-brightness, .8))';

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function countTicks(max: number): number[] {
  return Array.from(new Set([0, 1, 2, 3, 4].map(step => Math.round((step * max) / 4))));
}

function activateChartPoint(event: React.KeyboardEvent<SVGElement>, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
}

function ChartPanel({ title, children, onClear }: { title: string; children: React.ReactNode; onClear?: () => void }) {
  return (
    <section className="analytics-chart-card" aria-label={title}>
      <div className="analytics-panel-heading">
        <h3 className="analytics-chart-heading" tabIndex={-1}>{title}</h3>
        <AnalyticsClearButton onClear={onClear} />
      </div>
      {children}
    </section>
  );
}


interface BarChartProps {
  data: DistributionBar[] | AgingDistributionRow[];
  title: string;
  colorMap?: Record<string, string>;
  onBarClick?: (ids: string[], label: string) => void;
  selectedLabel?: string;
  onClear?: () => void;
  height?: number;
  horizontal?: boolean;
  cylindrical?: boolean;
  maxBars?: number;
  barHeight?: number;
}

export function BarChart({
  data,
  title,
  colorMap,
  onBarClick,
  selectedLabel,
  onClear,
  height = 210,
  horizontal = false,
  cylindrical = false,
  maxBars = 6,
  barHeight,
}: BarChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [plotWidth, setPlotWidth] = useState(380);
  const plot = useRef<HTMLDivElement>(null);
  const gradient = useId();

  const displayData = data.slice(0, maxBars);
  const hasBars = displayData.length > 0;
  useEffect(() => {
    if (!plot.current || horizontal || !hasBars) return;
    const observer = new ResizeObserver(([entry]) => {
      setPlotWidth(Math.max(240, Math.round(entry.contentRect.width)));
    });
    observer.observe(plot.current);
    return () => observer.disconnect();
  }, [horizontal, hasBars]);

  if (!hasBars) {
    return (
      <ChartPanel title={title} onClear={onClear}>
        <p className="analytics-chart-empty">No matching incidents to chart.</p>
      </ChartPanel>
    );
  }

  const maxVal = Math.max(...displayData.map((d) => d.value), 1);

  if (horizontal) {
    const bHeight = barHeight ?? 22;
    const gap = 8;
    const labelW = 120;
    const chartW = 200;
    const totalH = displayData.length * (bHeight + gap) + 16;

    return (
      <ChartPanel title={title} onClear={onClear}>
        <div className="analytics-chart-plot">
          <svg width="100%" viewBox={`0 0 ${labelW + chartW + 45} ${totalH}`} style={{ minWidth: '240px' }}
            role={onBarClick ? 'group' : 'img'} aria-label={onBarClick ? title : displayData.map(d => d.label + ': ' + d.value).join(', ')}>
            {displayData.map((d, i) => {
              const y = i * (bHeight + gap) + 4;
              const barW = Math.max(4, (d.value / maxVal) * chartW);
              const color = analyticsChartColor(colorMap?.[d.label] ?? CHART_COLORS[i % CHART_COLORS.length]);
              const isSelected = d.label === selectedLabel;
              const isHov = hoveredIdx === i || isSelected;
              return (
                <g
                  key={d.label}
                  className="analytics-chart-point"
                  role={onBarClick ? 'button' : undefined} tabIndex={onBarClick ? 0 : undefined}
                  aria-pressed={onBarClick && selectedLabel !== undefined ? isSelected : undefined}
                  aria-label={onBarClick ? `${d.label}: ${d.value}` : undefined}
                  style={{ cursor: onBarClick ? 'pointer' : 'default' }}
                  onClick={() => onBarClick?.(('ids' in d ? d.ids : []) ?? [], d.label)}
                  onKeyDown={onBarClick ? event => activateChartPoint(event, () => onBarClick(('ids' in d ? d.ids : []) ?? [], d.label)) : undefined}
                  onFocus={() => setHoveredIdx(i)} onBlur={() => setHoveredIdx(null)}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  <title>{`${d.label}: ${d.value}`}</title>
                  <text
                    x={labelW - 8}
                    y={y + bHeight / 2 + 4}
                    textAnchor="end"
                    fill={isHov ? 'var(--ui-link, #38bdf8)' : 'var(--ui-secondary, #cbd5e1)'}
                    fontSize="10.5"
                    fontWeight={isHov ? '800' : '600'}
                  >
                    {truncate(d.label, 14)}
                  </text>
                  <rect
                    x={labelW}
                    y={y}
                    width={chartW}
                    height={bHeight}
                    rx="4"
                    fill="var(--ui-inset, rgba(15,23,42,0.8))"
                  />
                  <rect
                    x={labelW}
                    y={y}
                    width={barW}
                    height={bHeight}
                    rx="4"
                    fill={color}
                    filter={isHov ? HOVER_FILTER : undefined}
                  />
                  <text
                    x={labelW + barW + 6}
                    y={y + bHeight / 2 + 4}
                    fill={isHov ? 'var(--ui-text, #ffffff)' : 'var(--ui-text, #f8fafc)'}
                    fontSize="11"
                    fontWeight="800"
                  >
                    {d.value}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </ChartPanel>
    );
  }

  const svgW = plotWidth;
  const svgH = height;
  const padL = 30;
  const padR = 12;
  const padT = 15;
  const padB = 44;
  const chartW = svgW - padL - padR;
  const chartH = svgH - padT - padB;
  const slotWidth = chartW / displayData.length;
  const barW = cylindrical ? Math.min(46, slotWidth * .48) : Math.min(60, Math.max(16, slotWidth * .54));
  const angleLabels = slotWidth < 87;
  const labelLength = angleLabels ? 11 : Math.floor(slotWidth / 5.8);

  return (
    <ChartPanel title={title} onClear={onClear}>
      <div className="analytics-chart-plot" ref={plot}>
        <svg width="100%" height={height} viewBox={`0 0 ${svgW} ${svgH}`} style={{ minWidth: '240px' }}
          role={onBarClick ? 'group' : 'img'} aria-label={onBarClick ? title : displayData.map(d => d.label + ': ' + d.value).join(', ')}>
          {countTicks(maxVal).map((val) => {
            const y = padT + chartH * (1 - val / maxVal);
            return (
              <g key={val}>
                <line x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="var(--ui-grid, rgba(255,255,255,0.06))" strokeWidth="1" strokeDasharray="3 3" />
                <text x={padL - 6} y={y + 3.5} textAnchor="end" fill="var(--ui-muted, #64748b)" fontSize="9.5" fontWeight="600">{val}</text>
              </g>
            );
          })}
          {displayData.map((d, i) => {
            const x = padL + (i + .5) * slotWidth - barW / 2;
            const barHeight = d.value > 0 ? Math.max(2, d.value / maxVal * chartH) : 0;
            const y = padT + chartH - barHeight;
            const cap = Math.min(4, barHeight / 2);
            const base = padT + chartH - cap;
            const color = analyticsChartColor(colorMap?.[d.label] ?? CHART_COLORS[i % CHART_COLORS.length]);
            const light = `color-mix(in srgb, ${color} 72%, white)`;
            const fill = `url(#${gradient}-${i})`;
            const isSelected = d.label === selectedLabel;
            const isHov = hoveredIdx === i || isSelected;
            return (
              <g
                key={d.label}
                className="analytics-chart-point"
                role={onBarClick ? 'button' : undefined} tabIndex={onBarClick ? 0 : undefined}
                aria-pressed={onBarClick && cylindrical ? isSelected : undefined}
                aria-label={onBarClick ? `${d.label}: ${d.value}` : undefined}
                style={{ cursor: onBarClick ? 'pointer' : 'default' }}
                onClick={() => onBarClick?.(('ids' in d ? d.ids : []) ?? [], d.label)}
                onKeyDown={onBarClick ? event => activateChartPoint(event, () => onBarClick(('ids' in d ? d.ids : []) ?? [], d.label)) : undefined}
                onFocus={() => setHoveredIdx(i)} onBlur={() => setHoveredIdx(null)}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <title>{`${d.label}: ${d.value}`}</title>
                <defs>
                  <linearGradient id={`${gradient}-${i}`} x2={cylindrical ? '1' : '0'} y2={cylindrical ? '0' : '1'}>
                    <stop offset="0%" stopColor={cylindrical ? color : light} />
                    {cylindrical && <stop offset="37%" stopColor={light} />}
                    <stop offset="100%" stopColor={cylindrical ? `color-mix(in srgb, ${color} 73%, #102033)` : color} />
                  </linearGradient>
                </defs>
                {cylindrical && barHeight > 0 ? (
                  <g className="analytics-cylinder" filter={isHov ? HOVER_FILTER : undefined}>
                    <path d={`M ${x} ${y + cap} H ${x + barW} V ${base} A ${barW / 2} ${cap} 0 0 1 ${x} ${base} Z`} fill={fill} />
                    <ellipse cx={x + barW / 2} cy={y + cap} rx={barW / 2} ry={cap} fill={light} />
                  </g>
                ) : <rect x={x} y={y} width={barW} height={barHeight} rx="4" fill={fill} filter={isHov ? HOVER_FILTER : undefined} />}
                <text
                  x={x + barW / 2}
                  y={y - 5}
                  textAnchor="middle"
                  fill={isHov ? 'var(--ui-text, #ffffff)' : 'var(--ui-text, #f8fafc)'}
                  fontSize={isHov ? '11.5' : '10.5'}
                  fontWeight="800"
                >
                  {d.value > 0 ? d.value : ''}
                </text>
                <text
                  x={x + barW / 2}
                  y={svgH - padB + 14}
                  textAnchor="middle"
                  fill={isHov ? 'var(--ui-link, #38bdf8)' : 'var(--ui-secondary, #94a3b8)'}
                  fontSize="10"
                  fontWeight={isHov || cylindrical ? '800' : '600'}
                  transform={angleLabels ? `rotate(-26, ${x + barW / 2}, ${svgH - padB + 14})` : undefined}
                >
                  {truncate(d.label, labelLength)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </ChartPanel>
  );
}


export { AGING_COLORS };

