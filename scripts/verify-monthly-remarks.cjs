const assert = require('node:assert/strict');
require('./register-typescript.cjs');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const XLSX = require('xlsx');
const { calculateMonthlyReport, refreshStoredMonthlyReport } = require('../src/lib/monthly/calculator.ts');
const { getIncidentMonthlyValue } = require('../src/types/monthly.ts');
const { generateMonthlyRemarks } = require('../src/lib/monthly/remarks.ts');
const { MonthlyReportTable } = require('../src/components/monthly/MonthlyReportTable.tsx');
const { ExecutiveRemarksCard } = require('../src/components/monthly/ExecutiveRemarksCard.tsx');
const { ReportExportButton } = require('../src/components/report/ReportExportButton.tsx');
const { getRootCauseOptions, updateMonthlyRootCause } = require('../src/lib/monthly/root-cause.ts');

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

const hradTickets = team('ECS HRAD', 2, 1, 2, 1);
const oldTechnicianReport = JSON.parse(JSON.stringify(calculateMonthlyReport(hradTickets, 'October 2026')));
const posTicket = { category: 'Operational Issues', subCategory: 'POS Services Operations Issues' };
Object.assign(oldTechnicianReport.allTickets[0], posTicket);
const corrected = refreshStoredMonthlyReport(oldTechnicianReport);
assert.equal(corrected.generatedAt, oldTechnicianReport.generatedAt);
assert.deepEqual(corrected.technicianSLA.find(row => row.technician === 'ECS HR').frFailedIds, [hradTickets[0].requestId]);
assert.deepEqual(corrected.technicianSLA.find(row => row.technician === 'ECS HRAD').frTotalIds, [hradTickets[1].requestId]);
assert.equal(corrected.slaReport.resolutionTime.find(row => row.teamName === 'ECS HR').failed, 1);
assert.deepEqual(corrected.kpis, oldTechnicianReport.kpis);
assert.equal(refreshStoredMonthlyReport(corrected), corrected);
assert.equal(getIncidentMonthlyValue(corrected.allTickets[0], 'Technician'), 'ECS HR');
assert.equal(corrected.allTickets[0].rawData.Technician, 'ECS HRAD');
assert.equal(getIncidentMonthlyValue({ ...incidents.at(-1), ...posTicket }, 'Technician'), 'ECS PSD');

const revisedType = 'Revised Root Cause Type';
const revisedCause = 'Revised Identified Root Cause';
const [humanCause] = getRootCauseOptions('Human Factors');
const [technicalCause] = getRootCauseOptions('Technical Factors');
const closedRevision = { ...incidents[0], requestId: 'CLOSED-REVISION' };
const rawClosedRevision = { ...closedRevision, requestStatus: undefined, rawData: { 'Ticket Status': 'Resolved' } };
const openRevision = {
  ...closedRevision, requestId: 'OPEN-REVISION', requestStatus: 'Open',
  rawData: { 'Request Status': 'Closed', Revised_Root_Cause_Type: 'Human Factors', [revisedCause]: humanCause },
};
assert.equal(updateMonthlyRootCause(openRevision, revisedType, 'Technical Factors'), openRevision);
assert.equal(getIncidentMonthlyValue(openRevision, revisedType), '');
assert.equal(getIncidentMonthlyValue(openRevision, revisedCause), '');
assert.equal(updateMonthlyRootCause(closedRevision, revisedCause, humanCause), closedRevision);
const humanType = updateMonthlyRootCause(rawClosedRevision, revisedType, 'Human Factors');
assert.equal(updateMonthlyRootCause(humanType, revisedCause, technicalCause), humanType);
const humanRevision = updateMonthlyRootCause(humanType, revisedCause, humanCause);
assert.equal(getIncidentMonthlyValue(humanRevision, revisedCause), humanCause);
const technicalType = updateMonthlyRootCause(humanRevision, revisedType, 'Technical Factors');
assert.equal(getIncidentMonthlyValue(technicalType, revisedType), 'Technical Factors');
assert.equal(getIncidentMonthlyValue(technicalType, revisedCause), '');
const technicalRevision = updateMonthlyRootCause(technicalType, revisedCause, technicalCause);
assert.equal(getIncidentMonthlyValue(technicalRevision, revisedCause), technicalCause);
assert.equal(getIncidentMonthlyValue(updateMonthlyRootCause(technicalRevision, revisedType, ''), revisedCause), '');

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
  const revisionPreview = renderToStaticMarkup(React.createElement(MonthlyReportTable, {
    ...props, data: calculateMonthlyReport([humanRevision, openRevision], 'November 2026'),
  }));
  const causeSelect = revisionPreview.match(/<select[^>]*aria-label="Revised Identified Root Cause for CLOSED-REVISION"[^>]*>.*?<\/select>/)?.[0];
  assert.ok(causeSelect.includes(humanCause));
  assert.ok(!causeSelect.includes(technicalCause));
  assert.doesNotMatch(revisionPreview, /aria-label="Revised [^"]+ for OPEN-REVISION"/);
  const publicHTML = renderToStaticMarkup(React.createElement(MonthlyReportTable, { ...props, isPublicView: true }));
  assert.doesNotMatch(publicHTML, /aria-label="Revised Root Cause Type for|Archive report/);
} finally { React.useState = useState; }

