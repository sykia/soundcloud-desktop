'use strict';

// The translation pipeline: a MutationObserver that walks the site text and
// rewrites matching labels to Russian, a bounded rescan queue, the full scans
// that catch a shell rendered after settings arrive, and the in-page language
// picker. The two document listeners below are this module's only load-time
// side effects (the menu lives in the page, not in any cusade host).

const { ipcRenderer } = require('electron');
const { CHANNEL } = require('../../shared/ipc.js');
const { state } = require('./state.js');
const { hosts } = require('./hosts.js');
const { ui, translationKey, translatedValue } = require('./localization-dict.js');
const { CUSADE_OWNED, isInterfaceElement } = require('./localization-veto.js');
const { closePanel, togglePanel } = require('./panel.js');

let localizationWatcher = null;
let localizationFullScan = false;
let localizationLastCleanup = 0;
let localizationScheduled = false;
const localizationQueue = new Set();
const translatedText = new Map();
const translatedAttributes = new Map();
// Options whose visible label was translated and whose value was pinned to the
// original text, so a <select> still submits what SoundCloud expects.
const translatedOptionValues = new Map();
let localizationBody = null;
const automaticCache = new Map();
const automaticPending = new Map();
let automaticTimer = null;

function applyAutomatic(target, translated, language) {
  if (state.appLanguage !== 'ru' || state.sourceLanguage !== language ||
      !translated || translated === target.key || !target.element.isConnected ||
      !isInterfaceElement(target.element, target.attribute ? 'attributes' : 'text')) return;
  if (target.attribute) {
    if (target.element.getAttribute(target.attribute) !== target.original) return;
    if (!translatedAttributes.has(target.element)) translatedAttributes.set(target.element, new Map());
    translatedAttributes.get(target.element).set(target.attribute,
      { original: target.original, translated });
    target.element.setAttribute(target.attribute, translated);
    return;
  }
  if (target.node.nodeValue !== target.original) return;
  if (target.element.matches('option') && !target.element.hasAttribute('value')) {
    translatedOptionValues.set(target.element, target.key);
    target.element.setAttribute('value', target.key);
  }
  const value = target.original.includes(target.key)
    ? target.original.replace(target.key, translated) : translated;
  translatedText.set(target.node, { original: target.original, translated: value });
  target.node.nodeValue = value;
}

function queueAutomatic(target) {
  const { key } = target;
  if (!/[a-zA-ZÀ-ÿ]/.test(key) || /[А-Яа-яЁё]/.test(key) ||
      key.length > 300 || /^https?:\/\//i.test(key)) return;
  const language = state.sourceLanguage;
  const id = `${language}\0${key}`;
  if (automaticCache.has(id)) {
    applyAutomatic(target, automaticCache.get(id), language);
    return;
  }
  if (!automaticPending.has(id)) automaticPending.set(id, { language, key, targets: [] });
  automaticPending.get(id).targets.push(target);
  if (!automaticTimer) automaticTimer = setTimeout(flushAutomatic, 80);
}

async function flushAutomatic() {
  automaticTimer = null;
  if (state.appLanguage !== 'ru') {
    automaticPending.clear();
    return;
  }
  const language = state.sourceLanguage;
  for (const [id, entry] of automaticPending) {
    if (entry.language !== language) automaticPending.delete(id);
  }
  const entries = [...automaticPending.values()].filter(entry => entry.language === language).slice(0, 50);
  for (const entry of entries) automaticPending.delete(`${entry.language}\0${entry.key}`);
  if (automaticPending.size) automaticTimer = setTimeout(flushAutomatic, 80);
  if (!entries.length) return;
  try {
    const translations = await ipcRenderer.invoke(CHANNEL.translateLabels, language,
      entries.map(entry => entry.key));
    entries.forEach((entry, index) => {
      const translation = String(translations[index] || '').trim();
      if (!translation) return;
      if (automaticCache.size < 3000) automaticCache.set(`${language}\0${entry.key}`, translation);
      for (const target of entry.targets) applyAutomatic(target, translation, language);
    });
  } catch (error) {
    console.error('Could not translate interface labels:', error);
  }
}

function translateTextNode(node) {
  const current = node.nodeValue;
  if (!current) return;
  // Cheapest exit first: this node already holds our text.
  if (translatedText.get(node)?.translated === current) return;
  const element = node.parentElement;
  if (!element || !isInterfaceElement(element, 'text')) return;
  const key = translationKey(current);
  if (!key || key.length > 400) return;
  const translation = translatedValue(key, element);
  if (!translation) {
    queueAutomatic({ node, element, original: current, key });
    return;
  }
  // An option without a value attribute submits its own text, so the value
  // SoundCloud would have sent is pinned before the label changes.
  if (element.matches('option') && !element.hasAttribute('value')) {
    translatedOptionValues.set(element, key);
    element.setAttribute('value', key);
  }
  const translated = current.includes(key) ? current.replace(key, translation) : translation;
  if (translated === current) return;
  translatedText.set(node, { original: current, translated });
  node.nodeValue = translated;
}

function translateAttributes(element) {
  if (!isInterfaceElement(element, 'attributes') ||
      element.matches('.soundTitle__title, .userBadge__usernameLink, .playbackSoundBadge__titleLink')) return;
  for (const name of ['title', 'aria-label', 'placeholder']) {
    if (!element.hasAttribute(name)) continue;
    const current = element.getAttribute(name);
    const prior = translatedAttributes.get(element)?.get(name);
    if (prior?.translated === current) continue;
    const translation = translatedValue(translationKey(current), element);
    if (!translation) {
      queueAutomatic({ element, attribute: name, original: current, key: translationKey(current) });
      continue;
    }
    if (translation === current) continue;
    if (!translatedAttributes.has(element)) translatedAttributes.set(element, new Map());
    translatedAttributes.get(element).set(name, { original: current, translated: translation });
    element.setAttribute(name, translation);
  }
}

function translateSite() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) translateTextNode(walker.currentNode);
  for (const element of document.querySelectorAll('[title], [aria-label], [placeholder]')) {
    translateAttributes(element);
  }
  for (const [node] of translatedText) if (!node.isConnected) translatedText.delete(node);
  for (const [element] of translatedAttributes) if (!element.isConnected) translatedAttributes.delete(element);
  for (const [element] of translatedOptionValues) if (!element.isConnected) translatedOptionValues.delete(element);
}

