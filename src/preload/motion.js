'use strict';

// Single source of truth for every cusade animation. The page CSS reacts to the
// 'cusade-animations' class on the document and on each cusade host, while the
// JavaScript paths ask motionActive() directly, so styles, WAAPI effects, the
// visualization and the panels can never disagree about whether motion is on.
//
// applyMotion() also drives enter, route and panel hooks. They are wired by
// src/preload/index.js through setMotionHooks(), which keeps this module free
// of imports from the feature modules and the require() graph acyclic.

const { state } = require('./state.js');
const { hosts } = require('./hosts.js');

const NO_OP = () => {};
let motionHooks = {
  finishPlaybackSwitch: NO_OP,
  updateEnterWatcher: NO_OP,
  updateRouteTransition: NO_OP,
  updateSystemMotionHint: NO_OP
};

function setMotionHooks(hooks) {
  motionHooks = { ...motionHooks, ...hooks };
}

// Observed on every use, not cached at load: the preference can change while the app runs.
const systemReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function motionActive() {
  return state.animations && (!state.respectSystemMotion || !systemReducedMotion.matches);
}

function applyMotion() {
  const active = motionActive();
  document.documentElement?.classList.toggle('cusade-animations', active);
  hosts.panelHost?.classList.toggle('cusade-animations', active);
  hosts.insightsHost?.classList.toggle('cusade-animations', active);
  hosts.updateHost?.classList.toggle('cusade-animations', active);
  if (!active) {
    // Never leave a half finished effect on screen when motion is switched off.
    motionHooks.finishPlaybackSwitch();
    hosts.visualizationHost?.querySelector('.cusade-visualization__art--changing')
      ?.classList.remove('cusade-visualization__art--changing');
    for (const animation of document.getAnimations()) {
      if (animation.id === 'cusade-badge-enter') animation.cancel();
    }
  }
  motionHooks.updateEnterWatcher();
  motionHooks.updateRouteTransition();
  motionHooks.updateSystemMotionHint();
}

// The system preference can change at any moment, so motion is recalculated
// instead of relying on a snapshot taken when the page loaded.
systemReducedMotion.addEventListener('change', applyMotion);

module.exports = { systemReducedMotion, motionActive, applyMotion, setMotionHooks };