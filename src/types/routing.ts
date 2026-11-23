export interface RoutingRule {
  id: string;
  name: string;
  description: string;
  priority: number;

  conditions: {
    sourceTeams?: string[];
    categories?: string[];
    excludeCategories?: string[];
    subCategories?: string[];
    items?: string[];
    categoryMatch?: 'exact' | 'contains';
  };

  assignedTeam: string;

  enabled: boolean;
}

export interface RoutingConfig {
  rules: RoutingRule[];

  defaultTeamMapping: Record<string, string>;

  reportTeams: string[];
}

export interface RoutingResult {
  requestId: string;
  sourceTeam: string;
  category: string;
  subCategory?: string;
  item?: string;
  autoAssignedGroup?: string;
  originalAssignment: string;
  finalAssignedTeam: string;
  routingReason: string;
  wasReassigned: boolean;
  matchedRuleId?: string;
}

export interface RoutingSummary {
  totalRecords: number;
  reassignedRecords: number;
  unchangedRecords: number;
  errorsOrWarnings: number;
  results: RoutingResult[];
}
