const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
require('./register-typescript.cjs');

// Exercise real save/load handlers and JSON persistence in an isolated directory.
const priorDataDir = process.env.SMAC_DATA_DIR;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smac-aging-snapshots-'));
process.env.SMAC_DATA_DIR = testDir;
const { NextResponse } = require('next/server');
const auth = require('../src/lib/server/auth.ts');
let denied = false;
auth.requireAdmin = () => denied ? NextResponse.json({ error: 'Sign in' }, { status: 401 }) : null;
auth.getAdminSession = () => ({ id: 'test', name: 'Test Admin', role: 'admin', username: 'test' });
const archive = require('../src/app/api/reports/archive/route.ts');
const published = require('../src/app/api/reports/aging/route.ts');
const storage = require('../src/lib/server/storage.ts');
const { createAgingReport } = require('../src/lib/aging/report.ts');
const { saveAgingSnapshot } = require('../src/lib/aging/snapshot.ts');
const { getStoredReports } = require('../src/lib/storage/report-storage.ts');
const { agingReducer, agingInitialState } = require('../src/lib/aging-store.ts');
const { AgingReportTable } = require('../src/components/aging/AgingReportTable.tsx');
const { exportToXLSX } = require('../src/lib/report/export.ts');
const XLSX = require('xlsx');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const priorFetch = global.fetch;
let failArchive = false;
let failPublication = false;
global.fetch = async (url, options = {}) => {
  assert.ok(['/api/reports/archive', '/api/reports/aging'].includes(url), `Unexpected/shared endpoint: ${url}`);
  const route = url === '/api/reports/archive' ? archive : published;
  if ((route === archive && failArchive) || (route === published && failPublication)) return new Response(null, { status: 503 });
  return options.method === 'POST'
    ? route.POST(new Request(`http://localhost${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: options.body }))
    : route.GET();
};
const incidents = ['SHARED-IR', 'SECOND-IR'].map(requestId => ({
  requestId, sourceTeam: 'ECS SDS', assignedTeam: 'ECS SDS', category: 'Software',
  routingReason: '', wasReassigned: false, createdTime: new Date(2026, 9, 20, 10),
  requestStatus: 'Open', firstResponseOverdue: false, resolutionOverdue: false,
  rawData: { Technician: 'ECS SDS', Remarks: `Imported ${requestId}` },
}));
const row = (data, id = 'SHARED-IR') => data.remarksTable.rows.find(item => item.requestId === id);
const note = data => row(data).recentUpdate;
const archiveById = async id => (await getStoredReports()).find(item => item.id === id).reportData;
const publishedById = async id => (await (await published.GET()).json()).reports.find(item => item.id === id).reportData;

// Small hook harness invokes the real UI edit/save handlers; network calls still use real route handlers.
function editor(initialData) {
  const originals = Object.fromEntries(['useState', 'useRef', 'useMemo', 'useEffect', 'useCallback', 'useId'].map(key => [key, React[key]]));
  const slots = [];
  let index = 0;
  let data = initialData;
  React.useState = initial => {
    const key = index++;
    if (!(key in slots)) slots[key] = typeof initial === 'function' ? 'remarks' : initial;
    return [slots[key], value => { slots[key] = typeof value === 'function' ? value(slots[key]) : value; }];
  };
  React.useRef = initial => { const key = index++; return slots[key] ??= { current: initial }; };
  React.useId = () => `aging-test-${index++}`;
  React.useMemo = fn => fn();
  React.useCallback = fn => fn;
  React.useEffect = () => {};
  const walk = node => !node || typeof node !== 'object' ? [] : Array.isArray(node)
    ? node.flatMap(walk) : [node, ...walk(node.props?.children)];
  const render = () => {
    index = 0;
    return walk(AgingReportTable({ data, accountName: 'Test Admin', onUpdateRemarksRow(requestId, recentUpdate, responsibleOrDependency, department, lastUpdated, updatedBy, isUnsaved) {
      data = agingReducer({ ...agingInitialState, reportData: data }, { type: 'UPDATE_REMARKS_ROW', requestId, recentUpdate, responsibleOrDependency, department, lastUpdated, updatedBy, isUnsaved }).reportData;
    } }));
  };
  const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
  return {
    change(id, value) { render().find(node => node.type === 'textarea' && node.props['aria-label'] === `Recent update for ${id}`).props.onChange({ target: { value } }); },
    async saveRow(id) {
      const tr = render().find(node => node.type === 'tr' && walk(node).some(item => item.type === 'textarea' && item.props['aria-label'] === `Recent update for ${id}`));
      await walk(tr).find(node => node.type === 'button' && text(node).includes('💾 Save')).props.onClick();
    },
    async saveAll() { await render().find(node => node.type === 'button' && text(node).includes('Save Unsaved')).props.onClick(); },
    currentValue(id) { return render().find(node => node.type === 'textarea' && node.props['aria-label'] === `Recent update for ${id}`).props.value; },
    close() { Object.assign(React, originals); },
  };
}

async function verify() {
  const asOf = new Date(2026, 10, 7, 12);
  const a = await createAgingReport(incidents, 'Same report period', undefined, asOf);
  a.generatedAt = new Date('2026-11-03T04:00:00Z');
  row(a).recentUpdate = 'Original note saved in Report A';
  row(a).lastUpdated = '2026-11-03T04:00:00Z';
  row(a).updatedBy = 'Original author';
  const savedA = await saveAgingSnapshot(a, a.remarksTable, 'Test Admin', incidents, true);
  const original = JSON.stringify(savedA);
  // A legacy/global value must never override either report's saved remarks.
  storage.saveAssignment({ requestId: 'SHARED-IR', department: 'Wrong dept', responsibleOrDependency: 'PSD', recentUpdate: 'POISON GLOBAL NOTE', updatedAt: new Date().toISOString(), updatedBy: 'Other report' });
  const b = await createAgingReport(incidents, a.reportPeriod, undefined, asOf);
  b.generatedAt = new Date('2026-11-07T04:00:00Z');
  assert.notEqual(a.reportId, b.reportId, 'Same period must still create distinct reports');
  assert.equal(note(b), note(savedA));
  assert.equal(row(b).lastUpdated, row(savedA).lastUpdated);
  assert.equal(row(b).updatedBy, 'Original author');
  assert.notEqual(row(b), row(savedA), 'Carry-forward must copy the row');
  await saveAgingSnapshot(b, b.remarksTable, 'Test Admin', incidents, true);
  let ui = editor(b);
  try {
    ui.change('SHARED-IR', 'New note in Report B');
    ui.change('SECOND-IR', 'Another pending note');
    await ui.saveRow('SHARED-IR');
    assert.equal(note(await archiveById(b.reportId)), 'New note in Report B');
    assert.equal(row(await archiveById(b.reportId), 'SECOND-IR').recentUpdate, 'Imported SECOND-IR', 'Saving one row must not commit another draft');
    assert.equal(ui.currentValue('SECOND-IR'), 'Another pending note');
    await ui.saveAll();
    assert.equal(row(await archiveById(b.reportId), 'SECOND-IR').recentUpdate, 'Another pending note');
  } finally { ui.close(); }
  assert.equal(JSON.stringify(await archiveById(a.reportId)), original);
  assert.equal(JSON.stringify(await publishedById(a.reportId)), original);
  assert.equal((await getStoredReports()).filter(item => item.type === 'aging').length, 2);
  assert.equal((await (await published.GET()).json()).reports.length, 2, 'Publication must not replace a different report with the same period');
  assert.equal(note(await publishedById(b.reportId)), note(savedA), 'Row saves must not silently publish a draft');
  const archivedB = await archiveById(b.reportId);
  await saveAgingSnapshot(archivedB, archivedB.remarksTable, 'Test Admin', incidents, true);
  assert.equal(note(await publishedById(b.reportId)), 'New note in Report B');

  // Reopening A may deliberately edit A, without changing B or future carry-forward.
  ui = editor(await archiveById(a.reportId));
  try { ui.change('SHARED-IR', 'Deliberate correction to Report A'); await ui.saveRow('SHARED-IR'); } finally { ui.close(); }
  assert.equal(note(await archiveById(a.reportId)), 'Deliberate correction to Report A');
  assert.equal(note(await archiveById(b.reportId)), 'New note in Report B');
  const c = await createAgingReport(incidents, 'Next report', undefined, asOf);
  assert.equal(note(c), 'New note in Report B', 'Editing an older extract must not replace the newer baseline');
  assert.equal(row(c, 'SECOND-IR').recentUpdate, 'Another pending note');
  const reloadedB = await archiveById(b.reportId);
  row(reloadedB).recentUpdate = '';
  row(reloadedB).isUnsaved = true;
  await saveAgingSnapshot(reloadedB, reloadedB.remarksTable, 'Test Admin', incidents);
  assert.equal(note(await createAgingReport(incidents, 'After clearing', undefined, asOf)), '', 'An intentional blank must not resurrect an older note');

  // Legacy archive/published envelope IDs must be retained when reopened.
  const legacy = JSON.parse(JSON.stringify(savedA)); delete legacy.reportId;
  await require('../src/lib/storage/report-storage.ts').saveReport({ id: 'legacy-existing-id', type: 'aging', title: 'Legacy', period: 'Legacy', reportData: legacy });
  assert.equal((await archiveById('legacy-existing-id')).reportId, 'legacy-existing-id');
  storage.saveServerStoredAgingReport({ id: 'legacy-existing-id', reportData: legacy });
  assert.equal((await publishedById('legacy-existing-id')).reportId, 'legacy-existing-id');

  let workbook;
  const writeFile = XLSX.writeFile;
  XLSX.writeFile = value => { workbook = value; };
  try { exportToXLSX(incidents, await archiveById(a.reportId)); } finally { XLSX.writeFile = writeFile; }
  assert.match(JSON.stringify(XLSX.utils.sheet_to_json(workbook.Sheets['Remarks Table'])), /Deliberate correction to Report A/);
  assert.doesNotMatch(JSON.stringify(workbook), /New note in Report B|POISON GLOBAL NOTE/);
  const publicHTML = renderToStaticMarkup(React.createElement(AgingReportTable, { data: savedA, isPublicView: true }));
  assert.doesNotMatch(publicHTML, /POISON GLOBAL NOTE/);

  failArchive = true;
  await assert.rejects(saveAgingSnapshot(savedA, savedA.remarksTable, 'Test Admin'), /archive is unavailable/);
  failArchive = false;
  failPublication = true;
  await assert.rejects(saveAgingSnapshot(c, c.remarksTable, 'Test Admin', incidents, true), /archived, but publication failed/);
  failPublication = false;
  denied = true;
  assert.equal(archive.GET().status, 401);
  await assert.rejects(saveAgingSnapshot(c, c.remarksTable, 'Test Admin'), /Sign in/);
  console.log('Aging snapshot checks passed: copied notes/metadata, real row/bulk saves, independent same-period reports, reopen/correct, cleared notes, legacy IDs, exports, and save failures.');
}
verify().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  global.fetch = priorFetch;
  if (priorDataDir === undefined) delete process.env.SMAC_DATA_DIR; else process.env.SMAC_DATA_DIR = priorDataDir;
  const resolved = path.resolve(testDir);
  if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Unexpected test cleanup path');
  fs.rmSync(resolved, { recursive: true, force: true });
});
