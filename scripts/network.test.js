'use strict';

// Unit tests for the network connection feature, run by `npm test`:
//
//   - saving and loading the network settings (schema + settings.json);
//   - rejection of bad proxy addresses and ports everywhere they enter;
//   - the three standard modes System / Direct / Custom and the exact Electron
//     proxy configs they produce;
//   - classification of DNS / TCP / TLS / timeout / proxy failures;
//   - rollback to the previous configuration after a failed apply;
//   - the report and counters never contain sensitive data;
//   - the network IPC handlers reject every untrusted sender;
//   - the local error screen marker can only match main-process generated URLs.
//
// Electron is mocked — no Electron instance, no real network. The real Session
// behaviour (setProxy/resolveHost/net.fetch against local servers) is exercised
// separately by scripts/network-smoke.js.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const test = require('node:test');

// ---------------------------------------------------------------------------
// Electron mock
// ---------------------------------------------------------------------------

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'cusade-network-test-'));
const proxyCalls = [];
const webRequestHandlers = {};
const mainIpcHandlers = new Map();
let setProxyBehaviour = null; // optional per-test specialised mock
let resolveHostBehaviour = null;

const electronMock = {
  app: {
    getPath: name => name === 'userData' ? userData : path.join(userData, name),
    getVersion: () => '0.0.0-test',
    on: () => {}
  },
  BrowserWindow: function MockWindow() {},
  session: {
    defaultSession: {
      webRequest: {
        onErrorOccurred: (_filter, callback) => { webRequestHandlers.onErrorOccurred = callback; },
        onCompleted: (_filter, callback) => { webRequestHandlers.onCompleted = callback; },
        onSendHeaders: () => {},
        onBeforeSendHeaders: () => {}
      },
      setProxy: async config => {
        proxyCalls.push(config);
        if (setProxyBehaviour) await setProxyBehaviour(config);
      },
      resolveHost: async () => {
        if (resolveHostBehaviour) return resolveHostBehaviour();
        return { addresses: [{ value: '192.168.0.1' }], error: null };
      },
      closeAllConnections: () => {}
    }
  },
  net: { fetch: async () => { throw new Error('net::ERR_NETWORK_CHANGED'); } },
  dialog: { showSaveDialog: async () => ({ canceled: true }) },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(`ENCRYPTED:${value}`, 'utf8'),
    decryptString: buffer => {
      const text = buffer.toString('utf8');
      return text.startsWith('ENCRYPTED:') ? text.slice('ENCRYPTED:'.length) : text;
    }
  },
  ipcMain: {
    handle: (name, handler) => mainIpcHandlers.set(name, handler),
    on: (name, handler) => mainIpcHandlers.set(name, handler),
    removeHandler: name => mainIpcHandlers.delete(name)
  },
  shell: {}, Menu: {}, Notification: {}, nativeImage: {}, clipboard: {},
  ClipboardItem: function MockClipboardItem() {}
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return electronMock;
  return originalLoad.call(this, request, parent, isMain);
};
const network = require('../src/main/network.js');
const { CHANNEL } = require('../shared/ipc.js');
const {
  buildProxyConfig,
  isProxyHost,
  isProxyPort,
  isCustomProxyComplete,
  classifyNetworkError,
  classifyHostCategory,
  classifyHttpStatus,
  FAILURE_MESSAGES
} = require('../shared/network-profile.js');
const { coerceSettings, defaultSettings, validateSetting } = require('../shared/settings-schema.js');
const ipc = require('../src/main/ipc.js');
const errorScreen = require('../src/main/error-screen.js');
Module._load = originalLoad;

const settingsPath = path.join(userData, 'settings.json');
function resetState(settings = {}) {
  proxyCalls.length = 0;
  setProxyBehaviour = null;
  resolveHostBehaviour = null;
  network.resetObservationState();
  fs.writeFileSync(settingsPath, JSON.stringify(coerceSettings(settings), null, 2));
  // eslint-disable-next-line global-require
  const settingsModule = require('../src/main/settings.js');
  settingsModule.loadSettings();
  return settingsModule.getSettings();
}

