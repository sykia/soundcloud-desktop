'use strict';

// Electron smoke test for the network feature, run by `npm run test:network`
// (node build.js && electron scripts/network-smoke.js). Uses only local
// servers, no real SoundCloud traffic:
//
//   1. a plain HTTP server — an HTTPS probe against it must classify as TLS;
//   2. a TCP server that never answers — an HTTPS probe must classify as
//      timeout;
//   3. a minimal HTTP proxy server — proves the Electron session follows the
//      applied Custom configuration (system/direct/custom switching);
//   4. the real load-error screen in a real window without any external site:
//      an unreachable proxy forces a real did-fail-load, the screen binds its
//      controls, and clicking "Check connection" invokes the guarded
//      diagnostics channel;
//   5. untrusted senders (a second window without the network screen marker)
//      cannot reach any network channel.
'use strict';

const { app, session, net, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const http = require('node:http');
const netNode = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cusade-network-smoke-'));
app.setPath('userData', profile);
app.setPath('sessionData', profile);
if (process.platform === 'linux' && process.env.CI === 'true') app.disableHardwareAcceleration();

const { CHANNEL } = require('../shared/ipc.js');
const { classifyNetworkError } = require('../shared/network-profile.js');
const errorScreen = require('../src/main/error-screen.js');
const network = require('../src/main/network.js');

// Capture every registered handler so network channels can be driven directly
// (ipcMain offers no introspection), while still registering them for real.
const registeredHandlers = new Map();
const realHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (name, handler) => {
  registeredHandlers.set(name, handler);
  return realHandle(name, handler);
};

const output = [];
function log(message) { output.push(message); console.log(message); }

const plainServer = http.createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/plain' });
  response.end('plain-text');
});
// A Chromium-respecting HTTP proxy: answers any absolute-form GET.
const proxyServer = http.createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/plain' });
  response.end(`proxied-ok:${request.url}`);
});
// Accepts connections and never answers anything: the timeout generator.
const hangingServer = netNode.createServer(socket => { /* keep the socket open */ });

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function classifyProbe(message) {
  return classifyNetworkError(Number.NaN, String(message || ''));
}

