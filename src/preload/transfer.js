'use strict';

// Imports metadata inside the existing SoundCloud page. Search, like and
// playlist writes go through SoundCloud's own controls, using the signed-in
// session. No third-party transfer service, API key or password is involved.

const { ipcRenderer, webFrame } = require('electron');
const { CHANNEL } = require('../../shared/ipc.js');
const { state } = require('./state.js');
const { hosts } = require('./hosts.js');
const { ui } = require('./localization-dict.js');
const { exactMatch, autoMatch } = require('./transfer-parser.js');

const SESSION_KEY = 'cusade-transfer-session-v1';
let staged = [];
let stagedSource = '';
let activeRunner = false;
let committing = false;
let stopAfterCurrent = false;

function trackCount(number) {
  if (state.appLanguage !== 'ru') return `${number} ${number === 1 ? 'track' : 'tracks'}`;
  const form = number % 10 === 1 && number % 100 !== 11 ? 'трек' :
    number % 10 >= 2 && number % 10 <= 4 && (number % 100 < 12 || number % 100 > 14) ? 'трека' : 'треков';
  return `${number} ${form}`;
}

function readSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    return session?.version === 1 && Array.isArray(session.items) ? session : null;
  } catch { return null; }
}

function saveSession(session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function closeTransfer() {
  const session = readSession();
  if (session && ['running', 'review'].includes(session.phase)) {
    if (committing) stopAfterCurrent = true;
    else { session.phase = 'paused'; saveSession(session); }
  }
  hosts.transferDialogHost?.remove();
  hosts.transferDialogHost = null;
}

function status(message) {
  const node = hosts.transferDialogHost?.shadowRoot.querySelector('.status');
  if (node) node.textContent = message;
}

function renderSession() {
  const shadow = hosts.transferDialogHost?.shadowRoot;
  if (!shadow) return;
  const session = readSession();
  const setup = shadow.querySelector('.setup');
  const progress = shadow.querySelector('.progress');
  setup.hidden = Boolean(session);
  progress.hidden = !session;
  if (!session) return;
  const done = session.items.filter(item => item.status === 'done').length;
  const missed = session.items.filter(item => ['skipped', 'error'].includes(item.status)).length;
  const current = session.items[session.index];
  shadow.querySelector('.count').textContent = ui(
    `Обработано ${done + missed} из ${session.items.length} · успешно ${done} · пропущено/ошибки ${missed}`,
    `Processed ${done + missed} of ${session.items.length} · added ${done} · skipped/errors ${missed}`
  );
  shadow.querySelector('.current').textContent = current
    ? `${current.artist ? `${current.artist} — ` : ''}${current.title}${current.playlist ? ` · ${current.playlist}` : ''}`
    : ui('Готово', 'Done');
  shadow.querySelector('.phase').textContent = ({
    running: ui('Ищу совпадение и добавляю…', 'Searching and adding…'),
    review: ui('Проверьте совпадение', 'Review the match'),
    paused: ui('Перенос приостановлен', 'Transfer paused'),
    complete: ui('Перенос завершён', 'Transfer complete')
  })[session.phase] || '';
  shadow.querySelector('.resume').hidden = session.phase !== 'paused';
  shadow.querySelector('.skip').hidden = session.phase !== 'review';
  shadow.querySelector('.query-row').hidden = session.phase !== 'review';
  shadow.querySelector('.retry').hidden = session.phase !== 'complete' || !session.items.some(item => item.status === 'error');
  shadow.querySelector('.report').hidden = session.phase !== 'complete';
  shadow.querySelector('.back').hidden = session.phase !== 'complete' || !session.origin.startsWith(location.origin);
  const candidates = shadow.querySelector('.candidates');
  candidates.replaceChildren();
  const results = shadow.querySelector('.results');
  results.replaceChildren();
  if (session.phase === 'complete') {
    for (const item of session.items.filter(entry => entry.status !== 'done').slice(0, 20)) {
      const line = document.createElement('div');
      line.textContent = `${item.artist ? `${item.artist} — ` : ''}${item.title}: ${item.error ||
        ui('не найдено или пропущено', 'not found or skipped')}`;
      results.appendChild(line);
    }
  }
  if (session.phase === 'review') {
    const rows = searchRows();
    if (!rows.length) status(ui('Совпадения не найдены. Измените запрос или пропустите трек.',
      'No matches found. Change the query or skip the track.'));
    for (const candidate of rows.slice(0, 6)) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'candidate';
      button.textContent = `${candidate.artist} — ${candidate.title}`;
      button.addEventListener('click', () => commitCandidate(candidate.href));
      candidates.appendChild(button);
    }
    shadow.querySelector('.query').value = current?.query || [current?.artist, current?.title].filter(Boolean).join(' ');
  }
}