function translateAddedNode(root) {
  if (!root.isConnected) return;
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  if (root.matches(`script, style, noscript, template, svg, ${CUSADE_OWNED}`)) return;
  if (root.hasAttribute('title') || root.hasAttribute('aria-label') || root.hasAttribute('placeholder')) {
    translateAttributes(root);
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
    else if (node.hasAttribute('title') || node.hasAttribute('aria-label') || node.hasAttribute('placeholder')) {
      translateAttributes(node);
    }
  }
}

function restoreSiteLanguage() {
  for (const [node, prior] of translatedText) {
    if (node.isConnected && node.nodeValue === prior.translated) node.nodeValue = prior.original;
  }
  translatedText.clear();
  for (const [element, attributes] of translatedAttributes) {
    if (!element.isConnected) continue;
    for (const [name, prior] of attributes) {
      if (element.getAttribute(name) === prior.translated) element.setAttribute(name, prior.original);
    }
  }
  translatedAttributes.clear();
  for (const [element] of translatedOptionValues) {
    if (element.isConnected) element.removeAttribute('value');
  }
  translatedOptionValues.clear();
}

function syncLanguageMenu() {
  const list = document.querySelector('.localeSelectorContent ul');
  if (!list || list.querySelector('[data-testid="language-pick-ru-cusade"]')) return;
  const example = list.querySelector('li');
  if (!example) return;
  const item = document.createElement('li');
  item.className = example.className;
  item.setAttribute('value', 'ru');
  const button = document.createElement('button');
  button.className = example.querySelector('button')?.className || '';
  button.type = 'button';
  button.dataset.testid = 'language-pick-ru-cusade';
  button.textContent = 'Русский';
  item.appendChild(button);
  list.appendChild(item);
}

// soundcloud.com mutates constantly, so the observer only asks for text and
// attribute mutations while the site is actually translated. The Russian entry
// in SoundCloud's own language menu still needs child insertions, so the
// observer stays connected with a cheaper option set.
function updateLocalizationWatcher() {
  const options = state.appLanguage === 'ru'
    ? {
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['title', 'aria-label', 'placeholder'],
      subtree: true
    }
    : { childList: true, subtree: true };
  if (!localizationWatcher) localizationWatcher = new MutationObserver(scheduleLocalization);
  // A full navigation replaces the body and silently detaches the observer.
  if (document.body && document.body !== localizationBody) {
    localizationWatcher.disconnect();
    localizationBody = document.body;
  }
  if (document.body) localizationWatcher.observe(document.body, options);
}

