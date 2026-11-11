'use client';

/**
 * Simple SVG-based charts for the IR Analytics Dashboard.
 * No external chart library — uses inline SVG to match the existing project (no chart dependency installed).
 */

import React, { useState } from 'react';
import type { DistributionBar, TimeSeriesPoint, AgingDistributionRow } from '@/types/ir-analytics';

// ─── Color palettes ────────────────────────────────────────────────────────────

export const CHART_COLORS = [
  '#1d4ed8', '#6d28d9', '#08764c', '#995900', '#b91c1c',
  '#03698b', '#9e2072', '#475569', '#a34213', '#3e701f',
  '#006e68', '#4d55ad', '#6b4f34', '#831843', '#356079',
];

const STATUS_COLORS: Record<string, string> = {
  Open: '#1d4ed8',
  Pending: '#995900',
  'In-progress': '#a34213',
  'In Progress': '#a34213',
  'Work in Progress': '#a34213',
  'Awaiting Problem': '#9e2072',
  'On Hold': '#6d28d9',
  Resolved: '#3e701f',
  Closed: '#08764c',
  Cancelled: '#475569',
  Unknown: '#475569',
};

const AGING_COLORS: Record<string, string> = {
  '0–2 days': '#08764c',
  '3–6 days': '#3e701f',
  '7–13 days': '#995900',
  '14–29 days': '#a34213',
  '30+ days': '#b91c1c',
  'Resolved': '#475569',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function analyticsChartColor(color: string) {
  return `color-mix(in srgb, ${color} var(--analytics-series-strength, 100%), #e5f2ff)`;
}
const HOVER_FILTER = 'brightness(var(--analytics-hover-brightness, .8))';

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────

interface BarChartProps {
  data: DistributionBar[] | AgingDistributionRow[];
  title: string;
  colorMap?: Record<string, string>;
  onBarClick?: (ids: string[], label: string) => void;
  height?: number;
  horizontal?: boolean;
  maxBars?: number;
  barHeight?: number;
}

export function BarChart({
  data,
  title,
  colorMap,
  onBarClick,
  height = 210,
  horizontal = false,
  maxBars = 6,
  barHeight,
}: BarChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const displayData = data.slice(0, maxBars);
  if (!displayData.length) return <EmptyChart title={title} />;

  const maxVal = Math.max(...displayData.map((d) => d.value), 1);

  if (horizontal) {
    const bHeight = barHeight ?? 22;
    const gap = 8;
    const labelW = 120;
    const chartW = 200;
    const totalH = displayData.length * (bHeight + gap) + 16;

    return (
      <div className="analytics-chart-card" style={{ background: 'var(--ui-surface, #111c30)', borderRadius: '14px', padding: '16px 16px', boxShadow: '0 4px 20px var(--ui-shadow, rgba(0,0,0,0.25))', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <h3 style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ui-text)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
            {title}
          </h3>
        </div>
        <div style={{ overflowX: 'auto', flex: 1 }}>
          <svg width="100%" viewBox={`0 0 ${labelW + chartW + 45} ${totalH}`} style={{ minWidth: '240px' }}>
            {displayData.map((d, i) => {
              const y = i * (bHeight + gap) + 4;
              const barW = Math.max(4, (d.value / maxVal) * chartW);
              const color = analyticsChartColor(colorMap?.[d.label] ?? CHART_COLORS[i % CHART_COLORS.length]);
              const isHov = hoveredIdx === i;
              return (
                <g
                  key={d.label}
                  style={{ cursor: onBarClick ? 'pointer' : 'default' }}
                  onClick={() => onBarClick?.(('ids' in d ? d.ids : []) ?? [], d.label)}
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
      </div>
    );
  }

  // Vertical bar chart
  const svgW = 380;
  const svgH = height;
  const padL = 30;
  const padR = 12;
  const padT = 20;
  const padB = 54;
  const chartW = svgW - padL - padR;
  const chartH = svgH - padT - padB;
  const barW = Math.max(16, (chartW / displayData.length) * 0.54);
  const gap = (chartW / displayData.length) * 0.46;

  return (
    <div className="analytics-chart-card" style={{ background: 'var(--ui-surface, #111c30)', borderRadius: '14px', padding: '16px 16px', boxShadow: '0 4px 20px var(--ui-shadow, rgba(0,0,0,0.25))', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ui-text)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
          {title}
        </h3>
      </div>
      <div style={{ overflowX: 'auto', flex: 1 }}>
        <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} style={{ minWidth: '240px' }}>
          {/* Y axis lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const y = padT + chartH * (1 - frac);
            const val = Math.round(maxVal * frac);
            return (
              <g key={frac}>
                <line x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="var(--ui-grid, rgba(255,255,255,0.06))" strokeWidth="1" strokeDasharray="3 3" />
                <text x={padL - 6} y={y + 3.5} textAnchor="end" fill="var(--ui-muted, #64748b)" fontSize="9.5" fontWeight="600">{val}</text>
              </g>
            );
          })}
          {/* Bars */}
          {displayData.map((d, i) => {
            const x = padL + i * (barW + gap) + gap / 2;
            const barH2 = Math.max(3, (d.value / maxVal) * chartH);
            const y = padT + chartH - barH2;
            const color = analyticsChartColor(colorMap?.[d.label] ?? CHART_COLORS[i % CHART_COLORS.length]);
            const isHov = hoveredIdx === i;
            return (
              <g
                key={d.label}
                style={{ cursor: onBarClick ? 'pointer' : 'default' }}
                onClick={() => onBarClick?.(('ids' in d ? d.ids : []) ?? [], d.label)}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <title>{`${d.label}: ${d.value}`}</title>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={barH2}
                  rx="4"
                  fill={color}
                  filter={isHov ? HOVER_FILTER : undefined}
                />
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
                  fontWeight={isHov ? '800' : '600'}
                  transform={`rotate(-26, ${x + barW / 2}, ${svgH - padB + 14})`}
                >
                  {truncate(d.label, 11)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────

interface DonutChartProps {
  data: DistributionBar[];
  title: string;
  colorMap?: Record<string, string>;
  onSliceClick?: (ids: string[], label: string) => void;
}

export function DonutChart({ data, title, colorMap, onSliceClick }: DonutChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  if (!data.length) return <EmptyChart title={title} />;

  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <EmptyChart title={title} />;

  const cx = 55, cy = 55, r = 46, innerR = 29;
  let currentAngle = -Math.PI / 2;

  const slices = data.map((d, i) => {
    const angle = (d.value / total) * 2 * Math.PI;
    const startAngle = currentAngle;
    currentAngle += angle;
    const endAngle = currentAngle;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const ix1 = cx + innerR * Math.cos(startAngle);
    const iy1 = cy + innerR * Math.sin(startAngle);
    const ix2 = cx + innerR * Math.cos(endAngle);
    const iy2 = cy + innerR * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;

    const path = d.value === total ? [
      `M ${cx} ${cy - r}`,
      `A ${r} ${r} 0 1 1 ${cx} ${cy + r}`,
      `A ${r} ${r} 0 1 1 ${cx} ${cy - r}`,
      `M ${cx} ${cy - innerR}`,
      `A ${innerR} ${innerR} 0 1 0 ${cx} ${cy + innerR}`,
      `A ${innerR} ${innerR} 0 1 0 ${cx} ${cy - innerR}`,
      'Z',
    ].join(' ') : [
      `M ${x1} ${y1}`,
      `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${ix2} ${iy2}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1}`,
      'Z',
    ].join(' ');

    const color = analyticsChartColor(colorMap?.[d.label] ?? CHART_COLORS[i % CHART_COLORS.length]);

    return { path, color, d, i };
  });

  const hoveredSlice = hoveredIdx !== null ? slices[hoveredIdx] : null;

  return (
    <div className="analytics-chart-card" style={{ background: 'var(--ui-surface, #111c30)', borderRadius: '14px', padding: '16px 16px', boxShadow: '0 4px 20px var(--ui-shadow, rgba(0,0,0,0.25))', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ui-text)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
          {title}
        </h3>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
        <svg viewBox="0 0 110 110" style={{ width: '96px', height: '96px', flexShrink: 0 }}>
          {slices.map(({ path, color, d: sliceD, i }) => (
            <path
              key={sliceD.label}
              d={path}
              fill={color}
              filter={hoveredIdx === i ? HOVER_FILTER : undefined}
              stroke="var(--ui-surface)"
              strokeWidth="2"
              style={{ cursor: onSliceClick ? 'pointer' : 'default', transition: 'all 0.12s' }}
              onClick={() => onSliceClick?.(sliceD.ids ?? [], sliceD.label)}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          ))}
          {/* Center label */}
          <text x={cx} y={cy - 2} textAnchor="middle" fill="var(--ui-text, #f8fafc)" fontSize="17" fontWeight="900" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {hoveredSlice ? hoveredSlice.d.value : total}
          </text>
          <text x={cx} y={cy + 13} textAnchor="middle" fill="var(--ui-secondary, #94a3b8)" fontSize="9" fontWeight="600">
            {hoveredSlice ? truncate(hoveredSlice.d.label, 9) : 'Total'}
          </text>
        </svg>
        {/* Legend */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0, justifyContent: 'center' }}>
          {slices.map(({ color, d: sliceD, i }) => {
            const isHov = hoveredIdx === i;
            return (
              <div
                key={sliceD.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: onSliceClick ? 'pointer' : 'default',
                  padding: '2px 4px',
                  borderRadius: '4px',
                  background: isHov ? 'var(--ui-wash, rgba(255,255,255,0.06))' : 'transparent',
                  transition: 'background 0.1s',
                }}
                onClick={() => onSliceClick?.(sliceD.ids ?? [], sliceD.label)}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{
                  fontSize: '11px',
                  fontWeight: isHov ? '700' : '500',
                  color: isHov ? 'var(--ui-text, #ffffff)' : 'var(--ui-secondary, #cbd5e1)',
                  flex: 1,
                  minWidth: 0,
                  overflowWrap: 'anywhere',
                }}>
                  {sliceD.label}
                </span>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ui-text, #f8fafc)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {sliceD.value}
                </span>
                <span style={{ fontSize: '9.5px', color: 'var(--ui-muted, #64748b)', flexShrink: 0, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                  {((sliceD.value / total) * 100).toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Line Chart ───────────────────────────────────────────────────────────────

interface LineChartProps {
  data: TimeSeriesPoint[];
  title: string;
  color?: string;
  height?: number;
  onPointClick?: (ids: string[], label: string) => void;
}

export function LineChart({ data, title, color: seriesColor = CHART_COLORS[0], height = 210, onPointClick }: LineChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  if (!data.length) return <EmptyChart title={title} />;

  const color = analyticsChartColor(seriesColor);
  const svgW = 380;
  const svgH = height;
  const padL = 30;
  const padR = 14;
  const padT = 16;
  const padB = 44;
  const chartW = svgW - padL - padR;
  const chartH = svgH - padT - padB;

  const maxVal = Math.max(...data.map((d) => d.value), 1);

  const points = data.map((d, i) => ({
    x: padL + (i / Math.max(data.length - 1, 1)) * chartW,
    y: padT + chartH - (d.value / maxVal) * chartH,
    d,
    i,
  }));

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  const areaD = `${pathD} L ${points[points.length - 1].x} ${padT + chartH} L ${points[0].x} ${padT + chartH} Z`;

  const hov = hoveredIdx !== null ? points[hoveredIdx] : null;

  return (
    <div className="analytics-chart-card" style={{ background: 'var(--ui-surface, #111c30)', borderRadius: '14px', padding: '16px 16px', boxShadow: '0 4px 20px var(--ui-shadow, rgba(0,0,0,0.25))', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ui-text)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
          {title}
        </h3>
      </div>
      <div style={{ overflowX: 'auto', flex: 1 }}>
        <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} style={{ minWidth: '240px' }}>
          <defs>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {/* Grid */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const y = padT + chartH * (1 - frac);
            return (
              <g key={frac}>
                <line x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="var(--ui-grid, rgba(255,255,255,0.06))" strokeWidth="1" strokeDasharray="3 3" />
                <text x={padL - 6} y={y + 3.5} textAnchor="end" fill="var(--ui-muted, #64748b)" fontSize="9.5" fontWeight="600">
                  {Math.round(maxVal * frac)}
                </text>
              </g>
            );
          })}
          {/* Area fill */}
          <path d={areaD} fill="url(#lineGrad)" />
          {/* Line */}
          <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
          {/* Points */}
          {points.map((p) => (
            <circle
              key={p.i}
              cx={p.x}
              cy={p.y}
              r={hoveredIdx === p.i ? 5.5 : 3}
              fill={hoveredIdx === p.i ? '#ffffff' : color}
              stroke={hoveredIdx === p.i ? color : 'var(--ui-surface)'}
              strokeWidth="2"
              style={{ cursor: onPointClick ? 'pointer' : 'default', transition: 'all 0.12s' }}
              onClick={() => onPointClick?.(p.d.ids ?? [], p.d.label)}
              onMouseEnter={() => setHoveredIdx(p.i)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          ))}
          {/* Hover tooltip */}
          {hov && (
            <g>
              <rect
                x={Math.min(hov.x - 38, svgW - padR - 76)}
                y={hov.y - 30}
                width={76}
                height={24}
                rx="5"
                fill="var(--ui-surface, #1e293b)"
                stroke={color}
                strokeWidth="1.5"
              />
              <text
                x={Math.min(hov.x - 38, svgW - padR - 76) + 38}
                y={hov.y - 14}
                textAnchor="middle"
                fill="var(--ui-text, #f8fafc)"
                fontSize="10.5"
                fontWeight="800"
              >
                {hov.d.label}: {hov.d.value}
              </text>
            </g>
          )}
          {/* X axis labels */}
          {points
            .filter((_, i) => {
              const step = Math.max(1, Math.ceil(points.length / 5));
              return i % step === 0 || i === points.length - 1;
            })
            .map((p) => (
              <text
                key={p.i}
                x={p.x}
                y={svgH - padB + 16}
                textAnchor="middle"
                fill="var(--ui-secondary, #94a3b8)"
                fontSize="9.5"
                fontWeight="600"
              >
                {truncate(p.d.label, 8)}
              </text>
            ))}
        </svg>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyChart({ title }: { title: string }) {
  return (
    <div className="analytics-chart-card" style={{
      background: 'var(--ui-surface, #111c30)',
      borderRadius: '16px',
      padding: '28px 20px',
      textAlign: 'center',
      color: 'var(--ui-secondary, #94a3b8)',
      boxShadow: '0 4px 20px var(--ui-shadow, rgba(0,0,0,0.25))',
    }}>
      <h3 style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ui-text, #f8fafc)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '14px' }}>{title}</h3>
      <div style={{ fontSize: '32px', marginBottom: '10px' }}>📊</div>
      <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ui-secondary, #cbd5e1)' }}>No data available for this chart.</p>
      <p style={{ fontSize: '11px', color: 'var(--ui-muted, #64748b)', marginTop: '4px' }}>Import data and apply filters to see results.</p>
    </div>
  );
}

export { STATUS_COLORS, AGING_COLORS };