test.after(() => {
  fs.rmSync(userData, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. Saving and loading the network settings
// ---------------------------------------------------------------------------

test('network settings round-trip through settings.json', async () => {
  resetState({
    networkMode: 'custom', proxyType: 'socks5', proxyHost: 'gw.corp.local', proxyPort: 1080
  });
  const result = await network.applyNetworkSettings({
    networkMode: 'custom', proxyType: 'http', proxyHost: 'proxy.example.com', proxyPort: 8080
  });
  assert.equal(result.ok, true);
  const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert.deepEqual(
    { networkMode: saved.networkMode, proxyType: saved.proxyType, proxyHost: saved.proxyHost, proxyPort: saved.proxyPort },
    { networkMode: 'custom', proxyType: 'http', proxyHost: 'proxy.example.com', proxyPort: 8080 }
  );
  // Loading untrusted values from disk yields exactly the saved configuration…
  const reloaded = coerceSettings(JSON.parse(fs.readFileSync(settingsPath, 'utf8')));
  assert.equal(reloaded.proxyHost, 'proxy.example.com');
  assert.equal(reloaded.proxyPort, 8080);
  assert.deepEqual(network.getNetworkSnapshot().counters, {});
});

test('unknown keys in saved settings fall back to the defaults', () => {
  const loaded = coerceSettings({
    networkMode: 'teleport', proxyType: 'quic', proxyHost: 'http://evil', proxyPort: 0, proxyCredentials: '<plaintext>'
  });
  assert.deepEqual(
    { networkMode: loaded.networkMode, proxyType: loaded.proxyType, proxyHost: loaded.proxyHost, proxyPort: loaded.proxyPort },
    { networkMode: 'system', proxyType: 'https', proxyHost: '', proxyPort: 0 }
  );
  assert.equal(loaded.proxyCredentials, '');
});

// ---------------------------------------------------------------------------
// 2. Bad addresses and ports
// ---------------------------------------------------------------------------

test('proxy host validation', () => {
  for (const good of ['proxy.example.com', '10.0.0.2', 'gw', 'localhost', 'gw.corp.local', '[fd00::1]']) {
    assert.equal(isProxyHost(good), true, `accepts ${good}`);
  }
  for (const bad of ['', '.', 'http://proxy', 'proxy:8080', 'user@proxy', 'proxy/path',
    'proxy host', 'proxy%20.local', '10.0.0.256', '-proxy', '[fd00::1',
    'x'.repeat(254), 42, undefined]) {
    assert.equal(isProxyHost(bad), false, `rejects ${String(bad)}`);
  }
});

test('proxy port validation', () => {
  for (const good of [1, 8080, 65535]) assert.equal(isProxyPort(good), true);
  for (const bad of [0, -1, 65536, 1.5, '8080', NaN, null]) assert.equal(isProxyPort(bad), false);
});

test('a complete Custom profile is required before building proxy rules', () => {
  assert.equal(isCustomProxyComplete({ proxyType: 'http', proxyHost: 'p.example', proxyPort: 3128 }), true);
  assert.equal(isCustomProxyComplete({ proxyType: 'http', proxyHost: '', proxyPort: 3128 }), false);
  assert.equal(isCustomProxyComplete({ proxyType: 'http', proxyHost: 'p.example', proxyPort: 0 }), false);
  assert.equal(isCustomProxyComplete({ proxyType: 'weird', proxyHost: 'p.example', proxyPort: 3128 }), false);
  assert.deepEqual(buildProxyConfig({ networkMode: 'custom', proxyType: 'http', proxyHost: '', proxyPort: 3128 }), null);
  assert.deepEqual(buildProxyConfig({ networkMode: 'custom', proxyType: 'http', proxyHost: 'p.example', proxyPort: 0 }), null);
  assert.deepEqual(buildProxyConfig({ networkMode: 'custom' }), null);
  assert.equal(buildProxyConfig({ networkMode: 'banana' }), null);
  assert.equal(validateSetting('networkMode', 'teleport'), false);
});

// ---------------------------------------------------------------------------
// 3. Switching System / Direct / Custom
// ---------------------------------------------------------------------------

test('System / Direct / Custom produce their exact proxy configs, in order', async () => {
  resetState();
  assert.equal((await network.applyNetworkSettings({ networkMode: 'system' })).ok, true);
  assert.equal((await network.applyNetworkSettings({ networkMode: 'direct' })).ok, true);
  assert.equal((await network.applyNetworkSettings({
    networkMode: 'custom', proxyType: 'socks5', proxyHost: 'gw.corp.local', proxyPort: 1080
  })).ok, true);
  assert.deepEqual(proxyCalls, [
    { mode: 'system' },
    { mode: 'direct' },
    {
      mode: 'fixed_servers',
      proxyRules: 'socks5://gw.corp.local:1080',
      proxyBypassList: '<local>'
    }
  ]);
  // Each mode is exposed to the renderer as a snapshot.
  const snapshot = network.getNetworkSnapshot();
  assert.deepEqual(
    { networkMode: snapshot.networkMode, proxyType: snapshot.proxyType, proxyHost: snapshot.proxyHost, proxyPort: snapshot.proxyPort },
    { networkMode: 'custom', proxyType: 'socks5', proxyHost: 'gw.corp.local', proxyPort: 1080 }
  );
});

test('an incompletely saved Custom profile falls back to System with a note', async () => {
  // Bypass coercion: write the raw incomplete combination as an old settings
  // file could contain it.
  proxyCalls.length = 0;
  fs.writeFileSync(settingsPath, JSON.stringify({
    networkMode: 'custom', proxyType: 'http', proxyHost: '', proxyPort: 0
  }));
  const settingsModule = require('../src/main/settings.js');
  settingsModule.loadSettings();
  const ses = { setProxy: async config => proxyCalls.push(config) };
  await network.applyStartupNetwork(ses);
  assert.deepEqual(proxyCalls, [{ mode: 'system' }]);
  assert.equal(network.getNetworkSnapshot().configNote, 'invalid');
});

// ---------------------------------------------------------------------------
// 4. Failure classification: DNS, TCP, TLS, timeouts, proxies and web answers
// ---------------------------------------------------------------------------

test('Chromium error codes and names classify into the right categories', () => {
  assert.deepEqual(
    [-105, -137, -139, -140, -141, -142, -800, -801, -802, -803, -808]
      .map(code => classifyNetworkError(code, '')),
    ['dns', 'dns', 'dns', 'dns', 'dns', 'dns', 'dns', 'dns', 'dns', 'dns', 'dns']
  );
  assert.equal(classifyNetworkError(-102, 'ERR_CONNECTION_REFUSED'), 'tcp');
  assert.equal(classifyNetworkError(-109, 'ERR_ADDRESS_UNREACHABLE'), 'tcp');
  assert.equal(classifyNetworkError(Number.NaN, 'ERR_TUNNEL_CONNECTION_FAILED'), 'proxy');
  assert.equal(classifyNetworkError(Number.NaN, 'ERR_PROXY_CONNECTION_FAILED'), 'proxy');
  assert.equal(classifyNetworkError(-202, 'ERR_CERT_DATE_INVALID'), 'tls');
  assert.equal(classifyNetworkError(Number.NaN, 'net::ERR_SSL_PROTOCOL_ERROR'), 'tls');
  assert.equal(classifyNetworkError(-7, 'ERR_TIMED_OUT'), 'timeout');
  assert.equal(classifyNetworkError(-118, 'ERR_CONNECTION_TIMED_OUT'), 'timeout');
  // Probe timeouts generated by withTimeout use the net::ERR_…_TIMED_OUT shape
  // (observed on a real network hanging before ERR_CONNECTION_RESET).
  assert.equal(classifyNetworkError(Number.NaN, 'net::ERR_NETWORK_TIMED_OUT'), 'timeout');
  // A DNS probe timeout contains 'DNS', so it reports as a DNS failure -
  // the failing step matters more there than the timing out transport.
  assert.equal(classifyNetworkError(Number.NaN, 'net::ERR_DNS_TIMED_OUT'), 'dns');
  assert.equal(classifyNetworkError(Number.NaN, 'ERR_SOMETHING_ELSE'), 'unknown');
});

test('DNS / TCP / TLS / timeout / proxy diagnostics probes carry the classification', async () => {
  resetState();
  resolveHostBehaviour = null;
  const cases = [
    ['net::ERR_NAME_NOT_RESOLVED', 'html', 'dns'],
    ['net::ERR_CONNECTION_REFUSED', 'html', 'tcp'],
    ['net::ERR_SSL_PROTOCOL_ERROR', 'api', 'tls'],
    ['net::ERR_CONNECTION_TIMED_OUT', 'html', 'timeout'],
    ['net::ERR_TUNNEL_CONNECTION_FAILED', 'api', 'proxy']
  ];
  for (const [message, stepName, expected] of cases) {
    electronMock.net.fetch = async () => { throw new Error(message) };
    // eslint-disable-next-line no-await-in-loop
    const diagnostics = await network.runDiagnostics();
    const found = diagnostics.steps.find(step => step.name === stepName);
    assert.equal(found.status, 'fail', message);
    assert.equal(found.type, expected, message);
    assert.equal(found.detail, message.replace('net::', ''), message);
  }
});

test('a DNS probe failure is reported through the diagnostics steps', async () => {
  resetState();
  resolveHostBehaviour = async () => ({ addresses: [], error: -105 });
  electronMock.net.fetch = async () => { throw new Error('net::ERR_CONNECTION_REFUSED'); };
  const diagnostics = await network.runDiagnostics();
  assert.equal(diagnostics.steps[0].name, 'dns');
  assert.equal(diagnostics.steps[0].status, 'fail');
  assert.equal(diagnostics.steps[0].type, 'dns');
});

test('HTTP 401/403 are marked restricted, never provider blocks', () => {
  assert.equal(classifyHttpStatus(200), 'ok');
  assert.equal(classifyHttpStatus(403), 'restricted');
  assert.equal(classifyHttpStatus(401), 'restricted');
  assert.equal(classifyHttpStatus(500), 'server');
});

test('every failure category has an explicit message in both languages', () => {
  for (const category of ['dns', 'tcp', 'tls', 'timeout', 'proxy', 'unknown']) {
    assert.ok(FAILURE_MESSAGES[category].ru.length > 10, category);
    assert.ok(FAILURE_MESSAGES[category].en.length > 10, category);
  }
});

test('host families separate html, api and media traffic', () => {
  assert.equal(classifyHostCategory('https://soundcloud.com/?utm=x'), 'html');
  assert.equal(classifyHostCategory('https://api-v2.soundcloud.com/resolve?url=x'), 'api');
  assert.equal(classifyHostCategory('https://cf-media.sndcdn.com/p.mp3'), 'media');
  assert.equal(classifyHostCategory('https://i1.sndcdn.com/artwork.jpg'), 'media');
  assert.equal(classifyHostCategory('https://evil.example/run.php'), 'other');
  assert.equal(classifyHostCategory('not a url'), 'other');
});

// ---------------------------------------------------------------------------
// 5. Apply rollback
// ---------------------------------------------------------------------------

test('a failed apply restores the previous configuration and settings', async () => {
  const settingsModule = require('../src/main/settings.js');
  resetState();
  settingsModule.saveSettings({
    ...settingsModule.getSettings(),
    networkMode: 'custom', proxyType: 'http', proxyHost: 'old.example.com', proxyPort: 3128
  });
  proxyCalls.length = 0;
  setProxyBehaviour = async config => {
    if (config.mode === 'system') throw new Error('net-err');
  };
  const result = await network.applyNetworkSettings({ networkMode: 'system' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'apply-failed');
  // The target attempt and the restored previous configuration.
  assert.deepEqual(proxyCalls, [{ mode: 'system' }, { mode: 'fixed_servers', proxyRules: 'http://old.example.com:3128', proxyBypassList: '<local>' }]);
  const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert.equal(saved.networkMode, 'custom');
  assert.equal(saved.proxyHost, 'old.example.com');
  assert.ok(network.getNetworkSnapshot().applyError);
  void settingsModule;
});

test('an invalid patch is rejected before any change is applied', async () => {
  const settings = resetState({ networkMode: 'direct' });
  proxyCalls.length = 0;
  for (const patch of [
    { networkMode: 'custom', proxyType: 'http', proxyHost: 'proxy.example.com', proxyPort: 'eighty' },
    { networkMode: 'custom' },
    { proxyPort: -5 },
    { proxyHost: 'http://x' }
  ]) {
    const result = await network.applyNetworkSettings(patch);
    assert.equal(result.ok, false, JSON.stringify(patch));
    assert.match(result.error, /^invalid-/);
  }
  assert.equal(proxyCalls.length, 0);
  const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert.equal(saved.networkMode, 'direct');
  // And getSettings still reflects only the loaded state.
  assert.equal(settings.networkMode, 'direct');
});

test('reset returns to System and clears stored credentials', async () => {
  resetState({ networkMode: 'custom', proxyType: 'http', proxyHost: 'p.example.com', proxyPort: 8080 });
  const stored = await network.storeProxyCredentials('alice', 'SECRET-PW');
  assert.equal(stored.stored, true);
  proxyCalls.length = 0;
  const result = await network.resetNetworkSettings();
  assert.equal(result.ok, true);
  const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert.equal(saved.networkMode, 'system');
  assert.equal(saved.proxyCredentials, '');
  assert.equal(network.getNetworkSnapshot().hasProxyCredentials, false);
  assert.equal(fs.readFileSync(settingsPath, 'utf8').includes('SECRET-PW'), false);
});

test('proxy credentials are stored encrypted, never plaintext', async () => {
  resetState();
  const stored = await network.storeProxyCredentials('bob', 's3cret-PW!');
  assert.equal(stored.stored, true);
  assert.equal(stored.encryptionAvailable, true);
  const raw = fs.readFileSync(settingsPath, 'utf8');
  assert.equal(raw.includes('s3cret-PW!'), false);
  assert.equal(raw.includes('"bob"'), false);
  const saved = JSON.parse(raw);
  assert.match(saved.proxyCredentials, /^[A-Za-z0-9+/]+={0,2}$/);
  await network.storeProxyCredentials('', '');
  assert.equal(JSON.parse(fs.readFileSync(settingsPath, 'utf8')).proxyCredentials, '');
});

// ---------------------------------------------------------------------------
// 6. No sensitive data in counters, snapshots and reports
// ---------------------------------------------------------------------------

test('traffic events only keep families and categories, never URLs', () => {
  resetState();
  network.startTrafficObservation();
  webRequestHandlers.onErrorOccurred({
    url: 'https://soundcloud.com/track?client_id=SECRETTOKEN123&api_token=zzz',
    error: 'ERR_CONNECTION_RESET',
    webContentsId: 1
  });
  webRequestHandlers.onCompleted({
    url: 'https://cf-media.sndcdn.com/audio?Authorization=Basic%20abc',
    statusCode: 200,
    fromCache: false
  });
  const report = JSON.stringify(network.buildReport());
  assert.equal(report.includes('SECRETTOKEN123'), false);
  assert.equal(report.includes('client_id'), false);
  assert.equal(report.includes('Authorization'), false);
  assert.equal(report.includes('https://'), false);
  assert.equal(report.includes('?'), false);
  assert.ok(report.includes('"family":"html"'));
  assert.ok(report.includes('"family":"media"'));
  assert.ok(report.includes('"type":"tcp"'));
  // Unrelated hosts are not recorded at all.
  webRequestHandlers.onErrorOccurred({
    url: 'https://evil.example/steal?token=SHOULD_NOT_LEAK', error: 'ERR_NAME_NOT_RESOLVED'
  });
  assert.equal(JSON.stringify(network.buildReport()).includes('SHOULD_NOT_LEAK'), false);
  assert.equal(JSON.stringify(network.buildReport()).includes('evil'), false);
});

test('page load records only the category plus error type', () => {
  network.recordPageLoad(false, -105, 'soundcloud.com?client_id=SECRETTOKEN123');
  const report = network.buildReport();
  assert.equal(report.pageLoad.ok, false);
  assert.equal(report.pageLoad.type, 'dns');
  assert.equal(JSON.stringify(report).includes('SECRETTOKEN123'), false);
  network.recordPageLoad(true, 0, '');
  assert.equal(network.buildReport().pageLoad.ok, true);
});

// ---------------------------------------------------------------------------
// 7. Untrusted IPC cannot change the network settings
// ---------------------------------------------------------------------------

ipc.register();

function fakeEvent(senderUrl) {
  return { sender: { getURL: () => senderUrl, send: () => {} } };
}

test('network channels reject senders that are not the main window', async () => {
  resetState();
  // No main window exists in this test at all, so any sender fails the guard.
  for (const [channel, argument] of [
    [CHANNEL.networkGet],
    [CHANNEL.networkApply, {}],
    [CHANNEL.networkTest],
    [CHANNEL.networkReset],
    [CHANNEL.networkReport]
  ]) {
    const handler = mainIpcHandlers.get(channel);
    assert.ok(handler, channel);
    await assert.rejects(async () => handler(fakeEvent('https://soundcloud.com/'), argument), {
      message: 'Unavailable'
    });
  }
});

test('each network channel registers a guarded handler only once', () => {
  const expected = new Set([
    CHANNEL.networkGet, CHANNEL.networkApply, CHANNEL.networkTest, CHANNEL.networkReset, CHANNEL.networkReport
  ]);
  for (const channel of expected) {
    assert.ok(mainIpcHandlers.get(channel), `${channel} registered`);
  }
});

// ---------------------------------------------------------------------------
// 8. The local error screen marker
// ---------------------------------------------------------------------------

test('the error screen guard only accepts main-process generated URLs', () => {
  const good = errorScreen.buildLoadErrorUrl(-105, 'ERR_NAME_NOT_RESOLVED', 'ru');
  assert.equal(errorScreen.isNetworkScreenUrl(good), true);
  assert.equal(errorScreen.isNetworkScreenUrl('https://soundcloud.com/'), false);
  assert.equal(errorScreen.isNetworkScreenUrl('data:text/html;base64,aGVsbG8='), false);
  assert.equal(errorScreen.isNetworkScreenUrl('data:text/html,<div>faking the marker</div>'), false);
  assert.equal(errorScreen.isNetworkScreenUrl(''), false);
  const screen = decodeURIComponent(good);
  assert.ok(screen.includes('data-cusade-network-screen="load-failure"'));
  assert.ok(screen.includes('Проверить соединение'));
});

test('the error screen shows the classification of the actual failure', () => {
  const screen = decodeURIComponent(errorScreen.buildLoadErrorUrl(-105, 'ERR_NAME_NOT_RESOLVED', 'ru'));
  assert.ok(screen.includes('Не удалось определить адрес SoundCloud'));
  const tlsScreen = decodeURIComponent(errorScreen.buildLoadErrorUrl(-202, 'ERR_CERT_DATE_INVALID', 'en'));
  assert.ok(tlsScreen.includes('encrypted (TLS) connection'));
  const timeoutScreen = decodeURIComponent(errorScreen.buildLoadErrorUrl(-7, 'Timed out', 'ru'));
  assert.ok(timeoutScreen.includes('Превышено время ожидания'));
});

test('report export writes an anonymised JSON report', async () => {
  resetState({ networkMode: 'custom', proxyType: 'http', proxyHost: 'p.example.com', proxyPort: 8080 });
  const dialogPath = path.join(userData, 'report.json');
  electronMock.dialog.showSaveDialog = async () => ({ canceled: false, filePath: dialogPath });
  const result = await network.exportReport(null);
  assert.equal(result.saved, true);
  const report = JSON.parse(fs.readFileSync(dialogPath, 'utf8'));
  assert.equal(report.network.mode, 'custom');
  assert.equal(report.network.proxyHost, 'p.example.com');
  assert.equal(report.network.proxyCredentialsStored, false);
  assert.equal(JSON.stringify(report).includes('SECRET'), false);
});