// A record caused by our own write. Dropping these keeps the observer from
// walking the same subtree a second time for nothing, and it is what stops the
// translation from feeding itself.
function isOwnTranslation(mutation) {
  if (mutation.type === 'characterData') {
    return translatedText.get(mutation.target)?.translated === mutation.target.nodeValue;
  }
  if (mutation.type === 'attributes') {
    return translatedAttributes.get(mutation.target)?.get(mutation.attributeName)?.translated ===
      mutation.target.getAttribute(mutation.attributeName);
  }
  return false;
}

function scheduleLocalization(mutations) {
  if (Array.isArray(mutations)) {
    if (state.appLanguage === 'ru') {
      for (const mutation of mutations) {
        if (isOwnTranslation(mutation)) continue;
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) localizationQueue.add(node);
        } else localizationQueue.add(mutation.target);
      }
    }
  } else localizationFullScan = true;
  if (localizationScheduled) return;
  localizationScheduled = true;
  requestAnimationFrame(() => {
    localizationScheduled = false;
    try {
      syncLanguageMenu();
    } catch (error) {
      // A rendering glitch in the language menu must never kill the observer
      // pipeline: scheduleLocalization would stay pending and the queue would
      // grow forever. Swallow it so translation keeps running either way.
    }
    if (state.appLanguage === 'ru') {
      if (localizationFullScan) translateSite();
      else for (const node of localizationQueue) translateAddedNode(node);
      if (Date.now() - localizationLastCleanup > 30000) {
        for (const [node] of translatedText) if (!node.isConnected) translatedText.delete(node);
        for (const [element] of translatedAttributes) if (!element.isConnected) translatedAttributes.delete(element);
        for (const [element] of translatedOptionValues) if (!element.isConnected) translatedOptionValues.delete(element);
        localizationLastCleanup = Date.now();
      }
    }
    localizationFullScan = false;
    localizationQueue.clear();
  });
}

function refreshLocalizedUi() {
  const likesButton = hosts.likesShuffleHost?.querySelector('.cusade-likes-shuffle__button');
  if (likesButton) {
    likesButton.querySelector('span').textContent = ui('Мои лайки', 'Your likes');
    likesButton.title = ui('Слушать понравившиеся треки в случайном порядке', 'Play your liked tracks in random order');
  }
  if (hosts.visualizationHost) {
    hosts.visualizationHost.setAttribute('aria-label', ui('Визуализация воспроизведения', 'Playback visualization'));
    hosts.visualizationHost.querySelector('.cusade-visualization__wave')?.setAttribute('aria-label', ui('Перемотать трек', 'Seek track'));
    hosts.visualizationHost.querySelector('.cusade-visualization__art')?.setAttribute('alt', ui('Обложка трека', 'Track artwork'));
  }
  if (hosts.panelHost) {
    closePanel();
    togglePanel();
  }
}

async function setAppLanguage(language) {
  const result = await ipcRenderer.invoke(CHANNEL.set('appLanguage'), language);
  state.appLanguage = language;
  if (result.reload) {
    location.reload();
    return true;
  }
  updateLocalizationWatcher();
  if (language === 'ru') scheduleLocalization();
  else restoreSiteLanguage();
  refreshLocalizedUi();
  return false;
}

function releaseRussianTranslation() {
  if (state.appLanguage !== 'ru') return;
  state.appLanguage = 'site';
  updateLocalizationWatcher();
  restoreSiteLanguage();
  refreshLocalizedUi();
  ipcRenderer.invoke(CHANNEL.set('appLanguage'), 'site').catch(error => {
    state.appLanguage = 'ru';
    updateLocalizationWatcher();
    scheduleLocalization();
    refreshLocalizedUi();
    console.error('Could not save cusade language:', error);
  });
}

document.addEventListener('pointerdown', event => {
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  const button = target?.closest('.localeSelectorContent button[data-testid^="language-pick-"]');
  if (button && button.dataset.testid !== 'language-pick-ru-cusade') releaseRussianTranslation();
}, true);

document.addEventListener('click', async event => {
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  const button = target?.closest('.localeSelectorContent button[data-testid^="language-pick-"]');
  if (!button) return;
  const russian = button.dataset.testid === 'language-pick-ru-cusade';
  if (!russian) {
    releaseRussianTranslation();
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  if (state.languageSavePending) return;
  state.languageSavePending = true;
  try {
    const reloading = await setAppLanguage('ru');
    if (!reloading) document.querySelector('.localeSelector__cancel')?.click();
  } catch (error) {
    console.error('Could not save cusade language:', error);
  } finally {
    state.languageSavePending = false;
  }
}, true);

module.exports = {
  translateSite,
  restoreSiteLanguage,
  updateLocalizationWatcher,
  scheduleLocalization,
  refreshLocalizedUi,
  releaseRussianTranslation
};
