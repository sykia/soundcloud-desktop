'use strict';

// A single-track downloader using the audio versions SoundCloud offers to the
// current session. Button placement and API flow were informed by the MIT
// licensed SoundCloud Downloader by NotTobi (see docs/downloads.md).

const fs = require('node:fs');
const { once } = require('node:events');
const { dialog, net, session } = require('electron');

const API = 'https://api-v2.soundcloud.com';
const MAX_BYTES = 500 * 1024 * 1024;
let clientId = '';
let busy = false;

function isSoundCloudTrackUrl(value) {
  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    return url.protocol === 'https:' && url.hostname === 'soundcloud.com' &&
      parts.length === 2 && parts.every(part => /^[\w.-]+$/.test(part)) &&
      !['you', 'settings', 'discover', 'search', 'feed', 'upload', 'studio', 'artists'].includes(parts[0]);
  } catch { return false; }
}

function isMediaUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      (url.hostname === 'soundcloud.com' || url.hostname.endsWith('.soundcloud.com') ||
       url.hostname === 'sndcdn.com' || url.hostname.endsWith('.sndcdn.com'));
  } catch { return false; }
}

function watchClientId() {
  session.defaultSession.webRequest.onSendHeaders({ urls: [`${API}/*`] }, details => {
    if (!details.webContentsId || !details.url.startsWith(`${API}/`)) return;
    const value = new URL(details.url).searchParams.get('client_id');
    if (value && /^[a-zA-Z0-9]{20,64}$/.test(value)) clientId = value;
  });
}

async function getResponse(url) {
  if (!isMediaUrl(url)) throw new Error('SoundCloud вернул неподдерживаемый адрес файла.');
  const response = await net.fetch(url, { credentials: 'include' });
  if (!response.ok || (response.url && !isMediaUrl(response.url))) {
    throw new Error(`SoundCloud не предоставил доступ к аудио (HTTP ${response.status}).`);
  }
  return response;
}

async function getJson(url) {
  const response = await getResponse(url);
  return response.json();
}

function withClientId(value) {
  const url = new URL(value);
  url.searchParams.set('client_id', clientId);
  return url.toString();
}

function safeFilename(value) {
  return value.replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '').replace(/[. ]+$/g, '').trim().slice(0, 180) || 'SoundCloud track';
}

function fileType(transcoding) {
  const mime = transcoding.format?.mime_type || '';
  if (mime.startsWith('audio/mpeg')) return 'mp3';
  if (mime.startsWith('audio/mp4')) return 'm4a';
  return null;
}

function availableSources(track) {
  return (track.media?.transcodings || [])
    .filter(item => !item.snipped && ['hls', 'progressive'].includes(item.format?.protocol) && fileType(item))
    .sort((a, b) => (b.quality === 'hq') - (a.quality === 'hq') ||
      (b.format.protocol === 'hls') - (a.format.protocol === 'hls'));
}

function parsePlaylist(body, baseUrl) {
  if (!body.startsWith('#EXTM3U')) throw new Error('Неверный плейлист SoundCloud.');
  const lines = body.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const urls = [];
  for (const line of lines) {
    if (line.startsWith('#EXT-X-KEY') && !line.includes('METHOD=NONE')) {
      throw new Error('Защищённый поток нельзя сохранить как файл.');
    }
    if (line.startsWith('#EXT-X-MAP:')) {
      const match = line.match(/URI="([^"]+)"/);
      if (match) urls.push(new URL(match[1], baseUrl).toString());
    } else if (!line.startsWith('#')) {
      urls.push(new URL(line, baseUrl).toString());
    }
  }
  if (!urls.length || urls.length > 2000 || urls.some(url => !isMediaUrl(url))) {
    throw new Error('SoundCloud вернул неподдерживаемый плейлист.');
  }
  return urls;
}

async function writeResponse(response, output, counter) {
  if (!response.body) throw new Error('SoundCloud вернул пустой файл.');
  for await (const chunk of response.body) {
    counter.bytes += chunk.length;
    if (counter.bytes > MAX_BYTES) throw new Error('Файл слишком большой.');
    if (!output.write(chunk)) await once(output, 'drain');
  }
}

async function saveSource(source, target) {
  const output = fs.createWriteStream(target, { flags: 'wx' });
  const counter = { bytes: 0 };
  try {
    const response = await getResponse(source.url);
    if (source.protocol === 'hls') {
      const playlist = await response.text();
      if (playlist.length > 1024 * 1024) throw new Error('Плейлист слишком большой.');
      for (const url of parsePlaylist(playlist, response.url || source.url)) {
        await writeResponse(await getResponse(url), output, counter);
      }
    } else {
      await writeResponse(response, output, counter);
    }
    if (!counter.bytes) throw new Error('SoundCloud вернул пустой файл.');
    output.end();
    await once(output, 'finish');
  } catch (error) {
    output.destroy();
    await fs.promises.unlink(target).catch(() => {});
    throw error;
  }
}

async function downloadTrack(permalink, window) {
  if (busy) throw new Error('Дождитесь завершения текущего скачивания.');
  if (!isSoundCloudTrackUrl(permalink)) throw new Error('Некорректная ссылка на трек.');
  if (!clientId) throw new Error('SoundCloud ещё загружается. Повторите попытку позже.');
  busy = true;
  try {
    const track = await getJson(withClientId(`${API}/resolve?url=${encodeURIComponent(permalink)}`));
    if (track.kind !== 'track' || track.state !== 'finished' || !track.streamable) {
      throw new Error('Этот трек недоступен для скачивания.');
    }
    const sources = availableSources(track);
    if (!sources.length) throw new Error('SoundCloud не предоставил доступный аудиопоток.');
    let lastError;
    for (const item of sources) {
      try {
        const requestUrl = withClientId(item.url);
        const authUrl = new URL(requestUrl);
        if (track.track_authorization) authUrl.searchParams.set('track_authorization', track.track_authorization);
        const resolved = await getJson(authUrl.toString());
        if (!isMediaUrl(resolved.url)) continue;
        const extension = fileType(item);
        const name = safeFilename(`${track.user?.username || 'SoundCloud'} - ${track.title}`);
        const result = await dialog.showSaveDialog(window, {
          title: 'Сохранить трек SoundCloud',
          defaultPath: `${name}.${extension}`,
          filters: [{ name: extension.toUpperCase(), extensions: [extension] }]
        });
        if (result.canceled || !result.filePath) return false;
        // Electron's save dialog can return an existing path. Ask before replacing it.
        const target = result.filePath;
        if (fs.existsSync(target)) {
          const confirmation = await dialog.showMessageBox(window, {
            type: 'question', buttons: ['Заменить', 'Отмена'], defaultId: 1,
            title: 'Файл уже существует', message: `Заменить файл «${name}.${extension}»?`
          });
          if (confirmation.response !== 0) return false;
        }
        const temporary = `${target}.cusade-${process.pid}-${Date.now()}.part`;
        try {
          await saveSource({ url: resolved.url, protocol: item.format.protocol }, temporary);
          // Keep an existing file intact until the complete replacement is ready.
          if (fs.existsSync(target)) await fs.promises.unlink(target);
          await fs.promises.rename(temporary, target);
        } catch (error) {
          await fs.promises.unlink(temporary).catch(() => {});
          throw error;
        }
        return true;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('Не удалось скачать трек.');
  } finally {
    busy = false;
  }
}

module.exports = { watchClientId, downloadTrack, isSoundCloudTrackUrl, parsePlaylist, availableSources };
