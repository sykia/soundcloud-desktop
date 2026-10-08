'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
let calls = 0;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return { ipcRenderer: {
    on() {}, invoke: async (_channel, _language, labels) => {
      calls += 1;
      return labels.map(() => 'Совсем новое');
    }
  } };
  return originalLoad.call(this, request, parent, isMain);
};

global.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
global.NodeFilter = { SHOW_TEXT: 4, SHOW_ELEMENT: 1 };
global.document = { addEventListener() {} };
global.requestAnimationFrame = callback => setImmediate(callback);
global.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

const { state } = require('../src/preload/state.js');
const { translateSite, restoreSiteLanguage, auditLocalization } = require('../src/preload/localization.js');
Module._load = originalLoad;

function matchesSimple(element, selector) {
  return selector.split(',').some(raw => {
    const part = raw.trim();
    if (/^[a-z][\w-]*$/i.test(part)) return element.tag === part.toLowerCase();
    if (/^\.[\w-]+$/.test(part)) return element.classes.has(part.slice(1));
    if (part === 'a[href]') return element.tag === 'a' && element.hasAttribute('href');
    if (part === '[role="button"]') return element.getAttribute('role') === 'button';
    if (part === '[role="tab"]') return element.getAttribute('role') === 'tab';
    if (part === '[role="menuitem"]') return element.getAttribute('role') === 'menuitem';
    if (part === '[aria-hidden="true"]') return element.getAttribute('aria-hidden') === 'true';
    return false;
  });
}

function element(tag, classes = [], attrs = {}, parent = null) {
  const node = {
    tag, nodeType: 1, classes: new Set(classes), attrs: new Map(Object.entries(attrs)),
    parentElement: parent, isConnected: true,
    matches(selector) { return matchesSimple(this, selector); },
    closest(selector) {
      let current = this;
      while (current) {
        if (current.matches(selector)) return current;
        current = current.parentElement;
      }
      return null;
    },
    hasAttribute(name) { return this.attrs.has(name); },
    getAttribute(name) { return this.attrs.get(name) ?? null; },
    setAttribute(name, value) { this.attrs.set(name, String(value)); },
    removeAttribute(name) { this.attrs.delete(name); }
  };
  return node;
}
function textNode(value, parent) { return { nodeType: 3, nodeValue: value, parentElement: parent, isConnected: true }; }

function fixture() {
  const root = element('body');
  const header = element('div', ['header__navMenuItem'], {}, root);
  const italianNav = textNode('Cerca', header);
  const follow = element('button', [], { 'aria-label': 'Segui' }, root);
  const followText = textNode('Segui', follow);
  const option = element('option', [], {}, root);
  const optionText = textNode('Scuro', option);
  const title = element('span', ['soundTitle__title'], {}, root);
  const titleText = textNode('Home', title);
  const message = element('div', ['messageItem__content'], {}, root);
  const messageText = textNode('Cerca', message);
  const unknown = element('button', [], {}, root);
  const unknownText = textNode('Nuovissimo', unknown);
  const form = element('form', [], {}, root);
  const label = element('label', [], {}, form);
  const labelText = textNode('Notifiche', label);
  const help = element('p', [], {}, form);
  const helpText = textNode('Nuova descrizione', help);
  const account = element('button', ['header__userNavButton'], {}, root);
  const accountText = textNode('dope17', account);
  const nodes = [italianNav, followText, optionText, titleText, messageText,
    unknownText, labelText, helpText, accountText];
  document.body = root;
  document.createTreeWalker = () => {
    let index = -1;
    return { get currentNode() { return nodes[index]; }, nextNode() { index += 1; return index < nodes.length; } };
  };
  document.querySelectorAll = () => [follow];
  return { italianNav, follow, followText, option, optionText, titleText,
    messageText, unknownText, labelText, helpText, accountText };
}

test('DOM translation preserves content, controls and restores the site language', async () => {
  state.appLanguage = 'ru';
  state.sourceLanguage = 'it';
  state.pageScope = 'discover';
  const page = fixture();
  translateSite();
  assert.equal(page.italianNav.nodeValue, 'Поиск');
  assert.equal(page.followText.nodeValue, 'Подписаться');
  assert.equal(page.follow.getAttribute('aria-label'), 'Подписаться');
  assert.equal(page.optionText.nodeValue, 'Тёмная тема');
  assert.equal(page.option.getAttribute('value'), 'Scuro');
  assert.equal(page.titleText.nodeValue, 'Home');
  assert.equal(page.messageText.nodeValue, 'Cerca');
  assert.equal(page.accountText.nodeValue, 'dope17');
  await new Promise(resolve => setTimeout(resolve, 130));
  assert.equal(page.unknownText.nodeValue, 'Совсем новое');
  assert.equal(page.labelText.nodeValue, 'Уведомления');
  assert.equal(page.helpText.nodeValue, 'Совсем новое');
  assert.equal(page.accountText.nodeValue, 'dope17');
  assert.equal(calls, 1);
  const audit = auditLocalization();
  assert.equal(audit.counts.protectedUnchanged >= 3, true);
  assert.equal(audit.counts.machineTranslated >= 2, true);
  assert.equal(audit.candidates.some(item => item.text === 'dope17'), false);
  translateSite();
  assert.equal(calls, 1);
  restoreSiteLanguage();
  assert.equal(page.italianNav.nodeValue, 'Cerca');
  assert.equal(page.followText.nodeValue, 'Segui');
  assert.equal(page.follow.getAttribute('aria-label'), 'Segui');
  assert.equal(page.optionText.nodeValue, 'Scuro');
  assert.equal(page.option.hasAttribute('value'), false);
  assert.equal(page.unknownText.nodeValue, 'Nuovissimo');
  assert.equal(page.labelText.nodeValue, 'Notifiche');
  assert.equal(page.helpText.nodeValue, 'Nuova descrizione');
});

test('switching the SoundCloud source language clears the previous translation', async () => {
  state.appLanguage = 'ru';
  state.sourceLanguage = 'it';
  state.pageScope = 'discover';
  const page = fixture();
  translateSite();
  assert.equal(page.italianNav.nodeValue, 'Поиск');
  restoreSiteLanguage();
  assert.equal(page.italianNav.nodeValue, 'Cerca');
  page.italianNav.nodeValue = 'Search';
  page.followText.nodeValue = 'Follow';
  page.follow.setAttribute('aria-label', 'Follow');
  page.optionText.nodeValue = 'Dark';
  state.sourceLanguage = 'en';
  translateSite();
  assert.equal(page.italianNav.nodeValue, 'Поиск');
  assert.equal(page.followText.nodeValue, 'Подписаться');
  assert.equal(page.optionText.nodeValue, 'Тёмная тема');
  restoreSiteLanguage();
  assert.equal(page.italianNav.nodeValue, 'Search');
  assert.equal(page.follow.getAttribute('aria-label'), 'Follow');
  assert.equal(page.option.getAttribute('value'), null);
  await new Promise(resolve => setTimeout(resolve, 130));
  assert.equal(page.unknownText.nodeValue, 'Nuovissimo');
});
