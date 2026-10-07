'use strict';

// Autostart via Windows login items or an XDG autostart desktop entry. The
// desktop entry is written with a quoting rule that matches the freedesktop
// Exec spec (a backslash, double quote, backtick or dollar sign inside an
// argument is escaped with a backslash, and a literal % must be doubled).

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { AUTOSTART_FILE } = require('../../shared/constants.js');

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

module.exports = { setAutoStart };