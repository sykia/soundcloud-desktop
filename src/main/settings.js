'use strict';

// Settings state and persistence for the main process. `settings` is a live
// object: loadSettings() fills it from disk during startup, every IPC setter
// replaces it through saveSettings(), and everything else reads the same object
// through getSettings() so the values are never stale. Validation and the
// default table live in shared/settings-schema.js — the single source of truth
// — so the main side and the preload bundle can never drift apart.

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { coerceSettings, defaultSettings } = require('../../shared/settings-schema.js');

let settings = defaultSettings();

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function getSettings() {
  return settings;
}

function loadSettings() {
  try {
    settings = coerceSettings(JSON.parse(fs.readFileSync(settingsPath(), 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not load cusade settings:', error);
  }
}

function saveSettings(nextSettings) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(nextSettings, null, 2));
  settings = nextSettings;
}

module.exports = { getSettings, loadSettings, saveSettings, settingsPath };