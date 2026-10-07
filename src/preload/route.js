'use strict';

// SPA route transitions (veil + sweep) and the history patch that triggers them.
// setIntroPending() is called by the orchestrator around the startup applyMotion
// so the intro reveal only plays for the first page, never for a deliberate
// toggle in the panel.

const { motionActive } = require('./motion.js');
const { syncPageScope } = require('./page-scope.js');

// Page transitions. SoundCloud routes inside its SPA with history.pushState, so
// a route change is caught there; a full page load only gets the intro reveal.
// Both run on two fixed layers that move opacity and scaleX, which is why a
// transition stays cheap even while the new page renders hundreds of rows.
let routeHost = null;
let routeWatchReady = false;
let routeLastUrl = '';
let routeVeilTimer = 0;
let routeSweepTimer = 0;
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

function runRouteTransition() {
  if (!routeHost?.isConnected) return;
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

function onRouteChanged() {
  // The scope and the localization context follow the route even when motion is
  // off, so the dictionary never lags a page behind by one navigation.
  syncPageScope();
  if (!motionActive() || !routeHost?.isConnected) return;
  const url = location.href;
  // SoundCloud pushes the same URL for scroll restoration; a veil for that
  // would flicker on every scroll.
  if (url === routeLastUrl) return;
  routeLastUrl = url;
  runRouteTransition();
}

function installRouteWatch() {
  if (routeWatchReady) return;
  routeWatchReady = true;
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    if (typeof original !== 'function' || original.cusade === true) continue;
    const patched = function (...args) {
      const result = original.apply(this, args);
      queueMicrotask(onRouteChanged);
      return result;
    };
    patched.cusade = true;
    history[method] = patched;
  }
  addEventListener('popstate', onRouteChanged);
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
  routeHost.innerHTML = '<span class="cusade-route__bar"></span>' +
    '<span class="cusade-route__veil"></span>';
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

module.exports = { updateRouteTransition, setIntroPending };