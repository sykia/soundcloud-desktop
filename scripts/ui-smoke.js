'use strict';

// Runs the real sandboxed preload against a local SoundCloud-shaped fixture.
// No network, login, or user profile is needed. CI runs this on Linux + Windows.
const { app, ipcMain, session } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CHANNEL } = require('../shared/ipc.js');
const { coerceSettings } = require('../shared/settings-schema.js');
const settings = require('../src/main/settings.js');
const windowModule = require('../src/main/window.js');
const autoTranslate = require('../src/main/auto-translate.js');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cusade-ui-smoke-'));
app.setPath('userData', profile);
app.setPath('sessionData', profile);
const failures = [];
let win;
let timeout;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixture = `<!doctype html><html lang="en"><head><meta charset="utf-8">
  <style>
    body { margin:0; font:14px Arial; }
    .header__inner { display:flex; min-width:960px; padding:0 16px; box-sizing:border-box; }
    .header__left { flex:0 1 auto; }.header__logo { float:left;width:208px;height:46px; }
    .header__navWrapper { float:left; }.header__navMenu { display:flex;padding:0;margin:0;list-style:none; }
    .header__navMenuItem { display:flex;padding:13px 8px;height:46px;box-sizing:border-box; }.header__middle { flex:1;min-width:98px; }
    .header__right { display:flex;flex:0 1 auto; }.header__loginMenu { padding:9px 10px; }
    .sc-button { padding:4px 8px;height:26px;border:0;font:14px Arial; }.playableTile { width:140px;height:140px;background:#f50;margin:16px; }
    @media(prefers-reduced-motion:reduce) { *,*::before,*::after { animation-duration:.01ms!important;transition-duration:0s!important; } }
  </style></head><body>
  <header class="header"><div class="header__inner">
    <div class="header__left"><div class="header__logo"><a class="header__logoLink-iconOnly" aria-hidden="true">SC</a><a class="header__logoLink-wordmark">SoundCloud</a></div>
    <nav class="header__navWrapper"><ul class="header__navMenu"><li><a class="header__navMenuItem" href="/discover">Home</a></li><li><a class="header__navMenuItem" href="/feed">Feed</a></li><li><a class="header__navMenuItem" href="/you/library">Library</a></li></ul></nav></div>
    <div class="header__middle"><input aria-label="Search"></div>
    <div class="header__right"><div class="header__upsellWrapper"><a>Try Go+</a><a>Try Artist Pro</a></div><div class="header__loginMenu"><button class="sc-button">Sign in</button><button class="sc-button">Create account</button></div></div>
  </div></header>
  <main><h1 class="modularHomeHeading__title">Discover Tracks and Playlists</h1>
  <div class="playableTile"><a class="playableTile__title" href="/artist/track">Home</a></div>
  <button class="sc-button" id="action">Follow</button></main>
  </body></html>`;

async function evaluate(expression) { return win.webContents.executeJavaScript(expression); }
async function waitFor(expression, message) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(expression)) return;
    await sleep(50);
  }
  throw new Error(message);
}
async function setToggle(id, value) {
  await waitFor(`!!document.querySelector('#cusade-panel-host')?.shadowRoot?.querySelector('#${id}') && !document.querySelector('#cusade-panel-host').shadowRoot.querySelector('#${id}').disabled`, `${id} not ready`);
  await evaluate(`(()=>{const input=document.querySelector('#cusade-panel-host').shadowRoot.querySelector('#${id}');if(input.checked!==${value})input.click();})()`);
  await waitFor(`!document.querySelector('#cusade-panel-host').shadowRoot.querySelector('#${id}').disabled`, `${id} not saved`);
}

