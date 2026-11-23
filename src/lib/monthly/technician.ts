import type { Incident } from '@/types/incident';
import { matchesEcsHradPosOperations } from '@/lib/routing/routing-engine';

export function getImportedTechnician(incident: Incident): string {
  const entry = Object.entries(incident.rawData || {}).find(([key]) => key.trim().toLowerCase() === 'technician');
  return String(entry?.[1] ?? '').trim() || incident.sourceTeam || incident.assignedTeam || 'Unassigned';
}

export function getTechnician(incident: Incident): string {
  const technician = getImportedTechnician(incident);
  return matchesEcsHradPosOperations(incident, technician) ? 'ECS HR' : technician;
}
