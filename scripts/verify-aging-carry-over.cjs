const assert = require('node:assert/strict');
require('./register-typescript.cjs');
const fs = require('node:fs');
const { createAgingReport } = require('../src/lib/aging/report.ts');
const { saveReport } = require('../src/lib/storage/report-storage.ts');

// Exercise the actual save/load/create client path with a JSON archive transport.
// No application data is written by this test.
async function verify() {
  const originalFetch = global.fetch;
  let records = JSON.parse(fs.readFileSync(require('node:path').join(__dirname, '../data/aging/archive.json'), 'utf8'));
  records.sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
  const lastSaved = records[0];
  global.fetch = async (url, options = {}) => {
    assert.equal(url, '/api/reports/archive');
    if (options.method === 'POST') {
      records = [...JSON.parse(options.body).reports, ...records];
      return new Response(null, { status: 204 });
    }
    return Response.json({ reports: records });
  };
  try {
    const asOf = new Date(2026, 10, 6, 18);
    const incidents = [{
      requestId: 'CARRY-OVER-1', sourceTeam: 'ECS SDS', assignedTeam: 'ECS SDS', category: 'Software',
      routingReason: '', wasReassigned: false, createdTime: new Date(2026, 10, 6, 10), requestStatus: 'Open',
      firstResponseOverdue: false, resolutionOverdue: false,
      rawFirstResponseStatus: 'FALSE', rawResolutionStatus: 'FALSE',
      rawData: { Technician: 'ECS SDS', 'First Response Overdue Status': 'FALSE', 'Overdue Status': 'FALSE' },
    }];
    const first = await createAgingReport(incidents, 'New Aging Report', undefined, asOf);
    assert.equal(first.previousWeek.sourceReportId, lastSaved.id);
    assert.equal(first.previousWeek.sla.firstResponseTotal, lastSaved.reportData.slaTotals.firstResponse.slaPassRate);
    assert.equal(first.previousWeek.sla.resolutionTimeTotal, lastSaved.reportData.slaTotals.resolutionTime.slaPassRate);
    for (const row of lastSaved.reportData.slaRows) {
      assert.equal(first.previousWeek.sla.firstResponse[row.teamName], row.firstResponse.slaPassRate);
      assert.equal(first.previousWeek.sla.resolutionTime[row.teamName], row.resolutionTime.slaPassRate);
    }
    const stored = await saveReport({ type: 'aging', title: first.reportTitle, period: first.reportPeriod, reportData: first, routedIncidents: incidents });
    const second = await createAgingReport(incidents, 'Next Aging Report', undefined, asOf);
    assert.equal(second.previousWeek.sourceReportId, stored.id);
    assert.equal(second.previousWeek.sla.firstResponseTotal, first.slaTotals.firstResponse.slaPassRate);
    assert.equal(second.previousWeek.sla.resolutionTimeTotal, first.slaTotals.resolutionTime.slaPassRate);
    assert.notEqual(second.previousWeek.sla.firstResponseTotal, first.previousWeek.sla.firstResponseTotal);
    records = [];
    const empty = await createAgingReport(incidents, 'First Ever Aging Report', undefined, asOf);
    assert.equal(empty.previousWeek.sla, undefined);
    global.fetch = async () => new Response(JSON.stringify({ error: 'Archive unavailable' }), { status: 503 });
    await assert.rejects(createAgingReport(incidents, 'Unavailable Archive', undefined, asOf), /Archive unavailable/);
    console.log(`Carry-over passed: ${lastSaved.period} → new report → saved report → next report; team rates, totals, no-history and archive failure verified.`);
  } finally { global.fetch = originalFetch; }
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
