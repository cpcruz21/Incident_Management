'use client';

/**
 * Global Filter Bar for IR Analytics Dashboard
 */

import React from 'react';
import type { IRDashboardFilters, DateFilterField } from '@/types/ir-analytics';

interface FilterBarProps {
  filters: IRDashboardFilters;
  onChange: (filters: IRDashboardFilters) => void;
  technicians: string[];
  incidentTypes: string[];
  departments: string[];
  statuses: string[];
  activeFilterCount: number;
}

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 800,
  color: 'var(--ui-secondary, #94a3b8)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  display: 'block',
  marginBottom: '5px',
};

const inputStyle: React.CSSProperties = {
  background: 'var(--ui-inset, #091426)',
  border: '1px solid var(--ui-control-border)',
  borderRadius: '8px',
  color: 'var(--ui-text, #f8fafc)',
  fontSize: '12px',
  padding: '7px 12px',
  width: '100%',
  fontFamily: 'inherit',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
};

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: '130px', flex: 1 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

export function IRFilterBar({
  filters,
  onChange,
  technicians,
  incidentTypes,
  departments,
  statuses,
  activeFilterCount,
}: FilterBarProps) {
  function update<K extends keyof IRDashboardFilters>(key: K, value: IRDashboardFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  function reset() {
    onChange({
      dateFrom: '',
      dateTo: '',
      dateField: 'createdDate',
      technician: '',
      status: '',
      incidentType: '',
      department: '',
      agingCategory: '',
      search: '',
      inactivityThreshold: 7,
      includeResolved: false,
    });
  }

  const dateFieldLabels: Record<DateFilterField, string> = {
    createdDate: 'Created Date',
    lastUpdated: 'Last Updated',
    resolvedDate: 'Resolved Date',
    lastMovementDate: 'Last Movement Date',
  };

  return (
    <div
      style={{
        background: 'var(--ui-surface, #111c30)',
        border: '1px solid var(--ui-panel-border, var(--ui-border))',
        borderRadius: '16px',
        padding: '18px 22px',
        marginBottom: '20px',
        boxShadow: '0 4px 20px var(--ui-shadow, rgba(0,0,0,0.25))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ui-text, #f8fafc)' }}>🔍 Filters</span>
          {activeFilterCount > 0 && (
            <span
              style={{
                background: '#2563eb',
                color: '#fff',
                fontSize: '10px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '999px',
              }}
            >
              {activeFilterCount} active
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={reset}
            style={{
              background: 'transparent',
              border: '1px solid var(--ui-border, #334e68)',
              color: 'var(--ui-secondary, #94a3b8)',
              borderRadius: '6px',
              padding: '5px 12px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* Row 1: Search + Date range */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
        <FilterField label="Search (Ticket ID / IR ID)">
          <input
            type="text"
            value={filters.search}
            onChange={(e) => update('search', e.target.value)}
            placeholder="Search by ID or description..."
            style={inputStyle}
          />
        </FilterField>

        <FilterField label={`Date Field (${dateFieldLabels[filters.dateField]})`}>
          <select value={filters.dateField} onChange={(e) => update('dateField', e.target.value as DateFilterField)} style={selectStyle}>
            <option value="createdDate">Created Date</option>
            <option value="lastUpdated">Last Updated</option>
            <option value="resolvedDate">Resolved Date</option>
            <option value="lastMovementDate">Last Movement Date</option>
          </select>
        </FilterField>

        <FilterField label="Date From">
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => update('dateFrom', e.target.value)}
            style={inputStyle}
          />
        </FilterField>

        <FilterField label="Date To">
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => update('dateTo', e.target.value)}
            style={inputStyle}
          />
        </FilterField>
      </div>

      {/* Row 2: Entity filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
        <FilterField label="Technician">
          <select value={filters.technician} onChange={(e) => update('technician', e.target.value)} style={selectStyle}>
            <option value="">All Technicians</option>
            {technicians.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Status">
          <select value={filters.status} onChange={(e) => update('status', e.target.value)} style={selectStyle}>
            <option value="">All Statuses ({statuses.length})</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Incident Type">
          <select value={filters.incidentType} onChange={(e) => update('incidentType', e.target.value)} style={selectStyle}>
            <option value="">All Types</option>
            {incidentTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Department / Team">
          <select value={filters.department} onChange={(e) => update('department', e.target.value)} style={selectStyle}>
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Aging Category">
          <select value={filters.agingCategory} onChange={(e) => update('agingCategory', e.target.value)} style={selectStyle}>
            <option value="">All Aging Categories</option>
            <option value="0-2d">0–2 days</option>
            <option value="3-6d">3–6 days</option>
            <option value="7-13d">7–13 days</option>
            <option value="14-29d">14–29 days</option>
            <option value="30+d">30+ days</option>
            <option value="resolved">Resolved</option>
          </select>
        </FilterField>
      </div>

      {/* Row 3: Inactivity settings */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
        <FilterField label="Inactivity Threshold (days)">
          <input
            type="number"
            min={1}
            max={365}
            value={filters.inactivityThreshold}
            onChange={(e) => update('inactivityThreshold', Math.max(1, parseInt(e.target.value) || 7))}
            style={{ ...inputStyle, maxWidth: '100px' }}
          />
        </FilterField>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px' }}>
          <input
            id="includeResolved"
            type="checkbox"
            checked={filters.includeResolved}
            onChange={(e) => update('includeResolved', e.target.checked)}
            style={{ cursor: 'pointer', accentColor: '#2563eb' }}
          />
          <label htmlFor="includeResolved" style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer', color: 'var(--ui-secondary, #94a3b8)' }}>
            Include Resolved in Aging / Inactivity Views
          </label>
        </div>
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--ui-border, #1e3a5f)' }}>
          {filters.search && <FilterChip label={`Search: "${filters.search}"`} onRemove={() => update('search', '')} />}
          {filters.technician && <FilterChip label={`Tech: ${filters.technician}`} onRemove={() => update('technician', '')} />}
          {filters.status && <FilterChip label={`Status: ${filters.status}`} onRemove={() => update('status', '')} />}
          {filters.incidentType && <FilterChip label={`Type: ${filters.incidentType}`} onRemove={() => update('incidentType', '')} />}
          {filters.department && <FilterChip label={`Dept: ${filters.department}`} onRemove={() => update('department', '')} />}
          {filters.agingCategory && <FilterChip label={`Aging: ${filters.agingCategory}`} onRemove={() => update('agingCategory', '')} />}
          {(filters.dateFrom || filters.dateTo) && (
            <FilterChip
              label={`${filters.dateField}: ${filters.dateFrom || '?'} → ${filters.dateTo || '?'}`}
              onRemove={() => { update('dateFrom', ''); update('dateTo', ''); }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        background: 'rgba(37,99,235,0.15)',
        border: '1px solid rgba(37,99,235,0.35)',
        color: 'var(--ui-link, #93c5fd)',
        fontSize: '11px',
        fontWeight: 600,
        padding: '3px 8px',
        borderRadius: '999px',
      }}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--ui-link, #93c5fd)',
          cursor: 'pointer',
          fontSize: '12px',
          lineHeight: 1,
          padding: 0,
        }}
      >
        ×
      </button>
    </span>
  );
}

