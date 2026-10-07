'use strict';

// Discord Rich Presence sync from the playback badge. Sends a fresh state only
// when something changed or the previous report is older than five seconds, so
// the RPC socket is not spammed. resetPresence() lets panel.js clear the cache
// when the toggle changes without knowing the internals.

const { ipcRenderer } = require('electron');
const { CHANNEL } = require('../../shared/ipc.js');
const { state } = require('./state.js');
const { playbackSeconds } = require('./visualization.js');

let lastDiscordStateKey = '';
let lastDiscordSync = 0;

function resetPresence() {
  lastDiscordStateKey = '';
  lastDiscordSync = 0;
}

function syncDiscordPresence() {
  if (!state.discordRpc || !state.discordClientId) return;
  const badge = document.querySelector('.playbackSoundBadge');
  const titleLink = badge?.querySelector('.playbackSoundBadge__titleLink');
  const artistLink = badge?.querySelector('.playbackSoundBadge__lightLink');
  if (!titleLink?.href || !artistLink?.textContent.trim()) {
    if (lastDiscordStateKey) ipcRenderer.send(CHANNEL.playbackState, null);
    lastDiscordStateKey = '';
    return;
  }
  const title = titleLink.title || titleLink.querySelector('[aria-hidden="true"]')?.textContent || titleLink.textContent;
  const artwork = badge.querySelector('.image__full')?.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1]
    ?.replace(/-t\d+x\d+\./, '-t500x500.');
  const paused = badge.classList.contains('paused');
  const key = `${titleLink.href}|${title}|${artistLink.textContent}|${artwork}|${paused}`;
  if (key === lastDiscordStateKey && Date.now() - lastDiscordSync < 5000) return;
  lastDiscordStateKey = key;
  lastDiscordSync = Date.now();
  ipcRenderer.send(CHANNEL.playbackState, {
    title: title?.trim() || '',
    artist: artistLink.textContent.trim(),
    artwork: artwork || '',
    url: titleLink.href,
    paused,
    elapsed: playbackSeconds(document.querySelector('.playbackTimeline__timePassed [aria-hidden="true"]')?.textContent || ''),
    duration: playbackSeconds(document.querySelector('.playbackTimeline__duration [aria-hidden="true"]')?.textContent || '')
  });
}

module.exports = { syncDiscordPresence, resetPresence };