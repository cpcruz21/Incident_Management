import type { StoredReport } from '@/lib/storage/report-storage';
import { dataFile, readJson, writeJson } from './data-files';

export const reportCategories = ['weekly', 'monthly', 'aging'] as const;

function archiveFile(category: StoredReport['type']) {
  return dataFile(category, 'archive.json');
}

function readArchive(category: StoredReport['type']) {
  return readJson<StoredReport[]>(archiveFile(category), []);
}

export function listArchive() {
  return reportCategories.flatMap(readArchive).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function storeArchive(reports: StoredReport[], importLegacy: boolean) {
  for (const category of reportCategories) {
    const incoming = reports.filter((report) => report.type === category);
    if (!incoming.length) continue;
    const records = new Map(readArchive(category).map((report) => [report.id, report]));
    for (const report of incoming) {
      if (!importLegacy || !records.has(report.id)) records.set(report.id, report);
    }
    writeJson(archiveFile(category), Array.from(records.values()));
  }
}

export function removeFromArchive(category: StoredReport['type'], id: string) {
  const reports = readArchive(category);
  const remaining = reports.filter((report) => report.id !== id);
  if (remaining.length !== reports.length) writeJson(archiveFile(category), remaining);
  return remaining.length !== reports.length;
}

export function isReportCategory(value: unknown): value is StoredReport['type'] {
  return reportCategories.some((category) => category === value);
}

export function isStoredReport(value: unknown): value is StoredReport {
  if (!value || typeof value !== 'object') return false;
  const report = value as Partial<StoredReport>;
  return isReportCategory(report.type) &&
    typeof report.id === 'string' && report.id.length > 0 && report.id.length <= 300 &&
    typeof report.title === 'string' && typeof report.period === 'string' &&
    typeof report.savedAt === 'string' && Number.isFinite(Date.parse(report.savedAt)) &&
    typeof report.savedAtFormatted === 'string' &&
    !!report.reportData && typeof report.reportData === 'object' && !Array.isArray(report.reportData) &&
    (report.routedIncidents === undefined || Array.isArray(report.routedIncidents));
}
