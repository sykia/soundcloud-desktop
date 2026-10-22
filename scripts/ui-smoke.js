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
  const diagnostics = await evaluate(`({url:location.href,ready:document.readyState,classes:document.documentElement.className,hidden:document.hidden,viewport:[innerWidth,innerHeight],tile:document.querySelector('.playableTile')?.getBoundingClientRect().toJSON()})`);
  throw new Error(`${message}: ${JSON.stringify({ ...diagnostics, visible:win.isVisible(), minimized:win.isMinimized(), failures })}`);
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
  win.show();
  win.focus();
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

  await evaluate(`(()=>{const pad=document.createElement('div');pad.id='scroll-fixture';pad.style.height='5000px';document.body.append(pad);window.scrollTo(0,0);})()`);
  for (const [deltaY, deltaMode, target] of [[480, 0, 480], [12, 1, 240], [1, 2, null]]) {
    await evaluate('window.scrollTo(0,0)');
    await sleep(50);
    const expected = target ?? await evaluate('innerHeight');
    assert.equal(await evaluate(`document.body.dispatchEvent(new WheelEvent('wheel',{deltaY:${deltaY},deltaMode:${deltaMode},bubbles:true,cancelable:true}))`), false);
    await waitFor('scrollY>0', 'Wheel did not start');
    const midway = await evaluate('scrollY');
    assert.ok(midway > 0 && midway < expected, `Wheel must interpolate, got ${midway}/${expected}`);
    await waitFor(`Math.abs(scrollY-${expected})<=1`, 'Wheel did not settle');
  }
  for (const extra of ['ctrlKey:true', 'deltaX:500', 'shiftKey:true']) {
    assert.equal(await evaluate(`document.body.dispatchEvent(new WheelEvent('wheel',{deltaY:100,${extra},bubbles:true,cancelable:true}))`), true);
  }
  await evaluate(`(()=>{const pane=document.createElement('div');pane.id='nested-scroll';pane.style.cssText='height:60px;overflow-y:auto';pane.innerHTML='<div style="height:300px">nested</div>';document.body.prepend(pane);})()`);
  assert.equal(await evaluate(`document.querySelector('#nested-scroll').dispatchEvent(new WheelEvent('wheel',{deltaY:100,bubbles:true,cancelable:true}))`), true);
  await evaluate(`document.querySelector('#nested-scroll').remove()`);
  console.log('PASS: pixel/line/page wheel, zoom, horizontal gestures and nested scrollers');

  // Exercise actual history traversal, including a list that arrives after
  // popstate. This runs in the real isolated preload on Linux and Windows.
  await evaluate(`history.pushState({},'', '/feed')`);
  await waitFor(`document.documentElement.classList.contains('cusade-page-feed')`, 'Feed route not ready');
  await evaluate('window.scrollTo(0,720)');
  await sleep(100);
  await evaluate(`history.pushState({},'', '/artist/track')`);
  await waitFor(`location.pathname==='/artist/track'`, 'Track route not ready');
  await sleep(100);
  await evaluate('window.scrollTo(0,0)');
  await sleep(100);
  await evaluate(`document.querySelector('#scroll-fixture').style.height='0px';history.back();setTimeout(()=>{document.querySelector('#scroll-fixture').style.height='5000px';},250)`);
  await waitFor(`location.pathname==='/feed' && Math.abs(scrollY-720)<=1`, 'Back did not restore the delayed feed');
  await sleep(650);
  await evaluate('history.forward()');
  await waitFor(`location.pathname==='/artist/track' && scrollY===0`, 'Forward did not restore track position');
  await sleep(650);
  await evaluate('history.back()');
  await waitFor(`location.pathname==='/feed' && Math.abs(scrollY-720)<=1`, 'Second back lost feed position');
  await evaluate(`document.body.dispatchEvent(new WheelEvent('wheel',{deltaY:0,bubbles:true,cancelable:true}));window.scrollTo(0,300)`);
  await sleep(200);
  assert.equal(await evaluate('scrollY'),300,'Restoration fought user input');
  await evaluate(`document.querySelector('#scroll-fixture').remove()`);
  console.log('PASS: back/forward position, delayed list and user cancellation');

  win.webContents.debugger.attach('1.3');
  const command = (method, params) => win.webContents.debugger.sendCommand(method, params);
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await waitFor(`matchMedia('(prefers-reduced-motion: reduce)').matches`, 'Reduced motion emulation failed');
  assert.equal(await evaluate(`document.documentElement.classList.contains('cusade-animations')`), true);
  assert.match(await evaluate(`getComputedStyle(document.querySelector('.playableTile')).transitionDuration`), /0\.36s/);
  await setToggle('respect-system-motion', true);
  await waitFor(`!document.documentElement.classList.contains('cusade-animations')`, 'System reduced motion not respected');
  assert.equal(await evaluate(`document.body.dispatchEvent(new WheelEvent('wheel',{deltaY:100,bubbles:true,cancelable:true}))`), true);
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
  for (const [status, version, ready] of [
    ['checking', '', false], ['current', '', false], ['error', '', false],
    ['downloading', '0.5.6', false], ['ready', '0.5.6', true]
  ]) {
    win.webContents.send(CHANNEL.showUpdate, { status, version, ready, progress: 42, packageType: 'win', error: status === 'error' ? 'Ошибка сети' : '' });
    await waitFor(`!!document.querySelector('#cusade-update-host')?.shadowRoot`, 'Update card missing');
    await sleep(50);
    const card = await evaluate(`(()=>{const s=document.querySelector('#cusade-update-host').shadowRoot;return {text:s.querySelector('.details').textContent,disabled:s.querySelector('.action').disabled,progress:s.querySelector('progress').hidden,release:s.querySelector('.release').hidden};})()`);
    assert.equal(card.disabled, ['checking', 'downloading'].includes(status));
    assert.equal(card.progress, status !== 'downloading');
    assert.equal(card.release, !version);
    if (ready) assert.match(card.text, /без мастера установки/);
    if (status === 'error') assert.equal(card.text, 'Ошибка сети');
    await evaluate(`document.querySelector('#cusade-update-host').shadowRoot.querySelector('.close').click()`);
  }
  console.log('PASS: update checking, up-to-date, error, download progress and restart card');
  await evaluate(`(()=>{const row=document.createElement('div');row.className='sound';row.id='download-check';row.innerHTML='<a class="soundTitle__title" href="/artist/track"></a><div class="sound__footer"><div class="sc-button-group"></div></div>';document.body.append(row);})()`);
  await waitFor(`!!document.querySelector('#download-check .cusade-download')`, 'Dynamic download button missing');
  await evaluate(`document.querySelector('#download-check .cusade-download').remove()`);
  await waitFor(`!!document.querySelector('#download-check .cusade-download')`, 'Removed download button not restored');
  win.hide();
  await sleep(150);
  await evaluate(`(()=>{const row=document.querySelector('#download-check').cloneNode(true);row.id='download-background';row.querySelector('.cusade-download').remove();document.body.append(row);})()`);
  await sleep(400);
  assert.equal(await evaluate(`!!document.querySelector('#download-background .cusade-download')`), false, 'Downloads observer still scans a hidden window');
  win.show();
  await waitFor(`!!document.querySelector('#download-background .cusade-download')`, 'Downloads did not catch up on window show');
  await evaluate(`(()=>{const row=document.querySelector('#download-check').cloneNode(true);row.id='download-href';row.querySelector('.cusade-download').remove();row.querySelector('a').href='/discover';document.body.append(row);})()`);
  await sleep(350);
  assert.equal(await evaluate(`!!document.querySelector('#download-href .cusade-download')`),false);
  await evaluate(`document.querySelector('#download-href a').href='/artist/another-track'`);
  await waitFor(`!!document.querySelector('#download-href .cusade-download')`, 'Href-only update not scanned');
  console.log('PASS: dynamic downloads, removed button repair, hidden-window pause, catch-up and href mutations');
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  clearTimeout(timeout);
  autoTranslate.teardown();
  windowModule.setQuitting();
  win?.destroy();
  app.exit(process.exitCode || 0);
});
