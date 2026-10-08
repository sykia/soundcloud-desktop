'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const test = require('node:test');

const originalLoad = Module._load;
let listener;
let target;
let failSegment = false;
const mockElectron = {
  session: { defaultSession: { webRequest: { onSendHeaders: (_filter, callback) => { listener = callback; } } } },
  dialog: {
    showSaveDialog: async () => ({ canceled: false, filePath: target }),
    showMessageBox: async () => ({ response: 0 })
  },
  net: { fetch: async value => {
    const url = new URL(value);
    if (url.pathname === '/resolve') return Response.json({
      kind: 'track', state: 'finished', streamable: true,
      title: 'Track', user: { username: 'Artist' },
      media: { transcodings: [{
        quality: 'sq', snipped: false, url: 'https://api-v2.soundcloud.com/media/test/stream/hls',
        format: { protocol: 'hls', mime_type: 'audio/mpeg' }
      }] }
    });
    if (url.pathname === '/media/test/stream/hls') {
      return Response.json({ url: 'https://cf-hls-media.sndcdn.com/test/playlist.m3u8' });
    }
    if (url.pathname === '/test/playlist.m3u8') {
      return new Response('#EXTM3U\n#EXTINF:1,\npart1.mp3\n#EXTINF:1,\npart2.mp3\n');
    }
    if (url.pathname === '/test/part1.mp3') return new Response('ID3abc');
    if (url.pathname === '/test/part2.mp3') {
      return failSegment ? new Response('denied', { status: 403 }) : new Response('xyz');
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  } }
};

Module._load = function (request, parent, isMain) {
  if (request === 'electron') return mockElectron;
  return originalLoad.call(this, request, parent, isMain);
};
const downloads = require('../src/main/downloads.js');
Module._load = originalLoad;

function prepare() {
  downloads.watchClientId();
  listener({ webContentsId: 1,
    url: 'https://api-v2.soundcloud.com/tracks?client_id=12345678901234567890123456789012' });
}

test('saves the offered HLS audio in segment order', async () => {
  prepare();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cusade-download-'));
  target = path.join(directory, 'track.mp3');
  try {
    assert.equal(await downloads.downloadTrack('https://soundcloud.com/artist/track', null), true);
    assert.equal(fs.readFileSync(target, 'utf8'), 'ID3abcxyz');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('failed download keeps an existing file', async () => {
  prepare();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cusade-download-'));
  target = path.join(directory, 'track.mp3');
  fs.writeFileSync(target, 'original');
  failSegment = true;
  try {
    await assert.rejects(downloads.downloadTrack('https://soundcloud.com/artist/track', null));
    assert.equal(fs.readFileSync(target, 'utf8'), 'original');
    assert.deepEqual(fs.readdirSync(directory), ['track.mp3']);
  } finally {
    failSegment = false;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects unrelated playlist hosts and non-track pages', () => {
  assert.throws(() => downloads.parsePlaylist('#EXTM3U\nhttps://example.com/file.mp3',
    'https://cf-hls-media.sndcdn.com/test/playlist.m3u8'));
  assert.equal(downloads.isSoundCloudTrackUrl('https://soundcloud.com/artist/sets/album'), false);
});
