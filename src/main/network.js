'use strict';

// Network connection control and diagnostics. Owns everything in the app that
// talks to the network through the Electron Session:
//
//   - proxy configuration (System / Direct / Custom) applied to
//     session.defaultSession with the official setProxy API, before the first
//     SoundCloud load;
//   - proxy credentials remembered through Electron safeStorage (encrypted on
//     disk, decrypted only in the main process and handed to Chromium via the
//     app 'login' event);
//   - error classification (DNS / TCP / TLS / timeout / proxy) shared with the
//     window's error screen through the pure rules in shared/network-profile.js;
//   - counters for failed and successful requests, grouped by traffic family
//     (html / api / media) — the webRequest events only ever contribute host
//     families and error categories, never URLs, query strings or headers;
//   - a run-once, bounded, user-initiated connectivity probe and an anonymised
//     JSON report without cookies, tokens or protected URLs.
//
// Requests that never touch this module: the Discord Rich Presence bridge uses
// a local named socket, so a proxy setting cannot affect it, and nothing in the
// app performs HTTP(S) through bare Node APIs.

const fs = require('node:fs');
const { app, session, net, dialog, safeStorage } = require('electron');
const dns = require('./dns.js');
const { getSettings, saveSettings } = require('./settings.js');
const {
  buildProxyConfig,
  isCustomProxyComplete,
  classifyNetworkError,
  classifyHostCategory,
  classifyHttpStatus,
  CATEGORY_MESSAGES
} = require('../../shared/network-profile.js');
const { validateSetting } = require('../../shared/settings-schema.js');

// Bounded memory: at most this many recent events are retained for the report.
const EVENT_HISTORY_LIMIT = 60;
const PROBE_TIMEOUT_MS = 8000;
const DNS_PROBE_TIMEOUT_MS = 8000;

let started = false;
let startupNote = '';
let lastApplyError = '';
let lastPageLoad = null;
let lastDiagnostics = null;
const counters = new Map();
const eventHistory = [];

// ---------------------------------------------------------------------------
// Proxy application with rollback
// ---------------------------------------------------------------------------

// Applies one Chromium proxy config and guarantees the previous one returns if
// the call fails. Kept free of Electron state so tests can drive it with a
// mock session and verify the rollback path.
async function applyProxyWithRollback(proxyApi, targetConfig, fallbackConfig) {
  try {
    await proxyApi.set(targetConfig);
    return true;
  } catch (error) {
    if (fallbackConfig && fallbackConfig !== targetConfig) {
      try { await proxyApi.set(fallbackConfig); } catch { /* report the first failure */ }
    }
    throw error;
  }
}

function previousProxyConfig(settings) {
  return buildProxyConfig(settings) || { mode: 'system' };
}

function closeRunnerConnections() {
  // Keep old sockets from silently continuing on the previous configuration.
  const ses = session.defaultSession;
  if (typeof ses.closeAllConnections === 'function') {
    try { ses.closeAllConnections(); } catch { /* ignore */ }
  }
}

function proxyApiFor(ses = session.defaultSession) {
  return {
    set: config => ses.setProxy(config),
    close: closeRunnerConnections
  };
}

function fallbackMessageFor(settings) {
  if (!buildProxyConfig(settings)) return 'invalid';
  return CATEGORY_MESSAGES[settings.networkMode] ? settings.networkMode : 'system';
}

// Startup application: runs before the first SoundCloud navigation so not a
// single request leaves through the wrong route. An incomplete Custom profile
// saved earlier falls back to System with a visible note instead of guessing.
function applyStartupNetwork(ses = session.defaultSession) {
  const current = getSettings();
  const config = buildProxyConfig(current);
  if (!config) {
    startupNote = 'invalid';
    return proxyApiFor(ses).set({ mode: 'system' }).catch(error => {
      console.error('Could not apply the fallback network configuration:', error);
    });
  }
  startupNote = '';
  return proxyApiFor(ses).set(config).catch(error => {
    console.error('Could not apply the saved network configuration:', error);
  });
}