async function verifyExport() {
  const exportTickets = restored.allTickets.map((ticket, index) => index === 0
    ? { ...ticket, rawData: { ...ticket.rawData, 'Custom Import Field': 'Original value' } }
    : ticket);
  exportTickets.push(openRevision, technicalRevision, corrected.allTickets[0]);
  const account = { id: 'admin', role: 'admin', username: 'admin', name: 'Test Admin' };
  const props = {
    account,
    incidents: [],
    reportData: { ...restored, allTickets: exportTickets },
    baseFilename: 'SMAC_Monthly_Incident_Report',
  };
  const renderButton = account => renderToStaticMarkup(React.createElement(ReportExportButton, { ...props, account }));
  assert.equal(renderButton(null), '');
  assert.equal(renderButton({ ...account, role: 'viewer' }), '');
  assert.match(renderButton({ ...account, role: 'super-admin' }), /Export XLSX/);
  assert.equal((renderButton(account).match(/<button\b/g) || []).length, 1);

  let workbook;
  let exportFilename;
  const writeFile = XLSX.writeFile;
  React.useState = initial => [initial, () => {}];
  XLSX.writeFile = (value, filename, options) => {
    workbook = XLSX.read(XLSX.write(value, { ...options, type: 'buffer' }), { type: 'buffer' });
    exportFilename = filename;
  };
  try {
    const element = ReportExportButton(props);
    await element.props.children[0].props.onClick();
  } finally {
    React.useState = useState;
    XLSX.writeFile = writeFile;
  }

  assert.match(exportFilename, /^SMAC_Monthly_Incident_Report_.*\.xlsx$/);
  assert.deepEqual(workbook.SheetNames, ['All Tickets']);
  const ticketRows = XLSX.utils.sheet_to_json(workbook.Sheets['All Tickets']);
  assert.deepEqual(ticketRows.map(row => row.RequestID), exportTickets.map(ticket => ticket.requestId));
  assert.ok(ticketRows.some(row => row['Request Status'] === 'Open'));
  assert.ok(ticketRows.some(row => row['Request Status'] === 'Closed'));
  assert.equal(ticketRows[0]['Custom Import Field'], 'Original value');
  assert.equal(ticketRows[0].Technician, exportTickets[0].sourceTeam);
  const openRow = ticketRows.find(row => row.RequestID === openRevision.requestId);
  assert.equal(openRow[revisedType], '');
  assert.equal(openRow[revisedCause], '');
  assert.equal(openRow.Revised_Root_Cause_Type, undefined);
  assert.equal(ticketRows.find(row => row.RequestID === technicalRevision.requestId)[revisedCause], technicalCause);
  assert.equal(ticketRows.at(-1).Technician, 'ECS HR');
  console.log('Monthly remarks and the admin-only All Tickets XLSX export passed.');
}
verifyExport().catch(error => { console.error(error); process.exitCode = 1; });

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
