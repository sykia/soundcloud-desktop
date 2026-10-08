'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { state } = require('../src/preload/state.js');
const { translatedValue, translationKey } = require('../src/preload/localization-dict.js');
const { coerceSettings, validateSetting } = require('../shared/settings-schema.js');
const { getSourceLocale, sourceLocale } = require('../src/main/locale.js');
const { createTranslator } = require('../src/main/auto-translate.js');
const { catalogValue } = require('../src/preload/localization-catalog.js');
const { isContentHref, isInterfaceElement, isSafeFallback, isSafeSingleWord } = require('../src/preload/localization-veto.js');
const { cleanObservation, validEntry, mergeCatalog } = require('./localization-catalog-core.js');
const { chooseSourceLanguage } = require('../src/preload/source-language.js');
const { pageStatus, pageInfo, auditMenu } = require('../src/main/localization-capture.js');
const { scriptFor, acceptable } = require('../src/main/frame-localization.js');
const catalog = require('../shared/localization-catalog.json');
const path = require('node:path');

test('Russian dictionary resolves exact and folded labels', () => {
  state.pageScope = '';
  assert.equal(translatedValue('Home'), 'Главная');
  assert.equal(translatedValue('NEW TRACKS'), 'НОВЫЕ ТРЕКИ');
  assert.equal(translatedValue('Like'), 'Нравится');
  assert.equal(translatedValue('  Settings  '), null);
  assert.equal(translatedValue(translationKey('  Settings  ')), 'Настройки');
});

test('settings language names use generated Russian CLDR names', () => {
  state.pageScope = 'settings';
  state.sourceLanguage = 'it';
  assert.equal(translatedValue('Ceco'), 'Чешский');
  assert.equal(translatedValue('Bielorusso'), 'Белорусский');
  state.pageScope = '';
});

test('context catalog uses page and role and preserves source language', () => {
  const heading = { closest: selector => selector.includes('h1') ? { matches: () => false } : null };
  assert.equal(catalogValue('More of what you like', heading, 'en', 'discover'), 'Музыка, которая вам понравится');
  assert.equal(catalogValue('More of what you like', heading, 'en', 'feed'), 'Музыка, которая вам понравится');
  assert.equal(catalogValue('Recently played', heading, 'en', 'library'), 'Недавно слушали');
  assert.equal(catalogValue('Recently played', heading, 'it', 'library'), 'Недавно слушали');
  assert.equal(translatedValue('Mixed for cusae'), 'Миксы для cusae');
  assert.equal(translatedValue('Playlists'), 'Плейлисты');
  assert.equal(catalogValue('Mixed for another-user', heading, 'en', 'discover'), 'Миксы для another-user');
  assert.equal(catalogValue('Mixato per marco', heading, 'it', 'discover'), 'Миксы для marco');
  assert.equal(catalogValue('Mezclado para luna', heading, 'es', 'discover'), 'Миксы для luna');
  assert.equal(catalogValue('Altro di ciò che ti piace', heading, 'it', 'discover'),
    'Музыка, которая вам понравится');
  assert.equal(catalogValue("Studio dell'artista", null, 'it', 'feed'), 'Студия артиста');
  assert.equal(catalogValue('Buscar', null, 'es', 'search'), 'Поиск');
  for (const [source, ru] of [
    ['Cerca', 'Поиск'], ['Impostazioni', 'Настройки'], ['Segui', 'Подписаться'],
    ['Scuro', 'Тёмная тема'], ['Chiaro', 'Светлая тема'],
    ['Pubblicità', 'Реклама'], ['Prova Go+', 'Попробовать Go+'],
    ['Più di quello che ti piace', 'Музыка, которая вам понравится']
  ]) assert.equal(catalogValue(source, null, 'it', 'settings'), ru);
});

test('catalog has unique contextual keys and keeps protected terms', () => {
  const keys = new Set();
  for (const entry of catalog) {
    assert.equal(validEntry(entry, entry), true, entry.text);
    const key = JSON.stringify([entry.source, entry.text, entry.pages || [], entry.roles || []]);
    assert.equal(keys.has(key), false, key);
    keys.add(key);
  }
});

