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
const { catalogValue, contextRole } = require('./localization-catalog.js');
const { CUSADE_OWNED, classifyInterface, isInterfaceElement, isSafeFallback, isSafeSingleWord } = require('./localization-veto.js');
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
let translatedContext = '';
let translationEpoch = 0;

function lookup(key, element, attribute) {
  return catalogValue(key, element, state.sourceLanguage, state.pageScope, attribute) ||
    translatedValue(key, element);
}

function acceptableAutomatic(source, translated) {
  if (!/[А-Яа-яЁё]/.test(translated) || /[\u0000-\u001f<>]/.test(translated)) return false;
  if (translated.length > Math.max(90, source.length * 3)) return false;
  // A translation that drops product names, numbers, or placeholders is unsafe.
  const protectedParts = source.match(/(?:SoundCloud|Go\+|Artist Pro|\d+[\d.,%]*|\{[^}]+\})/g) || [];
  return protectedParts.every(part => translated.includes(part));
}

function applyAutomatic(target, translated, language) {
  if (state.appLanguage !== 'ru' || state.localizationCapturePaused || state.sourceLanguage !== language ||
      target.epoch !== translationEpoch ||
      target.pageScope !== state.pageScope ||
      !translated || translated === target.key || !target.element.isConnected ||
      !isSafeFallback(target.element, target.attribute ? 'attributes' : 'text') ||
      !acceptableAutomatic(target.key, translated)) return;
  if (target.attribute) {
    if (target.element.getAttribute(target.attribute) !== target.original) return;
    if (!translatedAttributes.has(target.element)) translatedAttributes.set(target.element, new Map());
    translatedAttributes.get(target.element).set(target.attribute,
      { original: target.original, translated, automatic: true });
    target.element.setAttribute(target.attribute, translated);
    return;
  }
  if (target.node.nodeValue !== target.original) return;
  if (target.element.matches('option') && !target.element.hasAttribute('value')) {
    translatedOptionValues.set(target.element, target.original);
    target.element.setAttribute('value', target.original);
  }
  const value = target.original.includes(target.key)
    ? target.original.replace(target.key, translated) : translated;
  translatedText.set(target.node, { original: target.original, translated: value, automatic: true });
  target.node.nodeValue = value;
}

function queueAutomatic(target) {
  const { key } = target;
  if (/^(?:SoundCloud|Go\+|Artist Pro)$/i.test(key) ||
      !/[a-zA-ZÀ-ÿ]/.test(key) || /[А-Яа-яЁё]/.test(key) ||
      key.length > 120 || (key.split(/\s+/).length < 2 &&
        !isSafeSingleWord(target.element, target.attribute ? 'attributes' : 'text')) ||
      /^https?:\/\//i.test(key) || /^(?:ctrl|alt|shift|cmd|⌘)\s*\+/i.test(key) ||
      !isSafeFallback(target.element, target.attribute ? 'attributes' : 'text')) return;
  const language = state.sourceLanguage;
  target.pageScope = state.pageScope;
  target.epoch = translationEpoch;
  const id = `${language}\0${state.pageScope}\0${contextRole(target.element, target.attribute)}\0${key}`;
  if (automaticCache.has(id)) {
    applyAutomatic(target, automaticCache.get(id), language);
    return;
  }
  if (!automaticPending.has(id)) automaticPending.set(id, { id, language, key, targets: [] });
  const targets = automaticPending.get(id).targets;
  if (targets.length < 100) targets.push(target);
  if (!automaticTimer) automaticTimer = setTimeout(flushAutomatic, 80);
}

