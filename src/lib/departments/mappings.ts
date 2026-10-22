export interface DepartmentMappingConfig {
  [department: string]: string[];
}

/**
 * All valid Responsible/Dependency sub-teams.
 * Automated assignment maps ticket Category + context directly to these sub-teams.
 */
export const ALL_SUB_TEAMS = [
  'ISS MT',
  'ISS Binondo',
  'SDS',
  'POS DB',
  'ECS HRAD',
  'ISMS Support',
  'PSD',
  'HR',
];

/**
 * Department mappings config.
 * All sub-teams are permitted for all departments to allow flexible manual override
 * while automation handles the category-based assignment.
 */
export const DEFAULT_DEPARTMENT_MAPPINGS: DepartmentMappingConfig = {
  'ECS ISS': ALL_SUB_TEAMS,
  'ISS': ALL_SUB_TEAMS,
  'ISS MT': ALL_SUB_TEAMS,
  'ISS Binondo': ALL_SUB_TEAMS,
  'ECS SDS': ALL_SUB_TEAMS,
  'ECS Field Servicing': ALL_SUB_TEAMS,
  'ECS POS Repair': ALL_SUB_TEAMS,
  'ECS FS Admin': ALL_SUB_TEAMS,
  'ECS ADMIN': ALL_SUB_TEAMS,
  'ECS HRAD': ALL_SUB_TEAMS,
  'ECS ISMS Support': ALL_SUB_TEAMS,
  'ISMS Support': ALL_SUB_TEAMS,
  'ECS PSD': ALL_SUB_TEAMS,
  'ECS HR': ALL_SUB_TEAMS,
  'Not Assigned': ALL_SUB_TEAMS,
};
