'use strict';

const path = require('node:path');
const { getSettings } = require('./settings.js');

function iconPath(size = 'window') {
  const dark = getSettings().appIconStyle === 'dark';
  const name = process.platform === 'win32'
    ? (dark ? 'build/icon-styles/dark.ico' : 'build/icon.ico')
    : (dark ? `build/icon-styles/dark-${size === 'tray' ? 32 : 512}.png`
      : `build/icons/${size === 'tray' ? '32x32' : '512x512'}.png`);
  return path.join(__dirname, '../..', name);
}

module.exports = { iconPath };
