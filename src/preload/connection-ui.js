'use strict';

const { ipcRenderer } = require('electron');
const { CHANNEL } = require('../../shared/ipc.js');
const { state } = require('./state.js');
const { hosts } = require('./hosts.js');

let latestStatus;
function updateConnectionControls() {
  const shadow = hosts.panelHost?.shadowRoot;
  const select = shadow?.getElementById('connection-mode');
  if (!select) return;
  select.value = state.connectionMode;
  select.disabled = !state.settingsLoaded;
  const status = shadow.getElementById('connection-status');
  if (status && latestStatus) status.textContent = latestStatus.message;
}

function receiveStatus(status) {
  if (!status || typeof status.message !== 'string') return;
  latestStatus = status;
  if (['auto', 'bypass', 'direct'].includes(status.mode)) state.connectionMode = status.mode;
  updateConnectionControls();
}

function attachConnectionControls(shadow) {
  const select = shadow.getElementById('connection-mode');
  select.addEventListener('change', async () => {
    const previous = state.connectionMode;
    state.connectionMode = select.value;
    select.disabled = true;
    shadow.getElementById('connection-status').textContent = 'Настраиваем подключение…';
    try { receiveStatus(await ipcRenderer.invoke(CHANNEL.set('connectionMode'), state.connectionMode)); }
    catch {
      state.connectionMode = previous;
      shadow.getElementById('connection-status').textContent = 'Не удалось изменить подключение. Попробуйте ещё раз.';
    } finally { updateConnectionControls(); }
  });
  ipcRenderer.invoke(CHANNEL.getConnectionState).then(receiveStatus).catch(() => {});
  updateConnectionControls();
}

ipcRenderer.on(CHANNEL.connectionState, (_event, status) => receiveStatus(status));

// Retry the existing media source after networking recovers. Preserve the
// playback position and don't start music that the user deliberately paused.
const playback = new WeakMap();
document.addEventListener('play', event => {
  if (event.target instanceof HTMLMediaElement) playback.set(event.target, true);
}, true);
document.addEventListener('playing', event => {
  if (event.target instanceof HTMLMediaElement) playback.set(event.target, true);
}, true);
document.addEventListener('pause', event => {
  if (event.target instanceof HTMLMediaElement && !event.target.error) playback.set(event.target, false);
}, true);
ipcRenderer.on(CHANNEL.connectionRecovered, () => {
  for (const media of document.querySelectorAll('audio,video')) {
    const playing = playback.get(media) === true;
    if (!media.currentSrc || (!media.error && !(playing && media.readyState < 3))) continue;
    if (media.error && media.error.code !== 2) continue;
    const position = media.currentTime;
    media.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(position) && position > 0) media.currentTime = position;
      if (playing) media.play().catch(() => {});
    }, { once: true });
    media.load();
  }
});

module.exports = { attachConnectionControls, updateConnectionControls };
