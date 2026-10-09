'use strict';

function isAudioAdRequest(details) {
  if (details.method !== 'GET') return false;
  try {
    const url = new URL(details.url);
    return url.protocol === 'https:' && url.hostname === 'api-v2.soundcloud.com' && url.pathname === '/audio-ads';
  } catch { return false; }
}

function installAudioAdRule(session, getSettings) {
  session.webRequest.onBeforeRequest({ urls: ['https://api-v2.soundcloud.com/audio-ads*'] },
    (details, callback) => callback({ cancel: getSettings().blockAudioAds && isAudioAdRequest(details) }));
}

module.exports = { isAudioAdRequest, installAudioAdRule };
