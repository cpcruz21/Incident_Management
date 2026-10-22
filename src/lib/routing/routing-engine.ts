import type { Incident } from '@/types/incident';
import type { RoutingRule, RoutingConfig, RoutingResult, RoutingSummary } from '@/types/routing';

// Technician
export const REPORT_TEAMS = [
  'ECS HR',
  'ECS ADMIN',
  'ECS ISS',
  'ECS SDS',
  'ECS PSD',
  'ECS ISMS Support',
];

// Default routing rules — ordered by priority (lower number = checked first)
export const DEFAULT_ROUTING_RULES: RoutingRule[] = [
  {
    id: 'facility-to-admin',
    name: 'Facility → ECS ADMIN',
    description: 'Facility-related incidents from ISS teams are reassigned to ECS ADMIN',
    priority: 1,
    conditions: {
      sourceTeams: ['ISS Binondo', 'ISS MT'],
      categories: ['Facility'],
      categoryMatch: 'contains',
    },
    assignedTeam: 'ECS ADMIN',
    enabled: true,
  },
  {
    id: 'hardware-to-iss',
    name: 'Hardware → ECS ISS',
    description: 'Hardware-related incidents are always assigned to ECS ISS',
    priority: 2,
    conditions: {
      categories: ['Hardware'],
      categoryMatch: 'contains',
    },
    assignedTeam: 'ECS ISS',
    enabled: true,
  },
  {
    id: 'network-to-iss',
    name: 'Network → ECS ISS',
    description: 'Network-related incidents are always assigned to ECS ISS',
    priority: 3,
    conditions: {
      categories: ['Network'],
      categoryMatch: 'contains',
    },
    assignedTeam: 'ECS ISS',
    enabled: true,
  },
  {
    id: 'hr-routing',
    name: 'HR Issues → ECS HR',
    description: 'HR-related incidents are assigned to ECS HR',
    priority: 4,
    conditions: {
      categories: ['HR', 'Human Resource'],
      categoryMatch: 'contains',
    },
    assignedTeam: 'ECS HR',
    enabled: true,
  },
  {
    id: 'isms-routing',
    name: 'ISMS → ECS ISMS Support',
    description: 'ISMS/Security incidents are assigned to ECS ISMS Support',
    priority: 5,
    conditions: {
      categories: ['ISMS', 'Security', 'Information Security'],
      categoryMatch: 'contains',
    },
    assignedTeam: 'ECS ISMS Support',
    enabled: true,
  },
  {
    id: 'sds-routing',
    name: 'SDS → ECS SDS',
    description: 'SDS-related incidents are assigned to ECS SDS',
    priority: 6,
    conditions: {
      categories: ['SDS', 'Service Desk'],
      categoryMatch: 'contains',
    },
    assignedTeam: 'ECS SDS',
    enabled: true,
  },
  {
    id: 'psd-routing',
    name: 'PSD → ECS PSD',
    description: 'PSD-related incidents are assigned to ECS PSD',
    priority: 7,
    conditions: {
      categories: ['PSD', 'Professional Service'],
      categoryMatch: 'contains',
    },
    assignedTeam: 'ECS PSD',
    enabled: true,
  },
];

// Technician 
export const DEFAULT_TEAM_MAPPING: Record<string, string> = {
  'ISS Binondo': 'ECS ISS',
  'ISS MT': 'ECS ISS',
  'ECS HR': 'ECS HR',
  'ECS SDS': 'ECS SDS',
  'ECS PSD': 'ECS PSD',
  'ECS ISMS Support': 'ECS ISMS Support',
  'ECS HRAD': 'ECS ADMIN',
};

export const DEFAULT_ROUTING_CONFIG: RoutingConfig = {
  rules: DEFAULT_ROUTING_RULES,
  defaultTeamMapping: DEFAULT_TEAM_MAPPING,
  reportTeams: REPORT_TEAMS,
};

function matchesRule(incident: Incident, rule: RoutingRule): boolean {
  if (!rule.enabled) return false;

  const { conditions } = rule;

  if (conditions.sourceTeams && conditions.sourceTeams.length > 0) {
    const sourceMatch = conditions.sourceTeams.some(
      (team) => team.toLowerCase() === incident.sourceTeam.toLowerCase()
    );
    if (!sourceMatch) return false;
  }

  if (conditions.categories && conditions.categories.length > 0) {
    const categoryLower = incident.category.toLowerCase();
    const categoryMatch = conditions.categories.some((cat) => {
      const catLower = cat.toLowerCase();
      if (conditions.categoryMatch === 'exact') {
        return categoryLower === catLower;
      }
      return categoryLower.includes(catLower);
    });
    if (!categoryMatch) return false;
  }

  return true;
}

export function resolveAssignedTeam(
  incident: Incident,
  config: RoutingConfig
): RoutingResult {

  const sortedRules = [...config.rules].sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    if (matchesRule(incident, rule)) {
      const wasReassigned = rule.assignedTeam !== incident.sourceTeam;
      return {
        requestId: incident.requestId,
        sourceTeam: incident.sourceTeam,
        category: incident.category,
        originalAssignment: incident.sourceTeam,
        finalAssignedTeam: rule.assignedTeam,
        routingReason: rule.name,
        wasReassigned,
        matchedRuleId: rule.id,
      };
    }
  }

  const mappedTeam = config.defaultTeamMapping[incident.sourceTeam];
  if (mappedTeam) {
    const wasReassigned = mappedTeam !== incident.sourceTeam;
    return {
      requestId: incident.requestId,
      sourceTeam: incident.sourceTeam,
      category: incident.category,
      originalAssignment: incident.sourceTeam,
      finalAssignedTeam: mappedTeam,
      routingReason: 'Default team mapping',
      wasReassigned,
    };
  }

  const sourceUpper = incident.sourceTeam.toUpperCase();
  const matchedReportTeam = config.reportTeams.find(
    (t) => sourceUpper.includes(t.replace('ECS ', '').toUpperCase())
  );

  if (matchedReportTeam) {
    return {
      requestId: incident.requestId,
      sourceTeam: incident.sourceTeam,
      category: incident.category,
      originalAssignment: incident.sourceTeam,
      finalAssignedTeam: matchedReportTeam,
      routingReason: 'Fuzzy team match',
      wasReassigned: true,
    };
  }

  return {
    requestId: incident.requestId,
    sourceTeam: incident.sourceTeam,
    category: incident.category,
    originalAssignment: incident.sourceTeam,
    finalAssignedTeam: 'ECS ISS',
    routingReason: 'No matching rule — defaulted to ECS ISS',
    wasReassigned: true,
  };
}

export function applyRouting(
  incidents: Incident[],
  config: RoutingConfig = DEFAULT_ROUTING_CONFIG
): { routedIncidents: Incident[]; summary: RoutingSummary } {
  const results: RoutingResult[] = [];
  const routedIncidents: Incident[] = [];
  let reassigned = 0;
  let unchanged = 0;

  for (const incident of incidents) {
    const result = resolveAssignedTeam(incident, config);
    results.push(result);

    const routedIncident: Incident = {
      ...incident,
      assignedTeam: result.finalAssignedTeam,
      routingReason: result.routingReason,
      wasReassigned: result.wasReassigned,
    };

    routedIncidents.push(routedIncident);

    if (result.wasReassigned) {
      reassigned++;
    } else {
      unchanged++;
    }
  }

  return {
    routedIncidents,
    summary: {
      totalRecords: incidents.length,
      reassignedRecords: reassigned,
      unchangedRecords: unchanged,
      errorsOrWarnings: 0,
      results,
    },
  };
}
