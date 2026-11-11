import type { TeamSLAResult, WeeklyReportData } from '@/types/sla';
import { sdpDisplayId } from '@/lib/sdp/request-id';

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}
function rate(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100);
}
function result(value: unknown): boolean {
  if (!object(value)) return false;
  const { total, passed, failed, slaPassRate } = value;
  return typeof value.teamName === 'string' &&
    [total, passed, failed].every(count => typeof count === 'number' && Number.isInteger(count) && count >= 0) &&
    (passed as number) + (failed as number) === total && rate(slaPassRate) &&
    (total === 0 ? slaPassRate === null : typeof slaPassRate === 'number' && Math.abs(slaPassRate - (passed as number) / (total as number) * 100) < .01) &&
    strings(value.incidentIds) && strings(value.failedIncidentIds) && strings(value.passedIncidentIds);
}

function completion(value: unknown): boolean {
  if (!object(value)) return false;
  const { passed, failed, slaPassRate } = value;
  if (![passed, failed].every(count => typeof count === 'number' && Number.isInteger(count) && count >= 0)) return false;
  const total = (passed as number) + (failed as number);
  return total === 0 ? slaPassRate === null : typeof slaPassRate === 'number' && Math.abs(slaPassRate - (passed as number) / total * 100) < .01;
}

export function isWeeklyReportData(value: unknown): value is WeeklyReportData {
  if (!object(value) || !object(value.currentWeek) || !object(value.previousWeek)) return false;
  const current = value.currentWeek;
  const previous = value.previousWeek;
  return typeof value.reportTitle === 'string' && typeof value.reportPeriod === 'string' &&
    Number.isFinite(Date.parse(String(value.generatedAt))) && strings(value.teamOrder) && value.teamOrder.length > 0 &&
    Array.isArray(current.firstResponse) && current.firstResponse.every(result) &&
    Array.isArray(current.resolutionTime) && current.resolutionTime.every(result) &&
    result(current.firstResponseTotal) && result(current.resolutionTimeTotal) &&
    object(previous.firstResponse) && Object.values(previous.firstResponse).every(rate) &&
    object(previous.resolutionTime) && Object.values(previous.resolutionTime).every(rate) &&
    rate(previous.firstResponseTotal) && rate(previous.resolutionTimeTotal) &&
    (value.weeklyCompletion == null || (object(value.weeklyCompletion) && completion(value.weeklyCompletion.firstResponse) && completion(value.weeklyCompletion.resolution)));
}

export function isWeeklyPublication(value: unknown): value is Record<string, unknown> & { reportData: WeeklyReportData } {
  return object(value) && typeof value.title === 'string' && typeof value.period === 'string' &&
    (value.id === undefined || typeof value.id === 'string') && isWeeklyReportData(value.reportData) &&
    (value.routedIncidents === undefined || Array.isArray(value.routedIncidents));
}

function requestIdsForCount(source: string[], count: number): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of source) {
    if (ids.length >= count) break;
    const displayId = sdpDisplayId(id);
    if (displayId && !seen.has(displayId)) {
      seen.add(displayId);
      ids.push(id.trim());
    }
  }
  return ids;
}

/** Include the SDP display IDs needed for current-week ticket lists. */
export function toPublicWeeklyReport(data: WeeklyReportData): WeeklyReportData {
  const aggregate = (row: TeamSLAResult) => ({
    teamName: row.teamName, total: row.total, failed: row.failed, passed: row.passed, slaPassRate: row.slaPassRate,
    incidentIds: requestIdsForCount(row.incidentIds, row.total),
    failedIncidentIds: requestIdsForCount(row.failedIncidentIds, row.failed),
    passedIncidentIds: requestIdsForCount(row.passedIncidentIds, row.passed),
  });
  const completion = (metric: { passed: number; failed: number; slaPassRate: number | null }) => ({
    passed: metric.passed, failed: metric.failed, slaPassRate: metric.slaPassRate, passedIncidentIds: [], failedIncidentIds: [],
  });
  return {
    reportTitle: data.reportTitle, reportPeriod: data.reportPeriod, generatedAt: data.generatedAt,
    teamOrder: [...data.teamOrder],
    currentWeek: {
      firstResponse: data.currentWeek.firstResponse.map(aggregate), resolutionTime: data.currentWeek.resolutionTime.map(aggregate),
      firstResponseTotal: aggregate(data.currentWeek.firstResponseTotal), resolutionTimeTotal: aggregate(data.currentWeek.resolutionTimeTotal),
    },
    previousWeek: {
      firstResponse: { ...data.previousWeek.firstResponse }, resolutionTime: { ...data.previousWeek.resolutionTime },
      firstResponseTotal: data.previousWeek.firstResponseTotal, resolutionTimeTotal: data.previousWeek.resolutionTimeTotal,
    },
    weeklyCompletion: {
      firstResponse: completion(data.weeklyCompletion?.firstResponse || data.currentWeek.firstResponseTotal),
      resolution: completion(data.weeklyCompletion?.resolution || data.currentWeek.resolutionTimeTotal),
    },
  };
}
