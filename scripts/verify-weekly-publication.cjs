const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('./register-typescript.cjs');
const testRoot = path.resolve(__dirname, '../.next-dev/test-data');
fs.mkdirSync(testRoot, { recursive: true });
process.env.SMAC_DATA_DIR = fs.mkdtempSync(path.join(testRoot, 'weekly-publication-'));
const { NextResponse } = require('next/server');
const auth = require('../src/lib/server/auth.ts');
let denied = true;
auth.requireAdmin = () => denied ? NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 }) : null;
auth.getAdminSession = () => ({ id: 'test-admin', name: 'Test Admin', role: 'admin', username: 'test-admin' });
const route = require('../src/app/api/reports/weekly/route.ts');
const { isWeeklyReportData, toPublicWeeklyReport } = require('../src/lib/report/weekly-publication.ts');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { SLAReportTable } = require('../src/components/report/SLAReportTable.tsx');
const { WeeklySLASummary } = require('../src/components/report/WeeklySLASummary.tsx');
const { DetailModal } = require('../src/components/report/DetailModal.tsx');
const PublicDashboard = require('../src/app/public-dashboard/page.tsx').default;

const row = { teamName: 'ECS SDS', total: 1, failed: 0, passed: 1, slaPassRate: 100, incidentIds: ['TEST-1'], failedIncidentIds: [], passedIncidentIds: ['TEST-1'] };
const reportData = {
  reportTitle: 'Weekly SLA Test', reportPeriod: 'Week 1', generatedAt: new Date().toISOString(), teamOrder: ['ECS SDS'],
  currentWeek: { firstResponse: [row], resolutionTime: [row], firstResponseTotal: { ...row, teamName: 'TOTAL' }, resolutionTimeTotal: { ...row, teamName: 'TOTAL' } },
  previousWeek: { firstResponse: { 'ECS SDS': 90 }, resolutionTime: { 'ECS SDS': 80 }, firstResponseTotal: 90, resolutionTimeTotal: 80 },
  weeklyCompletion: { firstResponse: { passed: 1, failed: 0, slaPassRate: 100 }, resolution: { passed: 1, failed: 0, slaPassRate: 100 } },
};
const fr = { ...row, total: 3, failed: 2, slaPassRate: 100 / 3, incidentIds: ['IR-100', 'IR-101', 'IR-102'],
  passedIncidentIds: ['IR-100'], failedIncidentIds: ['invalid', ' IR-101 ', '101', 'IR-102', 'IR-999'] };
const rt = { ...row, total: 2, failed: 1, slaPassRate: 50, incidentIds: ['IR-200', 'IR-201'],
  passedIncidentIds: ['IR-200'], failedIncidentIds: ['IR-201'] };
