'use strict';

// AUTO-SPLIT from preload.js — requires/exports finished by hand.
// // The cusade page stylesheet and the NEW_UI_GUARD selector list.

// One selector list with everything 0.4.2 already animates. Every new rule below
// is written as a narrow :where() plus :not(NEW_UI_GUARD), so an element that has
// a working hover today simply stops matching the new rules: no new transform,
// no shorter or longer curve, nothing that could be read as a change.
// Only class selectors appear here, because a selector inside :not() adds its own
// specificity to the rule, and an id would lift the new rules above the old ones.
// Two cusade hosts are id based but live in shadow roots, so a light DOM selector
// cannot reach them anyway.
const GUARDED_UI = [
  '[class*="cusade-"]',
  '.sc-button, .sc-button *',
  '.sc-button-icon, .sc-button-like, .sc-button-follow, .sc-button-repost, ' +
    '.sc-button-share, .sc-button-more, .sc-button-copylink, .sc-button-play',
  '.playableTile, .playableTile *',
  '.sidebarModule, .sidebarModule *',
  '.soundList__item, .soundList__item *',
  '.searchList__item, .searchList__item *',
  '.trackList__item, .trackList__item *',
  '.usersList__item, .usersList__item *',
  '.soundBadgeList__item, .soundBadgeList__item *',
  '.commentBadgeList__item, .commentBadgeList__item *',
  '.userStreamItem, .userStreamItem *',
  '.searchItem, .searchItem *',
  '.trackItem, .trackItem *',
  '.commentItem, .commentItem *',
  '.userBadge, .userBadge *',
  '.soundBadge, .soundBadge *',
  '.commentBadge, .commentBadge *',
  '.profileTabs, .profileTabs *',
  '.userNetworkTabs, .userNetworkTabs *',
  '.header__navMenuItem, .header__navMenuItem *',
  '.header__moreButton, .header__moreButton *',
  '.headerSearch, .headerSearch *',
  '.userNetwork__likeActions, .userNetwork__likeActions *',
  '.playControls, .playControls *',
  '.volume, .volume *',
  '.listenArtworkWrapper, .listenArtworkWrapper *',
  '.profileHeaderInfo, .profileHeaderInfo *',
  '.userNetworkInfo, .userNetworkInfo *',
  '.listenInfo, .listenInfo *',
  '.listenEngagement, .listenEngagement *',
  '.commentsModule, .commentsModule *',
  '.likesModule, .likesModule *',
  '.commentPopover, .commentPopover *',
  '.userDropbar, .userDropbar *',
  '.dropdownMenu, .dropdownMenu *',
  '.playControlsPanel, .playControlsPanel *',
  '.footer'
];
const NEW_UI_GUARD = GUARDED_UI.join(', ');


