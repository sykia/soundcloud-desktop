'use strict';

// The cusade settings panel, its toggles and the state sync for every control.
// The appliers (applyAccentColor, updatePanelColor, updateArtworkRadiusControls,
// ...) all live in appearance.js; this module only calls them, so its
// dependencies on appearance/visualization/likes/insights/presence stay one-way.

const { ipcRenderer } = require('electron');
const { PANEL_CSS, organizePanel } = require('./panel-layout.js');
const { CHANNEL } = require('../../shared/ipc.js');
const { DEFAULT_RADII } = require('../../shared/constants.js');
const { state } = require('./state.js');
const { hosts } = require('./hosts.js');
const { syncCompanion } = require('./companion.js');
const { ui } = require('./localization-dict.js');
const { motionActive, systemReducedMotion, applyMotion } = require('./motion.js');
const {
  applyArtistToolsVisibility,
  applyNearbyEventsVisibility,
  applyAccentColor,
  applyArtworkRadii,
  updatePanelColor,
  updateArtworkRadiusControls
} = require('./appearance.js');
const { syncPlaybackVisualization } = require('./visualization.js');
const { syncHomeLikesButton } = require('./likes.js');
const { syncDiscordPresence, resetPresence } = require('./presence.js');
const { syncInsightsBanner, updateInsightsRestoreControl } = require('./insights.js');

function updateCompanionControls() {
  const shadow = hosts.panelHost?.shadowRoot;
  for (const [key, id] of [['companionEnabled', 'companion-enabled'], ['companionSounds', 'companion-sounds']]) {
    const control = shadow?.getElementById(id);
    if (control) { control.checked = state[key]; control.disabled = !state.settingsLoaded; }
  }
}

function updatePanelToggle() {
  const toggle = hosts.panelHost?.shadowRoot.querySelector('#hide-artist-tools');
  if (!toggle) return;
  toggle.checked = state.hideArtistTools;
  toggle.disabled = !state.settingsLoaded;
}

function updateNearbyEventsToggle() {
  const toggle = hosts.panelHost?.shadowRoot.querySelector('#hide-nearby-events');
  if (!toggle) return;
  toggle.checked = state.hideNearbyEvents;
  toggle.disabled = !state.settingsLoaded;
}

function updateAudioAdsToggle() {
  const toggle = hosts.panelHost?.shadowRoot.querySelector('#block-audio-ads');
  if (!toggle) return;
  toggle.checked = state.blockAudioAds;
  toggle.disabled = !state.settingsLoaded;
}

function updateDiscordControls() {
  const shadow = hosts.panelHost?.shadowRoot;
  const toggle = shadow?.querySelector('#discord-rpc');
  const input = shadow?.querySelector('#discord-client-id');
  if (toggle) {
    toggle.checked = state.discordRpc;
    toggle.disabled = !state.settingsLoaded;
  }
  if (input) {
    input.value = state.discordClientId;
    input.disabled = !state.settingsLoaded;
  }
}

function updateAutoStartControls() {
  const shadow = hosts.panelHost?.shadowRoot;
  const toggle = shadow?.querySelector('#auto-start');
  const minimized = shadow?.querySelector('#start-minimized');
  if (toggle) {
    toggle.checked = state.autoStart;
    toggle.disabled = !state.settingsLoaded;
  }
  if (minimized) {
    minimized.checked = state.startMinimized;
    minimized.disabled = !state.settingsLoaded || !state.autoStart;
  }
}

function updateVisualizationToggle() {
  const toggle = hosts.panelHost?.shadowRoot.querySelector('#playback-visualization');
  if (!toggle) return;
  toggle.checked = state.playbackVisualization;
  toggle.disabled = !state.settingsLoaded;
}

function updateAnimationsToggle() {
  const toggle = hosts.panelHost?.shadowRoot.querySelector('#animations');
  if (!toggle) return;
  toggle.checked = state.animations;
  toggle.disabled = !state.settingsLoaded;
  updateSystemMotionHint();
}

