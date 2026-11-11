'use client';

import React, { useId, useState } from 'react';
import type { Incident } from '@/types/incident';
import { getTechnician } from '@/lib/monthly/calculator';
import { Trash2, AlertTriangle } from 'lucide-react';

export interface DeleteIRProps {
  incidents: Incident[];
  onDelete: (requestId: string) => void;
  id?: string;
}

export function DeleteIR({ incidents, onDelete, id: initialId }: DeleteIRProps) {
  const formId = useId();
  const [requestId, setRequestId] = useState(initialId || '');
  const [candidate, setCandidate] = useState<Incident | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const validate = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setCandidate(null);
    setConfirmed(false);

    const query = requestId.trim().toLowerCase();
    if (!query) {
      setError('Please enter a Request ID.');
      return;
    }

    const found = incidents.find(
      (inc) => inc.requestId && inc.requestId.trim().toLowerCase() === query
    );

    if (!found) {
      setError(`Request ID "${requestId}" was not found in this report.`);
      return;
    }

    setCandidate(found);
  };

  const handleDelete = () => {
    if (!candidate || !confirmed) return;
    try {
      const deletedId = candidate.requestId;
      onDelete(deletedId);
      setMessage(`${deletedId} was removed from this monthly report. Archive or publish the report to save this change.`);
      setRequestId('');
      setCandidate(null);
      setConfirmed(false);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the Request ID.');
    }
  };

  return (
    <section className="delete-ir-input acceptable-fr-input" aria-labelledby={`${formId}-title`}>
      <h3 id={`${formId}-title`} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--ui-danger, #f87171)' }}>
        <Trash2 size={18} aria-hidden="true" />
        <span>Delete Request ID</span>
      </h3>
      <p>Validate a ticket in this report, then confirm its deletion from this monthly report.</p>
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
        <div className="acceptable-fr-confirmation" style={{ borderLeft: '3px solid #ef4444', paddingLeft: '12px' }}>
          <p>
            <strong className="request-id-highlight">{candidate.requestId}</strong> · {getTechnician(candidate)} · {candidate.category || 'No category'}
          </p>
          {candidate.description && (
            <p style={{ fontSize: '13px', opacity: 0.9 }}>{candidate.description}</p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f87171', fontSize: '13px' }}>
            <AlertTriangle size={15} aria-hidden="true" />
            <span>This will remove this incident record and recalculate all technician totals and SLA pass rates.</span>
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              style={{ marginTop: '3px' }}
            />
            <span>I have verified this ticket and confirm it should be removed from this monthly report.</span>
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
            onClick={handleDelete}
          >
            Confirm Delete
          </button>
        </div>
      )}

      {error && <p id={`${formId}-error`} className="admin-error" role="alert" style={{ color: '#f87171', marginTop: '8px' }}>{error}</p>}
      {message && <p role="status" style={{ color: '#34d399', marginTop: '8px' }}>{message}</p>}
    </section>
  );
}

export default DeleteIR;
