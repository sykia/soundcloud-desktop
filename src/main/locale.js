'use strict';

// SoundCloud may reset its own locale after a page has loaded. Read and watch
// the source locale instead of fighting that cookie: the automatic translator
// can then use the matching language model for newly rendered labels.
const { session } = require('electron');

const SITE_URL = 'https://soundcloud.com/';
const SUPPORTED = new Set(['en', 'it', 'es']);

function sourceLocale(cookies) {
  const siteCookie = cookies.find(cookie =>
    ['.soundcloud.com', 'soundcloud.com'].includes(cookie.domain) && cookie.path === '/');
  return SUPPORTED.has(siteCookie?.value) ? siteCookie.value : 'en';
}

async function getSourceLocale(cookieStore = session.defaultSession.cookies) {
  const cookies = await cookieStore.get({ url: SITE_URL, name: 'sclocale' });
  return sourceLocale(cookies);
}

function watchSourceLocale(callback, cookieStore = session.defaultSession.cookies) {
  cookieStore.on('changed', (_event, cookie, _cause, removed) => {
    if (cookie.name !== 'sclocale' ||
        !['.soundcloud.com', 'soundcloud.com'].includes(cookie.domain) || cookie.path !== '/') return;
    if (removed) getSourceLocale(cookieStore).then(callback).catch(console.error);
    else callback(sourceLocale([cookie]));
  });
}

module.exports = { getSourceLocale, watchSourceLocale, sourceLocale };
