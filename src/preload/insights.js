'use strict';

// cusade Insights: banner, drag/resize, history modal and the shareable card.
// All module state (insightsDropZones, insightPlayback, the drag session, ...)
// stays here; the layout and visibility settings live in the shared state.
// updateInsightsRestoreControl lives here too, so panel.js only imports one-way.

const { ipcRenderer } = require('electron');
const { CHANNEL } = require('../../shared/ipc.js');
const { state } = require('./state.js');
const { hosts } = require('./hosts.js');
const { ui } = require('./localization-dict.js');
const { motionActive } = require('./motion.js');
const { syncArtworkPage, syncPageScope } = require('./page-scope.js');
const { syncHomeLikesButton } = require('./likes.js');
const {
  playbackSeconds,
  syncVisiblePlayback,
  artworkThemeColor,
  fallbackPlaybackColor,
  getPlaybackThemeColor,
  getPlaybackThemeArtwork
} = require('./visualization.js');

let insightsFeedSlot = null;
let insightsLayoutSave = Promise.resolve();
let insightsDropZones = [];
let insightsEditMode = false;
let insightsDrag = null;
let insightsResize = null;
let suppressInsightsClickUntil = 0;
let insightsMissingSince = 0;
let insightPlayback = null;

function insightsContainers() {
  const main = document.querySelector('[data-test-id="home"]')?.closest('.l-main');
  return main ? {
    main,
    sidebar: main.parentElement.querySelector('.streamSidebar'),
    feed: main.querySelector('[data-test-id="home"] .lazyLoadingList__list')
  } : null;
}

function insightsItems(container) {
  return [...container.children].filter(child =>
    child !== hosts.insightsBanner && child !== insightsFeedSlot && !child.classList.contains('cusade-insights-dropzone'));
}

function applyInsightsDimensions() {
  if (hosts.insightsBanner) {
    const width = state.insightsLayout.width ? `${state.insightsLayout.width}px` : '100%';
    const height = state.insightsLayout.height ? `${state.insightsLayout.height}px` : '';
    if (hosts.insightsBanner.style.width !== width) hosts.insightsBanner.style.width = width;
    if (hosts.insightsBanner.style.height !== height) hosts.insightsBanner.style.height = height;
  }
  const frame = insightsContainers()?.main.parentElement;
  if (!frame) return;
  const wide = state.insightsLayout.location === 'sidebar' && state.insightsLayout.width > 360 && hosts.insightsBanner?.isConnected;
  if (frame.classList.contains('cusade-insights-wide-sidebar') !== Boolean(wide)) {
    frame.classList.toggle('cusade-insights-wide-sidebar', wide);
  }
  const sidebarWidth = wide ? `${state.insightsLayout.width + 24}px` : '';
  if (frame.style.getPropertyValue('--cusade-insights-sidebar-width') !== sidebarWidth) {
    if (sidebarWidth) frame.style.setProperty('--cusade-insights-sidebar-width', sidebarWidth);
    else frame.style.removeProperty('--cusade-insights-sidebar-width');
  }
}

function placeInsights() {
  const containers = insightsContainers();
  if (!containers) return;
  const location = containers[state.insightsLayout.location] ? state.insightsLayout.location
    : containers.sidebar ? 'sidebar' : 'main';
  const container = containers[location];
  if (!container) return;
  if (location === 'feed') {
    if (!insightsFeedSlot) {
      insightsFeedSlot = document.createElement('li');
      insightsFeedSlot.className = 'cusade-insights-slot';
    }
    insightsFeedSlot.append(hosts.insightsBanner);
    const items = insightsItems(container);
    container.insertBefore(insightsFeedSlot, items[state.insightsLayout.index] || null);
  } else {
    insightsFeedSlot?.remove();
    const items = insightsItems(container);
    container.insertBefore(hosts.insightsBanner, items[state.insightsLayout.index] || null);
  }
  applyInsightsDimensions();
}

function saveInsightsLayout(previous) {
  const selected = { ...state.insightsLayout };
  insightsLayoutSave = insightsLayoutSave.then(async () => {
    try {
      await ipcRenderer.invoke(CHANNEL.setInsightsLayout, selected);
    } catch (error) {
      if (Object.keys(selected).every(key => state.insightsLayout[key] === selected[key])) {
        state.insightsLayout = previous;
        placeInsights();
        renderInsightsDropZones();
      }
      console.error('Could not save cusade Insights layout:', error);
    }
  });
  return insightsLayoutSave;
}

function clearInsightsDropZones() {
  for (const zone of insightsDropZones) zone.remove();
  insightsDropZones = [];
}

function renderInsightsDropZones() {
  clearInsightsDropZones();
  if (!insightsEditMode) return;
  const containers = insightsContainers();
  if (!containers) return;
  for (const [location, container] of Object.entries(containers)) {
    if (!container) continue;
    const items = insightsItems(container);
    for (let index = 0; index <= items.length; index++) {
      const zone = document.createElement(location === 'feed' ? 'li' : 'button');
      zone.className = 'cusade-insights-dropzone';
      zone.dataset.location = location;
      zone.dataset.index = String(index);
      zone.textContent = '＋ Insights';
      zone.setAttribute('aria-label', ui('Поместить Insights сюда', 'Place Insights here'));
      if (location === 'feed') { zone.tabIndex = 0; zone.setAttribute('role', 'button'); }
      else zone.type = 'button';
      const move = () => moveInsightsTo(location, index);
      zone.addEventListener('click', event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        move();
      });
      zone.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault(); event.stopImmediatePropagation(); move();
        }
      });
      container.insertBefore(zone, items[index] || null);
      insightsDropZones.push(zone);
    }
  }
}

function finishInsightsEdit() {
  clearInsightsDrag();
  insightsEditMode = false;
  document.documentElement.classList.remove('cusade-insights-editing');
  clearInsightsDropZones();
  document.querySelector('.cusade-insights-editbar')?.remove();
}

// The panel's "Show Insights now" block: hidden once the banner is out of
// hiding, and shown again (with the date) while the hide is active.
function updateInsightsRestoreControl() {
  const restore = hosts.panelHost?.shadowRoot.querySelector('.insights-restore');
  if (!restore) return;
  restore.hidden = state.insightsHiddenUntil <= Date.now();
  const until = restore.querySelector('span');
  if (until) until.textContent = ui('Insights скрыт до', 'Insights hidden until') +
    ` ${formatInsightDate(state.insightsHiddenUntil)}.`;
}

