// Contract-derived stand-in. All credentials are intentionally synthetic.
const http = require('node:http');
const assert = require('assert').strict;
let refreshes = 0;
let retried = false;
const calls = {};
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://mock');
  function send(status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }
  try {
    if (url.pathname === '/oauth/v2/token' && req.method === 'POST') {
      let raw = req.body;
      if (raw === undefined) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        raw = Buffer.concat(chunks).toString();
      }
      const body = new URLSearchParams(raw);
      assert.equal(body.get('client_id'), 'test-client');
      assert.equal(body.get('client_secret'), 'test-secret');
      if (body.get('grant_type') === 'client_credentials') {
        assert.equal(body.get('scope'), 'SDPOnDemand.requests.READ');
        assert.equal(body.has('refresh_token'), false);
      } else {
        assert.equal(body.get('grant_type'), 'refresh_token');
        assert.equal(body.get('refresh_token'), 'test-refresh');
      }
      refreshes++;
      return send(200, { access_token: `test-access-${refreshes}`, expires_in: 3600 });
    }
    if (url.pathname === '/app/itdesk/api/v3/requests' && req.method === 'GET') {
      assert.match(req.headers.authorization, /^Zoho-oauthtoken test-access-\d+$/);
      assert.equal(req.headers.accept, 'application/vnd.manageengine.sdp.v3+json');
      const info = JSON.parse(url.searchParams.get('input_data')).list_info;
      assert.equal(info.row_count, 2);
      assert.equal(info.search_criteria.field, 'display_id');
      assert.equal(info.search_criteria.condition, 'is');
      const id = info.search_criteria.value;
      calls[id] = (calls[id] || 0) + 1;
      if (id === '401' && !retried) { retried = true; return send(401, {}); }
      if (id === '429') return send(429, {});
      if (id === '500') { res.writeHead(500, { 'Content-Type': 'text/html' }); return res.end('<h1>upstream secret</h1>'); }
      if (id === '502') return send(200, { response_status: { status_code: 4000 }, requests: [] });
      if (id === '503') { res.writeHead(200); return res.end('not json'); }
      const request = { display_id: id, id: '129915000037909050' };
      const requests = id === '404' ? [] : id === '409' ? [request, request] : id === '410' ? [{ ...request, display_id: '999' }] : id === '411' ? [{ ...request, id: 129915000037909050 }] : [request];
      return send(200, { response_status: [{ status_code: 2000, status: 'success' }], requests, list_info: { has_more_rows: false } });
    }
    if (url.pathname === '/test/stats') return send(200, { refreshes, calls });
    return send(501, { error: 'This stand-in does not model that operation.' });
  } catch (error) {
    return send(400, { error: 'Caller did not match the modeled contract.' });
  }
}).listen(process.env.PORT);
