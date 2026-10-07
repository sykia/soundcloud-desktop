'use strict';

// The single source of truth for cusade settings: default values, validators and
// the coercion rules used when settings.json is loaded. The main process uses
// this table to load, validate and save settings; the preload bundle uses it to
// mirror the same values without duplicating the rules. Add a new setting here,
// wire its control in src/preload/panel.js and (if it needs main-side effects)
// its effect in src/main/ipc.js — the IPC setter is generated from this table.

const {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_DISCORD_CLIENT_ID,
  DEFAULT_RADII,
  DEFAULT_INSIGHTS_LAYOUT
} = require('./constants.js');

const isBoolean = value => typeof value === 'boolean';
const isHexColor = value => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
const isArtworkRadius = value => Number.isInteger(value) && value >= 0 && value <= 50;
const isInsightsLayout = value =>
  value && typeof value === 'object' &&
  ['sidebar', 'main', 'feed'].includes(value.location) &&
  Number.isInteger(value.index) && value.index >= 0 && value.index <= 100 &&
  Number.isInteger(value.width) && (value.width === 0 || (value.width >= 240 && value.width <= 900)) &&
  Number.isInteger(value.height) && (value.height === 0 || (value.height >= 120 && value.height <= 800));
const isDiscordClientId = value => typeof value === 'string' && /^\d{17,20}$/.test(value);
const isAppLanguage = value => value === 'site' || value === 'ru';

const ARTWORK_RADIUS_KEYS = Object.freeze(['avatarRadius', 'trackRadius', 'albumRadius']);

const SETTINGS = {
  hideArtistTools: { default: false, validate: isBoolean, coerce: value => value === true },
  hideNearbyEvents: { default: false, validate: isBoolean, coerce: value => value === true },
  blockAudioAds: { default: false, validate: isBoolean, coerce: value => value === true },
  discordRpc: { default: false, validate: isBoolean, coerce: value => value === true },
  discordClientId: {
    default: DEFAULT_DISCORD_CLIENT_ID,
    validate: isDiscordClientId,
    coerce: value => isDiscordClientId(value) ? value : DEFAULT_DISCORD_CLIENT_ID
  },
  autoStart: { default: false, validate: isBoolean, coerce: value => value === true },
  startMinimized: { default: false, validate: isBoolean, coerce: value => value === true },
  accentColor: {
    default: DEFAULT_ACCENT_COLOR,
    validate: isHexColor,
    coerce: value => isHexColor(value) ? value.toLowerCase() : DEFAULT_ACCENT_COLOR,
    normalize: value => value.toLowerCase()
  },
  playbackVisualization: { default: false, validate: isBoolean, coerce: value => value === true },
  animations: { default: false, validate: isBoolean, coerce: value => value === true },
  respectSystemMotion: { default: false, validate: isBoolean, coerce: value => value === true },
  showYourLikesButton: { default: true, validate: isBoolean, coerce: value => value !== false },
  showTransferButton: { default: true, validate: isBoolean, coerce: value => value !== false },
  insightsHiddenUntil: { default: 0, coerce: value => (Number.isFinite(value) && value > 0 ? value : 0) },
  insightsLayout: {
    default: DEFAULT_INSIGHTS_LAYOUT,
    validate: isInsightsLayout,
    coerce: value => (isInsightsLayout(value) ? value : DEFAULT_INSIGHTS_LAYOUT)
  },
  appLanguage: { default: 'site', validate: isAppLanguage, coerce: value => (value === 'ru' ? 'ru' : 'site') },
  avatarRadius: {
    default: DEFAULT_RADII.avatarRadius,
    validate: isArtworkRadius,
    coerce: value => (isArtworkRadius(value) ? value : DEFAULT_RADII.avatarRadius)
  },
  trackRadius: {
    default: DEFAULT_RADII.trackRadius,
    validate: isArtworkRadius,
    coerce: value => (isArtworkRadius(value) ? value : DEFAULT_RADII.trackRadius)
  },
  albumRadius: {
    default: DEFAULT_RADII.albumRadius,
    validate: isArtworkRadius,
    coerce: value => (isArtworkRadius(value) ? value : DEFAULT_RADII.albumRadius)
  }
};

function defaultSettings() {
  const result = {};
  for (const [key, def] of Object.entries(SETTINGS)) result[key] = def.default;
  return result;
}

// Turns an untrusted saved settings.json into a fully trusted settings object.
function coerceSettings(saved) {
  const source = saved && typeof saved === 'object' ? saved : {};
  const result = {};
  for (const [key, def] of Object.entries(SETTINGS)) {
    result[key] = Object.hasOwn(source, key) ? def.coerce(source[key]) : def.default;
  }
  return result;
}

function validateSetting(key, value) {
  const def = SETTINGS[key];
  return Boolean(def && typeof def.validate === 'function' && def.validate(value));
}

function normalizeSetting(key, value) {
  const def = SETTINGS[key];
  return typeof def?.normalize === 'function' ? def.normalize(value) : value;
}

module.exports = {
  SETTINGS,
  ARTWORK_RADIUS_KEYS,
  defaultSettings,
  coerceSettings,
  validateSetting,
  normalizeSetting,
  isHexColor,
  isArtworkRadius,
  isInsightsLayout,
  isDiscordClientId,
  isAppLanguage
};
