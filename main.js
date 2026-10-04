const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, Menu, Tray, Notification, ipcMain, session, shell, dialog, clipboard, ClipboardItem, nativeImage } = require('electron');
const discordRpc = require('./discord-rpc');

const HOME_URL = 'https://soundcloud.com/';
const DNS_SERVERS = [
  { name: 'Google', url: 'https://dns.google/dns-query' },
  { name: 'Cloudflare', url: 'https://cloudflare-dns.com/dns-query' },
  { name: 'Quad9', url: 'https://dns.quad9.net/dns-query' }
];
const DNS_ERROR_CODES = new Set([-105, -137, -800, -801, -802, -803, -808]);
const PAGE_LOAD_TIMEOUT_MS = 30000;
const DNS_CACHE_TIMEOUT_MS = 3000;
const PROTOCOL = 'soundcloud-desktop';
const AUTOSTART_FILE = 'io.github.sykia.soundcloud-desktop.desktop';
const DEFAULT_DISCORD_CLIENT_ID = '1555593977367887893';
const DEFAULT_ACCENT_COLOR = '#ff5500';
const DEFAULT_RADII = { avatarRadius: 50, trackRadius: 3, albumRadius: 3 };
let mainWindow;
let tray;
let isQuitting = false;
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
let dnsServerIndex = 0;
let pendingLaunchUrl = null;
let lastPresenceKey = '';
let lastPresenceSent = 0;
let insights = { sessions: [] };
let lastInsightEntry;
let insightsSaveTimer;
let insightsDirty = false;
let settings = {
  hideArtistTools: false,
  hideNearbyEvents: false,
  blockAudioAds: false,
  discordRpc: false,
  discordClientId: DEFAULT_DISCORD_CLIENT_ID,
  autoStart: false,
  startMinimized: false,
  accentColor: DEFAULT_ACCENT_COLOR,
  playbackVisualization: false,
  animations: false,
  showYourLikesButton: true,
  insightsHiddenUntil: 0,
  insightsLayout: { location: 'sidebar', index: 0, width: 0, height: 0 },
  appLanguage: 'site',
  ...DEFAULT_RADII
};

function isHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

function isArtworkRadius(value) {
  return Number.isInteger(value) && value >= 0 && value <= 50;
}

function isInsightsLayout(value) {
  return value && typeof value === 'object' &&
    ['sidebar', 'main', 'feed'].includes(value.location) &&
    Number.isInteger(value.index) && value.index >= 0 && value.index <= 100 &&
    Number.isInteger(value.width) && (value.width === 0 || value.width >= 240 && value.width <= 900) &&
    Number.isInteger(value.height) && (value.height === 0 || value.height >= 120 && value.height <= 800);
}

function isMainSoundCloudPage(contents) {
  return mainWindow && contents === mainWindow.webContents && isSoundCloudUrl(contents.getURL());
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function insightsPath() {
  return path.join(app.getPath('userData'), 'insights.json');
}

function loadInsights() {
  try {
    const saved = JSON.parse(fs.readFileSync(insightsPath(), 'utf8'));
    if (Array.isArray(saved.sessions)) insights.sessions = saved.sessions.slice(-20000);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not load cusade Insights:', error);
  }
}

function saveInsights() {
  const file = insightsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(insights), { mode: 0o600 });
  fs.renameSync(temporary, file);
  insightsDirty = false;
}

function scheduleInsightsSave() {
  insightsDirty = true;
  if (insightsSaveTimer) return;
  insightsSaveTimer = setTimeout(() => {
    insightsSaveTimer = undefined;
    try { saveInsights(); }
    catch (error) {
      console.error('Could not save cusade Insights:', error);
      if (insightsDirty) scheduleInsightsSave();
    }
  }, 15000);
}

