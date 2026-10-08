'use strict';

// SoundCloud's webi iframe has no preload. The injected code only sees the DOM:
// Node, Electron and privileged IPC remain unavailable in the child frame.
const { getSettings } = require('./settings.js');
const { getSourceLocale } = require('./locale.js');
const autoTranslate = require('./auto-translate.js');
const { state } = require('../preload/state.js');
const { translatedValue } = require('../preload/localization-dict.js');
const { catalogValue } = require('../preload/localization-catalog.js');
const veto = require('../preload/localization-veto.js');
const active = new WeakMap();

// Serialized into the ordinary, unprivileged frame world by scriptFor().
function installFrame(config) {
  if (window.__cusadeFrameLocale?.version === 1) return true;
  const translatedText = new Map();
  const translatedAttributes = new Map();
  const optionValues = new Map();
  const pending = new Map();
  const cache = new Map();
  const keyOf = value => String(value || '').trim().replace(/\s+/g, ' ');
  function roleOf(element, attribute) {
    if (attribute) return attribute;
    const control = element.closest('button, [role="button"], [role="tab"], option, a[href]');
    if (control?.matches('[role="tab"]')) return 'tab';
    if (control?.matches('button, [role="button"]')) return 'button';
    if (control?.matches('option')) return 'option';
    if (control?.matches('a[href]')) return 'link';
    if (element.closest('h1, h2, h3, h4, [role="heading"]')) return 'heading';
    return 'text';
  }
  function applyTarget(target, ru, automatic) {
    if (!ru || ru === target.key || !target.element.isConnected ||
        classifyInterface(target.element, target.attribute ? 'attributes' : 'text').kind !== 'ui') return;
    if (target.attribute) {
      if (target.element.getAttribute(target.attribute) !== target.original) return;
      if (!translatedAttributes.has(target.element)) translatedAttributes.set(target.element, new Map());
      translatedAttributes.get(target.element).set(target.attribute,
        { original: target.original, translated: ru, automatic });
      target.element.setAttribute(target.attribute, ru);
      return;
    }
    if (target.node.nodeValue !== target.original) return;
    if (target.element.matches('option') && !target.element.hasAttribute('value')) {
      optionValues.set(target.element, target.original);
      target.element.setAttribute('value', target.original);
    }
    const translated = target.original.includes(target.key)
      ? target.original.replace(target.key, ru) : ru;
    translatedText.set(target.node, { original: target.original, translated, automatic });
    target.node.nodeValue = translated;
  }
  function queue(target) {
    if (!/[A-Za-zÀ-ÿ]/.test(target.key) || /[А-Яа-яЁё]/.test(target.key) ||
        target.key.length > 120 || /^https?:\/\//i.test(target.key)) return;
    const role = roleOf(target.element, target.attribute);
    const id = role + '\0' + target.key;
    if (cache.has(id)) {
      const hit = cache.get(id);
      applyTarget(target, hit.ru, hit.automatic);
      return;
    }
    if (!pending.has(id)) pending.set(id, { id, key: target.key, role,
      fallbackAllowed: isSafeFallback(target.element, target.attribute ? 'attributes' : 'text'),
      targets: [], sent: false });
    const entry = pending.get(id);
    if (entry.targets.length < 100) entry.targets.push(target);
  }
  function inspectText(node) {
    if (!node.nodeValue || translatedText.get(node)?.translated === node.nodeValue) return;
    const element = node.parentElement;
    if (!element || classifyInterface(element).kind !== 'ui') return;
    const key = keyOf(node.nodeValue);
    if (key) queue({ node, element, original: node.nodeValue, key });
  }
  function inspectAttributes(element) {
    if (classifyInterface(element, 'attributes').kind !== 'ui') return;
    for (const attribute of ['title', 'aria-label', 'placeholder']) {
      if (!element.hasAttribute(attribute)) continue;
      const current = element.getAttribute(attribute);
      if (translatedAttributes.get(element)?.get(attribute)?.translated === current) continue;
      const key = keyOf(current);
      if (key) queue({ element, attribute, original: current, key });
    }
  }
  function scan(root = document.body) {
    if (!root || !root.isConnected) return;
    if (root.nodeType === Node.TEXT_NODE) { inspectText(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    if (root.hasAttribute('title') || root.hasAttribute('aria-label') ||
        root.hasAttribute('placeholder')) inspectAttributes(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeType === Node.TEXT_NODE) inspectText(node);
      else if (node.hasAttribute('title') || node.hasAttribute('aria-label') ||
          node.hasAttribute('placeholder')) inspectAttributes(node);
    }
  }
  let scheduled = false;
  const dirty = new Set();
  function schedule(root) {
    dirty.add(root);
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (dirty.size > 100) scan();
      else for (const node of dirty) scan(node);
      dirty.clear();
    });
  }
  function restore() {
    for (const [node, entry] of translatedText) {
      if (node.isConnected && node.nodeValue === entry.translated) node.nodeValue = entry.original;
    }
    for (const [element, entries] of translatedAttributes) {
      if (!element.isConnected) continue;
      for (const [name, entry] of entries) {
        if (element.getAttribute(name) === entry.translated) element.setAttribute(name, entry.original);
      }
    }
    for (const [element, original] of optionValues) {
      if (element.isConnected && element.getAttribute('value') === original) element.removeAttribute('value');
    }
    translatedText.clear();
    translatedAttributes.clear();
    optionValues.clear();
    pending.clear();
    cache.clear();
  }
  function audit() {
    const items = new Map();
    const candidates = [];
    function visit(element, source, rendered, prior, attribute) {
      const key = keyOf(source);
      if (!/[A-Za-zÀ-ÿ]/.test(key) || /^(?:SoundCloud|Go\+|Artist Pro)$/i.test(key) ||
          element.closest('[id*="onetrust"], [class*="onetrust"], [id*="ot-sdk"]') ||
          !element.getClientRects().length) return;
      const verdict = classifyInterface(element, attribute ? 'attributes' : 'text');
      if (verdict.kind === 'skip') return;
      let item = items.get(element);
      if (!item) {
        item = { kind: verdict.kind, translated: true, automatic: false, reasons: new Set() };
        items.set(element, item);
      }
      if (verdict.kind === 'protected') { item.kind = 'protected'; return; }
      if (verdict.kind === 'ambiguous') {
        if (item.kind !== 'protected') item.kind = 'ambiguous';
        item.reasons.add(verdict.reason);
        return;
      }
      if (item.kind !== 'protected' && item.kind !== 'ambiguous') item.kind = 'ui';
      item.automatic ||= Boolean(prior?.automatic);
      const studioControl = config.page === 'studio' &&
        (element.closest('.MuiTab-root') ||
          (element.matches('.MuiTypography-h6') && element.closest('a.MuiLink-underlineNone')));
      if ((config.page === 'upload' || studioControl) && (!prior || prior.automatic) && key.length <= 120 &&
          !/@|https?:\/\//.test(key) &&
          !element.closest('[class*="track"], [class*="Track"], [class*="uploaded"], ' +
            '[class*="Uploaded"], [contenteditable], input, textarea')) {
        candidates.push({ source: config.source, text: key, page: config.page,
          role: roleOf(element, attribute) });
      }
      if (!prior && !/[А-Яа-яЁё]/.test(rendered)) {
        item.translated = false;
        item.reasons.add('fallback-missing-or-rejected');
      }
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement) {
        const prior = translatedText.get(node);
        visit(node.parentElement, prior?.original || node.nodeValue, node.nodeValue, prior);
      }
    }
    for (const element of document.querySelectorAll('[title], [aria-label], [placeholder]')) {
      for (const name of ['title', 'aria-label', 'placeholder']) {
        if (!element.hasAttribute(name)) continue;
        const prior = translatedAttributes.get(element)?.get(name);
        visit(element, prior?.original || element.getAttribute(name), element.getAttribute(name), prior, name);
      }
    }
    const counts = { total: 0, translated: 0, untranslated: 0, machineTranslated: 0,
      ambiguous: 0, protected: 0, protectedUnchanged: 0 };
    const reasons = {};
    const untranslatedItems = [];
    const ambiguousItems = [];
    let index = 0;
    for (const [element, item] of items) {
      if (item.kind === 'protected') { counts.protected++; counts.protectedUnchanged++; }
      else if (item.kind === 'ambiguous') {
        counts.ambiguous++;
        ambiguousItems.push({ index, tag: element.tagName.toLowerCase(), reasons: [...item.reasons] });
      } else {
        counts.total++;
        if (item.translated) counts.translated++;
        else {
          counts.untranslated++;
          untranslatedItems.push({ index, tag: element.tagName.toLowerCase(),
            role: roleOf(element), reasons: [...item.reasons] });
        }
        if (item.automatic) counts.machineTranslated++;
      }
      for (const reason of item.reasons) reasons[reason] = (reasons[reason] || 0) + 1;
      index++;
    }
    return { counts, reasons, untranslatedItems, ambiguousItems,
      candidates: [...new Map(candidates.map(value =>
        [JSON.stringify(value), value])).values()] };
  }
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData' &&
          translatedText.get(record.target)?.translated === record.target.nodeValue) continue;
      if (record.type === 'attributes' && translatedAttributes.get(record.target)
        ?.get(record.attributeName)?.translated === record.target.getAttribute(record.attributeName)) continue;
      if (record.type === 'childList') {
        for (const node of record.addedNodes) schedule(node);
      } else schedule(record.target);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ['title', 'aria-label', 'placeholder'] });
  window.__cusadeFrameLocale = {
    version: 1,
    drain() {
      return [...pending.values()].filter(entry => !entry.sent).slice(0, 50).map(entry => {
        entry.sent = true;
        return { id: entry.id, key: entry.key, role: entry.role,
          fallbackAllowed: entry.fallbackAllowed };
      });
    },
    apply(results) {
      for (const result of results) {
        const entry = pending.get(result.id);
        if (!entry) continue;
        pending.delete(result.id);
        if (!result.ru) continue;
        cache.set(result.id, { ru: result.ru, automatic: result.automatic });
        for (const target of entry.targets) applyTarget(target, result.ru, result.automatic);
      }
    },
    audit,
    stop() { observer.disconnect(); restore(); delete window.__cusadeFrameLocale; }
  };
  scan();
  return true;
}

