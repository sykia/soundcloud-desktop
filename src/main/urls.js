'use strict';

// Pure URL helpers shared by the window, the IPC layer and the Discord bridge.
// Nothing here touches Electron state beyond what is passed in, which is what
// lets autostart, settings, insights-store and window all use it without cycles.

const { PROTOCOL } = require('../../shared/constants.js');

function isSoundCloudUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      (url.hostname === 'soundcloud.com' || url.hostname.endsWith('.soundcloud.com'));
  } catch {
    return false;
  }
}

function normalizeSoundCloudUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) return null;
  if (isSoundCloudUrl(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' &&
        (url.hostname === 'soundcloud.com' || url.hostname.endsWith('.soundcloud.com'))) {
      url.protocol = 'https:';
      return url.href;
    }
  } catch {
    return null;
  }
  return null;
}

function launchUrl(value) {
  const direct = normalizeSoundCloudUrl(value);
  if (direct) return direct;
  if (typeof value !== 'string' || value.length > 8192) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== `${PROTOCOL}:` || url.hostname !== 'open') return null;
    return normalizeSoundCloudUrl(url.searchParams.get('url'));
  } catch {
    return null;
  }
}

function launchUrlFromArgs(args) {
  return args.map(launchUrl).find(Boolean) || null;
}

function isSignInPopupUrl(value) {
  if (value === 'about:blank') return true;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    return isSoundCloudUrl(value) || [
      'accounts.google.com',
      'facebook.com',
      'www.facebook.com',
      'appleid.apple.com'
    ].includes(url.hostname);
  } catch {
    return false;
  }
}

function isArtworkUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      (url.hostname === 'sndcdn.com' || url.hostname.endsWith('.sndcdn.com'));
  } catch {
    return false;
  }
}

module.exports = {
  isSoundCloudUrl,
  normalizeSoundCloudUrl,
  launchUrl,
  launchUrlFromArgs,
  isSignInPopupUrl,
  isArtworkUrl
};