'use strict';

const assert = require('node:assert/strict');
const { sourceUrl, parseYandexPage, parseApplePage, parseSpotifyPage, parseYouTubePage } =
  require('../src/main/resolve-import.js');

assert.equal(sourceUrl('https://music.yandex.ru/playlists/lk.2b38ee44-aec8-4158-afe6-91b0041110bd?utm_source=x').search, '');
for (const value of [
  'http://music.yandex.ru/playlists/54811e8d-ae6e-922f-ba22-5e2ef8b62e9b',
  'https://music.yandex.ru.evil.example/playlists/54811e8d-ae6e-922f-ba22-5e2ef8b62e9b',
  'https://127.0.0.1/playlists/54811e8d-ae6e-922f-ba22-5e2ef8b62e9b'
]) assert.throws(() => sourceUrl(value));

const yandexId = 'lk.2b38ee44-aec8-4158-afe6-91b0041110bd';
const yandexData = { playlistUuid: yandexId, available: true, visibility: 'public',
  title: 'Мне нравится', trackCount: 2, tracks: [{ id: 12 }, { id: 34 }] };
const flight = JSON.stringify(`x:{"preloadedPlaylistByUuid":${JSON.stringify(yandexData)}}`);
const yandexHtml = `<script>self.__next_f.push([1,${flight}])</script>`;
assert.deepEqual(parseYandexPage(yandexHtml, yandexId).ids, ['12', '34']);
assert.equal(parseYandexPage(yandexHtml, yandexId).liked, true);
const incompleteYandex = JSON.stringify(`x:{"preloadedPlaylistByUuid":${JSON.stringify({
  ...yandexData, trackCount: 3
})}}`);
assert.throws(() => parseYandexPage(`<script>self.__next_f.push([1,${incompleteYandex}])</script>`, yandexId));

const appleId = 'pl.123abc';
const appleData = { data: [{ id: `track-list - ${appleId}`, items: [
  { title: 'Song', subtitleLinks: [{ title: 'Artist' }] }
] }] };
const appleHtml = `<script type="application/json" id="serialized-server-data">${JSON.stringify(appleData)}</script>` +
  '<script type="application/ld+json">{"name":"List","numTracks":1}</script>';
assert.deepEqual(parseApplePage(appleHtml, appleId).items[0],
  { title: 'Song', artist: 'Artist', playlist: 'List', liked: false });
assert.throws(() => parseApplePage(appleHtml.replace('"numTracks":1', '"numTracks":2'), appleId));

const spotifyId = '37i9dQZF1DXcBWIGoYBM5M';
const initial = { entities: { items: { [`spotify:playlist:${spotifyId}`]: {
  content: { totalCount: 1 }, name: 'List'
} } } };
const spotifyHtml = `<script id="initialState">${Buffer.from(JSON.stringify(initial)).toString('base64')}</script>`;
const embed = { props: { pageProps: { state: { data: { entity: { id: spotifyId, title: 'List',
  trackList: [{ title: 'Song', subtitle: 'Artist' }] } } } } } };
const embedHtml = `<script id="__NEXT_DATA__">${JSON.stringify(embed)}</script>`;
assert.equal(parseSpotifyPage(spotifyHtml, embedHtml, spotifyId).items.length, 1);
initial.entities.items[`spotify:playlist:${spotifyId}`].content.totalCount = 2;
const incomplete = `<script id="initialState">${Buffer.from(JSON.stringify(initial)).toString('base64')}</script>`;
assert.throws(() => parseSpotifyPage(incomplete, embedHtml, spotifyId));

const youtubeData = {
  metadata: { playlistMetadataRenderer: { title: 'Album' } },
  sidebar: { playlistSidebarRenderer: { items: [{ playlistSidebarPrimaryInfoRenderer: {
    stats: [{ runs: [{ text: '1' }] }]
  } }] } },
  contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { content: {
    sectionListRenderer: { contents: [{ itemSectionRenderer: { contents: [{ lockupViewModel: {
      metadata: { lockupMetadataViewModel: { title: { content: 'Song' },
        metadata: { contentMetadataViewModel: { metadataRows: [{ metadataParts: [
          { text: { content: 'Artist - Topic' } }
        ] }] } } } }
    } }] } }] }
  } } }] } }
};
const youtubeHtml = `<script>var ytInitialData = ${JSON.stringify(youtubeData)};</script>`;
assert.deepEqual(parseYouTubePage(youtubeHtml).items[0],
  { title: 'Song', artist: 'Artist', playlist: 'Album', liked: false });
youtubeData.sidebar.playlistSidebarRenderer.items[0].playlistSidebarPrimaryInfoRenderer.stats[0].runs[0].text = '2';
assert.throws(() => parseYouTubePage(`<script>var ytInitialData = ${JSON.stringify(youtubeData)};</script>`));

console.log('resolve-import: all checks passed');