function clearInsightsDrag() {
  insightsDrag?.ghost?.remove();
  document.querySelectorAll('.cusade-insights-drag-ghost').forEach(ghost => ghost.remove());
  insightsDrag = null;
  document.documentElement.classList.remove('cusade-insights-dragging');
  for (const zone of insightsDropZones) zone.classList.remove('cusade-insights-dropzone--active');
}

function moveInsightsTo(location, index) {
  const previous = { ...state.insightsLayout };
  const changedColumn = location !== state.insightsLayout.location;
  state.insightsLayout = { ...state.insightsLayout, location, index,
    width: changedColumn ? 0 : state.insightsLayout.width,
    height: changedColumn ? 0 : state.insightsLayout.height };
  placeInsights();
  renderInsightsDropZones();
  saveInsightsLayout(previous);
}

function nearestInsightsDropZone(x, y) {
  let selected;
  let bestDistance = Infinity;
  for (const zone of insightsDropZones) {
    const rect = zone.getBoundingClientRect();
    const dx = Math.max(rect.left - x, 0, x - rect.right);
    const dy = Math.max(rect.top - y, 0, y - rect.bottom);
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) { bestDistance = distance; selected = zone; }
  }
  return selected;
}

function startInsightsEdit() {
  if (insightsEditMode) return;
  insightsEditMode = true;
  document.documentElement.classList.add('cusade-insights-editing');
  const bar = document.createElement('div');
  bar.className = 'cusade-insights-editbar';
  const hint = document.createElement('span');
  hint.textContent = ui('Зажмите карточку и перенесите. Тяните за угол, чтобы изменить размер.',
    'Hold and drag the card. Drag the corner to resize.');
  const done = document.createElement('button');
  done.type = 'button'; done.textContent = ui('Готово', 'Done');
  done.addEventListener('click', finishInsightsEdit);
  bar.append(hint, done);
  document.body.append(bar);
  renderInsightsDropZones();
}

function createInsightsBanner() {
  const banner = document.createElement('article');
  banner.className = 'cusade-insights-banner';
  const top = document.createElement('div'); top.className = 'cusade-insights-banner__top';
  const copy = document.createElement('div');
  const title = document.createElement('strong'); title.textContent = 'cusade Insights';
  const detail = document.createElement('p');
  detail.textContent = ui('Ваш музыкальный дневник и статистика прослушиваний.',
    'Your music diary and listening stats.');
  copy.append(title, detail);
  const more = document.createElement('button');
  more.type = 'button'; more.className = 'cusade-insights-banner__more';
  more.textContent = '⋯'; more.setAttribute('aria-label', ui('Меню Insights', 'Insights menu'));
  more.setAttribute('aria-expanded', 'false');
  const menu = document.createElement('div'); menu.className = 'cusade-insights-banner__menu'; menu.hidden = true;
  const move = document.createElement('button'); move.type = 'button';
  move.textContent = ui('Перенести', 'Move');
  move.addEventListener('click', () => { menu.hidden = true; more.setAttribute('aria-expanded', 'false'); startInsightsEdit(); });
  const hide = document.createElement('button'); hide.type = 'button';
  hide.textContent = ui('Скрыть на 3 дня', 'Hide for 3 days');
  hide.addEventListener('click', async () => {
    hide.disabled = true;
    try {
      state.insightsHiddenUntil = await ipcRenderer.invoke(CHANNEL.hideInsights);
      finishInsightsEdit();
      syncInsightsBanner();
      updateInsightsRestoreControl();
    } catch (error) { console.error('Could not hide cusade Insights:', error); hide.disabled = false; }
  });
  menu.append(move, hide);
  more.addEventListener('click', () => {
    menu.hidden = !menu.hidden;
    more.setAttribute('aria-expanded', String(!menu.hidden));
  });
  top.append(copy, more);
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'cusade-insights-banner__open';
  button.textContent = ui('Моя статистика →', 'My insights →');
  button.addEventListener('click', openInsights);
  const resize = document.createElement('button');
  resize.type = 'button'; resize.className = 'cusade-insights-banner__resize';
  resize.setAttribute('aria-label', ui('Изменить размер Insights', 'Resize Insights'));
  resize.addEventListener('pointerdown', event => {
    if (!insightsEditMode) return;
    event.preventDefault();
    const rect = banner.getBoundingClientRect();
    insightsResize = { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      width: rect.width, height: rect.height,
      previous: { ...state.insightsLayout } };
  });
  banner.addEventListener('pointerdown', event => {
    if (!insightsEditMode || event.button !== 0 || event.target.closest('button')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const rect = banner.getBoundingClientRect();
    insightsDrag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, width: rect.width,
      height: rect.height, ghost: null, zone: null };
  });
  banner.append(top, button, menu, resize);
  return banner;
}

