'use strict';

const kebab = key => key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);

// Every channel the preload speaks over with the main process. Setting setters
// follow the generated pattern `cusade:set-${kebab-case-key}`, so the preload
// uses CHANNEL.set('hideArtistTools') and the main process registers handlers
// for the same names.
const CHANNEL = {
  getSettings: 'cusade:get-settings',
  playbackState: 'cusade:playback-state',
  capturePage: 'cusade:capture-page',
  togglePanel: 'cusade:toggle-panel',
  updateState: 'cusade:update-state',
  showUpdate: 'cusade:show-update',
  logoContextMenu: 'cusade:logo-context-menu',
  runUpdate: 'cusade:run-update',
  openUpdateRelease: 'cusade:open-update-release',
  getInsights: 'cusade:get-insights',
  hideInsights: 'cusade:hide-insights',
  showInsights: 'cusade:show-insights',
  setInsightsLayout: 'cusade:set-insights-layout',
  recordInsight: 'cusade:record-insight',
  exportInsightCard: 'cusade:export-insight-card',
  setArtworkRadius: 'cusade:set-artwork-radius',
  set(key) {
    return `cusade:set-${kebab(key)}`;
  }
};

module.exports = { CHANNEL, kebab };