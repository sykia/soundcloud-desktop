'use strict';

// Values shared by the main process and the preload bundle. Keep this file free
// of require() dependencies so any module on either side can use it.

const HOME_URL = 'https://soundcloud.com/';
const PROTOCOL = 'soundcloud-desktop';
const AUTOSTART_FILE = 'io.github.sykia.soundcloud-desktop.desktop';

const DEFAULT_ACCENT_COLOR = '#ff5500';
const DEFAULT_DISCORD_CLIENT_ID = '1555593977367887893';
const DEFAULT_RADII = { avatarRadius: 50, trackRadius: 3, albumRadius: 3 };
const DEFAULT_INSIGHTS_LAYOUT = { location: 'sidebar', index: 0, width: 0, height: 0 };

module.exports = {
  HOME_URL,
  PROTOCOL,
  AUTOSTART_FILE,
  DEFAULT_ACCENT_COLOR,
  DEFAULT_DISCORD_CLIENT_ID,
  DEFAULT_RADII,
  DEFAULT_INSIGHTS_LAYOUT
};