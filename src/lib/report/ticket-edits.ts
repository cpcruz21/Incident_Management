import { isAdmin, type Account } from '@/lib/auth';
import type { Incident } from '@/types/incident';

export type ReportTicketAction = 'delete' | 'accept-first-response';

export interface ReportTicketEdit {
  requestId: string;
  approval?: Incident['acceptableFirstResponseApproval'];
}

export function normalizeReportRequestId(requestId: string): string {
  return requestId.trim().toLowerCase();
}

export function findReportTicket(incidents: Incident[], requestId: string): Incident {
  const id = normalizeReportRequestId(requestId);
  if (!id) throw new Error('Enter a Request ID.');
  const ticket = incidents.find((incident) => normalizeReportRequestId(incident.requestId) === id);
  if (!ticket) throw new Error('Request ID was not found in this report.');
  return ticket;
}

export function findAcceptableFRCandidate(
  incidents: Incident[],
  requestId: string,
  isFailed: (incident: Incident) => boolean,
  isAccepted: (incident: Incident) => boolean = (incident) => Boolean(incident.acceptableFirstResponseApproval)
): Incident {
  const ticket = findReportTicket(incidents, requestId);
  if (isAccepted(ticket)) throw new Error('This Request ID is already in Acceptable First Response.');
  if (!isFailed(ticket)) throw new Error('This ticket already passed First Response and does not need an exception.');
  return ticket;
}

export function createReportTicketEdit(
  incidents: Incident[],
  requestId: string,
  action: ReportTicketAction,
  account: Account | null,
  isFailed: (incident: Incident) => boolean
): ReportTicketEdit {
  if (!account || !isAdmin(account)) throw new Error('Admin access is required.');
  if (action === 'delete') return { requestId: findReportTicket(incidents, requestId).requestId };

  const ticket = findAcceptableFRCandidate(incidents, requestId, isFailed);
  return { requestId: ticket.requestId, approval: { approvedBy: account.name, approvedAt: new Date().toISOString() } };
}

export function applyReportTicketEdit(incidents: Incident[], { requestId, approval }: ReportTicketEdit): Incident[] {
  const id = normalizeReportRequestId(requestId);
  const matches = (incident: Incident) => normalizeReportRequestId(incident.requestId) === id;
  return approval
    ? incidents.map((incident) => matches(incident) ? { ...incident, acceptableFirstResponseApproval: approval } : incident)
    : incidents.filter((incident) => !matches(incident));
}