function updateRespectSystemMotionToggle() {
  const toggle = hosts.panelHost?.shadowRoot.querySelector('#respect-system-motion');
  if (!toggle) return;
  toggle.checked = state.respectSystemMotion;
  toggle.disabled = !state.settingsLoaded;
}

// Keeps the switch honest: when the system asks for reduced motion the panel says
// so instead of leaving a checked switch that silently does nothing.
function updateSystemMotionHint() {
  const hint = hosts.panelHost?.shadowRoot.querySelector('.motion-hint');
  if (!hint) return;
  const visible = state.animations && systemReducedMotion.matches;
  hint.hidden = !visible;
  hint.textContent = !visible ? '' : state.respectSystemMotion
    ? ui('Система сообщает об уменьшении движения, поэтому эффекты cusade приглушены.',
      'Your system asks for reduced motion, so cusade effects stay dimmed.')
    : ui('Система сообщает об уменьшении движения, но cusade использует ваш выбор.',
      'Your system asks for reduced motion, but cusade follows your choice.');
}

function updateYourLikesToggle() {
  const toggle = hosts.panelHost?.shadowRoot.querySelector('#show-your-likes-button');
  if (!toggle) return;
  toggle.checked = state.showYourLikesButton;
  toggle.disabled = !state.settingsLoaded;
}

function updateAppIconStyle() {
  const select = hosts.panelHost?.shadowRoot.querySelector('#app-icon-style');
  if (!select) return;
  select.value = state.appIconStyle;
  select.disabled = !state.settingsLoaded;
}

function closePanel() {
  hosts.panelHost?.remove();
  hosts.panelHost = null;
}

