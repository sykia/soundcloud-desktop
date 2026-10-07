'use strict';

// Entry point of the main process. Owns the app lifecycle (single-instance
// lock, second-instance, open-url, GPU crash fallback, quit) and the whenReady
// orchestration: settings/insights load, Discord start, the audio-ad blocking
// rule, IPC registration, application menu, tray, window and update timers.

const { app, Menu, session } = require('electron');
const { HOME_URL } = require('../../shared/constants.js');
const gpu = require('./gpu.js');
const urls = require('./urls.js');
const settings = require('./settings.js');
const insightsStore = require('./insights-store.js');
const discord = require('./discord.js');
const autostart = require('./autostart.js');
const dns = require('./dns.js');
const window = require('./window.js');
const updates = require('./updates.js');
const locale = require('./locale.js');
const tray = require('./tray.js');
const ipc = require('./ipc.js');

// cusade animates transforms, opacities, filters and blurred cover backgrounds.
// That work belongs on the GPU: app.disableHardwareAcceleration() forces the
// software rasterizer everywhere, which is exactly why animations stuttered and
// the page felt frozen on Windows. Hardware acceleration stays enabled instead,
// and the only fallback covers machines whose GPU process keeps dying. No driver,
// blocklist or backend switches are involved, so nothing forces a specific GPU.
// The fallback marker must be consumed before the app is ready.
if (gpu.consumeGpuFallback()) {
  console.error('Hardware acceleration is disabled for this launch because the GPU process kept failing.');
  app.disableHardwareAcceleration();
}

const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();
window.initPendingLaunchUrl(process.argv);
app.on('second-instance', (_event, argv) => window.onSecondInstance(argv));
app.on('open-url', (event, url) => {
  event.preventDefault();
  window.openSoundCloudUrl(urls.launchUrl(url));
});
app.on('child-process-gone', (_event, details) => {
  if (details.type !== 'GPU' || window.isQuitting() || gpu.isFallbackRestarted()) return;
  if (gpu.handleGpuProcessGone(details.reason)) {
    console.error('Restarting once with hardware acceleration disabled.');
    app.relaunch();
    app.quit();
  }
});
app.on('before-quit', () => {
  window.setQuitting();
  updates.teardown();
  insightsStore.flushOnQuit();
  discord.stopRpc();
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => app.quit());
}

if (hasInstanceLock) app.whenReady().then(async () => {
  app.setAppUserModelId('io.github.sykia.soundcloud-desktop');
  dns.configureDnsServer(0);

  settings.loadSettings();
  try { await locale.ensureEnglishSource(); }
  catch (error) { console.error('Could not prepare English source for Russian translation:', error); }
  insightsStore.loadInsights();
  const current = settings.getSettings();
  if (current.autoStart) {
    try { autostart.setAutoStart(true, current.startMinimized); }
    catch (error) { console.error('Could not restore autostart:', error); }
  }
  if (current.discordRpc && current.discordClientId) {
    discord.startRpc(current.discordClientId);
  }

  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['https://api-v2.soundcloud.com/audio-ads*'] },
    (details, callback) => {
      const isAudioAdRequest = details.method === 'GET' &&
        new URL(details.url).pathname === '/audio-ads';
      callback({ cancel: settings.getSettings().blockAudioAds && isAudioAdRequest });
    }
  );

  ipc.register();

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Навигация',
      submenu: [
        { label: 'Назад', accelerator: 'Alt+Left', click: () => {
          if (window.getMainWindow()?.webContents.navigationHistory.canGoBack()) {
            window.getMainWindow().webContents.navigationHistory.goBack();
          }
        } },
        { label: 'Вперёд', accelerator: 'Alt+Right', click: () => {
          if (window.getMainWindow()?.webContents.navigationHistory.canGoForward()) {
            window.getMainWindow().webContents.navigationHistory.goForward();
          }
        } },
        { label: 'Обновить', accelerator: 'CmdOrCtrl+R', click: () => window.getMainWindow()?.webContents.reload() },
        { label: 'На главную', accelerator: 'CmdOrCtrl+Home', click: () => window.getMainWindow()?.loadURL(HOME_URL) },
        { type: 'separator' },
        { role: 'quit', label: 'Выход' }
      ]
    }
  ]));

  tray.createTray();
  updates.attachRefresh(tray.refreshMenu);
  window.setHasTray(tray.hasTray);
  window.createWindow(process.argv.includes('--autostart') &&
    process.argv.includes('--minimized') && !window.hasPendingLaunchUrl());
  updates.setupUpdates();
  app.on('activate', () => {
    window.showMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
