'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app, shell } = require('electron');
const { getSettings } = require('./settings.js');
const APP_ID = 'io.github.sykia.soundcloud-desktop';

function iconPath(size = 'window') {
  const dark = getSettings().appIconStyle === 'dark';
  const name = size === 'shell' && process.platform === 'win32'
    ? (dark ? 'build/icon-styles/dark.ico' : 'build/icon.ico')
    : (dark ? `build/icon-styles/dark-${size === 'tray' ? 32 : 512}.png`
      : `build/icons/${size === 'tray' ? '32x32' : '512x512'}.png`);
  return path.join(__dirname, '../..', name);
}

// Shells cannot reliably load icons inside app.asar. Keep a stable, real file
// per style outside the archive (also avoids stale icon caches on Windows).
function shellIconPath() {
  const directory = path.join(app.getPath('userData'), 'app-icons');
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, `${getSettings().appIconStyle}.${process.platform === 'win32' ? 'ico' : 'png'}`);
  fs.copyFileSync(iconPath('shell'), target);
  return target;
}

function refreshDesktopIcon() {
  if (process.platform === 'win32') {
    const appData = app.getPath('appData');
    const directories = [app.getPath('desktop'),
      path.join(appData, 'Microsoft/Windows/Start Menu/Programs'),
      path.join(appData, 'Microsoft/Internet Explorer/Quick Launch/User Pinned/TaskBar')];
    for (const directory of directories) {
      const shortcut = path.join(directory, 'SoundCloud Desktop.lnk');
      if (!fs.existsSync(shortcut)) continue;
      const details = shell.readShortcutLink(shortcut);
      // Development and installed copies share the same taskbar group. Its
      // pinned shortcut can point at the installed copy while npm start runs.
      const sameApp = details.appUserModelId === APP_ID ||
        (app.isPackaged && path.resolve(details.target).toLowerCase() === path.resolve(process.execPath).toLowerCase());
      if (!sameApp) continue;
      if (!shell.writeShortcutLink(shortcut, 'update', { icon: shellIconPath(), iconIndex: 0 })) {
        throw new Error('Не удалось обновить значок ярлыка SoundCloud Desktop.');
      }
    }
  }
  if (process.platform !== 'linux' || !app.isPackaged) return;
  const name = 'io.github.sykia.soundcloud-desktop.desktop';
  const dataHome = process.env.XDG_DATA_HOME || path.join(app.getPath('home'), '.local', 'share');
  const directories = [dataHome, ...(process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':')];
  const source = directories.map(dir => path.join(dir, 'applications', name)).find(file => fs.existsSync(file));
  if (!source) return;
  const contents = fs.readFileSync(source, 'utf8');
  // Only replace the main entry's icon, leaving desktop actions untouched.
  const updated = contents.replace(/(\[Desktop Entry\][\s\S]*?)(?=\n\[|$)/, block => {
    const icon = `Icon=${shellIconPath()}`;
    return /^Icon=.*$/m.test(block) ? block.replace(/^Icon=.*$/m, icon) : `${block.trimEnd()}\n${icon}\n`;
  });
  const destination = path.join(dataHome, 'applications', name);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, updated);
}

module.exports = { APP_ID, iconPath, shellIconPath, refreshDesktopIcon };