document.addEventListener('pointermove', event => {
  if (insightsResize?.pointerId === event.pointerId) {
    event.preventDefault();
    state.insightsLayout.width = Math.max(240, Math.min(state.insightsLayout.location === 'sidebar' ? 600 : 900,
      Math.round(insightsResize.width + event.clientX - insightsResize.x)));
    state.insightsLayout.height = Math.max(120, Math.min(800,
      Math.round(insightsResize.height + event.clientY - insightsResize.y)));
    applyInsightsDimensions();
    return;
  }
  const drag = insightsDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  if (!drag.ghost && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
  event.preventDefault();
  if (!drag.ghost) {
    drag.ghost = hosts.insightsBanner.cloneNode(true);
    drag.ghost.classList.add('cusade-insights-drag-ghost');
    drag.ghost.style.width = `${drag.width}px`;
    drag.ghost.style.height = `${drag.height}px`;
    document.body.append(drag.ghost);
    document.documentElement.classList.add('cusade-insights-dragging');
  }
  drag.ghost.style.left = `${event.clientX - drag.offsetX}px`;
  drag.ghost.style.top = `${event.clientY - drag.offsetY}px`;
  if (event.clientY < 75) window.scrollBy(0, -14);
  else if (event.clientY > window.innerHeight - 80) window.scrollBy(0, 14);
  const zone = nearestInsightsDropZone(event.clientX, event.clientY);
  if (zone !== drag.zone) {
    drag.zone?.classList.remove('cusade-insights-dropzone--active');
    zone?.classList.add('cusade-insights-dropzone--active');
    drag.zone = zone;
  }
}, true);

function endInsightsDrag(event) {
  if (insightsResize?.pointerId === event.pointerId) {
    const previous = insightsResize.previous;
    insightsResize = null;
    saveInsightsLayout(previous);
    return;
  }
  const drag = insightsDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const zone = drag.ghost ? drag.zone : null;
  if (drag.ghost) {
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressInsightsClickUntil = Date.now() + 300;
  }
  clearInsightsDrag();
  if (zone?.isConnected && event.type === 'pointerup') {
    moveInsightsTo(zone.dataset.location, Number(zone.dataset.index));
  }
}

document.addEventListener('pointerup', endInsightsDrag, true);
document.addEventListener('pointercancel', endInsightsDrag, true);
document.addEventListener('click', event => {
  if (Date.now() < suppressInsightsClickUntil) {
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressInsightsClickUntil = 0;
  }
}, true);

function syncInsightsBanner() {
  const containers = insightsContainers();
  if (!containers) {
    if (!insightsMissingSince) insightsMissingSince = Date.now();
    if (Date.now() - insightsMissingSince < 3000) return;
  } else insightsMissingSince = 0;
  if (!containers || state.insightsHiddenUntil > Date.now()) {
    hosts.insightsBanner?.remove();
    insightsFeedSlot?.remove();
    if (state.insightsHiddenUntil > Date.now()) {
      if (insightsEditMode) finishInsightsEdit();
    } else clearInsightsDropZones();
    applyInsightsDimensions();
    return;
  }
  if (!hosts.insightsBanner) hosts.insightsBanner = createInsightsBanner();
  const expected = state.insightsLayout.location === 'feed' ? insightsFeedSlot : containers[state.insightsLayout.location];
  const actualContainer = state.insightsLayout.location === 'feed' ? containers.feed : containers[state.insightsLayout.location];
  const node = state.insightsLayout.location === 'feed' ? insightsFeedSlot : hosts.insightsBanner;
  const positioned = actualContainer && node?.parentElement === actualContainer &&
    [...actualContainer.children].filter(child => !child.classList.contains('cusade-insights-dropzone'))
      .indexOf(node) === Math.min(state.insightsLayout.index, insightsItems(actualContainer).length);
  if (!hosts.insightsBanner.isConnected || !expected ||
      (state.insightsLayout.location === 'feed' && insightsFeedSlot?.parentElement !== containers.feed) ||
      (state.insightsLayout.location !== 'feed' && hosts.insightsBanner.parentElement !== expected) || !positioned) {
    placeInsights();
    if (insightsEditMode) renderInsightsDropZones();
  }
  if (insightsEditMode && (insightsDropZones.some(zone => !zone.isConnected) ||
      insightsDropZones.length !== Object.values(containers).filter(Boolean)
        .reduce((total, container) => total + insightsItems(container).length + 1, 0))) {
    renderInsightsDropZones();
  }
  applyInsightsDimensions();
}

document.addEventListener('click', event => {
  const menu = hosts.insightsBanner?.querySelector('.cusade-insights-banner__menu');
  if (menu && !hosts.insightsBanner.contains(event.target)) {
    menu.hidden = true;
    hosts.insightsBanner.querySelector('.cusade-insights-banner__more')?.setAttribute('aria-expanded', 'false');
  }
});

function flushInsightPlayback(state) {
  const seconds = Math.floor(state.pending);
  if (seconds < 1 || state.saving) return;
  state.pending -= seconds;
  state.saving = true;
  ipcRenderer.invoke(CHANNEL.recordInsight, {
    sessionId: state.id, title: state.title, artist: state.artist,
    url: state.url, artwork: state.artwork, seconds: Math.min(seconds, 10)
  }).then(() => {
    state.saving = false;
    if (state.pending >= 1 && state !== insightPlayback) flushInsightPlayback(state);
  }).catch(error => {
    state.saving = false;
    state.pending += Math.min(seconds, 10);
    console.error('Could not save cusade Insights playback:', error);
  });
  if (seconds > 10) state.pending += seconds - 10;
}

function syncInsightsPlayback() {
  const badge = document.querySelector('.playbackSoundBadge');
  const titleLink = badge?.querySelector('.playbackSoundBadge__titleLink');
  const artist = badge?.querySelector('.playbackSoundBadge__lightLink')?.textContent.trim();
  const title = titleLink?.title || titleLink?.querySelector('[aria-hidden="true"]')?.textContent || titleLink?.textContent.trim();
  const url = titleLink?.href;
  const now = Date.now();
  if (!url || !artist || !title || badge.classList.contains('paused')) {
    if (insightPlayback) {
      if (insightPlayback.pending >= 1) flushInsightPlayback(insightPlayback);
      insightPlayback.lastElapsed = null;
    }
    return;
  }
  const elapsed = playbackSeconds(document.querySelector('.playbackTimeline__timePassed [aria-hidden="true"]')?.textContent || '');
  if (!insightPlayback || insightPlayback.url !== url) {
    if (insightPlayback?.pending >= 1) flushInsightPlayback(insightPlayback);
    const artworkUrl = badge.querySelector('.image__full')?.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1]
      ?.replace(/-t\d+x\d+\./, '-t500x500.') || '';
    const artwork = /^https:\/\/([a-z0-9-]+\.)*sndcdn\.com\//i.test(artworkUrl) ? artworkUrl : '';
    insightPlayback = { id: `${now}-${Math.random().toString(36).slice(2)}`, title: title.trim().slice(0, 300),
      artist: artist.slice(0, 300), url, artwork, pending: 0, saving: false, lastElapsed: elapsed, lastWall: now };
    return;
  }
  const state = insightPlayback;
  if (state.lastElapsed !== null) {
    const progress = elapsed - state.lastElapsed;
    const wall = (now - state.lastWall) / 1000;
    if (progress > 0 && wall > 0) state.pending += Math.min(progress, wall + 1);
  }
  state.lastElapsed = elapsed;
  state.lastWall = now;
  if (state.pending >= 5) flushInsightPlayback(state);
}

