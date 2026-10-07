'use strict';

// Playback visualization card, cover tints and player progress. The playback
// theme state (playbackThemeColor / playbackThemeArtwork) is module-local;
// insights.js reads it through the getters below, so the two modules never
// share a signal object over a require edge.

const { state } = require('./state.js');
const { hosts } = require('./hosts.js');
const { ui } = require('./localization-dict.js');
const { motionActive } = require('./motion.js');

let visualizedTrackUrl = '';
let visualizationPendingTrack = null;
let visualizationSwitchTimer = 0;
let lastAnimatedBadgeUrl = '';
let playerProgressTarget = null;
let playerProgressObserver = null;
let playbackThemeArtwork = null;
let playbackThemeAppliedArtwork = null;
let playbackThemeColor = '#10384c';
let playbackThemeRequest = 0;
const playbackColorCache = new Map();
const playbackBackdropCache = new Map();
const waveformCache = new Map();

function getPlaybackThemeColor() {
  return playbackThemeColor;
}

function getPlaybackThemeArtwork() {
  return playbackThemeArtwork;
}

function createPlaybackVisualization() {
  const card = document.createElement('section');
  card.className = 'cusade-visualization';
  card.setAttribute('aria-label', ui('Визуализация воспроизведения', 'Playback visualization'));
  card.innerHTML = `
    <div class="cusade-visualization__main">
      <div class="cusade-visualization__heading">
        <button class="cusade-visualization__play" type="button" aria-label="${ui('Воспроизвести', 'Play')}">▶</button>
        <div class="cusade-visualization__meta">
          <a class="cusade-visualization__title"></a>
          <a class="cusade-visualization__artist"></a>
        </div>
      </div>
      <button class="cusade-visualization__wave" type="button" aria-label="${ui('Перемотать трек', 'Seek track')}">
        <span class="cusade-visualization__bars cusade-visualization__bars--base"></span>
        <span class="cusade-visualization__bars cusade-visualization__bars--played"></span>
      </button>
      <div class="cusade-visualization__times"><span>0:00</span><span>0:00</span></div>
    </div>
    <img class="cusade-visualization__art" alt="${ui('Обложка трека', 'Track artwork')}">`;
  card.querySelector('.cusade-visualization__play').addEventListener('click', () => {
    document.querySelector('.playControls__play')?.click();
  });
  card.querySelector('.cusade-visualization__wave').addEventListener('click', event => {
    const timeline = document.querySelector('.playbackTimeline__progressWrapper');
    if (!timeline) return;
    const wave = event.currentTarget.getBoundingClientRect();
    const target = timeline.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (event.clientX - wave.left) / wave.width));
    for (const type of ['mousedown', 'mouseup']) {
      timeline.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        button: 0,
        buttons: type === 'mousedown' ? 1 : 0,
        clientX: target.left + target.width * fraction,
        clientY: target.top + target.height / 2
      }));
    }
  });
  return card;
}

