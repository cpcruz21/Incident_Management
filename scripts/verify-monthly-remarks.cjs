const assert = require('node:assert/strict');
require('./register-typescript.cjs');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const XLSX = require('xlsx');
const { calculateMonthlyReport } = require('../src/lib/monthly/calculator.ts');
const { generateMonthlyRemarks } = require('../src/lib/monthly/remarks.ts');
const { MonthlyReportTable } = require('../src/components/monthly/MonthlyReportTable.tsx');
const { ExecutiveRemarksCard } = require('../src/components/monthly/ExecutiveRemarksCard.tsx');
const { exportToXLSX, exportToHTML } = require('../src/lib/report/export.ts');

function team(name, total, lateFR, closed, lateRT) {
  return Array.from({ length: total }, (_, i) => ({
    requestId: `${name}-${i}`, sourceTeam: name, assignedTeam: name,
    category: 'Software', routingReason: '', wasReassigned: false,
    createdTime: new Date(2026, 10, 2, 10),
    requestStatus: i < closed ? 'Closed' : 'Open',
    firstResponseOverdue: i < lateFR, resolutionOverdue: i < lateRT,
    rawData: { Technician: name, 'First Response Overdue Status': i < lateFR ? 'TRUE' : 'FALSE' },
  }));
}
const incidents = [
  ...team('ECS ISS Binondo', 49, 3, 40, 2),
  ...team('ECS HRAD', 5, 0, 5, 0),
  ...team('ECS ISS MT', 2, 1, 2, 0),
  ...team('ECS SDS', 9, 0, 5, 0),
  ...team('ECS ISMS Support', 12, 8, 6, 0),
  ...team('ECS PSD', 3, 2, 3, 0),
];
const report = calculateMonthlyReport(incidents, 'November 2026');
assert.match(report.remarks, /Resolution Time: Met \(96\.72%\).*59 of 61 closed tickets.*2 were late/);
assert.match(report.remarks, /Response Time: Not met \(82\.50%\).*66 of 80 tickets.*14 were late/);
assert.match(report.remarks, /2\.50 percentage points below target; at least 2 more passing tickets/);
assert.match(report.remarks, /ECS ISS Binondo handled the largest ticket volume \(49 of 80 tickets\)/);
assert.match(report.remarks, /ECS ISMS Support \(33\.33% passed; 8 late out of 12\)/);
assert.doesNotMatch(report.remarks, /moved.*closer|narrowly|strictly|strong results|N\/A%/);

// Resolution must use its own gap and only closed tickets, even when FR passes.
const resolutionOnly = calculateMonthlyReport(team('ECS SDS', 20, 0, 10, 4), 'November 2026');
assert.match(resolutionOnly.remarks, /Resolution Time: Not met \(60\.00%\).*6 of 10 closed tickets/);
assert.match(resolutionOnly.remarks, /Resolution is 25\.00 percentage points below target; at least 3 more passing tickets/);
const bothFail = calculateMonthlyReport(team('ECS ISS MT', 20, 10, 10, 4), 'November 2026');
assert.match(bothFail.remarks, /First response is 35\.00 percentage points/);
assert.match(bothFail.remarks, /Resolution is 25\.00 percentage points/);
assert.doesNotMatch(bothFail.remarks, /strong results|execution was excellent/);

// Missing data is not a failed KPI, nor a 0% result to improve.
const empty = calculateMonthlyReport([], 'November 2026');
assert.equal((empty.remarks.match(/No data \(N\/A\)/g) || []).length, 2);
assert.doesNotMatch(empty.remarks, /Failed|Not met|below target|N\/A%|100\.00%/);
const openOnly = calculateMonthlyReport(team('ECS SDS', 5, 0, 0, 0), 'November 2026');
assert.match(openOnly.remarks, /Resolution Time: No data \(N\/A\)/);
assert.match(openOnly.remarks, /100\.00% first response and N\/A resolution/);
assert.doesNotMatch(openOnly.remarks, /N\/A%|both.*targets/);

// Meeting the overall target must still allow team-level follow-up.
const boundary = calculateMonthlyReport([
  ...team('ECS SDS', 17, 0, 17, 0), ...team('ECS PSD', 3, 3, 3, 0),
], 'November 2026');
assert.match(boundary.remarks, /Response Time: Met \(85\.00%\)/);
assert.match(boundary.remarks, /overall first-response result on target and review late responses with ECS PSD/);
assert.doesNotMatch(boundary.remarks, /response target was missed|below target/);
const higherTarget = boundary.kpis.map(k => ({ ...k, targetPercent: 90 }));
assert.match(generateMonthlyRemarks(higherTarget, boundary.technicianSLA, boundary.technicianTotals), /5\.00 percentage points below target; at least 1 more passing ticket is/);

