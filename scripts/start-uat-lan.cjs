const { readFileSync } = require('node:fs');
const http = require('node:http');
const { BlockList, isIPv4 } = require('node:net');
const path = require('node:path');
const next = require('next');

const [lanAddress, prefix, ...qaVpnArgs] = process.argv.slice(2);
const dataDir = process.env.SMAC_DATA_DIR ?? '';
const loopback = '127.0.0.1';
const lanPort = 3100;
const localPort = 3101;
const vpnRetryMs = 5000;

function isPrivateIPv4(address) {
  return isIPv4(address) && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);
}

if (process.env.SMAC_UAT !== 'true' || !path.isAbsolute(dataDir) || !isPrivateIPv4(lanAddress) ||
    !/^\d{2}$/.test(prefix ?? '') || Number(prefix) < 16 || Number(prefix) > 32) {
  throw new Error('Provide a private LAN IPv4 address, its prefix length, and an isolated UAT data directory.');
}

const vpnConfigPath = path.join(dataDir, 'qa-vpn.json');
let vpnConfig;
try {
  vpnConfig = JSON.parse(readFileSync(vpnConfigPath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (vpnConfig !== undefined &&
    (!isPrivateIPv4(vpnConfig?.host) || vpnConfig.host === lanAddress || !Array.isArray(vpnConfig.peers))) {
  throw new Error('qa-vpn.json must contain a private VPN host IPv4 address and an array of approved tester IPv4 addresses.');
}

const qaVpnAddresses = vpnConfig?.peers ?? qaVpnArgs;
if (!qaVpnAddresses.every(address => isIPv4(address) && address !== '0.0.0.0' &&
    !address.startsWith('127.') && address !== lanAddress && address !== vpnConfig?.host)) {
  throw new Error('Provide approved QA VPN IPv4 addresses.');
}

const lanPeers = new BlockList();
lanPeers.addSubnet(lanAddress, Number(prefix));
for (const address of qaVpnAddresses) lanPeers.addAddress(address);
const app = next({ dev: false, dir: path.join(__dirname, '..'), hostname: loopback, port: localPort });
const handle = app.getRequestHandler();

function listen(address, port, peers) {
  const isVpn = address === vpnConfig?.host;
  const server = http.createServer((request, response) => {
    if (request.headers.host !== `${address}:${port}`) {
      response.writeHead(403).end('Use the displayed UAT address.');
      return;
    }

    // Apply the existing UAT remote-access policy using the actual connection address.
    delete request.headers['x-smac-uat-vpn'];
    if (isVpn || (peers && request.socket.remoteAddress !== lanAddress)) {
      request.headers['x-smac-uat-vpn'] = '1';
    }

    handle(request, response).catch((error) => {
      console.error(error);
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  if (peers) {
    server.on('connection', (socket) => {
      if (!socket.remoteAddress || !peers.check(socket.remoteAddress)) socket.destroy();
    });
  }
  let waitingForVpn = false;
  server.on('error', (error) => {
    if (isVpn && error.code === 'EADDRNOTAVAIL') {
      if (!waitingForVpn) console.log(`Waiting for UAT VPN address ${address}`);
      waitingForVpn = true;
      setTimeout(bind, vpnRetryMs);
      return;
    }
    console.error(error);
    if (!isVpn) process.exit(1);
  });
  server.on('listening', () => {
    waitingForVpn = false;
    console.log(`UAT listening on http://${address}:${port}`);
  });

  function bind() {
    server.listen(port, address);
  }

  bind();
}

app.prepare().then(() => {
  listen(loopback, localPort);
  listen(lanAddress, lanPort, lanPeers);
  if (vpnConfig) {
    const vpnPeers = new BlockList();
    vpnPeers.addAddress(vpnConfig.host);
    for (const address of qaVpnAddresses) vpnPeers.addAddress(address);
    listen(vpnConfig.host, lanPort, vpnPeers);
  }
}).catch((error) => { console.error(error); process.exitCode = 1; });