function validInsightSample(sample) {
  return sample && typeof sample === 'object' &&
    typeof sample.sessionId === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(sample.sessionId) &&
    typeof sample.title === 'string' && sample.title.length > 0 && sample.title.length <= 300 &&
    typeof sample.artist === 'string' && sample.artist.length > 0 && sample.artist.length <= 300 &&
    typeof sample.url === 'string' && sample.url.length <= 2048 && isSoundCloudUrl(sample.url) &&
    (sample.artwork === '' || (typeof sample.artwork === 'string' &&
      sample.artwork.length <= 2048 && /^https:\/\/([a-z0-9-]+\.)*sndcdn\.com\//i.test(sample.artwork))) &&
    Number.isInteger(sample.seconds) && sample.seconds >= 1 && sample.seconds <= 10;
}

function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    settings.hideArtistTools = saved.hideArtistTools === true;
    settings.hideNearbyEvents = saved.hideNearbyEvents === true;
    settings.blockAudioAds = saved.blockAudioAds === true;
    settings.discordClientId = isDiscordClientId(saved.discordClientId)
      ? saved.discordClientId : DEFAULT_DISCORD_CLIENT_ID;
    settings.discordRpc = saved.discordRpc === true;
    settings.autoStart = saved.autoStart === true;
    settings.startMinimized = saved.startMinimized === true;
    settings.playbackVisualization = saved.playbackVisualization === true;
    settings.animations = saved.animations === true;
    settings.showYourLikesButton = saved.showYourLikesButton !== false;
    settings.insightsHiddenUntil = Number.isFinite(saved.insightsHiddenUntil) && saved.insightsHiddenUntil > 0
      ? saved.insightsHiddenUntil : 0;
    settings.insightsLayout = isInsightsLayout(saved.insightsLayout)
      ? saved.insightsLayout : { location: 'sidebar', index: 0, width: 0, height: 0 };
    settings.appLanguage = saved.appLanguage === 'ru' ? 'ru' : 'site';
    for (const key of Object.keys(DEFAULT_RADII)) {
      settings[key] = isArtworkRadius(saved[key]) ? saved[key] : DEFAULT_RADII[key];
    }
    settings.accentColor = isHexColor(saved.accentColor)
      ? saved.accentColor.toLowerCase() : DEFAULT_ACCENT_COLOR;
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not load cusade settings:', error);
  }
}

function saveSettings(nextSettings) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(nextSettings, null, 2));
  settings = nextSettings;
}

function isDiscordClientId(value) {
  return typeof value === 'string' && /^\d{17,20}$/.test(value);
}

function desktopQuote(value) {
  return `"${value.replace(/([\\"$`])/g, '\\$1').replace(/%/g, '%%')}"`;
}

function setAutoStart(enabled, minimized) {
  if (process.platform === 'win32') {
    const args = app.isPackaged ? ['--autostart'] : [app.getAppPath(), '--autostart'];
    app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath,
      args: minimized ? [...args, '--minimized'] : args });
    if (app.getLoginItemSettings({ path: process.execPath,
      args: minimized ? [...args, '--minimized'] : args }).openAtLogin !== enabled) {
      throw new Error('Windows did not apply the autostart setting');
    }
    return;
  }
  if (process.platform !== 'linux') throw new Error('Autostart is unavailable on this platform');
  const configHome = process.env.XDG_CONFIG_HOME || path.join(app.getPath('home'), '.config');
  const file = path.join(configHome, 'autostart', AUTOSTART_FILE);
  if (!enabled) { fs.rmSync(file, { force: true }); return; }
  const args = app.isPackaged ? [process.execPath] : [process.execPath, app.getAppPath()];
  args.push('--autostart');
  if (minimized) args.push('--minimized');
  const content = `[Desktop Entry]\nType=Application\nName=SoundCloud Desktop\nExec=${args.map(desktopQuote).join(' ')}\nIcon=soundcloud-desktop\nTerminal=false\nX-GNOME-Autostart-enabled=true\n`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, { mode: 0o600 });
}

app.disableHardwareAcceleration();

function configureDnsServer(index) {
  app.configureHostResolver({
    secureDnsMode: 'secure',
    secureDnsServers: [DNS_SERVERS[index].url]
  });
  dnsServerIndex = index;
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

function isSoundCloudUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      (url.hostname === 'soundcloud.com' || url.hostname.endsWith('.soundcloud.com'));
  } catch {
    return false;
  }
}

function normalizeSoundCloudUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) return null;
  if (isSoundCloudUrl(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' &&
        (url.hostname === 'soundcloud.com' || url.hostname.endsWith('.soundcloud.com'))) {
      url.protocol = 'https:';
      return url.href;
    }
  } catch {
    return null;
  }
  return null;
}

function launchUrl(value) {
  const direct = normalizeSoundCloudUrl(value);
  if (direct) return direct;
  if (typeof value !== 'string' || value.length > 8192) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== `${PROTOCOL}:` || url.hostname !== 'open') return null;
    return normalizeSoundCloudUrl(url.searchParams.get('url'));
  } catch {
    return null;
  }
}

function launchUrlFromArgs(args) {
  return args.map(launchUrl).find(Boolean) || null;
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

function isSignInPopupUrl(value) {
  if (value === 'about:blank') return true;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    return isSoundCloudUrl(value) || [
      'accounts.google.com',
      'facebook.com',
      'www.facebook.com',
      'appleid.apple.com'
    ].includes(url.hostname);
  } catch {
    return false;
  }
}

function openExternalHttps(value) {
  try {
    if (isSoundCloudUrl(value)) openSoundCloudUrl(value);
    else if (new URL(value).protocol === 'https:') shell.openExternal(value);
  } catch {
    // Ignore malformed links from the website.
  }
}

function isArtworkUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      (url.hostname === 'sndcdn.com' || url.hostname.endsWith('.sndcdn.com'));
  } catch {
    return false;
  }
}

function updateDiscordPresence(track) {
  if (!settings.discordRpc || !settings.discordClientId) return;
  if (track === null) {
    lastPresenceKey = '';
    discordRpc.update(null);
    return;
  }
  if (!track || typeof track !== 'object' || Array.isArray(track) ||
      typeof track.title !== 'string' || typeof track.artist !== 'string' ||
      !isSoundCloudUrl(track.url) ||
      typeof track.paused !== 'boolean' ||
      !Number.isFinite(track.elapsed) || !Number.isFinite(track.duration) ||
      track.elapsed < 0 || track.duration < 0 || track.duration > 86400 ||
      track.elapsed > track.duration + 5) return;
  const title = track.title.trim().slice(0, 128);
  const artist = track.artist.trim().slice(0, 128);
  if (!title || !artist) return;
  const artwork = typeof track.artwork === 'string' && isArtworkUrl(track.artwork)
    ? track.artwork : null;
  const key = JSON.stringify([track.url, title, artist, artwork, track.paused]);
  if (key === lastPresenceKey && Date.now() - lastPresenceSent < 15000) return;
  lastPresenceKey = key;
  lastPresenceSent = Date.now();
  const activity = {
    type: 2,
    details: title,
    state: track.paused ? `${artist.slice(0, 116)} · пауза` : artist,
    assets: artwork ? { large_image: artwork, large_text: title } : {}
  };
  if (!track.paused && track.duration > 0) {
    activity.timestamps = {
      start: Math.floor(Date.now() / 1000 - track.elapsed),
      end: Math.floor(Date.now() / 1000 + track.duration - track.elapsed)
    };
  }
  discordRpc.update(activity);
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
  else if (process.env.APPIMAGE) packageType = 'AppImage';
  else {
    try { packageType = fs.readFileSync(path.join(process.resourcesPath, 'package-type'), 'utf8').trim(); }
    catch { /* An unpackaged build has no package identity. */ }
  }
  return { status: updateStatus, version: availableUpdateVersion, progress: updateProgress,
    error: updateError, ready: updateReady, packageType };
}

function publishUpdateState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('cusade:update-state', updateState());
  }
  refreshTrayMenu();
}

function showUpdatePanel() {
  if (!availableUpdateVersion) return;
  showMainWindow();
  const contents = mainWindow.webContents;
  const send = () => contents.send('cusade:show-update', updateState());
  if (contents.isLoading()) contents.once('did-finish-load', send);
  else send();
}

