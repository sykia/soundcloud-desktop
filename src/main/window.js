'use strict';

// The SoundCloud BrowserWindow and everything that guards its navigation: the
// load timeout with a DNS rotation fallback, the error page, OAuth popup
// handling, external-link routing, the tray-aware close behaviour and the
// pending launch URL for second-instance / custom-protocol invocations. The
// tray's existence is read through a hook wired by the index, so this module
// never imports tray (tray imports updates and window — one-way edges only).

const path = require('node:path');
const { BrowserWindow, session, shell } = require('electron');
const { HOME_URL } = require('../../shared/constants.js');
const { isSoundCloudUrl, isSignInPopupUrl, launchUrl, launchUrlFromArgs } = require('./urls.js');
const { getSettings } = require('./settings.js');
const dns = require('./dns.js');
const discord = require('./discord.js');

const PAGE_LOAD_TIMEOUT_MS = 30000;
const DNS_CACHE_TIMEOUT_MS = 3000;

let mainWindow;
let pendingLaunchUrl = null;
let isQuitting = false;
let hasTray = () => false;

function setHasTray(predicate) {
  hasTray = predicate;
}

function getMainWindow() {
  return mainWindow;
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function isQuittingFlag() {
  return isQuitting;
}

function setQuitting() {
  isQuitting = true;
}

function initPendingLaunchUrl(args) {
  pendingLaunchUrl = launchUrlFromArgs(args);
}

function hasPendingLaunchUrl() {
  return Boolean(pendingLaunchUrl);
}

function isMainSoundCloudPage(contents) {
  return mainWindow && contents === mainWindow.webContents && isSoundCloudUrl(contents.getURL());
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function openSoundCloudUrl(url) {
  if (!url) return;
  if (!mainWindow || mainWindow.isDestroyed()) {
    pendingLaunchUrl = url;
    return;
  }
  showMainWindow();
  mainWindow.loadURL(url);
}

function openExternalHttps(value) {
  try {
    if (isSoundCloudUrl(value)) openSoundCloudUrl(value);
    else if (new URL(value).protocol === 'https:') shell.openExternal(value);
  } catch {
    // Ignore malformed links from the website.
  }
}

// Raised on the first instance when a second launch passes an argument: a URL
// (including a custom-protocol one) is opened, and a bare second launch without
// --autostart restores the window, matching the original single-instance flow.
function onSecondInstance(argv) {
  const url = launchUrlFromArgs(argv);
  if (url) openSoundCloudUrl(url);
  else if (!argv.includes('--autostart')) showMainWindow();
}

function withTimeout(promise, timeoutMs) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Timed out')), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

function createWindow(hidden = false) {
  mainWindow = new BrowserWindow({
    title: 'SoundCloud',
    icon: path.join(__dirname, '../../build/icons/512x512.png'),
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#121216',
    autoHideMenuBar: true,
    show: !hidden || !hasTray(),
    webPreferences: {
      preload: path.join(__dirname, '../../dist-js/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false
    }
  });

  const contents = mainWindow.webContents;
  let loadTimer;
  let loadId = 0;
  let failureHandled = false;

  function clearLoadTimer() {
    clearTimeout(loadTimer);
    loadTimer = undefined;
  }

  function showLoadError(code, description) {
    if (contents.isDestroyed()) return;
    const dnsFailure = dns.isDnsError(code);
    const hint = code === -7
      ? 'Превышено время ожидания ответа от SoundCloud.'
      : dnsFailure
        ? 'Не удалось определить адрес SoundCloud. Если доступ к сайту ограничен сетью, смена DNS не поможет.'
        : 'Проверьте подключение к интернету и попробуйте ещё раз.';
    console.error(`Не удалось открыть SoundCloud (${code}: ${description}). DNS: ${dns.getDnsServerName()}`);
    const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>SoundCloud</title>
      <style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#121216;color:#fff;font:16px system-ui}main{max-width:480px;padding:32px}h1{font-size:24px}p{color:#bbb;line-height:1.5}small{color:#888}a{display:inline-block;margin-top:12px;padding:12px 18px;border-radius:8px;background:#f50;color:#fff;text-decoration:none}</style>
      <main><h1>SoundCloud не загрузился</h1><p>${hint}</p><small>Код ошибки: ${code}</small><br><a href="${HOME_URL}">Повторить</a></main></html>`;
    contents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  }

  contents.on('did-start-navigation', details => {
    if (!details.isMainFrame || details.isSameDocument) return;
    if (getSettings().discordRpc) discord.clearPresenceOnNav();
    clearLoadTimer();
    const currentLoadId = ++loadId;
    if (!isSoundCloudUrl(details.url)) return;
    failureHandled = false;
    loadTimer = setTimeout(() => {
      if (currentLoadId !== loadId || failureHandled || contents.isDestroyed()) return;
      failureHandled = true;
      clearLoadTimer();
      contents.stop();
      showLoadError(-7, 'Timed out');
    }, PAGE_LOAD_TIMEOUT_MS);
  });

  contents.on('dom-ready', () => {
    if (isSoundCloudUrl(contents.getURL())) clearLoadTimer();
  });

  contents.on('did-fail-load', async (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || !isSoundCloudUrl(url) || failureHandled) return;
    failureHandled = true;
    clearLoadTimer();
    const failedLoadId = loadId;

    if (dns.isDnsError(code) && dns.hasDnsFallback()) {
      const nextIndex = dns.nextDnsServerIndex();
      try {
        dns.configureDnsServer(nextIndex);
        await withTimeout(session.defaultSession.clearHostResolverCache(), DNS_CACHE_TIMEOUT_MS);
        if (failedLoadId === loadId && !contents.isDestroyed()) contents.loadURL(url);
        return;
      } catch (error) {
        console.error(`Не удалось переключить DNS на ${dns.getDnsServerName()}:`, error);
      }
    }

    if (failedLoadId === loadId && !contents.isDestroyed()) showLoadError(code, description);
  });

  contents.on('will-navigate', (event, url) => {
    if (!isSoundCloudUrl(url)) {
      event.preventDefault();
      openExternalHttps(url);
    }
  });

  contents.setWindowOpenHandler(({ url }) => {
    if (isSignInPopupUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true
          }
        }
      };
    }

    openExternalHttps(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(pendingLaunchUrl || HOME_URL);
  pendingLaunchUrl = null;
  mainWindow.on('close', event => {
    if (isQuitting || !hasTray()) return;
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on('closed', () => {
    clearLoadTimer();
    if (getSettings().discordRpc) discord.clearPresence();
    mainWindow = null;
  });
}

module.exports = {
  createWindow,
  showMainWindow,
  openSoundCloudUrl,
  onSecondInstance,
  initPendingLaunchUrl,
  hasPendingLaunchUrl,
  isMainSoundCloudPage,
  getMainWindow,
  sendToRenderer,
  setHasTray,
  isQuitting: isQuittingFlag,
  setQuitting
};