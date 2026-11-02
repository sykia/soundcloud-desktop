'use strict';

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const manifest = require('../../shared/byedpi.json');

// Keep the lighter methods first; fake packets and TLS compatibility changes
// are last resorts, reached only after earlier profiles fail.
const STRATEGIES = ['adaptive', 'split', 'tls', 'disorder', 'oob',
  'tls-mid', 'split-mid', 'split-multi', 'disoob', 'fake', 'fake-tls', 'tls-minor'];
function strategyArgs(strategy, platform = process.platform) {
  const retry = ['--auto=torst,ssl_err'];
  const split = ['--split', '1+s', '--disorder', '3+s'];
  const disorder = platform === 'win32' ? split : ['--disorder', '1'];
  const fake = platform === 'win32' ? ['--disorder', '1', '--fake', '-1'] : ['--fake', '-1', '--md5sig'];
  const profiles = {
    adaptive: [...retry, ...disorder, ...retry, '--tlsrec', '1+s', ...retry, '--oob', '3+s'],
    split: [...split, ...retry, '--tlsrec', '1+s', ...retry],
    tls: ['--tlsrec', '1+s', ...retry, ...disorder, ...retry],
    disorder: [...disorder, ...retry, '--split', '2', ...retry],
    oob: ['--oob', '3+s', ...retry, '--tlsrec', '1+s', ...retry],
    'tls-mid': ['--tlsrec', '0+sm', ...retry, '--tlsrec', '3+s', ...retry],
    'split-mid': ['--split', '0+sm', ...retry, '--split', '1+s', ...retry],
    'split-multi': ['--split', '1', '--split', '1+s', '--split', '0+sm', ...retry],
    disoob: ['--disoob', '3+s', ...retry, ...disorder, ...retry],
    fake: [...fake, ...retry, ...disorder, ...retry],
    'fake-tls': [...fake, '--fake-tls-mod', 'rand', '--fake-sni', 'www.microsoft.com',
      ...retry, '--tlsrec', '0+sm', ...retry],
    'tls-minor': ['--tlsminor', '1', '--tlsrec', '1+s', ...retry, '--tlsrec', '0+sm', ...retry]
  };
  if (!profiles[strategy]) throw new Error('Unknown connection strategy');
  return ['--ip', '127.0.0.1', '--no-domain', '--no-udp', '--timeout', '4', ...profiles[strategy]];
}

function binaryPath(root, platform = process.platform, arch = process.arch) {
  const key = `${platform}-${arch}`;
  const entry = manifest.binaries[key];
  if (!entry) throw new Error('Встроенный обход доступен для Windows x64 и Linux x64.');
  const file = path.join(root, key, entry.file);
  if (createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== entry.sha256) {
    throw new Error('Повреждён компонент подключения. Переустановите приложение.');
  }
  if (platform !== 'win32') {
    // AppImage resources are mounted read-only. Packaging sets the executable
    // bit; only repair source checkouts that actually lost it.
    try { fs.accessSync(file, fs.constants.X_OK); }
    catch { fs.chmodSync(file, 0o755); }
  }
  return file;
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function startEngine(root, strategy, onExit) {
  const file = binaryPath(root);
  const port = await reservePort();
  const child = spawn(file, ['--port', String(port), ...strategyArgs(strategy)], {
    windowsHide: true, stdio: 'ignore'
  });
  let stopped = false;
  let failure;
  child.on('error', error => { failure = error; });
  child.once('exit', () => { failure ||= new Error('Компонент подключения остановился.'); if (!stopped) onExit(); });
  const stop = () => { stopped = true; if (child.exitCode === null) child.kill(); };
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      if (failure) throw failure;
      const ready = await new Promise(resolve => {
        const socket = net.connect({ host: '127.0.0.1', port });
        socket.setTimeout(100);
        socket.once('connect', () => { socket.destroy(); resolve(true); });
        socket.once('error', () => { socket.destroy(); resolve(false); });
        socket.once('timeout', () => { socket.destroy(); resolve(false); });
      });
      if (ready) return { port, stop };
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Не удалось запустить компонент подключения.');
  } catch (error) { stop(); throw error; }
}

module.exports = { STRATEGIES, strategyArgs, binaryPath, startEngine };
