// Backfill only missing SLA snapshots, using the preceding stored Aging report.
// Dry run by default; --apply backs up original files before writing atomically.
require('./register-typescript.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { extractAgingFromStored, getPriorAgingReports } = require('../src/lib/storage/report-storage.ts');
const { writeJson } = require('../src/lib/server/data-files.ts');
const dataDir = process.env.SMAC_DATA_DIR || path.resolve(__dirname, '../data');
const archiveFile = path.join(dataDir, 'aging', 'archive.json');
const archive = JSON.parse(fs.readFileSync(archiveFile, 'utf8'));
const publishedFile = path.join(dataDir, 'aging', 'aging-reports.json');
const targets = [archiveFile, fs.existsSync(publishedFile) ? publishedFile : path.join(dataDir, 'aging-reports.json')];
for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  const records = JSON.parse(fs.readFileSync(file, 'utf8'));
  let changed = 0;
  const updated = records.map(record => {
    const data = record.reportData;
    if (data.previousWeek?.sla) return record;
    const previous = getPriorAgingReports(archive, data.generatedAt)[0];
    if (!previous) return record;
    const snapshot = extractAgingFromStored(previous);
    changed++;
    console.log(JSON.stringify({ report: record.period, previous: previous.period, fr: snapshot.sla.firstResponseTotal, rt: snapshot.sla.resolutionTimeTotal }));
    return { ...record, reportData: { ...data, previousWeek: { ...snapshot, ...data.previousWeek, sla: snapshot.sla, sourcePeriod: snapshot.sourcePeriod, sourceReportId: snapshot.sourceReportId } } };
  });
  if (changed && process.argv.includes('--apply')) {
    fs.copyFileSync(file, `${file}.before-sla-backfill-${Date.now()}.bak`, fs.constants.COPYFILE_EXCL);
    writeJson(file, updated);
  }
  console.log(`${process.argv.includes('--apply') ? 'Repaired' : 'Would repair'} ${changed} records in ${path.relative(dataDir, file)}.`);
}