function scriptFor(config) {
  const selectors = ['CUSADE_OWNED', 'SKIP_TEXT_CONTEXT', 'USER_TEXT_OWN', 'USER_TEXT_INSIDE',
    'FORM_CONTEXT', 'UI_REGION', 'CONTROL_CONTEXT'];
  const declarations = selectors.map(key => 'const ' + key + ' = ' + JSON.stringify(veto[key]) + ';').join('\n');
  return '(() => {\n' + declarations +
    '\nconst state = { pageScope: ' + JSON.stringify(config.page) + ' };\n' +
    '\nconst UI_ROUTE = new RegExp(' + JSON.stringify(veto.UI_ROUTE.source) + ',' +
    JSON.stringify(veto.UI_ROUTE.flags) + ');\n' +
    veto.isContentHref.toString() + '\n' + veto.isTranslatableText.toString() + '\n' +
    veto.classifyInterface.toString() + '\n' + veto.isSafeFallback.toString() + '\n' +
    installFrame.toString() + '\n' +
    'return installFrame(' + JSON.stringify(config) + ');\n})()';
}

function pseudoElement(role) {
  const token = { button: 'button', tab: '[role="tab"]', option: 'option', link: 'a[href]' }[role];
  const control = { matches: selector => Boolean(token &&
    selector.split(',').some(part => part.trim() === token)) };
  return { closest(selector) {
    if (role === 'heading' && selector.split(',').some(part => part.trim() === 'h1')) return control;
    if (token && selector.split(',').some(part => part.trim() === token)) return control;
    return null;
  } };
}

