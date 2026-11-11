const assert = require('node:assert/strict');
require('./register-typescript.cjs');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const XLSX = require('xlsx');
const { REPORT_TEAMS } = require('../src/lib/routing/routing-engine.ts');
const { extractAgingFromStored, getPriorAgingReports } = require('../src/lib/storage/report-storage.ts');
const { agingReducer, agingInitialState } = require('../src/lib/aging-store.ts');
const { AgingReportTable } = require('../src/components/aging/AgingReportTable.tsx');
const { exportToXLSX } = require('../src/lib/report/export.ts');
const { AGING_BUCKET_ORDER } = require('../src/types/aging.ts');

const counts = [0, 3, 10, 3, 2, 11];
const frFailed = [0, 1, 1, 2, 0, 1];
const rtFailed = [0, 1, 2, 0, 1, 1];
const metric = (total, failed) => ({ failed, passed: total - failed, slaPassRate: total ? 100 * (total - failed) / total : null, failedIds: [], passedIds: [] });
const data = {
  reportTitle: 'Aging Incident Report', reportPeriod: 'November 2–6, 2026', generatedAt: new Date(),
  teamOrder: REPORT_TEAMS,
  slaRows: REPORT_TEAMS.map((teamName, i) => ({
    teamName, totalIRs: counts[i], incidentIds: [], firstResponse: metric(counts[i], frFailed[i]), resolutionTime: metric(counts[i], rtFailed[i]),
  })),
  slaTotals: { totalIRs: 29, firstResponse: metric(29, 5), resolutionTime: metric(29, 5) },
  agingRows: REPORT_TEAMS.map((teamName, i) => ({ teamName, totalAging: counts[i], incidentIds: [],
    buckets: Object.fromEntries(AGING_BUCKET_ORDER.map(bucket => [bucket, bucket === '1-2weeks' ? counts[i] : 0])),
    bucketIncidentIds: Object.fromEntries(AGING_BUCKET_ORDER.map(bucket => [bucket, []])),
  })),
  agingGrandTotal: 29, previousWeek: { teamTotals: {}, grandTotal: null },
};
const previous = JSON.parse(JSON.stringify(data));
previous.reportPeriod = 'October 26–30, 2026';
previous.slaRows[1].firstResponse.slaPassRate = 0;
previous.slaRows[2].firstResponse.slaPassRate = 100;
previous.slaRows[3].resolutionTime.slaPassRate = null;
previous.slaTotals.firstResponse.slaPassRate = 79.31;
const extracted = extractAgingFromStored({ id: 'previous', type: 'aging', period: previous.reportPeriod, reportData: previous });
assert.equal(extracted.sla.firstResponse[REPORT_TEAMS[1]], 0);
assert.equal(extracted.sla.firstResponse[REPORT_TEAMS[2]], 100);
assert.equal(extracted.sla.resolutionTime[REPORT_TEAMS[3]], null);
assert.equal(extracted.sla.firstResponseTotal, 79.31); // Preserve actual overall rate, never average team rates.
assert.equal(extracted.grandTotal, 29);
assert.equal(extracted.sourcePeriod, previous.reportPeriod);
const saved = (id, type, generatedAt, savedAt) => ({ id, type, savedAt, reportData: { ...previous, generatedAt } });
const archives = [
  saved('old-edited', 'aging', '2026-10-23T12:00:00Z', '2026-11-06T12:00:00Z'),
  saved('current', 'aging', '2026-11-06T12:00:00Z', '2026-11-06T12:00:00Z'),
  saved('last-extract', 'aging', '2026-10-30T12:00:00Z', '2026-10-30T12:00:00Z'),
  saved('monthly', 'monthly', '2026-11-01T12:00:00Z', '2026-11-01T12:00:00Z'),
];
assert.equal(getPriorAgingReports(archives)[0].id, 'current');
assert.deepEqual(getPriorAgingReports(archives, '2026-11-06T12:00:00Z').map(r => r.id), ['last-extract', 'old-edited']);
data.previousWeek = extracted;
const restored = JSON.parse(JSON.stringify(data));
const loaded = agingReducer(agingInitialState, { type: 'LOAD_STORED_REPORT', data: restored });
assert.deepEqual(loaded.previousWeekAging, extracted);
const html = renderToStaticMarkup(React.createElement(AgingReportTable, { data: restored, isPublicView: true }));
assert.equal((html.match(/class="aging-sla-rate-cell" data-period="current"/g) || []).length, 14);
assert.equal((html.match(/class="aging-sla-rate-cell" data-period="previous"/g) || []).length, 14);
assert.match(html, /This week<\/th>/);
assert.match(html, /Last week<\/th>/);
const comparisonTable = html.match(/<table class="aging-sla-comparison-table"[\s\S]*?<\/table>/)[0];
assert.equal((comparisonTable.match(/colSpan="4"/g) || []).length, 2);
for (const row of comparisonTable.match(/<tbody\b[^>]*>[\s\S]*?<\/tbody>/)[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
  assert.match(row[1], /^<th scope="row" role="rowheader">/);
  assert.equal((row[1].match(/<td[ >]/g) || []).length, 9);
}
assert.equal((html.match(/class="sla-failed-count"/g) || []).length, 8);
assert.match(html, /79\.3%/);
assert.match(html, /0\.0%/);
assert.match(html, /October 26–30, 2026/);
assert.doesNotMatch(html, /NaN|undefined/);
const legacy = { ...restored, previousWeek: { teamTotals: {}, grandTotal: null } };
assert.doesNotThrow(() => renderToStaticMarkup(React.createElement(AgingReportTable, { data: legacy, isPublicView: true })));

let workbook;
const writeFile = XLSX.writeFile;
XLSX.writeFile = value => { workbook = value; };
try { exportToXLSX([], restored); } finally { XLSX.writeFile = writeFile; }
const rows = XLSX.utils.sheet_to_json(workbook.Sheets['SLA Compliance'], { header: 1 });
assert.equal(rows[2][5], 'FR Pass Rate Last Week');
assert.equal(rows[2][9], 'RT Pass Rate Last Week');
assert.equal(rows[4][5], '0.00%');
assert.equal(rows[5][5], '100.00%');
assert.equal(rows.at(-1)[5], '79.31%');
assert.equal(rows.at(-1).length, 10);
console.log('Aging SLA checks passed: extract rates and totals, zero/missing values, archive reload, comparison columns, failed cells, and Excel export.');

if (process.argv.includes('--preview')) {
  const fs = require('node:fs');
  const path = require('node:path');
  const css = ['globals.css', 'theme.css', 'report-workflow.css'].map(file => fs.readFileSync(path.join(__dirname, '../src/app', file), 'utf8')).join('\n');
  const page = `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body style="padding:20px"><main>${html}</main></body></html>`;
  require('node:http').createServer((request, response) => { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(page); }).listen(3021, '127.0.0.1', () => console.log('Fixture preview: http://127.0.0.1:3021'));
}