function insightSummary(sessions, since = 0) {
  const tracks = new Map();
  const artists = new Map();
  let seconds = 0;
  let plays = 0;
  for (const session of sessions) {
    if (session.lastPlayedAt < since || !Number.isFinite(session.seconds)) continue;
    seconds += session.seconds;
    if (session.seconds < 30) continue;
    plays++;
    const track = tracks.get(session.url) || { ...session, plays: 0, seconds: 0 };
    track.plays++;
    track.seconds += session.seconds;
    track.lastPlayedAt = Math.max(track.lastPlayedAt, session.lastPlayedAt);
    if (session.artwork) track.artwork = session.artwork;
    tracks.set(session.url, track);
    const artist = artists.get(session.artist) || { name: session.artist, plays: 0, seconds: 0, artwork: '' };
    artist.plays++;
    artist.seconds += session.seconds;
    if (session.artwork && (!artist.artwork || session.lastPlayedAt >= (artist.artworkAt || 0))) {
      artist.artwork = session.artwork;
      artist.artworkAt = session.lastPlayedAt;
    }
    artists.set(session.artist, artist);
  }
  const byPlays = (a, b) => b.plays - a.plays || b.seconds - a.seconds;
  return { seconds, plays, tracks: [...tracks.values()].sort(byPlays),
    artists: [...artists.values()].sort(byPlays) };
}

function formatInsightDate(value) {
  return new Date(value).toLocaleDateString(state.appLanguage === 'ru' ? 'ru-RU' : 'en-US',
    { day: 'numeric', month: 'short', year: 'numeric' });
}

function insightArtwork(item, round = false) {
  const art = document.createElement('span');
  art.className = `insight-art${round ? ' round' : ''}`;
  if (/^https:\/\/([a-z0-9-]+\.)*sndcdn\.com\//i.test(item.artwork || '')) {
    const image = document.createElement('img');
    image.src = item.artwork.replace(/-t\d+x\d+\./, '-t200x200.');
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.onerror = () => image.remove();
    art.append(image);
  }
  return art;
}

function insightRow(item, index, kind, maxPlays = 0) {
  const row = document.createElement('li');
  row.className = 'rank-row';
  const rank = document.createElement('span'); rank.className = 'rank'; rank.textContent = String(index + 1).padStart(2, '0');
  const art = insightArtwork(item, kind === 'artist');
  const info = document.createElement('div'); info.className = 'rank-info';
  const name = document.createElement(kind === 'track' ? 'a' : 'span');
  name.className = 'rank-name'; name.textContent = kind === 'track' ? item.title : item.name;
  if (kind === 'track') name.href = item.url;
  const detail = document.createElement('small');
  detail.textContent = kind === 'track' ? item.artist : `${item.plays} ${ui('прослушиваний', 'plays')}`;
  const bar = document.createElement('span'); bar.className = 'rank-bar';
  const fill = document.createElement('span');
  fill.style.transform = `scaleX(${(Math.max(4, item.plays / Math.max(1, maxPlays)) / 100).toFixed(4)})`;
  bar.append(fill); info.append(name, detail, bar);
  const count = document.createElement('span'); count.className = 'rank-count'; count.textContent = `${item.plays} ×`;
  row.append(rank, art, info, count);
  return row;
}

function insightActivity(sessions, period) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const count = period === 'week' ? 7 : period === 'month' ? 10 : 12;
  const buckets = Array.from({ length: count }, (_, index) => {
    const start = period === 'all'
      ? new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1)
      : new Date(first.getFullYear(), first.getMonth(), first.getDate() - (count - 1 - index) * (period === 'month' ? 3 : 1) - (period === 'month' ? 2 : 0));
    const end = period === 'all' ? new Date(start.getFullYear(), start.getMonth() + 1, 1)
      : new Date(start.getFullYear(), start.getMonth(), start.getDate() + (period === 'month' ? 3 : 1));
    const label = period === 'all' ? start.toLocaleDateString(state.appLanguage === 'ru' ? 'ru-RU' : 'en-US', { month: 'short' })
      : start.toLocaleDateString(state.appLanguage === 'ru' ? 'ru-RU' : 'en-US', period === 'week' ? { weekday: 'short' } : { day: 'numeric', month: 'short' });
    return { start: start.getTime(), end: end.getTime(), label, seconds: 0 };
  });
  for (const session of sessions) {
    if (!Number.isFinite(session.seconds)) continue;
    const bucket = buckets.find(item => session.lastPlayedAt >= item.start && session.lastPlayedAt < item.end);
    if (bucket) bucket.seconds += session.seconds;
  }
  return buckets;
}

function insightCoverColor(image) {
  const sample = document.createElement('canvas');
  sample.width = 48; sample.height = 48;
  const context = sample.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, 48, 48);
  const pixels = context.getImageData(0, 0, 48, 48).data;
  const bins = Array.from({ length: 12 }, () => ({ weight: 0, channels: [0, 0, 0] }));
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 180) continue;
    const rgb = [pixels[index], pixels[index + 1], pixels[index + 2]];
    const max = Math.max(...rgb), min = Math.min(...rgb), delta = max - min;
    if (delta < 50 || max < 65 || min > 205) continue;
    let hue = max === rgb[0] ? (rgb[1] - rgb[2]) / delta
      : max === rgb[1] ? (rgb[2] - rgb[0]) / delta + 2 : (rgb[0] - rgb[1]) / delta + 4;
    hue = ((hue * 60) + 360) % 360;
    const weight = delta / 255 * (0.5 + max / 255);
    const bin = bins[Math.floor(hue / 30)];
    bin.weight += weight;
    for (let channel = 0; channel < 3; channel++) bin.channels[channel] += rgb[channel] * weight;
  }
  const best = bins.sort((a, b) => b.weight - a.weight)[0];
  if (best.weight < 2) return null;
  return best.channels.map(value => Math.round(value / best.weight));
}

