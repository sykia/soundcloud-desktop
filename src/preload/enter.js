'use strict';

// Enter animations for feed rows and page blocks, driven by IntersectionObserver.
// The observer and the pending set are module-local and created lazily, so with
// motion off nothing on this module's hot path ever allocates.

const { state } = require('./state.js');
const { motionActive } = require('./motion.js');
const { CUSADE_OWNED } = require('./localization-veto.js');

const ENTER_TARGETS = '.soundList__item, .searchList__item, .trackList__item,' +
  ' .usersList__item, .soundBadgeList__item, .commentBadgeList__item,' +
  ' .userStreamItem, .playableTile';

const pendingEnterElements = new Set();
let enterIntersection = null;
let enterWatcher = null;

function watchEnterTarget(element) {
  if (pendingEnterElements.has(element)) return;
  pendingEnterElements.add(element);
  enterIntersection ??= new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('cusade-enter-target');
      enterIntersection.unobserve(entry.target);
      pendingEnterElements.delete(entry.target);
    }
  }, { rootMargin: '160px 0px' });
  enterIntersection.observe(element);
}

function queueEnterTargets(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  if (node.matches(ENTER_TARGETS)) watchEnterTarget(node);
  for (const nested of node.querySelectorAll(ENTER_TARGETS)) watchEnterTarget(nested);
  queuePageEnterTargets(node);
}

// Enter blocks for the pages that arrived with the new SoundCloud interface.
// Those pages render their sections as ordinary divs, so the candidates come
// from the class names they use and the list is capped: a settings tab holds
// more than a hundred divs, and animating all of them would promote a hundred
// compositor layers for a page that is meant to feel calm. Only the outermost
// match per branch is kept, and the same observer as the feed rows decides when
// one of them is actually on screen.
const PAGE_ENTER_BLOCKS = 'h1, h2, [role="tablist"], fieldset, [class*="Section"], [class*="section"],' +
  ' [class*="Dropzone"], [class*="dropzone"], [class*="Zone"], [class*="Tile"], [class*="tile"]';
const PAGE_ENTER_CARDS = '[class*="Card"], [class*="card"], [class*="Stat"], [class*="stat"],' +
  ' [class*="Panel"], [class*="panel"]';
const PAGE_ENTER_LIMIT = 24;
// What 0.4.2 already reveals on its own. Enter targets are skipped inside these
// so a page never ends up with two animations on one element: rule 1732 is more
// specific than the module rules below it and would quietly change the duration
// of an effect that already works.
const PAGE_ENTER_SKIP = '.sidebarModule, .profileHeaderInfo, .userNetworkInfo,' +
  ' .listenInfo, .listenEngagement, .commentsModule, .likesModule, .playableTile,' +
  ' .soundList__item, .searchList__item, .trackList__item, .usersList__item,' +
  ' .soundBadgeList__item, .commentBadgeList__item, .userStreamItem, .searchItem,' +
  ' .trackItem, .userBadge, .soundBadge, .commentBadge, [role="menu"], .dropdownMenu';
// The home page and the feed already have their own enter effect from 0.4.2
// (feed rows plus the sidebar modules), so the block reveal is limited to the
// pages that would otherwise arrive with nothing moving at all.
const PAGE_ENTER_SCOPES = new Set(['settings', 'studio', 'upload', 'subscriptions',
  'notifications', 'messages', 'library', 'other']);

function outermostMatches(root, selector) {
  const matches = new Set();
  for (const element of root.querySelectorAll(selector)) {
    if (element.closest(CUSADE_OWNED)) continue;
    if (element.closest(PAGE_ENTER_SKIP)) continue;
    if (element.parentElement?.closest?.(selector)) continue;
    matches.add(element);
  }
  return matches;
}

function queuePageEnterTargets(root) {
  if (!motionActive() || !PAGE_ENTER_SCOPES.has(state.pageScope) || !document.body) return;
  const scope = root && root.nodeType === Node.ELEMENT_NODE ? root : document.body;
  // An inserted node that holds none of the candidates is skipped without
  // walking it, which is what keeps this off the hot path of a busy feed.
  if (scope !== document.body && !scope.querySelector(PAGE_ENTER_BLOCKS)) return;
  let queued = 0;
  for (const element of outermostMatches(scope, PAGE_ENTER_BLOCKS)) {
    watchEnterTarget(element);
    if (++queued >= PAGE_ENTER_LIMIT) return;
  }
  for (const element of outermostMatches(scope, PAGE_ENTER_CARDS)) {
    watchEnterTarget(element);
    if (++queued >= PAGE_ENTER_LIMIT) return;
  }
}

// Feed items fade in through cusade-content-enter. The class is only put on rows
// that actually reach the viewport: without this, a single page render starts
// one animation per inserted row, and Chromium promotes a compositor layer for
// each of them, which is what made long feeds stutter while scrolling.
function updateEnterWatcher() {
  const active = motionActive();
  document.documentElement?.classList.toggle('cusade-enter', active);
  if (active) {
    if (!enterWatcher) {
      enterWatcher = new MutationObserver(mutations => {
        if (!motionActive()) return;
        for (const mutation of mutations) {
          if (mutation.type !== 'childList') continue;
          for (const node of mutation.addedNodes) queueEnterTargets(node);
        }
      });
    }
    if (document.body) enterWatcher.observe(document.body, { childList: true, subtree: true });
    return;
  }
  enterWatcher?.disconnect();
  for (const element of pendingEnterElements) element.classList.remove('cusade-enter-target');
  pendingEnterElements.clear();
}

module.exports = { queuePageEnterTargets, updateEnterWatcher };