'use client';

import React from 'react';
import { sdpDisplayId } from '@/lib/sdp/request-id';

export function RequestIdLink({ requestId, plain }: { requestId: string; plain?: boolean }) {
  const displayId = sdpDisplayId(requestId);
  const className = plain ? 'request-id-link-plain' : 'request-id-highlight';

  if (!displayId) {
    return <span className={className} style={plain ? { color: '#2563eb', textDecoration: 'underline', fontWeight: 600 } : undefined}>{requestId}</span>;
  }

  return (
    <a
      className={className}
      href={`/api/sdp/requests/${encodeURIComponent(requestId.trim())}`}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open ${requestId} in ServiceDesk Plus (new tab)`}
      aria-label={`Open ${requestId} in ServiceDesk Plus (new tab)`}
      style={plain ? { color: '#2563eb', textDecoration: 'underline', fontWeight: 600, background: 'none', border: 'none', padding: 0 } : undefined}
      onClick={event => event.stopPropagation()}
    >
      {requestId}
    </a>
  );
}