async function drawInsightCard(summary, period) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 630;
  const ctx = canvas.getContext('2d');
  const topTrack = summary.tracks[0];
  let cover = null;
  let color = '#443554';
  if (/^https:\/\/([a-z0-9-]+\.)*sndcdn\.com\//i.test(topTrack?.artwork || '')) {
    try {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = topTrack.artwork;
      await image.decode();
      cover = image;
      const vibrant = insightCoverColor(image);
      if (vibrant) color = `rgb(${vibrant.map(value => Math.round(value * .3 + 9)).join(',')})`;
      else color = await artworkThemeColor(topTrack.artwork);
    } catch { color = fallbackPlaybackColor(topTrack.artwork); }
  }
  const parsed = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  const channels = parsed ? parsed.slice(1).map(Number) : [68, 53, 84];
  const accent = channels.map(value => Math.min(255, Math.round(value * 2.15 + 75)));
  const accentInk = `rgb(${accent.join(',')})`;
  const background = ctx.createLinearGradient(0, 0, 1200, 630);
  background.addColorStop(0, color);
  background.addColorStop(.53, '#1d1d28');
  background.addColorStop(1, '#10131a');
  ctx.fillStyle = background; ctx.fillRect(0, 0, 1200, 630);
  const glow = ctx.createRadialGradient(925, 290, 20, 925, 290, 600);
  glow.addColorStop(0, `rgba(${accent.join(',')},.27)`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, 1200, 630);
  ctx.strokeStyle = '#ffffff1c'; ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, 1152, 582);
  ctx.fillStyle = '#ffffff24'; ctx.beginPath(); ctx.roundRect(64, 56, 35, 35, 10); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '700 23px system-ui'; ctx.textAlign = 'center'; ctx.fillText('♫', 81.5, 82);
  ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = '750 23px system-ui'; ctx.fillText('cusade', 113, 82);
  ctx.fillStyle = accentInk; ctx.font = '700 18px system-ui'; ctx.fillText('INSIGHTS', 213, 81);
  ctx.fillStyle = '#ffffff22'; ctx.beginPath(); ctx.roundRect(64, 127, Math.max(175, ctx.measureText(period).width + 45), 38, 19); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '600 16px system-ui'; ctx.fillText(period, 85, 153);
  ctx.font = '750 50px system-ui'; ctx.fillText(ui('Моя музыка', 'My music'), 64, 230);
  ctx.fillStyle = '#ffffffa8'; ctx.font = '18px system-ui';
  ctx.fillText(ui('Моменты, которые звучали со мной', 'The moments that stayed with me'), 66, 263);
  const drawStat = (value, label, x) => {
    ctx.fillStyle = '#fff'; ctx.font = '750 60px system-ui'; ctx.fillText(String(value), x, 365);
    ctx.fillStyle = '#ffffffaa'; ctx.font = '17px system-ui'; ctx.fillText(label, x + 2, 397);
  };
  drawStat(summary.plays, ui('прослушиваний', 'plays'), 64);
  drawStat(Math.round(summary.seconds / 60), ui('минут', 'minutes'), 265);
  drawStat(summary.tracks.length, ui('треков', 'tracks'), 440);
  ctx.fillStyle = '#ffffff25'; ctx.fillRect(64, 434, 590, 1);
  const fit = (value, max) => {
    const chars = [...(value || '—')];
    while (chars.length > 1 && ctx.measureText(chars.join('') + '…').width > max) chars.pop();
    return chars.length < [...(value || '—')].length ? chars.join('') + '…' : chars.join('');
  };
  ctx.fillStyle = accentInk; ctx.font = '700 15px system-ui'; ctx.fillText(ui('ТРЕК НА ПОВТОРЕ', 'ON REPEAT'), 64, 471);
  ctx.fillStyle = '#fff'; ctx.font = '700 26px system-ui'; ctx.fillText(fit(topTrack?.title, 580), 64, 506);
  ctx.fillStyle = '#ffffffb8'; ctx.font = '18px system-ui'; ctx.fillText(fit(topTrack?.artist, 580), 64, 535);
  ctx.fillStyle = '#ffffffaa'; ctx.font = '15px system-ui';
  ctx.fillText(`${ui('Любимый исполнитель', 'Top artist')}: ${fit(summary.artists[0]?.name, 420)}`, 64, 581);
  ctx.fillStyle = '#ffffff50'; ctx.fillText('cusade · SoundCloud Desktop', 730, 580);
  ctx.save();
  ctx.shadowColor = '#0009'; ctx.shadowBlur = 36; ctx.shadowOffsetY = 16;
  ctx.fillStyle = '#ffffff12'; ctx.beginPath(); ctx.roundRect(708, 106, 426, 426, 24); ctx.fill();
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.roundRect(715, 113, 412, 412, 19); ctx.clip();
  if (cover) {
    const side = Math.min(cover.naturalWidth, cover.naturalHeight);
    ctx.drawImage(cover, (cover.naturalWidth - side) / 2, (cover.naturalHeight - side) / 2, side, side, 715, 113, 412, 412);
  } else {
    const placeholder = ctx.createLinearGradient(715, 113, 1127, 525);
    placeholder.addColorStop(0, accentInk); placeholder.addColorStop(1, color);
    ctx.fillStyle = placeholder; ctx.fillRect(715, 113, 412, 412);
    ctx.fillStyle = '#ffffff90'; ctx.textAlign = 'center'; ctx.font = '140px system-ui'; ctx.fillText('♫', 921, 370); ctx.textAlign = 'left';
  }
  ctx.restore();
  ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(715, 113, 412, 412, 19); ctx.stroke();
  return canvas.toDataURL('image/png');
}

