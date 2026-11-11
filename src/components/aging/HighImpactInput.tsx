'use client';

import React, { useId, useState } from 'react';
import type { AgingRemarksRow, HighImpactIncident } from '@/types/aging';
import type { Incident } from '@/types/incident';
import { AlertTriangle, Flame } from 'lucide-react';

interface HighImpactInputProps {
  remarksRows: AgingRemarksRow[];
  routedIncidents?: Incident[];
  existingIds: string[];
  accountName?: string;
  onAdd: (item: HighImpactIncident) => void;
}

export function HighImpactInput({
  remarksRows,
  routedIncidents,
  existingIds,
  accountName,
  onAdd,
}: HighImpactInputProps) {
  const formId = useId();
  const [requestId, setRequestId] = useState('');
  const [candidate, setCandidate] = useState<{
    requestId: string;
    department: string;
    category: string;
    subCategory?: string;
    description: string;
    agingDays: number;
    recentUpdate: string;
    responsibleOrDependency: string;
  } | null>(null);
  const [impactLevel, setImpactLevel] = useState<'Critical' | 'High' | 'Major' | 'Escalated'>('High');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const validate = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setCandidate(null);
    setConfirmed(false);

    const q = requestId.trim().toLowerCase();
    if (!q) {
      setError('Please enter a Request ID.');
      return;
    }

    if (existingIds.some((id) => id.toLowerCase() === q)) {
      setError(`Ticket ${requestId} is already marked as High Impact.`);
      return;
    }

    // Try finding in remarksRows first
    const row = remarksRows.find(
      (r) => r.requestId && r.requestId.trim().toLowerCase() === q
    );
    if (row) {
      setCandidate({
        requestId: row.requestId,
        department: row.department || 'Not Specified',
        category: row.category || 'General',
        subCategory: row.subCategory || '',
        description: row.description || '',
        agingDays: row.agingDays || 0,
        recentUpdate: row.recentUpdate || '',
        responsibleOrDependency: row.responsibleOrDependency || 'Unassigned',
      });
      return;
    }

    // Fallback: search in routedIncidents
    const inc = routedIncidents?.find(
      (i) => i.requestId && i.requestId.trim().toLowerCase() === q
    );
    if (inc) {
      setCandidate({
        requestId: inc.requestId,
        department: inc.department || String(inc.rawData?.['Department'] || 'Not Specified'),
        category: inc.category || String(inc.rawData?.['Category'] || 'General'),
        subCategory: inc.subCategory || String(inc.rawData?.['Sub Category'] || ''),
        description: inc.description || inc.subject || '',
        agingDays: typeof inc.agingDays === 'number' ? inc.agingDays : 0,
        recentUpdate: inc.recentUpdate || '',
        responsibleOrDependency: inc.assignedTeam || inc.sourceTeam || 'Unassigned',
      });
      return;
    }

    setError(`Request ID "${requestId}" was not found in this aging report.`);
  };

  const handleAdd = () => {
    if (!candidate || !confirmed) return;
    try {
      const highImpactItem: HighImpactIncident = {
        requestId: candidate.requestId,
        department: candidate.department,
        category: candidate.category,
        subCategory: candidate.subCategory,
        description: candidate.description,
        agingDays: candidate.agingDays,
        recentUpdate: candidate.recentUpdate,
        responsibleOrDependency: candidate.responsibleOrDependency,
        impactLevel,
        reason: reason.trim() || `${impactLevel} priority aging incident`,
        addedBy: accountName || 'Admin',
        addedAt: new Date().toISOString(),
      };

      onAdd(highImpactItem);
      setMessage(`${candidate.requestId} was added to High Impact. Save report to persist this change.`);
      setRequestId('');
      setCandidate(null);
      setConfirmed(false);
      setReason('');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add to High Impact.');
    }
  };

  return (
    <section className="acceptable-fr-input high-impact-input" aria-labelledby={`${formId}-title`}>
      <h3 id={`${formId}-title`} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444' }}>
        <Flame size={18} aria-hidden="true" />
        <span>Add High Impact Incident</span>
      </h3>
      <p>Validate an aging ticket in this report to designate it as a High Impact incident.</p>
      
      <form onSubmit={validate} className="acceptable-fr-form">
        <label htmlFor={`${formId}-request-id`}>Request ID</label>
        <input
          id={`${formId}-request-id`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${formId}-error` : undefined}
          value={requestId}
          placeholder="Enter Request ID (e.g. IR-56827)"
          autoComplete="off"
          required
          onChange={(event) => {
            setRequestId(event.target.value);
            setCandidate(null);
            setConfirmed(false);
            setError('');
            setMessage('');
          }}
        />
        <button type="submit" className="btn btn-secondary">Validate Request ID</button>
      </form>

      {candidate && (
        <div className="acceptable-fr-confirmation" style={{ borderLeft: '3px solid #ef4444', paddingLeft: '14px', marginTop: '14px' }}>
          <p>
            <strong className="request-id-highlight">{candidate.requestId}</strong> · {candidate.responsibleOrDependency} · {candidate.category} ({candidate.agingDays} days aging)
          </p>
          {candidate.description && (
            <p style={{ fontSize: '13px', opacity: 0.9 }}>{candidate.description}</p>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', width: '100%', marginTop: '6px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 180px' }}>
              <label htmlFor={`${formId}-level`} style={{ fontSize: '12px', fontWeight: 600 }}>Impact Level</label>
              <select
                id={`${formId}-level`}
                value={impactLevel}
                onChange={(e) => setImpactLevel(e.target.value as any)}
                style={{
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--ui-border, #334155)',
                  background: 'var(--ui-inset, #091426)',
                  color: 'inherit',
                  fontSize: '13px',
                }}
              >
                <option value="Critical">🔴 Critical (P1)</option>
                <option value="High">🟠 High (P2)</option>
                <option value="Major">🟣 Major Incident</option>
                <option value="Escalated">🟡 Escalated</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '2 1 280px' }}>
              <label htmlFor={`${formId}-reason`} style={{ fontSize: '12px', fontWeight: 600 }}>Impact Reason / Details</label>
              <input
                id={`${formId}-reason`}
                value={reason}
                placeholder="e.g. Core banking service degraded, Client escalation, SLA breach risk"
                onChange={(e) => setReason(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--ui-border, #334155)',
                  background: 'var(--ui-inset, #091426)',
                  color: 'inherit',
                  fontSize: '13px',
                }}
              />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', marginTop: '8px' }}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              style={{ marginTop: '3px' }}
            />
            <span>I have verified this ticket and confirm it is classified as High Impact.</span>
          </label>

          <button
            type="button"
            className="btn btn-primary"
            style={{
              backgroundColor: confirmed ? '#dc2626' : undefined,
              borderColor: confirmed ? '#dc2626' : undefined,
              color: '#ffffff',
            }}
            disabled={!confirmed}
            onClick={handleAdd}
          >
            Add to High Impact
          </button>
        </div>
      )}

      {error && <p id={`${formId}-error`} className="admin-error" role="alert" style={{ color: '#f87171', marginTop: '8px' }}>{error}</p>}
      {message && <p role="status" style={{ color: '#34d399', marginTop: '8px' }}>{message}</p>}
    </section>
  );
}