function openTransfer() {
  if (hosts.transferDialogHost?.isConnected) { renderSession(); return; }
  const host = document.createElement('div');
  host.id = 'cusade-transfer-dialog-host';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      *{box-sizing:border-box}[hidden]{display:none!important}
      .backdrop{position:absolute;inset:0;background:#000b}
      .dialog{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
        width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;
        padding:22px;border-radius:16px;border:1px solid #ffffff29;
        background:var(--background-surface-color,#1c1c1c);color:var(--font-primary-color,#fff);
        box-shadow:0 24px 70px #0009;font:14px/1.5 system-ui,sans-serif}
      h2{margin:0;font-size:21px}.top,.actions,.query-row{display:flex;align-items:center;gap:8px}
      .top{justify-content:space-between}p{margin:10px 0;color:var(--font-secondary-color,#bbb)}
      button{font:inherit;cursor:pointer}.close{border:0;background:transparent;color:inherit;font-size:26px}
      select,input,textarea{width:100%;padding:9px;border:1px solid #ffffff32;border-radius:8px;
        background:var(--button-secondary-background-color,#262626);color:inherit;font:inherit}
      textarea{min-height:105px;resize:vertical}.field{display:block;margin:12px 0 4px;font-weight:600}
      .file{width:100%;font-size:12px}.check{display:flex;align-items:center;gap:7px;margin:12px 0}
      .check input{width:auto}.primary,.secondary,.candidate{padding:9px 12px;border-radius:8px;color:inherit}
      .primary{border:0;background:var(--cusade-accent,#ff5500);color:#fff;font-weight:700}
      .secondary,.candidate{border:1px solid #ffffff31;background:transparent}
      .primary:hover,.secondary:hover,.candidate:hover{filter:brightness(1.15)}
      .actions{flex-wrap:wrap;margin-top:15px}.preview,.results{max-height:130px;overflow:auto;
        padding:8px 12px;border-radius:8px;background:#ffffff0d;font-size:12px}
      .preview:empty{display:none}.preview div,.results div{padding:3px 0}
      .count{margin-top:12px;font-weight:600}.current{font-weight:700;color:inherit!important}
      .phase{color:var(--font-special-color,#ff5500)!important}.candidates{display:grid;gap:7px;margin:10px 0}
      .candidate{text-align:left}.query-row input{flex:1}.query-row button{flex:none}
      .status{color:#ff9b77!important;font-size:12px}.fine{font-size:12px}
    </style>
    <div class="backdrop"></div><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="title">
      <div class="top"><h2 id="title">${ui('Перенос музыки в SoundCloud', 'Move music to SoundCloud')}</h2>
        <button class="close" type="button" aria-label="${ui('Закрыть', 'Close')}">×</button></div>
      <div class="setup">
        <p>${ui('Вставьте публичную ссылку на плейлист Яндекс Музыки, Apple Music, Spotify или YouTube Music. Подходит и ссылка «Мне нравится» Яндекс Музыки.',
          'Paste a public Yandex Music, Apple Music, Spotify or YouTube Music playlist link. Yandex Music Liked Songs links also work.')}</p>
        <label class="field" for="source-url">${ui('Ссылка на плейлист', 'Playlist link')}</label>
        <input id="source-url" type="url" spellcheck="false" placeholder="https://music.yandex.ru/playlists/…">
        <label class="check"><input id="also-like" type="checkbox">${ui('Треки плейлистов тоже добавить в лайки', 'Also like playlist tracks')}</label>
        <label class="check"><input id="auto-match" type="checkbox">${ui('Автоматический режим: выбирать совпадения без подтверждения',
          'Automatic mode: choose matches without confirmation')}</label>
        <button class="primary prepare" type="button">${ui('Загрузить треки', 'Load tracks')}</button>
        <div class="preview"></div>
        <button class="primary start" type="button" hidden>${ui('Начать перенос', 'Start transfer')}</button>
        <p class="fine">${ui('Автоматический режим пропускает сомнительные совпадения и отмечает их в отчёте. Spotify и YouTube Music могут показать только часть длинного списка; такой список не переносится. Новые плейлисты создаются приватными.',
          'Automatic mode skips uncertain matches and lists them in the report. Spotify and YouTube Music may show only part of long lists; those lists are rejected. New playlists are private.')}</p>
      </div>
      <div class="progress" hidden>
        <div class="count"></div><p class="phase"></p><p class="current"></p>
        <div class="candidates"></div>
        <div class="query-row" hidden><input class="query" type="search" aria-label="${ui('Поисковый запрос', 'Search query')}">
          <button class="secondary search" type="button">${ui('Искать', 'Search')}</button></div>
        <div class="actions"><button class="secondary skip" type="button" hidden>${ui('Пропустить', 'Skip')}</button>
          <button class="primary resume" type="button" hidden>${ui('Продолжить', 'Resume')}</button>
          <button class="secondary retry" type="button" hidden>${ui('Повторить ошибки', 'Retry errors')}</button>
          <button class="secondary report" type="button" hidden>${ui('Скачать отчёт', 'Download report')}</button>
          <button class="secondary back" type="button" hidden>${ui('Вернуться назад', 'Return to previous page')}</button>
          <button class="secondary cancel" type="button">${ui('Закончить и очистить', 'Finish and clear')}</button></div>
        <div class="results"></div>
      </div>
      <p class="status" role="status"></p>
    </section>`;
  hosts.transferDialogHost = host;
  document.body.appendChild(host);
  shadow.querySelector('.close').addEventListener('click', closeTransfer);
  shadow.querySelector('.backdrop').addEventListener('click', closeTransfer);
  host.addEventListener('keydown', event => { if (event.key === 'Escape') closeTransfer(); });
  shadow.querySelector('.prepare').addEventListener('click', prepareInput);
  shadow.querySelector('.start').addEventListener('click', startTransfer);
  shadow.querySelector('.resume').addEventListener('click', () => {
    const session = readSession(); if (!session) return;
    session.phase = 'running'; saveSession(session); renderSession(); resumeTransfer();
  });
  shadow.querySelector('.skip').addEventListener('click', () => completeItem('skipped'));
  shadow.querySelector('.search').addEventListener('click', () => {
    const session = readSession(); if (!session) return;
    session.items[session.index].query = shadow.querySelector('.query').value.trim().slice(0, 200);
    session.phase = 'running'; saveSession(session); navigateToCurrent();
  });
  shadow.querySelector('.retry').addEventListener('click', () => {
    const session = readSession(); if (!session) return;
    for (const item of session.items) if (item.status === 'error') item.status = 'pending';
    session.index = session.items.findIndex(item => item.status === 'pending');
    session.phase = 'running'; saveSession(session); navigateToCurrent();
  });
  shadow.querySelector('.report').addEventListener('click', downloadReport);
  shadow.querySelector('.back').addEventListener('click', () => {
    const session = readSession();
    if (session?.phase === 'complete' && session.origin.startsWith(location.origin)) location.replace(session.origin);
  });
  shadow.querySelector('.cancel').addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY); staged = []; renderSession(); syncTransferButton(); status('');
  });
  renderSession();
  shadow.querySelector('.close').focus();
}

async function prepareInput() {
  const shadow = hosts.transferDialogHost?.shadowRoot;
  if (!shadow) return;
  const button = shadow.querySelector('.prepare');
  button.disabled = true;
  shadow.querySelector('.start').hidden = true;
  staged = [];
  try {
    status(ui('Загружаю список треков…', 'Loading tracks…'));
    const result = await ipcRenderer.invoke(CHANNEL.resolveImportUrl, shadow.querySelector('#source-url').value);
    if (!shadow.isConnected) return;
    staged = result.items;
    stagedSource = result.source;
    if (!staged.length) throw new Error(ui('На странице нет доступных треков.', 'No available tracks on the page.'));
    const preview = shadow.querySelector('.preview'); preview.replaceChildren();
    const heading = document.createElement('strong');
    heading.textContent = `${result.name} · ${trackCount(staged.length)}`;
    preview.appendChild(heading);
    if (result.unavailable) {
      const note = document.createElement('div');
      note.textContent = ui(`Недоступны в источнике: ${result.unavailable} из ${result.total}.`,
        `Unavailable at source: ${result.unavailable} of ${result.total}.`);
      preview.appendChild(note);
    }
    for (const item of staged.slice(0, 5)) {
      const line = document.createElement('div');
      line.textContent = `${item.artist ? `${item.artist} — ` : ''}${item.title}${item.playlist ? ` · ${item.playlist}` : ''}`;
      preview.appendChild(line);
    }
    shadow.querySelector('.start').hidden = false;
    status('');
  } catch (error) {
    staged = []; shadow.querySelector('.start').hidden = true;
    status(ui(`Не удалось загрузить треки: ${error.message}`, `Could not load tracks: ${error.message}`));
  } finally {
    button.disabled = false;
  }
}

function startTransfer() {
  if (!staged.length) return;
  if (!document.querySelector('.header__userNav')) {
    status(ui('Войдите в SoundCloud и повторите.', 'Sign in to SoundCloud and try again.')); return;
  }
  const shadow = hosts.transferDialogHost.shadowRoot;
  const alsoLike = shadow.querySelector('#also-like').checked;
  const auto = shadow.querySelector('#auto-match').checked;
  const unique = new Set();
  const items = staged.filter(item => {
    const key = `${item.title}\0${item.artist}\0${item.playlist}`.toLocaleLowerCase();
    if (unique.has(key)) return false;
    unique.add(key); return true;
  }).map(item => ({ ...item, liked: item.liked || (alsoLike && Boolean(item.playlist)),
    status: 'pending', likeDone: false, playlistDone: false, query: '' }));
  const session = { version: 1, phase: 'running', index: 0, items, created: [], auto,
    origin: location.href, source: stagedSource };
  try { saveSession(session); }
  catch { status(ui('Список слишком велик для текущей сессии.', 'The list is too large for this session.')); return; }
  staged = []; renderSession(); navigateToCurrent();
}

function searchUrl(item) {
  const query = item.query || [item.artist, item.title].filter(Boolean).join(' ');
  return `${location.origin}/search/sounds?q=${encodeURIComponent(query)}`;
}

function navigateToCurrent() {
  const session = readSession();
  if (!session || session.phase !== 'running') return;
  const item = session.items[session.index];
  if (!item) { session.phase = 'complete'; saveSession(session); renderSession(); return; }
  const url = searchUrl(item);
  if (location.href !== url) { location.replace(url); return; }
  processCurrent();
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function waitFor(predicate, timeout = 12000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const result = predicate(); if (result) return result;
    await sleep(250);
  }
  return null;
}

function searchRows() {
  return [...document.querySelectorAll('.searchItem .searchItem__trackItem')].map(row => ({
    row,
    title: row.querySelector('.soundTitle__title')?.textContent.trim() || '',
    artist: row.querySelector('.soundTitle__usernameText')?.textContent.trim() || '',
    href: row.querySelector('.soundTitle__title')?.getAttribute('href') || ''
  })).filter(item => item.title && item.href.startsWith('/') && item.row.querySelector('.sc-button-like'));
}

async function processCurrent() {
  if (activeRunner) return;
  activeRunner = true;
  try {
    const session = readSession();
    if (!session || session.phase !== 'running') return;
    openTransfer(); renderSession();
    await waitFor(() => searchRows().length || document.querySelector('.searchList__noResults'), 15000);
    if (readSession()?.phase !== 'running') return;
    const current = session.items[session.index];
    const exact = searchRows().filter(candidate => exactMatch(current, candidate));
    if (exact.length === 1) { await commitCandidate(exact[0].href); return; }
    if (session.auto) {
      const selected = autoMatch(current, searchRows());
      if (selected) await commitCandidate(selected.href);
      else {
        current.error = ui('Надёжное совпадение не найдено', 'No confident match found');
        completeItem('skipped');
      }
      return;
    }
    session.phase = 'review'; saveSession(session); renderSession();
  } finally { activeRunner = false; }
}

async function commitCandidate(href) {
  const session = readSession();
  if (!session || !['running', 'review'].includes(session.phase)) return;
  const candidate = searchRows().find(row => row.href === href);
  if (!candidate) { status(ui('Результат поиска исчез. Повторите поиск.', 'The result disappeared. Search again.')); return; }
  session.phase = 'running'; saveSession(session); renderSession();
  const item = session.items[session.index];
  item.match = { title: candidate.title, artist: candidate.artist, href: candidate.href };
  committing = true;
  try {
    if (item.liked && !item.likeDone) {
      const button = candidate.row.querySelector('.sc-button-like');
      if (!button?.classList.contains('sc-button-selected')) {
        button.click();
        if (!await waitFor(() => button.classList.contains('sc-button-selected'), 6000)) {
          throw new Error('Like was not confirmed');
        }
      }
      item.likeDone = true; saveSession(session);
    }
    if (item.playlist && !item.playlistDone) {
      await addToPlaylist(candidate, item.playlist, session);
      item.playlistDone = true; saveSession(session);
    }
    completeItem('done');
  } catch (error) {
    item.error = error.message; saveSession(session);
    console.error('Could not transfer track:', error);
    completeItem('error');
  } finally { committing = false; }
}

async function addToPlaylist(candidate, title, session) {
  const more = candidate.row.querySelector('.sc-button-more');
  if (!more) throw new Error('More menu is unavailable');
  more.click();
  const add = await waitFor(() => document.querySelector('.dropdownMenu .sc-button-addtoset'), 3000);
  if (!add) throw new Error('Add to playlist action is unavailable');
  add.click();
  const tabs = await waitFor(() => document.querySelector('.modal .addToPlaylistTabs'), 7000);
  if (!tabs) throw new Error('Playlist dialog did not open');
  if (!session.created.includes(title)) {
    const createTab = await waitFor(() => [...document.querySelectorAll('.modal .addToPlaylistTabs .tabs__tab')]
      .find(tab => /create a playlist|создать плейлист/i.test(tab.textContent)), 5000);
    if (!createTab) throw new Error('Create playlist tab is unavailable');
    createTab.click();
    const input = await waitFor(() => document.querySelector('.modal .createPlaylist__title input'), 7000);
    if (!input) throw new Error('Playlist title input is unavailable');
    input.focus();
    input.select();
    webFrame.insertText(title);
    document.querySelector('.modal label[data-radio-value="private"]')?.click();
    document.querySelector('.modal .createPlaylist__saveButton')?.click();
    const saved = await waitFor(() => {
      const alert = [...document.querySelectorAll('[role="alert"]')].some(node => node.textContent.includes(title));
      const currentTabs = document.querySelector('.modal .addToPlaylistTabs');
      return alert || Boolean(currentTabs?.textContent.includes(title) &&
        /Go to playlist|Перейти к плейлисту/i.test(currentTabs.textContent));
    }, 10000);
    if (!saved) throw new Error('Playlist creation was not confirmed');
    session.created.push(title); saveSession(session);
  } else {
    const listTab = [...tabs.querySelectorAll('.tabs__tab')].find(tab => /add to playlist|добавить в плейлист/i.test(tab.textContent));
    listTab?.click();
    const findRow = () => [...tabs.querySelectorAll('.addToPlaylistList__item')]
      .find(row => row.querySelector('.addToPlaylistItem__titleLink')?.textContent.trim() === title);
    let row = await waitFor(findRow, 4000);
    if (!row) {
      const filter = tabs.querySelector('.addToPlaylistList input');
      if (filter) {
        filter.focus(); filter.select(); webFrame.insertText(title);
        row = await waitFor(findRow, 4000);
      }
    }
    if (!row) throw new Error('Created playlist is unavailable');
    const button = row.querySelector('.addToPlaylistButton');
    if (!button) throw new Error('Playlist button is unavailable');
    if (!/remove|удал/i.test(button.textContent)) {
      button.click();
      if (!await waitFor(() => /remove|удал/i.test(button.textContent) ||
        [...document.querySelectorAll('[role="alert"]')].some(node => node.textContent.includes(title)), 7000)) {
        throw new Error('Adding to playlist was not confirmed');
      }
    }
  }
  document.querySelector('.modal .modal__closeButton')?.click();
}

function completeItem(result) {
  const session = readSession(); if (!session) return;
  const item = session.items[session.index]; if (!item) return;
  item.status = result;
  session.index = session.items.findIndex((entry, index) => index > session.index && entry.status === 'pending');
  session.phase = session.index < 0 ? 'complete' : stopAfterCurrent ? 'paused' : 'running';
  stopAfterCurrent = false;
  saveSession(session); renderSession();
  status('');
  if (session.phase === 'running') setTimeout(navigateToCurrent, 800);
  else if (session.origin.startsWith(location.origin) && location.href !== session.origin) {
    // Keep the report visible; the user can return to the previous page at will.
    status(ui('Готово. Отчёт можно скачать ниже.', 'Done. You can download the report below.'));
  }
}

function downloadReport() {
  const session = readSession(); if (!session) return;
  const rows = [['Площадка', 'Исходный трек', 'Исполнитель', 'Плейлист', 'Статус',
    'Найденный трек', 'Автор в SoundCloud', 'Ссылка SoundCloud', 'Ошибка']];
  for (const item of session.items) rows.push([session.source, item.title, item.artist, item.playlist,
    item.status, item.match?.title || '', item.match?.artist || '', item.match?.href || '', item.error || '']);
  const csv = rows.map(row => row.map(value => {
    const safe = /^[=+\-@]/.test(String(value || '')) ? `'${value}` : String(value || '');
    return `"${safe.replace(/"/g, '""')}"`;
  }).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'cusade-transfer-report.csv';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function hideTransfer() {
  const previous = state.showTransferButton;
  state.showTransferButton = false; syncTransferButton();
  try { await ipcRenderer.invoke(CHANNEL.set('showTransferButton'), false); }
  catch (error) { state.showTransferButton = previous; syncTransferButton(); console.error('Could not hide transfer button:', error); }
}

function syncTransferButton() {
  if (!state.settingsLoaded || !state.showTransferButton) {
    hosts.transferHost?.remove(); hosts.transferHost = null; return;
  }
  const language = document.querySelector('.footer__localeSelector:has(.localeSelector)');
  if (!language?.parentElement) { hosts.transferHost?.remove(); hosts.transferHost = null; return; }
  if (!hosts.transferHost) {
    const box = document.createElement('div'); box.className = 'cusade-transfer';
    box.innerHTML = `<button class="cusade-transfer__open" type="button"></button>
      <button class="cusade-transfer__more" type="button" aria-haspopup="true" aria-expanded="false">⋯</button>
      <div class="cusade-transfer__menu" hidden><button type="button"></button></div>`;
    box.querySelector('.cusade-transfer__open').addEventListener('click', openTransfer);
    const more = box.querySelector('.cusade-transfer__more');
    const menu = box.querySelector('.cusade-transfer__menu');
    more.addEventListener('click', () => { menu.hidden = !menu.hidden; more.setAttribute('aria-expanded', String(!menu.hidden)); });
    menu.querySelector('button').addEventListener('click', hideTransfer);
    hosts.transferHost = box;
  }
  const box = hosts.transferHost;
  const session = readSession();
  box.querySelector('.cusade-transfer__open').textContent = session?.phase === 'complete'
    ? ui('Отчёт переноса', 'Transfer report') : session
      ? ui('Продолжить перенос', 'Resume transfer') : ui('Перенести музыку', 'Move music');
  box.querySelector('.cusade-transfer__more').setAttribute('aria-label', ui('Меню переноса', 'Transfer menu'));
  box.querySelector('.cusade-transfer__menu button').textContent = ui('Скрыть кнопку', 'Hide button');
  if (box.nextElementSibling !== language) language.before(box);
}

function resumeTransfer() {
  const session = readSession();
  if (!session) return;
  syncTransferButton();
  if (session.phase === 'running') { openTransfer(); navigateToCurrent(); }
}

module.exports = { syncTransferButton, openTransfer, closeTransfer, resumeTransfer };