function refreshTrayMenu() {
  if (!tray) return;
  const updateAction = availableUpdateVersion
    ? { label: `Обновление ${availableUpdateVersion}${updateReady ? ' готово' : ''}`, click: showUpdatePanel }
    : null;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Открыть SoundCloud', click: showMainWindow },
    { type: 'separator' },
    ...(updateAction ? [updateAction] : []),
    { label: 'Проверить обновления', enabled: !!updater && !updateCheckRunning,
      click: () => checkForUpdates(true) },
    { type: 'separator' },
    { label: 'Выход', click: () => app.quit() }
  ]));
}

async function checkForUpdates(manual = false) {
  if (!updater || updateCheckRunning || updateDownloadRunning || updateReady) return;
  manualUpdateCheck = manual;
  updateCheckRunning = true;
  refreshTrayMenu();
  try {
    await updater.checkForUpdates();
  } catch (error) {
    console.error('Could not check for updates:', error);
    if (manual) showUpdateNotice('Не удалось проверить обновления. Попробуйте позже.');
  } finally {
    updateCheckRunning = false;
    manualUpdateCheck = false;
    refreshTrayMenu();
  }
}

async function runUpdateAction() {
  if (!updater || !availableUpdateVersion || updateDownloadRunning || updateStatus === 'installing') {
    return updateState();
  }
  if (updateReady) {
    updateStatus = 'installing';
    updateError = '';
    publishUpdateState();
    setImmediate(() => {
      try { updater.quitAndInstall(false, true); }
      catch (error) {
        console.error('Could not install update:', error);
        updateStatus = 'ready';
        updateError = 'Не удалось установить обновление. Попробуйте снова или откройте страницу релиза.';
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
  ({ autoUpdater: updater } = require('electron-updater'));
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
  refreshTrayMenu();
}

function createTray() {
  const icon = process.platform === 'win32'
    ? 'build/icon.ico' : 'build/icons/32x32.png';
  try {
    tray = new Tray(path.join(__dirname, icon));
    tray.setToolTip('SoundCloud Desktop');
    refreshTrayMenu();
    tray.on('click', showMainWindow);
  } catch (error) {
    console.error('Could not create tray icon:', error);
    tray = null;
  }
}

function createWindow(hidden = false) {
  mainWindow = new BrowserWindow({
    title: 'SoundCloud',
    icon: path.join(__dirname, 'build/icons/512x512.png'),
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#121216',
    autoHideMenuBar: true,
    show: !hidden || !tray,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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
    const dnsFailure = DNS_ERROR_CODES.has(code);
    const hint = code === -7
      ? 'Превышено время ожидания ответа от SoundCloud.'
      : dnsFailure
        ? 'Не удалось определить адрес SoundCloud. Если доступ к сайту ограничен сетью, смена DNS не поможет.'
        : 'Проверьте подключение к интернету и попробуйте ещё раз.';
    console.error(`Не удалось открыть SoundCloud (${code}: ${description}). DNS: ${DNS_SERVERS[dnsServerIndex].name}`);
    const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>SoundCloud</title>
      <style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#121216;color:#fff;font:16px system-ui}main{max-width:480px;padding:32px}h1{font-size:24px}p{color:#bbb;line-height:1.5}small{color:#888}a{display:inline-block;margin-top:12px;padding:12px 18px;border-radius:8px;background:#f50;color:#fff;text-decoration:none}</style>
      <main><h1>SoundCloud не загрузился</h1><p>${hint}</p><small>Код ошибки: ${code}</small><br><a href="${HOME_URL}">Повторить</a></main></html>`;
    contents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  }

  contents.on('did-start-navigation', details => {
    if (!details.isMainFrame || details.isSameDocument) return;
    if (settings.discordRpc) {
      lastPresenceKey = '';
      discordRpc.update(null);
    }
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

    if (DNS_ERROR_CODES.has(code) && dnsServerIndex < DNS_SERVERS.length - 1) {
      const nextIndex = dnsServerIndex + 1;
      try {
        configureDnsServer(nextIndex);
        await withTimeout(session.defaultSession.clearHostResolverCache(), DNS_CACHE_TIMEOUT_MS);
        if (failedLoadId === loadId && !contents.isDestroyed()) contents.loadURL(url);
        return;
      } catch (error) {
        console.error(`Не удалось переключить DNS на ${DNS_SERVERS[nextIndex].name}:`, error);
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
    if (isQuitting || !tray) return;
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on('closed', () => {
    clearLoadTimer();
    if (settings.discordRpc) discordRpc.update(null);
    mainWindow = null;
  });
}

const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();
pendingLaunchUrl = launchUrlFromArgs(process.argv);
app.on('second-instance', (_event, argv) => {
  const url = launchUrlFromArgs(argv);
  if (url) openSoundCloudUrl(url);
  else if (!argv.includes('--autostart')) showMainWindow();
});
app.on('open-url', (event, url) => {
  event.preventDefault();
  openSoundCloudUrl(launchUrl(url));
});
app.on('before-quit', () => {
  isQuitting = true;
  clearTimeout(initialUpdateTimer);
  clearInterval(updateTimer);
  clearTimeout(insightsSaveTimer);
  if (insightsDirty) {
    try { saveInsights(); }
    catch (error) { console.error('Could not save cusade Insights on exit:', error); }
  }
  discordRpc.stop();
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => app.quit());
}

if (hasInstanceLock) app.whenReady().then(() => {
  app.setAppUserModelId('io.github.sykia.soundcloud-desktop');
  configureDnsServer(0);

  loadSettings();
  loadInsights();
  if (settings.autoStart) {
    try { setAutoStart(true, settings.startMinimized); }
    catch (error) { console.error('Could not restore autostart:', error); }
  }
  if (settings.discordRpc && settings.discordClientId) {
    discordRpc.start(settings.discordClientId);
  }

  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['https://api-v2.soundcloud.com/audio-ads*'] },
    (details, callback) => {
      const isAudioAdRequest = details.method === 'GET' &&
        new URL(details.url).pathname === '/audio-ads';
      callback({ cancel: settings.blockAudioAds && isAudioAdRequest });
    }
  );

  ipcMain.handle('cusade:get-settings', event => {
    if (!isMainSoundCloudPage(event.sender)) throw new Error('Unavailable');
    return settings;
  });

  ipcMain.handle('cusade:run-update', event => {
    if (!isMainSoundCloudPage(event.sender)) throw new Error('Unavailable');
    return runUpdateAction();
  });

  ipcMain.handle('cusade:open-update-release', event => {
    if (!isMainSoundCloudPage(event.sender) || !availableUpdateVersion) throw new Error('Unavailable');
    return shell.openExternal(releaseUrl());
  });

  ipcMain.handle('cusade:get-insights', event => {
    if (!isMainSoundCloudPage(event.sender)) throw new Error('Unavailable');
    return insights.sessions;
  });

  ipcMain.handle('cusade:hide-insights', event => {
    if (!isMainSoundCloudPage(event.sender)) throw new Error('Unavailable');
    saveSettings({ ...settings, insightsHiddenUntil: Date.now() + 3 * 24 * 60 * 60 * 1000 });
    return settings.insightsHiddenUntil;
  });

  ipcMain.handle('cusade:show-insights', event => {
    if (!isMainSoundCloudPage(event.sender)) throw new Error('Unavailable');
    saveSettings({ ...settings, insightsHiddenUntil: 0 });
    return true;
  });

  ipcMain.handle('cusade:set-insights-layout', (event, layout) => {
    if (!isMainSoundCloudPage(event.sender) || !isInsightsLayout(layout)) {
      throw new Error('Invalid Insights layout');
    }
    saveSettings({ ...settings, insightsLayout: layout });
    return settings.insightsLayout;
  });

  ipcMain.handle('cusade:record-insight', (event, sample) => {
    if (!isMainSoundCloudPage(event.sender) || !validInsightSample(sample)) {
      throw new Error('Invalid listening sample');
    }
    let entry = lastInsightEntry?.id === sample.sessionId
      ? lastInsightEntry : insights.sessions.find(session => session.id === sample.sessionId);
    if (!entry) {
      entry = { id: sample.sessionId, title: sample.title, artist: sample.artist,
        url: sample.url, artwork: sample.artwork, startedAt: Date.now(),
        lastPlayedAt: Date.now(), seconds: 0 };
      insights.sessions.push(entry);
      if (insights.sessions.length > 20000) insights.sessions.shift();
    }
    if (entry.url !== sample.url) throw new Error('Session track mismatch');
    lastInsightEntry = entry;
    entry.seconds += sample.seconds;
    entry.lastPlayedAt = Date.now();
    scheduleInsightsSave();
    return true;
  });

  ipcMain.handle('cusade:export-insight-card', async (event, dataUrl, action) => {
    if (!isMainSoundCloudPage(event.sender) || !['save', 'copy'].includes(action) ||
        typeof dataUrl !== 'string' || dataUrl.length > 6_000_000 ||
        !dataUrl.startsWith('data:image/png;base64,')) throw new Error('Invalid image');
    const image = nativeImage.createFromDataURL(dataUrl);
    if (image.isEmpty() || image.getSize().width !== 1200 || image.getSize().height !== 630) {
      throw new Error('Invalid card size');
    }
    if (action === 'copy') {
      await clipboard.write([new ClipboardItem({
        'image/png': new Blob([image.toPNG()], { type: 'image/png' })
      })]);
      return true;
    }
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Сохранить карточку cusade Insights',
      defaultPath: `cusade-insights-${new Date().toISOString().slice(0, 10)}.png`,
      filters: [{ name: 'PNG', extensions: ['png'] }]
    });
    if (result.canceled || !result.filePath) return false;
    fs.writeFileSync(result.filePath, image.toPNG());
    return true;
  });

  ipcMain.handle('cusade:set-hide-artist-tools', (event, enabled) => {
    if (!isMainSoundCloudPage(event.sender) || typeof enabled !== 'boolean') {
      throw new Error('Invalid setting');
    }
    saveSettings({ ...settings, hideArtistTools: enabled });
    return settings;
  });

  ipcMain.handle('cusade:set-hide-nearby-events', (event, enabled) => {
    if (!isMainSoundCloudPage(event.sender) || typeof enabled !== 'boolean') {
      throw new Error('Invalid setting');
    }
    saveSettings({ ...settings, hideNearbyEvents: enabled });
    return settings;
  });

  ipcMain.handle('cusade:set-block-audio-ads', (event, enabled) => {
    if (!isMainSoundCloudPage(event.sender) || typeof enabled !== 'boolean') {
      throw new Error('Invalid setting');
    }
    saveSettings({ ...settings, blockAudioAds: enabled });
    return settings;
  });

  ipcMain.handle('cusade:set-discord-rpc', (event, enabled) => {
    if (!isMainSoundCloudPage(event.sender) || typeof enabled !== 'boolean') {
      throw new Error('Invalid setting');
    }
    saveSettings({ ...settings, discordRpc: enabled });
    lastPresenceKey = '';
    if (enabled) discordRpc.start(settings.discordClientId);
    else discordRpc.stop();
    return settings;
  });

  ipcMain.handle('cusade:set-discord-client-id', (event, clientId) => {
    if (!isMainSoundCloudPage(event.sender) ||
        !(clientId === '' || isDiscordClientId(clientId))) {
      throw new Error('Invalid Discord Application ID');
    }
    const selectedId = clientId || DEFAULT_DISCORD_CLIENT_ID;
    saveSettings({ ...settings, discordClientId: selectedId });
    lastPresenceKey = '';
    if (settings.discordRpc) discordRpc.start(selectedId);
    else discordRpc.stop();
    return settings;
  });

  ipcMain.on('cusade:playback-state', (event, track) => {
    if (isMainSoundCloudPage(event.sender)) updateDiscordPresence(track);
  });

  ipcMain.handle('cusade:set-auto-start', (event, enabled) => {
    if (!isMainSoundCloudPage(event.sender) || typeof enabled !== 'boolean') {
      throw new Error('Invalid setting');
    }
    setAutoStart(enabled, settings.startMinimized);
    saveSettings({ ...settings, autoStart: enabled });
    return settings;
  });

  ipcMain.handle('cusade:set-start-minimized', (event, enabled) => {
    if (!isMainSoundCloudPage(event.sender) || typeof enabled !== 'boolean') {
      throw new Error('Invalid setting');
    }
    if (settings.autoStart) setAutoStart(true, enabled);
    saveSettings({ ...settings, startMinimized: enabled });
    return settings;
  });

  ipcMain.handle('cusade:set-accent-color', (event, color) => {
    if (!isMainSoundCloudPage(event.sender) || !isHexColor(color)) {
      throw new Error('Invalid color');
    }
    saveSettings({ ...settings, accentColor: color.toLowerCase() });
    return settings;
  });

  ipcMain.handle('cusade:set-playback-visualization', (event, enabled) => {
    if (!isMainSoundCloudPage(event.sender) || typeof enabled !== 'boolean') {
      throw new Error('Invalid setting');
    }
    saveSettings({ ...settings, playbackVisualization: enabled });
    return settings;
  });

  ipcMain.handle('cusade:set-animations', (event, enabled) => {
    if (!isMainSoundCloudPage(event.sender) || typeof enabled !== 'boolean') {
      throw new Error('Invalid setting');
    }
    saveSettings({ ...settings, animations: enabled });
    return settings;
  });

  ipcMain.handle('cusade:set-show-your-likes-button', (event, enabled) => {
    if (!isMainSoundCloudPage(event.sender) || typeof enabled !== 'boolean') {
      throw new Error('Invalid setting');
    }
    saveSettings({ ...settings, showYourLikesButton: enabled });
    return settings;
  });

  ipcMain.handle('cusade:set-app-language', (event, language) => {
    if (!isMainSoundCloudPage(event.sender) || !['site', 'ru'].includes(language)) {
      throw new Error('Invalid language');
    }
    saveSettings({ ...settings, appLanguage: language });
    return settings;
  });

  ipcMain.handle('cusade:set-artwork-radius', (event, key, radius) => {
    if (!isMainSoundCloudPage(event.sender) ||
        !Object.hasOwn(DEFAULT_RADII, key) || !isArtworkRadius(radius)) {
      throw new Error('Invalid artwork radius');
    }
    saveSettings({ ...settings, [key]: radius });
    return settings;
  });

  ipcMain.handle('cusade:capture-page', async event => {
    if (!isMainSoundCloudPage(event.sender)) throw new Error('Unavailable');
    return (await mainWindow.capturePage()).toDataURL();
  });

  ipcMain.on('cusade:logo-context-menu', event => {
    if (!isMainSoundCloudPage(event.sender)) return;

    Menu.buildFromTemplate([{
      label: 'cusade',
      click: () => mainWindow?.webContents.send('cusade:toggle-panel')
    }]).popup({ window: mainWindow });
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Навигация',
      submenu: [
        { label: 'Назад', accelerator: 'Alt+Left', click: () => {
          if (mainWindow?.webContents.navigationHistory.canGoBack()) {
            mainWindow.webContents.navigationHistory.goBack();
          }
        } },
        { label: 'Вперёд', accelerator: 'Alt+Right', click: () => {
          if (mainWindow?.webContents.navigationHistory.canGoForward()) {
            mainWindow.webContents.navigationHistory.goForward();
          }
        } },
        { label: 'Обновить', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.webContents.reload() },
        { label: 'На главную', accelerator: 'CmdOrCtrl+Home', click: () => mainWindow?.loadURL(HOME_URL) },
        { type: 'separator' },
        { role: 'quit', label: 'Выход' }
      ]
    }
  ]));

  createTray();
  createWindow(process.argv.includes('--autostart') &&
    process.argv.includes('--minimized') && !pendingLaunchUrl);
  setupUpdates();
  app.on('activate', () => {
    showMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
