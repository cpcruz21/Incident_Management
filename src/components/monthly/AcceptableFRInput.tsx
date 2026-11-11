'use client';

import React, { useId, useState } from 'react';
import type { Incident } from '@/types/incident';
import { findAcceptableFRCandidate, getTechnician } from '@/lib/monthly/calculator';

export function AcceptableFRInput({ incidents, onAdd }: {
  incidents: Incident[];
  onAdd: (requestId: string) => void;
}) {
  const formId = useId();
  const [requestId, setRequestId] = useState('');
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
    try {
      setCandidate(findAcceptableFRCandidate(incidents, requestId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not validate the Request ID.');
    }
  };

  const add = () => {
    if (!candidate || !confirmed) return;
    try {
      onAdd(candidate.requestId);
      setMessage(`${candidate.requestId} was added to Acceptable FR. Archive or publish the report to save this change.`);
      setRequestId('');
      setCandidate(null);
      setConfirmed(false);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the Request ID.');
    }
  };

  return (
    <section className="acceptable-fr-input" aria-labelledby={`${formId}-title`}>
      <h3 id={`${formId}-title`}>Add Request ID</h3>
      <p>Validate a ticket in this report, then confirm that its first response exception is acceptable.</p>
      <form onSubmit={validate} className="acceptable-fr-form">
        <label htmlFor={`${formId}-request-id`}>Request ID</label>
        <input
          id={`${formId}-request-id`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${formId}-error` : undefined}
          value={requestId}
          placeholder="Enter Request ID"
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
        <div className="acceptable-fr-confirmation">
          <p><strong className="request-id-highlight">{candidate.requestId}</strong> · {getTechnician(candidate)} · {candidate.category || 'No category'}</p>
          {candidate.description && <p>{candidate.description}</p>}
          <label>
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            I have verified this ticket and confirm its first response exception is valid.
          </label>
          <button type="button" className="btn btn-primary" disabled={!confirmed} onClick={add}>Add to Acceptable FR</button>
        </div>
      )}
      {error && <p id={`${formId}-error`} className="admin-error" role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
