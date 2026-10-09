'use strict';

// electron-updater orchestration. All update state lives here; the tray reads
// it through getMenuStatus() and the window/publish side uses sendToRenderer(),
// so updates.js owns the state and notifications while tray.js only renders.
// The tray menu refresh is wired in by the index through attachRefresh() so the
// dependency between updates and tray stays one-way (updates does not import
// tray at all).

const fs = require('node:fs');
const path = require('node:path');
const { Notification, app } = require('electron');
const { CHANNEL } = require('../../shared/ipc.js');
const { sendToRenderer, showMainWindow, getMainWindow } = require('./window.js');
const { installLinuxPackage } = require('./linux-package-install.js');
const { NixUpdater, isNixInstallation } = require('./nix-updates.js');

let updater;
let updateReady = false;
let availableUpdateVersion = '';
let updateStatus = 'none';
let updateProgress = 0;
let updateError = '';
let updateDownloadRunning = false;
const updateNotifications = new Set();
let updateCheckRunning = false;
let manualUpdateCheck = false;
let updateTimer;
let initialUpdateTimer;
let refreshHook = null;
const nixInstallation = isNixInstallation();

function attachRefresh(fn) {
  refreshHook = fn;
}

function releaseUrl() {
  return /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(availableUpdateVersion)
    ? `https://github.com/sykia/soundcloud-desktop/releases/tag/v${availableUpdateVersion}`
    : 'https://github.com/sykia/soundcloud-desktop/releases/latest';
}

function showUpdateNotice(body, click) {
  if (!Notification.isSupported()) return;
  const notification = new Notification({ title: 'SoundCloud Desktop', body });
  updateNotifications.add(notification);
  if (updateNotifications.size > 4) updateNotifications.delete(updateNotifications.values().next().value);
  if (click) notification.on('click', click);
  notification.on('close', () => updateNotifications.delete(notification));
  notification.show();
}

function updateState() {
  let packageType = 'linux';
  if (process.platform === 'win32') packageType = 'win';
  else if (nixInstallation) packageType = 'nix';
  else if (process.env.APPIMAGE) packageType = 'AppImage';
  else {
    try { packageType = fs.readFileSync(path.join(process.resourcesPath, 'package-type'), 'utf8').trim(); }
    catch { /* An unpackaged build has no package identity. */ }
  }
  return { status: updateStatus, version: availableUpdateVersion, progress: updateProgress,
    error: updateError, ready: updateReady, packageType };
}

function publishUpdateState() {
  sendToRenderer(CHANNEL.updateState, updateState());
  refreshHook?.();
}

function showUpdatePanel() {
  if (!availableUpdateVersion) return;
  showMainWindow();
  const contents = getMainWindow()?.webContents;
  if (!contents) return;
  const send = () => contents.send(CHANNEL.showUpdate, updateState());
  if (contents.isLoading()) contents.once('did-finish-load', send);
  else send();
}

async function checkForUpdates(manual = false) {
  if (!updater || updateCheckRunning || updateDownloadRunning || updateReady || updateStatus === 'installing') return;
  manualUpdateCheck = manual;
  updateCheckRunning = true;
  refreshHook?.();
  try {
    await updater.checkForUpdates();
  } catch (error) {
    console.error('Could not check for updates:', error);
    if (manual) showUpdateNotice('Не удалось проверить обновления. Попробуйте позже.');
  } finally {
    updateCheckRunning = false;
    manualUpdateCheck = false;
    refreshHook?.();
  }
}

