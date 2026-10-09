'use strict';

// SPA route transitions (veil + sweep) and the history patch that triggers them.
// setIntroPending() is called by the orchestrator around the startup applyMotion
// so the intro reveal only plays for the first page, never for a deliberate
// toggle in the panel.

const { motionActive } = require('./motion.js');
const { ipcRenderer } = require('electron');
const { CHANNEL } = require('../../shared/ipc.js');
const { syncPageScope } = require('./page-scope.js');
const { scheduleLocalization } = require('./localization.js');

// Page transitions. SoundCloud routes inside its SPA with history.pushState, so
// a route change is caught there; a full page load only gets the intro reveal.
// Both run on two fixed layers that move opacity and scaleX, which is why a
// transition stays cheap even while the new page renders hundreds of rows.
let routeHost = null;
let routeWatchReady = false;
let routeLastUrl = '';
let routeVeilTimer = 0;
let routeSweepTimer = 0;
let lastTransitionAt = 0;
const ROUTE_INTRO_WINDOW_MS = 3000;

// The reveal belongs to the first page the app opens, not to the moment someone
// flips the setting in the panel: a veil that appears because a panel was opened
// reads as a glitch. The flag is set only around the settings that arrive at
// startup, so the reveal survives a slow settings round trip, while a deliberate
// toggle never triggers it.
let routeIntroPending = false;

function setIntroPending(value) {
  routeIntroPending = Boolean(value);
}

function runRouteTransition(origin) {
  if (!routeHost?.isConnected) return;
  if (performance.now() - lastTransitionAt < 220) return;
  lastTransitionAt = performance.now();
  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? Math.min(window.innerHeight * .28, 240);
  routeHost.style.setProperty('--cusade-route-x', `${x}px`);
  routeHost.style.setProperty('--cusade-route-y', `${y}px`);
  routeHost.classList.remove('cusade-route--veil', 'cusade-route--sweep');
  // Restart the sweep from scaleX(0): without a forced reflow between the class
  // changes the bar has no previous value to animate from and snaps to full width.
  void routeHost.offsetWidth;
  routeHost.classList.add('cusade-route--sweep', 'cusade-route--veil');
  clearTimeout(routeVeilTimer);
  routeVeilTimer = setTimeout(() => routeHost?.classList.remove('cusade-route--veil'), 220);
  clearTimeout(routeSweepTimer);
  routeSweepTimer = setTimeout(() => routeHost?.classList.remove('cusade-route--sweep'), 900);
}

function onTabActivated(event) {
  if (!motionActive() || !routeHost?.isConnected) return;
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  const tab = target?.closest('[role="tab"], .settingsMain__tabs .g-tabs-link, ' +
    '.profileTabs a, .userNetworkTabs a');
  if (!tab || tab.closest('#cusade-panel-host') || tab.getAttribute('aria-selected') === 'true' ||
      tab.getAttribute('aria-current') === 'page') return;
  const rect = tab.getBoundingClientRect();
  runRouteTransition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
}

function onRouteChanged() {
  // The scope and the localization context follow the route even when motion is
  // off, so the dictionary never lags a page behind by one navigation.
  const url = location.href;
  if (url === routeLastUrl) return;
  routeLastUrl = url;
  syncPageScope();
  scheduleLocalization(true);
  if (!motionActive() || !routeHost?.isConnected) return;
  // SoundCloud pushes the same URL for scroll restoration; a veil for that
  // would flicker on every scroll.
  runRouteTransition();
}

function installRouteWatch() {
  if (routeWatchReady) return;
  routeWatchReady = true;
  routeLastUrl = location.href;
  ipcRenderer.on(CHANNEL.siteNavigation, onRouteChanged);
  addEventListener('popstate', onRouteChanged);
  document.addEventListener('click', onTabActivated, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') onTabActivated(event);
  }, true);
}

function updateRouteTransition() {
  if (!motionActive()) {
    clearTimeout(routeVeilTimer);
    clearTimeout(routeSweepTimer);
    routeHost?.remove();
    routeHost = null;
    return;
  }
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', updateRouteTransition, { once: true });
    return;
  }
  installRouteWatch();
  if (routeHost?.isConnected) return;
  routeHost = document.createElement('div');
  routeHost.className = 'cusade-route';
  routeHost.setAttribute('aria-hidden', 'true');
  // The bar goes in first so the accent line stays above the veil.
  routeHost.innerHTML = '<span class="cusade-route__veil"></span>' +
    '<span class="cusade-route__wash"></span><span class="cusade-route__bar"></span>';
  document.body.appendChild(routeHost);
  routeLastUrl = location.href;
  // The reveal plays when motion first turns on during startup, or very early in
  // a document (the second clause covers the case where the body was not ready
  // yet and the work was deferred to DOMContentLoaded).
  if (routeIntroPending || performance.now() < ROUTE_INTRO_WINDOW_MS) {
    routeHost.classList.add('cusade-route--intro');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      routeHost?.classList.remove('cusade-route--intro');
    }));
  }
}

module.exports = { installRouteWatch, updateRouteTransition, setIntroPending };
