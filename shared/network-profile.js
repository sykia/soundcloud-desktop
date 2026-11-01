'use strict';

// Pure knowledge about the network connection settings: the three standard
// modes (System / Direct / Custom), the supported proxy types, the validation
// rules, the Electron proxy-config builder and the classification of Chromium
// network errors into user-understandable categories. No require() dependencies
// and no Electron APIs, so the main process, the preload bundle and node --test
// can all rely on exactly one set of rules.

const NETWORK_MODES = Object.freeze(['system', 'direct', 'custom']);
const PROXY_TYPES = Object.freeze(['http', 'https', 'socks4', 'socks5']);
const PROXY_PORT_MIN = 1;
const PROXY_PORT_MAX = 65535;
// Local services (including the Discord RPC bridge over its local socket and
// anything on loopback) must never be pushed through the user's proxy.
const LOCAL_PROXY_BYPASS = '<local>';

// Error codes Chromium reaches before a TCP connection even happens: project's
// DoH names (dns.js) plus the DNS resolver family from net_error_list.h.
const DNS_ERROR_CODES = new Set([-105, -137, -139, -140, -141, -142, -800, -801, -802, -803, -808]);
const TIMEOUT_ERROR_CODES = new Set([-7, -118, -140]);
// -200..-212 are the ERR_CERT_* family; -215 is ERR_SSL_PROTOCOL_ERROR and
// -121/-107 are proxy-tunnel/connection failures handled by name below.
const TLS_ERROR_RANGE = Object.freeze({ min: -215, max: -200 });
// TCP-level failures: nothing was resolved or the remote side/set-up refused
// the transport itself.
const TCP_ERROR_CODES = new Set([
  -100, -101, -102, -103, -104, -106, -108, -109, -110, -111, -112, -113, -114, -115, -116
]);
const PROXY_ERROR_CODES = new Set([-121, -131, -133, -160]);

const isNetworkMode = value => NETWORK_MODES.includes(value);
const isProxyType = value => PROXY_TYPES.includes(value);
const isProxyPort = value => Number.isInteger(value) && value >= PROXY_PORT_MIN && value <= PROXY_PORT_MAX;

// Accepts bare hostnames (nginx-proxy.local), IPv4 (10.0.0.2) and bracketed
// IPv6 ([fd00::1]). Rejects URLs with a scheme, credentials, a port, a path, or
// whitespace — those are configuration mistakes, not hosts, and the panel shows
// a clear message instead of silently mangling them.
const HOSTNAME_PATTERN = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.?$/;
const IPV4_PATTERN = /^(\d{1,3})(?:\.(\d{1,3})){3}$/;
const IPV6_PATTERN = /^\[[0-9a-fA-F:]{2,39}\]$/;

function isProxyHost(value) {
  if (typeof value !== 'string' || value.length < 2 || value.length > 253) return false;
  if (/(?::|@|\/|\s|%)/.test(value)) {
    // Only one exception: a fully bracketed IPv6 literal.
    return IPV6_PATTERN.test(value);
  }
  if (IPV6_PATTERN.test(value)) return true;
  if (IPV4_PATTERN.test(value)) {
    return value.split('.').every(part => Number(part) <= 255);
  }
  return HOSTNAME_PATTERN.test(value);
}

// A Custom configuration is complete when every piece it needs is present.
function isCustomProxyComplete({ proxyType, proxyHost, proxyPort } = {}) {
  return isProxyType(proxyType) && isProxyHost(proxyHost) && isProxyPort(proxyPort);
}

// The only place where a mode + proxy profile becomes an Electron proxy config.
// Returns null for an incomplete Custom profile so callers can fall back to a
// safe, previously known configuration instead of guessing.
function buildProxyConfig({ networkMode, proxyType, proxyHost, proxyPort } = {}) {
  if (networkMode === 'system') return { mode: 'system' };
  if (networkMode === 'direct') return { mode: 'direct' };
  if (networkMode === 'custom') {
    if (!isCustomProxyComplete({ proxyType, proxyHost, proxyPort })) return null;
    return {
      mode: 'fixed_servers',
      proxyRules: `${proxyType}://${proxyHost}:${proxyPort}`,
      proxyBypassList: LOCAL_PROXY_BYPASS
    };
  }
  return null;
}

// SoundCloud traffic families. Only host names are used downstream — never the
// full URL — so no query strings, tokens or session identifiers can leak into
// diagnostics, counters or reports.
function classifyHostCategory(value) {
  let host = '';
  try { host = new URL(value).hostname || value; } catch { return 'other'; }
  if (!host) return 'other';
  const lower = host.toLowerCase();
  if (lower === 'sndcdn.com' || lower.endsWith('.sndcdn.com')) return 'media';
  if (lower === 'soundcloud.com' || lower.endsWith('.soundcloud.com')) {
    return lower.startsWith('api') ? 'api' : 'html';
  }
  if (lower.endsWith('scdn.co')) return 'media';
  return 'other';
}

