'use client';

import React from 'react';
import { Clock3, Trash2 } from 'lucide-react';
import { AcceptableFRInput } from '@/components/monthly/AcceptableFRInput';
import { DeleteIR } from '@/components/monthly/DeleteIR';
import { findAcceptableFRCandidate } from '@/lib/report/ticket-edits';
import type { Incident } from '@/types/incident';
import { RequestIdLink } from './RequestIdLink';

interface ReportTicketActionsProps {
  incidents: Incident[];
  failedIds?: string[];
  reportName: string;
  busy: boolean;
  onApprove?: (requestId: string) => void;
  onDelete?: (requestId: string) => void;
}

export function ReportTicketActions({ incidents, failedIds, reportName, busy, onApprove, onDelete }: ReportTicketActionsProps) {
  const approved = incidents.filter((incident) => incident.acceptableFirstResponseApproval);
  const failed = failedIds && new Set(failedIds);
  const saveInstruction = 'Archive the report to save this change.';
  const editTicket = (edit: (requestId: string) => void, requestId: string) => {
    if (busy) throw new Error('Wait for the report to finish saving, then try again.');
    edit(requestId);
  };

  return (
    <div className="report-ticket-actions no-export" role="group" aria-label="Ticket actions">
      {onApprove && <details>
        <summary><Clock3 size={16} aria-hidden="true" /> Acceptable First Response ({approved.length})</summary>
        <AcceptableFRInput
          incidents={incidents}
          onAdd={(id) => editTicket(onApprove, id)}
          validateCandidate={failed && ((tickets, id) => findAcceptableFRCandidate(tickets, id, (ticket) => failed.has(ticket.requestId)))}
          saveInstruction={saveInstruction}
        />
        {approved.length > 0 && (
          <ul aria-label="Approved first-response exceptions" className="report-ticket-approvals">
            {approved.map((ticket, index) => (
              <li key={`${ticket.requestId}-${index}`}>
                <RequestIdLink requestId={ticket.requestId} /> · Approved by {ticket.acceptableFirstResponseApproval?.approvedBy}
              </li>
            ))}
          </ul>
        )}
      </details>}
      {onDelete && <details>
        <summary><Trash2 size={16} aria-hidden="true" /> Delete ticket</summary>
        <DeleteIR
          incidents={incidents}
          onDelete={(id) => editTicket(onDelete, id)}
          reportName={reportName}
          saveInstruction={saveInstruction}
        />
      </details>}
    </div>
  );
}
