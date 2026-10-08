'use strict';

// Generated entries are deliberately keyed by source language, page family and
// control role. A missing context falls back to the existing reviewed glossary.
const entries = require('../../shared/localization-catalog.json');
const bySourceText = new Map();
const templates = new Map();
for (const entry of entries) {
  if (/\{(?:user|count)\}/.test(entry.text)) {
    const parts = entry.text.split(/(\{(?:user|count)\})/);
    const placeholders = parts.filter(part => /^\{/.test(part));
    const expression = parts.map(part => part === '{user}' ? '(.{1,80}?)' :
      part === '{count}' ? '(\\d[\\d.,]*)' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');
    if (!templates.has(entry.source)) templates.set(entry.source, []);
    templates.get(entry.source).push({ entry, placeholders, pattern: new RegExp(`^${expression}$`, 'u') });
    continue;
  }
  const key = `${entry.source}\0${entry.text}`;
  if (!bySourceText.has(key)) bySourceText.set(key, []);
  bySourceText.get(key).push(entry);
}

function contextRole(element, attribute) {
  if (attribute) return attribute;
  const control = element?.closest?.('button, [role="button"], [role="tab"], option, a[href]');
  if (control?.matches?.('[role="tab"]')) return 'tab';
  if (control?.matches?.('button, [role="button"]')) return 'button';
  if (control?.matches?.('option')) return 'option';
  if (control?.matches?.('a[href]')) return 'link';
  if (element?.closest?.('h1, h2, h3, h4, [role="heading"]')) return 'heading';
  return 'text';
}

function catalogValue(value, element, language, page, attribute) {
  const role = contextRole(element, attribute);
  const normalized = value.trim().replace(/\s+/g, ' ').replace(/[\u2018\u2019\u02bc\u00b4]/g, "'");
  let selected = null;
  let score = -1;
  const sources = [language, ...['en', 'it', 'es'].filter(source => source !== language)];
  for (const source of sources) {
    const candidates = bySourceText.get(`${source}\0${normalized}`) || [];
    const dynamic = (templates.get(source) || []).flatMap(({ entry, placeholders, pattern }) => {
      if (normalized === entry.text) return [entry];
      const match = normalized.match(pattern);
      if (!match || match.slice(1).some(part => /[\u0000-\u001f{}]/.test(part))) return [];
      let ru = entry.ru;
      placeholders.forEach((part, index) => { ru = ru.replace(part, match[index + 1]); });
      return [{ ...entry, ru }];
    });
    for (const entry of [...candidates, ...dynamic]) {
      if (entry.pages && !entry.pages.includes(page)) continue;
      if (entry.roles && !entry.roles.includes(role)) continue;
      const candidateScore = (source === language ? 1000 : 0) +
        (/\{(?:user|count)\}/.test(entry.text) ? 0 : 100) +
        (entry.pages ? 100 - entry.pages.length : 0) +
        (entry.roles ? 10 - entry.roles.length : 0);
      if (candidateScore > score) {
        selected = entry.ru;
        score = candidateScore;
      }
    }
  }
  return selected;
}

module.exports = { catalogValue, contextRole };
