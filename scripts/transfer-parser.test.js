'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalized, exactMatch, autoMatch } = require('../src/preload/transfer-parser.js');

test('normalization preserves Cyrillic and ignores accents and punctuation', () => {
  assert.equal(normalized('Tiësto, BIA — BOTH'), 'tiesto bia both');
  assert.equal(normalized('Назад в кресты'), 'назад в кресты');
});

test('an exact match needs title and artist', () => {
  assert.equal(exactMatch({ title: 'Song', artist: 'Artist' }, { title: 'Song', artist: 'Artist' }), true);
  assert.equal(exactMatch({ title: 'Song', artist: 'Artist' }, { title: 'Song (remix)', artist: 'Artist' }), false);
  assert.equal(exactMatch({ title: 'Song', artist: '' }, { title: 'Song', artist: 'Artist' }), false);
});

test('automatic mode chooses a matching song and rejects different versions', () => {
  const item = { title: 'Rockefeller Street', artist: 'Getter Jaani' };
  const remix = { title: 'Getter Jaani - Rockefeller Street (Nightcore Mix)', artist: 'Fan' };
  assert.equal(autoMatch(item, [remix]), null);
  const original = { title: 'Getter Jaani - Rockefeller Street', artist: 'Getter Jaani' };
  assert.equal(autoMatch(item, [remix, original]), original);
  const russian = { title: 'назад в кресты', artist: 'dabbackwood' };
  assert.equal(autoMatch(russian, [russian]), russian);
});
