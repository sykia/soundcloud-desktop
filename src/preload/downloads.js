'use strict';

const { ipcRenderer } = require('electron');
const { CHANNEL } = require('../../shared/ipc.js');
const { ui } = require('./localization-dict.js');

const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" fill="none"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const DONE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" fill="none"><path d="m4 12 5 5L20 6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ERROR_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M12 7v6m0 4h.01" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
const TARGETS = [
  ['.listenEngagement__footer .sc-button-group', () => location.href],
  ['.sound__footer .sc-button-group', node => node.closest('.sound')?.querySelector('a.soundTitle__title')?.href],
  ['.trackItem .sc-button-group', node => node.closest('.trackItem')?.querySelector('a.trackItem__trackTitle')?.href],
  ['.soundList__item .sc-button-group', node => node.closest('.soundList__item')?.querySelector('a.soundTitle__title')?.href],
  ['.searchItem .sc-button-group', node => node.closest('.searchItem')?.querySelector('a.soundTitle__title')?.href]
];

function trackUrl(value) {
  try {
    const url = new URL(value, location.origin);
    const parts = url.pathname.split('/').filter(Boolean);
    return url.origin === 'https://soundcloud.com' && parts.length === 2 &&
      parts.every(part => /^[\w.-]+$/.test(part)) &&
      !['you', 'settings', 'discover', 'search', 'feed', 'upload', 'studio', 'artists'].includes(parts[0])
      ? `${url.origin}${url.pathname}` : null;
  } catch { return null; }
}

async function clickDownload(button, getUrl) {
  if (button.disabled) return;
  const url = trackUrl(getUrl());
  if (!url) return;
  button.disabled = true;
  button.classList.remove('cusade-download--error', 'cusade-download--done');
  button.classList.add('cusade-download--loading');
  button.innerHTML = ICON;
  button.setAttribute('aria-busy', 'true');
  button.title = ui('Загружаю трек…', 'Downloading track…');
  button.setAttribute('aria-label', button.title);
  try {
    const result = await ipcRenderer.invoke(CHANNEL.downloadTrack, url);
    if (result.error) throw new Error(result.error);
    if (result.saved) {
      button.classList.add('cusade-download--done');
      button.innerHTML = DONE_ICON;
      button.title = ui('Трек сохранён', 'Track saved');
      button.setAttribute('aria-label', button.title);
    } else {
      button.title = ui('Скачать трек', 'Download track');
      button.setAttribute('aria-label', button.title);
    }
  } catch (error) {
    button.classList.add('cusade-download--error');
    button.innerHTML = ERROR_ICON;
    button.title = error.message || ui('Не удалось скачать трек', 'Could not download track');
    button.setAttribute('aria-label', button.title);
    window.alert(button.title);
  } finally {
    button.classList.remove('cusade-download--loading');
    button.removeAttribute('aria-busy');
    button.disabled = false;
  }
}

function addButton(group, getUrl) {
  if (group.querySelector('.cusade-download')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sc-button sc-button-secondary sc-button-medium sc-button-icon sc-button-responsive cusade-download';
  button.title = ui('Скачать трек', 'Download track');
  button.setAttribute('aria-label', button.title);
  button.innerHTML = ICON;
  button.addEventListener('click', event => {
    event.stopPropagation();
    clickDownload(button, getUrl);
  });
  const more = group.querySelector('.sc-button-more, button[aria-label="More menu"]');
  group.insertBefore(button, more || null);
}

function scan() {
  for (const [selector, getUrl] of TARGETS) {
    for (const group of document.querySelectorAll(selector)) {
      if (trackUrl(getUrl(group))) addButton(group, () => getUrl(group));
    }
  }
}

function startDownloads() {
  scan();
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      scan();
    });
  }).observe(document.body, { childList: true, subtree: true });
}

module.exports = { startDownloads };