function acceptable(source, result) {
  if (!/[А-Яа-яЁё]/.test(result) || /[\u0000-\u001f<>]/.test(result) ||
      result.length > Math.max(90, source.length * 3) || /avatar|user stats/i.test(source)) return false;
  const parts = source.match(/(?:SoundCloud|Go\+|Artist Pro|\d+[\d.,%]*|\{[^}]+\})/g) || [];
  if (!parts.every(part => result.includes(part))) return false;
  const names = source.match(/\b[A-Z][A-Za-z0-9_]+\b/g) || [];
  return names.length < 2 || names.every(name => result.includes(name));
}

async function translateBatch(page, source, requests) {
  state.pageScope = page;
  state.sourceLanguage = source;
  const results = requests.map(item => {
    const attribute = ['title', 'aria-label', 'placeholder'].includes(item.role) ? item.role : undefined;
    const ru = catalogValue(item.key, pseudoElement(item.role), source, page, attribute) ||
      translatedValue(item.key);
    return { id: item.id, key: item.key, ru, automatic: false };
  });
  const unknown = results.filter((item, index) => !item.ru && requests[index].fallbackAllowed);
  if (unknown.length) {
    const machine = await autoTranslate.translateLabels(source, unknown.map(item => item.key));
    unknown.forEach((item, index) => {
      if (acceptable(item.key, machine[index])) { item.ru = machine[index]; item.automatic = true; }
    });
  }
  return results.map(({ id, ru, automatic }) => ({ id, ru, automatic }));
}

