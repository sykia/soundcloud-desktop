'use strict';

// The system tray icon and its context menu. Every piece of state the menu
// shows (update version, readiness, whether a check is running) comes from
// updates.getMenuStatus(), and the window/tray refresh cycle is wired by the
// index: updates.attachRefresh(tray.refreshMenu) makes publishUpdateState and
// checkForUpdates rebuild the menu without updates.js importing this module.

const path = require('node:path');
const { app, Menu, Tray } = require('electron');
const updates = require('./updates.js');
const { showMainWindow } = require('./window.js');

let tray = null;

function hasTray() {
  return Boolean(tray);
}

function refreshMenu() {
  if (!tray) return;
  const status = updates.getMenuStatus();
  const updateAction = status.version
    ? { label: `Обновление ${status.version}${status.ready ? ' готово' : ''}`, click: () => updates.showUpdatePanel() }
    : null;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Открыть SoundCloud', click: showMainWindow },
    { type: 'separator' },
    ...(updateAction ? [updateAction] : []),
    { label: 'Проверить обновления', enabled: status.hasUpdater && !status.checking,
      click: () => updates.checkForUpdates(true) },
    { type: 'separator' },
    { label: 'Выход', click: () => app.quit() }
  ]));
}

function createTray() {
  const icon = process.platform === 'win32'
    ? '../../build/icon.ico' : '../../build/icons/32x32.png';
  try {
    tray = new Tray(path.join(__dirname, icon));
    tray.setToolTip('SoundCloud Desktop');
    refreshMenu();
    tray.on('click', showMainWindow);
  } catch (error) {
    console.error('Could not create tray icon:', error);
    tray = null;
  }
}

module.exports = { createTray, refreshMenu, hasTray };