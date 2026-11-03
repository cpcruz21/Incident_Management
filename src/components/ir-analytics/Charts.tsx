'use client';

/**
 * Simple SVG-based charts for the IR Analytics Dashboard.
 * No external chart library — uses inline SVG to match the existing project (no chart dependency installed).
 */

import React, { useState } from 'react';
import type { DistributionBar, TimeSeriesPoint, AgingDistributionRow } from '@/types/ir-analytics';

// ─── Color palettes ────────────────────────────────────────────────────────────

const PALETTE = [
  '#3b82f6', '#a78bfa', '#22c55e', '#f59e0b', '#ef4444',
  '#0ea5e9', '#8b5cf6', '#10b981', '#f97316', '#ec4899',
  '#06b6d4', '#84cc16', '#6366f1', '#14b8a6', '#f43f5e',
];

const STATUS_COLORS: Record<string, string> = {
  Open: '#3b82f6',
  Pending: '#eab308',
  'In-progress': '#f97316',
  'In Progress': '#f97316',
  'Work in Progress': '#f97316',
  'Awaiting Problem': '#ec4899',
  'On Hold': '#a855f7',
  Resolved: '#22c55e',
  Closed: '#10b981',
  Cancelled: '#64748b',
  Unknown: '#64748b',
};

const AGING_COLORS: Record<string, string> = {
  '0–2 days': '#22c55e',
  '3–6 days': '#84cc16',
  '7–13 days': '#f59e0b',
  '14–29 days': '#f97316',
  '30+ days': '#ef4444',
  'Resolved': '#64748b',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
      <div style={{ background: '#111c30', border: '1px solid #1e293b', borderRadius: '14px', padding: '16px 16px', boxShadow: '0 4px 20px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <h3 style={{ fontSize: '11.5px', fontWeight: 800, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
          </h3>
        </div>
        <div style={{ overflowX: 'auto', flex: 1 }}>
          <svg width="100%" viewBox={`0 0 ${labelW + chartW + 45} ${totalH}`} style={{ minWidth: '240px' }}>
            {displayData.map((d, i) => {
              const y = i * (bHeight + gap) + 4;
              const barW = Math.max(4, (d.value / maxVal) * chartW);
              const color = colorMap?.[d.label] ?? PALETTE[i % PALETTE.length];
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
                    fill={isHov ? '#38bdf8' : '#cbd5e1'}
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
                    fill="rgba(15,23,42,0.8)"
                  />
                  <rect
                    x={labelW}
                    y={y}
                    width={barW}
                    height={bHeight}
                    rx="4"
                    fill={color}
                    opacity={isHov ? 1 : hoveredIdx !== null ? 0.6 : 0.88}
                    filter={isHov ? 'brightness(1.15)' : 'none'}
                    style={{ transition: 'opacity 0.15s ease, filter 0.15s ease' }}
                  />
                  <text
                    x={labelW + barW + 6}
                    y={y + bHeight / 2 + 4}
                    fill={isHov ? '#ffffff' : '#f8fafc'}
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
    <div style={{ background: '#111c30', border: '1px solid #1e293b', borderRadius: '14px', padding: '16px 16px', boxShadow: '0 4px 20px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '11.5px', fontWeight: 800, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                <line x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="3 3" />
                <text x={padL - 6} y={y + 3.5} textAnchor="end" fill="#64748b" fontSize="9.5" fontWeight="600">{val}</text>
              </g>
            );
          })}
          {/* Bars */}
          {displayData.map((d, i) => {
            const x = padL + i * (barW + gap) + gap / 2;
            const barH2 = Math.max(3, (d.value / maxVal) * chartH);
            const y = padT + chartH - barH2;
            const color = colorMap?.[d.label] ?? PALETTE[i % PALETTE.length];
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
                  opacity={isHov ? 1 : hoveredIdx !== null ? 0.6 : 0.88}
                  filter={isHov ? 'brightness(1.18)' : 'none'}
                  style={{ transition: 'opacity 0.15s ease, filter 0.15s ease' }}
                />
                <text
                  x={x + barW / 2}
                  y={y - 5}
                  textAnchor="middle"
                  fill={isHov ? '#ffffff' : '#f8fafc'}
                  fontSize={isHov ? '11.5' : '10.5'}
                  fontWeight="800"
                >
                  {d.value > 0 ? d.value : ''}
                </text>
                <text
                  x={x + barW / 2}
                  y={svgH - padB + 14}
                  textAnchor="middle"
                  fill={isHov ? '#38bdf8' : '#94a3b8'}
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

    const path = [
      `M ${x1} ${y1}`,
      `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${ix2} ${iy2}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1}`,
      'Z',
    ].join(' ');

    const color = colorMap?.[d.label] ?? PALETTE[i % PALETTE.length];

    return { path, color, d, i };
  });

  const hoveredSlice = hoveredIdx !== null ? slices[hoveredIdx] : null;

  return (
    <div style={{ background: '#111c30', border: '1px solid #1e293b', borderRadius: '14px', padding: '16px 16px', boxShadow: '0 4px 20px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '11.5px', fontWeight: 800, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
              opacity={hoveredIdx === i ? 1 : 0.88}
              stroke="#0d1a2e"
              strokeWidth="2"
              style={{ cursor: onSliceClick ? 'pointer' : 'default', transition: 'all 0.12s' }}
              onClick={() => onSliceClick?.(sliceD.ids ?? [], sliceD.label)}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          ))}
          {/* Center label */}
          <text x={cx} y={cy - 2} textAnchor="middle" fill="#f8fafc" fontSize="17" fontWeight="900" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {hoveredSlice ? hoveredSlice.d.value : total}
          </text>
          <text x={cx} y={cy + 13} textAnchor="middle" fill="#94a3b8" fontSize="9" fontWeight="600">
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
                  background: isHov ? 'rgba(255,255,255,0.06)' : 'transparent',
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
                  color: isHov ? '#ffffff' : '#cbd5e1',
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {sliceD.label}
                </span>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#f8fafc', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {sliceD.value}
                </span>
                <span style={{ fontSize: '9.5px', color: '#64748b', flexShrink: 0, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
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

export function LineChart({ data, title, color = '#3b82f6', height = 210, onPointClick }: LineChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  if (!data.length) return <EmptyChart title={title} />;

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
    <div style={{ background: '#111c30', border: '1px solid #1e293b', borderRadius: '14px', padding: '16px 16px', boxShadow: '0 4px 20px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '11.5px', fontWeight: 800, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                <line x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="3 3" />
                <text x={padL - 6} y={y + 3.5} textAnchor="end" fill="#64748b" fontSize="9.5" fontWeight="600">
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
              stroke={hoveredIdx === p.i ? color : '#0d1a2e'}
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
                fill="#1e293b"
                stroke="#3b82f6"
                strokeWidth="1.5"
              />
              <text
                x={Math.min(hov.x - 38, svgW - padR - 76) + 38}
                y={hov.y - 14}
                textAnchor="middle"
                fill="#f8fafc"
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
                fill="#94a3b8"
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
    <div style={{
      background: '#111c30',
      border: '1px solid #1e293b',
      borderRadius: '16px',
      padding: '28px 20px',
      textAlign: 'center',
      color: '#94a3b8',
      boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
    }}>
      <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '14px' }}>{title}</h3>
      <div style={{ fontSize: '32px', marginBottom: '10px' }}>📊</div>
      <p style={{ fontSize: '13px', fontWeight: 600, color: '#cbd5e1' }}>No data available for this chart.</p>
      <p style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Import data and apply filters to see results.</p>
    </div>
  );
}

export { STATUS_COLORS, AGING_COLORS };

