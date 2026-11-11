const assert = require('node:assert/strict');
require('./register-typescript.cjs');

const { approveAcceptableFR, calculateMonthlyReport, filterAcceptableFirstResponse, findAcceptableFRCandidate } = require('../src/lib/monthly/calculator.ts');
const { evaluateFirstResponseOverdue } = require('../src/lib/sla/calculator.ts');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { MonthlyReportTable } = require('../src/components/monthly/MonthlyReportTable.tsx');

function ticket(requestId, sourceTeam, createdTime, overdue = true) {
  return {
    requestId, sourceTeam, assignedTeam: sourceTeam, createdTime,
    category: 'Software', routingReason: '', wasReassigned: false,
    requestStatus: 'Closed', firstResponseOverdue: overdue, resolutionOverdue: true,
    rawData: { Technician: sourceTeam, 'First Response Overdue Status': overdue ? 'TRUE' : 'FALSE' },
  };
}
const incidents = [
  ticket('IR-1', 'ECS SDS', new Date(2026, 10, 2, 10)),
  ticket('IR-2', 'ECS ISS MT', new Date(2026, 10, 1, 20)),
  ticket('IR-3', 'ECS SDS', new Date(2026, 10, 1, 20)),
  ticket('IR-4', 'ECS SDS', new Date(2026, 10, 2, 10), false),
];
const before = calculateMonthlyReport(incidents, 'November 2026');
assert.equal(before.technicianTotals.frFailed, 2);
assert.deepEqual(filterAcceptableFirstResponse(incidents).map(i => i.requestId), ['IR-3']);
assert.equal(findAcceptableFRCandidate(incidents, ' ir-1 ').requestId, 'IR-1');
assert.throws(() => findAcceptableFRCandidate(incidents, ''), /Enter a Request ID/);
assert.throws(() => findAcceptableFRCandidate(incidents, 'IR-999'), /not found/);
assert.throws(() => findAcceptableFRCandidate(incidents, 'IR-3'), /already in/);
assert.throws(() => findAcceptableFRCandidate(incidents, 'IR-4'), /already passed/);

const approved = approveAcceptableFR(incidents, ' ir-1 ', 'Test Admin');
assert.equal(incidents[0].acceptableFirstResponseApproval, undefined);
assert.equal(approved[0].acceptableFirstResponseApproval.approvedBy, 'Test Admin');
assert.ok(Number.isFinite(Date.parse(approved[0].acceptableFirstResponseApproval.approvedAt)));
assert.equal(approved[0].rawData['First Response Overdue Status'], 'TRUE');
assert.equal(evaluateFirstResponseOverdue(approved[0], approved[0].assignedTeam), false);
assert.throws(() => approveAcceptableFR(approved, 'IR-1', 'Test Admin'), /already in/);
const after = calculateMonthlyReport(approved, 'November 2026');
assert.equal(after.technicianTotals.frFailed, 1);
assert.equal(after.technicianTotals.frPassed, before.technicianTotals.frPassed + 1);
assert.equal(after.technicianTotals.frTotal, before.technicianTotals.frTotal);
assert.equal(after.technicianTotals.rtFailed, before.technicianTotals.rtFailed);
assert.equal(after.kpis[0].countOfPassed, before.kpis[0].countOfPassed + 1);
assert.equal(calculateMonthlyReport(approveAcceptableFR(approved, 'IR-2', 'Test Admin'), 'November 2026').technicianTotals.frFailed, 0);

// The same JSON payload used by archives/publication retains approval and counts.
const restored = JSON.parse(JSON.stringify(after));
assert.deepEqual(filterAcceptableFirstResponse(restored.allTickets).map(i => i.requestId), ['IR-1', 'IR-3']);
assert.equal(calculateMonthlyReport(restored.allTickets, restored.reportPeriod).technicianTotals.frFailed, 1);

// Render the Acceptable FR tab to check both admin and public visibility.
const useState = React.useState;
React.useState = initial => useState(initial === 'sla-dashboard' ? 'first-response' : initial);
try {
  const props = { data: restored, onAddAcceptableFR: () => {} };
  const admin = renderToStaticMarkup(React.createElement(MonthlyReportTable, { ...props, isAdmin: true }));
  assert.match(admin, /Validate Request ID/);
  assert.match(admin, /ACCEPTED \(ADMIN\)/);
  assert.match(admin, /ACCEPTED \(AFTER-HOURS\)/);
  for (const extra of [{ isAdmin: false }, { isAdmin: true, isPublicView: true }]) {
    const html = renderToStaticMarkup(React.createElement(MonthlyReportTable, { ...props, ...extra }));
    assert.doesNotMatch(html, /Validate Request ID/);
    assert.match(html, /ACCEPTED \(ADMIN\)/);
  }
} finally {
  React.useState = useState;
}
console.log('Acceptable FR verification passed: validation, approval, SLA totals, raw data, JSON reload, and admin/public visibility.');