function framePage(url) {
  try {
    const path = new URL(url).pathname;
    if (/^\/upload(?:\/|$)/.test(path)) return 'upload';
    if (/^\/artists(?:\/|$)/.test(path)) return 'studio';
  } catch { /* Ignore non-web pages. */ }
  return null;
}

async function ensure(contents, frame) {
  if (!frame || frame.isDestroyed() || frame.parent !== contents.mainFrame ||
      getSettings().appLanguage !== 'ru' || !framePage(contents.getURL())) return false;
  try { if (new URL(frame.url).origin !== 'https://soundcloud.com') return false; }
  catch { return false; }
  if (active.has(frame)) return true;
  const page = framePage(contents.getURL());
  const source = await getSourceLocale();
  if (!await frame.executeJavaScript(scriptFor({ page, source })).catch(() => false)) return false;
  const task = { busy: false, timer: null };
  active.set(frame, task);
  task.timer = setInterval(async () => {
    if (task.busy) return;
    if (frame.isDestroyed() || contents.isDestroyed()) {
      clearInterval(task.timer);
      active.delete(frame);
      return;
    }
    if (getSettings().appLanguage !== 'ru') {
      clearInterval(task.timer);
      active.delete(frame);
      frame.executeJavaScript('window.__cusadeFrameLocale?.stop()').catch(() => {});
      return;
    }
    task.busy = true;
    try {
      const requests = await frame.executeJavaScript('window.__cusadeFrameLocale?.drain() || []');
      if (requests?.length) {
        const results = await translateBatch(page, source, requests);
        await frame.executeJavaScript('window.__cusadeFrameLocale?.apply(' + JSON.stringify(results) + ')');
      }
    } catch { /* The frame can navigate while a batch is in flight. */ }
    finally { task.busy = false; }
  }, 200);
  return true;
}

function attach(contents) {
  contents.on('did-frame-finish-load', (_event, isMainFrame, processId, routingId) => {
    if (isMainFrame) return;
    const { webFrameMain } = require('electron');
    const frame = webFrameMain.fromId(processId, routingId);
    if (frame) {
      const prior = active.get(frame);
      if (prior) { clearInterval(prior.timer); active.delete(frame); }
      ensure(contents, frame).catch(() => {});
    }
  });
  const timer = setInterval(() => {
    if (contents.isDestroyed()) { clearInterval(timer); return; }
    if (getSettings().appLanguage !== 'ru' || !framePage(contents.getURL())) return;
    for (const frame of contents.mainFrame.frames) ensure(contents, frame).catch(() => {});
  }, 1000);
}

function reset(frame) {
  const task = active.get(frame);
  if (task) clearInterval(task.timer);
  active.delete(frame);
}

async function refresh(contents) {
  if (!contents || contents.isDestroyed()) return;
  for (const frame of contents.mainFrame.frames) {
    if (!active.has(frame)) continue;
    reset(frame);
    await frame.executeJavaScript('window.__cusadeFrameLocale?.stop()').catch(() => {});
    await ensure(contents, frame);
  }
}

module.exports = { attach, ensure, reset, refresh, scriptFor, translateBatch, acceptable };
