'use strict';

// The Russian overlay translates SoundCloud's English UI strings. SoundCloud
// remembers its own language independently in the sclocale cookie. Keep the
// source language English while the overlay is selected so a previously chosen
// Spanish, Portuguese or other site locale does not leak through the dictionary.
const { session } = require('electron');
const { getSettings } = require('./settings.js');

const SITE_URL = 'https://soundcloud.com/';

function needsEnglishCookie(cookies) {
  const siteCookie = cookies.find(cookie => cookie.domain === '.soundcloud.com' && cookie.path === '/');
  return siteCookie?.value !== 'en';
}

async function ensureEnglishSource(force = false, cookieStore = session.defaultSession.cookies) {
  if (!force && getSettings().appLanguage !== 'ru') return false;
  const cookies = await cookieStore.get({ url: SITE_URL, name: 'sclocale' });
  if (!needsEnglishCookie(cookies)) return false;
  await cookieStore.set({
    url: SITE_URL,
    domain: '.soundcloud.com',
    path: '/',
    name: 'sclocale',
    value: 'en',
    expirationDate: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60
  });
  return true;
}

module.exports = { ensureEnglishSource, needsEnglishCookie };
