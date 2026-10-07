'use strict';

// Every IPC channel the preload speaks over. All handlers keep the original
// guards: the sender must be the main SoundCloud page, and every setting value
// is validated before it is saved. Generic boolean/string setters are generated
// per key, and the channels with side effects (Discord, autostart, Insights
// layout, artwork radii) keep their dedicated blocks below.

const fs = require('node:fs');
const { ipcMain, shell, dialog, clipboard, ClipboardItem, nativeImage, Menu } = require('electron');
const { CHANNEL } = require('../../shared/ipc.js');
const { DEFAULT_RADII, DEFAULT_DISCORD_CLIENT_ID } = require('../../shared/constants.js');
const { isHexColor, isArtworkRadius, isInsightsLayout, isDiscordClientId } =
  require('../../shared/settings-schema.js');
const { getSettings, saveSettings } = require('./settings.js');
const { isMainSoundCloudPage, getMainWindow, sendToRenderer } = require('./window.js');
const discord = require('./discord.js');
const updates = require('./updates.js');
const insightsStore = require('./insights-store.js');
const { setAutoStart } = require('./autostart.js');
const { resolveImportUrl } = require('./resolve-import.js');

const BOOLEAN_KEYS = [
  'hideArtistTools',
  'hideNearbyEvents',
  'blockAudioAds',
  'playbackVisualization',
  'animations',
  'respectSystemMotion',
  'showYourLikesButton',
  'showTransferButton'
];

