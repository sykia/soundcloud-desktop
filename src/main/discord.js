'use strict';

// The Discord presence bridge: turns validated playback state from the renderer
// into a Rich Presence activity on the local RPC socket. The deduplication key
// (lastPresenceKey/lastPresenceSent) lives here, and the window calls back into
// this module on navigation and window close, so presence never survives a page
// it no longer describes.

const discordRpc = require('./discord-rpc.js');
const { isSoundCloudUrl, isArtworkUrl } = require('./urls.js');
const { getSettings } = require('./settings.js');

let lastPresenceKey = '';
let lastPresenceSent = 0;

function resetPresenceKey() {
  lastPresenceKey = '';
}

function startRpc(clientId) {
  discordRpc.start(clientId);
}

function stopRpc() {
  discordRpc.stop();
}

function shouldStart() {
  const settings = getSettings();
  return settings.discordRpc && settings.discordClientId;
}

// Called on every main-frame navigation: the track being described is gone, so
// the key is dropped and the activity cleared.
function clearPresenceOnNav() {
  if (!getSettings().discordRpc) return;
  lastPresenceKey = '';
  discordRpc.update(null);
}

// Called when the window closes: the activity is cleared but the key is kept.
function clearPresence() {
  if (!getSettings().discordRpc) return;
  discordRpc.update(null);
}

function updateDiscordPresence(track) {
  if (!getSettings().discordRpc || !getSettings().discordClientId) return;
  if (track === null) {
    lastPresenceKey = '';
    discordRpc.update(null);
    return;
  }
  if (!track || typeof track !== 'object' || Array.isArray(track) ||
      typeof track.title !== 'string' || typeof track.artist !== 'string' ||
      !isSoundCloudUrl(track.url) ||
      typeof track.paused !== 'boolean' ||
      !Number.isFinite(track.elapsed) || !Number.isFinite(track.duration) ||
      track.elapsed < 0 || track.duration < 0 || track.duration > 86400 ||
      track.elapsed > track.duration + 5) return;
  const title = track.title.trim().slice(0, 128);
  const artist = track.artist.trim().slice(0, 128);
  if (!title || !artist) return;
  const artwork = typeof track.artwork === 'string' && isArtworkUrl(track.artwork)
    ? track.artwork : null;
  const key = JSON.stringify([track.url, title, artist, artwork, track.paused]);
  if (key === lastPresenceKey && Date.now() - lastPresenceSent < 15000) return;
  lastPresenceKey = key;
  lastPresenceSent = Date.now();
  const activity = {
    type: 2,
    details: title,
    state: track.paused ? `${artist.slice(0, 116)} · пауза` : artist,
    assets: artwork ? { large_image: artwork, large_text: title } : {}
  };
  if (!track.paused && track.duration > 0) {
    activity.timestamps = {
      start: Math.floor(Date.now() / 1000 - track.elapsed),
      end: Math.floor(Date.now() / 1000 + track.duration - track.elapsed)
    };
  }
  discordRpc.update(activity);
}

module.exports = {
  updateDiscordPresence,
  clearPresence,
  clearPresenceOnNav,
  resetPresenceKey,
  startRpc,
  stopRpc,
  shouldStart
};