const assert = require('node:assert/strict');
require('./register-typescript.cjs');
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');
const { parseFile } = require('../src/lib/excel/parser.ts');
const { autoDetectMapping, mapAllRows } = require('../src/lib/excel/mapper.ts');
const { DEFAULT_COLUMN_MAPPING } = require('../src/types/incident.ts');
const aging = require('../src/lib/aging/calculator.ts');
const sla = require('../src/lib/sla/calculator.ts');
const { calculateAgingReport } = require('../src/lib/aging/report.ts');
const { getImportedSLAStatus } = require('../src/lib/sla/status.ts');
const { filterClosedTickets } = require('../src/lib/monthly/calculator.ts');

function raw(id, created, fr, rt, team = 'ECS SDS', status = 'Open') {
  return { RequestID: id, Technician: team, Category: 'Software', 'Request Status': status,
    'Created Time': created, 'First Response Overdue': fr, Overdue: rt, Priority: 'P1' };
}
const rows = [
  raw('OFFICE', '11-09-2026 10:00', 'TRUE', 'FALSE'),
  raw('AFTER-HOURS', '11-09-2026 07:30', 'TRUE', 'TRUE'),
  raw('WEEKEND', '11-07-2026 10:00', 'TRUE', 'FALSE'),
  raw('ISS-WEEKEND', '11-07-2026 10:00', 'TRUE', 'TRUE', 'ECS ISS'),
  raw('RAW-PASS', '10-01-2026 10:00', 'FALSE', 'FALSE'),
  raw('APPROVED', '11-09-2026 10:00', 'TRUE', 'TRUE'),
  raw('OTHER-TEAM', '11-09-2026 10:00', 'TRUE', 'FALSE', 'Other Support'),
  raw('UNRESOLVED', '11-09-2026 10:00', 'TRUE', 'FALSE', 'ECS SDS', 'Unresolved'),
  raw('CLOSED', '11-09-2026 10:00', 'TRUE', 'TRUE', 'ECS SDS', 'Closed'),
];
const asOf = new Date(2026, 10, 9, 12);

