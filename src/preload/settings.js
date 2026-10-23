'use strict';

// Loads settings.json through the main process, coerces the untrusted values
// with the shared schema and mirrors them into the shared state object, then
// runs every registered hook once. Modules register their post-load sync
// callbacks through onSettingsLoaded; src/preload/index.js wires the exact boot
// order the original single file used.

const { ipcRenderer } = require('electron');
const { CHANNEL } = require('../../shared/ipc.js');
const { coerceSettings } = require('../../shared/settings-schema.js');
const { state } = require('./state.js');

const onSettingsLoaded = new Set();

function loadSettings() {
  ipcRenderer.invoke(CHANNEL.getSettings).then(saved => {
    const settings = coerceSettings(saved);
    state.companionPosition = { ...settings.companionPosition };
    state.companionEnabled = settings.companionEnabled;
    state.companionSounds = settings.companionSounds;
    state.hideArtistTools = settings.hideArtistTools;
    state.hideNearbyEvents = settings.hideNearbyEvents;
    state.blockAudioAds = settings.blockAudioAds;
    state.discordRpc = settings.discordRpc;
    state.discordClientId = settings.discordClientId;
    state.autoStart = settings.autoStart;
    state.startMinimized = settings.startMinimized;
    state.playbackVisualization = settings.playbackVisualization;
    state.animations = settings.animations;
    state.respectSystemMotion = settings.respectSystemMotion;
    state.showYourLikesButton = settings.showYourLikesButton;
    state.insightsHiddenUntil = settings.insightsHiddenUntil;
    state.insightsLayout = { ...settings.insightsLayout };
    state.appLanguage = settings.appLanguage;
    state.appIconStyle = settings.appIconStyle;
    state.panelTheme = settings.panelTheme;
    const panel = require('./hosts.js').hosts.panelHost;
    if (panel) {
      panel.dataset.theme = state.panelTheme;
      const control = panel.shadowRoot.getElementById('panel-theme');
      if (control) { control.value = state.panelTheme; control.disabled = false; }
    }
    state.artworkRadii = {
      avatarRadius: settings.avatarRadius,
      trackRadius: settings.trackRadius,
      albumRadius: settings.albumRadius
    };
    state.accentColor = settings.accentColor;
    state.savedArtworkRadii = { ...state.artworkRadii };
    state.savedAccentColor = state.accentColor;
    state.settingsLoaded = true;
    for (const hook of onSettingsLoaded) {
      try { hook(); } catch (error) { console.error('cusade settings hook failed:', error); }
    }
  }).catch(error => console.error('Could not load cusade settings:', error));
}

module.exports = { onSettingsLoaded, loadSettings };
