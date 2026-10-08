'use strict';


// Preload entry: wires every feature module together and reproduces the boot
// sequence of the original single-file preload.js (style injection, page scope,
// settings load, heartbeat intervals, IPC listeners and document-level
// listeners). Nothing in this module renders UI on its own.

const { ipcRenderer } = require('electron');
const { CHANNEL } = require('../../shared/ipc.js');
const { state } = require('./state.js');
const { chooseSourceLanguage } = require('./source-language.js');
const { hosts } = require('./hosts.js');

const { inject } = require('./styles.js');
const {
  applyArtistToolsVisibility,
  applyNearbyEventsVisibility,
  applyAccentColor,
  applyArtworkRadii,
  updatePanelColor,
  updateArtworkRadiusControls
} = require('./appearance.js');
const { syncPageScope } = require('./page-scope.js');
const { applyMotion, setMotionHooks } = require('./motion.js');
const { updateEnterWatcher } = require('./enter.js');
const { updateRouteTransition, setIntroPending } = require('./route.js');
const {
  updatePanelToggle,
  updateNearbyEventsToggle,
  updateAudioAdsToggle,
  updateDiscordControls,
  updateAutoStartControls,
  updateVisualizationToggle,
  updateAnimationsToggle,
  updateRespectSystemMotionToggle,
  updateYourLikesToggle,
  updateAppIconStyle,
  updateSystemMotionHint,
  closePanel,
  togglePanel
} = require('./panel.js');
const {
  syncPlaybackVisualization,
  syncPlaybackTheme,
  syncVisiblePlayback,
  finishPlaybackSwitch
} = require('./visualization.js');
const { syncHomeLikesButton } = require('./likes.js');
const { startDownloads } = require('./downloads.js');
const {
  syncInsightsBanner,
  syncInsightsPlayback,
  syncVisiblePage,
  placeInsights,
  updateInsightsRestoreControl
} = require('./insights.js');
const { syncDiscordPresence } = require('./presence.js');
const {
  renderUpdatePanel,
  showUpdatePanel,
  setCurrentUpdateState
} = require('./updates-ui.js');
const {
  updateLocalizationWatcher,
  scheduleLocalization,
  restoreSiteLanguage,
  refreshLocalizedUi,
  auditLocalization
} = require('./localization.js');
const { loadSettings, onSettingsLoaded } = require('./settings.js');

function documentSourceLanguage() {
  const language = document.documentElement.lang.toLowerCase().split('-')[0];
  return ['en', 'it', 'es'].includes(language) ? language : null;
}

let cookieSourceLanguage = 'en';
function syncSourceLanguage(fallback) {
  if (['en', 'it', 'es'].includes(fallback)) cookieSourceLanguage = fallback;
  const language = chooseSourceLanguage(documentSourceLanguage(), cookieSourceLanguage);
  if (state.sourceLanguage === language) return;
  if (state.appLanguage === 'ru') restoreSiteLanguage();
  state.sourceLanguage = language;
  scheduleLocalization(true);
}

// Motion hooks: the feature modules stay acyclic by never importing each other
// through motion, so the wire-up happens here, before any applyMotion() runs.
setMotionHooks({ finishPlaybackSwitch, updateEnterWatcher, updateRouteTransition, updateSystemMotionHint });

// Settings-loaded hooks, in the exact order of the original initializeSettings
// `.then` body. routeIntroPending keeps the startup veil out of any deliberate
// toggle, exactly like the original flag did.
onSettingsLoaded.add(() => {
  applyArtistToolsVisibility();
  applyNearbyEventsVisibility();
  applyAccentColor();
  applyArtworkRadii();
  setIntroPending(true);
  applyMotion();
  setIntroPending(false);
  updatePanelToggle();
  updateNearbyEventsToggle();
  updateAudioAdsToggle();
  updateDiscordControls();
  updateAutoStartControls();
  updateVisualizationToggle();
  updateAnimationsToggle();
  updateRespectSystemMotionToggle();
  updateYourLikesToggle();
  updateAppIconStyle();
  updatePanelColor();
  updateArtworkRadiusControls();
  syncPlaybackVisualization();
  syncHomeLikesButton();
  syncInsightsBanner();
  syncPlaybackTheme();
  if (hosts.insightsBanner?.isConnected) placeInsights();
  updateInsightsRestoreControl();
  syncDiscordPresence();
  refreshLocalizedUi();
});
onSettingsLoaded.add(() => {
  scheduleLocalization();
  ipcRenderer.invoke(CHANNEL.getSiteLocale).then(language => {
    syncSourceLanguage(language);
  }).catch(error => console.error('Could not read SoundCloud language:', error));
  // SoundCloud keeps rendering part of the shell for a few seconds after the
  // settings arrive. The observer only revisits nodes that change, so a static
  // subtree rendered inside that window would stay in the site language for
  // good. A few bounded full rescans pick it up; translatedText makes a rescan
  // idempotent, and an already scheduled rAF simply runs it.
  for (const delay of [2000, 6000, 15000]) {
    setTimeout(() => {
      if (state.appLanguage !== 'ru') return;
      scheduleLocalization(true);
    }, delay);
  }
});

// Background keep-alive: playback insight flushing, visualization refresh,
// page-visible resync and Discord presence, on the original intervals.
setInterval(() => {
  syncInsightsPlayback();
  syncVisiblePlayback();
}, 1000);
setInterval(syncVisiblePage, 2500);
setInterval(() => {
  syncDiscordPresence();
}, 5000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    syncVisiblePage();
    syncVisiblePlayback();
    syncDiscordPresence();
  }
});

// Main-process IPC. togglePanel/renderUpdatePanel/showUpdatePanel keep their
// original semantics; setCurrentUpdateState owns the module-local update state.
ipcRenderer.on(CHANNEL.togglePanel, togglePanel);
ipcRenderer.on(CHANNEL.updateState, (_event, value) => {
  setCurrentUpdateState(value);
  renderUpdatePanel();
});
ipcRenderer.on(CHANNEL.showUpdate, (_event, value) => showUpdatePanel(value));
ipcRenderer.on(CHANNEL.siteLocale, (_event, language) => {
  syncSourceLanguage(language);
});
ipcRenderer.on(CHANNEL.localizationCaptureBegin, () => {
  state.localizationCapturePaused = true;
  restoreSiteLanguage();
  updateLocalizationWatcher();
});
ipcRenderer.on(CHANNEL.localizationCaptureEnd, () => {
  state.localizationCapturePaused = false;
  updateLocalizationWatcher();
  scheduleLocalization(true);
});
ipcRenderer.on(CHANNEL.localizationAuditRequest, (_event, nonce) => {
  ipcRenderer.send(CHANNEL.localizationAuditResponse, nonce, auditLocalization());
});

document.addEventListener('pointerdown', event => {
  if (hosts.panelHost && !hosts.panelHost.contains(event.target)) closePanel();
}, true);

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closePanel();
}, true);

document.addEventListener('contextmenu', event => {
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  if (!target?.closest('a.header__logoLink')) return;

  event.preventDefault();
  ipcRenderer.send(CHANNEL.logoContextMenu);
}, true);

// Boot, deferred to DOMContentLoaded when the preload runs before the document
// is ready — the same timing guard the original initializeSettings() used.
function boot() {
  syncSourceLanguage();
  new MutationObserver(() => syncSourceLanguage()).observe(document.documentElement,
    { attributes: true, attributeFilter: ['lang'] });
  inject();
  startDownloads();
  updateLocalizationWatcher();
  syncPageScope();
  scheduleLocalization();
  loadSettings();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
