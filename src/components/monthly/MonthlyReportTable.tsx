'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { Incident } from '@/types/incident';
import type { MonthlyReportData, MonthlyTechnicianSLA } from '@/types/monthly';
import {
  ALL_TICKETS_COLUMNS,
  CLOSED_TICKETS_COLUMNS,
  FIRST_RESPONSE_COLUMNS,
  getIncidentMonthlyValue as getRawValue,
  ROOT_CAUSE_FACTORS,
  ROOT_CAUSE_TYPES,
  findRootCauseType,
} from '@/types/monthly';
import { formatSLAPercentage } from '@/lib/sla/calculator';
import { saveReport } from '@/lib/storage/report-storage';
import { filterAcceptableFirstResponse } from '@/lib/monthly/calculator';

// ─── Sub-component interfaces ───────────────────────────────

interface MonthlyReportTableProps {
  data: MonthlyReportData;
  onCellClick?: (title: string, incidentIds: string[]) => void;
  routedIncidents?: Incident[];
  isAdmin?: boolean;
  onUpdateIncident?: (
    requestId: string,
    field: 'Revised Root Cause Type' | 'Revised Identified Root Cause',
    value: string
  ) => void;
  onArchiveReport?: () => void;
  onSaveReport?: () => void;
  isArchived?: boolean;
  isPublicView?: boolean;
}

type TabId = 'sla-dashboard' | 'all-tickets' | 'closed-tickets' | 'first-response' | 'powerbi';

// ─── Editable Revised Cell Component ────────────────────────

