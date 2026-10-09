'use strict';

// The in-page update card (renderUpdatePanel / showUpdatePanel). The card lives
// in the light DOM with its own shadow root; currentUpdateState is module-local
// and index.js only sets it through setCurrentUpdateState(), which keeps the
// ipcRenderer wiring in the orchestrator.

const { ipcRenderer } = require('electron');
const { CHANNEL } = require('../../shared/ipc.js');
const { hosts } = require('./hosts.js');
const { ui } = require('./localization-dict.js');
const { motionActive } = require('./motion.js');

let currentUpdateState = null;

function setCurrentUpdateState(value) {
  currentUpdateState = value;
}

function renderUpdatePanel() {
  if (!hosts.updateHost || !currentUpdateState) return;
  const state = currentUpdateState;
  if (!state.version || state.status === 'none') {
    hosts.updateHost.remove();
    hosts.updateHost = null;
    return;
  }
  const shadow = hosts.updateHost.shadowRoot;
  shadow.querySelector('.version').textContent = ui(`Доступна версия ${state.version}`, `Version ${state.version} is available`);
  const details = shadow.querySelector('.details');
  const action = shadow.querySelector('.action');
  const progress = shadow.querySelector('progress');
  const isPackage = ['deb', 'rpm', 'pacman'].includes(state.packageType);
  if (state.status === 'downloading') {
    details.textContent = ui(`Загрузка обновления: ${state.progress}%`, `Downloading update: ${state.progress}%`);
    action.textContent = ui('Загрузка…', 'Downloading…');
  } else if (state.status === 'installing') {
    details.textContent = state.packageType === 'nix'
      ? ui('Nix загружает и устанавливает обновление. После установки приложение перезапустится.',
        'Nix is downloading and installing the update. The app will restart when installation finishes.')
      : isPackage
      ? ui('Подтвердите установку в системном окне.', 'Confirm installation in the system dialog.')
      : ui('Запускается установка и перезапуск.', 'Starting installation and restart.');
    action.textContent = ui('Установка…', 'Installing…');
  } else if (state.ready) {
    details.textContent = state.error || (isPackage
      ? ui('При установке система запросит права администратора.', 'Your system will request administrator access to install.')
      : state.packageType === 'win'
        ? ui('Обновление установится в текущую папку без мастера установки. При необходимости Windows запросит права администратора.',
          'The update will install in the current folder without setup screens. Windows may request administrator access.')
        : ui('AppImage будет обновлён, затем приложение перезапустится.', 'The AppImage will update and the app will restart.'));
    action.textContent = ui('Установить и перезапустить', 'Install and restart');
  } else {
    details.textContent = state.error || (state.packageType === 'nix'
      ? ui('Обновление установится в отдельный пользовательский профиль Nix с проверкой контрольной суммы. Затем приложение перезапустится.',
        'The update will install into a dedicated user Nix profile with checksum verification, then the app will restart.')
      : ui('Нажмите «Обновить», чтобы загрузить новую версию.', 'Select Update to download the new version.'));
    action.textContent = state.packageType === 'nix' ? ui('Обновить через Nix', 'Update with Nix') : ui('Обновить', 'Update');
  }
  action.disabled = state.status === 'downloading' || state.status === 'installing';
  progress.hidden = state.status !== 'downloading';
  progress.value = state.progress || 0;
}

function showUpdatePanel(state) {
  if (state) currentUpdateState = state;
  if (!currentUpdateState?.version) return;
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', () => showUpdatePanel(), { once: true });
    return;
  }
  if (!hosts.updateHost) {
    hosts.updateHost = document.createElement('div');
    hosts.updateHost.id = 'cusade-update-host';
    hosts.updateHost.classList.toggle('cusade-animations', motionActive());
    hosts.updateHost.style.cssText = 'position:fixed;right:18px;bottom:70px;z-index:2147483647';
    const shadow = hosts.updateHost.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; }
        .panel { width: min(350px, calc(100vw - 36px)); padding: 18px; border: 1px solid
          color-mix(in srgb, var(--font-primary-color, #fff) 18%, transparent); border-radius: 14px;
          background: var(--background-surface-color, #171717); color: var(--font-primary-color, #fff);
          box-shadow: 0 16px 44px #0007; font: 13px system-ui, sans-serif; }
        .top { display:flex;align-items:start;justify-content:space-between;gap:12px; }
        h2 { margin:0;font-size:17px; }
        .close { border:0;background:transparent;color:var(--font-secondary-color,#aaa);
          cursor:pointer;font-size:23px;line-height:1; }
        .details { margin:12px 0;color:var(--font-secondary-color,#aaa);line-height:1.45; }
        progress { width:100%;height:6px;margin-bottom:12px;accent-color:var(--cusade-accent,#ff5500); }
        progress[hidden] { display:none; }
        .actions { display:flex;align-items:center;gap:12px; }
        .action { padding:9px 15px;border:0;border-radius:8px;background:var(--cusade-accent,#ff5500);
          color:#fff;font:700 13px system-ui;cursor:pointer; }
        .action:disabled { opacity:.6;cursor:wait; }
        .release { color:var(--font-secondary-color,#aaa);text-decoration:underline;cursor:pointer;
          border:0;background:transparent;font:inherit; }
        :host(.cusade-animations) .panel { animation:enter 360ms cubic-bezier(.3,.62,.36,1) both; }
        :host(.cusade-animations) button { transition:filter 360ms cubic-bezier(.3,.62,.36,1),transform 360ms cubic-bezier(.3,.62,.36,1); }
        :host(.cusade-animations) button:hover:not(:disabled) { filter:brightness(1.09);transform:translateY(-2px); }
        @keyframes enter { from { opacity:0;transform:translateY(14px) scale(.982); }
          to { opacity:1;transform:none; } }
      </style>
      <section class="panel" role="dialog" aria-label="${ui('Обновление SoundCloud Desktop', 'SoundCloud Desktop update')}">
        <div class="top"><h2 class="version"></h2><button class="close" type="button" aria-label="${ui('Закрыть', 'Close')}">×</button></div>
        <p class="details" aria-live="polite"></p><progress max="100" hidden></progress>
        <div class="actions"><button class="action" type="button"></button>
          <button class="release" type="button">${ui('Страница релиза', 'Release page')}</button></div>
      </section>`;
    shadow.querySelector('.close').addEventListener('click', () => {
      hosts.updateHost.remove();
      hosts.updateHost = null;
    });
    shadow.querySelector('.action').addEventListener('click', async event => {
      if (!event.isTrusted) return;
      const action = shadow.querySelector('.action');
      action.disabled = true;
      try { currentUpdateState = await ipcRenderer.invoke(CHANNEL.runUpdate); }
      catch (error) {
        shadow.querySelector('.details').textContent = ui('Не удалось начать обновление.', 'Could not start the update.');
        console.error('Could not run update:', error);
      } finally { renderUpdatePanel(); }
    });
    shadow.querySelector('.release').addEventListener('click', () => {
      ipcRenderer.invoke(CHANNEL.openUpdateRelease).catch(error => console.error('Could not open release:', error));
    });
    document.body.appendChild(hosts.updateHost);
  }
  renderUpdatePanel();
}

module.exports = { renderUpdatePanel, showUpdatePanel, setCurrentUpdateState };
