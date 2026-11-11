'use client';

/**
 * Executive Ticket Monitoring & Stagnant Tickets Table
 * 
 * Clean, modern, uncluttered presentation designed for executive review.
 * Features quick status tabs, instant search, streamlined high-value columns,
 * and a comprehensive detail inspection modal.
 */

import React, { useState, useMemo } from 'react';
import type { NormalizedTicket } from '@/types/ir-analytics';
import { isActiveTicket } from '@/lib/ir-analytics/engine';
import { RequestIdLink } from '@/components/report/RequestIdLink';

interface StagnantTableProps {
  tickets: NormalizedTicket[];
  inactivityThreshold?: number;
  includeResolved?: boolean;
  onTicketClick: (ticket: NormalizedTicket) => void;
  title?: string;
}

type SortKey = 'daysSinceMovement' | 'agingDays' | 'ticketId' | 'technician' | 'department' | 'statusCategory';
type SortDir = 'asc' | 'desc';
type ViewFilter = 'all' | 'active' | 'stagnant' | 'critical' | 'resolved';

const INACTIVITY_COLORS = {
  normal: '#22c55e',      // < 3 days
  attention: '#84cc16',   // 3 - 6 days
  warning: '#f59e0b',     // 7 - 13 days
  critical: '#f97316',    // 14 - 29 days
  escalation: '#ef4444',  // 30+ days
};

function getAlertBadge(days: number | null): { label: string; color: string; bg: string } {
  if (days === null) return { label: 'Active', color: 'var(--ui-secondary, #94a3b8)', bg: 'rgba(148,163,184,0.1)' };
  if (days < 3) return { label: `${days}d • Normal`, color: INACTIVITY_COLORS.normal, bg: 'rgba(34,197,94,0.12)' };
  if (days < 7) return { label: `${days}d • Recent`, color: INACTIVITY_COLORS.attention, bg: 'rgba(132,204,22,0.12)' };
  if (days < 14) return { label: `${days}d • ⚠️ 7d+ Inactive`, color: INACTIVITY_COLORS.warning, bg: 'rgba(245,158,11,0.14)' };
  if (days < 30) return { label: `${days}d • ⚠️ 14d+ Stalled`, color: INACTIVITY_COLORS.critical, bg: 'rgba(249,115,22,0.16)' };
  return { label: `${days}d • 🚨 30d+ Escalation`, color: INACTIVITY_COLORS.escalation, bg: 'rgba(239,68,68,0.2)' };
}

const PAGE_SIZE = 15;

