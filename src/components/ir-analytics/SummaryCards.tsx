'use client';

/**
 * Executive Summary Cards — Clean, polished, data-driven
 * 5 high-impact hero KPI cards + interactive status breakdown ribbon
 */

import React from 'react';
import type { IRSummaryStats, IRDashboardFilters } from '@/types/ir-analytics';

interface SummaryCardsProps {
  stats: IRSummaryStats;
  filters: IRDashboardFilters;
  onCardClick: (statusFilter: string) => void;
}

export function IRSummaryCards({ stats, filters, onCardClick }: SummaryCardsProps) {
  const activeStatus = filters.status?.toLowerCase().trim() || '';
  const totalActive = stats.openTickets + stats.pendingTickets + stats.inProgressTickets;
  const totalCompleted = stats.resolvedTickets + stats.closedTickets;
  const resRate = stats.resolutionRate !== null ? stats.resolutionRate : null;

  const rateColor =
    resRate === null ? '#94a3b8'
    : resRate >= 80 ? '#22c55e'
    : resRate >= 60 ? '#f59e0b'
    : '#ef4444';

  const alertColor =
    stats.noMovement30d > 0 ? '#ef4444'
    : stats.noMovement14d > 0 ? '#f97316'
    : stats.noMovement7d > 0 ? '#f59e0b'
    : '#22c55e';

  return (
    <div style={{ marginBottom: '8px' }}>

      {/* ══ Hero KPI Cards ══ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '12px',
        marginBottom: '14px',
      }}>
        {/* Card 1 — Total Scope */}
        <KpiCard
          label="Total Incident Reports"
          icon="🎫"
          iconColor="#60a5fa"
          value={stats.totalUniqueIRs}
          sub={
            <span>
              <span style={{ color: '#38bdf8', fontWeight: 700 }}>{stats.totalUniqueTickets}</span>{' '}
              unique incidents tracked
            </span>
          }
        />

        {/* Card 2 — Active Workload */}
        <KpiCard
          label="Active Workload"
          icon="⚡"
          iconColor="#3b82f6"
          value={totalActive}
          valueColor="#60a5fa"
          clickable
          isActive={activeStatus === 'open'}
          onClick={() => onCardClick(activeStatus === 'open' ? '' : 'open')}
          sub={
            <span>
              <span style={{ color: '#3b82f6', fontWeight: 700 }}>{stats.openTickets}</span> Open ·{' '}
              <span style={{ color: '#fbbf24', fontWeight: 700 }}>{stats.pendingTickets}</span> Pending ·{' '}
              <span style={{ color: '#fb923c', fontWeight: 700 }}>{stats.inProgressTickets}</span> In Progress
            </span>
          }
        />

        {/* Card 3 — Completed */}
        <KpiCard
          label="Total Completed"
          icon="✓"
          iconColor="#22c55e"
          value={totalCompleted}
          valueColor="#4ade80"
          clickable
          isActive={activeStatus === 'resolved'}
          onClick={() => onCardClick(activeStatus === 'resolved' ? '' : 'resolved')}
          sub={
            <span>
              <span style={{ color: '#22c55e', fontWeight: 700 }}>{stats.resolvedTickets}</span> Resolved ·{' '}
              <span style={{ color: '#10b981', fontWeight: 700 }}>{stats.closedTickets}</span> Closed
            </span>
          }
        />

        {/* Card 4 — Resolution Rate */}
        <div style={{
          background: 'linear-gradient(145deg, #111c30 0%, #0d1a2e 100%)',
          border: '1px solid #1e293b',
          borderRadius: '16px',
          padding: '18px 20px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Resolution Rate
            </span>
            <span style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'rgba(167,139,250,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px' }}>
              📊
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '32px', fontWeight: 900, color: rateColor, letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {resRate !== null ? `${resRate.toFixed(1)}%` : 'N/A'}
            </span>
            {stats.avgResolutionDays !== null && (
              <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
                Avg {stats.avgResolutionDays.toFixed(1)}d
              </span>
            )}
          </div>
          {/* Progress bar */}
          <div style={{ width: '100%', height: '5px', background: '#091426', borderRadius: '999px', overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(resRate ?? 0, 100)}%`,
              height: '100%',
              background: rateColor,
              borderRadius: '999px',
              transition: 'width 0.6s ease',
            }} />
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
            (Resolved + Closed) ÷ All Tickets
          </div>
        </div>

        {/* Card 5 — Stagnant Alert */}
        <KpiCard
          label="Stagnant Workload"
          icon={stats.noMovement30d > 0 ? '🚨' : '⚠️'}
          iconColor={alertColor}
          iconBg={`${alertColor}20`}
          value={stats.noMovement7d}
          valueColor={alertColor}
          clickable
          isActive={false}
          borderColor={stats.noMovement7d > 0 ? `${alertColor}40` : '#1e293b'}
          sub={
            stats.noMovement30d > 0 ? (
              <span style={{ color: '#ef4444', fontWeight: 700 }}>
                🚨 {stats.noMovement30d} critical (30d+)
              </span>
            ) : stats.noMovement14d > 0 ? (
              <span style={{ color: '#f97316', fontWeight: 700 }}>
                {stats.noMovement14d} stalled 14+ days
              </span>
            ) : stats.noMovement7d > 0 ? (
              <span style={{ color: '#f59e0b', fontWeight: 700 }}>
                {stats.noMovement7d} inactive 7+ days
              </span>
            ) : (
              <span style={{ color: '#34d399', fontWeight: 600 }}>✓ No bottlenecks detected</span>
            )
          }
          valueSuffix={<span style={{ fontSize: '13px', color: '#94a3b8', marginLeft: '6px', fontWeight: 600 }}>7d+ inactive</span>}
        />
      </div>

      {/* ══ Status Breakdown Ribbon ══ */}
      {stats.statusBreakdown && stats.statusBreakdown.length > 0 && (
        <div style={{
          background: '#111c30',
          border: '1px solid #1e293b',
          borderRadius: '14px',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}>
          <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
            All Statuses:
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
            {stats.statusBreakdown.map((item) => {
              const isSelected = activeStatus === item.status.toLowerCase().trim();
              const dotColor =
                item.category === 'closed' ? '#34d399'
                : item.category === 'resolved' ? '#4ade80'
                : item.category === 'open' ? '#60a5fa'
                : item.category === 'pending' ? '#fbbf24'
                : item.category === 'in-progress' ? '#fb923c'
                : '#94a3b8';

              return (
                <button
                  key={item.status}
                  type="button"
                  onClick={() => onCardClick(isSelected ? '' : item.status)}
                  style={{
                    background: isSelected ? 'rgba(37,99,235,0.25)' : '#0d1a2e',
                    border: isSelected ? '1px solid #3b82f6' : '1px solid #1e293b',
                    color: isSelected ? '#ffffff' : '#cbd5e1',
                    borderRadius: '999px',
                    padding: '5px 13px',
                    fontSize: '12px',
                    fontWeight: isSelected ? 800 : 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.12s ease',
                    boxShadow: isSelected ? '0 0 10px rgba(59,130,246,0.3)' : 'none',
                  }}
                >
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                  <span>{item.status}</span>
                  <span style={{
                    background: isSelected ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)',
                    color: isSelected ? '#fff' : '#94a3b8',
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '1px 6px',
                    borderRadius: '999px',
                  }}>
                    {item.count}
                  </span>
                </button>
              );
            })}
          </div>
          {activeStatus && (
            <button
              type="button"
              onClick={() => onCardClick('')}
              style={{
                background: 'transparent',
                border: '1px solid #334155',
                color: '#94a3b8',
                borderRadius: '8px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              ✕ Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  icon,
  iconColor,
  iconBg,
  value,
  valueColor = '#ffffff',
  sub,
  valueSuffix,
  clickable = false,
  isActive = false,
  onClick,
  borderColor,
}: {
  label: string;
  icon: string;
  iconColor: string;
  iconBg?: string;
  value: string | number;
  valueColor?: string;
  sub?: React.ReactNode;
  valueSuffix?: React.ReactNode;
  clickable?: boolean;
  isActive?: boolean;
  onClick?: () => void;
  borderColor?: string;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: isActive
          ? 'linear-gradient(145deg, rgba(37,99,235,0.1) 0%, #0d1a2e 100%)'
          : 'linear-gradient(145deg, #111c30 0%, #0d1a2e 100%)',
        border: `1px solid ${borderColor ?? (isActive ? '#3b82f6' : '#1e293b')}`,
        borderRadius: '16px',
        padding: '18px 20px',
        boxShadow: isActive ? '0 0 20px rgba(59,130,246,0.25)' : '0 4px 20px rgba(0,0,0,0.25)',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'all 0.15s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {/* Label row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '11px', fontWeight: 800, color: iconColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
        <span style={{
          width: '32px',
          height: '32px',
          borderRadius: '10px',
          background: iconBg ?? `${iconColor}18`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '15px',
        }}>
          {icon}
        </span>
      </div>
      {/* Value */}
      <div style={{ display: 'flex', alignItems: 'baseline' }}>
        <span style={{ fontSize: '32px', fontWeight: 900, color: valueColor, letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {valueSuffix}
      </div>
      {/* Sub-line */}
      {sub && <div style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 500 }}>{sub}</div>}
    </div>
  );
}
