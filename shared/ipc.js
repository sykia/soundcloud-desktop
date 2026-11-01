'use strict';

const kebab = key => key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);

// Every channel the preload speaks over with the main process. Setting setters
// follow the generated pattern `cusade:set-${kebab-case-key}`, so the preload
// uses CHANNEL.set('hideArtistTools') and the main process registers handlers
// for the same names.
const CHANNEL = {
  getSettings: 'cusade:get-settings',
  getSiteLocale: 'cusade:get-site-locale',
  siteLocale: 'cusade:site-locale',
  siteNavigation: 'cusade:site-navigation',
  windowActive: 'cusade:window-active',
  getWindowActive: 'cusade:get-window-active',
  translateLabels: 'cusade:translate-labels',
  localizationCaptureBegin: 'cusade:localization-capture-begin',
  localizationCaptureEnd: 'cusade:localization-capture-end',
  localizationAuditRequest: 'cusade:localization-audit-request',
  localizationAuditResponse: 'cusade:localization-audit-response',
  playbackState: 'cusade:playback-state',
  capturePage: 'cusade:capture-page',
  togglePanel: 'cusade:toggle-panel',
  updateState: 'cusade:update-state',
  showUpdate: 'cusade:show-update',
  logoContextMenu: 'cusade:logo-context-menu',
  runUpdate: 'cusade:run-update',
  checkUpdates: 'cusade:check-updates',
  getUpdateState: 'cusade:get-update-state',
  openUpdateRelease: 'cusade:open-update-release',
  getInsights: 'cusade:get-insights',
  hideInsights: 'cusade:hide-insights',
  showInsights: 'cusade:show-insights',
  setInsightsLayout: 'cusade:set-insights-layout',
  recordInsight: 'cusade:record-insight',
  exportInsightCard: 'cusade:export-insight-card',
  downloadTrack: 'cusade:download-track',
  setArtworkRadius: 'cusade:set-artwork-radius',
  // Network connection control. Guarded to the main SoundCloud page or the
  // local network error screen the main process itself loaded — never to an
  // arbitrary remote page.
  networkGet: 'cusade:network:get',
  networkApply: 'cusade:network:apply',
  networkTest: 'cusade:network:test',
  networkReset: 'cusade:network:reset',
  networkReport: 'cusade:network:report',
  set(key) {
    return `cusade:set-${kebab(key)}`;
  }
};

module.exports = { CHANNEL, kebab };