export function StagnantTicketTable({
  tickets,
  inactivityThreshold = 7,
  onTicketClick,
  title = 'Ticket Inactivity & Monitoring Center',
}: StagnantTableProps) {
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('daysSinceMovement');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(0);
  }

  // Pre-filter by quick tab
  const tabFiltered = useMemo(() => {
    switch (viewFilter) {
      case 'active':
        return tickets.filter((t) => isActiveTicket(t));
      case 'stagnant':
        return tickets.filter((t) => isActiveTicket(t) && (t.daysSinceMovement ?? 0) >= 7);
      case 'critical':
        return tickets.filter((t) => isActiveTicket(t) && (t.daysSinceMovement ?? 0) >= 30);
      case 'resolved':
        return tickets.filter((t) => !isActiveTicket(t));
      case 'all':
      default:
        return tickets;
    }
  }, [tickets, viewFilter]);

  // Filter by search query
  const searchFiltered = useMemo(() => {
    if (!search.trim()) return tabFiltered;
    const q = search.toLowerCase();
    return tabFiltered.filter(
      (t) =>
        t.ticketId.toLowerCase().includes(q) ||
        t.irId.toLowerCase().includes(q) ||
        t.technician.toLowerCase().includes(q) ||
        t.department.toLowerCase().includes(q) ||
        t.incidentType.toLowerCase().includes(q) ||
        t.rawStatus.toLowerCase().includes(q) ||
        t.remarks.toLowerCase().includes(q)
    );
  }, [tabFiltered, search]);

  // Sort records
  const sorted = useMemo(() => {
    return [...searchFiltered].sort((a, b) => {
      let av: string | number | null = null;
      let bv: string | number | null = null;

      switch (sortKey) {
        case 'daysSinceMovement': av = a.daysSinceMovement; bv = b.daysSinceMovement; break;
        case 'agingDays': av = a.agingDays; bv = b.agingDays; break;
        case 'ticketId': av = a.ticketId; bv = b.ticketId; break;
        case 'technician': av = a.technician; bv = b.technician; break;
        case 'department': av = a.department; bv = b.department; break;
        case 'statusCategory': av = a.statusCategory; bv = b.statusCategory; break;
      }

      if (av === null) return sortDir === 'asc' ? 1 : -1;
      if (bv === null) return sortDir === 'asc' ? -1 : 1;
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc'
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });
  }, [searchFiltered, sortKey, sortDir]);

  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);

  // Tab counts
  const activeCount = useMemo(() => tickets.filter((t) => isActiveTicket(t)).length, [tickets]);
  const stagnantCount = useMemo(() => tickets.filter((t) => isActiveTicket(t) && (t.daysSinceMovement ?? 0) >= 7).length, [tickets]);
  const criticalCount = useMemo(() => tickets.filter((t) => isActiveTicket(t) && (t.daysSinceMovement ?? 0) >= 30).length, [tickets]);
  const resolvedCount = useMemo(() => tickets.filter((t) => !isActiveTicket(t)).length, [tickets]);

  function SortableHeader({ k, label }: { k: SortKey; label: string }) {
    const active = sortKey === k;
    return (
      <th
        onClick={() => toggleSort(k)}
        style={{
          padding: '10px 14px',
          textAlign: 'left',
          fontSize: '11px',
          fontWeight: 700,
          color: active ? 'var(--ui-link, #60a5fa)' : 'var(--ui-muted, #64748b)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          background: 'var(--ui-surface, #0d1a2e)',
          borderBottom: '1px solid var(--ui-border, #1e3a5f)',
          userSelect: 'none',
        }}
      >
        {label} {active ? (sortDir === 'asc' ? '↑' : '↓') : ''}
      </th>
    );
  }

  return (
    <div style={{ background: 'var(--ui-surface, #0d1a2e)', border: '1px solid var(--ui-panel-border, var(--ui-border))', borderRadius: '14px', overflow: 'hidden' }}>
      {/* ── Table Top Control Bar ── */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--ui-border, #1e3a5f)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          background: 'var(--ui-inset, #101f36)',
        }}
      >
        <div>
          <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ui-text, #f8fafc)', margin: 0 }}>
            {title}
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--ui-secondary, #94a3b8)', margin: '3px 0 0' }}>
            {sorted.length} {sorted.length === 1 ? 'ticket' : 'tickets'} matching criteria · Click any row to inspect complete history
          </p>
        </div>

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '10px', top: '7px', fontSize: '12px', color: 'var(--ui-muted, #64748b)' }}>🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search ticket, tech, dept…"
              style={{
                background: 'var(--ui-inset, #091426)',
                border: '1px solid var(--ui-control-border)',
                borderRadius: '8px',
                color: 'var(--ui-text, #f8fafc)',
                fontSize: '12px',
                padding: '6px 12px 6px 30px',
                width: '220px',
              }}
            />
          </div>
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--ui-secondary, #94a3b8)',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Quick Filter Tabs ── */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          padding: '10px 16px',
          background: 'var(--ui-page, #0b1626)',
          borderBottom: '1px solid var(--ui-border, #1e3a5f)',
          overflowX: 'auto',
        }}
      >
        {[
          { key: 'all' as ViewFilter, label: 'All Records', count: tickets.length, color: 'var(--ui-secondary, #94a3b8)' },
          { key: 'active' as ViewFilter, label: 'Active Workload', count: activeCount, color: 'var(--ui-link, #38bdf8)' },
          { key: 'stagnant' as ViewFilter, label: '⚠️ Stagnant (7+ Days)', count: stagnantCount, color: 'var(--ui-warning, #fbbf24)' },
          { key: 'critical' as ViewFilter, label: '🚨 Critical (30+ Days)', count: criticalCount, color: 'var(--ui-danger, #f87171)' },
          { key: 'resolved' as ViewFilter, label: '✅ Resolved & Closed', count: resolvedCount, color: 'var(--ui-success, #4ade80)' },
        ].map((tab) => {
          const isActive = viewFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => { setViewFilter(tab.key); setPage(0); }}
              style={{
                background: isActive ? '#2563eb' : 'var(--ui-inset, #101f36)',
                border: isActive ? '1px solid #3b82f6' : '1px solid var(--ui-border, #1e3a5f)',
                color: isActive ? '#ffffff' : 'var(--ui-secondary, #cbd5e1)',
                borderRadius: '8px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: isActive ? 700 : 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{tab.label}</span>
              <span
                style={{
                  background: isActive ? '#173b9c' : 'var(--ui-wash)',
                  padding: '1px 6px',
                  borderRadius: '999px',
                  fontSize: '10px',
                  fontWeight: 800,
                  color: isActive ? '#fff' : tab.color,
                }}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Table Content ── */}
      {sorted.length === 0 ? (
        <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--ui-muted, #64748b)' }}>
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>✨</div>
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ui-secondary, #94a3b8)' }}>
            No tickets found matching the selected filter
          </p>
          <p style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
            Try selecting a different view tab or clearing your search query.
          </p>
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px' }}>
              <thead>
                <tr>
                  <SortableHeader k="ticketId" label="Ticket / IR ID" />
                  <SortableHeader k="statusCategory" label="Status" />
                  <SortableHeader k="technician" label="Assigned Technician" />
                  <SortableHeader k="department" label="Department" />
                  <SortableHeader k="daysSinceMovement" label="Movement & Aging" />
                  <th
                    style={{
                      padding: '10px 14px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: 'var(--ui-muted, #64748b)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      background: 'var(--ui-surface, #0d1a2e)',
                      borderBottom: '1px solid var(--ui-border, #1e3a5f)',
                      textAlign: 'left',
                    }}
                  >
                    Delay Reason / Remarks
                  </th>
                  <th
                    style={{
                      padding: '10px 14px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: 'var(--ui-muted, #64748b)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      background: 'var(--ui-surface, #0d1a2e)',
                      borderBottom: '1px solid var(--ui-border, #1e3a5f)',
                      textAlign: 'center',
                      width: '80px',
                    }}
                  >
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((t, i) => {
                  const alert = getAlertBadge(t.daysSinceMovement);
                  const isStagnant = (t.daysSinceMovement ?? 0) >= 7 && isActiveTicket(t);

                  return (
                    <tr
                      key={t.rowKey}
                      onClick={() => onTicketClick(t)}
                      style={{
                        background: i % 2 === 0 ? 'transparent' : 'var(--ui-wash, rgba(16,31,54,0.3))',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                        borderLeft: isStagnant ? `3px solid ${alert.color}` : '3px solid transparent',
                      }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = 'rgba(37,99,235,0.1)')}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = i % 2 === 0 ? 'transparent' : 'var(--ui-wash, rgba(16,31,54,0.3))')}
                    >
                      {/* Ticket & IR ID */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <div style={{ color: 'var(--ui-link, #60a5fa)', fontWeight: 800, fontSize: '13px' }}>
                          {t.ticketId ? <RequestIdLink requestId={t.ticketId} /> : '(No ID)'}
                        </div>
                        {t.irId && t.irId !== t.ticketId && (
                          <div style={{ fontSize: '10px', color: 'var(--ui-violet, #a78bfa)', marginTop: '2px', fontWeight: 600 }}>
                            IR: <RequestIdLink requestId={t.irId} />
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <StatusBadge status={t.statusCategory} rawStatus={t.rawStatus} />
                      </td>

                      {/* Technician */}
                      <td style={{ padding: '12px 14px', color: 'var(--ui-text, #f8fafc)', whiteSpace: 'nowrap' }}>
                        {t.technician === 'Unassigned' || !t.technician ? (
                          <span style={{ color: 'var(--ui-muted, #64748b)', fontStyle: 'italic' }}>Unassigned</span>
                        ) : (
                          <span style={{ fontWeight: 600 }}>{t.technician}</span>
                        )}
                      </td>

                      {/* Department */}
                      <td style={{ padding: '12px 14px', color: 'var(--ui-secondary, #cbd5e1)', whiteSpace: 'nowrap' }}>
                        {t.department || <span style={{ color: '#475569' }}>—</span>}
                      </td>

                      {/* Movement & Aging Badge */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            background: alert.bg,
                            border: `1px solid color-mix(in srgb, ${alert.color} 31%, transparent)`,
                            color: alert.color,
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            display: 'inline-block',
                          }}
                        >
                          {alert.label}
                        </span>
                      </td>

                      {/* Remarks / Delay Reason */}
                      <td
                        style={{
                          padding: '12px 14px',
                          color: t.remarks ? 'var(--ui-secondary, #94a3b8)' : '#475569',
                          maxWidth: '300px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontStyle: t.remarks ? 'normal' : 'italic',
                        }}
                        title={t.remarks || 'No recorded remarks'}
                      >
                        {t.remarks || 'No delay reason recorded'}
                      </td>

                      {/* Action */}
                      <td style={{ padding: '12px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            color: 'var(--ui-link, #60a5fa)',
                            fontWeight: 700,
                            background: 'rgba(37,99,235,0.12)',
                            padding: '4px 8px',
                            borderRadius: '4px',
                          }}
                        >
                          View →
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              style={{
                padding: '12px 18px',
                borderTop: '1px solid var(--ui-border, #1e3a5f)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px',
                background: 'var(--ui-surface, #0d1a2e)',
              }}
            >
              <span style={{ color: 'var(--ui-muted, #64748b)' }}>
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length} tickets
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  style={{ ...paginationBtn, color: page === 0 ? 'var(--ui-muted)' : paginationBtn.color }}
                >
                  ← Prev
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const p = totalPages <= 7 ? i : page < 4 ? i : page > totalPages - 5 ? totalPages - 7 + i : page - 3 + i;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPage(p)}
                      style={{
                        ...paginationBtn,
                        background: p === page ? '#2563eb' : 'var(--ui-inset, #101f36)',
                        color: p === page ? '#fff' : 'var(--ui-secondary, #94a3b8)',
                      }}
                    >
                      {p + 1}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  style={{ ...paginationBtn, color: page === totalPages - 1 ? 'var(--ui-muted)' : paginationBtn.color }}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const paginationBtn: React.CSSProperties = {
  background: 'var(--ui-inset, #101f36)',
  border: '1px solid var(--ui-border, #243650)',
  borderRadius: '6px',
  color: 'var(--ui-secondary, #94a3b8)',
  fontSize: '11px',
  fontWeight: 600,
  padding: '5px 10px',
  cursor: 'pointer',
};

function StatusBadge({ status, rawStatus }: { status: string; rawStatus: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    open: { bg: 'rgba(59,130,246,0.15)', color: 'var(--ui-link, #60a5fa)' },
    pending: { bg: 'rgba(234,179,8,0.15)', color: 'var(--ui-warning, #fbbf24)' },
    'in-progress': { bg: 'rgba(249,115,22,0.15)', color: 'var(--ui-orange, #fb923c)' },
    resolved: { bg: 'rgba(34,197,94,0.15)', color: 'var(--ui-success, #4ade80)' },
    closed: { bg: 'rgba(16,185,129,0.15)', color: 'var(--ui-success, #34d399)' },
    unknown: { bg: 'rgba(100,116,139,0.15)', color: 'var(--ui-secondary, #94a3b8)' },
  };
  const style = colors[status] ?? colors.unknown;
  const label = rawStatus || status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span
      style={{
        background: style.bg,
        border: `1px solid color-mix(in srgb, ${style.color} 25%, transparent)`,
        color: style.color,
        fontSize: '11px',
        fontWeight: 700,
        padding: '3px 8px',
        borderRadius: '6px',
        display: 'inline-block',
      }}
      title={`Category: ${status}`}
    >
      {label}
    </span>
  );
}

// ── Ticket Detail Inspection Modal ──────────────────────────────────────────

interface TicketDetailModalProps {
  ticket: NormalizedTicket | null;
  onClose: () => void;
}

export function TicketDetailModal({ ticket, onClose }: TicketDetailModalProps) {
  if (!ticket) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'var(--ui-surface, #0d1a2e)',
          border: '1px solid var(--ui-panel-border, var(--ui-border))',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '640px',
          maxHeight: '88vh',
          overflow: 'auto',
          boxShadow: '0 20px 40px var(--ui-shadow, rgba(0,0,0,0.6))',
        }}
      >
        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--ui-border, #243650)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ui-link, #60a5fa)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Ticket Details & Audit
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ui-text, #f8fafc)', margin: '2px 0 0' }}>
              🎟️ {ticket.ticketId ? <RequestIdLink requestId={ticket.ticketId} /> : '(No ID)'}
            </h2>
            {ticket.irId && ticket.irId !== ticket.ticketId && (
              <div style={{ fontSize: '12px', color: 'var(--ui-violet, #a78bfa)', marginTop: '2px' }}>
                Incident Report: <RequestIdLink requestId={ticket.irId} />
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'var(--ui-inset, #101f36)',
              border: '1px solid var(--ui-border, #243650)',
              color: 'var(--ui-secondary, #94a3b8)',
              borderRadius: '8px',
              width: '32px',
              height: '32px',
              cursor: 'pointer',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px' }}>
          {/* Stagnant Alert banner */}
          {ticket.daysSinceMovement !== null && ticket.daysSinceMovement >= 7 && (
            <div
              style={{
                background: ticket.daysSinceMovement >= 30 ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                border: `1px solid ${ticket.daysSinceMovement >= 30 ? 'rgba(239,68,68,0.35)' : 'rgba(245,158,11,0.35)'}`,
                borderRadius: '10px',
                padding: '12px 16px',
                marginBottom: '20px',
                fontSize: '12px',
                color: ticket.daysSinceMovement >= 30 ? 'var(--ui-danger, #fca5a5)' : 'var(--ui-warning, #fcd34d)',
                lineHeight: 1.6,
              }}
            >
              ⚠️ <strong>Attention:</strong> This ticket has had no recorded movement for <strong>{ticket.daysSinceMovement} days</strong>.
              Requires administrator follow-up or technician update.
            </div>
          )}

          {/* Details grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '20px' }}>
            <DetailField label="Status" value={ticket.rawStatus} highlight={ticket.statusCategory === 'open' || ticket.statusCategory === 'pending'} />
            <DetailField label="Assigned Technician" value={ticket.technician} />
            <DetailField label="Department" value={ticket.department || '—'} />
            <DetailField label="Incident Type" value={ticket.incidentType || '—'} />
            <DetailField label="Priority" value={ticket.priority || '—'} />
            <DetailField label="Requester" value={ticket.requester || '—'} />
          </div>

          {/* Timeline & Inactivity */}
          <div style={{ background: 'var(--ui-inset, #101f36)', border: '1px solid var(--ui-panel-border, var(--ui-border))', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
            <h4 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ui-muted, #64748b)', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.06em' }}>
              Timeline & Inactivity Metrics
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
              <div><span style={{ color: 'var(--ui-muted, #64748b)' }}>Created: </span><span style={{ color: 'var(--ui-text, #f8fafc)', fontWeight: 600 }}>{ticket.createdDate?.toLocaleDateString() ?? '—'}</span></div>
              <div><span style={{ color: 'var(--ui-muted, #64748b)' }}>Last Activity: </span><span style={{ color: 'var(--ui-text, #f8fafc)', fontWeight: 600 }}>{ticket.lastMovementDate?.toLocaleDateString() ?? '—'}</span></div>
              <div><span style={{ color: 'var(--ui-muted, #64748b)' }}>Days Inactive: </span><span style={{ color: (ticket.daysSinceMovement ?? 0) >= 7 ? 'var(--ui-warning, #f59e0b)' : 'var(--ui-success, #34d399)', fontWeight: 800 }}>{ticket.daysSinceMovement ?? 0} days</span></div>
              <div><span style={{ color: 'var(--ui-muted, #64748b)' }}>Aging Since Open: </span><span style={{ color: 'var(--ui-text, #f8fafc)', fontWeight: 600 }}>{ticket.agingDays ?? '—'} days</span></div>
            </div>
          </div>

          {/* Delay Reason / Remarks */}
          <div style={{ marginBottom: '16px' }}>
            <h4 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ui-muted, #64748b)', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.06em' }}>
              Delay Reason / Remarks
            </h4>
            <div
              style={{
                fontSize: '12px',
                color: ticket.remarks ? 'var(--ui-text, #e2e8f0)' : 'var(--ui-muted, #64748b)',
                lineHeight: 1.6,
                background: 'var(--ui-inset, #101f36)',
                border: '1px solid var(--ui-border, #1e3a5f)',
                borderRadius: '8px',
                padding: '12px 14px',
                fontStyle: ticket.remarks ? 'normal' : 'italic',
              }}
            >
              {ticket.remarks || 'No specific delay reason or progress remarks recorded for this ticket.'}
            </div>
          </div>

          {/* Description */}
          {ticket.description && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ui-muted, #64748b)', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.06em' }}>
                Description
              </h4>
              <p
                style={{
                  fontSize: '12px',
                  color: 'var(--ui-secondary, #cbd5e1)',
                  lineHeight: 1.6,
                  background: 'var(--ui-inset, #101f36)',
                  border: '1px solid var(--ui-border, #1e3a5f)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  margin: 0,
                }}
              >
                {ticket.description}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailField({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ui-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>
        {label}
      </div>
      <div style={{ fontSize: '13px', color: highlight ? 'var(--ui-warning, #fbbf24)' : 'var(--ui-text, #f8fafc)', fontWeight: highlight ? 700 : 500 }}>
        {value}
      </div>
    </div>
  );
}