const failedData = { ...reportData, currentWeek: {
  firstResponse: [fr], firstResponseTotal: { ...fr, teamName: 'TOTAL' },
  resolutionTime: [rt], resolutionTimeTotal: { ...rt, teamName: 'TOTAL' },
} };
const payload = { id: 'week-1', title: 'Weekly SLA', period: 'Week 1', reportData, savedBy: 'Client name must not be trusted', routedIncidents: [{ requestId: 'PRIVATE-INCIDENT', description: 'PRIVATE-DESCRIPTION' }], privateNotes: 'PRIVATE-NOTES' };
const request = body => new Request('http://localhost:3000/api/reports/weekly', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function verify() {
  fs.mkdirSync(path.join(process.env.SMAC_DATA_DIR, 'weekly'));
  fs.writeFileSync(path.join(process.env.SMAC_DATA_DIR, 'weekly', 'archive.json'), JSON.stringify([{ ...payload, id: 'private-only' }]));
  const initial = route.GET();
  assert.equal(initial.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await initial.json()).reports, []);
  assert.equal((await route.POST(request(payload))).status, 401);
  denied = false;
  assert.equal((await route.POST(request({}))).status, 400);
  const invalid = JSON.parse(JSON.stringify(payload));
  invalid.reportData.currentWeek.firstResponse[0].passed = 10;
  assert.equal((await route.POST(request(invalid))).status, 400);
  assert.equal((await route.POST(request(payload))).status, 200);
  let reports = (await route.GET().json()).reports;
  assert.equal(reports.length, 1);
  assert.equal(reports[0].savedBy, undefined);
  assert.equal(reports[0].routedIncidents, undefined);
  assert.doesNotMatch(JSON.stringify(reports[0]), /PRIVATE-|TEST-1|Test Admin|Client name/);
  assert.ok(Number.isFinite(Date.parse(reports[0].savedAt)));
  assert.equal((await route.POST(request({ ...payload, id: 'week-1-revised', title: 'Revised weekly', reportData: failedData }))).status, 200);
  reports = (await route.GET().json()).reports;
  assert.equal(reports.length, 1);
  assert.equal(reports[0].title, 'Revised weekly');
  const published = reports[0].reportData;
  assert.deepEqual(published.currentWeek.firstResponse[0].incidentIds, ['IR-100', 'IR-101', 'IR-102']);
  assert.deepEqual(published.currentWeek.firstResponse[0].passedIncidentIds, ['IR-100']);
  assert.deepEqual(published.currentWeek.firstResponse[0].failedIncidentIds, ['IR-101', 'IR-102']);
  assert.deepEqual(published.currentWeek.resolutionTimeTotal.failedIncidentIds, ['IR-201']);
  assert.deepEqual(toPublicWeeklyReport(published), published); // Both client and server project the publication.
  assert.doesNotMatch(JSON.stringify(reports[0]), /PRIVATE-|TEST-1|IR-999|Test Admin|Client name/);
  assert.equal((await route.POST(request({ ...payload, id: 'week-2', period: 'Week 2' }))).status, 200);
  reports = (await route.GET().json()).reports;
  assert.equal(reports.length, 2);
  assert.ok(reports.every(report => report.id !== 'private-only'));

  const onCellClick = () => {};
  const admin = renderToStaticMarkup(React.createElement(SLAReportTable, { data: failedData, onCellClick }));
  assert.match(admin, /Publish to dashboard/);
  assert.match(admin, /aria-label="ECS SDS — First Response Passed, 1 incident"/);
  const guest = renderToStaticMarkup(React.createElement(SLAReportTable, { data: published, onCellClick, isPublicView: true }));
  assert.doesNotMatch(guest, /Publish to dashboard|Archive Report/);
  assert.match(guest, /Weekly SLA Report/);
  assert.match(guest, /class="weekly-module-period">Week 1/);
  assert.doesNotMatch(guest, /class="weekly-report-banner"/);
  assert.doesNotMatch(guest, /Overdue Status|weekly-overdue-section/);
  assert.doesNotMatch(admin, /Overdue Status|weekly-overdue-section/);
  assert.ok(guest.indexOf('aria-label="Weekly SLA summary"') < guest.indexOf('class="weekly-incident-table"'));
  assert.match(guest, /aria-label="FR Failed, 2 incidents"/);
  assert.match(guest, /aria-label="ECS SDS — FR Failed, 2 incidents"/);
  assert.match(guest, /aria-label="Total — RT Failed, 1 incident"/);
  assert.match(guest, /aria-label="Total records, 3 incidents"/);
  assert.match(guest, /aria-label="FR Passed, 1 incident"/);
  assert.match(guest, /aria-label="ECS SDS — First Response Total, 3 incidents"/);
  assert.match(guest, /aria-label="Total — Resolution Time Passed, 1 incident"/);
  const legacy = JSON.parse(JSON.stringify(published));
  for (const row of [...legacy.currentWeek.firstResponse, ...legacy.currentWeek.resolutionTime,
    legacy.currentWeek.firstResponseTotal, legacy.currentWeek.resolutionTimeTotal]) {
    row.incidentIds = [];
    row.passedIncidentIds = [];
    row.failedIncidentIds = [];
  }
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(SLAReportTable,
    { data: legacy, onCellClick, isPublicView: true })), /class="weekly-sla-count\b/);
  const details = renderToStaticMarkup(React.createElement(DetailModal, {
    isOpen: true, title: 'ECS SDS — FR Failed', incidentIds: published.currentWeek.firstResponse[0].failedIncidentIds, onClose() {},
  }));
  assert.match(details, /href="\/api\/sdp\/requests\/IR-101" target="_blank"/);
  assert.match(details, /href="\/api\/sdp\/requests\/IR-102" target="_blank"/);
  assert.doesNotMatch(details, /IR-201/);
  const summary = data => renderToStaticMarkup(React.createElement(WeeklySLASummary, { data }));
  assert.match(summary(reportData), /\+10\.00 pp/);
  assert.match(summary(reportData), /\+20\.00 pp/);
  const lower = { ...reportData, previousWeek: { ...reportData.previousWeek, firstResponseTotal: 100, resolutionTimeTotal: null }, currentWeek: { ...reportData.currentWeek, firstResponseTotal: { ...row, total: 10, passed: 9, failed: 1, slaPassRate: 90 } } };
  assert.match(summary(lower), /is-down/);
  assert.match(summary(lower), /-10\.00 pp/);
  assert.match(summary(lower), /No previous comparison/);
  assert.doesNotMatch(summary(lower), /NaN|Infinity/);
  const empty = { ...lower, currentWeek: { ...lower.currentWeek, firstResponseTotal: { ...row, total: 0, passed: 0, failed: 0, slaPassRate: null } } };
  assert.match(summary(empty), /weekly-sla-summary-rate">N\/A/);
  assert.doesNotMatch(summary(empty), /NaN|Infinity/);
  const dashboard = renderToStaticMarkup(React.createElement(PublicDashboard));
  const labels = ['Dashboard', 'Weekly SLA', 'Aging', 'Monthly'].map(label => dashboard.indexOf(`<span>${label}</span>`));
  assert.ok(labels.every(index => index >= 0));
  assert.deepEqual(labels, [...labels].sort((a, b) => a - b));
  assert.doesNotMatch(dashboard, /Export PNG/);

  const archived = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/weekly/archive.json'), 'utf8'));
  for (const record of archived) assert.ok(isWeeklyReportData(record.reportData), `Stored weekly report ${record.period} must be publishable`);
  console.log('Weekly publication checks passed: archive isolation, authentication, period history, ticket drill-downs, SDP links, and public controls.');
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
