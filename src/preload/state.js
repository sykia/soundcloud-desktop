'use strict';

// Mutable runtime state, shared by every preload module. Only settings values
// and short-lived UI flags live here; DOM host references live in hosts.js and
// per-feature module-local state stays inside its owning module.

const {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_DISCORD_CLIENT_ID,
  DEFAULT_RADII,
  DEFAULT_INSIGHTS_LAYOUT
} = require('../../shared/constants.js');

const state = {
  hideArtistTools: false,
  hideNearbyEvents: false,
  blockAudioAds: false,
  discordRpc: false,
  discordClientId: DEFAULT_DISCORD_CLIENT_ID,
  autoStart: false,
  startMinimized: false,
  accentColor: DEFAULT_ACCENT_COLOR,
  savedAccentColor: DEFAULT_ACCENT_COLOR,
  playbackVisualization: false,
  animations: false,
  respectSystemMotion: false,
  settingsLoaded: false,
  showYourLikesButton: true,
  showTransferButton: true,
  artworkRadii: { ...DEFAULT_RADII },
  savedArtworkRadii: { ...DEFAULT_RADII },
  appLanguage: 'site',
  languageSavePending: false,
  insightsHiddenUntil: 0,
  // Observed on every use, not cached at load: the panel can change it while the app runs.
  insightsLayout: { ...DEFAULT_INSIGHTS_LAYOUT },
  // Current page family. The Russian dictionary needs it because a few labels
  // mean one thing in the player and another in a page of their own, and the
  // animations need it to know where they may apply.
  pageScope: ''
};

module.exports = { state };
