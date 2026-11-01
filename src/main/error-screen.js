'use strict';

// The local network error screen. When SoundCloud fails to load, the main window
// shows this self-contained local page built by the main process:
//
//   - a plain error classification in the user's language;
//   - a Retry link that simply navigates to SoundCloud again (no IPC involved);
//   - the minimal network controls that still work while the site itself cannot
//     be reached — mode, proxy type, address, port, plus the connection check,
//     apply, restore and report buttons.
//
// The page travels as a data: URL containing a fixed marker attribute. Remote
// pages cannot create top-level data: navigations in Chromium, and every other
// page that enters this window comes from a SoundCloud URL, so the IPC handlers
// in src/main/ipc.js accept network channels on the main SoundCloud page or on
// this screen — and nothing else.
//
// Language follows the saved cusade language setting ('ru' or the site's own).

const { HOME_URL } = require('../../shared/constants.js');
const { classifyNetworkError, NETWORK_MODES, PROXY_TYPES } = require('../../shared/network-profile.js');
const { FAILURE_MESSAGES, CATEGORY_MESSAGES } = require('../../shared/network-profile.js');

const SCREEN_MARKER = 'data-cusade-network-screen';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// INTEGER error codes only ever arrive from Chromium's did-fail-load; the rest
// of the content is generated inside the app and escaped anyway.
function safeErrorCode(code) {
  const parsed = Number(code);
  return Number.isInteger(parsed) && parsed < 0 ? String(parsed) : '-1';
}

const SCREEN_CSS = `
body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
  background:#121216; color:#fff; font:14px/1.5 system-ui,sans-serif; }
main { max-width:540px; padding:32px 28px; box-sizing:border-box; width:100%; }
h1 { font-size:24px; margin:0 0 10px; letter-spacing:-.5px; }
.hint { color:#bbb; margin:0 0 6px; }
.detail { color:#888; font-size:12px; margin:0 0 18px; }
.retry { display:inline-block; margin:0 0 26px; padding:12px 18px; border-radius:8px;
  background:#f50; color:#fff; text-decoration:none; font-weight:600; cursor:pointer; }
.retry:hover { filter:brightness(1.1); }
section { border:1px solid #ffffff1c; border-radius:10px; padding:18px; }
h2 { margin:0 0 14px; font-size:15px; }
label { display:block; margin:0 0 10px; color:#ddd; font-size:13px; }
select, input { display:block; width:100%; margin-top:5px; padding:9px 11px; box-sizing:border-box;
  border:0; border-radius:5px; background:#202123; color:#fff; font:13px system-ui; color-scheme:dark; }
.controls { display:flex; flex-wrap:wrap; gap:8px; margin-top:4px; }
button { border:0; border-radius:7px; padding:10px 13px; background:#2b2c30; color:#fff;
  font:600 12px system-ui; cursor:pointer; }
button#net-apply { background:#f50; }
button:disabled { opacity:.45; cursor:default; }
.status { margin:12px 0 0; font-size:12px; color:#ffac8a; white-space:pre-line; min-height:18px; }
.status.ok { color:#8fd48f; }
`;

function modeOptions(language) {
  const labels = {
    system: language === 'ru' ? 'System — как в Windows' : 'System — follow Windows',
    direct: language === 'ru' ? 'Direct — прямое соединение' : 'Direct — no proxy',
    custom: language === 'ru' ? 'Custom — свой прокси' : 'Custom — your proxy'
  };
  return NETWORK_MODES.map(mode => `<option value="${mode}">${escapeHtml(labels[mode])}</option>`).join('');
}

function typeOptions() {
  return PROXY_TYPES
    .map(type => `<option value="${type}">${escapeHtml(type.toUpperCase())}</option>`)
    .join('');
}

// Builds the full load-error data URL for the main window.
function buildLoadErrorUrl(code, description, language = 'en') {
  const ru = language === 'ru';
  const failureType = classifyNetworkError(Number(code), String(description || ''));
  const failureMessage = FAILURE_MESSAGES[failureType] || FAILURE_MESSAGES.unknown;
  const hint = ru ? failureMessage.ru : failureMessage.en;
  const t = ru
    ? {
        title: 'SoundCloud не загрузился',
        code: 'Код ошибки',
        retry: 'Повторить попытку',
        sectionTitle: 'Сеть и подключение',
        mode: 'Режим подключения',
        type: 'Тип прокси',
        host: 'Адрес',
        port: 'Порт',
        hintMode: CATEGORY_MESSAGES.system.ru,
        test: 'Проверить соединение',
        apply: 'Применить',
        reset: 'Восстановить настройки',
        report: 'Сохранить отчёт',
        status: 'Доступ к сетевым настройкам работает, даже когда SoundCloud недоступен.'
      }
    : {
        title: 'SoundCloud did not load',
        code: 'Error code',
        retry: 'Try again',
        sectionTitle: 'Network and connection',
        mode: 'Connection mode',
        type: 'Proxy type',
        host: 'Address',
        port: 'Port',
        test: 'Check connection',
        apply: 'Apply',
        reset: 'Restore settings',
        report: 'Save report',
        hintMode: CATEGORY_MESSAGES.system.en,
        status: 'Network settings stay available even while SoundCloud is unreachable.'
      };
  const html = `<!doctype html>
<html lang="${ru ? 'ru' : 'en'}" ${SCREEN_MARKER}="load-failure">
<head><meta charset="utf-8"><title>SoundCloud</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${SCREEN_CSS}</style></head>
<body><main>
<h1>${escapeHtml(t.title)}</h1>
<p class="hint">${escapeHtml(hint)}</p>
<p class="detail">${escapeHtml(t.code)}: ${safeErrorCode(code)} · nw:${escapeHtml(String(description || '').slice(0, 80))}</p>
<a id="net-retry" class="retry" href="${HOME_URL}">${escapeHtml(t.retry)}</a>
<section>
  <h2>${escapeHtml(t.sectionTitle)}</h2>
  <span class="hint">${escapeHtml(t.hintMode)} ${escapeHtml(t.status)}</span>
  <label>${escapeHtml(t.mode)}<select id="net-mode">${modeOptions(language)}</select></label>
  <label>${escapeHtml(t.type)}<select id="net-type">${typeOptions()}</select></label>
  <label>${escapeHtml(t.host)}<input id="net-host" type="text" autocomplete="off" spellcheck="false" placeholder="proxy.example.com"></label>
  <label>${escapeHtml(t.port)}<input id="net-port" type="text" inputmode="numeric" placeholder="8080"></label>
  <p class="controls">
    <button type="button" id="net-test">${escapeHtml(t.test)}</button>
    <button type="button" id="net-apply">${escapeHtml(t.apply)}</button>
    <button type="button" id="net-reset">${escapeHtml(t.reset)}</button>
    <button type="button" id="net-report">${escapeHtml(t.report)}</button>
  </p>
  <p id="net-status" class="status" role="status" aria-live="polite"></p>
</section>
</main></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function isNetworkScreenUrl(url) {
  if (typeof url !== 'string') return false;
  if (!url.startsWith('data:text/html')) return false;
  // The screen always travels through encodeURIComponent, so the marker
  // attribute reaches the URL in its encoded form.
  return url.includes(`${encodeURIComponent(`${SCREEN_MARKER}="load-failure"`)}`);
}

module.exports = { buildLoadErrorUrl, isNetworkScreenUrl, SCREEN_MARKER };
