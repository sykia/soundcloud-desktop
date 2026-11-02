'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const http = require('node:http');
const path = require('node:path');
const { once } = require('node:events');
const { ConnectionManager } = require('../src/main/connection-manager.js');
const { createProxy, isServiceHost, proxyConfig } = require('../src/main/connection-proxy.js');
const { STRATEGIES, strategyArgs, startEngine } = require('../src/main/connection-engine.js');
const { coerceSettings, validateSetting } = require('../shared/settings-schema.js');

function fixture(options = {}) {
  const calls = [];
  let healthy = false;
  const ses = {
    setProxy: async config => calls.push(['proxy', config]),
    closeAllConnections: async () => {}, clearHostResolverCache: async () => calls.push(['dns']),
    fetch: async (url, { signal }) => {
      calls.push(['fetch', url]);
      if (signal.aborted || !healthy) throw new Error('Offline');
      return { status: 200, body: { cancel: async () => {} } };
    }
  };
  const manager = new ConnectionManager({ ses,
    engineFactory: async strategy => { calls.push(['engine', strategy]); return { port: 12345, stop: () => calls.push(['stop']) }; },
    proxyFactory: async () => ({ port: 23456, close() {} }),
    saveStrategy: value => calls.push(['save', value]), random: () => 0, ...options
  });
  function cancelTimer() { clearTimeout(manager.timer); manager.timer = null; }
  return { manager, calls, ses, healthy: () => { healthy = true; }, cancelTimer };
}

test('network recovery rotates strategies, backs off, remembers success and reloads only a failed page', async t => {
  const f = fixture();
  t.after(() => f.manager.stop());
  await f.manager.setMode('auto'); f.cancelTimer();
  f.manager.reportFailure('https://soundcloud.com/discover', { mainFrame: true }); f.cancelTimer();
  await f.manager.recover(); f.cancelTimer();
  assert.equal(f.manager.getStatus().attempt, 1);
  await f.manager.recover(); f.cancelTimer();
  assert.equal(f.manager.getStatus().attempt, 2);
  assert.deepEqual(f.calls.filter(call => call[0] === 'engine').map(call => call[1]), ['adaptive', 'split']);
  let recovery;
  f.manager.on('recovered', value => { recovery = value; });
  f.healthy();
  await f.manager.recover(); f.cancelTimer();
  assert.equal(f.manager.getStatus().state, 'ready');
  assert.equal(f.manager.getStatus().attempt, 0);
  assert.deepEqual(recovery, { reload: true });
  assert.deepEqual(f.calls.find(call => call[0] === 'save'), ['save', 'tls']);
  assert.equal(f.manager.failedUrls.size, 0);
});

test('retrying continues beyond a full profile cycle; stop prevents more work', async () => {
  const f = fixture();
  try {
    await f.manager.setMode('bypass'); f.cancelTimer();
    const attempts = STRATEGIES.length * 2 + 2;
    for (let attempt = 0; attempt < attempts; attempt++) { await f.manager.recover(); f.cancelTimer(); }
    assert.equal(f.manager.attempt, attempts);
    assert.match(f.manager.getStatus().message, /45 с/);
    assert.equal(f.calls.filter(call => call[0] === 'engine').length, attempts);
    f.manager.stop();
    const count = f.calls.length;
    await f.manager.recover();
    f.manager.reportFailure('https://soundcloud.com/');
    assert.equal(f.calls.length, count);
    assert.equal(f.manager.timer, null);
  } finally { f.manager.stop(); }
});

test('direct mode restores system proxy and never starts a bypass process', async t => {
  const f = fixture(); t.after(() => f.manager.stop());
  await f.manager.setMode('direct'); f.cancelTimer();
  assert.deepEqual(f.calls.find(call => call[0] === 'proxy')[1], { mode: 'system' });
  assert.equal(f.calls.some(call => call[0] === 'engine'), false);
  await f.manager.recover(); f.cancelTimer();
  f.healthy(); await f.manager.recover(); f.cancelTimer();
  assert.equal(f.calls.some(call => call[0] === 'engine'), false);
  await assert.rejects(f.manager.setMode('arbitrary'), /режим/);
});

test('HTTP authorization/content errors on media do not trigger route cycling or page reload', async t => {
  const f = fixture(); t.after(() => f.manager.stop());
  f.ses.fetch = async url => ({ status: url === 'https://soundcloud.com/' ? 200 : 403, body: { cancel: async () => {} } });
  await f.manager.setMode('auto'); f.cancelTimer();
  let reloaded = false;
  f.manager.on('recovered', () => { reloaded = true; });
  await f.manager.recover();
  assert.equal(f.manager.getStatus().state, 'ready');
  assert.equal(reloaded, false);
  f.manager.reportFailure('https://cf-hls-media.sndcdn.com/expired-token'); f.cancelTimer();
  await f.manager.recover();
  assert.equal(f.manager.getStatus().state, 'ready');
  assert.equal(f.manager.attempt, 0);
});

