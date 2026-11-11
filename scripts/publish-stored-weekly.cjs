// Publish the latest saved copy of each stored weekly period.
// Dry run by default; --apply backs up an existing publication file first.
require('./register-typescript.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { isWeeklyReportData, toPublicWeeklyReport } = require('../src/lib/report/weekly-publication.ts');
const { saveServerStoredWeeklyReport } = require('../src/lib/server/storage.ts');
const dataDir = process.env.SMAC_DATA_DIR || path.resolve(__dirname, '../data');
const archive = JSON.parse(fs.readFileSync(path.join(dataDir, 'weekly', 'archive.json'), 'utf8'));
const periods = new Map();
for (const record of [...archive].sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))) {
  if (record.type !== 'weekly') continue;
  if (!isWeeklyReportData(record.reportData)) throw new Error(`Invalid stored weekly report: ${record.period}. No reports were published.`);
  const period = record.period || record.reportData.reportPeriod;
  if (!periods.has(period)) periods.set(period, record);
}
const publishedFile = path.join(dataDir, 'weekly', 'weekly-reports.json');
if (process.argv.includes('--apply') && fs.existsSync(publishedFile)) {
  fs.copyFileSync(publishedFile, `${publishedFile}.before-stored-weekly-${Date.now()}.bak`, fs.constants.COPYFILE_EXCL);
}
for (const record of [...periods.values()].reverse()) {
  console.log(JSON.stringify({ period: record.period, firstResponseIRs: record.reportData.currentWeek.firstResponseTotal.total, resolutionIRs: record.reportData.currentWeek.resolutionTimeTotal.total }));
  if (process.argv.includes('--apply')) saveServerStoredWeeklyReport({
    id: `weekly-${record.period.toLowerCase().replace(/[^a-z0-9]/g, '-')}`, title: record.title, period: record.period,
    reportData: toPublicWeeklyReport(record.reportData), savedAt: record.savedAt,
  });
}
console.log(`${process.argv.includes('--apply') ? 'Published' : 'Would publish'} ${periods.size} stored weekly periods.`);
