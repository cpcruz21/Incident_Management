import { DEFAULT_COLUMN_MAPPING, type ColumnMapping } from '@/types/incident';
import { autoDetectMapping, mapAllRows } from './mapper';
import { parseFile } from './parser';

const requiredColumns = {
  requestId: 'Request ID',
  technician: 'Technician',
  requestStatus: 'Request Status',
  createdTime: 'Created Time',
} satisfies Partial<Record<keyof ColumnMapping, string>>;
const requiredFields = Object.keys(requiredColumns) as (keyof typeof requiredColumns)[];
const missingColumnsGuidance = 'Upload the original incident export or save its raw data sheet as the first sheet.';

export class MissingIncidentColumnsError extends Error {
  readonly guidance = missingColumnsGuidance;

  constructor(readonly summary: string, readonly columns: string[]) {
    super(`${summary} (${columns.join(', ')}). ${missingColumnsGuidance}`);
  }
}

export async function readIncidentUpload(file: File) {
  const result = await parseFile(file, columns => {
    const detected = autoDetectMapping(columns);
    return requiredFields.every(field => detected[field]);
  });
  const sheet = result.sheetName ? `Sheet “${result.sheetName}”` : 'The uploaded file';
  if (result.sheetName.trim().toLowerCase() === 're-assigned technicians') {
    throw new Error(`${sheet} contains only reassigned tickets. Upload the full Raw Data sheet.`);
  }
  if (!result.success) throw new Error(`${sheet} could not be imported. ${result.errors.join(' ')}`);

  const detected = autoDetectMapping(result.columns);
  const missing = requiredFields
    .filter(field => !detected[field])
    .map(field => requiredColumns[field]);
  if (missing.length) {
    throw new MissingIncidentColumnsError(`${sheet} is missing required columns`, missing);
  }

  const mapping = { ...DEFAULT_COLUMN_MAPPING, ...detected };
  const data = result.data.filter(row => Object.values(row).some(value => String(value ?? '').trim()));
  const { incidents, validationSummary } = mapAllRows(data, mapping);
  if (!data.length) throw new Error(`${sheet} has no incident rows.`);
  if (validationSummary.invalidRecords) {
    throw new Error(`${sheet} has ${validationSummary.invalidRecords} row(s) without a Request ID. Fill in the IDs or remove the extra rows.`);
  }

  const invalidDates = incidents.filter(incident => !incident.createdTime);
  if (invalidDates.length) {
    const examples = invalidDates.slice(0, 3).map(incident => incident.requestId).join(', ');
    throw new Error(`${sheet} has ${invalidDates.length} row(s) with a missing or invalid Created Time. Check Request IDs such as ${examples}.`);
  }

  if (incidents.every(incident => !incident.requestStatus)) {
    throw new Error(`${sheet} has no Request Status values. Select an export that includes ticket statuses.`);
  }

  const ids = new Set<string>();
  for (const { requestId } of incidents) {
    const id = requestId.toLowerCase();
    if (ids.has(id)) throw new Error(`${sheet} contains more than one row for Request ID ${requestId}. Remove duplicate rows and try again.`);
    ids.add(id);
  }

  return { data, columns: result.columns, mapping, incidents, validationSummary };
}
