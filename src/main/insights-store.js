'use strict';

// cusade Insights listening-history store. The main process holds the sessions
// array, validates every sample coming from the renderer and lazily writes the
// store to disk (a 15s debounce via scheduleInsightsSave, plus a flush on quit).

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { isSoundCloudUrl } = require('./urls.js');

let insights = { sessions: [] };
let lastInsightEntry;
let insightsSaveTimer;
let insightsDirty = false;

function insightsPath() {
  return path.join(app.getPath('userData'), 'insights.json');
}

function loadInsights() {
  try {
    const saved = JSON.parse(fs.readFileSync(insightsPath(), 'utf8'));
    if (Array.isArray(saved.sessions)) insights.sessions = saved.sessions.slice(-20000);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not load cusade Insights:', error);
  }
}

function saveInsights() {
  const file = insightsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(insights), { mode: 0o600 });
  fs.renameSync(temporary, file);
  insightsDirty = false;
}

function scheduleInsightsSave() {
  insightsDirty = true;
  if (insightsSaveTimer) return;
  insightsSaveTimer = setTimeout(() => {
    insightsSaveTimer = undefined;
    try { saveInsights(); }
    catch (error) {
      console.error('Could not save cusade Insights:', error);
      if (insightsDirty) scheduleInsightsSave();
    }
  }, 15000);
}

function validInsightSample(sample) {
  return sample && typeof sample === 'object' &&
    typeof sample.sessionId === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(sample.sessionId) &&
    typeof sample.title === 'string' && sample.title.length > 0 && sample.title.length <= 300 &&
    typeof sample.artist === 'string' && sample.artist.length > 0 && sample.artist.length <= 300 &&
    typeof sample.url === 'string' && sample.url.length <= 2048 && isSoundCloudUrl(sample.url) &&
    (sample.artwork === '' || (typeof sample.artwork === 'string' &&
      sample.artwork.length <= 2048 && /^https:\/\/([a-z0-9-]+\.)*sndcdn\.com\//i.test(sample.artwork))) &&
    Number.isInteger(sample.seconds) && sample.seconds >= 1 && sample.seconds <= 10;
}

function getSessions() {
  return insights.sessions;
}

function recordInsight(sample) {
  let entry = lastInsightEntry?.id === sample.sessionId
    ? lastInsightEntry : insights.sessions.find(session => session.id === sample.sessionId);
  if (!entry) {
    entry = { id: sample.sessionId, title: sample.title, artist: sample.artist,
      url: sample.url, artwork: sample.artwork, startedAt: Date.now(),
      lastPlayedAt: Date.now(), seconds: 0 };
    insights.sessions.push(entry);
    if (insights.sessions.length > 20000) insights.sessions.shift();
  }
  if (entry.url !== sample.url) throw new Error('Session track mismatch');
  lastInsightEntry = entry;
  entry.seconds += sample.seconds;
  entry.lastPlayedAt = Date.now();
  scheduleInsightsSave();
  return true;
}

function flushOnQuit() {
  clearTimeout(insightsSaveTimer);
  if (insightsDirty) {
    try { saveInsights(); }
    catch (error) { console.error('Could not save cusade Insights on exit:', error); }
  }
}

module.exports = {
  loadInsights,
  saveInsights,
  scheduleInsightsSave,
  validInsightSample,
  recordInsight,
  getSessions,
  flushOnQuit
};