// Chromium error code + human name → one of the diagnostic categories. The
// textual name decides when the code alone is ambiguous (proxied DNS failures
// surface as tunnel errors, TLS probes against plain HTTP servers surface as
// SSL protocol errors).
function classifyNetworkError(code, description = '') {
  const text = String(description || '').toUpperCase();
  const has = words => words.some(word => text.includes(word));
  const inRange = range => code >= range.min && code <= range.max;
  if (has(['TUNNEL', 'PROXY']) || PROXY_ERROR_CODES.has(code)) return 'proxy';
  if (has(['DNS', 'NAME_NOT_RESOLVED', 'GETADDRINFO']) || DNS_ERROR_CODES.has(code)) return 'dns';
  if (has(['CERT', 'SSL', 'TLS']) || inRange(TLS_ERROR_RANGE)) return 'tls';
  if (has(['TIMED_OUT', 'TIMEOUT']) || TIMEOUT_ERROR_CODES.has(code)) return 'timeout';
  if (TCP_ERROR_CODES.has(code) || has(['CONNECTION', 'REFUSED', 'RESET', 'ABORTED', 'UNREACHABLE', 'DISCONNECT'])) {
    return 'tcp';
  }
  return 'unknown';
}

// HTTP answers are not connection failures: a 401/403 means the TCP/TLS path
// works and SoundCloud itself answered. Nothing here may be presented to the
// user as proof of an ISP-level block.
function classifyHttpStatus(status) {
  if (status >= 200 && status < 400) return 'ok';
  if (status === 401 || status === 403 || status === 404) return 'restricted';
  if (status >= 400 && status < 500) return 'client';
  return 'server';
}

const CATEGORY_MESSAGES = Object.freeze({
  system: {
    ru: 'Приложение следует параметрам сети Windows (системный прокси и DNS).',
    en: 'The app follows the Windows network settings (system proxy and DNS).'
  },
  direct: {
    ru: 'Соединение идёт напрямую, как у любого другого приложения.',
    en: 'The connection goes directly, like any other application.'
  },
  custom: {
    ru: 'Трафик идёт через указанный вами HTTP/SOCKS-прокси. Локальные адреса мимо него.',
    en: 'Traffic goes through the HTTP/SOCKS proxy you specified. Local addresses bypass it.'
  },
  invalid: {
    ru: 'Сохранённая конфигурация прокси неполна, поэтому используется System. Заполните адрес и порт и примените снова.',
    en: 'The saved proxy configuration is incomplete, so System is used. Fill in the host and port and apply again.'
  }
});

const FAILURE_MESSAGES = Object.freeze({
  dns: {
    ru: 'Не удалось определить адрес SoundCloud по его имени (ошибка DNS). Если в сети блокируются DNS-запросы, поможет сменить DNS-сервер в приложении или указать прокси.',
    en: 'The SoundCloud address could not be resolved from its name (DNS error). If the network blocks DNS queries, try another DNS server in this app or configure a proxy.'
  },
  tcp: {
    ru: 'Соединение с сервером SoundCloud не установлено. Доступ к узлу может быть ограничен в этой сети — проверить можно только на исправной сети или через указанный вами прокси.',
    en: 'The connection to the SoundCloud server could not be established. Reachability may be restricted in this network — verify on a working network or through a proxy you provide.'
  },
  tls: {
    ru: 'Не удалось установить защищённое соединение (TLS) с SoundCloud. В этой сети возможны ограничение TLS-ключей или проверка сертификатов.',
    en: 'The encrypted (TLS) connection to SoundCloud could not be established. TLS pinning interference or a certificate restriction may apply in this network.'
  },
  timeout: {
    ru: 'Превышено время ожидания ответа от SoundCloud.',
    en: 'The response from SoundCloud took too long.'
  },
  proxy: {
    ru: 'Соединение с указанным прокси не удалось. Проверьте адрес, порт и тип прокси.',
    en: 'The connection to the specified proxy failed. Check the address, port and proxy type.'
  },
  unknown: {
    ru: 'Проверьте подключение к интернету и попробуйте ещё раз.',
    en: 'Check your internet connection and try again.'
  }
});

module.exports = {
  NETWORK_MODES,
  PROXY_TYPES,
  PROXY_PORT_MIN,
  PROXY_PORT_MAX,
  LOCAL_PROXY_BYPASS,
  isNetworkMode,
  isProxyType,
  isProxyHost,
  isProxyPort,
  isCustomProxyComplete,
  buildProxyConfig,
  classifyHostCategory,
  classifyNetworkError,
  classifyHttpStatus,
  CATEGORY_MESSAGES,
  FAILURE_MESSAGES
};
