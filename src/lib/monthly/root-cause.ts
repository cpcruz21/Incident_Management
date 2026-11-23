import type { Incident } from '@/types/incident';
import { findRootCauseType, getIncidentMonthlyValue, ROOT_CAUSE_FACTORS } from '@/types/monthly';
import { isMonthlyClosedTicket } from './ticket-status';

const TYPE_FIELD = 'Revised Root Cause Type';
const CAUSE_FIELD = 'Revised Identified Root Cause';
export type MonthlyRootCauseField = typeof TYPE_FIELD | typeof CAUSE_FIELD;

export function getRootCauseOptions(type: string): readonly string[] {
  return Object.hasOwn(ROOT_CAUSE_FACTORS, type) ? ROOT_CAUSE_FACTORS[type] : [];
}

export function updateMonthlyRootCause(incident: Incident, field: MonthlyRootCauseField, value: string): Incident {
  if (!isMonthlyClosedTicket(incident)) return incident;

  const changingType = field === TYPE_FIELD;
  const type = changingType ? value : getIncidentMonthlyValue(incident, TYPE_FIELD);
  const options = getRootCauseOptions(type);
  const currentCause = getIncidentMonthlyValue(incident, CAUSE_FIELD);
  const cause = changingType ? (findRootCauseType(currentCause) === type ? currentCause : '') : value;
  if (changingType ? type && !options.length : cause && !options.includes(cause)) return incident;

  return {
    ...incident,
    revisedRootCauseType: type,
    revisedIdentifiedRootCause: cause,
    rawData: { ...incident.rawData, [TYPE_FIELD]: type, [CAUSE_FIELD]: cause },
  };
}