test('a blocked public home page is retried and reloaded once it opens', async t => {
  const f = fixture(); t.after(() => f.manager.stop());
  let status = 403;
  f.ses.fetch = async () => ({ status, body: { cancel: async () => {} } });
  await f.manager.setMode('auto'); f.cancelTimer();
  await f.manager.recover(); f.cancelTimer();
  assert.equal(f.manager.getStatus().state, 'retrying');
  assert.equal(f.manager.needsReload, true);
  status = 200;
  let recovery;
  f.manager.on('recovered', event => { recovery = event; });
  await f.manager.recover();
  assert.deepEqual(recovery, { reload: true });
});

test('stopping during engine startup destroys the late child and does not install a proxy', async () => {
  let ready;
  let stopped = false;
  const f = fixture({ engineFactory: () => new Promise(resolve => { ready = resolve; }) });
  const changing = f.manager.setMode('auto');
  await new Promise(resolve => setImmediate(resolve));
  f.manager.stop();
  ready({ port: 123, stop: () => { stopped = true; } });
  await changing;
  assert.equal(stopped, true);
  assert.equal(f.calls.some(call => call[0] === 'proxy'), false);
});

test('asset hosts are constrained to SoundCloud domain boundaries and schema rejects invalid modes', () => {
  assert.equal(isServiceHost('cf-hls-media.sndcdn.com'), true);
  assert.equal(isServiceHost('playback.media-streaming.soundcloud.cloud'), true);
  for (const host of ['evilsoundcloud.com', 'soundcloud.com.evil.com', 'localhost', '127.0.0.1']) assert.equal(isServiceHost(host), false);
  assert.equal(coerceSettings({}).connectionMode, 'auto');
  assert.equal(coerceSettings({ connectionMode: '--command' }).connectionMode, 'auto');
  assert.equal(validateSetting('connectionMode', 'bypass'), true);
  assert.equal(validateSetting('connectionMode', null), false);
  assert.match(proxyConfig(1234).pacScript, /^data:/);
  assert.ok(strategyArgs('adaptive', 'win32').includes('--no-domain'));
});

test('CONNECT resolves with secure resolver, forwards an IPv4 SOCKS request, and passes bytes unchanged', async t => {
  const sockets = new Set();
  let requestAddress;
  const upstream = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
    let stage = 0;
    socket.on('data', data => {
      if (stage === 0) {
        assert.deepEqual([...data], [5, 1, 0]);
        stage = 1;
        socket.write(Buffer.from([5]));
        setImmediate(() => socket.write(Buffer.from([0])));
      } else if (stage === 1) {
        requestAddress = [...data.subarray(4, 8)].join('.');
        assert.equal(data.readUInt16BE(8), 443);
        stage = 2;
        socket.write(Buffer.from([5, 0, 0]));
        setImmediate(() => socket.write(Buffer.from([1, 0, 0, 0, 0, 0, 0])));
      } else socket.write(data);
    });
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  let resolved;
  const proxy = await createProxy({ getEnginePort: () => upstream.address().port,
    resolveHost: async host => { resolved = host; return { endpoints: [{ address: '203.0.113.8' }] }; } });
  t.after(() => { proxy.close(); for (const socket of sockets) socket.destroy(); upstream.close(); });
  const request = http.request({ hostname: '127.0.0.1', port: proxy.port, method: 'CONNECT', path: 'soundcloud.com:443' });
  request.end();
  const [response, tunnel] = await once(request, 'connect');
  assert.equal(response.statusCode, 200);
  assert.equal(resolved, 'soundcloud.com'); assert.equal(requestAddress, '203.0.113.8');
  tunnel.write(Buffer.from('unchanged TLS bytes'));
  const [echo] = await once(tunnel, 'data');
  assert.equal(echo.toString(), 'unchanged TLS bytes'); tunnel.destroy();
  const rejected = http.request({ hostname: '127.0.0.1', port: proxy.port, method: 'CONNECT', path: 'example.org:443' });
  rejected.end();
  const [denied, socket] = await once(rejected, 'connect');
  assert.equal(denied.statusCode, 502); socket.destroy();
});

test('bundled engine starts without elevation and closes its listening socket on stop', { timeout: 10000 }, async t => {
  if (!['win32', 'linux'].includes(process.platform) || process.arch !== 'x64') return t.skip();
  const engine = await startEngine(path.join(__dirname, '../build/byedpi'), 'adaptive', () => {});
  t.after(() => engine.stop());
  const socket = net.connect({ host: '127.0.0.1', port: engine.port });
  await once(socket, 'connect');
  socket.write(Buffer.from([5, 1, 0]));
  const [reply] = await once(socket, 'data');
  assert.deepEqual([...reply], [5, 0]);
  socket.destroy(); engine.stop();
});

test('every shipped profile is accepted by the bundled engine', { timeout: 30000 }, async t => {
  if (!['win32', 'linux'].includes(process.platform) || process.arch !== 'x64') return t.skip();
  for (const strategy of STRATEGIES) {
    const engine = await startEngine(path.join(__dirname, '../build/byedpi'), strategy, () => {});
    try {
      const socket = net.connect({ host: '127.0.0.1', port: engine.port });
      await once(socket, 'connect');
      socket.write(Buffer.from([5, 1, 0]));
      const [reply] = await once(socket, 'data');
      assert.deepEqual([...reply], [5, 0], strategy);
      socket.destroy();
    } finally { engine.stop(); }
  }
});
