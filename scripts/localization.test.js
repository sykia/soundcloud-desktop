'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { state } = require('../src/preload/state.js');
const { translatedValue, translationKey } = require('../src/preload/localization-dict.js');
const { coerceSettings, validateSetting } = require('../shared/settings-schema.js');
const { ensureEnglishSource, needsEnglishCookie } = require('../src/main/locale.js');

test('Russian dictionary resolves exact and folded labels', () => {
  state.pageScope = '';
  assert.equal(translatedValue('Home'), 'Главная');
  assert.equal(translatedValue('NEW TRACKS'), 'НОВЫЕ ТРЕКИ');
  assert.equal(translatedValue('Like'), 'Нравится');
  assert.equal(translatedValue('  Settings  '), null);
  assert.equal(translatedValue(translationKey('  Settings  ')), 'Настройки');
});

test('icon style is validated when an old profile is loaded', () => {
  const settings = coerceSettings({ appIconStyle: 'invalid' });
  assert.equal(settings.appIconStyle, 'orange');
  assert.equal(validateSetting('appIconStyle', 'dark'), true);
  assert.equal(validateSetting('appIconStyle', 'other'), false);
});

test('Russian overlay switches a Spanish SoundCloud cookie to English source text', () => {
  const siteCookie = value => [{ domain: '.soundcloud.com', path: '/', value }];
  assert.equal(needsEnglishCookie(siteCookie('es')), true);
  assert.equal(needsEnglishCookie(siteCookie('en')), false);
  assert.equal(needsEnglishCookie([]), true);
});

test('enabling Russian writes the English source locale once', async () => {
  const writes = [];
  let siteLocale = 'es';
  const cookieStore = {
    get: async () => [{ domain: '.soundcloud.com', path: '/', value: siteLocale }],
    set: async cookie => { writes.push(cookie); siteLocale = cookie.value; }
  };
  assert.equal(await ensureEnglishSource(true, cookieStore), true);
  assert.equal(writes[0].value, 'en');
  assert.equal(writes[0].domain, '.soundcloud.com');
  assert.equal(await ensureEnglishSource(true, cookieStore), false);
  assert.equal(writes.length, 1);
});
