'use strict';

const SOURCES = new Set(['en', 'it', 'es']);
const ROLES = new Set(['heading', 'button', 'tab', 'option', 'link', 'text', 'title', 'aria-label', 'placeholder']);

function normalizeText(text) {
  return String(text).trim().replace(/\s+/g, ' ').replace(/[\u2018\u2019\u02bc\u00b4]/g, "'");
}

function templateText(source, text) {
  if (source === 'it' && /^\d[\d.,]* Mi piace$/i.test(text)) return '{count} Mi piace';
  if (source === 'it' && /^\d[\d.,]*% dei caricamenti utilizzati$/i.test(text)) {
    return '{count}% dei caricamenti utilizzati';
  }
  const patterns = {
    en: [[/^Mixed for (.{1,80})$/i, 'Mixed for {user}']],
    it: [[/^Mixato per (.{1,80})$/i, 'Mixato per {user}'],
      [/^Mix per (.{1,80})$/i, 'Mix per {user}'],
      [/^Mix creati per (.{1,80})$/i, 'Mix creati per {user}']],
    es: [[/^Mezclado para (.{1,80})$/i, 'Mezclado para {user}'],
      [/^Mezclas para (.{1,80})$/i, 'Mezclas para {user}']]
  };
  for (const [pattern, template] of patterns[source] || []) {
    const match = text.match(pattern);
    if (match && !/[{}\u0000-\u001f]/.test(match[1])) {
      return template;
    }
  }
  return text;
}

function cleanObservation(value) {
  if (!value || !SOURCES.has(value.source) || !ROLES.has(value.role) ||
      !/^[a-z]+$/.test(value.page || '') || typeof value.text !== 'string') return null;
  if (['profile', 'track', 'playlist'].includes(value.page) &&
      ['heading', 'text', 'link'].includes(value.role)) return null;
  const text = templateText(value.source, normalizeText(value.text));
  if (text.length < 2 || text.length > 120 || /[\u0000-\u001f<>]/.test(text) ||
      /https?:\/\/|@|^[\d\W]+$/.test(text)) return null;
  return { source: value.source, text, page: value.page, role: value.role };
}

function validEntry(entry, source) {
  if (!entry || typeof entry.ru !== 'string' || !/[А-Яа-яЁё]/.test(entry.ru) ||
      entry.ru.length > 180 || /[\u0000-\u001f<>]/.test(entry.ru)) return false;
  const preserved = source.text.match(/(?:SoundCloud|Go\+|Artist Pro|\d+[\d.,%]*|\{[^}]+\})/g) || [];
  return preserved.every(part => entry.ru.includes(part));
}

function contextKey(entry) {
  return JSON.stringify([entry.source, normalizeText(entry.text),
    [...(entry.pages || [])].sort(), [...(entry.roles || [])].sort()]);
}

function observationKey(observation) {
  return contextKey({ source: observation.source, text: observation.text,
    pages: [observation.page], roles: [observation.role] });
}

function expand(entry) {
  const pages = entry.pages?.length ? entry.pages : [null];
  const roles = entry.roles?.length ? entry.roles : [null];
  return pages.flatMap(page => roles.map(role => ({ ...entry,
    ...(page ? { pages: [page] } : { pages: undefined }),
    ...(role ? { roles: [role] } : { roles: undefined })
  })));
}

function mergeCatalog(current, incoming) {
  const entries = new Map();
  for (const entry of current) for (const part of expand(entry)) entries.set(contextKey(part), part);
  for (const entry of incoming) for (const part of expand(entry)) entries.set(contextKey(part), part);
  return [...entries.values()].map(entry => {
    const result = { source: entry.source, text: normalizeText(entry.text), ru: entry.ru.trim() };
    if (entry.pages) result.pages = entry.pages;
    if (entry.roles) result.roles = entry.roles;
    return result;
  }).sort((a, b) => contextKey(a).localeCompare(contextKey(b), 'en'));
}

module.exports = { cleanObservation, validEntry, contextKey, observationKey, mergeCatalog };
