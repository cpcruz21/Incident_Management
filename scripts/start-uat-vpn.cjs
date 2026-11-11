const http = require('node:http');
const { isIPv4 } = require('node:net');
const path = require('node:path');
const next = require('next');

const loopback = '127.0.0.1';
const port = 3100;
const [vpnIp, ...qaIps] = process.argv.slice(2);

if (process.env.SMAC_UAT !== 'true' || !path.isAbsolute(process.env.SMAC_DATA_DIR ?? '') ||
    !isIPv4(vpnIp) || vpnIp === '0.0.0.0' || vpnIp.startsWith('127.') ||
    qaIps.length === 0 || !qaIps.every(ip => isIPv4(ip) && ip !== '0.0.0.0' && !ip.startsWith('127.') && ip !== vpnIp)) {
  throw new Error('Set SMAC_UAT=true and an absolute SMAC_DATA_DIR, then provide the host VPN IPv4 address and each approved QA VPN IPv4 address.');
}

const vpnPeers = new Set([vpnIp, ...qaIps]);
const app = next({ dev: false, dir: path.join(__dirname, '..'), hostname: loopback, port });
const handle = app.getRequestHandler();

function listen(ip, viaVpn) {
  const server = http.createServer((request, response) => {
    if (viaVpn && request.headers.host !== ip + ':' + port) {
      response.writeHead(403).end('Use the UAT VPN address.');
      return;
    }
    delete request.headers['x-smac-uat-vpn'];
    if (viaVpn) request.headers['x-smac-uat-vpn'] = '1';
    handle(request, response).catch(error => {
      console.error(error);
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  if (viaVpn) {
    server.on('connection', socket => {
      if (!vpnPeers.has(socket.remoteAddress)) socket.destroy();
    });
  }
  server.on('error', error => { console.error(error); process.exit(1); });
  server.listen(port, ip, () => console.log('UAT listening on http://' + ip + ':' + port));
}

app.prepare().then(() => {
  listen(loopback, false);
  listen(vpnIp, true);
}).catch(error => { console.error(error); process.exitCode = 1; });