app.on('web-contents-created', (_event, contents) => {
  contents.on('preload-error', (_event, _file, error) => failures.push(error.message));
  contents.on('console-message', details => {
    if (details.level === 'error') failures.push(details.message);
  });
});
app.whenReady().then(async () => {
  timeout = setTimeout(() => { console.error('UI smoke timed out'); app.exit(1); }, 45000);
  await session.defaultSession.protocol.handle('https', () => new Response(fixture, { headers: { 'content-type': 'text/html' } }));
  settings.saveSettings(coerceSettings({ animations: true, appLanguage: 'ru' }));
  require('../src/main/ipc.js').register();
  require('../src/main/audio-ads.js').installAudioAdRule(session.defaultSession, settings.getSettings);
  // Make the settings round trip slower than the fixture render: this catches
  // the missing initial scan on fast machines, including the reported NixOS case.
  ipcMain.removeHandler(CHANNEL.getSettings);
  ipcMain.handle(CHANNEL.getSettings, async () => { await sleep(250); return settings.getSettings(); });
  windowModule.createWindow();
  win = windowModule.getMainWindow();
  await waitFor(`document.documentElement.classList.contains('cusade-russian') && document.querySelector('.playableTile')?.classList.contains('cusade-enter-target')`, 'Existing cards or saved Russian setting not initialized');
  assert.equal(await evaluate(`document.querySelector('h1').textContent`), 'Открывайте треки и плейлисты');
  assert.equal(await evaluate(`document.querySelector('.playableTile__title').textContent`), 'Home');
  // Character-data mutations must be observed after saved language is loaded.
  await evaluate(`document.querySelector('#action').firstChild.nodeValue='Search'`);
  await waitFor(`document.querySelector('#action').textContent==='Поиск'`, 'Saved Russian setting did not enable text observation');
  console.log('PASS: startup, late settings, Russian text mutations, content protection');

  await evaluate(`history.pushState({},'', '/feed')`);
  await waitFor(`document.documentElement.classList.contains('cusade-page-feed') && document.querySelector('.cusade-route--sweep')`, 'Main-world navigation not observed');
  // Navigating in a child frame must not affect the main route.
  await evaluate(`(()=>{const f=document.createElement('iframe'); f.src='/settings'; document.body.append(f);})()`);
  await sleep(150);
  assert.equal(await evaluate(`document.documentElement.classList.contains('cusade-page-feed')`), true);
  console.log('PASS: isolated-world SPA navigation and subframe guard');

  win.webContents.send(CHANNEL.togglePanel);
  await setToggle('animations', false);
  assert.equal(await evaluate(`!!document.querySelector('.cusade-route')`), false);
  assert.equal(await evaluate(`document.querySelectorAll('.cusade-enter-target').length`), 0);
  await evaluate(`history.pushState({},'', '/you/library')`);
  await waitFor(`document.documentElement.classList.contains('cusade-page-library')`, 'Translation context stopped with animations off');
  await setToggle('animations', true);
  await waitFor(`document.querySelector('.playableTile').classList.contains('cusade-enter-target')`, 'Existing cards not rescanned on enable');
  assert.equal(settings.getSettings().animations, true);
  console.log('PASS: animation toggle, cancellation, re-enable, persistence');

  win.webContents.debugger.attach('1.3');
  const command = (method, params) => win.webContents.debugger.sendCommand(method, params);
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await waitFor(`matchMedia('(prefers-reduced-motion: reduce)').matches`, 'Reduced motion emulation failed');
  assert.equal(await evaluate(`document.documentElement.classList.contains('cusade-animations')`), true);
  assert.match(await evaluate(`getComputedStyle(document.querySelector('.playableTile')).transitionDuration`), /0\.36s/);
  await setToggle('respect-system-motion', true);
  await waitFor(`!document.documentElement.classList.contains('cusade-animations')`, 'System reduced motion not respected');
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await waitFor(`document.documentElement.classList.contains('cusade-animations')`, 'Effects not restored after system preference change');
  console.log('PASS: both system motion preferences and CSS reset override');

  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 800, deviceScaleFactor: 1, mobile: false });
  await setToggle('hide-artist-tools', true);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.header__upsellWrapper')).display`), 'none');
  await setToggle('hide-artist-tools', false);
  assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('.header__upsellWrapper')).display`), 'none');
  await setToggle('hide-artist-tools', true);
  console.log('PASS: reversible Go+ and Artist Pro hiding');

  await setToggle('block-audio-ads', true);
  const blocked = await evaluate(`fetch('https://api-v2.soundcloud.com/audio-ads').then(()=>false,()=>true)`);
  assert.equal(blocked, true);
  await setToggle('block-audio-ads', false);
  const allowed = await evaluate(`fetch('https://api-v2.soundcloud.com/audio-ads').then(r=>r.ok,()=>false)`);
  assert.equal(allowed, true);
  console.log('PASS: audio-ad request blocking and unblock toggle');

  for (const width of [800, 960, 1280]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: false });
    const bounds = await evaluate(`Array.from(document.querySelectorAll('.header__navMenuItem,.header__loginMenu .sc-button')).map(e=>({top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,right:e.getBoundingClientRect().right}))`);
    assert.ok(bounds.every(b => b.top >= 0 && b.bottom <= 46 && b.right <= width), `Russian header wraps at ${width}px: ${JSON.stringify(bounds)}`);
  }
  win.webContents.debugger.detach();
  assert.deepEqual(failures.filter(message => !message.includes('ERR_BLOCKED_BY_CLIENT')), []);
  console.log('PASS: Russian header at 800, 960, 1280px; no preload errors');
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  clearTimeout(timeout);
  autoTranslate.teardown();
  windowModule.setQuitting();
  win?.destroy();
  app.exit(process.exitCode || 0);
});
