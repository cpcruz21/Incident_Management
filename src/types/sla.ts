export interface TeamSLAResult {
  teamName: string;
  total: number;
  failed: number;
  passed: number;
  slaPassRate: number | null;

  incidentIds: string[];
  failedIncidentIds: string[];
  passedIncidentIds: string[];
}

export interface SLAReport {
  firstResponse: TeamSLAResult[];
  resolutionTime: TeamSLAResult[];

  firstResponseTotal: TeamSLAResult;
  resolutionTimeTotal: TeamSLAResult;
}

export interface PreviousWeekSLA {
  firstResponse: Record<string, number | null>;
  resolutionTime: Record<string, number | null>;
  firstResponseTotal: number | null;
  resolutionTimeTotal: number | null;
}

/** Weekly completion for incidents filed in the last 7 days */
export interface WeeklyCompletion {
  firstResponse: {
    passed: number;
    failed: number;
    slaPassRate: number | null;
    passedIncidentIds?: string[];
    failedIncidentIds?: string[];
  };
  resolution: {
    passed: number;
    failed: number;
    slaPassRate: number | null;
    passedIncidentIds?: string[];
    failedIncidentIds?: string[];
  };
}

export interface WeeklyReportData {
  reportTitle: string;
  reportPeriod: string;
  generatedAt: Date;

  currentWeek: SLAReport;
  previousWeek: PreviousWeekSLA;
  weeklyCompletion: WeeklyCompletion;

  teamOrder: string[];
}