function EditableRevisedCell({
  value,
  requestId,
  field,
  currentType,
  isAdmin,
  onSave,
}: {
  value: string;
  requestId: string;
  field: 'Revised Root Cause Type' | 'Revised Identified Root Cause';
  currentType?: string;
  isAdmin: boolean;
  onSave?: (
    requestId: string,
    field: 'Revised Root Cause Type' | 'Revised Identified Root Cause',
    val: string
  ) => void;
}) {
  const isTypeField = field === 'Revised Root Cause Type';

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newVal = e.target.value;
    if (onSave) {
      onSave(requestId, field, newVal);

      if (!isTypeField && newVal) {
        const parentType = findRootCauseType(newVal);
        if (parentType && (!currentType || currentType !== parentType)) {
          onSave(requestId, 'Revised Root Cause Type', parentType);
        }
      }
    }
  };

  if (!isAdmin) {
    return (
      <td
        style={{
          padding: '8px 10px',
          background: 'rgba(56, 189, 248, 0.03)',
        }}
        title={value || 'No revision specified'}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '6px 10px',
            borderRadius: '6px',
            background: value ? 'rgba(56, 189, 248, 0.08)' : 'rgba(56, 189, 248, 0.04)',
            border: '1px solid rgba(56, 189, 248, 0.22)',
            borderLeft: '3px solid #38bdf8',
            color: value ? '#38bdf8' : '#64748b',
            fontSize: '11px',
            fontWeight: 600,
            minHeight: '28px',
          }}
        >
          {value || '—'}
        </div>
      </td>
    );
  }

  return (
    <td
      style={{
        padding: '6px 10px',
        background: 'rgba(56, 189, 248, 0.03)',
      }}
      title={`${field} (Manual Checker Dropdown)`}
    >
      <div
        style={{
          borderRadius: '6px',
          borderLeft: '3px solid #38bdf8',
          paddingLeft: '2px',
        }}
      >
        <select
          style={{
            width: '100%',
            background: '#091426',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            color: value ? '#38bdf8' : '#94a3b8',
            borderRadius: '6px',
            padding: '5px 8px',
            fontSize: '11px',
            outline: 'none',
          }}
          value={value || ''}
          onChange={handleChange}
          aria-label={field}
        >
          <option value="">{isTypeField ? '-- Select Root Cause Type --' : '-- Select Identified Root Cause --'}</option>
          {isTypeField ? (
            <>
              {value && !ROOT_CAUSE_TYPES.includes(value) && <option value={value}>{value} (Current)</option>}
              {ROOT_CAUSE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </>
          ) : (
            <>
              {value && !Object.values(ROOT_CAUSE_FACTORS).some((arr) => arr.includes(value)) && (
                <option value={value}>{value} (Current)</option>
              )}
              {Object.entries(ROOT_CAUSE_FACTORS).map(([type, causes]) => (
                <optgroup key={type} label={type}>
                  {causes.map((cause) => (
                    <option key={cause} value={cause} title={cause}>{cause}</option>
                  ))}
                </optgroup>
              ))}
            </>
          )}
        </select>
      </div>
    </td>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Enhanced Modern SLA Dashboard
// ─────────────────────────────────────────────────────────────────────────────

function EnhancedSLADashboard({
  data,
  allIncidents,
  onCellClick,
}: {
  data: MonthlyReportData;
  allIncidents?: Incident[];
  onCellClick?: (title: string, ids: string[]) => void;
}) {
  const handleClick = (title: string, ids: string[]) => {
    if (onCellClick && ids && ids.length > 0) onCellClick(title, ids);
  };

  const [techSearch, setTechSearch] = useState('');

  const frKPI = data.kpis.find((k) => k.label.toLowerCase().includes('first response')) || data.kpis[0];
  const rtKPI = data.kpis.find((k) => k.label.toLowerCase().includes('resolution')) || data.kpis[1];

  const totalIncidentsCount = (allIncidents && allIncidents.length) || (data.allTickets && data.allTickets.length) || data.technicianTotals.frTotal;
  const allIncidentIds = useMemo(() => {
    if (allIncidents && allIncidents.length > 0) return allIncidents.map((i) => i.requestId);
    if (data.allTickets && data.allTickets.length > 0) return data.allTickets.map((i) => i.requestId);
    return data.technicianTotals.frTotalIds;
  }, [allIncidents, data.allTickets, data.technicianTotals.frTotalIds]);

  const filteredTechs = useMemo(() => {
    if (!techSearch.trim()) return data.technicianSLA;
    const q = techSearch.toLowerCase().trim();
    return data.technicianSLA.filter((t) => t.technician.toLowerCase().includes(q));
  }, [data.technicianSLA, techSearch]);

  const getRateBadge = (rate: number | null, target = 85) => {
    if (rate === null) return <span style={{ color: '#64748b' }}>—</span>;
    const isMet = rate >= target;
    const isWarn = rate >= 70 && rate < target;
    const bg = isMet ? '#00b050' : isWarn ? '#ffc000' : '#ff0000';
    const color = isWarn ? '#000000' : '#ffffff';

    return (
      <span
        style={{
          display: 'inline-block',
          background: bg,
          color,
          fontSize: '11px',
          fontWeight: 800,
          padding: '2px 8px',
          borderRadius: '4px',
          minWidth: '50px',
          textAlign: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }}
      >
        {rate.toFixed(1)}%
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ══ Executive Hero KPI Cards ══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        {/* Total Evaluated / Total Incidents */}
        <div
          onClick={() => handleClick('All Monthly Incidents', allIncidentIds)}
          style={{
            background: '#111c30',
            border: '1px solid #1e293b',
            borderRadius: '14px',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            cursor: allIncidentIds.length > 0 ? 'pointer' : 'default',
          }}
          title={allIncidentIds.length > 0 ? 'Click to view all incidents' : undefined}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Incidents</span>
            <span style={{ fontSize: '16px' }}>🎫</span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 900, color: '#f8fafc', lineHeight: 1 }}>{totalIncidentsCount}</div>
        </div>

        {/* First Response Pass Rate */}
        <div
          onClick={() => handleClick('All First Response Passed', data.technicianTotals.frPassedIds)}
          style={{ background: '#111c30', border: '1px solid #1e293b', borderRadius: '14px', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '6px', cursor: 'pointer' }}
          title="Click to view all passed First Response incidents"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>First Response SLA</span>
            <span style={{ fontSize: '16px' }}>⚡</span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 900, color: (frKPI?.percentageResult ?? 0) >= 85 ? '#34d399' : '#f87171', lineHeight: 1 }}>
            {frKPI ? `${frKPI.percentageResult.toFixed(1)}%` : formatSLAPercentage(data.technicianTotals.frPassRate)}
          </div>
          <span style={{ fontSize: '11px', color: (frKPI?.percentageResult ?? 0) >= 85 ? '#10b981' : '#f87171', fontWeight: 600 }}>
            {(frKPI?.percentageResult ?? 0) >= 85 ? '✓ Target Met (85%)' : '⚠️ Below Target (85%)'}
          </span>
        </div>

        {/* Resolution Time Pass Rate */}
        <div
          onClick={() => handleClick('All Resolution Time Passed', data.technicianTotals.rtPassedIds)}
          style={{ background: '#111c30', border: '1px solid #1e293b', borderRadius: '14px', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '6px', cursor: 'pointer' }}
          title="Click to view all passed Resolution Time incidents"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Resolution SLA</span>
            <span style={{ fontSize: '16px' }}>⏱️</span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 900, color: (rtKPI?.percentageResult ?? 0) >= 85 ? '#34d399' : '#f87171', lineHeight: 1 }}>
            {rtKPI ? `${rtKPI.percentageResult.toFixed(1)}%` : formatSLAPercentage(data.technicianTotals.rtPassRate)}
          </div>
          <span style={{ fontSize: '11px', color: (rtKPI?.percentageResult ?? 0) >= 85 ? '#10b981' : '#f87171', fontWeight: 600 }}>
            {(rtKPI?.percentageResult ?? 0) >= 85 ? '✓ Target Met (85%)' : '⚠️ Below Target (85%)'}
          </span>
        </div>

        {/* Target Benchmark */}
        <div style={{ background: '#111c30', border: '1px solid #1e293b', borderRadius: '14px', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Target Standard</span>
            <span style={{ fontSize: '16px' }}>🎯</span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 900, color: '#60a5fa', lineHeight: 1 }}>85.0%</div>
        </div>
      </div>

      {/* ══ TABLE 1: KPI Objective Summary Table (Modern Dark Presentation) ══ */}
      <div
        style={{
          background: '#111c30',
          border: '1px solid #1e293b',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #1e293b', background: 'linear-gradient(145deg, #17243a, #111c30)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '15px' }}>🎯</span>
            <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Monthly KPI Objectives &amp; Compliance Results
            </h3>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px', border: '2px solid #000000' }}>
            <thead>
              <tr style={{ background: '#ffffcc', borderBottom: '2px solid #000000' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', background: '#ffffcc', color: '#000000', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', border: '1px solid #000000' }}>
                  KPI Description
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'center', background: '#ffffcc', color: '#000000', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', border: '1px solid #000000' }}>
                  Target
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'center', background: '#ffffcc', color: '#000000', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', border: '1px solid #000000' }}>
                  Count of Passed
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'center', background: '#ffffcc', color: '#000000', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', border: '1px solid #000000' }}>
                  Total IRs
                </th>
                <th style={{ padding: '10px 16px', textAlign: 'center', background: '#ffffcc', color: '#000000', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', border: '1px solid #000000' }}>
                  Percentage Value Result
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'center', background: '#ffffcc', color: '#000000', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', border: '1px solid #000000' }}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {data.kpis.map((kpi) => {
                const isMet = kpi.percentageResult >= kpi.targetPercent;
                return (
                  <tr
                    key={kpi.label}
                    style={{ borderBottom: '1px solid #000000' }}
                  >
                    <td style={{ padding: '12px 16px', fontWeight: 800, background: '#ffffcc', color: '#000000', border: '1px solid #000000' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{kpi.label.includes('First') ? '⚡' : '⏱️'}</span>
                        <span>{kpi.label}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', background: '#ffffff', color: '#ff0000', fontWeight: 800, fontSize: '13px', border: '1px solid #000000' }}>
                      {kpi.targetPercent}%
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', background: '#ffffff', color: '#000000', fontWeight: 700, border: '1px solid #000000' }}>
                      {kpi.countOfPassed}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', background: '#ffffff', color: '#000000', fontWeight: 700, border: '1px solid #000000' }}>
                      {kpi.totalIRs}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', background: isMet ? '#00b050' : '#ff0000', color: '#ffffff', fontWeight: 900, fontSize: '14px', border: '1px solid #000000' }}>
                      {kpi.percentageResult.toFixed(1)}%
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', background: isMet ? '#00b050' : '#ff0000', color: '#ffffff', fontWeight: 800, border: '1px solid #000000' }}>
                      {isMet ? ' Passed' : ' Failed'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══ TABLE 2: Technician SLA Breakdown Table (Modern Dark Presentation) ══ */}
      <div
        style={{
          background: '#111c30',
          border: '1px solid #1e293b',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
        }}
      >
        {/* Table Title and Quick Search */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid #1e293b',
            background: 'linear-gradient(145deg, #17243a, #111c30)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '15px' }}>👥</span>
              <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Technician SLA Performance Breakdown
              </h3>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#64748b' }}>🔍</span>
            <input
              type="text"
              placeholder="Filter technician…"
              value={techSearch}
              onChange={(e) => setTechSearch(e.target.value)}
              style={{
                background: '#091426',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '11px',
                color: '#f8fafc',
                outline: 'none',
                width: '160px',
              }}
            />
            {techSearch && (
              <button
                type="button"
                onClick={() => setTechSearch('')}
                style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px', border: '2px solid #000000' }}>
            <thead>
              {/* Main Group Headers */}
              <tr>
                <th
                  rowSpan={2}
                  style={{
                    padding: '10px 16px',
                    textAlign: 'left',
                    background: '#ffffcc',
                    color: '#000000',
                    fontSize: '11px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    border: '1px solid #000000',
                    width: '200px',
                  }}
                >
                  TECHNICIAN
                </th>
                <th
                  colSpan={4}
                  style={{
                    padding: '10px 14px',
                    textAlign: 'center',
                    background: '#00ffff',
                    color: '#000000',
                    fontSize: '12px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    border: '1px solid #000000',
                  }}
                >
                  ⚡ FIRST RESPONSE
                </th>
                <th
                  colSpan={4}
                  style={{
                    padding: '10px 14px',
                    textAlign: 'center',
                    background: '#00ff00',
                    color: '#000000',
                    fontSize: '12px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    border: '1px solid #000000',
                  }}
                >
                  ⏱️ RESOLUTION TIME
                </th>
              </tr>
              {/* Sub-column Headers */}
              <tr>
                {/* First Response Sub-cols */}
                <th style={{ padding: '8px 12px', textAlign: 'center', background: '#ffffcc', color: '#000000', fontSize: '10px', fontWeight: 800, border: '1px solid #000000' }}>Total IRs</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', background: '#ffffcc', color: '#000000', fontSize: '10px', fontWeight: 800, border: '1px solid #000000' }}>Failed</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', background: '#ffffcc', color: '#000000', fontSize: '10px', fontWeight: 800, border: '1px solid #000000' }}>Passed</th>
                <th style={{ padding: '8px 14px', textAlign: 'center', background: '#ffffcc', color: '#000000', fontSize: '10px', fontWeight: 800, border: '1px solid #000000' }}>SLA Pass Rate</th>

                {/* Resolution Time Sub-cols */}
                <th style={{ padding: '8px 12px', textAlign: 'center', background: '#ffffcc', color: '#000000', fontSize: '10px', fontWeight: 800, border: '1px solid #000000' }}>Total IRs</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', background: '#ffffcc', color: '#000000', fontSize: '10px', fontWeight: 800, border: '1px solid #000000' }}>Failed</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', background: '#ffffcc', color: '#000000', fontSize: '10px', fontWeight: 800, border: '1px solid #000000' }}>Passed</th>
                <th style={{ padding: '8px 14px', textAlign: 'center', background: '#ffffcc', color: '#000000', fontSize: '10px', fontWeight: 800, border: '1px solid #000000' }}>SLA Pass Rate</th>
              </tr>
            </thead>
            <tbody>
              {filteredTechs.map((row) => (
                <tr
                  key={row.technician}
                  style={{ borderBottom: '1px solid #000000' }}
                >
                  {/* Technician Name */}
                  <td style={{ padding: '9px 16px', fontWeight: 800, background: '#ffff00', color: '#000000', border: '1px solid #000000', whiteSpace: 'nowrap' }}>
                    {row.technician}
                  </td>

                  {/* First Response Columns */}
                  <td
                    style={{ padding: '9px 12px', textAlign: 'center', cursor: 'pointer', background: '#ffffff', color: '#000000', fontWeight: 700, border: '1px solid #000000' }}
                    onClick={() => handleClick(`${row.technician} — First Response — Total`, row.frTotalIds)}
                    title="Click to view First Response total incidents"
                  >
                    {row.frTotal > 0 ? row.frTotal : '—'}
                  </td>
                  <td
                    style={{
                      padding: '9px 12px',
                      textAlign: 'center',
                      cursor: row.frFailed > 0 ? 'pointer' : 'default',
                      background: row.frFailed > 0 ? '#fce4ec' : '#ffffff',
                      color: row.frFailed > 0 ? '#cc0000' : '#000000',
                      fontWeight: row.frFailed > 0 ? 800 : 500,
                      border: '1px solid #000000',
                    }}
                    onClick={() => handleClick(`${row.technician} — First Response — Failed`, row.frFailedIds)}
                    title="Click to view First Response failed incidents"
                  >
                    {row.frFailed > 0 ? row.frFailed : 0}
                  </td>
                  <td
                    style={{ padding: '9px 12px', textAlign: 'center', cursor: 'pointer', background: '#ffffff', color: '#000000', fontWeight: 700, border: '1px solid #000000' }}
                    onClick={() => handleClick(`${row.technician} — First Response — Passed`, row.frPassedIds)}
                    title="Click to view First Response passed incidents"
                  >
                    {row.frPassed}
                  </td>
                  <td style={{ padding: '9px 14px', textAlign: 'center', background: '#ffffff', border: '1px solid #000000' }}>
                    {getRateBadge(row.frPassRate)}
                  </td>

                  {/* Resolution Time Columns */}
                  <td
                    style={{ padding: '9px 12px', textAlign: 'center', cursor: 'pointer', background: '#ffffff', color: '#000000', fontWeight: 700, border: '1px solid #000000' }}
                    onClick={() => handleClick(`${row.technician} — Resolution — Total`, row.rtTotalIds)}
                    title="Click to view Resolution total incidents"
                  >
                    {row.rtTotal > 0 ? row.rtTotal : '—'}
                  </td>
                  <td
                    style={{
                      padding: '9px 12px',
                      textAlign: 'center',
                      cursor: row.rtFailed > 0 ? 'pointer' : 'default',
                      background: row.rtFailed > 0 ? '#fce4ec' : '#ffffff',
                      color: row.rtFailed > 0 ? '#cc0000' : '#000000',
                      fontWeight: row.rtFailed > 0 ? 800 : 500,
                      border: '1px solid #000000',
                    }}
                    onClick={() => handleClick(`${row.technician} — Resolution — Failed`, row.rtFailedIds)}
                    title="Click to view Resolution failed incidents"
                  >
                    {row.rtFailed > 0 ? row.rtFailed : 0}
                  </td>
                  <td
                    style={{ padding: '9px 12px', textAlign: 'center', cursor: 'pointer', background: '#ffffff', color: '#000000', fontWeight: 700, border: '1px solid #000000' }}
                    onClick={() => handleClick(`${row.technician} — Resolution — Passed`, row.rtPassedIds)}
                    title="Click to view Resolution passed incidents"
                  >
                    {row.rtPassed}
                  </td>
                  <td style={{ padding: '9px 14px', textAlign: 'center', background: '#ffffff', border: '1px solid #000000' }}>
                    {getRateBadge(row.rtPassRate)}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Summary Totals Row */}
            <tfoot>
              <tr style={{ background: '#ffd966', fontWeight: 900, border: '2px solid #000000' }}>
                <td style={{ padding: '10px 16px', background: '#ffd966', color: '#000000', fontSize: '11px', textTransform: 'uppercase', border: '1px solid #000000' }}>
                  TOTAL
                </td>
                {/* FR Totals */}
                <td
                  style={{ padding: '10px 12px', textAlign: 'center', background: '#ffd966', color: '#000000', cursor: 'pointer', border: '1px solid #000000' }}
                  onClick={() => handleClick('Total — First Response — Total', data.technicianTotals.frTotalIds)}
                >
                  {data.technicianTotals.frTotal}
                </td>
                <td
                  style={{ padding: '10px 12px', textAlign: 'center', background: '#ffd966', color: data.technicianTotals.frFailed > 0 ? '#cc0000' : '#000000', cursor: 'pointer', border: '1px solid #000000' }}
                  onClick={() => handleClick('Total — First Response — Failed', data.technicianTotals.frFailedIds)}
                >
                  {data.technicianTotals.frFailed}
                </td>
                <td
                  style={{ padding: '10px 12px', textAlign: 'center', background: '#ffd966', color: '#000000', cursor: 'pointer', border: '1px solid #000000' }}
                  onClick={() => handleClick('Total — First Response — Passed', data.technicianTotals.frPassedIds)}
                >
                  {data.technicianTotals.frPassed}
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'center', background: '#ffd966', border: '1px solid #000000' }}>
                  {getRateBadge(data.technicianTotals.frPassRate)}
                </td>

                {/* RT Totals */}
                <td
                  style={{ padding: '10px 12px', textAlign: 'center', background: '#ffd966', color: '#000000', cursor: 'pointer', border: '1px solid #000000' }}
                  onClick={() => handleClick('Total — Resolution — Total', data.technicianTotals.rtTotalIds)}
                >
                  {data.technicianTotals.rtTotal}
                </td>
                <td
                  style={{ padding: '10px 12px', textAlign: 'center', background: '#ffd966', color: data.technicianTotals.rtFailed > 0 ? '#cc0000' : '#000000', cursor: 'pointer', border: '1px solid #000000' }}
                  onClick={() => handleClick('Total — Resolution — Failed', data.technicianTotals.rtFailedIds)}
                >
                  {data.technicianTotals.rtFailed}
                </td>
                <td
                  style={{ padding: '10px 12px', textAlign: 'center', background: '#ffd966', color: '#000000', cursor: 'pointer', border: '1px solid #000000' }}
                  onClick={() => handleClick('Total — Resolution — Passed', data.technicianTotals.rtPassedIds)}
                >
                  {data.technicianTotals.rtPassed}
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'center', background: '#ffd966', border: '1px solid #000000' }}>
                  {getRateBadge(data.technicianTotals.rtPassRate)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ══ Executive Remarks & Observations (Card Layout) ══ */}
      {data.remarks && (
        <div
          style={{
            background: '#111c30',
            border: '1px solid #1e293b',
            borderRadius: '16px',
            padding: '20px 24px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <span style={{ fontSize: '16px' }}>📝</span>
            <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Executive Remarks &amp; Strategic Observations
            </h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: '#cbd5e1', lineHeight: 1.6 }}>
            {data.remarks.split('\n').map((line, i) => {
              const trimmed = line.trim();
              if (!trimmed) return null;
              const isHeader = trimmed.startsWith('Target ') || trimmed.startsWith('Observations:') || trimmed.startsWith('Recommendation:');
              return (
                <p
                  key={i}
                  style={{
                    margin: 0,
                    fontWeight: isHeader ? 800 : 400,
                    color: isHeader ? '#93c5fd' : '#cbd5e1',
                    fontSize: isHeader ? '12px' : '12px',
                  }}
                >
                  {trimmed}
                </p>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Enhanced Modern Ticket Grid
// ─────────────────────────────────────────────────────────────────────────────

function EnhancedTicketGrid({
  incidents,
  columns,
  title,
  emptyMessage,
  isAdmin = false,
  onUpdateIncident,
}: {
  incidents: Incident[];
  columns: readonly string[];
  title: string;
  emptyMessage: string;
  isAdmin?: boolean;
  onUpdateIncident?: (
    requestId: string,
    field: 'Revised Root Cause Type' | 'Revised Identified Root Cause',
    value: string
  ) => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const statuses = useMemo(() => {
    const s = new Set<string>();
    incidents.forEach((inc) => {
      const st = inc.requestStatus || getRawValue(inc, 'Request Status');
      if (st) s.add(st);
    });
    return Array.from(s).sort();
  }, [incidents]);

  const filtered = useMemo(() => {
    let list = incidents;

    if (statusFilter !== 'ALL') {
      list = list.filter((inc) => (inc.requestStatus || getRawValue(inc, 'Request Status')).toLowerCase() === statusFilter.toLowerCase());
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter((inc) => columns.some((col) => getRawValue(inc, col).toLowerCase().includes(term)));
    }

    return list;
  }, [incidents, statusFilter, searchTerm, columns]);

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      const va = getRawValue(a, sortCol).toLowerCase();
      const vb = getRawValue(b, sortCol).toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortCol, sortDir]);

  const totalPages = pageSize === -1 ? 1 : Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = pageSize === -1 ? sorted : sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortCol(col);
      setSortDir('asc');
    }
    setCurrentPage(1);
  };

  return (
    <div
      style={{
        background: '#111c30',
        border: '1px solid #1e293b',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header and Filter Toolbar */}
      <div
        style={{
          padding: '16px 22px',
          borderBottom: '1px solid #1e293b',
          background: 'linear-gradient(145deg, #17243a, #111c30)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {title}
          </h3>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
            Showing {filtered.length} of {incidents.length} records
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Search */}
          <input
            type="text"
            placeholder="Search records…"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            style={{
              background: '#091426',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '11px',
              color: '#f8fafc',
              outline: 'none',
              width: '180px',
            }}
          />

          {/* Status Filter */}
          {statuses.length > 0 && (
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                background: '#091426',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '6px 10px',
                fontSize: '11px',
                color: '#94a3b8',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="ALL">Status: All</option>
              {statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}

          {/* Page Size */}
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            style={{
              background: '#091426',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '6px 8px',
              fontSize: '11px',
              color: '#94a3b8',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value={10}>10 / page</option>
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
            <option value={-1}>All</option>
          </select>
        </div>
      </div>

      {incidents.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>{emptyMessage}</div>
      ) : (
        <>
          <div style={{ overflowX: 'auto', flex: 1 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#091426', borderBottom: '1px solid #1e293b' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', width: '40px' }}>#</th>
                  {columns.map((col) => {
                    const isRevisedCol = col === 'Revised Root Cause Type' || col === 'Revised Identified Root Cause';
                    return (
                      <th
                        key={col}
                        onClick={() => handleSort(col)}
                        style={{
                          padding: '10px 14px',
                          textAlign: 'left',
                          color: isRevisedCol ? '#38bdf8' : sortCol === col ? '#60a5fa' : '#64748b',
                          fontSize: '10px',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          whiteSpace: 'nowrap',
                          cursor: 'pointer',
                          background: isRevisedCol ? 'rgba(56, 189, 248, 0.08)' : 'transparent',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>{col.replace(/\n/g, ' ')}</span>
                          {sortCol === col && <span>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {paginated.map((inc, idx) => {
                  const rowIndex = (currentPage - 1) * (pageSize === -1 ? 0 : pageSize) + idx + 1;
                  const isOverdue = inc.firstResponseOverdue || inc.resolutionOverdue;

                  return (
                    <tr
                      key={inc.requestId || idx}
                      style={{
                        borderBottom: '1px solid rgba(30,41,59,0.7)',
                        background: isOverdue ? 'rgba(239,68,68,0.03)' : 'transparent',
                        transition: 'background 0.12s ease',
                      }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = 'rgba(37,99,235,0.06)')}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = isOverdue ? 'rgba(239,68,68,0.03)' : 'transparent')}
                    >
                      <td style={{ padding: '10px 14px', color: '#64748b', fontWeight: 700 }}>{rowIndex}</td>
                      {columns.map((col) => {
                        if (col === 'Revised Root Cause Type' || col === 'Revised Identified Root Cause') {
                          const val = getRawValue(inc, col);
                          const currentType = getRawValue(inc, 'Revised Root Cause Type') || getRawValue(inc, 'Root Cause Type');
                          return (
                            <EditableRevisedCell
                              key={col}
                              value={val}
                              requestId={inc.requestId}
                              field={col}
                              currentType={currentType}
                              isAdmin={isAdmin}
                              onSave={onUpdateIncident}
                            />
                          );
                        }

                        const val = getRawValue(inc, col);
                        const colLower = col.toLowerCase();

                        if (colLower.includes('request status')) {
                          const s = val.toLowerCase();
                          const isClosed = s === 'closed' || s === 'resolved';
                          return (
                            <td key={col} style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 800,
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  background: isClosed ? 'rgba(16,185,129,0.12)' : 'rgba(59,130,246,0.12)',
                                  color: isClosed ? '#34d399' : '#60a5fa',
                                  border: `1px solid ${isClosed ? 'rgba(16,185,129,0.3)' : 'rgba(59,130,246,0.3)'}`,
                                }}
                              >
                                {val || '—'}
                              </span>
                            </td>
                          );
                        }

                        if (colLower.includes('overdue status')) {
                          if (title.toLowerCase().includes('acceptable')) {
                            return (
                              <td key={col} style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                                <span
                                  style={{
                                    fontSize: '10px',
                                    fontWeight: 800,
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    background: 'rgba(16,185,129,0.15)',
                                    color: '#34d399',
                                    border: '1px solid rgba(16,185,129,0.3)',
                                  }}
                                  title="Lapsed in ticketing system, but accepted due to after-hours filing (non-ISS department)"
                                >
                                  ✓ ACCEPTED (AFTER-HOURS)
                                </span>
                              </td>
                            );
                          }

                          const isOver = val.toLowerCase() === 'true';
                          return (
                            <td key={col} style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 800,
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  background: isOver ? 'rgba(239,68,68,0.14)' : 'rgba(16,185,129,0.1)',
                                  color: isOver ? '#f87171' : '#34d399',
                                }}
                              >
                                {isOver ? '⚠️ OVERDUE' : '✓ OK'}
                              </span>
                            </td>
                          );
                        }

                        return (
                          <td key={col} style={{ padding: '10px 14px', color: '#e2e8f0', whiteSpace: 'nowrap' }} title={val}>
                            {val || '—'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ padding: '12px 20px', borderTop: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                Page {currentPage} of {totalPages} ({filtered.length} items)
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                  style={{
                    background: '#091426',
                    border: '1px solid #1e293b',
                    color: currentPage <= 1 ? '#475569' : '#94a3b8',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: currentPage <= 1 ? 'default' : 'pointer',
                  }}
                >
                  ← Prev
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  style={{
                    background: '#091426',
                    border: '1px solid #1e293b',
                    color: currentPage >= totalPages ? '#475569' : '#94a3b8',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: currentPage >= totalPages ? 'default' : 'pointer',
                  }}
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

// ─────────────────────────────────────────────────────────────────────────────
// Main Monthly Report Table Component
// ─────────────────────────────────────────────────────────────────────────────

export function MonthlyReportTable({
  data,
  onCellClick,
  routedIncidents,
  isAdmin = false,
  isPublicView = false,
  onUpdateIncident,
  onArchiveReport,
  onSaveReport,
  isArchived = false,
}: MonthlyReportTableProps) {
  const [activeTab, setActiveTab] = useState<TabId>('sla-dashboard');
  const [internalSaved, setInternalSaved] = useState(false);

  const handleSaveReport = useCallback(() => {
    if (onSaveReport) {
      onSaveReport();
    } else if (onArchiveReport) {
      onArchiveReport();
    } else {
      const period = data.reportPeriod || 'Monthly Period';
      const title = data.reportTitle || `Monthly Overall Ticket Report - ${period}`;
      const id = `monthly-${period.toLowerCase().replace(/[^a-z0-9]/g, '-') || Date.now()}`;
      saveReport({
        id,
        type: 'monthly',
        title,
        period,
        reportData: data,
        routedIncidents,
      });
    }
    setInternalSaved(true);
    setTimeout(() => setInternalSaved(false), 4000);
  }, [onSaveReport, onArchiveReport, data, routedIncidents]);

  const savedState = isArchived || internalSaved;
  const allIncidents = routedIncidents || data.allTickets;
  const acceptableFR = useMemo(() => filterAcceptableFirstResponse(allIncidents), [allIncidents]);

  const tabs: { id: TabId; label: string; count: number; icon: string }[] = [
    { id: 'sla-dashboard', label: 'SLA Dashboard', count: 0, icon: '📊' },
    { id: 'all-tickets', label: 'All Tickets', count: allIncidents.length, icon: '📋' },
    { id: 'closed-tickets', label: 'Closed Tickets', count: data.closedTickets.length, icon: '✅' },
    { id: 'first-response', label: 'Acceptable First Response', count: acceptableFR.length, icon: '⏱️' },
    { id: 'powerbi', label: 'Power BI Dashboard', count: 0, icon: '📈' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', width: '100%', maxWidth: '100%' }} id="monthly-report-canvas">
      {/* ══ Modern Header Bar ══ */}
      <div
        style={{
          background: 'linear-gradient(145deg, #111c30 0%, #0d1a2e 100%)',
          border: '1px solid #1e293b',
          borderRadius: '16px',
          padding: '18px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #2563eb, #0891b2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              boxShadow: '0 4px 14px rgba(37,99,235,0.3)',
            }}
          >
            📊
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#f8fafc', margin: 0, letterSpacing: '-0.01em' }}>
                Monthly SLA Report
              </h2>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: 'rgba(37,99,235,0.15)',
                  border: '1px solid rgba(37,99,235,0.3)',
                  color: '#60a5fa',
                }}
              >
                {data.reportPeriod || 'Monthly Review'}
              </span>
            </div>
          </div>
        </div>

        {/* Right Controls: Save */}
        {!isPublicView && (
          <button
            type="button"
            onClick={handleSaveReport}
            style={{
              background: savedState ? 'rgba(16,185,129,0.15)' : '#2563eb',
              border: savedState ? '1px solid #10b981' : 'none',
              color: '#ffffff',
              padding: '7px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: savedState ? 'none' : '0 2px 10px rgba(37,99,235,0.3)',
            }}
          >
            {savedState ? '✓ Archived' : '💾 Archive Report'}
          </button>
        )}
      </div>

      {/* ══ Modern Tab Bar Navigation ══ */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          overflowX: 'auto',
          paddingBottom: '2px',
          borderBottom: '1px solid #1e293b',
        }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: isActive ? '#17243a' : 'transparent',
                color: isActive ? '#60a5fa' : '#94a3b8',
                fontWeight: isActive ? 800 : 600,
                fontSize: '12px',
                cursor: 'pointer',
                borderBottom: isActive ? '2px solid #2563eb' : '2px solid transparent',
                transition: 'all 0.12s ease',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: '14px' }}>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span
                  style={{
                    background: isActive ? '#2563eb' : '#1e293b',
                    color: '#ffffff',
                    fontSize: '10px',
                    fontWeight: 800,
                    padding: '1px 6px',
                    borderRadius: '999px',
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ══ Active Tab Content ══ */}
      <div>
        {activeTab === 'sla-dashboard' && (
          <EnhancedSLADashboard data={data} allIncidents={allIncidents} onCellClick={onCellClick} />
        )}

        {activeTab === 'all-tickets' && (
          <EnhancedTicketGrid
            incidents={allIncidents}
            columns={ALL_TICKETS_COLUMNS}
            title="All Incidents"
            emptyMessage="No tickets found for this period."
            isAdmin={isAdmin}
            onUpdateIncident={onUpdateIncident}
          />
        )}

        {activeTab === 'closed-tickets' && (
          <EnhancedTicketGrid
            incidents={data.closedTickets}
            columns={CLOSED_TICKETS_COLUMNS}
            title="Closed Incidents"
            emptyMessage="No closed tickets found for this period."
            isAdmin={isAdmin}
            onUpdateIncident={onUpdateIncident}
          />
        )}

        {activeTab === 'first-response' && (
          <EnhancedTicketGrid
            incidents={acceptableFR}
            columns={FIRST_RESPONSE_COLUMNS}
            title="Acceptable First Response"
            emptyMessage="No tickets with acceptable first response found."
            isAdmin={isAdmin}
            onUpdateIncident={onUpdateIncident}
          />
        )}

        {activeTab === 'powerbi' && (
          <div
            style={{
              background: '#111c30',
              border: '1px solid #1e293b',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ fontSize: '20px' }}>📈</span>
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                  Microsoft Power BI Embedded SLA Report
                </h3>
              </div>
            </div>
            <div style={{ width: '100%', height: '700px', borderRadius: '10px', overflow: 'hidden', border: '1px solid #1e293b' }}>
              <iframe
                title="Monthly Incident Report"
                src="https://app.powerbi.com/view?r=eyJrIjoiMGMwZjQ2MzItODg0NS00YzhhLThjZTAtYTk1OGI1Y2MzMDRiIiwidCI6IjA0MjUwYzE0LTBiNzAtNGY5Zi04Yzg3LWU5OGZiOTM0NjI4ZiIsImMiOjEwfQ%3D%3D"
                style={{ width: '100%', height: '100%', border: 'none' }}
                allowFullScreen
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
