// Recalculate saved Aging reports from their original imported incidents.
// Dry run by default. --apply creates exact backups before atomic writes.
require('./register-typescript.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { calculateAgingReport } = require('../src/lib/aging/report.ts');
const { extractAgingFromStored, getPriorAgingReports } = require('../src/lib/storage/report-storage.ts');
const { writeJson } = require('../src/lib/server/data-files.ts');
const dataDir = process.env.SMAC_DATA_DIR || path.resolve(__dirname, '../data');
const archiveFile = path.join(dataDir, 'aging', 'archive.json');
const originals = JSON.parse(fs.readFileSync(archiveFile, 'utf8'));
const reconciled = [];

function reconcile(record) {
  const data = record.reportData;
  if (!Array.isArray(record.routedIncidents) || (!record.routedIncidents.length && data.slaTotals.totalIRs)) {
    throw new Error(`Original imported incidents are not available for ${record.period}; no records were written.`);
  }
  const prior = getPriorAgingReports(reconciled, data.generatedAt)[0];
  const baseline = prior ? extractAgingFromStored(prior) : data.previousWeek;
  const report = calculateAgingReport(record.routedIncidents, data.reportPeriod, baseline, new Date(data.asOf || data.generatedAt));
  const oldRows = new Map((data.remarksTable?.rows || []).map(row => [row.requestId, row]));
  if (report.remarksTable) {
    report.remarksTable.rows = report.remarksTable.rows.map(row => ({ ...row, ...oldRows.get(row.requestId), agingDays: row.agingDays }));
  }
  return { ...record, reportData: { ...data, ...report, generatedAt: data.generatedAt, reportTitle: data.reportTitle } };
}

for (const record of [...originals].sort((a, b) => Date.parse(a.reportData.generatedAt) - Date.parse(b.reportData.generatedAt))) reconciled.push(reconcile(record));
const byId = new Map(reconciled.map(record => [record.id, record]));
const updates = [[archiveFile, originals.map(record => byId.get(record.id))]];
const publishedFile = path.join(dataDir, 'aging', 'aging-reports.json');
if (fs.existsSync(publishedFile)) {
  const published = JSON.parse(fs.readFileSync(publishedFile, 'utf8'));
  updates.push([publishedFile, published.map(reconcile)]);
}
for (const [file, updated] of updates) {
  const before = JSON.parse(fs.readFileSync(file, 'utf8'));
  let changed = 0;
  updated.forEach((record, index) => {
    if (JSON.stringify(record) === JSON.stringify(before[index])) return;
    changed++;
    console.log(JSON.stringify({ period: record.period, open: record.reportData.slaTotals.totalIRs,
      firstResponseFailedBefore: before[index].reportData.slaTotals.firstResponse.failed,
      firstResponseFailedAfter: record.reportData.slaTotals.firstResponse.failed,
      currentFR: record.reportData.slaTotals.firstResponse.slaPassRate,
      previousFR: record.reportData.previousWeek.sla?.firstResponseTotal,
      sameDay: record.reportData.agingRows.reduce((sum, row) => sum + row.buckets.sameday, 0) }));
  });
  if (changed && process.argv.includes('--apply')) {
    fs.copyFileSync(file, `${file}.before-raw-reconcile-${Date.now()}.bak`, fs.constants.COPYFILE_EXCL);
    writeJson(file, updated);
  }
  console.log(`${process.argv.includes('--apply') ? 'Reconciled' : 'Would reconcile'} ${changed} reports in ${path.relative(dataDir, file)}.`);
}
