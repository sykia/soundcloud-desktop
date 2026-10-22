'use strict';

const { ipcRenderer } = require('electron');
const { CHANNEL } = require('../../shared/ipc.js');

// Session-only, bounded positions. Do not modify SoundCloud's history.state or
// scrollRestoration: the site may store its own router data there.
function installScrollHistory() {
  const positions = new Map();
  let url = location.href;
  let y = window.scrollY;
  let restoring = null;
  let timer = 0;
  let departing = false;
  function cancel() {
    clearInterval(timer);
    timer = 0;
    restoring = null;
    y = window.scrollY;
  }
  function remember() {
    positions.delete(url);
    positions.set(url, y);
    if (positions.size > 60) positions.delete(positions.keys().next().value);
  }
  function navigate() {
    if (url === location.href) return;
    // Use the last observed position: the site's router may already have
    // scrolled the destination to the top before Electron sends this event.
    remember();
    cancel();
    url = location.href;
    departing = false;
    y = window.scrollY;
  }
  window.addEventListener('scroll', () => {
    if (!restoring && !departing && location.href === url) y = window.scrollY;
  }, { passive: true });
  // Capture before a link handler can replace the current route's content.
  document.addEventListener('click', event => {
    const link = event.composedPath().find(node => node instanceof Element && node.matches('a[href]'));
    if (link && link.origin === location.origin && link.href !== location.href &&
        !event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0 && !link.target) {
      if (location.href === url && !restoring) { y = window.scrollY; remember(); }
      departing = true;
      setTimeout(() => { if (location.href === url) departing = false; }, 1000);
    }
  }, true);
  ipcRenderer.on(CHANNEL.siteNavigation, navigate);
  window.addEventListener('popstate', () => {
    navigate();
    if (!positions.has(url)) return;
    const target = positions.get(url);
    const destination = url;
    const deadline = performance.now() + 5000;
    restoring = destination;
    // Reapply briefly after reaching the target: SPA renders can reset scroll
    // after popstate. If the list is still short, wait for its asynchronous load.
    let reachedAt = 0;
    function restore() {
      if (restoring !== destination) return;
      if (location.href !== destination || performance.now() > deadline) { cancel(); return; }
      window.scrollTo({ top: target, behavior: 'instant' });
      y = window.scrollY;
      if (Math.abs(y - target) <= 1) {
        reachedAt ||= performance.now();
        if (performance.now() - reachedAt > 500) cancel();
      } else reachedAt = 0;
    }
    clearInterval(timer);
    timer = setInterval(restore, 80);
    requestAnimationFrame(restore);
  });
  for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
    window.addEventListener(event, cancel, { capture: true, passive: true });
  }
  window.addEventListener('pagehide', cancel);
}

module.exports = { installScrollHistory };