async function flushAutomatic() {
  automaticTimer = null;
  if (state.appLanguage !== 'ru' || state.localizationCapturePaused) {
    automaticPending.clear();
    return;
  }
  const language = state.sourceLanguage;
  for (const [id, entry] of automaticPending) {
    if (entry.language !== language) automaticPending.delete(id);
  }
  const entries = [...automaticPending.values()].filter(entry => entry.language === language).slice(0, 50);
  for (const entry of entries) automaticPending.delete(entry.id);
  if (automaticPending.size) automaticTimer = setTimeout(flushAutomatic, 80);
  if (!entries.length) return;
  try {
    const translations = await ipcRenderer.invoke(CHANNEL.translateLabels, language,
      entries.map(entry => entry.key));
    entries.forEach((entry, index) => {
      const translation = String(translations[index] || '').trim();
      if (!translation) return;
      if (acceptableAutomatic(entry.key, translation) && automaticCache.size < 3000) automaticCache.set(entry.id, translation);
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
  const translation = lookup(key, element);
  if (!translation) {
    queueAutomatic({ node, element, original: current, key });
    return;
  }
  // An option without a value attribute submits its own text, so the value
  // SoundCloud would have sent is pinned before the label changes.
  if (element.matches('option') && !element.hasAttribute('value')) {
    translatedOptionValues.set(element, current);
    element.setAttribute('value', current);
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
    const translation = lookup(translationKey(current), element, name);
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
  const context = `${state.sourceLanguage}\0${state.pageScope}`;
  if (translatedContext && translatedContext !== context) restoreSiteLanguage();
  translatedContext = context;
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
  translationEpoch += 1;
  translatedContext = '';
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
  for (const [element, pinned] of translatedOptionValues) {
    if (element.isConnected && element.getAttribute('value') === pinned) element.removeAttribute('value');
  }
  translatedOptionValues.clear();
}

// Development audit uses the same classifier and translation state as the
// renderer. Never serialize content text, input values or message bodies.
function auditLocalization() {
  const elements = new Map();
  const candidates = [];
  const source = state.sourceLanguage;
  const page = state.pageScope;
  function visit(element, value, rendered, translated, attribute, automatic) {
    const key = translationKey(value || '');
    if (!key || key.length > 400 || !/[A-Za-zÀ-ÿ]/.test(key) ||
        /^(?:SoundCloud|Go\+|Artist Pro)$/i.test(key) ||
        element.closest('[id*="onetrust"], [class*="onetrust"], [id*="ot-sdk"]') ||
        (element.getClientRects && !element.getClientRects().length)) return;
    const verdict = classifyInterface(element, attribute ? 'attributes' : 'text');
    if (verdict.kind === 'skip') return;
    let item = elements.get(element);
    if (!item) {
      item = { kind: verdict.kind, translated: true, machineTranslated: false,
        reasons: new Set(), protectedUnchanged: true };
      elements.set(element, item);
    }
    if (verdict.kind === 'protected') {
      item.kind = 'protected';
      item.protectedUnchanged &&= !translated;
      return;
    }
    if (verdict.kind === 'ambiguous') {
      if (item.kind !== 'protected') item.kind = 'ambiguous';
      item.reasons.add(verdict.reason);
      return;
    }
    if (item.kind !== 'protected' && item.kind !== 'ambiguous') item.kind = 'ui';
    item.machineTranslated ||= Boolean(automatic);
    const localized = translated || /[А-Яа-яЁё]/.test(rendered || '');
    if (!localized) {
      item.translated = false;
      item.reasons.add(isSafeFallback(element, attribute ? 'attributes' : 'text')
        ? 'fallback-missing-or-rejected' : 'fallback-veto');
    }
    if (!localized || automatic) {
      // Only unambiguous UI labels are eligible for catalog preparation.
      // Account content, messages, profiles and notifications remain out of
      // persisted candidate files even if a control carries their text.
      const catalogRegion = ['settings', 'upload', 'studio'].includes(page) ||
        element.closest('.header__navMenu, .header__moreMenu, .localeSelector, [role="menu"]');
      const template = key.replace(/^(Segui|Non seguire più|Hai iniziato a seguire) .{1,80}$/i,
        '$1 {user}');
      if (catalogRegion && key.length <= 120 && !/@|https?:\/\/|\d|avatar|user stats/i.test(template) &&
          !element.closest('input, textarea, [contenteditable], [class*="account"], [class*="Account"], ' +
            '.header__userNav, [class*="username"], [class*="userName"]')) {
        candidates.push({ source, text: template, page, role: contextRole(element, attribute) });
      }
    }
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement) visit(node.parentElement,
      translatedText.get(node)?.original || node.nodeValue, node.nodeValue,
      translatedText.get(node)?.translated === node.nodeValue, null,
      translatedText.get(node)?.automatic);
  }
  for (const element of document.querySelectorAll('[title], [aria-label], [placeholder]')) {
    for (const name of ['title', 'aria-label', 'placeholder']) {
      if (!element.hasAttribute(name)) continue;
      const prior = translatedAttributes.get(element)?.get(name);
      visit(element, prior?.original || element.getAttribute(name), element.getAttribute(name),
        prior?.translated === element.getAttribute(name), name, prior?.automatic);
    }
  }
  const counts = { total: 0, translated: 0, untranslated: 0, machineTranslated: 0, ambiguous: 0,
    protected: 0, protectedUnchanged: 0 };
  const reasons = {};
  const untranslatedItems = [];
  const ambiguousItems = [];
  let index = 0;
  for (const [element, item] of elements) {
    if (item.kind === 'protected') {
      counts.protected++;
      if (item.protectedUnchanged) counts.protectedUnchanged++;
    } else if (item.kind === 'ambiguous') {
      counts.ambiguous++;
      ambiguousItems.push({ index, tag: element.tagName?.toLowerCase(), reasons: [...item.reasons] });
    }
    else {
      counts.total++;
      if (item.translated) counts.translated++;
      else {
        counts.untranslated++;
        untranslatedItems.push({ index, tag: element.tagName?.toLowerCase(),
          role: contextRole(element), reasons: [...item.reasons] });
      }
      if (item.machineTranslated) counts.machineTranslated++;
    }
    if (item.kind !== 'ui' || !item.translated) {
      for (const reason of item.reasons) reasons[reason] = (reasons[reason] || 0) + 1;
    }
    index++;
  }
  return { counts, reasons, untranslatedItems, ambiguousItems,
    candidates: [...new Map(candidates.map(item =>
    [`${item.source}\0${item.text}\0${item.page}\0${item.role}`, item])).values()] };
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
  document.documentElement?.classList.toggle('cusade-russian',
    state.appLanguage === 'ru' && !state.localizationCapturePaused);
  const options = state.appLanguage === 'ru' && !state.localizationCapturePaused
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
    if (state.appLanguage === 'ru' && !state.localizationCapturePaused) {
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
    if (state.appLanguage === 'ru' && !state.localizationCapturePaused) {
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
  releaseRussianTranslation,
  auditLocalization
};