// Accepted overdue tickets count as passing, without calling them on time.
const acceptedTickets = team('ECS SDS', 1, 1, 1, 0);
acceptedTickets[0].acceptableFirstResponseApproval = { approvedBy: 'Test', approvedAt: new Date().toISOString() };
const accepted = calculateMonthlyReport(acceptedTickets, 'November 2026');
assert.match(accepted.remarks, /1 of 1 tickets passed first response \(on-time responses or accepted exceptions\); 0 were late/);

// An existing saved report displays current remarks in both admin and public views.
const restored = JSON.parse(JSON.stringify({ ...report, remarks: 'Old cached remarks' }));
for (const options of [{ isAdmin: true }, { isPublicView: true }]) {
  const html = renderToStaticMarkup(React.createElement(MonthlyReportTable, { data: restored, ...options }));
  assert.match(html, /Remarks for overall result/);
  assert.match(html, /Not met \(82\.50%\)/);
  assert.match(html, /Next steps:/);
  assert.doesNotMatch(html, /Old cached remarks|Executive Remarks|Strategic Observations/);
  assert.equal((html.match(/role="tab" /g) || []).length, 5);
  assert.equal((html.match(/role="tabpanel" /g) || []).length, 5);
  assert.equal((html.match(/aria-selected="true"/g) || []).length, 1);
  for (const control of html.matchAll(/role="tab" id="([^"]+)" aria-controls="([^"]+)"/g)) {
    assert.ok(html.includes(`id="${control[2]}" aria-labelledby="${control[1]}"`));
  }
  assert.match(html, /scope="colgroup" colSpan="4"/);
  assert.match(html, /role="region" aria-label="Technician SLA performance table" tabindex="0"/);
}
const emptyHTML = renderToStaticMarkup(React.createElement(ExecutiveRemarksCard, { remarks: empty.remarks }));
assert.match(emptyHTML, /<strong[^>]*>No data \(N\/A\)<\/strong>/);

// Ticket views keep keyboard-sortable headings, readable details, and public revisions read-only.
const useState = React.useState;
React.useState = initial => useState(initial === 'sla-dashboard' ? 'all-tickets' : initial);
try {
  const props = { data: restored, isAdmin: true, onUpdateIncident() {} };
  const admin = renderToStaticMarkup(React.createElement(MonthlyReportTable, props));
  assert.match(admin, /monthly-sort-button/);
  assert.match(admin, /monthly-long-cell/);
  assert.match(admin, /<label[^>]*>Search tickets<\/label>/);
  assert.match(admin, /aria-label="Revised Root Cause Type for/);
  const publicHTML = renderToStaticMarkup(React.createElement(MonthlyReportTable, { ...props, isPublicView: true }));
  assert.doesNotMatch(publicHTML, /aria-label="Revised Root Cause Type for|Archive report/);
} finally { React.useState = useState; }

let workbook;
const writeFile = XLSX.writeFile;
XLSX.writeFile = value => { workbook = value; };
try { exportToXLSX([], restored); } finally { XLSX.writeFile = writeFile; }
const excel = XLSX.utils.sheet_to_json(workbook.Sheets.SLA, { header: 1 }).flat().join('\n');
assert.ok(excel.includes(report.remarks.split('\n').find(line => line.startsWith('Next steps:'))));
assert.doesNotMatch(excel, /Old cached remarks/);

let downloaded;
const createURL = URL.createObjectURL;
const revokeURL = URL.revokeObjectURL;
const priorDocument = global.document;
URL.createObjectURL = blob => { downloaded = blob; return 'blob:test'; };
URL.revokeObjectURL = () => {};
global.document = { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {}, removeChild() {} } };
try { exportToHTML([], restored); } finally {
  URL.createObjectURL = createURL;
  URL.revokeObjectURL = revokeURL;
  if (priorDocument === undefined) delete global.document; else global.document = priorDocument;
}
downloaded.text().then(html => {
  assert.match(html, /66 of 80 tickets passed first response/);
  assert.match(html, /2\.50 percentage points/);
  assert.doesNotMatch(html, /Old cached remarks/);
  console.log('Monthly remarks verified: KPI counts, both gaps, thresholds, empty/open-only data, exceptions, saved admin/public reports, and Excel/HTML exports.');
}).catch(error => { console.error(error); process.exitCode = 1; });

if (process.argv.includes('--preview')) {
  const fs = require('node:fs');
  const path = require('node:path');
  const css = ['globals.css', 'theme.css', 'report-workflow.css', 'admin-light.css', 'monthly-report.css'].map(file => fs.readFileSync(path.join(__dirname, '../src/app', file), 'utf8')).join('\n');
  const card = renderToStaticMarkup(React.createElement(MonthlyReportTable, { data: report, isAdmin: true }));
  require('node:http').createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(`<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css} body { margin: 0; padding: 16px; font-family: Arial, sans-serif; } main { max-width: 1200px; margin: 0 auto; }</style></head><body><main class="admin-shell">${card}</main></body></html>`);
  }).listen(3022, '127.0.0.1', () => console.log('Remarks preview: http://127.0.0.1:3022'));
}
