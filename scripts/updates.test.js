'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

function harness({ platform = 'win32', packaged = true } = {}) {
  const updater = new EventEmitter();
  let downloads = 0;
  const installs = [];
  updater.checkForUpdates = async () => updater.emit('update-available', { version: '0.5.6' });
  updater.downloadUpdate = async () => { downloads++; updater.emit('update-downloaded'); };
  updater.quitAndInstall = (...args) => installs.push(args);
  const module = { exports: {} };
  const mockWindow = { sendToRenderer() {}, showMainWindow() {}, getMainWindow: () => null };
  const app = { isPackaged: packaged, getVersion: () => '0.5.5', getPath: () => '.', relaunch() {}, quit() {} };
  const mocks = {
    electron: { app, Notification: { isSupported: () => false } },
    'electron-updater': { autoUpdater: updater },
    './window.js': mockWindow,
    './linux-package-install.js': { installLinuxPackage: async () => {} },
    './nix-updates.js': { isNixInstallation: () => false },
    '../../shared/ipc.js': require('../shared/ipc.js')
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/main/updates.js'), 'utf8'), {
    module, require: key => mocks[key] || require(key),
    process: { platform, env: {}, resourcesPath: '.' }, console: { error() {} },
    setImmediate, setTimeout: () => 1, setInterval: () => 2, clearTimeout() {}, clearInterval() {}
  });
  const api = module.exports;
  api.setupUpdates();
  return { api, updater, installs, downloads: () => downloads };
}
const turn = () => new Promise(resolve => setImmediate(resolve));

test('Windows downloads automatically, but installs only on explicit action', async () => {
  const h = harness();
  await h.api.checkForUpdates();
  await turn();
  assert.equal(h.downloads(), 1);
  assert.equal(h.api.updateState().status, 'ready');
  assert.equal(h.updater.autoInstallOnAppQuit, false);
  assert.equal(h.updater.disableDifferentialDownload, false);
  assert.equal(h.updater.allowDowngrade, false);
  assert.equal(h.updater.disableWebInstaller, true);
  assert.equal(h.installs.length, 0);
  await h.api.runUpdateAction();
  await turn();
  assert.deepEqual(h.installs, [[true, true]]);
});

test('no version and network failure remain visible and can be retried', async () => {
  const h = harness();
  h.updater.checkForUpdates = async () => { throw Error('offline'); };
  await h.api.checkForUpdates(true);
  assert.equal(h.api.updateState().status, 'error');
  assert.ok(h.api.updateState().error);
  h.updater.checkForUpdates = async () => h.updater.emit('update-not-available');
  await h.api.checkForUpdates(true);
  assert.equal(h.api.updateState().status, 'current');
  assert.equal(h.api.updateState().error, '');
});

test('a failed download can retry without installing or duplicate downloads', async () => {
  const h = harness();
  h.updater.downloadUpdate = async () => { throw Error('checksum mismatch'); };
  await h.api.checkForUpdates();
  await turn();
  assert.equal(h.api.updateState().status, 'error');
  let complete;
  h.updater.downloadUpdate = () => new Promise(resolve => { complete = resolve; });
  const download = h.api.runUpdateAction();
  await h.api.runUpdateAction();
  h.updater.emit('download-progress', { percent: 47.4 });
  assert.equal(h.api.updateState().progress, 47);
  assert.equal(h.api.updateState().status, 'downloading');
  h.updater.emit('update-downloaded');
  complete();
  await download;
  assert.equal(h.api.updateState().ready, true);
  assert.equal(h.installs.length, 0);
});

test('queued automatic action never installs an update that became ready', async () => {
  const h = harness();
  h.updater.emit('update-available', { version: '0.5.6' });
  h.updater.emit('update-downloaded');
  await turn();
  assert.equal(h.installs.length, 0);
  assert.equal(h.downloads(), 0);
});

test('silent install failure keeps downloaded update retryable', async () => {
  const h = harness();
  await h.api.checkForUpdates();
  await turn();
  h.updater.quitAndInstall = () => h.updater.emit('error', Error('permission denied'));
  await h.api.runUpdateAction();
  await turn();
  assert.equal(h.api.updateState().status, 'ready');
  assert.equal(h.api.updateState().ready, true);
  assert.ok(h.api.updateState().error);
});

test('Linux retains manual downloads and dev builds report unsupported', async () => {
  const linux = harness({ platform: 'linux' });
  await linux.api.checkForUpdates();
  await turn();
  assert.equal(linux.downloads(), 0);
  const dev = harness({ packaged: false });
  await dev.api.checkForUpdates(true);
  assert.equal(dev.api.updateState().status, 'unsupported');
});

test('shutdown cancels queued automatic work and setup is idempotent', async () => {
  const h = harness();
  h.api.setupUpdates();
  assert.equal(h.updater.listenerCount('update-available'), 1);
  h.updater.emit('update-available', { version: '0.5.6' });
  h.api.teardown();
  await turn();
  assert.equal(h.downloads(), 0);
});