function playbackArtworkFromBadge(badge) {
  const raw = badge?.querySelector('.image__full')?.style.backgroundImage
    .match(/url\(["']?(.*?)["']?\)/)?.[1]?.replace(/-t\d+x\d+\./, '-t500x500.');
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' && (url.hostname === 'sndcdn.com' || url.hostname.endsWith('.sndcdn.com'))) {
      return url.href;
    }
  } catch {  }
  return '';
}

function fallbackPlaybackColor(artwork) {
  if (!artwork) return '#10384c';
  let hash = 0;
  for (const character of artwork) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 43% 27%)`;
}

async function artworkThemeColor(artwork) {
  if (playbackColorCache.has(artwork)) return playbackColorCache.get(artwork);
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = artwork.replace(/-t\d+x\d+\./, '-t200x200.');
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, 32, 32);
  const pixels = context.getImageData(0, 0, 32, 32).data;
  const channels = [0, 0, 0];
  let count = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 128) continue;
    for (let channel = 0; channel < 3; channel++) channels[channel] += pixels[index + channel];
    count++;
  }
  const color = count
    ? `rgb(${channels.map(sum => Math.max(25, Math.round(sum / count * .56))).join(',')})`
    : fallbackPlaybackColor(artwork);
  const backdrop = document.createElement('canvas');
  backdrop.width = 128;
  backdrop.height = 128;
  const backdropContext = backdrop.getContext('2d');
  backdropContext.filter = 'blur(12px) saturate(1.2)';
  backdropContext.drawImage(image, -16, -16, 160, 160);
  playbackBackdropCache.set(artwork, backdrop.toDataURL('image/jpeg', .72));
  playbackColorCache.set(artwork, color);
  if (playbackColorCache.size > 32) {
    const oldest = playbackColorCache.keys().next().value;
    playbackColorCache.delete(oldest);
    playbackBackdropCache.delete(oldest);
  }
  return color;
}

function applyPlaybackTheme(host, artwork, color) {
  if (!host || host.dataset.cusadeThemeArtwork === artwork) return;
  host.dataset.cusadeThemeArtwork = artwork;
  host.style.backgroundColor = color;
  const previous = [...host.children].filter(child => child.classList.contains('cusade-track-backdrop'));
  for (const layer of previous) {
    layer.classList.remove('cusade-track-backdrop--visible');
    setTimeout(() => layer.remove(), 1050);
  }
  if (!artwork) return;
  const layer = document.createElement('div');
  layer.className = 'cusade-track-backdrop';
  layer.setAttribute('aria-hidden', 'true');
  const backdrop = playbackBackdropCache.get(artwork) || artwork.replace(/-t\d+x\d+\./, '-t200x200.');
  layer.style.backgroundImage = `url(${JSON.stringify(backdrop)})`;
  host.prepend(layer);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (layer.isConnected) layer.classList.add('cusade-track-backdrop--visible');
  }));
}

function syncInsightsModalTheme(artwork, color) {
  const hero = hosts.insightsHost?.shadowRoot?.querySelector('.hero');
  if (!hero) return;
  hero.style.setProperty('--hero-color', color);
  const image = hero.querySelector('.hero-art');
  if (image && artwork && image.src !== artwork) image.src = artwork;
  else if (image && !artwork) image.removeAttribute('src');
}

function syncPlaybackTheme() {
  const artwork = playbackArtworkFromBadge(document.querySelector('.playbackSoundBadge'));
  const themeTargets = [hosts.visualizationHost, hosts.insightsBanner?.isConnected ? hosts.insightsBanner : null];
  if (artwork === playbackThemeArtwork) {
    if (artwork === playbackThemeAppliedArtwork) {
      for (const host of themeTargets) applyPlaybackTheme(host, artwork, playbackThemeColor);
    }
    return;
  }
  playbackThemeArtwork = artwork;
  const request = ++playbackThemeRequest;
  if (!artwork) {
    playbackThemeColor = '#10384c';
    playbackThemeAppliedArtwork = '';
    for (const host of themeTargets) applyPlaybackTheme(host, '', playbackThemeColor);
    syncInsightsModalTheme('', playbackThemeColor);
    return;
  }
  artworkThemeColor(artwork).catch(() => fallbackPlaybackColor(artwork)).then(color => {
    if (request !== playbackThemeRequest) return;
    playbackThemeColor = color;
    playbackThemeAppliedArtwork = artwork;
    for (const host of [hosts.visualizationHost, hosts.insightsBanner?.isConnected ? hosts.insightsBanner : null]) {
      applyPlaybackTheme(host, artwork, color);
    }
    syncInsightsModalTheme(artwork, color);
  });
}

const WAVE_BAR_COUNT = 160;

// The bars stay in the card for as long as it lives: a track switch only
// rewrites their transforms instead of replacing 320 elements, and the height
// that is animated is a compositor-only scale.
function drawPlaybackWave(card, seed, waveform) {
  let hash = 0;
  for (const character of seed) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) | 0;
  const scales = new Array(WAVE_BAR_COUNT);
  for (let index = 0; index < WAVE_BAR_COUNT; index++) {
    hash = (Math.imul(hash, 1664525) + 1013904223) | 0;
    const sample = waveform?.samples.slice(
      Math.floor(index * waveform.samples.length / WAVE_BAR_COUNT),
      Math.max(1, Math.floor((index + 1) * waveform.samples.length / WAVE_BAR_COUNT))
    );
    const height = sample?.length
      ? Math.max(10, Math.max(...sample) / waveform.height * 96)
      : 18 + ((hash >>> 16) % 60) + 12 * Math.sin(index / 9) ** 2;
    scales[index] = Math.min(96, height) / 100;
  }
  for (const layer of card.querySelectorAll('.cusade-visualization__bars')) {
    if (layer.children.length !== WAVE_BAR_COUNT) {
      layer.replaceChildren(...Array.from({ length: WAVE_BAR_COUNT }, () => document.createElement('span')));
    }
    for (let index = 0; index < WAVE_BAR_COUNT; index++) {
      const transform = `scaleY(${scales[index].toFixed(4)})`;
      if (layer.children[index].style.transform !== transform) {
        layer.children[index].style.transform = transform;
      }
    }
  }
}

function waveformUrlFromHydration(scriptText, trackUrl) {
  const prefix = 'window.__sc_hydration = ';
  if (!scriptText?.startsWith(prefix)) return null;
  try {
    const entries = JSON.parse(scriptText.slice(prefix.length).trim().replace(/;$/, ''));
    return entries.find(entry => entry.hydratable === 'sound' &&
      entry.data?.permalink_url === trackUrl)?.data.waveform_url || null;
  } catch {
    return null;
  }
}

async function loadPlaybackWave(card, trackUrl) {
  if (waveformCache.has(trackUrl)) {
    if (hosts.visualizationHost === card && visualizedTrackUrl === trackUrl) {
      drawPlaybackWave(card, trackUrl, waveformCache.get(trackUrl));
    }
    return;
  }
  let waveformUrl = waveformUrlFromHydration(
    [...document.scripts].find(script => script.textContent.startsWith('window.__sc_hydration = '))?.textContent,
    trackUrl
  );
  if (!waveformUrl) {
    const response = await fetch(trackUrl);
    if (!response.ok) return;
    const page = new DOMParser().parseFromString(await response.text(), 'text/html');
    waveformUrl = waveformUrlFromHydration(
      [...page.scripts].find(script => script.textContent.startsWith('window.__sc_hydration = '))?.textContent,
      trackUrl
    );
  }
  if (!waveformUrl || new URL(waveformUrl).hostname !== 'wave.sndcdn.com') return;
  const response = await fetch(waveformUrl);
  if (!response.ok) return;
  const waveform = await response.json();
  if (!Array.isArray(waveform.samples) || waveform.samples.length > 5000 ||
      !Number.isFinite(waveform.height) || waveform.height <= 0) return;
  waveformCache.set(trackUrl, { samples: waveform.samples, height: waveform.height });
  if (waveformCache.size > 8) waveformCache.delete(waveformCache.keys().next().value);
  if (hosts.visualizationHost === card && visualizedTrackUrl === trackUrl) {
    drawPlaybackWave(card, trackUrl, waveform);
  }
}

function setVisualizationArtwork(card, artwork, immediate = false) {
  const cover = card.querySelector('.cusade-visualization__art');
  if (cover.dataset.cusadeArtwork === artwork) return;
  cover.dataset.cusadeArtwork = artwork;
  clearTimeout(card.cusadeArtworkTimer);
  const apply = () => {
    if (cover.dataset.cusadeArtwork !== artwork || !cover.isConnected) return;
    if (artwork) { cover.src = artwork; cover.hidden = false; }
    else { cover.removeAttribute('src'); cover.hidden = true; }
    requestAnimationFrame(() => cover.classList.remove('cusade-visualization__art--changing'));
  };
  if (!immediate && motionActive() && cover.hasAttribute('src')) {
    cover.classList.add('cusade-visualization__art--changing');
    card.cusadeArtworkTimer = setTimeout(apply, 180);
  } else apply();
}

function commitPlaybackTrack(card, track) {
  if (hosts.visualizationHost !== card || !card.isConnected) return;
  const title = card.querySelector('.cusade-visualization__title');
  const artist = card.querySelector('.cusade-visualization__artist');
  title.textContent = track.title;
  title.href = track.url;
  artist.textContent = track.artist;
  artist.href = track.artistUrl;
  card.dataset.cusadeTrackUrl = track.url;
  card.style.setProperty('--cusade-progress', '0%');
  setVisualizationArtwork(card, track.artwork, true);
  drawPlaybackWave(card, track.url);
  loadPlaybackWave(card, track.url).catch(error => {
    console.error('Could not load SoundCloud waveform:', error);
  });
}

function finishPlaybackSwitch() {
  if (!visualizationPendingTrack) return;
  clearTimeout(visualizationSwitchTimer);
  const { card, track } = visualizationPendingTrack;
  visualizationPendingTrack = null;
  if (hosts.visualizationHost !== card || visualizedTrackUrl !== track.url) return;
  commitPlaybackTrack(card, track);
  requestAnimationFrame(() => card.classList.remove('cusade-visualization--switching'));
  syncPlaybackVisualization();
}

function syncPlaybackVisualization() {
  const home = document.querySelector('[data-test-id="home"]');
  const main = home?.closest('.l-main');
  const badge = document.querySelector('.playbackSoundBadge');
  const titleLink = badge?.querySelector('.playbackSoundBadge__titleLink');
  const artistLink = badge?.querySelector('.playbackSoundBadge__lightLink');
  if (!state.playbackVisualization || !main || !titleLink || !artistLink) {
    clearTimeout(visualizationSwitchTimer);
    visualizationPendingTrack = null;
    hosts.visualizationHost?.remove();
    hosts.visualizationHost = null;
    visualizedTrackUrl = '';
    return;
  }

  if (!hosts.visualizationHost || !hosts.visualizationHost.isConnected) {
    hosts.visualizationHost = createPlaybackVisualization();
    main.prepend(hosts.visualizationHost);
    visualizedTrackUrl = '';
  }
  if (visualizedTrackUrl !== titleLink.href) {
    visualizedTrackUrl = titleLink.href;
    const track = {
      url: titleLink.href,
      title: titleLink.title || titleLink.querySelector('[aria-hidden="true"]')?.textContent || '',
      artist: artistLink.textContent.trim(),
      artistUrl: artistLink.href,
      artwork: playbackArtworkFromBadge(badge)
    };
    clearTimeout(visualizationSwitchTimer);
    if (motionActive() && hosts.visualizationHost.dataset.cusadeTrackUrl) {
      visualizationPendingTrack = { card: hosts.visualizationHost, track };
      hosts.visualizationHost.classList.add('cusade-visualization--switching');
      visualizationSwitchTimer = setTimeout(finishPlaybackSwitch, 180);
      return;
    }
    visualizationPendingTrack = null;
    hosts.visualizationHost.classList.remove('cusade-visualization--switching');
    commitPlaybackTrack(hosts.visualizationHost, track);
  }

  const artwork = playbackArtworkFromBadge(badge);
  setVisualizationArtwork(hosts.visualizationHost, artwork);

  const play = hosts.visualizationHost.querySelector('.cusade-visualization__play');
  const paused = badge.classList.contains('paused');
  const playSymbol = paused ? '▶' : 'Ⅱ';
  const playLabel = paused ? ui('Воспроизвести', 'Play') : ui('Пауза', 'Pause');
  if (play.textContent !== playSymbol) play.textContent = playSymbol;
  if (play.getAttribute('aria-label') !== playLabel) play.setAttribute('aria-label', playLabel);
  const timeline = document.querySelector('.playbackTimeline__progressWrapper');
  const maximum = Number(timeline?.getAttribute('aria-valuemax'));
  const current = Number(timeline?.getAttribute('aria-valuenow'));
  const progress = maximum > 0 ? Math.max(0, Math.min(100, current / maximum * 100)) : 0;
  const progressValue = `${progress}%`;
  if (hosts.visualizationHost.style.getPropertyValue('--cusade-progress') !== progressValue) {
    hosts.visualizationHost.style.setProperty('--cusade-progress', progressValue);
  }
  const times = hosts.visualizationHost.querySelectorAll('.cusade-visualization__times span');
  const passed = document.querySelector('.playbackTimeline__timePassed [aria-hidden="true"]')?.textContent || '0:00';
  const duration = document.querySelector('.playbackTimeline__duration [aria-hidden="true"]')?.textContent || '0:00';
  if (times[0].textContent !== passed) times[0].textContent = passed;
  if (times[1].textContent !== duration) times[1].textContent = duration;
}

// SoundCloud paints the player fill with an inline width. Growing that width
// re-ran layout for the whole bottom bar on every frame, so the preload mirrors
// the same value as a scaleX, which only the compositor has to handle. The
// mirror owns the bar from the first valid sample onwards and hands it back if
// the timeline ever stops reporting a range.
function applyPlayerProgress(wrapper) {
  const maximum = Number(wrapper.getAttribute('aria-valuemax'));
  const current = Number(wrapper.getAttribute('aria-valuenow'));
  const root = document.documentElement;
  if (!(maximum > 0) || !Number.isFinite(current)) {
    root?.classList.remove('cusade-player-progress');
    return;
  }
  const value = Math.max(0, Math.min(1, current / maximum)).toFixed(4);
  if (wrapper.style.getPropertyValue('--cusade-player-progress') !== value) {
    wrapper.style.setProperty('--cusade-player-progress', value);
  }
  root?.classList.add('cusade-player-progress');
}

function syncPlayerProgress() {
  const wrapper = document.querySelector('.playbackTimeline__progressWrapper');
  if (!wrapper) {
    if (playerProgressTarget) {
      playerProgressObserver?.disconnect();
      playerProgressObserver = null;
      playerProgressTarget = null;
      document.documentElement?.classList.remove('cusade-player-progress');
    }
    return;
  }
  if (playerProgressTarget !== wrapper) {
    playerProgressObserver?.disconnect();
    playerProgressObserver = new MutationObserver(() => applyPlayerProgress(wrapper));
    playerProgressObserver.observe(wrapper, {
      attributes: true,
      attributeFilter: ['aria-valuenow', 'aria-valuemax']
    });
    playerProgressTarget = wrapper;
  }
  applyPlayerProgress(wrapper);
}

function playbackSeconds(value) {
  const parts = value.trim().split(':').map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some(part => !Number.isInteger(part) || part < 0)) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function syncVisiblePlayback() {
  if (document.visibilityState !== 'visible') return;
  if (!hosts.insightsHost) syncPlaybackVisualization();
  syncPlaybackTheme();
  syncPlayerProgress();
  const badge = document.querySelector('.playbackSoundBadge');
  const url = badge?.querySelector('.playbackSoundBadge__titleLink')?.href || '';
  if (url && url !== lastAnimatedBadgeUrl) {
    const firstTrack = !lastAnimatedBadgeUrl;
    lastAnimatedBadgeUrl = url;
    if (!firstTrack && motionActive()) {
      for (const element of badge.querySelectorAll(
        '.playbackSoundBadge__titleLink, .playbackSoundBadge__lightLink, .image.sc-artwork')) {
        element.animate([
          { opacity: 0, transform: 'translateY(6px)' },
          { opacity: 1, transform: 'translateY(0)' }
        ], { duration: 420, easing: 'cubic-bezier(.3,.62,.36,1)', id: 'cusade-badge-enter' });
      }
    }
  }
}

module.exports = {
  syncPlaybackVisualization,
  syncPlaybackTheme,
  syncVisiblePlayback,
  finishPlaybackSwitch,
  playbackSeconds,
  artworkThemeColor,
  fallbackPlaybackColor,
  getPlaybackThemeColor,
  getPlaybackThemeArtwork
};