// Full apply used by both UIs: validates, applies through the Session API and
// rolls back to the previously saved configuration on any failure.
async function applyNetworkSettings(patch, ses = session.defaultSession) {
  const previous = { ...getSettings() };
  const candidate = { ...previous };
  for (const key of ['networkMode', 'proxyType', 'proxyHost', 'proxyPort']) {
    if (Object.hasOwn(patch, key)) candidate[key] = patch[key];
  }
  // The panel sends the port as a number, but tolerate a plain digit string.
  if (typeof candidate.proxyPort === 'string' && /^\d+$/.test(candidate.proxyPort)) {
    candidate.proxyPort = Number(candidate.proxyPort);
  }
  // Only Custom traffic carries proxy details; System and Direct ignore them,
  // so an empty host or port remains a valid stored value in those modes.
  for (const key of ['networkMode', 'proxyType']) {
    if (!validateSetting(key, candidate[key])) {
      return { ok: false, error: `invalid-${key}`, message: CATEGORY_MESSAGES.invalid };
    }
  }
  if (candidate.networkMode === 'custom') {
    for (const key of ['proxyHost', 'proxyPort']) {
      if (!validateSetting(key, candidate[key])) {
        return { ok: false, error: `invalid-${key}`, message: CATEGORY_MESSAGES.invalid };
      }
    }
  } else {
    // An explicitly provided proxy fragment is validated even outside Custom:
    // garbage must never reach settings.json through any mode.
    for (const key of ['proxyHost', 'proxyPort']) {
      if (Object.hasOwn(patch, key) && !validateSetting(key, candidate[key])) {
        return { ok: false, error: `invalid-${key}`, message: CATEGORY_MESSAGES.invalid };
      }
    }
  }
  if (candidate.networkMode === 'custom' && !isCustomProxyComplete(candidate)) {
    return { ok: false, error: 'incomplete-proxy', message: CATEGORY_MESSAGES.invalid };
  }

  const api = proxyApiFor(ses);
  const target = buildProxyConfig(candidate);
  try {
    await applyProxyWithRollback(api, target, previousProxyConfig(previous));
  } catch (error) {
    lastApplyError = error.message || 'apply-failed';
    return {
      ok: false,
      error: 'apply-failed',
      message: {
        ru: 'Не удалось применить подключение, прежняя конфигурация восстановлена.',
        en: 'Could not apply the connection, the previous configuration was restored.'
      },
      detail: String(error.message || error)
    };
  }
  saveSettings(candidate);
  lastApplyError = '';
  api.close();
  return { ok: true, snapshot: getNetworkSnapshot() };
}