async function openInsights() {
  if (hosts.insightsHost) hosts.insightsHost.shadowRoot?.querySelector('.close')?.click();
  hosts.insightsHost = document.createElement('div');
  hosts.insightsHost.id = 'cusade-insights-host';
  hosts.insightsHost.classList.toggle('cusade-animations', motionActive());
  hosts.insightsHost.style.cssText = 'position:fixed;inset:0;z-index:2147483646';
  const shadow = hosts.insightsHost.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>
    *{box-sizing:border-box} .backdrop{position:fixed;inset:0;background:#07080ce0}
    .panel{--text:var(--font-primary-color,#f7f7f8);--subtle:var(--font-secondary-color,#a6a8b1);--surface:color-mix(in srgb,var(--text) 5%,var(--background-surface-color,#191a20));--line:color-mix(in srgb,var(--text) 11%,transparent);--accent:var(--cusade-accent,#ff5500);position:fixed;inset:3vh 24px;max-width:1100px;margin:auto;overflow:auto;border:1px solid var(--line);border-radius:22px;background:var(--background-surface-color,#191a20);color:var(--text);box-shadow:0 16px 40px #0008;font:14px system-ui,sans-serif;scrollbar-color:var(--line) transparent}
    button{border:0;cursor:pointer;font:600 13px system-ui,sans-serif} button:disabled{opacity:.55;cursor:wait} button:hover{filter:brightness(1.13)} a{color:inherit;text-decoration:none} a:hover{text-decoration:underline}
    .hero{position:relative;overflow:hidden;min-height:216px;padding:29px 34px;background-color:var(--hero-color,#4d3541);background-image:linear-gradient(115deg,#17192388,#191b24 85%);color:#fff}
    :host(.cusade-animations) .hero{transition:background-color 880ms cubic-bezier(.3,.62,.36,1)}
    .hero:after{content:"";position:absolute;right:-90px;top:-205px;width:500px;height:500px;border:1px solid #ffffff18;border-radius:50%;pointer-events:none}
    .hero-art{position:absolute;right:16%;top:-95px;width:360px;height:360px;object-fit:cover;opacity:.12;transform:rotate(-15deg)}
    .hero-top,.hero-content{position:relative;z-index:1}.hero-top{display:flex;justify-content:space-between;align-items:center}.brand{display:flex;align-items:center;gap:9px;font-size:13px;font-weight:750;letter-spacing:.02em}.brand-mark{width:22px;height:22px;border-radius:7px;background:#fff3;display:grid;place-items:center;color:#fff}.hero h1{margin:26px 0 5px;font-size:34px;line-height:1.12;letter-spacing:-.045em}.hero p{max-width:620px;margin:0;color:#ffffffb8;line-height:1.5}.close{width:32px;height:32px;border-radius:50%;background:#ffffff20;color:#fff;font-size:21px;line-height:1}
    .content{padding:28px 34px 32px}.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:22px}.eyebrow{font-size:11px;font-weight:750;letter-spacing:.11em;text-transform:uppercase;color:var(--subtle)}.controls{display:flex;gap:4px;padding:4px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}.controls button{padding:8px 13px;border-radius:8px;background:transparent;color:var(--subtle)}.controls button.selected{background:var(--accent);color:#fff;box-shadow:0 3px 12px #0002}
    .metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.metric{min-height:109px;padding:17px 18px;border:1px solid var(--line);border-radius:14px;background:var(--surface)}.metric-top{display:flex;align-items:center;gap:8px;color:var(--subtle);font-size:12px}.metric-icon{width:24px;height:24px;border-radius:7px;display:grid;place-items:center;background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent);font-size:14px}.metric strong{display:block;margin-top:13px;font-size:28px;line-height:1;letter-spacing:-.035em;font-variant-numeric:tabular-nums}
    .section{margin-top:28px}.section-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:15px}.section h2{margin:0;font-size:18px;letter-spacing:-.02em}.section-note,.muted,small{color:var(--subtle)}.section-note{font-size:12px}.activity-card{padding:19px 22px 16px;border:1px solid var(--line);border-radius:16px;background:var(--surface)}.activity-graph{display:grid;grid-template-columns:repeat(var(--bars),minmax(0,1fr));align-items:end;gap:8px;height:142px;border-bottom:1px solid var(--line)}.bar-slot{display:flex;align-items:flex-end;justify-content:center;height:100%;min-width:0}.bar{width:100%;max-width:45px;height:100%;transform:scaleY(.05);transform-origin:bottom;border-radius:6px 6px 0 0;background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 70%,#fff),var(--accent));opacity:.85}
    :host(.cusade-animations) .bar{transition:transform .62s cubic-bezier(.3,.62,.36,1)}.bar-slot:hover .bar{opacity:1}.activity-labels{display:grid;grid-template-columns:repeat(var(--bars),minmax(0,1fr));gap:8px;margin-top:9px;text-align:center;color:var(--subtle);font-size:10px}.activity-labels span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.activity-empty{padding:30px 0;text-align:center;color:var(--subtle)}
    .columns{display:grid;grid-template-columns:1fr 1fr;gap:26px}.list-card{padding:5px 17px;border:1px solid var(--line);border-radius:16px;background:var(--surface)}ol{padding:0;margin:0;list-style:none}.rank-row,.history-row{display:flex;align-items:center;gap:12px;min-height:67px;padding:9px 0;border-bottom:1px solid var(--line)}li:last-child{border-bottom:0}.rank{width:21px;flex:none;color:var(--subtle);font-size:11px;font-variant-numeric:tabular-nums}.insight-art{position:relative;display:block;flex:none;width:46px;height:46px;overflow:hidden;border-radius:9px;background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 28%,#34323a),#292b34)}.insight-art:before{content:"♫";position:absolute;inset:0;display:grid;place-items:center;color:#ffffff90;font-size:19px}.insight-art.round{border-radius:50%}.insight-art img{position:relative;width:100%;height:100%;object-fit:cover}.rank-info,.history-info{min-width:0;flex:1}.rank-name,.history-name{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:650}.rank-info small,.history-info small{display:block;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}.rank-bar{display:block;width:100%;height:3px;overflow:hidden;margin-top:8px;border-radius:2px;background:var(--line)}.rank-bar span{display:block;width:100%;height:100%;transform-origin:left center;border-radius:2px;background:var(--accent)}.rank-count{flex:none;color:var(--subtle);font-size:11px;font-variant-numeric:tabular-nums}.empty{padding:28px 4px;text-align:center;color:var(--subtle);line-height:1.5}
    .lower{display:grid;grid-template-columns:1fr 1fr;gap:26px}.history-row{min-height:60px}.history-row .insight-art{width:39px;height:39px}.history-row time{flex:none;color:var(--subtle);font-size:11px}.history-more{display:block;width:100%;padding:12px;border-top:1px solid var(--line);background:transparent;color:var(--accent)}.history-more[hidden]{display:none}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px;padding-top:22px;border-top:1px solid var(--line)}.actions button{padding:11px 15px;border-radius:9px;background:var(--surface);color:var(--text)}.actions .primary{background:var(--accent);color:#fff}.status{margin:10px 0 0;color:var(--subtle)}
    @media(max-width:750px){.panel{inset:0;border-radius:0}.hero{padding:24px}.content{padding:22px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.columns,.lower{grid-template-columns:1fr;gap:0}.topbar{align-items:flex-start;flex-direction:column}.activity-graph,.activity-labels{gap:3px}.hero-art{right:-80px}}
    @media(max-width:410px){.controls{width:100%}.controls button{flex:1;padding:8px 4px}.metric{padding:14px}.history-row time{max-width:65px;text-align:right}}
    :host(.cusade-animations) .backdrop{animation:cusade-fade-in 320ms cubic-bezier(.3,.62,.36,1) both}
    :host(.cusade-animations) .panel{animation:cusade-panel-in 380ms cubic-bezier(.3,.62,.36,1) both}
    :host(.cusade-animations){--cusade-hover:360ms cubic-bezier(.3,.62,.36,1)}
    /* Same rule as on the page: the lift animates, the shadow snaps in. A metric
       card is small, but the row list inside the window is not, and one animated
       shadow there costs the same order of paint as a whole feed. */
    :host(.cusade-animations) :is(button,.metric,.activity-card,.list-card,.rank-row,.history-row,.insight-art){transition:transform var(--cusade-hover),background-color var(--cusade-hover),filter var(--cusade-hover)}
    :host(.cusade-animations) :is(.metric,.activity-card,.list-card,.rank-row,.history-row,.insight-art):hover{transform:translateY(-2px);box-shadow:0 10px 22px #00000059}
    :host(.cusade-animations) button:hover{box-shadow:0 8px 20px color-mix(in srgb,var(--accent) 22%,transparent)}
    :host(.cusade-animations) button:active{transform:scale(.96)}
    :host(.cusade-animations) :is(.rank-row,.history-row):hover{background:color-mix(in srgb,var(--text) 4%,transparent)}
    @keyframes cusade-fade-in{from{opacity:0}to{opacity:1}}
    @keyframes cusade-panel-in{from{opacity:0;transform:translateY(16px) scale(.982)}to{opacity:1;transform:none}}
  </style><div class="backdrop"></div><main class="panel" role="dialog" aria-modal="true" aria-label="cusade Insights">
    <header class="hero"><img class="hero-art" alt=""><div class="hero-top"><span class="brand"><span class="brand-mark">♫</span>cusade Insights</span><button class="close" aria-label="${ui('Закрыть','Close')}">×</button></div><div class="hero-content"><h1>${ui('Ваша музыка в деталях','Your music, in detail')}</h1><p>${ui('Личный музыкальный дневник. Данные хранятся только на этом компьютере и пополняются во время прослушивания в приложении.', 'Your personal music diary. Data stays on this computer and grows while you listen in the app.')}</p></div></header>
    <div class="content"><div class="topbar"><span class="eyebrow">${ui('Обзор прослушиваний','Listening overview')}</span><nav class="controls" aria-label="${ui('Период','Period')}"><button data-period="week">${ui('7 дней','7 days')}</button><button data-period="month">${ui('30 дней','30 days')}</button><button data-period="all">${ui('Всё время','All time')}</button></nav></div>
    <div class="metrics"></div>
    <section class="section"><div class="section-head"><h2>${ui('Ритм прослушиваний','Listening activity')}</h2><span class="section-note activity-note"></span></div><div class="activity-card"><div class="activity-graph"></div><div class="activity-labels"></div></div></section>
    <div class="columns"><section class="section"><div class="section-head"><h2>${ui('Любимые треки','Top tracks')}</h2><span class="section-note">${ui('По прослушиваниям','By plays')}</span></div><div class="list-card"><ol class="tracks"></ol></div></section><section class="section"><div class="section-head"><h2>${ui('Любимые исполнители','Top artists')}</h2><span class="section-note">${ui('По прослушиваниям','By plays')}</span></div><div class="list-card"><ol class="artists"></ol></div></section></div>
    <div class="lower"><section class="section"><div class="section-head"><h2>${ui('Забытые композиции','Forgotten tracks')}</h2><span class="section-note">${ui('Не звучали 30 дней','Not played for 30 days')}</span></div><div class="list-card"><ol class="forgotten"></ol></div></section><section class="section"><div class="section-head"><h2>${ui('Недавно слушали','Recently played')}</h2><span class="section-note">${ui('История','History')}</span></div><div class="list-card"><ol class="history-list"></ol><button class="history-more" hidden>${ui('Показать ещё','Show more')}</button></div></section></div>
    <div class="actions"><button class="primary" data-export="save">${ui('Сохранить карточку PNG','Save PNG card')}</button><button data-export="copy">${ui('Скопировать карточку','Copy card')}</button></div><p class="status" aria-live="polite"></p></div>
  </main>`;
  document.body.appendChild(hosts.insightsHost);
  const close = () => {
    hosts.insightsHost?.remove();
    hosts.insightsHost = null;
    document.removeEventListener('keydown', onKey);
    syncVisiblePage();
    syncVisiblePlayback();
  };
  const onKey = event => { if (event.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  shadow.querySelector('.close').addEventListener('click', close);
  shadow.querySelector('.backdrop').addEventListener('click', close);
  shadow.addEventListener('click', event => { if (event.target.closest('a')) close(); });
  const hero = shadow.querySelector('.hero');
  hero.style.setProperty('--hero-color', getPlaybackThemeColor() || '#4d3541');
  const heroArt = shadow.querySelector('.hero-art');
  if (/^https:\/\/([a-z0-9-]+\.)*sndcdn\.com\//i.test(getPlaybackThemeArtwork() || '')) heroArt.src = getPlaybackThemeArtwork();
  const status = shadow.querySelector('.status');
  let sessions;
  try { sessions = await ipcRenderer.invoke(CHANNEL.getInsights); }
  catch (error) { status.textContent = ui('Не удалось загрузить статистику.', 'Could not load insights.'); console.error(error); return; }
  const allSummary = insightSummary(sessions);
  const forgotten = allSummary.tracks.filter(track => track.lastPlayedAt < Date.now() - 30 * 86400000).slice(0, 5);
  const forgottenList = shadow.querySelector('.forgotten');
  forgotten.forEach((item, index) => forgottenList.append(insightRow(item, index, 'track', forgotten[0].plays)));
  if (!forgotten.length) { const empty = document.createElement('li'); empty.className = 'empty'; empty.textContent = ui('Пока нет забытых треков','No forgotten tracks yet'); forgottenList.append(empty); }
  const sortedHistory = sessions.filter(item => item.seconds >= 30).sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
  const history = shadow.querySelector('.history-list');
  const moreHistory = shadow.querySelector('.history-more');
  const appendHistoryRow = item => {
    const row = document.createElement('li'); row.className = 'history-row';
    const art = insightArtwork(item);
    const info = document.createElement('div'); info.className = 'history-info';
    const link = document.createElement('a'); link.className = 'history-name'; link.href = item.url; link.textContent = item.title;
    const artist = document.createElement('small'); artist.textContent = item.artist;
    info.append(link, artist);
    const date = document.createElement('time'); date.dateTime = new Date(item.lastPlayedAt).toISOString(); date.textContent = formatInsightDate(item.lastPlayedAt);
    row.append(art, info, date); history.append(row);
  };
  let period = 'week';
  let summary;
  let visibleHistory = [];
  const periodCache = new Map();
  const render = () => {
    if (!periodCache.has(period)) {
      const activity = insightActivity(sessions, period);
      const since = period === 'all' ? 0 : activity[0].start;
      periodCache.set(period, { activity, since, summary: period === 'all' ? allSummary : insightSummary(sessions, since) });
    }
    const { activity, since, summary: periodSummary } = periodCache.get(period);
    summary = periodSummary;
    shadow.querySelectorAll('[data-period]').forEach(button => {
      button.classList.toggle('selected', button.dataset.period === period);
      button.setAttribute('aria-pressed', String(button.dataset.period === period));
    });
    const metrics = shadow.querySelector('.metrics');
    metrics.replaceChildren();
    for (const [icon, value, label] of [['▶', summary.plays, ui('Прослушиваний','Plays')], ['◷', Math.round(summary.seconds / 60), ui('Минут музыки','Minutes listened')], ['♫', summary.tracks.length, ui('Треков','Tracks')], ['◎', summary.artists.length, ui('Исполнителей','Artists')]]) {
      const metric = document.createElement('div'); metric.className = 'metric';
      const top = document.createElement('div'); top.className = 'metric-top';
      const symbol = document.createElement('span'); symbol.className = 'metric-icon'; symbol.textContent = icon;
      const caption = document.createElement('span'); caption.textContent = label;
      top.append(symbol, caption);
      const strong = document.createElement('strong'); strong.textContent = value;
      metric.append(top, strong); metrics.append(metric);
    }
    const maxSeconds = Math.max(1, ...activity.map(item => item.seconds));
    const graph = shadow.querySelector('.activity-graph');
    const labels = shadow.querySelector('.activity-labels');
    graph.replaceChildren(); labels.replaceChildren();
    graph.style.setProperty('--bars', activity.length);
    labels.style.setProperty('--bars', activity.length);
    shadow.querySelector('.activity-note').textContent = period === 'all'
      ? ui('Последние 12 месяцев · минуты', 'Last 12 months · minutes')
      : ui('Время прослушивания · минуты', 'Listening time · minutes');
    for (const item of activity) {
      const slot = document.createElement('div'); slot.className = 'bar-slot';
      const bar = document.createElement('div'); bar.className = 'bar';
      bar.style.transform = `scaleY(${Math.max(.03, item.seconds / maxSeconds).toFixed(4)})`;
      const minutes = Math.round(item.seconds / 60);
      slot.title = `${item.label}: ${minutes} ${ui('мин', 'min')}`;
      slot.setAttribute('aria-label', slot.title);
      slot.append(bar); graph.append(slot);
      const label = document.createElement('span'); label.textContent = item.label; labels.append(label);
    }
    for (const [selector, items, kind] of [['.tracks', summary.tracks.slice(0, 5), 'track'], ['.artists', summary.artists.slice(0, 5), 'artist']]) {
      const list = shadow.querySelector(selector); list.replaceChildren();
      items.forEach((item, index) => list.append(insightRow(item, index, kind, items[0].plays)));
      if (!items.length) { const empty = document.createElement('li'); empty.className = 'empty'; empty.textContent = ui('Пока нет данных','No data yet'); list.append(empty); }
    }
    history.replaceChildren();
    visibleHistory = sortedHistory.filter(item => item.lastPlayedAt >= since).slice(0, 20);
    visibleHistory.slice(0, 6).forEach(appendHistoryRow);
    moreHistory.hidden = visibleHistory.length <= 6;
    if (!history.children.length) { const empty = document.createElement('li'); empty.className = 'empty'; empty.textContent = ui('История появится после 30 секунд прослушивания трека.','History appears after 30 seconds of listening to a track.'); history.append(empty); }
  };
  moreHistory.addEventListener('click', () => {
    visibleHistory.slice(6).forEach(appendHistoryRow);
    moreHistory.hidden = true;
  });
  shadow.querySelectorAll('[data-period]').forEach(button => button.addEventListener('click', () => { period = button.dataset.period; render(); }));
  shadow.querySelectorAll('[data-export]').forEach(button => button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const label = period === 'week' ? ui('Последние 7 дней','Last 7 days') : period === 'month' ? ui('Последние 30 дней','Last 30 days') : ui('Всё время','All time');
      const card = await drawInsightCard(summary, label);
      const done = await ipcRenderer.invoke(CHANNEL.exportInsightCard, card, button.dataset.export);
      status.textContent = done ? ui('Карточка готова для публикации.','Card ready to share.') : '';
    } catch (error) { status.textContent = ui('Не удалось создать карточку.','Could not create the card.'); console.error(error); }
    finally { button.disabled = false; }
  }));
  render();
}


function syncVisiblePage() {
  if (document.visibilityState !== 'visible' || hosts.insightsHost) return;
  syncArtworkPage();
  syncPageScope();
  syncHomeLikesButton();
  syncInsightsBanner();
}

module.exports = {
  syncInsightsBanner,
  syncInsightsPlayback,
  syncVisiblePage,
  placeInsights,
  updateInsightsRestoreControl
};
