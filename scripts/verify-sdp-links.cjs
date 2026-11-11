// Run under the Postman simulation proxy; real credentials are never loaded.
require('./register-typescript.cjs');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const http = require('node:http');

if (!process.env.HTTPS_PROXY) throw new Error('Run this script with the documented Postman simulation command.');
process.env.SDP_BASE_URL = 'https://equicom.sdpondemand.manageengine.com';
process.env.SDP_PORTAL = 'itdesk';
process.env.SDP_ACCOUNTS_URL = 'https://accounts.zoho.com';
process.env.SDP_CLIENT_ID = 'test-client';
process.env.SDP_CLIENT_SECRET = 'test-secret';
if (process.env.SDP_OAUTH_GRANT_TYPE === 'client_credentials') delete process.env.SDP_REFRESH_TOKEN;
else process.env.SDP_REFRESH_TOKEN = 'test-refresh';

const { sdpDisplayId } = require('../src/lib/sdp/request-id.ts');
const { RequestIdLink } = require('../src/components/report/RequestIdLink.tsx');
const { GET } = require('../src/app/api/sdp/requests/[requestId]/route.ts');

async function main() {
  assert.equal(sdpDisplayId(' ir-53184 '), '53184');
  assert.equal(sdpDisplayId('53184'), '53184');
  for (const value of ['', 'IR-0', 'IR-53184/details', 'javascript:alert(1)', 'IR-1&value=2', 'IR-1e4', 'IR-1.5']) assert.equal(sdpDisplayId(value), null);
  const html = renderToStaticMarkup(React.createElement(RequestIdLink, { requestId: 'IR-53184' }));
  assert.match(html, /href="\/api\/sdp\/requests\/IR-53184"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /noopener noreferrer/);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(RequestIdLink, { requestId: 'bad/id' })), /<a/);

  // Serve the actual Next route over HTTP, without replacing its resolver/fetch.
  const server = http.createServer(async (req, res) => {
    const id = decodeURIComponent(req.url.slice(1));
    const result = await GET(new Request(`http://localhost${req.url}`), { params: { requestId: id } });
    res.writeHead(result.status, Object.fromEntries(result.headers));
    res.end(Buffer.from(await result.arrayBuffer()));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const check = async (id, status) => {
    const response = await fetch(`${origin}/${encodeURIComponent(id)}`, { redirect: 'manual' });
    assert.equal(response.status, status, `${id}: unexpected status`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const text = await response.text();
    assert.doesNotMatch(text, /test-secret|test-refresh|test-access|upstream secret/);
    return response;
  };
  try {
    await check('bad/id', 400);
    delete process.env.SDP_CLIENT_SECRET;
    await check('IR-53184', 503);
    process.env.SDP_CLIENT_SECRET = 'test-secret';
    const [one, two] = await Promise.all([check('IR-53184', 303), check('IR-53185', 303)]);
    const target = 'https://equicom.sdpondemand.manageengine.com/app/itdesk/ui/requests/129915000037909050/details';
    assert.equal(one.headers.get('location'), target);
    assert.equal(two.headers.get('location'), target);
    await check('IR-53184', 303); // cache hit
    await check('IR-401', 303); // expired/revoked access token -> refresh and retry once
    for (const [id, status] of [['404', 404], ['409', 502], ['410', 404], ['411', 502], ['429', 503], ['500', 502], ['502', 502], ['503', 502]]) await check(`IR-${id}`, status);
    const stats = await (await fetch('https://equicom.sdpondemand.manageengine.com/test/stats')).json();
    assert.equal(stats.refreshes, 2, 'concurrent requests should share one refresh; 401 triggers the second');
    assert.equal(stats.calls['53184'], 1, 'successful mapping should be cached');
    assert.equal(stats.calls['401'], 2, '401 should be retried exactly once');
    console.log('SDP links verified: exact redirect and string ID precision, concurrency, cache, 401 refresh, missing config, invalid/not-found/ambiguous IDs, malformed JSON, API errors, and no credential leakage.');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