function register() {
  ipcMain.handle(CHANNEL.getSettings, event => {
    if (!isMainSoundCloudPage(event.sender)) throw new Error('Unavailable');
    return getSettings();
  });

  ipcMain.handle(CHANNEL.resolveImportUrl, (event, url) => {
    if (!isMainSoundCloudPage(event.sender)) throw new Error('Unavailable');
    return resolveImportUrl(url);
  });

  ipcMain.handle(CHANNEL.runUpdate, event => {
    if (!isMainSoundCloudPage(event.sender)) throw new Error('Unavailable');
    return updates.runUpdateAction();
  });

  ipcMain.handle(CHANNEL.openUpdateRelease, event => {
    if (!isMainSoundCloudPage(event.sender) || !updates.getAvailableVersion()) throw new Error('Unavailable');
    return shell.openExternal(updates.releaseUrl());
  });

  ipcMain.handle(CHANNEL.getInsights, event => {
    if (!isMainSoundCloudPage(event.sender)) throw new Error('Unavailable');
    return insightsStore.getSessions();
  });

  ipcMain.handle(CHANNEL.hideInsights, event => {
    if (!isMainSoundCloudPage(event.sender)) throw new Error('Unavailable');
    saveSettings({ ...getSettings(), insightsHiddenUntil: Date.now() + 3 * 24 * 60 * 60 * 1000 });
    return getSettings().insightsHiddenUntil;
  });

  ipcMain.handle(CHANNEL.showInsights, event => {
    if (!isMainSoundCloudPage(event.sender)) throw new Error('Unavailable');
    saveSettings({ ...getSettings(), insightsHiddenUntil: 0 });
    return true;
  });

  ipcMain.handle(CHANNEL.setInsightsLayout, (event, layout) => {
    if (!isMainSoundCloudPage(event.sender) || !isInsightsLayout(layout)) {
      throw new Error('Invalid Insights layout');
    }
    saveSettings({ ...getSettings(), insightsLayout: layout });
    return getSettings().insightsLayout;
  });

  ipcMain.handle(CHANNEL.recordInsight, (event, sample) => {
    if (!isMainSoundCloudPage(event.sender) || !insightsStore.validInsightSample(sample)) {
      throw new Error('Invalid listening sample');
    }
    return insightsStore.recordInsight(sample);
  });

  ipcMain.handle(CHANNEL.exportInsightCard, async (event, dataUrl, action) => {
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
    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Сохранить карточку cusade Insights',
      defaultPath: `cusade-insights-${new Date().toISOString().slice(0, 10)}.png`,
      filters: [{ name: 'PNG', extensions: ['png'] }]
    });
    if (result.canceled || !result.filePath) return false;
    fs.writeFileSync(result.filePath, image.toPNG());
    return true;
  });

  for (const key of BOOLEAN_KEYS) {
    ipcMain.handle(CHANNEL.set(key), (event, enabled) => {
      if (!isMainSoundCloudPage(event.sender) || typeof enabled !== 'boolean') {
        throw new Error('Invalid setting');
      }
      saveSettings({ ...getSettings(), [key]: enabled });
      return getSettings();
    });
  }

  ipcMain.handle(CHANNEL.set('discordRpc'), (event, enabled) => {
    if (!isMainSoundCloudPage(event.sender) || typeof enabled !== 'boolean') {
      throw new Error('Invalid setting');
    }
    saveSettings({ ...getSettings(), discordRpc: enabled });
    discord.resetPresenceKey();
    if (enabled) discord.startRpc(getSettings().discordClientId);
    else discord.stopRpc();
    return getSettings();
  });

  ipcMain.handle(CHANNEL.set('discordClientId'), (event, clientId) => {
    if (!isMainSoundCloudPage(event.sender) ||
        !(clientId === '' || isDiscordClientId(clientId))) {
      throw new Error('Invalid Discord Application ID');
    }
    const selectedId = clientId || DEFAULT_DISCORD_CLIENT_ID;
    saveSettings({ ...getSettings(), discordClientId: selectedId });
    discord.resetPresenceKey();
    if (getSettings().discordRpc) discord.startRpc(selectedId);
    else discord.stopRpc();
    return getSettings();
  });

  ipcMain.on(CHANNEL.playbackState, (event, track) => {
    if (isMainSoundCloudPage(event.sender)) discord.updateDiscordPresence(track);
  });

  ipcMain.handle(CHANNEL.set('autoStart'), (event, enabled) => {
    if (!isMainSoundCloudPage(event.sender) || typeof enabled !== 'boolean') {
      throw new Error('Invalid setting');
    }
    setAutoStart(enabled, getSettings().startMinimized);
    saveSettings({ ...getSettings(), autoStart: enabled });
    return getSettings();
  });

  ipcMain.handle(CHANNEL.set('startMinimized'), (event, enabled) => {
    if (!isMainSoundCloudPage(event.sender) || typeof enabled !== 'boolean') {
      throw new Error('Invalid setting');
    }
    if (getSettings().autoStart) setAutoStart(true, enabled);
    saveSettings({ ...getSettings(), startMinimized: enabled });
    return getSettings();
  });

  ipcMain.handle(CHANNEL.set('accentColor'), (event, color) => {
    if (!isMainSoundCloudPage(event.sender) || !isHexColor(color)) {
      throw new Error('Invalid color');
    }
    saveSettings({ ...getSettings(), accentColor: color.toLowerCase() });
    return getSettings();
  });

  ipcMain.handle(CHANNEL.set('appLanguage'), (event, language) => {
    if (!isMainSoundCloudPage(event.sender) || !['site', 'ru'].includes(language)) {
      throw new Error('Invalid language');
    }
    saveSettings({ ...getSettings(), appLanguage: language });
    return getSettings();
  });

  ipcMain.handle(CHANNEL.setArtworkRadius, (event, key, radius) => {
    if (!isMainSoundCloudPage(event.sender) ||
        !Object.hasOwn(DEFAULT_RADII, key) || !isArtworkRadius(radius)) {
      throw new Error('Invalid artwork radius');
    }
    saveSettings({ ...getSettings(), [key]: radius });
    return getSettings();
  });

  ipcMain.handle(CHANNEL.capturePage, async event => {
    if (!isMainSoundCloudPage(event.sender)) throw new Error('Unavailable');
    return (await getMainWindow().capturePage()).toDataURL();
  });

  ipcMain.on(CHANNEL.logoContextMenu, event => {
    if (!isMainSoundCloudPage(event.sender)) return;

    Menu.buildFromTemplate([{
      label: 'cusade',
      click: () => sendToRenderer(CHANNEL.togglePanel)
    }]).popup({ window: getMainWindow() });
  });
}

module.exports = { register };
