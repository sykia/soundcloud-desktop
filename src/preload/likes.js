'use strict';

// The "Your likes" sidebar button and the shuffle playback flow. The button is
// created and torn down by syncHomeLikesButton; likesShuffleInProgress guards
// the long async shuffle against double clicks.

const { ipcRenderer } = require('electron');
const { CHANNEL } = require('../../shared/ipc.js');
const { state } = require('./state.js');
const { hosts } = require('./hosts.js');
const { ui } = require('./localization-dict.js');

let likesShuffleInProgress = false;

function waitForPageElement(selector, path, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const element = location.pathname === path && document.querySelector(selector);
      if (element) {
        clearInterval(timer);
        resolve(element);
      } else if (Date.now() - started > timeout) {
        clearInterval(timer);
        reject(new Error(`SoundCloud did not open ${path}`));
      }
    }, 150);
  });
}

function waitForPlayback(trackUrl, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (document.querySelector('.playbackSoundBadge__titleLink')?.href === trackUrl) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > timeout) {
        clearInterval(timer);
        reject(new Error('Liked track did not start'));
      }
    }, 150);
  });
}

async function playShuffledLikes() {
  if (likesShuffleInProgress) return;
  likesShuffleInProgress = true;
  const originalScrollY = window.scrollY;
  let transition;
  let failed = false;
  try {
    const likesLink = document.querySelector('.likesModule .sidebarHeader[href="/you/likes"]');
    if (!likesLink) throw new Error('Likes link is unavailable');
    const screenshot = await ipcRenderer.invoke(CHANNEL.capturePage);
    if (!screenshot?.startsWith('data:image/png;base64,')) {
      throw new Error('Could not capture the current page');
    }
    const image = new Image();
    image.src = screenshot;
    await image.decode();
    transition = document.createElement('div');
    transition.className = 'cusade-likes-transition';
    transition.setAttribute('aria-label', ui('Загружаю лайкнутые треки', 'Loading liked tracks'));
    transition.appendChild(image);
    document.body.appendChild(transition);
    likesLink.click();
    await waitForPageElement('.collection__likesSection .badgeList__item .playableTile__playButton a', '/you/likes');
    const currentTrack = document.querySelector('.playbackSoundBadge__titleLink')?.href;
    const tracks = [...document.querySelectorAll('.collection__likesSection .badgeList__item')]
      .map(item => ({
        play: item.querySelector('.playableTile__playButton a'),
        url: item.querySelector('.playableTile__artworkLink')?.href
      }))
      .filter(track => track.play && track.url && track.url !== currentTrack);
    if (!tracks.length) throw new Error('No liked tracks found');
    const shuffle = document.querySelector('.playControls .shuffleControl');
    if (!shuffle) throw new Error('Shuffle control is unavailable');
    if (!shuffle.classList.contains('m-shuffling')) shuffle.click();
    const track = tracks[Math.floor(Math.random() * tracks.length)];
    track.play.click();
    await waitForPlayback(track.url);
  } catch (error) {
    failed = true;
    console.error('Could not play shuffled likes:', error);
  } finally {
    if (location.pathname !== '/discover') {
      document.querySelector('a.header__logoLink')?.click();
    }
    await Promise.all([
      waitForPageElement('[data-test-id="home"] .mixedSelectionModule', '/discover', 10000),
      waitForPageElement('.streamSidebar .likesModule', '/discover', 10000)
    ])
      .catch(error => {
        failed = true;
        console.error('Could not return to SoundCloud home:', error);
      });
    window.scrollTo(0, originalScrollY);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    transition?.remove();
    likesShuffleInProgress = false;
    syncHomeLikesButton();
    if (failed) {
      const status = hosts.likesShuffleHost?.querySelector('.cusade-likes-shuffle__status');
      if (status) status.textContent = ui('Не удалось запустить лайкнутые треки.', 'Could not play liked tracks.');
    }
  }
}

function syncHomeLikesButton() {
  const likesModule = document.querySelector('[data-test-id="home"]') &&
    document.querySelector('.likesModule');
  if (!state.showYourLikesButton || !likesModule) {
    hosts.likesShuffleHost?.remove();
    hosts.likesShuffleHost = null;
    return;
  }
  if (hosts.likesShuffleHost?.isConnected) return;
  hosts.likesShuffleHost = document.createElement('article');
  hosts.likesShuffleHost.className = 'sidebarModule cusade-likes-shuffle';
  hosts.likesShuffleHost.innerHTML = `
    <button class="cusade-likes-shuffle__button" type="button" title="${ui('Слушать понравившиеся треки в случайном порядке', 'Play your liked tracks in random order')}">
      <span>${ui('Мои лайки', 'Your likes')}</span>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.03 7.03 15.56 4.5 13.03 1.97l-1.06 1.06.72.72h-.45c-1.32 0-2.58.55-3.48 1.52L7.25 6.9 5.74 5.27C4.84 4.3 3.58 3.75 2.26 3.75H1v1.5h1.26c.9 0 1.77.38 2.38 1.04L6.23 8l-1.59 1.71c-.61.66-1.48 1.04-2.38 1.04H1v1.5h1.26c1.32 0 2.58-.55 3.48-1.52L7.25 9.1l1.51 1.63c.9.97 2.16 1.52 3.48 1.52h.45l-.72.72 1.06 1.06 2.53-2.53-2.53-2.53-1.06 1.06.72.72h-.45c-.9 0-1.77-.38-2.38-1.04L8.27 8l1.59-1.71c.61-.66 1.48-1.04 2.38-1.04h.45l-.72.72 1.06 1.06Z"/></svg>
    </button>
    <p class="cusade-likes-shuffle__status" aria-live="polite"></p>`;
  hosts.likesShuffleHost.querySelector('button').addEventListener('click', playShuffledLikes);
  likesModule.parentElement.prepend(hosts.likesShuffleHost);
}

module.exports = { syncHomeLikesButton };