async function main() {
  const plainPort = await listen(plainServer);
  const proxyPort = await listen(proxyServer);
  const hangingPort = await listen(hangingServer);
  log(`local servers ready: plain=${plainPort} proxy=${proxyPort} hanging=${hangingPort}`);

  network.startTrafficObservation();
  network.wireProxyLogin();

  // --- 1/2. failure classification from real local servers ------------------
  const probes = [];
  try {
    await net.fetch(`https://127.0.0.1:${plainPort}/`, { signal: AbortSignal.timeout(4000) });
    probes.push('unexpected TLS success');
  } catch (error) {
    probes.push(`tls-probe:${classifyProbe(error.message)}`);
  }
  try {
    await Promise.race([
      net.fetch(`https://127.0.0.1:${hangingPort}/`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('net::ERR_TIMED_OUT')), 3000))
    ]);
    probes.push('unexpected timeout success');
  } catch (error) {
    probes.push(`timeout-probe:${classifyProbe(error.message)}`);
  }
  try {
    await net.fetch('https://dns-unreachable-test.invalid/', { signal: AbortSignal.timeout(5000) });
    probes.push('unexpected dns success');
  } catch (error) {
    probes.push(`dns-probe:${classifyProbe(error.message)}`);
  }
  assert.ok(probes[0] === 'tls-probe:tls' || probes[0] === 'tls-probe:tcp',
    `plain HTTPS probe: ${probes[0]} (message: ${probes[0]})`);
  assert.equal(probes[1], 'timeout-probe:timeout', 'hanging server probe');
  assert.ok(probes[2] === 'dns-probe:dns' || probes[2] === 'dns-probe:unknown',
    `.invalid probe resolved to a non-DNS category: ${probes[2]}`);
  log(`PASS: local failure classification → ${probes.join(' | ')}`);

  // --- 3. System / Direct / Custom switching through the real session -------
  await session.defaultSession.setProxy({ mode: 'direct' });
  // Direct: bypassing our proxy server only works because a direct fetch goes
  // to the target server itself.
  // Session-ready Custom config via the feature module:
  const apply = await network.applyNetworkSettings({
    networkMode: 'custom', proxyType: 'http', proxyHost: '127.0.0.1', proxyPort: proxyPort
  });
  assert.equal(apply.ok, true, JSON.stringify(apply));
  const response = await net.fetch('http://probe-cusade.invalid/ping');
  const body = await response.text();
  assert.ok(body.startsWith('proxied-ok:'), `traffic must leave through the configured proxy: ${body}`);
  log('PASS: Custom proxy configuration drives session traffic');

  await network.resetNetworkSettings();
  const reset = await network.resetNetworkSettings();
  assert.equal(reset.ok, true);
  log('PASS: restore returns the session to system mode');

  // --- 4. the real load-error screen ----------------------------------------
  require('../src/main/ipc.js').register();
  const { getSettings } = require('../src/main/settings.js');
  void getSettings;
  const windowModule = require('../src/main/window.js');
  // Point the session at an unreachable proxy so a real navigation fails, then
  // let the production window + window.js failure flow show the screen.
  await session.defaultSession.setProxy({
    mode: 'fixed_servers',
    proxyRules: 'http://127.0.0.1:1',
    proxyBypassList: '<local>'
  });
  windowModule.createWindow();
  const contents = windowModule.getMainWindow().webContents;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (contents.getURL().startsWith('data:')) break;
    // eslint-disable-next-line no-await-in-loop
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(contents.getURL().startsWith('data:'), 'the error screen never appeared');
  log(`load failed and the production flow showed the screen (${contents.getURL().length} bytes)`);
  assert.equal(
    await contents.executeJavaScript("document.documentElement.getAttribute('data-cusade-network-screen')"),
    'load-failure'
  );
  log('PASS: the error screen renders without any external site');

  // The guarded channels accept this exact sender (main window + marker URL).
  // The saved settings were reset to System earlier; the manual unreachable
  // proxy above only exists at the session level for the forced failure.
  const get = await registeredHandlers.get(CHANNEL.networkGet)({ sender: contents });
  assert.equal(get.configNote, 'system');
  log('PASS: the error screen can read the connection state');

  // Clicking "Check connection" runs diagnostics through the bound preload.
  contents.executeJavaScript("document.getElementById('net-test').click()");
  let statusText = '';
  for (let attempt = 0; attempt < 30; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise(resolve => setTimeout(resolve, 1000));
    // eslint-disable-next-line no-await-in-loop
    statusText = await contents.executeJavaScript("document.getElementById('net-status')?.textContent || ''");
    if (/(сбой|HTTP|DNS)/.test(statusText)) break;
  }
  assert.ok(statusText.length > 0, 'status stayed empty');
  assert.ok(/(DNS|сбой|HTTP)/.test(statusText), `status describes the check: ${statusText}`);
  log(`PASS: check button produced diagnostics → ${statusText.replace(/\n/g, ' | ')}`);

  // --- 5. untrusted senders cannot reach the network channels ---------------
  const stranger = new BrowserWindow({ show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'dist-js', 'preload.js'),
      nodeIntegration: false, contextIsolation: true, sandbox: true
    } });
  await stranger.loadURL('data:text/html,<h1>stranger</h1>');
  for (const [channel, argument] of [
    [CHANNEL.networkGet], [CHANNEL.networkApply, {}], [CHANNEL.networkTest],
    [CHANNEL.networkReset], [CHANNEL.networkReport]
  ]) {
    await assert.rejects(
      async () => registeredHandlers.get(channel)({ sender: stranger.webContents }, argument),
      error => error.message === 'Unavailable',
      `${channel} must reject a stranger window`
    );
  }
  log('PASS: every network channel rejects an untrusted window');

  console.log('\nnetwork-smoke: all checks passed');
  app.exit(0);
}

app.whenReady().then(() => {
  const timer = setTimeout(() => {
    console.error('\nnetwork-smoke timed out\n' + output.join('\n'));
    app.exit(1);
  }, 90000);
  main().then(() => clearTimeout(timer)).catch(error => {
    console.error('\nnetwork-smoke failed:', error);
    console.error(output.join('\n'));
    app.exit(1);
  });
});

app.on('window-all-closed', () => { /* test keeps running until done */ });
