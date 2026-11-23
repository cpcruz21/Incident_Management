import type { Incident } from '@/types/incident';

export function getIncidentTeam(incident: Incident): string {
  return incident.assignedTeam?.trim() || incident.sourceTeam?.trim() || 'Unassigned';
}

export function getReportTeamOrder(incidents: Incident[], preferred: string[]): string[] {
  return Array.from(new Set([...preferred, ...incidents.map(getIncidentTeam)]));
}