test('content routes and personal text are not eligible for machine translation', () => {
  global.Node = { ELEMENT_NODE: 1 };
  const element = (href, userBlock = false) => ({
    nodeType: 1,
    matches: () => false,
    closest(selector) {
      if (selector.includes('.soundTitle__title') && userBlock) return this;
      if (selector.includes('.commentItem') && userBlock) return this;
      if (selector === 'a[href]' && href) return { getAttribute: () => href };
      return null;
    }
  });
  assert.equal(isContentHref('/artist/special-track'), true);
  assert.equal(isContentHref('https://soundcloud.com/artist/special-track'), true);
  assert.equal(isContentHref('/you/library'), false);
  assert.equal(isInterfaceElement(element('/artist/special-track')), false);
  assert.equal(isInterfaceElement(element('', true)), false);
  assert.equal(isSafeFallback(element('/artist/special-track')), false);
  assert.equal(isSafeSingleWord(element('/artist/special-track')), false);
  assert.equal(cleanObservation({source:'en', text:'https://soundcloud.com/user', page:'feed', role:'heading'}), null);
  const decorativeAttribute = { nodeType: 1,
    matches: selector => selector.includes('[aria-label]'),
    closest: selector => selector.includes('[class*="sidebar"') ? {} : null };
  assert.equal(isSafeFallback(decorativeAttribute, 'attributes'), false);
  state.pageScope = 'library';
  assert.equal(translatedValue('Segui yuuuchi'), 'Подписаться на yuuuchi');
  assert.equal(translatedValue('Non seguire più pyatno'), 'Отписаться от pyatno');
});

test('catalog regeneration replaces a contextual translation and is idempotent', () => {
  const current = [{ source: 'it', text: 'Cerca', ru: 'Найти', pages: ['search', 'feed'], roles: ['button', 'tab'] }];
  const incoming = [{ source: 'it', text: 'Cerca', ru: 'Поиск', pages: ['search'], roles: ['button'] }];
  const once = mergeCatalog(current, incoming);
  const twice = mergeCatalog(once, incoming);
  assert.deepEqual(once, twice);
  assert.equal(once.length, 4);
  assert.equal(once.find(entry => entry.pages[0] === 'search' && entry.roles[0] === 'button').ru, 'Поиск');
  assert.equal(once.find(entry => entry.pages[0] === 'feed' && entry.roles[0] === 'button').ru, 'Найти');
  assert.equal(cleanObservation({ source: 'it', text: 'Mixato per cusae', page: 'discover', role: 'heading' }).text, 'Mixato per {user}');
  assert.equal(cleanObservation({ source: 'it', text: '0% dei caricamenti utilizzati',
    page: 'upload', role: 'text' }).text, '{count}% dei caricamenti utilizzati');
});

test('capture verifies the actual destination and sign-in state', () => {
  assert.equal(pageStatus('/feed', '/signin', false, true, 20), 'redirected');
  assert.equal(pageStatus('/feed', '/feed', true, true, 20), 'login-required');
  assert.equal(pageStatus('/feed', '/feed', false, false, 20), 'preload-unavailable');
  assert.equal(pageStatus('/feed', '/feed', false, true, 20), 'audited');
});

test('capture DOM probe is valid JavaScript for every page family', async () => {
  const contents = { executeJavaScript(script) { new Function(script); return Promise.resolve({}); } };
  for (const page of ['discover', 'feed', 'settings', 'studio', 'upload']) {
    await pageInfo(contents, page);
  }
});

test('open-menu probes parse and report their own coverage', async () => {
  let calls = 0;
  const contents = { executeJavaScript(script) {
    new Function(script);
    return Promise.resolve([true, [], undefined][calls++]);
  } };
  const result = await auditMenu(contents, '.header__userNavButton', async () =>
    ({ counts: { total: 3, translated: 2 }, reasons: {} }));
  assert.equal(result.total, 3);
  assert.equal(calls, 3);
});

test('iframe DOM worker has no privileged API and rejects changed names', () => {
  const script = scriptFor({ page: 'studio', source: 'it' });
  new Function(script);
  assert.equal(/require\(|ipcRenderer|nodeIntegration/.test(script), false);
  assert.equal(acceptable('Lee McQueen', 'Маккуин Ли'), false);
  assert.equal(acceptable('Carica file', 'Загрузить файлы'), true);
});

test('site cookie resolves an English html tag left behind by Italian UI', () => {
  assert.equal(chooseSourceLanguage('en', 'it'), 'it');
  assert.equal(chooseSourceLanguage('it', 'en'), 'it');
  assert.equal(chooseSourceLanguage('es', 'es'), 'es');
});

test('translated captions never become new source labels', () => {
  state.pageScope = 'discover';
  assert.equal(translatedValue('Музыка, которая вам понравится'), null);
  assert.equal(catalogValue('Музыка, которая вам понравится', null, 'en', 'discover'), null);
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