// Restores the default, reversible state: System mode, no custom proxy, no
// stored credentials.
async function resetNetworkSettings(ses = session.defaultSession) {
  const result = await applyNetworkSettings({ networkMode: 'system' }, ses);
  if (result.ok) {
    saveSettings({ ...getSettings(), proxyCredentials: '' });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Proxy credentials (never in plaintext, only through Electron safeStorage)
// ---------------------------------------------------------------------------

function readProxyCredentials() {
  const blob = getSettings().proxyCredentials;
  if (!blob || typeof safeStorage?.decryptString !== 'function' ||
      !safeStorage.isEncryptionAvailable()) {
    return { username: '', password: '' };
  }
  try {
    const parsed = JSON.parse(safeStorage.decryptString(Buffer.from(blob, 'base64')));
    if (!parsed || typeof parsed !== 'object') return { username: '', password: '' };
    return {
      username: typeof parsed.username === 'string' ? parsed.username : '',
      password: typeof parsed.password === 'string' ? parsed.password : ''
    };
  } catch {
    return { username: '', password: '' };
  }
}

// Empty username and password clear the stored credentials; anything else is
// encrypted with safeStorage (DPAPI on Windows) before it is written to
// settings.json. The renderer never receives the blob, only a boolean.
async function storeProxyCredentials(username, password) {
  const login = typeof username === 'string' ? username : '';
  const secret = typeof password === 'string' ? password : '';
  if (!login && !secret) {
    saveSettings({ ...getSettings(), proxyCredentials: '' });
    return { stored: true, encryptionAvailable: true };
  }
  if (typeof safeStorage?.encryptString !== 'function' || !safeStorage.isEncryptionAvailable()) {
    return {
      stored: false,
      encryptionAvailable: false,
      message: {
        ru: 'Приложение не смогло зашифровать учётные данные прокси, они не сохранены.',
        en: 'The app could not encrypt the proxy credentials, so they were not saved.'
      }
    };
  }
  const blob = safeStorage.encryptString(JSON.stringify({ username: login, password: secret }))
    .toString('base64');
  saveSettings({ ...getSettings(), proxyCredentials: blob });
  return { stored: true, encryptionAvailable: true };
}

let loginWired = false;
function wireProxyLogin() {
  if (loginWired) return;
  loginWired = true;
  app.on('login', (event, _webContents, _details, authInfo, callback) => {
    if (!authInfo || !authInfo.isProxy) {
      // Keep site identity dialogs free of proxy credentials: decline without
      // intercepting anything else.
      callback('', '');
      return;
    }
    event.preventDefault();
    const { username, password } = readProxyCredentials();
    callback(username, password);
  });
}

// ---------------------------------------------------------------------------
// Safe event-based failure tracking (no URLs, no headers, no portals' data)
// ---------------------------------------------------------------------------

function bumpCounter(key) {
  counters.set(key, (counters.get(key) || 0) + 1);
}

function pushEvent(event) {
  eventHistory.push(event);
  if (eventHistory.length > EVENT_HISTORY_LIMIT) eventHistory.shift();
}

//wireCounters(session)
function startTrafficObservation(ses = session.defaultSession) {
  if (started) return;
  started = true;
  ses.webRequest.onErrorOccurred({ urls: ['https://*/*'] }, details => {
    const family = classifyHostCategory(details.url);
    if (family === 'other') return;
    const type = classifyNetworkError(details.error ? Number.NaN : -1, details.error || '');
    bumpCounter(`${family}:${type}`);
    pushEvent({ at: Date.now(), family, type, phase: 'fail' });
  });
  ses.webRequest.onCompleted({ urls: ['https://*/*'] }, details => {
    const family = classifyHostCategory(details.url);
    if (family === 'other' || details.fromCache) return;
    const status = classifyHttpStatus(details.statusCode);
    bumpCounter(`${family}:${status === 'ok' ? 'ok' : `http-${details.statusCode}`}`);
    pushEvent({ at: Date.now(), family, status: details.statusCode, phase: 'response' });
  });
}

// Called from window.js: the main-frame SoundCloud HTML load ended.
function recordPageLoad(ok, code, description) {
  lastPageLoad = {
    ok: Boolean(ok),
    at: Date.now(),
    type: ok ? 'ok' : classifyNetworkError(code, description || '')
  };
  if (ok) bumpCounter('html:ok');
  else bumpCounter(`html:${lastPageLoad.type}`);
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

function withTimeout(promise, timeoutMs, label) {
  // The synthetic message deliberately uses the net::ERR_…_TIMED_OUT shape:
  // sanitizeProbeDetail and classifyNetworkError then report a probe timeout as
  // a 'timeout' failure, not as 'unknown'.
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`net::ERR_${label}_TIMED_OUT`)), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

async function probeStep(name, runner) {
  try {
    const outcome = await runner();
    return { name, ...outcome };
  } catch (error) {
    const type = classifyNetworkError(Number.NaN, String(error.message || error));
    return {
      name,
      status: 'fail',
      type,
      detail: sanitizeProbeDetail(error)
    };
  }
}

// Only the Chromium error category is kept; any non-ASCII or unusual text from
// a remote host never reaches a report.
function sanitizeProbeDetail(error) {
  const match = String(error.message || error).match(/net::ERR_[A-Z_]+/);
  return match ? match[0].replace(/^net::/, '') : '';
}

async function probeHttpStatus(url) {
  const response = await withTimeout(
    net.fetch(url, { method: 'GET', credentials: 'omit', cache: 'no-store' }),
    PROBE_TIMEOUT_MS, 'NETWORK'
  );
  // The body is never read: status alone suffices for connectivity, and a
  // response body would carry tracking or API payloads. Receiving any HTTP
  // status means DNS, TCP and TLS all worked — 401/403 are reported as a
  // restriction on this network, never as proof of a blocked transport.
  return {
    status: 'ok',
    httpStatus: response.status,
    kind: profileStatusKind(response.status),
    type: `http-${response.status}`
  };
}

function profileStatusKind(status) {
  const kind = classifyHttpStatus(status);
  return kind === 'ok' ? 'ok' : kind === 'restricted' ? 'restricted' : 'unusual';
}

async function runDiagnostics() {
  const ses = session.defaultSession;
  const steps = [];
  steps.push(await probeStep('dns', async () => {
    const resolved = await withTimeout(ses.resolveHost('soundcloud.com'), DNS_PROBE_TIMEOUT_MS, 'DNS');
    if (resolved.error !== null && resolved.error !== undefined) {
      const type = Number.isFinite(resolved.error)
        ? classifyNetworkError(resolved.error, '')
        : classifyNetworkError(Number.NaN, String(resolved.error));
      return { status: 'fail', type };
    }
    return { status: 'ok', type: 'ok', addresses: Math.min(resolved.addresses?.length ?? 0, 8) };
  }));
  steps.push(await probeStep('html', () => probeHttpStatus('https://soundcloud.com/')));
  steps.push(await probeStep('api', () => probeHttpStatus('https://api-v2.soundcloud.com/')));
  lastDiagnostics = {
    startedAt: Date.now(),
    finishedAt: Date.now(),
    mode: getSettings().networkMode,
    dnsServer: dns.getDnsServerName(),
    online: Boolean(net.isOnline?.()),
    steps: steps.map(step => ({
      name: step.name,
      status: step.status || 'fail',
      type: step.type || 'unknown',
      ...(step.kind ? { kind: step.kind } : {}),
      ...(step.detail ? { detail: step.detail } : {}),
      ...(step.name === 'dns' && step.status === 'ok' ? { addresses: step.addresses } : {}),
      ...(step.httpStatus ? { httpStatus: step.httpStatus } : {})
    }))
  };
  return lastDiagnostics;
}

// ---------------------------------------------------------------------------
// Renderer-facing snapshot (sanitized)
// ---------------------------------------------------------------------------

function getNetworkSnapshot() {
  const settings = getSettings();
  return {
    networkMode: settings.networkMode,
    proxyType: settings.proxyType,
    proxyHost: settings.proxyHost,
    proxyPort: settings.proxyPort,
    hasProxyCredentials: Boolean(settings.proxyCredentials),
    configNote: startupNote || fallbackMessageFor(settings) || settings.networkMode,
    applyError: lastApplyError,
    online: Boolean(net.isOnline?.()),
    dnsServer: dns.getDnsServerName(),
    lastPageLoad,
    lastDiagnostics: lastDiagnostics ? {
      startedAt: lastDiagnostics.startedAt,
      mode: lastDiagnostics.mode,
      online: lastDiagnostics.online,
      dnsServer: lastDiagnostics.dnsServer,
      steps: lastDiagnostics.steps
    } : null,
    counters: Object.fromEntries([...counters.entries()].slice(0, 100)),
    events: eventHistory.slice(-20)
  };
}

// ---------------------------------------------------------------------------
// Anonymised diagnostic report
// ---------------------------------------------------------------------------

function buildReport() {
  const snapshot = getNetworkSnapshot();
  return {
    notice: 'No personal data: no cookies, tokens, authorisation headers, full URLs, query strings, session identifiers or response contents.',
    generatedAt: new Date().toISOString(),
    app: {
      name: 'SoundCloud Desktop',
      version: app.getVersion(),
      electron: process.versions.electron,
      platform: process.platform,
      arch: process.arch
    },
    network: {
      mode: snapshot.networkMode,
      proxyType: snapshot.networkMode === 'custom' ? snapshot.proxyType : null,
      proxyHost: snapshot.networkMode === 'custom' ? snapshot.proxyHost : null,
      proxyPort: snapshot.networkMode === 'custom' ? snapshot.proxyPort : null,
      proxyCredentialsStored: snapshot.hasProxyCredentials,
      configNote: snapshot.configNote,
      dnsProvider: snapshot.dnsServer,
      online: snapshot.online
    },
    pageLoad: snapshot.lastPageLoad,
    diagnostics: snapshot.lastDiagnostics,
    recentFailures: snapshot.counters,
    events: snapshot.events.map(event => ({
      at: event.at,
      family: event.family,
      phase: event.phase,
      ...(event.type ? { type: event.type } : {}),
      ...(event.status ? { httpStatus: event.status } : {})
    }))
  };
}

async function exportReport(parentWindow) {
  const report = buildReport();
  const stamp = new Date().toISOString().slice(0, 10);
  const result = await dialog.showSaveDialog(parentWindow, {
    title: 'Сохранить отчёт о подключении (без личных данных)',
    defaultPath: `soundcloud-desktop-network-report-${stamp}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { saved: false };
  fs.writeFileSync(result.filePath, JSON.stringify(report, null, 2));
  return { saved: true, path: result.filePath };
}

// Test seam: reset the module-local observation state between unit tests.
function resetObservationState() {
  counters.clear();
  eventHistory.length = 0;
  lastPageLoad = null;
  lastDiagnostics = null;
  startupNote = '';
  lastApplyError = '';
}

module.exports = {
  applyStartupNetwork,
  applyNetworkSettings,
  applyProxyWithRollback,
  resetNetworkSettings,
  storeProxyCredentials,
  wireProxyLogin,
  startTrafficObservation,
  recordPageLoad,
  runDiagnostics,
  getNetworkSnapshot,
  buildReport,
  exportReport,
  resetObservationState
};