async function runUpdateAction() {
  if (!updater || !availableUpdateVersion || updateDownloadRunning || updateStatus === 'installing') {
    return updateState();
  }
  if (nixInstallation) {
    updateStatus = 'installing';
    updateError = '';
    publishUpdateState();
    setImmediate(async () => {
      try {
        const executable = await updater.installUpdate();
        app.relaunch({ execPath: executable, args: [] });
        app.quit();
      } catch (error) {
        console.error('Could not install Nix update:', error);
        updateStatus = 'error';
        updateError = `Не удалось обновить через Nix: ${error.message}`;
        publishUpdateState();
      }
    });
    return updateState();
  }
  if (updateReady) {
    updateStatus = 'installing';
    updateError = '';
    publishUpdateState();
    setImmediate(async () => {
      try {
        const packageType = updateState().packageType;
        if (['deb', 'rpm', 'pacman'].includes(packageType)) {
          await installLinuxPackage(packageType, updater.downloadedUpdateHelper?.file);
          app.relaunch();
          app.quit();
        } else {
          updater.quitAndInstall(process.platform === 'win32', true);
        }
      }
      catch (error) {
        console.error('Could not install update:', error);
        updateStatus = 'ready';
        updateError = /not authorized|authentication|permission denied|dismissed|cancelled|canceled|авторизац|прав/i.test(error.message)
          ? 'Не удалось получить права администратора. Повторите попытку или установите пакет со страницы релиза вручную.'
          : 'Не удалось установить обновление. Откройте страницу релиза и установите пакет вручную.';
        publishUpdateState();
      }
    });
    return updateState();
  }
  updateDownloadRunning = true;
  updateStatus = 'downloading';
  updateProgress = 0;
  updateError = '';
  publishUpdateState();
  try {
    await updater.downloadUpdate();
  } catch (error) {
    console.error('Could not download update:', error);
    updateStatus = 'error';
    updateError = 'Не удалось загрузить обновление. Попробуйте снова или откройте страницу релиза.';
    publishUpdateState();
  } finally {
    updateDownloadRunning = false;
  }
  return updateState();
}

function setupUpdates() {
  if (!app.isPackaged || !['win32', 'linux'].includes(process.platform)) return;
  if (nixInstallation) updater = new NixUpdater({ version: app.getVersion(), home: app.getPath('home') });
  else ({ autoUpdater: updater } = require('electron-updater'));
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.on('update-available', info => {
    const isNewVersion = availableUpdateVersion !== info.version;
    availableUpdateVersion = info.version;
    if (isNewVersion) {
      updateReady = false;
      updateProgress = 0;
      updateError = '';
      updateStatus = 'available';
      showUpdateNotice(`Доступна версия ${info.version}. Нажмите, чтобы открыть обновление.`, showUpdatePanel);
    }
    publishUpdateState();
  });
  updater.on('update-not-available', () => {
    availableUpdateVersion = '';
    updateReady = false;
    updateStatus = 'none';
    updateError = '';
    if (manualUpdateCheck) showUpdateNotice('Установлена последняя версия.');
    publishUpdateState();
  });
  updater.on('download-progress', info => {
    const progress = Number.isFinite(info.percent)
      ? Math.max(0, Math.min(100, Math.round(info.percent))) : updateProgress;
    if (progress !== updateProgress) {
      updateProgress = progress;
      publishUpdateState();
    }
  });
  updater.on('update-downloaded', () => {
    updateReady = true;
    updateStatus = 'ready';
    updateProgress = 100;
    updateError = '';
    showUpdateNotice(`Версия ${availableUpdateVersion} загружена. Нажмите, чтобы установить её.`, showUpdatePanel);
    publishUpdateState();
  });
  updater.on('error', error => {
    console.error('Update error:', error);
    if (availableUpdateVersion) {
      updateStatus = updateReady ? 'ready' : 'error';
      updateError = updateReady
        ? 'Не удалось установить обновление. Попробуйте снова или откройте страницу релиза.'
        : 'Не удалось загрузить обновление. Попробуйте снова или откройте страницу релиза.';
      publishUpdateState();
    }
  });
  initialUpdateTimer = setTimeout(() => checkForUpdates(), 15000);
  updateTimer = setInterval(() => checkForUpdates(), 6 * 60 * 60 * 1000);
  refreshHook?.();
}

function getMenuStatus() {
  return {
    version: availableUpdateVersion,
    ready: updateReady,
    checking: updateCheckRunning,
    hasUpdater: Boolean(updater)
  };
}

function getAvailableVersion() {
  return availableUpdateVersion;
}

function teardown() {
  clearTimeout(initialUpdateTimer);
  clearInterval(updateTimer);
  updater?.teardown?.();
}

module.exports = {
  attachRefresh,
  setupUpdates,
  checkForUpdates,
  runUpdateAction,
  showUpdatePanel,
  updateState,
  getMenuStatus,
  getAvailableVersion,
  releaseUrl,
  teardown
};
