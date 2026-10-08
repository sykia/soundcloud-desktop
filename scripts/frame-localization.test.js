'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return { session: { defaultSession: { cookies: {} } } };
  return originalLoad.call(this, request, parent, isMain);
};
const { translateBatch } = require('../src/main/frame-localization.js');
Module._load = originalLoad;

test('iframe translation uses the button role for nested typography', async () => {
  const result = await translateBatch('studio', 'it', [
    { id: 'saving', key: 'Risparmia 25,98 $', role: 'button', fallbackAllowed: false },
    { id: 'benefits', key: "Vantaggi dell'iscrizione Artist Pro", role: 'heading', fallbackAllowed: false }
  ]);
  assert.deepEqual(result.map(item => item.ru), [
    'Сэкономьте 25,98 $', 'Преимущества подписки Artist Pro'
  ]);
});
