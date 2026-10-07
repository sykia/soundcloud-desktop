'use strict';

// Visual setting appliers: artist tools, nearby events, accent color and
// artwork radii, plus the panel controls that mirror the color picker and the
// radius sliders. updatePanelColor/updateArtworkRadiusControls live here so
// panel.js only carries a one-way dependency on this module.

const { state } = require('./state.js');
const { hosts } = require('./hosts.js');
const { DEFAULT_ACCENT_COLOR, DEFAULT_RADII } = require('../../shared/constants.js');
const { syncArtworkPage } = require('./page-scope.js');

function applyArtistToolsVisibility() {
  document.documentElement?.classList.toggle('cusade-hide-artist-tools', state.hideArtistTools);
}

function applyNearbyEventsVisibility() {
  document.documentElement?.classList.toggle('cusade-hide-nearby-events', state.hideNearbyEvents);
}

function applyAccentColor() {
  const root = document.documentElement;
  if (!root) return;
  const channels = state.accentColor.match(/[0-9a-f]{2}/gi).map(value => parseInt(value, 16));
  root.style.setProperty('--cusade-accent', state.accentColor);
  root.style.setProperty('--cusade-accent-rgb', channels.join(','));
  root.classList.toggle('cusade-custom-accent', state.accentColor !== DEFAULT_ACCENT_COLOR);
  updatePanelColor();
}

function applyArtworkRadii() {
  const root = document.documentElement;
  if (!root) return;
  syncArtworkPage();
  for (const [key, value] of Object.entries(state.artworkRadii)) {
    root.style.setProperty(`--cusade-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`, `${value}%`);
  }
  updateArtworkRadiusControls();
}

function updatePanelColor() {
  const picker = hosts.panelHost?.shadowRoot.querySelector('#accent-color');
  const value = hosts.panelHost?.shadowRoot.querySelector('#accent-value');
  if (picker) {
    picker.value = state.accentColor;
    picker.disabled = !state.settingsLoaded;
  }
  if (value) value.textContent = state.accentColor.toUpperCase();
}

function updateArtworkRadiusControls() {
  for (const key of Object.keys(DEFAULT_RADII)) {
    const slider = hosts.panelHost?.shadowRoot.querySelector(`#${key}`);
    const value = hosts.panelHost?.shadowRoot.querySelector(`#${key}-value`);
    if (slider) {
      slider.value = state.artworkRadii[key];
      slider.disabled = !state.settingsLoaded;
    }
    if (value) value.textContent = `${state.artworkRadii[key]}%`;
  }
}

module.exports = {
  applyArtistToolsVisibility,
  applyNearbyEventsVisibility,
  applyAccentColor,
  applyArtworkRadii,
  updatePanelColor,
  updateArtworkRadiusControls
};