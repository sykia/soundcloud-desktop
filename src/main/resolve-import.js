'use strict';

// Read only publicly shared music lists. The SoundCloud renderer never gets a
// cross-origin network primitive or credentials for another music service.
const { net } = require('electron');

const MAX_ITEMS = 2000;
const MAX_HTML_BYTES = 6_000_000;
const ALLOWED_HOSTS = new Set([
  'music.yandex.ru', 'music.apple.com', 'api.music.yandex.net', 'open.spotify.com', 'www.youtube.com'
]);

function sourceUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Вставьте ссылку на плейлист.');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Некорректная ссылка.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !['music.yandex.ru', 'music.apple.com', 'open.spotify.com',
        'music.youtube.com', 'www.youtube.com'].includes(url.hostname)) {
    throw new Error('Сейчас поддерживаются публичные ссылки Яндекс Музыки, Apple Music, Spotify и YouTube Music.');
  }
  if (url.hostname === 'music.yandex.ru' && !/^\/playlists\/(?:lk\.)?[\da-f-]{36}\/?$/i.test(url.pathname)) {
    throw new Error('Нужна ссылка на плейлист Яндекс Музыки.');
  }
  if (url.hostname === 'music.apple.com' && !/\/playlist\/[^/]+\/pl\.[\da-f]+\/?$/i.test(url.pathname)) {
    throw new Error('Нужна ссылка на публичный плейлист Apple Music.');
  }
  if (url.hostname === 'open.spotify.com' && !/^\/playlist\/[a-zA-Z0-9]{22}\/?$/.test(url.pathname)) {
    throw new Error('Нужна ссылка на публичный плейлист Spotify.');
  }
  if (url.hostname.endsWith('youtube.com')) {
    const id = url.searchParams.get('list');
    if (url.pathname !== '/playlist' || !id || !/^[a-zA-Z0-9_-]{10,100}$/.test(id)) {
      throw new Error('Нужна ссылка на публичный плейлист YouTube Music.');
    }
    return new URL(`https://www.youtube.com/playlist?list=${id}&ucbcb=1`);
  }
  url.search = '';
  url.hash = '';
  return url;
}

async function fetchText(url, maxBytes = MAX_HTML_BYTES) {
  let current = new URL(url);
  for (let redirect = 0; redirect < 4; redirect++) {
    if (current.protocol !== 'https:' || current.username || current.password || current.port ||
        !ALLOWED_HOSTS.has(current.hostname)) throw new Error('Недопустимый адрес перенаправления.');
    const response = await net.fetch(current.href, { redirect: 'manual', signal: AbortSignal.timeout(25000) });
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get('location');
      if (!next) throw new Error('Пустое перенаправление источника.');
      current = new URL(next, current);
      continue;
    }
    if (!response.ok) throw new Error(`Источник ответил кодом ${response.status}. Проверьте доступность ссылки.`);
    const length = Number(response.headers.get('content-length') || 0);
    if (length > maxBytes) throw new Error('Страница слишком большая для импорта.');
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error('Ответ слишком большой для импорта.'); }
      chunks.push(value);
    }
    return Buffer.concat(chunks, size).toString('utf8');
  }
  throw new Error('Слишком много перенаправлений.');
}

function jsonObjectAfter(text, key) {
  const marker = `"${key}":`;
  const start = text.indexOf(marker);
  if (start < 0) return null;
  const open = text.indexOf('{', start + marker.length);
  if (open < 0) return null;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let i = open; i < text.length; i++) {
    const char = text[i];
    if (escaped) { escaped = false; continue; }
    if (quoted && char === '\\') { escaped = true; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (quoted) continue;
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) return JSON.parse(text.slice(open, i + 1));
  }
  return null;
}

function parseYandexPage(html, expectedId) {
  const parts = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)/g)]
    .map(match => JSON.parse(match[1]));
  const playlist = jsonObjectAfter(parts.join(''), 'preloadedPlaylistByUuid');
  if (!playlist || playlist.playlistUuid !== expectedId || !playlist.available ||
      playlist.visibility !== 'public' || !Array.isArray(playlist.tracks)) {
    throw new Error('Плейлист недоступен по этой ссылке. Откройте к нему публичный доступ.');
  }
  if (!Number.isInteger(playlist.trackCount) || playlist.trackCount > MAX_ITEMS ||
      playlist.tracks.length !== playlist.trackCount) {
    throw new Error('Не удалось получить полный список треков плейлиста.');
  }
  const ids = playlist.tracks.map(track => String(track.id));
  if (ids.some(id => !/^\d+$/.test(id))) throw new Error('В плейлисте есть треки без идентификатора.');
  return { name: playlist.title || 'Плейлист Яндекс Музыки',
    liked: expectedId.startsWith('lk.'), ids };
}

function parseApplePage(html, id) {
  const match = html.match(/<script[^>]*id=["']serialized-server-data["'][^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Apple Music не отдал список треков.');
  const data = JSON.parse(match[1]);
  let list;
  function visit(value) {
    if (!value || typeof value !== 'object' || list) return;
    if (typeof value.id === 'string' && value.id === `track-list - ${id}` && Array.isArray(value.items)) {
      list = value; return;
    }
    for (const child of Object.values(value)) visit(child);
  }
  visit(data);
  if (!list || !list.items.length || list.items.length > MAX_ITEMS) {
    throw new Error('Не удалось прочитать плейлист Apple Music.');
  }
  const schemaMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/);
  const schema = schemaMatch ? JSON.parse(schemaMatch[1]) : null;
  if (schema?.numTracks && Number(schema.numTracks) !== list.items.length) {
    throw new Error('Apple Music показал только часть плейлиста. Полный перенос сейчас недоступен.');
  }
  const name = schema?.name || 'Плейлист Apple Music';
  const items = list.items.map(item => ({
    title: String(item.title || '').trim(),
    artist: (item.subtitleLinks || []).map(link => link.title).filter(Boolean).join(', '),
    playlist: name,
    liked: false
  })).filter(item => item.title);
  if (items.length !== list.items.length) throw new Error('В плейлисте есть треки без названия.');
  return { source: 'apple', name, items };
}