function togglePanel() {
  if (hosts.panelHost) {
    closePanel();
    return;
  }

  hosts.panelHost = document.createElement('div');
  hosts.panelHost.id = 'cusade-panel-host';
  hosts.panelHost.classList.toggle('cusade-animations', motionActive());
  Object.assign(hosts.panelHost.style, {
    position: 'fixed',
    top: '56px',
    left: '12px',
    zIndex: '2147483647'
  });

  const shadow = hosts.panelHost.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>${PANEL_CSS}</style>
    <div class="panel" role="dialog" aria-label="cusade">
      <div class="top">
        <h2 class="title">cusade</h2>
        <button class="close" type="button" aria-label="${ui('Закрыть', 'Close')}">×</button>
      </div>
      <div class="section">
        <h3 class="section-title">${ui('Маленький спутник', 'Little companion')}</h3>
        <label class="setting"><span><span class="setting-name">${ui('Показывать спутника', 'Show companion')}</span><span class="hint">${ui('Перетаскивайте мышью. Замечает вас и слушает музыку вместе с вами.', 'Drag to move. Notices you and listens to music with you.')}</span></span><input id="companion-enabled" type="checkbox"></label>
        <label class="setting" style="margin-top:14px"><span><span class="setting-name">${ui('Звуки по нажатию', 'Sounds on click')}</span><span class="hint">${ui('Тихое чириканье, когда вы его гладите.', 'A quiet chirp when you pet it.')}</span></span><input id="companion-sounds" type="checkbox"></label>
      </div>
      <div class="section">
        <h3 class="section-title">${ui('Настройки мода', 'Mod settings')}</h3>
        <button class="check-updates" type="button">${ui('Проверить обновления', 'Check for updates')}</button>
        <div class="insights-restore" hidden><span class="hint"></span><button type="button">${ui('Показать Insights сейчас', 'Show Insights now')}</button></div>
        <label class="setting">
          <span><span class="setting-name">${ui('Скрыть Artist tools', 'Hide Artist tools')}</span>
          <span class="hint">${ui('Убирает промобаннеры, блок Artist tools и предложения Go+ и Artist Pro в верхней панели.', 'Hides promotional banners, Artist tools, and the Go+ and Artist Pro offers in the header.')}</span></span>
          <input id="hide-artist-tools" type="checkbox" disabled>
        </label>
        <label class="setting" style="margin-top: 18px">
          <span><span class="setting-name">${ui('Скрыть «События рядом»', 'Hide Events near you')}</span>
          <span class="hint">${ui('Убирает весь баннер с главной страницы.', 'Removes the entire banner from the home page.')}</span></span>
          <input id="hide-nearby-events" type="checkbox" disabled>
        </label>
        <label class="setting" style="margin-top: 18px">
          <span><span class="setting-name">${ui('Скрыть рекламу', 'Hide ads')}</span>
          <span class="hint">${ui('Блокирует аудиорекламу при запуске следующих треков.', 'Blocks audio ads when starting the next tracks.')}</span></span>
          <input id="block-audio-ads" type="checkbox" disabled>
        </label>
        <label class="setting" style="margin-top: 18px">
          <span><span class="setting-name">${ui('Визуализация воспроизведения', 'Playback visualization')}</span>
          <span class="hint">${ui('Показывает текущий трек над подборками на главной.', 'Shows the current track above the home page recommendations.')}</span></span>
          <input id="playback-visualization" type="checkbox" disabled>
        </label>
        <label class="setting" style="margin-top: 18px">
          <span><span class="setting-name">${ui('Показывать «Мои лайки»', 'Show Your likes')}</span>
          <span class="hint">${ui('Кнопка перемешивания лайков вверху правого столбца.', 'Shuffle button at the top of the right sidebar.')}</span></span>
          <input id="show-your-likes-button" type="checkbox" disabled>
        </label>
        <label class="setting" style="margin-top: 18px">
          <span><span class="setting-name">${ui('Анимации', 'Animations')}</span>
          <span class="hint">${ui('Оживляет обложки, карточки, кнопки, меню и переходы между страницами и вкладками.', 'Animates artwork, cards, buttons, menus, and page and tab transitions.')}</span>
          <span class="hint motion-hint" hidden></span></span>
          <input id="animations" type="checkbox" disabled>
        </label>
        <label class="setting" style="margin-top: 12px">
          <span><span class="setting-name">${ui('Учитывать системное уменьшение движения', 'Follow the system reduced motion setting')}</span>
          <span class="hint">${ui('Выключено: cusade показывает анимации, даже если система их отключает. Включите, чтобы уважать настройку системы — на Windows анимации интерфейса часто выключены.', 'Off: cusade animates even when the system turns animations off. Turn it on to respect the system setting — Windows often has interface animations disabled.')}</span></span>
          <input id="respect-system-motion" type="checkbox" disabled>
        </label>
        <div class="section">
          <label class="setting">
            <span><span class="setting-name">Discord RPC</span>
            <span class="hint">${ui('Показывает трек, исполнителя, обложку и время воспроизведения в Discord.', 'Shows the track, artist, artwork and playback time in Discord.')}</span></span>
            <input id="discord-rpc" type="checkbox" disabled>
          </label>
          <label class="hint" for="discord-client-id">${ui('ID приложения Discord', 'Discord Application ID')}</label>
          <input class="text-input" id="discord-client-id" type="text" inputmode="numeric" maxlength="20" placeholder="123456789012345678" disabled>
          <span class="hint">${ui('По умолчанию используется ID cusade. Очистите поле, чтобы вернуть его.', 'Uses the cusade ID by default. Clear the field to restore it.')}</span>
        </div>
        <div class="section">
          <label class="setting">
            <span><span class="setting-name">${ui('Автозапуск', 'Start with system')}</span>
            <span class="hint">${ui('Запускать приложение при входе в систему.', 'Launch the app when you sign in.')}</span></span>
            <input id="auto-start" type="checkbox" disabled>
          </label>
          <label class="setting" style="margin-top: 18px">
            <span><span class="setting-name">${ui('Запускать свёрнутым', 'Start minimized')}</span>
            <span class="hint">${ui('При автозапуске оставлять окно в системном трее.', 'Keep the window in the system tray on automatic start.')}</span></span>
            <input id="start-minimized" type="checkbox" disabled>
          </label>
        </div>
        <label class="color-setting">
          <span><span class="setting-name">${ui('Основной цвет', 'Accent color')}</span>
          <span class="hint">${ui('Выберите цвет акцентов SoundCloud.', 'Choose the SoundCloud accent color.')}</span></span>
          <span class="color-control"><input id="accent-color" type="color" value="#ff5500" disabled>
          <span id="accent-value" class="color-value">#FF5500</span></span>
        </label>
        <label class="color-setting" for="app-icon-style">
          <span><span class="setting-name">${ui('Стиль значка приложения', 'Application icon style')}</span>
          <span class="hint">${ui('Меняет значок окна и системного трея.', 'Changes the window and system tray icon.')}</span></span>
        </label>
        <select class="text-input" id="app-icon-style" disabled>
          <option value="orange">${ui('Чёрный на оранжевом', 'Black on orange')}</option>
          <option value="dark">${ui('Белый на чёрном', 'White on black')}</option>
        </select>
        <div class="section">
          <h3 class="section-title">${ui('Скругление обложек', 'Artwork rounding')}</h3>
          <span class="hint">${ui('0% — прямые углы, 50% — круг.', '0% means square corners; 50% means a circle.')}</span>
          <label class="radius-setting"><span>${ui('Аватарки', 'Avatars')}</span><input id="avatarRadius" type="range" min="0" max="50" step="1" disabled><output id="avatarRadius-value">50%</output></label>
          <label class="radius-setting"><span>${ui('Треки', 'Tracks')}</span><input id="trackRadius" type="range" min="0" max="50" step="1" disabled><output id="trackRadius-value">3%</output></label>
          <label class="radius-setting"><span>${ui('Альбомы', 'Albums')}</span><input id="albumRadius" type="range" min="0" max="50" step="1" disabled><output id="albumRadius-value">3%</output></label>
        </div>
        <p class="status" aria-live="polite"></p>
      </div>
    </div>`;
  organizePanel(shadow, ui, closePanel);
  hosts.panelHost.dataset.theme = state.panelTheme;
  const themeControl = shadow.getElementById('panel-theme');
  themeControl.value = state.panelTheme;
  themeControl.disabled = !state.settingsLoaded;
  themeControl.addEventListener('change', async () => {
    const previous = state.panelTheme;
    state.panelTheme = themeControl.value;
    hosts.panelHost.dataset.theme = state.panelTheme;
    themeControl.disabled = true;
    try { await ipcRenderer.invoke(CHANNEL.set('panelTheme'), state.panelTheme); }
    catch {
      state.panelTheme = previous;
      if (hosts.panelHost) hosts.panelHost.dataset.theme = previous;
      themeControl.value = previous;
      shadow.querySelector('.status').textContent = ui('Не удалось сохранить тему.', 'Could not save the theme.');
    } finally { themeControl.disabled = false; }
  });
  shadow.querySelector('.close').addEventListener('click', closePanel);
  shadow.querySelector('.check-updates').addEventListener('click', async event => {
    if (!event.isTrusted) return;
    const button = event.currentTarget;
    button.disabled = true;
    try { await ipcRenderer.invoke(CHANNEL.checkUpdates); }
    catch (error) { shadow.querySelector('.status').textContent = ui('Не удалось проверить обновления.', 'Could not check for updates.'); }
    finally { button.disabled = false; }
  });
  shadow.querySelector('.insights-restore button').addEventListener('click', async () => {
    try {
      await ipcRenderer.invoke(CHANNEL.showInsights);
      state.insightsHiddenUntil = 0;
      updateInsightsRestoreControl();
      syncInsightsBanner();
    } catch (error) {
      shadow.querySelector('.status').textContent = ui('Не удалось показать Insights.', 'Could not show Insights.');
      console.error('Could not restore cusade Insights:', error);
    }
  });
  const toggle = shadow.querySelector('#hide-artist-tools');
  toggle.addEventListener('change', async () => {
    const previous = state.hideArtistTools;
    state.hideArtistTools = toggle.checked;
    applyArtistToolsVisibility();
    toggle.disabled = true;
    try {
      await ipcRenderer.invoke(CHANNEL.set('hideArtistTools'), state.hideArtistTools);
    } catch (error) {
      state.hideArtistTools = previous;
      applyArtistToolsVisibility();
      shadow.querySelector('.status').textContent = ui('Не удалось сохранить настройку.', 'Could not save the setting.');
      console.error('Could not save cusade settings:', error);
    } finally {
      updatePanelToggle();
    }
  });
  const nearbyEventsToggle = shadow.querySelector('#hide-nearby-events');
  nearbyEventsToggle.addEventListener('change', async () => {
    const previous = state.hideNearbyEvents;
    state.hideNearbyEvents = nearbyEventsToggle.checked;
    applyNearbyEventsVisibility();
    nearbyEventsToggle.disabled = true;
    try {
      await ipcRenderer.invoke(CHANNEL.set('hideNearbyEvents'), state.hideNearbyEvents);
    } catch (error) {
      state.hideNearbyEvents = previous;
      applyNearbyEventsVisibility();
      shadow.querySelector('.status').textContent = ui('Не удалось сохранить настройку.', 'Could not save the setting.');
      console.error('Could not save cusade nearby events visibility:', error);
    } finally {
      updateNearbyEventsToggle();
    }
  });
  const audioAdsToggle = shadow.querySelector('#block-audio-ads');
  audioAdsToggle.addEventListener('change', async () => {
    const previous = state.blockAudioAds;
    state.blockAudioAds = audioAdsToggle.checked;
    audioAdsToggle.disabled = true;
    try {
      await ipcRenderer.invoke(CHANNEL.set('blockAudioAds'), state.blockAudioAds);
    } catch (error) {
      state.blockAudioAds = previous;
      shadow.querySelector('.status').textContent = ui('Не удалось сохранить настройку.', 'Could not save the setting.');
      console.error('Could not save cusade audio ad blocking:', error);
    } finally {
      updateAudioAdsToggle();
    }
  });
  const visualizationToggle = shadow.querySelector('#playback-visualization');
  visualizationToggle.addEventListener('change', async () => {
    const previous = state.playbackVisualization;
    state.playbackVisualization = visualizationToggle.checked;
    syncPlaybackVisualization();
    visualizationToggle.disabled = true;
    try {
      await ipcRenderer.invoke(CHANNEL.set('playbackVisualization'), state.playbackVisualization);
    } catch (error) {
      state.playbackVisualization = previous;
      syncPlaybackVisualization();
      shadow.querySelector('.status').textContent = ui('Не удалось сохранить настройку.', 'Could not save the setting.');
      console.error('Could not save cusade playback visualization:', error);
    } finally {
      updateVisualizationToggle();
    }
  });
  const yourLikesToggle = shadow.querySelector('#show-your-likes-button');
  yourLikesToggle.addEventListener('change', async () => {
    const previous = state.showYourLikesButton;
    state.showYourLikesButton = yourLikesToggle.checked;
    syncHomeLikesButton();
    yourLikesToggle.disabled = true;
    try {
      await ipcRenderer.invoke(CHANNEL.set('showYourLikesButton'), state.showYourLikesButton);
    } catch (error) {
      state.showYourLikesButton = previous;
      syncHomeLikesButton();
      shadow.querySelector('.status').textContent = ui('Не удалось сохранить настройку.', 'Could not save the setting.');
      console.error('Could not save cusade Your likes visibility:', error);
    } finally {
      updateYourLikesToggle();
    }
  });
  const animationsToggle = shadow.querySelector('#animations');
  animationsToggle.addEventListener('change', async () => {
    const previous = state.animations;
    state.animations = animationsToggle.checked;
    applyMotion();
    animationsToggle.disabled = true;
    try {
      await ipcRenderer.invoke(CHANNEL.set('animations'), state.animations);
    } catch (error) {
      state.animations = previous;
      applyMotion();
      shadow.querySelector('.status').textContent = ui('Не удалось сохранить настройку.', 'Could not save the setting.');
      console.error('Could not save cusade animations:', error);
    } finally {
      updateAnimationsToggle();
    }
  });
  const respectSystemMotionToggle = shadow.querySelector('#respect-system-motion');
  respectSystemMotionToggle.addEventListener('change', async () => {
    const previous = state.respectSystemMotion;
    state.respectSystemMotion = respectSystemMotionToggle.checked;
    applyMotion();
    syncCompanion();
    respectSystemMotionToggle.disabled = true;
    try {
      await ipcRenderer.invoke(CHANNEL.set('respectSystemMotion'), state.respectSystemMotion);
    } catch (error) {
      state.respectSystemMotion = previous;
      applyMotion();
      syncCompanion();
      shadow.querySelector('.status').textContent = ui('Не удалось сохранить настройку.', 'Could not save the setting.');
      console.error('Could not save the cusade reduced motion setting:', error);
    } finally {
      updateRespectSystemMotionToggle();
    }
  });
  const discordToggle = shadow.querySelector('#discord-rpc');
  discordToggle.addEventListener('change', async () => {
    const previous = state.discordRpc;
    state.discordRpc = discordToggle.checked;
    discordToggle.disabled = true;
    try {
      await ipcRenderer.invoke(CHANNEL.set('discordRpc'), state.discordRpc);
      if (state.discordRpc) syncDiscordPresence();
      else resetPresence();
    } catch (error) {
      state.discordRpc = previous;
      shadow.querySelector('.status').textContent = ui('Не удалось изменить Discord RPC.', 'Could not change Discord RPC.');
      console.error('Could not change Discord RPC:', error);
    } finally {
      updateDiscordControls();
    }
  });
  const discordIdInput = shadow.querySelector('#discord-client-id');
  discordIdInput.addEventListener('change', async () => {
    const selected = discordIdInput.value.trim();
    if (selected && !/^\d{17,20}$/.test(selected)) {
      shadow.querySelector('.status').textContent = ui('ID Discord должен содержать 17–20 цифр.', 'Discord ID must contain 17–20 digits.');
      updateDiscordControls();
      return;
    }
    discordIdInput.disabled = true;
    try {
      const saved = await ipcRenderer.invoke(CHANNEL.set('discordClientId'), selected);
      state.discordClientId = saved.state.discordClientId;
      state.discordRpc = saved.state.discordRpc;
      resetPresence();
      syncDiscordPresence();
    } catch (error) {
      shadow.querySelector('.status').textContent = ui('Не удалось сохранить ID Discord.', 'Could not save Discord ID.');
      console.error('Could not save Discord ID:', error);
    } finally {
      updateDiscordControls();
    }
  });
  const autoStartToggle = shadow.querySelector('#auto-start');
  autoStartToggle.addEventListener('change', async () => {
    const previous = state.autoStart;
    state.autoStart = autoStartToggle.checked;
    autoStartToggle.disabled = true;
    try {
      await ipcRenderer.invoke(CHANNEL.set('autoStart'), state.autoStart);
    } catch (error) {
      state.autoStart = previous;
      shadow.querySelector('.status').textContent = ui('Не удалось настроить автозапуск.', 'Could not configure autostart.');
      console.error('Could not configure autostart:', error);
    } finally {
      updateAutoStartControls();
    }
  });
  const minimizedToggle = shadow.querySelector('#start-minimized');
  minimizedToggle.addEventListener('change', async () => {
    const previous = state.startMinimized;
    state.startMinimized = minimizedToggle.checked;
    minimizedToggle.disabled = true;
    try {
      await ipcRenderer.invoke(CHANNEL.set('startMinimized'), state.startMinimized);
    } catch (error) {
      state.startMinimized = previous;
      shadow.querySelector('.status').textContent = ui('Не удалось настроить запуск свёрнутым.', 'Could not configure minimized start.');
      console.error('Could not configure minimized start:', error);
    } finally {
      updateAutoStartControls();
    }
  });
  const picker = shadow.querySelector('#accent-color');
  picker.addEventListener('input', () => {
    state.accentColor = picker.value.toLowerCase();
    applyAccentColor();
  });
  picker.addEventListener('change', async () => {
    const selected = picker.value.toLowerCase();
    picker.disabled = true;
    try {
      await ipcRenderer.invoke(CHANNEL.set('accentColor'), selected);
      state.savedAccentColor = selected;
    } catch (error) {
      state.accentColor = state.savedAccentColor;
      applyAccentColor();
      shadow.querySelector('.status').textContent = ui('Не удалось сохранить цвет.', 'Could not save the color.');
      console.error('Could not save cusade color:', error);
    } finally {
      updatePanelColor();
    }
  });
  const iconStyle = shadow.querySelector('#app-icon-style');
  iconStyle.addEventListener('change', async () => {
    const previous = state.appIconStyle;
    iconStyle.disabled = true;
    try {
      await ipcRenderer.invoke(CHANNEL.set('appIconStyle'), iconStyle.value);
      state.appIconStyle = iconStyle.value;
    } catch (error) {
      state.appIconStyle = previous;
      shadow.querySelector('.status').textContent = ui('Не удалось сохранить стиль значка.', 'Could not save the icon style.');
      console.error('Could not save application icon style:', error);
    } finally { updateAppIconStyle(); }
  });
  for (const key of Object.keys(DEFAULT_RADII)) {
    const slider = shadow.querySelector(`#${key}`);
    let previewFrame = 0;
    slider.addEventListener('input', () => {
      state.artworkRadii[key] = Number(slider.value);
      if (!previewFrame) previewFrame = requestAnimationFrame(() => {
        previewFrame = 0;
        applyArtworkRadii();
      });
    });
    slider.addEventListener('change', async () => {
      const selected = Number(slider.value);
      slider.disabled = true;
      try {
        await ipcRenderer.invoke(CHANNEL.setArtworkRadius, key, selected);
        state.savedArtworkRadii[key] = selected;
      } catch (error) {
        state.artworkRadii[key] = state.savedArtworkRadii[key];
        applyArtworkRadii();
        shadow.querySelector('.status').textContent = ui('Не удалось сохранить скругление.', 'Could not save the rounding.');
        console.error('Could not save cusade artwork radius:', error);
      } finally {
        updateArtworkRadiusControls();
      }
    });
  }
  for (const [key, id] of [['companionEnabled', 'companion-enabled'], ['companionSounds', 'companion-sounds']]) {
    const control = shadow.getElementById(id);
    control.checked = state[key];
    control.disabled = !state.settingsLoaded;
    control.addEventListener('change', async () => {
      const previous = state[key];
      state[key] = control.checked;
      control.disabled = true;
      syncCompanion();
      try { await ipcRenderer.invoke(CHANNEL.set(key), state[key]); }
      catch {
        state[key] = previous;
        shadow.querySelector('.status').textContent = ui('Не удалось сохранить настройку.', 'Could not save the setting.');
        syncCompanion();
      } finally { control.checked = state[key]; control.disabled = false; }
    });
  }
  document.body.appendChild(hosts.panelHost);
  updatePanelToggle();
  updateNearbyEventsToggle();
  updateAudioAdsToggle();
  updateVisualizationToggle();
  updateAnimationsToggle();
  updateRespectSystemMotionToggle();
  updateYourLikesToggle();
  updateInsightsRestoreControl();
  updateDiscordControls();
  updateAutoStartControls();
  updatePanelColor();
  updateAppIconStyle();
  updateArtworkRadiusControls();
}

module.exports = {
  updateCompanionControls,
  updatePanelToggle,
  updateNearbyEventsToggle,
  updateAudioAdsToggle,
  updateDiscordControls,
  updateAutoStartControls,
  updateVisualizationToggle,
  updateAnimationsToggle,
  updateRespectSystemMotionToggle,
  updateYourLikesToggle,
  updateAppIconStyle,
  updateSystemMotionHint,
  closePanel,
  togglePanel
};
