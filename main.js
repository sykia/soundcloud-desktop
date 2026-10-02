const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');

const HOME_URL = 'https://soundcloud.com/';
const DEFAULT_ACCENT_COLOR = '#ff5500';
const DEFAULT_RADII = { avatarRadius: 50, trackRadius: 3, albumRadius: 3 };
let mainWindow;
let settings = {
  hideArtistTools: false,
  accentColor: DEFAULT_ACCENT_COLOR,
  playbackVisualization: false,
  showYourLikesButton: true,
  appLanguage: 'site',
  ...DEFAULT_RADII
};

function isHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

function isArtworkRadius(value) {
  return Number.isInteger(value) && value >= 0 && value <= 50;
}

function isMainSoundCloudPage(contents) {
  return mainWindow && contents === mainWindow.webContents && isSoundCloudUrl(contents.getURL());
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    settings.hideArtistTools = saved.hideArtistTools === true;
    settings.playbackVisualization = saved.playbackVisualization === true;
    settings.showYourLikesButton = saved.showYourLikesButton !== false;
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

// Some system DNS providers return an unreachable address for SoundCloud.
// Resolve through HTTPS so the app can reach the actual site.
app.disableHardwareAcceleration();

function isSoundCloudUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      (url.hostname === 'soundcloud.com' || url.hostname.endsWith('.soundcloud.com'));
  } catch {
    return false;
  }
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
    if (new URL(value).protocol === 'https:') shell.openExternal(value);
  } catch {
    // Ignore malformed links from the website.
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'SoundCloud',
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#121216',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  const contents = mainWindow.webContents;

  contents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;

    const message = `Не удалось открыть SoundCloud (${code}: ${description}).`;
    console.error(`${message} ${url}`);
    const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>SoundCloud</title>
      <style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#121216;color:#fff;font:16px system-ui}main{max-width:480px;padding:32px}h1{font-size:24px}p{color:#bbb;line-height:1.5}a{display:inline-block;margin-top:12px;padding:12px 18px;border-radius:8px;background:#f50;color:#fff;text-decoration:none}</style>
      <main><h1>SoundCloud не загрузился</h1><p>Проверьте подключение к интернету и попробуйте ещё раз.</p><a href="${HOME_URL}">Повторить</a></main></html>`;
    contents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
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

  mainWindow.loadURL(HOME_URL);
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  app.configureHostResolver({
    secureDnsMode: 'secure',
    secureDnsServers: ['https://dns.google/dns-query']
  });

  loadSettings();

  ipcMain.handle('cusade:get-settings', event => {
    if (!isMainSoundCloudPage(event.sender)) throw new Error('Unavailable');
    return settings;
  });

  ipcMain.handle('cusade:set-hide-artist-tools', (event, enabled) => {
    if (!isMainSoundCloudPage(event.sender) || typeof enabled !== 'boolean') {
      throw new Error('Invalid setting');
    }
    saveSettings({ ...settings, hideArtistTools: enabled });
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

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
