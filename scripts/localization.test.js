'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { state } = require('../src/preload/state.js');
const { translatedValue, translationKey } = require('../src/preload/localization-dict.js');
const { coerceSettings, validateSetting } = require('../shared/settings-schema.js');

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