function parseSpotifyPage(html, embedHtml, id) {
  const initialMatch = html.match(/<script[^>]*id=["']initialState["'][^>]*>([\s\S]*?)<\/script>/);
  const embedMatch = embedHtml.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/);
  if (!initialMatch || !embedMatch) throw new Error('Spotify не отдал полный список треков.');
  const initial = JSON.parse(Buffer.from(initialMatch[1], 'base64').toString('utf8'));
  const playlist = initial.entities?.items?.[`spotify:playlist:${id}`];
  const count = playlist?.content?.totalCount;
  if (!Number.isInteger(count)) throw new Error('Spotify не сообщил число треков.');
  const entity = JSON.parse(embedMatch[1]).props?.pageProps?.state?.data?.entity;
  if (entity?.id !== id || !Array.isArray(entity.trackList) ||
      entity.trackList.length !== count || count > MAX_ITEMS) {
    throw new Error('Spotify показал только часть плейлиста. Полный перенос сейчас недоступен.');
  }
  const name = entity.title || playlist.name || 'Плейлист Spotify';
  const items = entity.trackList.map(track => ({
    title: String(track.title || '').trim(),
    artist: String(track.subtitle || '').replace(/\u00a0/g, ' ').trim(),
    playlist: name, liked: false
  })).filter(item => item.title);
  if (items.length !== count) throw new Error('В плейлисте есть треки без названия.');
  return { source: 'spotify', name, items };
}

function parseYouTubePage(html) {
  const match = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
  if (!match) throw new Error('YouTube Music не отдал список треков.');
  const data = JSON.parse(match[1]);
  const name = data.metadata?.playlistMetadataRenderer?.title;
  const countText = data.sidebar?.playlistSidebarRenderer?.items?.[0]
    ?.playlistSidebarPrimaryInfoRenderer?.stats?.[0]?.runs?.[0]?.text;
  const count = Number(String(countText || '').replace(/\D/g, ''));
  const cards = data.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
    ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents
    ?.map(item => item.lockupViewModel).filter(Boolean);
  if (!name || !Number.isInteger(count) || !count || !Array.isArray(cards)) {
    throw new Error('Плейлист YouTube Music недоступен по этой ссылке.');
  }
  if (count !== cards.length || count > MAX_ITEMS) {
    throw new Error('YouTube Music показал только часть плейлиста. Полный перенос сейчас недоступен.');
  }
  const items = cards.map(card => {
    const metadata = card.metadata?.lockupMetadataViewModel;
    return { title: String(metadata?.title?.content || '').trim(),
      artist: String(metadata?.metadata?.contentMetadataViewModel?.metadataRows?.[0]
        ?.metadataParts?.[0]?.text?.content || '').replace(/ - Topic$/, '').trim(),
      playlist: name, liked: false };
  });
  if (items.some(item => !item.title)) throw new Error('В плейлисте есть треки без названия.');
  return { source: 'youtube', name, items };
}

async function resolveYandex(url) {
  const id = decodeURIComponent(url.pathname.split('/')[2]);
  const page = parseYandexPage(await fetchText(url.href), id);
  if (!page.ids.length) throw new Error('Плейлист пуст.');
  const details = new Map();
  for (let i = 0; i < page.ids.length; i += 75) {
    const ids = page.ids.slice(i, i + 75);
    const endpoint = `https://api.music.yandex.net/tracks?track-ids=${ids.join('%2C')}`;
    const response = JSON.parse(await fetchText(endpoint, 2_000_000));
    if (!Array.isArray(response.result)) throw new Error('Яндекс Музыка не отдала данные треков.');
    for (const track of response.result) details.set(String(track.id), track);
  }
  const unavailable = [];
  const items = [];
  for (const id of page.ids) {
    const track = details.get(id);
    if (!track?.title) { unavailable.push(id); continue; }
    items.push({ title: track.title,
      artist: Array.isArray(track.artists) ? track.artists.map(artist => artist.name).filter(Boolean).join(', ') : '',
      playlist: page.liked ? '' : page.name,
      liked: page.liked });
  }
  return { source: 'yandex', name: page.name, items, unavailable: unavailable.length,
    total: page.ids.length };
}

async function resolveImportUrl(value) {
  const url = sourceUrl(value);
  if (url.hostname === 'music.yandex.ru') return resolveYandex(url);
  if (url.hostname === 'www.youtube.com') return parseYouTubePage(await fetchText(url.href));
  if (url.hostname === 'open.spotify.com') {
    const id = url.pathname.split('/')[2];
    const [html, embed] = await Promise.all([
      fetchText(url.href), fetchText(`https://open.spotify.com/embed/playlist/${id}`)
    ]);
    return parseSpotifyPage(html, embed, id);
  }
  const id = url.pathname.split('/').find(part => part.startsWith('pl.'));
  return parseApplePage(await fetchText(url.href), id);
}

module.exports = { resolveImportUrl, sourceUrl, parseYandexPage, parseApplePage, parseSpotifyPage,
  parseYouTubePage };
