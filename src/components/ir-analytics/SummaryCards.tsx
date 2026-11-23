'use client';

import React from 'react';
import { Activity, ChartNoAxesCombined, CheckCircle2, CircleAlert, Ticket, type LucideIcon } from 'lucide-react';
import type { IRSummaryStats, IRDashboardFilters } from '@/types/ir-analytics';

interface SummaryCardsProps {
  stats: IRSummaryStats;
  filters: IRDashboardFilters;
  onCardClick: (statusFilter: string) => void;
}

type MetricTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

function KpiCard({ label, Icon, tone = 'neutral', value, detail, comparison, pressed, onClick }: {
  label: string;
  Icon: LucideIcon;
  tone?: MetricTone;
  value: string | number;
  detail: React.ReactNode;
  comparison?: React.ReactNode;
  pressed?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="analytics-kpi-heading">
        <span>{label}</span>
        <span className="analytics-kpi-icon"><Icon size={17} aria-hidden="true" /></span>
      </span>
      <span className="analytics-kpi-value">
        {typeof value === 'number' ? value.toLocaleString() : value}
        {comparison && <span className="analytics-kpi-comparison">{comparison}</span>}
      </span>
      <span className="analytics-kpi-detail">{detail}</span>
    </>
  );
  return onClick
    ? <button type="button" className="analytics-kpi" data-tone={tone} aria-pressed={pressed} onClick={onClick}>{content}</button>
    : <div className="analytics-kpi" data-tone={tone}>{content}</div>;
}

export function IRSummaryCards({ stats, filters, onCardClick }: SummaryCardsProps) {
  const activeStatus = filters.status?.toLowerCase().trim() || '';
  const rate = stats.resolutionRate;
  const rateTone = rate === null ? 'neutral' : rate >= 80 ? 'success' : rate >= 60 ? 'warning' : 'danger';
  const delayTone = stats.noMovement30d > 0 ? 'danger' : stats.noMovement7d > 0 ? 'warning' : 'success';

  return (
    <section className="analytics-kpi-grid" aria-label="Incident summary">
      <KpiCard label="Total Incident Reports" Icon={Ticket} value={stats.totalUniqueIRs}
        detail={<><strong>{stats.totalUniqueTickets}</strong> unique incidents tracked</>} />
      <KpiCard label="Active Workload" Icon={Activity} tone="info"
        value={stats.openTickets + stats.pendingTickets + stats.inProgressTickets}
        pressed={activeStatus === 'open'} onClick={() => onCardClick(activeStatus === 'open' ? '' : 'open')}
        detail={<><strong>{stats.openTickets}</strong> Open · <strong>{stats.pendingTickets}</strong> Pending · <strong>{stats.inProgressTickets}</strong> In progress</>} />
      <KpiCard label="Total Completed" Icon={CheckCircle2} tone="success"
        value={stats.resolvedTickets + stats.closedTickets}
        pressed={activeStatus === 'resolved'} onClick={() => onCardClick(activeStatus === 'resolved' ? '' : 'resolved')}
        detail={<><strong>{stats.resolvedTickets}</strong> Resolved · <strong>{stats.closedTickets}</strong> Closed</>} />
      <KpiCard label="Resolution Rate" Icon={ChartNoAxesCombined} tone={rateTone}
        value={rate === null ? 'N/A' : rate.toFixed(1) + '%'}
        comparison={stats.avgResolutionDays === null ? undefined : 'Avg ' + stats.avgResolutionDays.toFixed(1) + ' d'}
        detail="(Resolved + Closed) ÷ All Tickets" />
      <KpiCard label="Stagnant Workload" Icon={CircleAlert} tone={delayTone} value={stats.noMovement7d}
        comparison="7d+ inactive"
        detail={stats.noMovement30d > 0 ? stats.noMovement30d + ' critical (30d+)'
          : stats.noMovement14d > 0 ? stats.noMovement14d + ' stalled 14+ days'
          : stats.noMovement7d > 0 ? stats.noMovement7d + ' inactive 7+ days'
          : 'No bottlenecks detected'} />
    </section>
  );
}
