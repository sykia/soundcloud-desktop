'use strict';

// AUTO-SPLIT from preload.js — requires/exports finished by hand.
// // Rules that decide whether a text node belongs to the interface or to a person.

// Everything below is about one question: is this text ours to rewrite? SoundCloud
// only ever renders its own labels from a fixed string bundle, so the veto is
// built from the containers that hold someone else's words instead of from the
// containers that hold the interface. Anything not vetoed is treated as UI, which
// is what makes a page released last month translate without a code change.
// The preload's own light-DOM components. Only these are cusade UI: their text
// is bilingual already and they must never be treated as site content, either by
// the translation pass or by the page-enter animation. A generic `[class*="cusade-"]`
// cannot be used here: the document element carries the control classes
// (cusade-animations, cusade-ui, cusade-page-*, cusade-hide-*, ...), and an
// ancestor match against that substring would veto every node on the page.
const CUSADE_OWNED = '#cusade-panel-host, #cusade-update-host, #cusade-insights-host,' +
  ' .cusade-route, .cusade-route__bar, .cusade-route__veil, .cusade-route--intro,' +
  ' .cusade-visualization, .cusade-likes-shuffle, .cusade-likes-transition,' +
  ' .cusade-track-backdrop, .cusade-insights-banner, .cusade-insights-editbar,' +
  ' .cusade-insights-dropzone, .cusade-insights-drag-ghost, .cusade-insights-slot,' +
  ' .cusade-update, .cusade-panel';
const SKIP_TEXT_CONTEXT = 'script, style, noscript, template, svg, math, iframe, object, ' +
  'embed, canvas, video, audio, textarea, input, select, [contenteditable]:not([contenteditable="false"]), ' +
  `[aria-hidden="true"], ${CUSADE_OWNED}`;

// The element itself is a title, a name or a value written by a person.
const USER_TEXT_OWN = '.soundTitle__title, .soundTitle__username, .soundTitle__performer, ' +
  '.sound__title, .sound__username, .sound__performerName, .fullHero__title, .fullHero__username, ' +
  '.fullHero__userName, .trackItem__title, .trackItem__performer, .playableTile__title, ' +
  '.playableTile__subtitle, .playableTile__username, .playableTile__header, .playableTile__tagLink, ' +
  '.playbackSoundBadge__titleLink, .playbackSoundBadge__lightLink, .playbackSoundBadge__usernameLink, ' +
  '.userBadge__usernameLink, .userBadge__name, .userBadge__titleLink, .soundBadge__titleLink, ' +
  '.soundBadge__lightLink, .soundBadge__context, .commentBadge__title, .profileHeaderInfo__userName, ' +
  '.profileHeaderInfo__name, .profileHeaderInfo__additional, .profileHeaderInfo__location, ' +
  '.profileHeaderInfo__website, .listenArtwork__caption, .listenArtworkWrapper__caption, ' +
  '.listenInfo__caption, .playlistTitle, .playlist__title, .playlistTracks__title, ' +
  '.searchItem__title, .searchItem__content, .userStream__title, .userStream__username, ' +
  '.messageItem__content, .notificationItem__message, [data-test-id="ogMeta"]';

// A block that belongs to a person: their text, not the interface around it.
const USER_TEXT_INSIDE = '.commentItem, .commentPopover, .commentForm__form, ' +
  '.profileHeaderInfo__additional, .listenDescription, .listenInfo__description, .listenTags, ' +
  '.entityContext__caption, .playlist-description, .playlist__description, .playlistTracks, ' +
  '.messageItem, .messageListItem, .messageItemContent, .messageContainer, .conversationItem, ' +
  '.messagesList, .messageHeader, .messageContent, .bio, [class*="userBio"], [class*="userDescription"], ' +
  '.og-description, .stationDescription, .listenArtwork__caption, .searchItem, ' +
  '.commentItem__content, [class*="notificationItem"] , .soundTitle, .fullHero, .userStreamItem';

// A control inside a user block still carries its own label, so a Play button in
// a comment stays translatable while the comment text never does.
const CONTROL_SELECTOR = 'button, a, input, textarea, select, option, label, [role="button"], ' +
  '[role="option"], .sc-button, .sc-button-icon, .sc-button-follow, .sc-button-like';

const UI_ROUTE = /^\/(?:you|im|settings|pages|discover|stations|station-search|tags|charts|pro|studio|upload|artists?|mobile|developers?|jobs|newsroom|terms|privacy|search|help|support|download|insights|stream|feed|messages|notifications|subscriptions|soundcloud|go|magic|premium|popular|trending|explore|sounds?|likes|history|overview|following|albums|vinyl|blog|news|press|legal|dmca|careers|about|app|desktop|api|store)(?:[/?#]|$)/i;

// A link that leaves the interface behind and points at a person, a track, a
// playlist or a station. Its label is user content, whatever it says.
function isContentHref(href) {
  const value = String(href || '').trim();
  // An anchor with an empty href is a button-shaped interface control (its
  // label is UI text), not a link to a person, track, playlist or station.
  // Real content links on SoundCloud always carry a real path.
  if (!value) return false;
  if (/^(mailto:|tel:|sms:|javascript:|#)/i.test(value)) return false;
  if (/^(https?:)?\/\//i.test(value)) return false;
  const path = value.startsWith('/') ? value : `/${value.replace(/^\.\//, '')}`;
  if (/^\/(user|users|playlist|station|track|tracks)s?(\/|$)/i.test(path)) return true;
  return !UI_ROUTE.test(path);
}

function isTranslatableText(element) {
  // SoundCloud duplicates visible timestamps inside <time class="relativeTime">:
  // the visible copy is aria-hidden (a decorative duplicate for screen readers)
  // and the sc-visuallyhidden copy carries the accessible label. Both are UI
  // text, and a person cannot put a <time> element inside a comment, so the
  // relative-time container escapes the aria-hidden veto.
  if (element.closest('time.relativeTime')) return true;
  if (element.closest(SKIP_TEXT_CONTEXT)) return false;
  // A select only ever holds options, and its label comes from the option text.
  if (element.closest('select') && !element.matches('option, optgroup')) return false;
  return true;
}

function isInterfaceElement(element, mode = 'text') {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
  if (element.closest(`script, style, noscript, template, svg, ${CUSADE_OWNED}`)) return false;
  if (mode === 'text' && !isTranslatableText(element)) return false;
  if (element.matches(USER_TEXT_OWN)) return false;
  // A button, an input or a placeholder inside a comment still describes itself.
  if (mode === 'attributes' && element.matches(CONTROL_SELECTOR)) return true;
  if (element.closest(USER_TEXT_INSIDE)) return false;
  const link = element.closest('a[href]');
  return !(link && isContentHref(link.getAttribute('href')));
}

module.exports = { CUSADE_OWNED, isInterfaceElement };