function inject() {
  const style = document.createElement('style');
  style.id = 'cusade-page-style';
  style.textContent = `
    .cusade-download { display: inline-flex; align-items: center; justify-content: center; vertical-align: middle; }
    html.cusade-animations .cusade-download--loading svg {
      animation: cusade-download-pulse 900ms ease-in-out infinite;
    }
    html.cusade-animations .cusade-download--done svg,
    html.cusade-animations .cusade-download--error svg {
      animation: cusade-action-pop 380ms cubic-bezier(.3,.62,.36,1);
    }
    @keyframes cusade-download-pulse {
      0%, 100% { transform: translateY(-2px); opacity: .65; }
      50% { transform: translateY(2px); opacity: 1; }
    }
    .cusade-download--error { color: #d30029 !important; }
    .cusade-download--done { color: #19a352 !important; }
    html.cusade-hide-artist-tools .newUploadBanner,
    html.cusade-hide-artist-tools .banner,
    html.cusade-hide-artist-tools .sidebarModule:has(iframe[title="Artist tools" i], iframe[src*="/n/embeds/credit-tracker"]) {
      display: none !important;
    }
    html.cusade-hide-nearby-events .mixedModularHome__item:has(.velvetCakeModule > .velvetCakeModule__iframe[src^="https://artist-events.soundcloud.com/banner"]),
    html.cusade-hide-nearby-events .velvetCakeModule:has(> .velvetCakeModule__iframe[src^="https://artist-events.soundcloud.com/banner"]) {
      display: none !important;
    }
    html.cusade-custom-accent body {
      --special-color: var(--cusade-accent) !important;
      --font-special-color: var(--cusade-accent) !important;
      --special-rgb: var(--cusade-accent-rgb) !important;
      --button-special-background-color: var(--cusade-accent) !important;
      --button-secondary-selected-font-color: var(--cusade-accent) !important;
      --button-secondary-selected-active-font-color: var(--cusade-accent) !important;
      --button-secondary-selected-hover-font-color: rgba(var(--cusade-accent-rgb), 0.4) !important;
      --button-tertiary-selected-font-color: var(--cusade-accent) !important;
      --button-tertiary-selected-active-font-color: var(--cusade-accent) !important;
      --button-tertiary-selected-hover-font-color: rgba(var(--cusade-accent-rgb), 0.4) !important;
      --checkbox-checked-background-color: var(--cusade-accent) !important;
      --checkbox-checked-border-color: var(--cusade-accent) !important;
      --toggle-on-body-color: var(--cusade-accent) !important;
      --toggle-on-body-hover-color: var(--cusade-accent) !important;
    }
    .image.image__rounded,
    .image.image__rounded .image__full {
      border-radius: var(--cusade-avatar-radius, 50%) !important;
    }
    .image.sc-artwork:not(.image__rounded),
    .image.sc-artwork:not(.image__rounded) .image__full,
    .playableTile__image,
    .playableTile__imageOverlay,
    .cusade-visualization__art {
      border-radius: var(--cusade-track-radius, 3%) !important;
    }
    .playableTile:has(.playableTile__artworkLink[href*="/sets/"]) .image.sc-artwork,
    .playableTile:has(.playableTile__artworkLink[href*="/sets/"]) .image.sc-artwork .image__full,
    .playableTile:has(.playableTile__artworkLink[href*="/sets/"]) .playableTile__image,
    .playableTile:has(.playableTile__artworkLink[href*="/sets/"]) .playableTile__imageOverlay,
    html.cusade-set-page .listenArtworkWrapper__artwork .image.sc-artwork,
    html.cusade-set-page .listenArtworkWrapper__artwork .image.sc-artwork .image__full {
      border-radius: var(--cusade-album-radius, 3%) !important;
    }
    .cusade-visualization {
      position: relative; overflow: hidden; display: flex; gap: 24px;
      min-height: 330px; margin: 16px 16px 8px; padding: 24px;
      border-radius: 16px; background: #10384c; color: #fff;
      font-family: system-ui, sans-serif; isolation: isolate;
    }
    /* The theme cross-fade of these two cards lives in the card rule further
       down: it has to share one transition declaration with the hover effects,
       otherwise the later rule wins as a whole and the fade is lost. */
    .cusade-track-backdrop {
      position: absolute; inset: 0; z-index: -2; pointer-events: none;
      background-position: center; background-size: cover; background-repeat: no-repeat;
      opacity: 0;
    }
    html.cusade-animations .cusade-track-backdrop { transition: opacity 900ms cubic-bezier(.3,.62,.36,1); }
    .cusade-track-backdrop--visible { opacity: .8; }
    .cusade-visualization::after, .cusade-insights-banner::after {
      content: ''; position: absolute; inset: 0; z-index: -1;
      background: linear-gradient(100deg, #000b 5%, #0008 60%, #0005);
      pointer-events: none;
    }
    .cusade-visualization__main { display: flex; flex: 1; min-width: 0; flex-direction: column; }
    .cusade-visualization__heading { display: flex; align-items: center; gap: 16px; min-width: 0; }
    .cusade-visualization__play {
      flex: none; width: 64px; height: 64px; border: 1px solid #ffffff55;
      border-radius: 50%; background: #ffffff18; color: #fff; cursor: pointer;
      font: 30px system-ui;
    }
    .cusade-visualization__play:hover { background: #ffffff35; }
    .cusade-visualization__meta { min-width: 0; }
    .cusade-visualization__title { display: block; overflow: hidden; color: #fff;
      font-size: clamp(18px, 2vw, 27px); font-weight: 700; text-overflow: ellipsis;
      white-space: nowrap; text-decoration: none; }
    .cusade-visualization__artist { display: block; margin-top: 5px; color: #b9d9e8;
      font-size: 14px; text-decoration: none; }
    .cusade-visualization__title:hover, .cusade-visualization__artist:hover { text-decoration: underline; }
    /* Russian settings tabs need their full labels without a second line. */
    html.cusade-page-settings .settingsMain__tabs {
      display: flex; flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden; max-width: 100%;
    }
    html.cusade-page-settings .settingsMain__tabs > .g-tabs-item { flex: 0 0 auto; float: none; }
    html.cusade-page-settings .settingsMain__tabs .g-tabs-link {
      white-space: nowrap; font-size: 20px; padding-left: 8px; padding-right: 8px;
    }
    .cusade-visualization__wave { position: relative; width: 100%; height: 108px;
      margin-top: auto; border: 0; padding: 0; background: transparent; cursor: pointer; }
    .cusade-visualization__bars { position: absolute; inset: 0; display: flex;
      align-items: center; gap: 2px; overflow: hidden; }
    /* Bars fill the strip and are scaled from its centre, which is visually the
       same as a centred height percentage but never needs a re-layout. */
    .cusade-visualization__bars span { flex: 1; min-width: 1px; height: 100%;
      transform: scaleY(.3); background: #b9e6f4; }
    .cusade-visualization__bars--base { opacity: .4; }
    .cusade-visualization__bars--played { clip-path: inset(0 calc(100% - var(--cusade-progress, 0%)) 0 0); }
    .cusade-visualization__times { display: flex; justify-content: space-between; margin-top: 4px;
      color: #e4f4fa; font-size: 12px; }
    .cusade-visualization__art { flex: none; width: min(30%, 280px); aspect-ratio: 1;
      align-self: center; border-radius: 12px; object-fit: cover; box-shadow: 0 12px 30px #0005; }
    html.cusade-animations .cusade-visualization :is(.cusade-visualization__meta,
      .cusade-visualization__art, .cusade-visualization__wave, .cusade-visualization__times) {
      transition: opacity 200ms ease, transform 200ms ease;
    }
    html.cusade-animations .cusade-visualization--switching
      :is(.cusade-visualization__meta, .cusade-visualization__art,
        .cusade-visualization__wave, .cusade-visualization__times),
    html.cusade-animations .cusade-visualization__art--changing {
      opacity: 0;
      transform: translateY(5px);
    }
    html.cusade-animations .cusade-visualization__bars--played {
      transition: clip-path 360ms ease;
    }
    /* The bars themselves carry no transition on purpose: a track switch redraws
       all of them at once, so a height transition would only add 320 layout passes. */
    /* Neutral state for the track switch effects. The switching classes are only
       added while motionActive() is true, so these rules normally never match;
       they exist so that turning the setting off mid-transition cannot leave a
       hidden cover or a moved caption behind. */
    html:not(.cusade-animations) .cusade-visualization
      :is(.cusade-visualization__meta, .cusade-visualization__art,
        .cusade-visualization__wave, .cusade-visualization__times) {
      opacity: 1;
      transform: none;
    }
    @media (max-width: 900px) {
      .cusade-visualization { min-height: 260px; }
      .cusade-visualization__art { width: 32%; }
    }
    @media (max-width: 650px) {
      .cusade-visualization { gap: 12px; padding: 16px; min-height: 220px; }
      .cusade-visualization__art { width: 34%; }
      .cusade-visualization__play { width: 44px; height: 44px; font-size: 21px; }
    }
    .cusade-likes-shuffle { padding: 0 16px 16px; }
    .cusade-likes-shuffle__button {
      display: flex; width: 100%; align-items: center; justify-content: space-between;
      gap: 12px; padding: 10px 0;
      border: 0; border-bottom: 1px solid color-mix(in srgb, var(--font-primary-color, #fff) 15%, transparent);
      border-radius: 0; background: transparent;
      color: var(--font-primary-color, #fff);
      font: 600 12px system-ui, sans-serif; text-align: left; text-transform: uppercase; cursor: pointer;
    }
    .cusade-likes-shuffle__button:hover {
      color: var(--font-special-color, #ff5500);
    }
    .cusade-likes-shuffle__button:disabled { cursor: wait; opacity: .7; }
    .cusade-likes-shuffle__button svg { flex: none; width: 19px; height: 19px;
      color: var(--font-secondary-color, #999); fill: currentColor; }
    .cusade-likes-shuffle__button:hover svg { color: currentColor; }
    .cusade-likes-shuffle__status { margin: 7px 0 0; color: var(--font-error-color, #ff9165);
      font: 12px system-ui, sans-serif; }
    .cusade-likes-shuffle__status:empty { display: none; }
    .cusade-likes-transition { position: fixed; inset: 0; z-index: 2147483646;
      width: 100vw; height: 100vh; cursor: progress; }
    .cusade-likes-transition img { display: block; width: 100%; height: 100%; }
    .cusade-insights-banner { position: relative; box-sizing: border-box; display: flex; flex-direction: column;
      justify-content: space-between; gap: 12px; min-height: 142px; width: 100%; max-width: 100%;
      margin: 0 0 24px; padding: 18px; border-radius: 14px;
      background: #10384c; color: #fff; font: 14px system-ui, sans-serif;
      box-shadow: 0 12px 32px #0002; isolation: isolate; overflow: hidden; }
    .cusade-insights-banner__top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
    .cusade-insights-banner strong { display: block; font-size: 19px; line-height: 1.25; }
    .cusade-insights-banner p { margin: 7px 0 0; color: #d8e8eb; font-size: 12px; line-height: 1.4; }
    .cusade-insights-banner button { box-sizing: border-box; border: 0; cursor: pointer; }
    .cusade-insights-banner__open { align-self: flex-start; padding: 9px 15px; border-radius: 999px;
      background: #fff; color: #452044; font: 700 12px system-ui; }
    .cusade-insights-banner__open:hover { background: #ffe8f3; }
    .cusade-insights-banner__more { flex: none; width: 30px; height: 28px; padding: 0;
      border-radius: 7px; background: #ffffff2b; color: #fff; font: 700 20px system-ui; line-height: 20px; }
    .cusade-insights-banner__more:hover { background: #ffffff45; }
    .cusade-insights-banner__menu { position: absolute; top: 48px; right: 12px; z-index: 2;
      min-width: 180px; padding: 5px; border: 1px solid #ffffff35; border-radius: 10px;
      background: #2d1a32; box-shadow: 0 12px 28px #0008; }
    .cusade-insights-banner__menu[hidden] { display: none; }
    .cusade-insights-banner__menu button { display: block; width: 100%; padding: 9px 10px;
      border-radius: 6px; background: transparent; color: #fff; font: 13px system-ui; text-align: left; }
    .cusade-insights-banner__menu button:hover { background: #ffffff25; }
    .cusade-insights-banner__resize { display: none; }
    html.cusade-insights-editing .cusade-insights-banner { outline: 2px dashed #ffba90;
      outline-offset: 3px; cursor: grab; touch-action: none; }
    html.cusade-insights-dragging, html.cusade-insights-dragging * { user-select: none !important; }
    html.cusade-insights-dragging .cusade-insights-banner { cursor: grabbing; opacity: .45; }
    .cusade-insights-drag-ghost { position: fixed !important; z-index: 2147483646 !important;
      margin: 0 !important; pointer-events: none; opacity: .92; box-shadow: 0 25px 55px #0008; }
    html.cusade-insights-editing .cusade-insights-banner__resize { position: absolute; display: block;
      right: 1px; bottom: 1px; width: 27px; height: 27px; border-radius: 0 0 13px 0;
      background: #ffffff45; cursor: nwse-resize; touch-action: none; }
    html.cusade-insights-editing .cusade-insights-banner__resize::after { content: '◢'; color: #fff; }
    .cusade-insights-slot { display: block; list-style: none; }
    .cusade-insights-dropzone { box-sizing: border-box; display: block; width: 100%; height: 30px;
      margin: 7px 0; border: 2px dashed #b86d83; border-radius: 9px;
      background: #7b34521f; color: var(--font-secondary-color, #bbb);
      font: 600 11px system-ui; text-align: center; cursor: pointer; }
    .cusade-insights-dropzone:hover, .cusade-insights-dropzone.cusade-insights-dropzone--active {
      border-color: #ff955e; background: #ff955e30; color: var(--font-primary-color, #fff); }
    html.cusade-insights-editing .l-main:has([data-test-id="home"]) > :not(.cusade-insights-banner):not(.cusade-insights-dropzone),
    html.cusade-insights-editing .streamSidebar > .sidebarModule,
    html.cusade-insights-editing [data-test-id="home"] .lazyLoadingList__list > :not(.cusade-insights-slot):not(.cusade-insights-dropzone) {
      outline: 1px dashed #ff955e50; outline-offset: -2px; }
    .cusade-insights-editbar { position: fixed; right: 20px; bottom: 62px; z-index: 2147483645;
      display: flex; align-items: center; gap: 14px; padding: 10px 12px; border-radius: 12px;
      background: #2b1b32; color: #fff; box-shadow: 0 10px 30px #0008; font: 13px system-ui; }
    .cusade-insights-editbar button { padding: 8px 15px; border: 0; border-radius: 7px;
      background: var(--cusade-accent, #ff5500); color: #fff; font: 700 12px system-ui; cursor: pointer; }
    .l-fluid-fixed.cusade-insights-wide-sidebar > .l-main { margin-right: var(--cusade-insights-sidebar-width) !important; }
    .l-fluid-fixed.cusade-insights-wide-sidebar > .l-sidebar-right { left: auto !important;
      right: 0 !important; width: var(--cusade-insights-sidebar-width) !important; }
    .l-fluid-fixed.cusade-insights-wide-sidebar .streamSidebar { width: 100% !important; }
    /* One shared curve for every effect in the app, so all reactions start and
       settle together. Two choices matter more than the effects themselves:
       the duration, because 180ms finished before the eye had registered it and
       read as a flicker, and the easing, because a curve that leaves at full
       speed snaps at the start. This one leaves gently (.3 control point) and
       arrives flat, so a hover reads as a reaction rather than a blink.
       --cusade-grow is the same curve with more time on it, for the few buttons
       that change size rather than position: the eye follows the edges of a shape
       it is growing, so a size change needs a longer ramp than a movement. */
    html {
      --cusade-hover: 360ms cubic-bezier(.3,.62,.36,1);
      --cusade-grow: 420ms cubic-bezier(.3,.62,.36,1);
    }
    /* Bare links and inputs keep the cheap set: filter and shadow almost never
       change on them, and an animated property costs a repaint even when the
       value does not move. Buttons get the full treatment, because on a button
       the highlight is the whole point. */
    html.cusade-animations :is(button, .sc-button, [role="button"], a, input, textarea) {
      transition: color var(--cusade-hover), background-color var(--cusade-hover),
        border-color var(--cusade-hover), opacity var(--cusade-hover);
    }
    html.cusade-animations :is(button, .sc-button, [role="button"]):not(:disabled) {
      transition: color var(--cusade-hover), background-color var(--cusade-hover),
        border-color var(--cusade-hover), opacity var(--cusade-hover),
        box-shadow var(--cusade-hover), filter var(--cusade-hover);
    }
    html.cusade-animations :is(button, .sc-button, [role="button"]):not(:disabled):hover {
      filter: brightness(1.09) saturate(1.06);
    }
    html.cusade-animations :is(button, .sc-button, [role="button"]):not(:disabled):active {
      filter: brightness(.9) saturate(.96);
    }
    html.cusade-animations :is(input, textarea, .sc-button, button):focus-visible {
      outline-offset: 3px;
      transition: outline-offset var(--cusade-hover), box-shadow var(--cusade-hover);
    }
    /* The lift is a transform, so it stays on the compositor. The shadow is
       applied without a transition on purpose: measured on a 20 row feed, an
       animated shadow cost 2856ms of paint against 122ms for the same hover with
       the shadow snapped in, and the cost did not drop with the blur radius (a
       blurless inset box-shadow was just as expensive). Repainting the shadow
       invalidates the strip around the element, so a row drags its neighbours in
       on every frame. The lift still carries the motion. */
    html.cusade-animations :is(.playableTile, .sidebarModule, .cusade-insights-banner, .cusade-visualization) {
      transition: transform var(--cusade-hover),
        background-color 820ms cubic-bezier(.3,.62,.36,1);
    }
    html.cusade-animations :is(.playableTile, .cusade-insights-banner, .cusade-visualization):hover {
      transform: translateY(-4px);
      box-shadow: 0 16px 26px #00000038;
    }
    html.cusade-animations .sidebarModule:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px #00000026;
    }
    html.cusade-animations.cusade-insights-editing .cusade-insights-banner,
    html.cusade-animations .cusade-insights-drag-ghost {
      transition: none;
      transform: none !important;
    }
    html.cusade-animations :is(.playableTile__image, .playableTile__imageOverlay,
      .image.sc-artwork, .image.sc-artwork .image__full, .cusade-visualization__art) {
      transition: transform 380ms cubic-bezier(.3,.62,.36,1), opacity var(--cusade-hover);
    }
    html.cusade-animations .playableTile__artworkLink:hover .playableTile__image,
    html.cusade-animations .listenArtworkWrapper__artwork:hover .image.sc-artwork {
      transform: scale(1.04);
    }
    html.cusade-animations .image.image__rounded:hover {
      transform: scale(1.055);
    }
    html.cusade-animations .cusade-visualization:hover .cusade-visualization__art {
      transform: scale(1.025);
    }
    html.cusade-animations :is(.soundList__item, .searchItem, .commentItem,
      .header__navMenuItem) {
      transition: color var(--cusade-hover), opacity var(--cusade-hover);
    }
    html.cusade-animations :is(.soundList__item, .searchItem, .commentItem):hover {
      background-color: color-mix(in srgb, var(--font-primary-color, #fff) 5%, transparent);
    }
    html.cusade-animations :is(.dropdownMenu, [role="menu"], .cusade-insights-banner__menu):not([hidden]) {
      animation: cusade-menu-enter 280ms cubic-bezier(.3,.62,.36,1) both;
      transform-origin: top center;
    }
    /* Our own buttons get the full treatment: lift, accent glow and a brightness
       nudge, all on the shared curve, so the press settles instead of snapping.
       A button is small enough that the glow costs nothing measurable, which is
       not true of a full width row or a card. */
    html.cusade-animations :is(.cusade-visualization__play, .cusade-likes-shuffle__button,
      .cusade-insights-banner button, .cusade-insights-editbar button) {
      transition: transform var(--cusade-hover), background-color var(--cusade-hover),
        filter var(--cusade-hover);
    }
    html.cusade-animations :is(.cusade-visualization__play, .cusade-likes-shuffle__button,
      .cusade-insights-banner button, .cusade-insights-editbar button):hover:not(:disabled) {
      transform: translateY(-2px);
      filter: brightness(1.08);
      box-shadow: 0 10px 24px color-mix(in srgb, var(--cusade-accent, #ff5500) 26%, transparent);
    }
    html.cusade-animations :is(.cusade-visualization__play, .cusade-likes-shuffle__button,
      .cusade-insights-banner button, .cusade-insights-editbar button):active:not(:disabled) {
      transform: translateY(-1px) scale(.97);
      filter: brightness(.94);
    }
    /* Action pills grow on hover instead of only lifting. A scale on a pill reads as
       a reaction of its own, and these are the buttons a person aims at, so they
       all get what the insights pill proved out: a longer ramp than the shared
       hover curve, a soft ring in the button's own colour, a small lift on top of
       the scale, and a press that settles instead of snapping. Scale is written
       first in the transform because transform functions apply right to left, so
       the button grows around its own centre and then lifts. Bare icon buttons
       are deliberately left out: they already have their own scale, and growing a
       32px icon by the same ratio reads as wobbly rather than deliberate. */
    html.cusade-animations :is(.sc-button-follow, .sc-button:not(.sc-button-icon),
      .cusade-visualization__play, .cusade-insights-editbar button,
      .cusade-insights-banner__open) {
      transition: transform var(--cusade-grow), background-color var(--cusade-hover),
        box-shadow var(--cusade-hover), filter var(--cusade-hover);
    }
    html.cusade-animations :is(.sc-button-follow, .sc-button:not(.sc-button-icon),
      .cusade-visualization__play, .cusade-insights-editbar button,
      .cusade-insights-banner__open):hover:not(:disabled) {
      transform: scale(1.07) translateY(-1px);
      filter: brightness(1.04);
      box-shadow: 0 10px 24px #0000003d, 0 0 0 5px color-mix(in srgb, currentColor 14%, transparent);
    }
    html.cusade-animations :is(.sc-button-follow, .sc-button:not(.sc-button-icon),
      .cusade-visualization__play, .cusade-insights-editbar button,
      .cusade-insights-banner__open):active:not(:disabled) {
      transform: scale(1.02) translateY(0);
      filter: brightness(.98);
    }
    /* Applied to items the enter observer has seen reach the viewport, so a feed
       that renders hundreds of rows promotes only the visible ones. */
    html.cusade-animations.cusade-enter .cusade-enter-target {
      animation: cusade-content-enter 400ms cubic-bezier(.3,.62,.36,1) backwards;
    }
    html.cusade-animations :is(.soundList__item, .searchList__item, .trackList__item,
      .usersList__item, .soundBadgeList__item, .commentBadgeList__item,
      .userStreamItem, .searchItem, .trackItem, .userBadge, .soundBadge,
      .commentBadge, .profileTabs a, .userNetworkTabs a, .header__navMenuItem) {
      /* Rows fade the highlight in instead of switching it, which is what the
         180ms snap could not do. The shadow is not in this list for the same
         reason as on the cards: on a full width row it repaints the strip and
         costs an order of magnitude more than the fade itself. The tab links are
         in this list on purpose, so the underline they show on hover grows out of
         nothing. */
      transition: color var(--cusade-hover), opacity var(--cusade-hover),
        background-color var(--cusade-hover);
    }
    html.cusade-animations :is(.soundList__item, .searchList__item, .trackList__item,
      .usersList__item, .soundBadgeList__item, .commentBadgeList__item,
      .userStreamItem, .searchItem, .trackItem, .userBadge, .soundBadge,
      .commentBadge):hover {
      background-color: color-mix(in srgb, var(--font-primary-color, #fff) 6%, transparent);
      box-shadow: 0 4px 12px #00000021;
    }
    html.cusade-animations :is(.sound__coverArt, .trackItem__image, .soundBadge__artwork,
      .userBadge__avatar, .profileHeaderInfo__avatar, .listenArtworkWrapper__artwork,
      .commentPopover__avatar, .commentForm__avatar) .image {
      transition: transform var(--cusade-hover);
    }
    html.cusade-animations :is(.sound__coverArt, .trackItem__image, .soundBadge__artwork,
      .userBadge__avatar, .profileHeaderInfo__avatar, .listenArtworkWrapper__artwork,
      .commentPopover__avatar, .commentForm__avatar):hover .image {
      transform: scale(1.045);
    }
    html.cusade-animations :is(.profileHeaderInfo, .userNetworkInfo, .listenInfo,
      .listenEngagement, .sidebarModule, .commentsModule, .likesModule) {
      animation: cusade-content-enter 420ms cubic-bezier(.3,.62,.36,1) backwards;
    }
    html.cusade-animations :is(.profileHeaderBackground__visual, .listenArtworkWrapper__artwork) {
      transition: transform var(--cusade-hover), opacity var(--cusade-hover);
    }
    html.cusade-animations :is(.profileTabs a, .userNetworkTabs a, .header__navMenuItem):hover {
      box-shadow: inset 0 -2px currentColor;
    }
    html.cusade-animations :is(.sc-button-icon, .sc-button-like, .sc-button-follow,
      .sc-button-repost, .sc-button-share, .sc-button-more, .sc-button-copylink,
      .sc-button-play, .playControls__control, .volume__button,
      .header__moreButton, .headerSearch__submit, .userNetwork__likeActions button) {
      transition: transform 280ms cubic-bezier(.3,.62,.36,1), filter var(--cusade-hover),
        color var(--cusade-hover), background-color var(--cusade-hover),
        box-shadow var(--cusade-hover);
    }
    html.cusade-animations :is(.sc-button-icon, .sc-button-like, .sc-button-follow,
      .sc-button-repost, .sc-button-share, .sc-button-more, .sc-button-copylink,
      .sc-button-play, .playControls__control, .volume__button,
      .header__moreButton, .headerSearch__submit, .userNetwork__likeActions button):hover:not(:disabled) {
      transform: scale(1.08);
    }
    html.cusade-animations :is(.sc-button-icon, .sc-button-like, .sc-button-follow,
      .sc-button-repost, .sc-button-share, .sc-button-more, .sc-button-copylink,
      .sc-button-play, .playControls__control, .volume__button,
      .header__moreButton, .headerSearch__submit, .userNetwork__likeActions button):active:not(:disabled) {
      transform: scale(.93);
    }
    html.cusade-animations :is(.sc-button-like, .sc-button-follow, .sc-button-repost):is(
      .sc-button-selected, .sc-button-active, [aria-pressed="true"]) {
      animation: cusade-action-pop 380ms cubic-bezier(.3,.62,.36,1);
    }
    html.cusade-animations .volume__sliderProgress {
      transition: width 180ms linear, background-color var(--cusade-hover);
    }
    /* SoundCloud drives the player fill with an inline width, and animating that
       width re-ran layout for the bottom bar on every frame. The preload mirrors
       the same value as a scaleX, which is composited. cusade-player-progress is
       only set once that mirror works, so a broken mirror keeps SoundCloud's own
       width instead of showing an empty or full bar. */
    html.cusade-animations.cusade-player-progress .playbackTimeline__progressBar {
      width: 100% !important;
      transform: scaleX(var(--cusade-player-progress, 0));
      transform-origin: left center;
      transition: transform 180ms linear, background-color 180ms ease;
    }
    html.cusade-animations .volume__sliderHandle {
      transition: box-shadow var(--cusade-hover), filter var(--cusade-hover);
    }
    html.cusade-animations .volume__sliderWrapper:hover .volume__sliderHandle {
      box-shadow: 0 0 0 5px color-mix(in srgb, var(--font-primary-color, #fff) 16%, transparent);
    }
    html.cusade-animations :is(.commentPopover, .userDropbar, .playControlsPanel):not([hidden]) {
      animation: cusade-menu-enter 300ms cubic-bezier(.3,.62,.36,1) both;
    }
    /* Page and tab transitions use fixed compositor layers. */
    .cusade-route { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; }
    .cusade-route__veil { position: absolute; inset: 0; opacity: 0;
      background: radial-gradient(130% 100% at 50% 35%, #0b0d13b0, #05060ae8); }
    .cusade-route__wash { position: absolute; inset: 0; opacity: 0;
      transform: scale(.88); transform-origin: var(--cusade-route-x, 50%) var(--cusade-route-y, 28%);
      background: radial-gradient(circle at var(--cusade-route-x, 50%) var(--cusade-route-y, 28%),
        color-mix(in srgb, var(--cusade-accent, #ff5500) 30%, transparent), transparent 55%); }
    .cusade-route__bar { position: absolute; top: 0; left: 0; width: 100%; height: 2px;
      opacity: 0; transform: scaleX(0); transform-origin: left center;
      background: linear-gradient(90deg, transparent 2%, var(--cusade-accent, #ff5500) 18%,
        #ffffffd9 50%, var(--cusade-accent, #ff5500) 82%, transparent 98%); }
    html.cusade-animations .cusade-route__veil { transition: opacity 520ms cubic-bezier(.3,.62,.36,1); }
    html.cusade-animations .cusade-route__wash { transition: opacity 420ms cubic-bezier(.3,.62,.36,1),
      transform 600ms cubic-bezier(.3,.62,.36,1); }
    html.cusade-animations .cusade-route__bar { transition: transform 760ms cubic-bezier(.3,.62,.36,1),
      opacity 340ms ease; }
    html.cusade-animations .cusade-route--intro .cusade-route__veil { opacity: 1; }
    html.cusade-animations .cusade-route--veil .cusade-route__veil { opacity: .42; }
    html.cusade-animations .cusade-route--veil .cusade-route__wash { opacity: 1; transform: scale(1.08); }
    html.cusade-animations .cusade-route--sweep .cusade-route__bar { opacity: 1; transform: scaleX(1); }
    @keyframes cusade-content-enter {
      from { opacity: 0; transform: translateY(9px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes cusade-action-pop {
      45% { transform: scale(1.14); }
    }
    @keyframes cusade-menu-enter {
      from { opacity: 0; transform: translateY(-7px) scale(.985); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    /* ------------------------------------------------------------------
       Coverage for the interface that arrived with the current SoundCloud
       design: settings, Artist Studio, upload, subscriptions, notifications,
       messages, library and profile tabs, the dropzone, and the footer.

       No new effect is introduced here. Same curve, same --cusade-hover and
       --cusade-grow, same html.cusade-animations gate (which means "cusade
       motion is active", see motionActive()), and the same cusade-content-enter
       keyframes the feed rows already use. Only the selector lists are new.

       The :not() guard names everything 0.4.2 already animates, so a rule
       below can never take over a hover that already works. What is left moves
       transform and opacity. A background tint still appears on hover, but on
       list rows it is applied without a transition for the same measured
       reason as the card shadows: on a full width row an animated
       background-color repaints the whole strip on every frame.
       ------------------------------------------------------------------ */
    html.cusade-animations.cusade-ui :where(button, a, label, input, select, textarea,
      [role="button"], [role="tab"], [role="switch"], [role="checkbox"], option,
      .sc-form__input, .sc-text-input):not(${NEW_UI_GUARD}) {
      transition: color var(--cusade-hover), background-color var(--cusade-hover),
        border-color var(--cusade-hover), opacity var(--cusade-hover),
        transform var(--cusade-hover), box-shadow var(--cusade-hover);
    }
    /* A plain button is small enough to grow. Same ratio as the action pills,
       a little gentler, and the press settles instead of snapping. */
    html.cusade-animations.cusade-ui :where(button:not(.sc-button), [role="button"],
      [role="tab"]):not(${NEW_UI_GUARD}):hover:not(:disabled) {
      transform: scale(1.05) translateY(-1px);
    }
    html.cusade-animations.cusade-ui :where(button:not(.sc-button), [role="button"],
      [role="tab"]):not(${NEW_UI_GUARD}):active:not(:disabled) {
      transform: scale(.97) translateY(0);
    }
    /* Tabs change state quietly instead of jumping. */
    html.cusade-animations.cusade-ui :where([role="tab"], [class*="tab"]:not([class*="table"]),
      [class*="Tab"]:not([class*="Table"])):not(${NEW_UI_GUARD}):hover {
      transform: translateY(-1px);
      opacity: .92;
    }
    /* Toggles, checkboxes and radios: a small state reaction, no layout work. */
    html.cusade-animations.cusade-ui :where(input[type="checkbox"], input[type="radio"],
      [role="switch"], [role="checkbox"], [class*="toggle"], [class*="Toggle"]):not(${NEW_UI_GUARD}) {
      transition: transform 240ms cubic-bezier(.3,.62,.36,1),
        background-color var(--cusade-hover), border-color var(--cusade-hover),
        color var(--cusade-hover), opacity var(--cusade-hover);
    }
    html.cusade-animations.cusade-ui :where(input[type="checkbox"], input[type="radio"],
      [role="switch"], [role="checkbox"], [class*="toggle"], [class*="Toggle"]):not(${NEW_UI_GUARD}):hover {
      transform: translateY(-1px);
    }
    html.cusade-animations.cusade-ui :is(input[type="checkbox"], input[type="radio"]):not(${NEW_UI_GUARD}):checked {
      transform: scale(1.07);
    }
    html.cusade-animations.cusade-ui :is(input[type="checkbox"], input[type="radio"]):not(${NEW_UI_GUARD}):active {
      transform: scale(.93);
    }
    /* Text fields and selects settle into focus instead of snapping to it. */
    html.cusade-animations.cusade-ui :where(input:not([type="checkbox"]):not([type="radio"]),
      textarea, select):not(${NEW_UI_GUARD}):is(:hover, :focus) {
      transform: translateY(-1px);
    }
    html.cusade-animations.cusade-ui :where(input:not([type="checkbox"]):not([type="radio"]),
      textarea, select):not(${NEW_UI_GUARD}):focus {
      border-color: color-mix(in srgb, var(--special-color, #ff5500) 55%, transparent);
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--special-color, #ff5500) 14%, transparent);
    }
    /* List rows: the lift is a transform everywhere; the tint is skipped on the
       home screen (cusade-page-discover), where wide rows flash white over the
       artwork grid, and kept on every other page. */
    html.cusade-animations.cusade-ui :where([class*="Item"], [class*="item"],
      [class*="Row"], [class*="row"]):not(${NEW_UI_GUARD}) {
      transition: transform var(--cusade-hover), opacity var(--cusade-hover);
    }
    html.cusade-animations.cusade-ui :where([class*="Item"], [class*="item"],
      [class*="Row"], [class*="row"]):not(${NEW_UI_GUARD}):hover {
      transform: translateY(-2px);
    }
    html.cusade-animations.cusade-ui:not(.cusade-page-discover) :where([class*="Item"], [class*="item"],
      [class*="Row"], [class*="row"]):not(${NEW_UI_GUARD}):hover {
      background-color: color-mix(in srgb, var(--font-primary-color, #fff) 5%, transparent);
    }
    /* Cards, tiles and stats are small enough for the tint to fade in. */
    html.cusade-animations.cusade-ui :where([class*="Card"], [class*="card"],
      [class*="Tile"], [class*="tile"]):not(${NEW_UI_GUARD}) {
      transition: transform var(--cusade-hover), opacity var(--cusade-hover),
        background-color var(--cusade-hover), border-color var(--cusade-hover);
    }
    html.cusade-animations.cusade-ui :where([class*="Card"], [class*="card"],
      [class*="Tile"], [class*="tile"]):not(${NEW_UI_GUARD}):hover {
      transform: translateY(-3px) scale(1.012);
    }
    /* Upload dropzone. "ropzone" covers dropzone and Dropzone in one selector;
       the drag state is whatever class the page puts on it while dragging. */
    html.cusade-animations.cusade-ui :where([class*="ropzone"], [class*="dragZone"]):not(${NEW_UI_GUARD}) {
      transition: transform var(--cusade-hover), opacity var(--cusade-hover),
        border-color var(--cusade-hover), background-color var(--cusade-hover);
    }
    html.cusade-animations.cusade-ui :where([class*="ropzone"], [class*="dragZone"]):not(${NEW_UI_GUARD}):hover {
      transform: translateY(-2px) scale(1.004);
    }
    html.cusade-animations.cusade-ui :where([class*="ropzone"], [class*="dragZone"]):not(${NEW_UI_GUARD}):is(
      .is-dragging, .dragging, .dragover, .is-active, .active, [data-dragging="true"]) {
      transform: translateY(-3px) scale(1.012);
    }
    /* Footer links were the last untouched part of the page. */
    html.cusade-animations .footer :is(a, button):not([class*="cusade-"]) {
      transition: color var(--cusade-hover), opacity var(--cusade-hover),
        transform var(--cusade-hover);
    }
    html.cusade-animations .footer :is(a, button):not([class*="cusade-"]):hover {
      transform: translateY(-1px);
    }
    /* Dialogs, listboxes and tooltips the old rule list did not name get the
       same reveal the player menus already use. The classes that list already
       covers are excluded, so none of their timings can change. */
    html.cusade-animations :is([role="dialog"], [role="listbox"], [role="tooltip"],
      .sc-dropdown, .popover, .popoverContainer, .tooltip, .sc-tooltip, .modal):not([hidden]):not(
      .dropdownMenu, [role="menu"], .commentPopover, .userDropbar, .playControlsPanel) {
      animation: cusade-menu-enter 300ms cubic-bezier(.3,.62,.36,1) both;
    }
  `;
  document.head.appendChild(style);
  // SoundCloud's reduced-motion stylesheet can use !important to zero out
  // durations. Keep cusade's own motion rules above that reset when the user
  // explicitly enables motion. Their html.cusade-animations gate still decides
  // whether they match, including the "respect system motion" setting.
  for (const rule of style.sheet.cssRules) {
    if (!rule.selectorText?.includes('html.cusade-animations')) continue;
    for (const property of ['animation', 'transition']) {
      const value = rule.style.getPropertyValue(property);
      if (value) rule.style.setProperty(property, value, 'important');
    }
  }
}

module.exports = { GUARDED_UI, NEW_UI_GUARD, inject };
