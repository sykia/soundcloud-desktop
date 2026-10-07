'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { state } = require('../src/preload/state.js');
const { translatedValue, translationKey } = require('../src/preload/localization-dict.js');
const { coerceSettings, validateSetting } = require('../shared/settings-schema.js');
const { getSourceLocale, sourceLocale } = require('../src/main/locale.js');
const { createTranslator } = require('../src/main/auto-translate.js');
const path = require('node:path');

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

test('source language follows the current SoundCloud cookie', () => {
  const siteCookie = value => [{ domain: '.soundcloud.com', path: '/', value }];
  assert.equal(sourceLocale(siteCookie('es')), 'es');
  assert.equal(sourceLocale(siteCookie('it')), 'it');
  assert.equal(sourceLocale(siteCookie('en')), 'en');
  assert.equal(sourceLocale([]), 'en');
});

test('reading the source language does not overwrite the site selection', async () => {
  const cookieStore = { get: async () => [{ domain: '.soundcloud.com', path: '/', value: 'it' }] };
  assert.equal(await getSourceLocale(cookieStore), 'it');
});

test('bundled models translate unknown English, Italian and Spanish labels', async () => {
  const translator = await createTranslator(path.join(__dirname, '..', 'build'));
  try {
    for (const [from, text] of [
      ['en', 'Recommended for you'],
      ['it', 'Ascolti recenti'],
      ['es', 'Escuchado recientemente']
    ]) {
      const result = await translator.translate({ from, to: 'ru', text, html: false });
      assert.match(result.target.text, /[А-Яа-яЁё]/);
    }
  } finally {
    translator.delete();
  }
});
