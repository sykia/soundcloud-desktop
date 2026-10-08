'use strict';

// Page family detection used by the Russian dictionary and by the motion
// scopes. One class on <html> per family, plus the 'cusade-ui' baseline class,
// so styles and translations can react to a route change with one call.

const { state } = require('./state.js');
const { queuePageEnterTargets } = require('./enter.js');

function syncArtworkPage() {
  document.documentElement?.classList.toggle('cusade-set-page', /(^|\/)sets\//.test(location.pathname));
}

// The pages SoundCloud rebuilt in the last few releases (settings, studio,
// upload, subscriptions) do not share the markup the old ones use, so they are
// recognised by their route instead of by their containers. Everything else
// falls into 'other', which still gets the interface styling: a profile page is
// full of tabs, rows and buttons that deserve the same reactions as the rest.
const PAGE_SCOPES = [
  ['settings', /^\/settings(\/|$)/],
  ['studio', /^\/(?:studio|artists)(\/|$)/],
  ['upload', /^\/upload(\/|$)/],
  ['subscriptions', /^\/subscriptions(\/|$)/],
  ['notifications', /^\/notifications(\/|$)/],
  ['messages', /^\/(?:messages|im)(\/|$)/],
  ['search', /^\/search(\/|$)/],
  ['library', /^\/you\/library(\/|$)/],
  ['feed', /^\/feed(\/|$)/],
  ['discover', /^\/(?:discover)?\/?$/]
];

function detectPageScope() {
  if (location.hostname === 'artists.soundcloud.com') return 'studio';
  const path = location.pathname.toLowerCase();
  for (const [name, pattern] of PAGE_SCOPES) if (pattern.test(path)) return name;
  // Personal permalinks are normally /artist, /artist/track and
  // /artist/sets/playlist. They need distinct translation contexts, but the
  // broad 'other' style scope still applies to all three.
  if (/^\/[a-z0-9_.-]+\/sets\/[^/]+/i.test(path)) return 'playlist';
  if (/^\/[a-z0-9_.-]+\/[^/]+/i.test(path) && !/^\/(?:you|studio|pages|tags|stations|charts|pro|artists|newsroom|help|support|subscriptions|settings|upload)\//.test(path)) return 'track';
  if (/^\/[a-z0-9_.-]+\/?$/i.test(path) && !/^\/(?:you|studio|pages|tags|stations|charts|pro|artists|newsroom|help|support|subscriptions|settings|upload)\/?$/.test(path)) return 'profile';
  return 'other';
}

// One class for the app and one per page. The animation rules and the dictionary
// both read them, so a page never gets a style or a word it should not have, and
// a route change only has to update one attribute set.
function syncPageScope() {
  const root = document.documentElement;
  if (!root) return;
  const scope = detectPageScope();
  if (scope === state.pageScope) return;
  if (state.pageScope) root.classList.remove(`cusade-page-${state.pageScope}`);
  state.pageScope = scope;
  root.classList.add(`cusade-page-${scope}`);
  root.classList.toggle('cusade-ui', scope !== '');
  queuePageEnterTargets();
}

module.exports = { PAGE_SCOPES, detectPageScope, syncArtworkPage, syncPageScope };
