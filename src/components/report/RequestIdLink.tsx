'use client';

import React from 'react';
import { sdpDisplayId } from '@/lib/sdp/request-id';

export function RequestIdLink({ requestId }: { requestId: string }) {
  const displayId = sdpDisplayId(requestId);
  if (!displayId) return <span className="request-id-highlight">{requestId}</span>;

  return (
    <a
      className="request-id-highlight"
      href={`/api/sdp/requests/${encodeURIComponent(requestId.trim())}`}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open ${requestId} in ServiceDesk Plus (new tab)`}
      aria-label={`Open ${requestId} in ServiceDesk Plus (new tab)`}
      onClick={event => event.stopPropagation()}
    >
      {requestId}
    </a>
  );
}