async function verify() {
  // Real XLSX import -> detected column mapping -> calculator, with independently counted results.
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Raw Data');
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const parsed = await parseFile({ arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  assert.equal(parsed.success, true);
  const mapping = { ...DEFAULT_COLUMN_MAPPING, ...autoDetectMapping(parsed.columns) };
  assert.equal(mapping.firstResponseOverdueStatus, 'First Response Overdue');
  assert.equal(mapping.overdueStatus, 'Overdue');
  const mapped = mapAllRows(parsed.data, mapping);
  assert.equal(mapped.incidents.length, 9);
  mapped.incidents.find(i => i.requestId === 'APPROVED').acceptableFirstResponseApproval = { approvedBy: 'Admin', approvedAt: asOf.toISOString() };
  const original = JSON.stringify(mapped.incidents);
  const result = calculateAgingReport(mapped.incidents, 'Test snapshot', { teamTotals: {}, grandTotal: null }, asOf);
  assert.equal(result.slaTotals.totalIRs, 8);
  assert.equal(result.slaTotals.firstResponse.failed, 4); // Office, ISS weekend, Other Support, Unresolved.
  assert.equal(result.slaTotals.resolutionTime.failed, 3); // After-hours, ISS weekend, Approved.
  assert.equal(result.slaTotals.firstResponse.slaPassRate, 50);
  assert.equal(result.slaTotals.resolutionTime.slaPassRate, 62.5);
  assert.equal(result.agingGrandTotal, 8);
  assert.ok(result.teamOrder.includes('Other Support'));
  assert.equal(JSON.stringify(mapped.incidents), original, 'Report generation must not modify imported incidents');
  for (const row of result.slaRows) {
    assert.equal(row.firstResponse.failed + row.firstResponse.passed, row.totalIRs);
    assert.equal(row.resolutionTime.failed + row.resolutionTime.passed, row.totalIRs);
  }
  const frozen = mapped.incidents.map(i => Object.freeze({ ...i }));
  assert.doesNotThrow(() => sla.calculateSLAReport(frozen));
  assert.equal(sla.calculateSLAReport(frozen).firstResponseTotal.total, 9, 'Weekly totals must include every team');

  // No threshold inference may override valid imported booleans or numeric FALSE/TRUE.
  const boolIncident = { ...mapped.incidents[0], rawFirstResponseStatus: undefined, rawResolutionStatus: undefined,
    rawData: { 'First_Response_Overdue_Status': false, 'Resolution Overdue Status': 1 } };
  assert.equal(getImportedSLAStatus(boolIncident, 'firstResponse'), false);
  assert.equal(getImportedSLAStatus(boolIncident, 'resolution'), true);
  assert.equal(sla.evaluateFirstResponseOverdue(boolIncident, 'ECS SDS', asOf), false);
  assert.equal(sla.evaluateResolutionOverdue(boolIncident, asOf), true);
  for (const [hour, minute, failed] of [[8, 29, false], [8, 30, true], [17, 29, true], [17, 30, false]]) {
    assert.equal(sla.evaluateFirstResponseOverdue({ ...mapped.incidents[0], createdTime: new Date(2026, 10, 9, hour, minute), rawData: {} }, 'ECS SDS', asOf), failed);
  }
  assert.equal(sla.getBusinessMinutes(new Date(2026, 10, 6, 17), new Date(2026, 10, 9, 9)), 60);
  const reopened = { ...mapped.incidents[0], requestStatus: 'Assigned', completedTime: new Date(2026, 10, 8) };
  assert.equal(aging.filterOpenIncidents([reopened]).length, 1);
  assert.equal(filterClosedTickets([{ ...reopened, requestStatus: 'Unresolved' }]).length, 0);
  assert.equal(aging.filterOpenIncidents([{ ...reopened, requestStatus: undefined, completedTime: undefined, rawData: { 'Overdue Status': 'TRUE', 'Request Status': 'Closed' } }]).length, 0);

  const boundaryCases = [[0, 'sameday'], [1, '1-3days'], [3, '1-3days'], [4, '4-6days'], [6, '4-6days'], [7, '1-2weeks'], [13, '1-2weeks'], [14, '2-4weeks'], [30, '2-4weeks'], [31, '>1month']];
  for (const [days, bucket] of boundaryCases) {
    const created = new Date(2026, 10, 9 - days, 10);
    const incident = { ...mapped.incidents[0], createdTime: created };
    assert.equal(aging.calculateAgingDays(created, asOf), days);
    assert.equal(aging.calculateAgingDistribution([incident], ['ECS SDS'], asOf)[0].buckets[bucket], 1, `Day ${days} must be in ${bucket}`);
  }
  assert.equal(aging.calculateAgingDays(new Date(2026, 10, 8, 23, 59), new Date(2026, 10, 9, 0, 1)), 1);
  assert.equal(aging.toValidDate('02-30-2026 10:00'), null);
  assert.equal(aging.toValidDate('2026-02-30T10:00:00Z'), null);
  assert.equal(aging.toValidDate('11-09-2026 03:00 PM').getHours(), 15);
  const serial = (Date.UTC(2026, 10, 9, 12) - Date.UTC(1899, 11, 30)) / 86400000;
  assert.equal(aging.toValidDate(serial).getHours(), 12, 'Excel wall-clock time must not shift by the computer timezone');
  const invalid = { ...mapped.incidents[0], createdTime: undefined };
  assert.throws(() => calculateAgingReport([invalid], '', { teamTotals: {}, grandTotal: null }, asOf), /invalid Created Time/);
  assert.throws(() => calculateAgingReport([mapped.incidents[0], mapped.incidents[0]], '', { teamTotals: {}, grandTotal: null }, asOf), /Duplicate Request ID/);
  assert.throws(() => calculateAgingReport([mapped.incidents[0]], '', { teamTotals: {}, grandTotal: null }, new Date(2026, 10, 8)), /earlier than/);
  assert.equal(calculateAgingReport([], '', { teamTotals: {}, grandTotal: null }, asOf).slaTotals.firstResponse.slaPassRate, null);

  // Independently reconcile actual imported SDP rows, retaining the approved office-hours policy.
  for (const stored of JSON.parse(fs.readFileSync(path.join(__dirname, '../data/aging/archive.json'), 'utf8'))) {
    const incidents = stored.routedIncidents || [];
    const expected = incidents.filter(i => !/^(closed|resolved|completed|cancelled|canceled)\b/i.test(String(i.rawData['Request Status'] || '')));
    let frFailed = 0, rtFailed = 0, excused = 0;
    for (const incident of expected) {
      const match = String(incident.rawData['Created Time']).match(/^(\d+)-(\d+)-(\d+) (\d+):(\d+)/);
      assert.ok(match);
      const created = new Date(+match[3], +match[1] - 1, +match[2], +match[4], +match[5]);
      const outside = [0, 6].includes(created.getDay()) || created.getHours() * 60 + created.getMinutes() < 510 || created.getHours() * 60 + created.getMinutes() >= 1050;
      const iss = /iss/i.test(incident.assignedTeam + ' ' + incident.rawData.Technician);
      const rawFR = String(incident.rawData['First Response Overdue Status']).toUpperCase() === 'TRUE';
      const accepted = incident.acceptableFirstResponseApproval || (!iss && outside);
      if (rawFR && !accepted) frFailed++;
      if (rawFR && accepted) excused++;
      if (String(incident.rawData['Overdue Status']).toUpperCase() === 'TRUE') rtFailed++;
    }
    const report = calculateAgingReport(incidents, stored.period, stored.reportData.previousWeek, new Date(stored.reportData.asOf || stored.reportData.generatedAt));
    assert.equal(report.slaTotals.totalIRs, expected.length);
    assert.equal(report.slaTotals.firstResponse.failed, frFailed);
    assert.equal(report.slaTotals.resolutionTime.failed, rtFailed);
    assert.equal(report.agingGrandTotal, expected.length);
    console.log(JSON.stringify({ period: stored.period, importedOpen: expected.length, rawFRFailed: frFailed + excused, acceptedFR: excused, finalFRFailed: frFailed, rtFailed }));
  }
  console.log('Raw import, SLA policy, totals, date parsing, aging boundaries, missing data, and original-data preservation checks passed.');
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
