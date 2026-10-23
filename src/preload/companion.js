'use strict';

const { ipcRenderer } = require('electron');
const { CHANNEL } = require('../../shared/ipc.js');
const { state } = require('./state.js');
const { isWindowActive, onWindowActivity } = require('./activity.js');
const { ui } = require('./localization-dict.js');
const sprites = {
  idle: require('./assets/companion/idle.png'), walk: require('./assets/companion/walk.png'),
  jump: require('./assets/companion/jump.png'), wave: require('./assets/companion/wave.png'),
  bored: require('./assets/companion/bored.png'), listen: require('./assets/companion/listen.png'),
  think: require('./assets/companion/think.png'), happy: require('./assets/companion/happy.png')
};
let host, button, image, bubble, timer, travel, audio, drag;
let flight = null, physicsFrame = 0, surfaceFrame = 0, support = null;
const FOOT = 92;
let surfaces = [], surfaceScanAt = 0;
let supportOffsetX = 0;
const supportResize = new ResizeObserver(() => scheduleSupport());
const supportRemoval = new MutationObserver(() => { if (support && !support.isConnected) scheduleSupport(); });
let x = 24, y = 0;
let lastPet = 0, affection = 0, lastActivity = Date.now(), lastCuriosity = 0;
let hovering = false, suppressClick = false, saving = false, wasPlaying = false;
let pointer = { x: -1000, y: -1000 };
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
function gentle() { return reduced.matches && state.respectSystemMotion; }
function bounds() {
  const maxY = Math.max(0, innerHeight - 96 - 66);
  return { maxX: Math.max(0, innerWidth - 108), minY: Math.min(54, maxY), maxY };
}
function home() {
  const b = bounds();
  return { x: state.companionPosition.x * b.maxX, y: b.minY + state.companionPosition.y * (b.maxY - b.minY) };
}
function place() {
  if (!host) return;
  const b = bounds();
  x = Math.max(0, Math.min(x, b.maxX));
  y = Math.max(b.minY, Math.min(y, b.maxY));
  host.style.left = `${x}px`; host.style.top = `${y}px`;
}
function pose(name) {
  if (!button) return;
  if (button.dataset.pose !== name) image.src = sprites[name];
  button.dataset.pose = name;
}
function say(ru, en) {
  if (!bubble) return;
  bubble.textContent = ui(ru, en);
  bubble.getAnimations().forEach(a => a.cancel());
  bubble.animate([{ opacity: 0 }, { opacity: 1, offset: .1 }, { opacity: 1, offset: .8 }, { opacity: 0 }], { duration: gentle() ? 1800 : 2500 });
}
function bounce(height = 6, count = 2) {
  if (!button || gentle()) return;
  button.animate([{ transform: 'translateY(0) rotate(-2deg)' }, { transform: `translateY(-${height}px) rotate(2deg)` }, { transform: 'translateY(0) rotate(-2deg)' }], { duration: height > 12 ? 650 : 1000, iterations: count });
}
function stop() {
  clearTimeout(timer); timer = null;
  cancelAnimationFrame(physicsFrame); physicsFrame = 0; flight = null;
  if (host) delete host.dataset.airborne;
  button?.style.removeProperty('rotate');
  if (travel && host) { const r = host.getBoundingClientRect(); x = r.left; y = r.top; }
  travel?.cancel(); travel = null;
  place(); button?.getAnimations().forEach(a => a.cancel());
}
function schedule(delay = 2500) {
  clearTimeout(timer); timer = null;
  if (host && !drag && !flight && isWindowActive() && !document.hidden) timer = setTimeout(act, delay);
}
function walkTo(targetX, targetY) {
  const b = bounds();
  const ledge = support?.isConnected ? support.getBoundingClientRect() : null;
  const tx = ledge ? Math.max(Math.max(0, ledge.left - 26), Math.min(targetX, Math.min(b.maxX, ledge.right - 82))) : Math.max(0, Math.min(targetX, b.maxX));
  const ty = ledge ? Math.max(b.minY, ledge.top - FOOT) : b.maxY;
  const distance = Math.hypot(tx - x, ty - y);
  if (Math.hypot(pointer.x - tx - 54, pointer.y - ty - 48) < 105) { pose('think'); schedule(); return; }
  if (distance < 15 || gentle()) { pose('idle'); schedule(); return; }
  pose('walk');
  const duration = Math.max(1000, distance / 38 * 1000);
  travel = host.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${tx - x}px,${ty - y}px)` }], { duration, easing: 'ease-in-out', fill: 'forwards' });
  bounce(3, Math.ceil(duration / 1000));
  travel.onfinish = () => {
    x = tx; y = ty; travel.cancel(); travel = null; place();
    if (support?.isConnected) supportOffsetX = x - support.getBoundingClientRect().left;
    button.getAnimations().forEach(a => a.cancel()); pose('idle'); schedule(1800);
  };
}
// Choose actions from context. Short trips stay near the place the user chose;
// attention and music interrupt wandering instead of random pose cycling.
function act() {
  timer = null;
  if (!host || drag || flight || !isWindowActive() || document.hidden) return;
  if (support && !support.isConnected) { support = null; releaseIntoWorld(); return; }
  if (support) followSupport();
  if (flight) return;
  const badge = document.querySelector('.playbackSoundBadge');
  const playing = Boolean(badge?.querySelector('a[href]') && !badge.classList.contains('paused'));
  const changed = playing !== wasPlaying; wasPlaying = playing;
  if (hovering) { pose(Date.now() - lastPet < 8000 ? 'happy' : 'wave'); schedule(); return; }
  if (gentle()) { pose(playing ? 'listen' : 'idle'); schedule(); return; }
  if (changed) {
    pose(playing ? 'listen' : 'think');
    if (playing) { say('О, музыка ♪', 'Oh, music ♪'); bounce(5, 2); }
    schedule(3000); return;
  }
  if (playing) {
    pose(Date.now() - lastPet < 7000 ? 'happy' : 'listen'); bounce(4, 2); schedule(3200); return;
  }
  if (document.getElementById('cusade-panel-host')) { pose('think'); schedule(); return; }
  if (Date.now() - lastPet < 6500) { pose('happy'); schedule(); return; }
  const idleFor = Date.now() - lastActivity;
  if (idleFor > 60000) { pose('bored'); schedule(5000); return; }
  if (button.dataset.pose === 'bored') { pose('wave'); say('Ты вернулся!', 'You are back!'); bounce(5, 1); schedule(); return; }
  const distance = Math.hypot(pointer.x - x - 54, pointer.y - y - 48);
  const nest = support ? { x, y } : home();
  if (distance < 230 && distance > 150 && Date.now() - lastCuriosity > 20000 && idleFor < 6000) {
    lastCuriosity = Date.now(); pose('think');
    // A few curious steps, always leaving space around the pointer.
    walkTo(x + Math.sign(pointer.x - x - 54) * 45, y); return;
  }
  if (Math.hypot(x - nest.x, y - nest.y) > 150) { walkTo(nest.x, nest.y); return; }
  if (Math.random() < .35) {
    walkTo(nest.x + (Math.random() - .5) * 220, nest.y + (Math.random() - .5) * 90);
  } else { pose(Math.random() < .3 ? 'think' : 'idle'); schedule(3000 + Math.random() * 2500); }
}
async function chirp() {
  if (!state.companionSounds) return;
  try {
    audio ||= new AudioContext();
    if (audio.state === 'suspended') await audio.resume();
    if (!state.companionSounds || !host || !isWindowActive() || document.hidden) return;
    const start = audio.currentTime, base = 660 + Math.random() * 200;
    for (let i = 0; i < 3; i++) {
      const oscillator = audio.createOscillator(), gain = audio.createGain(), t = start + i * .095;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(base * (i === 1 ? 1.5 : 1), t);
      oscillator.frequency.exponentialRampToValueAtTime(base * 1.2, t + .09);
      gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(.035, t + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, t + .12);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(t); oscillator.stop(t + .13);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    }
  } catch (error) { console.debug('Companion sound unavailable:', error); }
}
async function savePlace() {
  const b = bounds(), previous = state.companionPosition;
  const position = { x: b.maxX ? x / b.maxX : 0, y: b.maxY > b.minY ? (y - b.minY) / (b.maxY - b.minY) : 1 };
  state.companionPosition = position; saving = true;
  try { await ipcRenderer.invoke(CHANNEL.set('companionPosition'), position); }
  catch {
    state.companionPosition = previous;
    const origin = home(); x = origin.x; y = origin.y; place();
    say('Не удалось запомнить место', 'Could not save this spot');
  } finally { saving = false; }
}
// Discover exposed upper edges from rendered geometry, without site-specific selectors.
function scanSurfaces() {
  const found = new Set(), result = [], b = bounds();
  for (const px of [x + 30, x + 54, x + 78]) {
    if (px < 0 || px >= innerWidth) continue;
    for (let py = Math.max(b.minY, y + FOOT - 12); py < b.maxY + FOOT; py += 24) {
      for (let element of document.elementsFromPoint(px, py)) {
        for (let depth = 0; element && depth < 5; element = element.parentElement, depth++) {
          if (found.has(element)) continue;
          found.add(element);
          if (element === host || element === document.body || element === document.documentElement || (element.getAttribute('id') || '').startsWith('cusade-')) continue;
          const r = element.getBoundingClientRect();
          if (r.width < 76 || r.height < 28 || r.top < b.minY + FOOT || r.top > b.maxY + FOOT || r.width * r.height > innerWidth * innerHeight * .65) continue;
          const style = getComputedStyle(element);
          if (style.visibility !== 'visible' || Number(style.opacity) === 0 || style.display === 'contents') continue;
          const painted = !['transparent', 'rgba(0, 0, 0, 0)'].includes(style.backgroundColor) ||
            style.backgroundImage !== 'none' || (parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== 'none') ||
            ['IMG', 'VIDEO', 'INPUT', 'BUTTON'].includes(element.tagName);
          if (!painted) continue;
          const edgeX = Math.max(r.left + 2, Math.min(px, r.right - 2));
          const hit = document.elementsFromPoint(edgeX, r.top + 2).find(node => node !== host && !(node.getAttribute('id') || '').startsWith('cusade-'));
          if (hit && (element === hit || element.contains(hit))) result.push({ element, left: r.left, right: r.right, top: r.top });
        }
      }
    }
  }
  surfaces = result.sort((a, b) => a.top - b.top); surfaceScanAt = performance.now();
}
function land(element = null) {
  flight = null; physicsFrame = 0; support = element;
  supportResize.disconnect(); supportRemoval.disconnect();
  if (element) {
    supportOffsetX = x - element.getBoundingClientRect().left;
    supportResize.observe(element);
    supportRemoval.observe(document.body, { childList: true, subtree: true });
  }
  if (!host) return;
  delete host.dataset.airborne;
  host.dataset.support = element ? 'element' : 'floor';
  button.style.removeProperty('rotate');
  pose('think'); bounce(5, 1);
  say(element ? 'Удобно устроился!' : 'Приземлился!', element ? 'A comfy spot!' : 'Landed!');
  void savePlace(); schedule(2800);
}
function stepFlight(now) {
  physicsFrame = 0;
  if (!flight || !host || document.hidden || !isWindowActive()) return;
  const dt = Math.min(.025, Math.max(.001, (now - flight.time) / 1000)); flight.time = now;
  const b = bounds(), previousFoot = y + FOOT;
  flight.vy += 1450 * dt; flight.vx *= Math.exp(-.4 * dt);
  x += flight.vx * dt; y += flight.vy * dt;
  if (x <= 0 || x >= b.maxX) { x = Math.max(0, Math.min(x, b.maxX)); flight.vx *= -.48; }
  if (y < b.minY) { y = b.minY; flight.vy = Math.abs(flight.vy) * .35; }
  if (now - surfaceScanAt > 100) scanSurfaces();
  if (flight.vy >= 0) {
    const platform = surfaces.find(s => s.element.isConnected && x + 76 > s.left && x + 32 < s.right && previousFoot <= s.top + 3 && y + FOOT >= s.top);
    if (platform) { y = platform.top - FOOT; place(); land(platform.element); return; }
  }
  if (y >= b.maxY) { y = b.maxY; place(); land(); return; }
  button.style.rotate = `${Math.max(-24, Math.min(24, flight.vx / 40))}deg`;
  place(); physicsFrame = requestAnimationFrame(stepFlight);
}
function releaseIntoWorld(vx = 0, vy = 0) {
  if (!host || !state.companionEnabled) return;
  stop(); support = null; hovering = false;
  supportResize.disconnect(); supportRemoval.disconnect();
  scanSurfaces();
  if (gentle()) {
    const platform = surfaces.find(s => x + 76 > s.left && x + 32 < s.right && s.top >= y + FOOT - 5);
    y = platform ? platform.top - FOOT : bounds().maxY;
    place(); land(platform?.element); return;
  }
  pose('jump'); host.dataset.airborne = 'true'; delete host.dataset.support;
  flight = { vx: Math.max(-1600, Math.min(1600, vx)), vy: Math.max(-1200, Math.min(1200, vy)), time: performance.now() };
  physicsFrame = requestAnimationFrame(stepFlight);
}
function followSupport() {
  surfaceFrame = 0;
  if (!host || host.hidden || drag || flight || !support) return;
  const r = support.isConnected ? support.getBoundingClientRect() : null, b = bounds();
  if (!r || r.width < 76 || r.height < 28 || r.top < b.minY + FOOT || r.top > b.maxY + FOOT || supportOffsetX + 76 <= 0 || supportOffsetX + 32 >= r.width) {
    support = null; releaseIntoWorld(); return;
  }
  if (Math.abs(y + FOOT - r.top) > .5 || Math.abs(x - r.left - supportOffsetX) > .5) {
    stop(); x = r.left + supportOffsetX; y = r.top - FOOT; place(); schedule();
  }
}
function scheduleSupport() {
  if (support && !surfaceFrame && isWindowActive() && !document.hidden) surfaceFrame = requestAnimationFrame(followSupport);
}
function cancelDrag() {
  if (!drag) return;
  const pointerId = drag.id; drag = null;
  if (host) delete host.dataset.dragging;
  if (button?.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
  button?.classList.remove('held');
  const origin = home(); x = origin.x; y = origin.y; place(); suppressClick = true;
}
function connectInteractions() {
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 || saving || drag) return;
    stop(); support = null; supportResize.disconnect(); supportRemoval.disconnect();
    button.style.removeProperty('rotate'); suppressClick = false;
    drag = { id: event.pointerId, fromX: event.clientX, fromY: event.clientY, x, y, moved: false,
      samples: [{ x: event.clientX, y: event.clientY, time: performance.now() }] };
    host.dataset.dragging = 'true';
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const now = performance.now();
    drag.samples.push({ x: event.clientX, y: event.clientY, time: now });
    drag.samples = drag.samples.filter(sample => now - sample.time <= 110).slice(-12);
    const dx = event.clientX - drag.fromX, dy = event.clientY - drag.fromY;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    if (!drag.moved) { drag.moved = true; pose('jump'); button.classList.add('held'); }
    x = drag.x + dx; y = drag.y + dy; place();
  });
  button.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const moved = drag.moved, now = performance.now();
    const samples = drag.samples.filter(sample => now - sample.time <= 110);
    const last = samples[samples.length - 1];
    // The final swing determines direction, including after back-and-forth shaking.
    const first = last && samples.slice(0, -1).reverse().find(sample =>
      last.time - sample.time <= 100 && Math.hypot(last.x - sample.x, last.y - sample.y) >= 4);
    const elapsed = first && last ? Math.max(.016, (last.time - first.time) / 1000) : 1;
    const vx = first && last ? (last.x - first.x) / elapsed : 0;
    const vy = first && last ? (last.y - first.y) / elapsed : 0;
    const thrown = samples.length >= 2 && now - last.time < 80 && Math.hypot(vx, vy) > 450;
    drag = null;
    delete host.dataset.dragging;
    button.releasePointerCapture(event.pointerId); button.classList.remove('held');
    if (moved) {
      suppressClick = true; hovering = false; lastActivity = Date.now();
      say(thrown ? 'Уи-и-и!' : 'Ищу опору…', thrown ? 'Wheee!' : 'Finding my footing…');
      releaseIntoWorld(thrown ? vx : 0, thrown ? vy : 0);
    } else schedule();
  });
  button.addEventListener('pointercancel', () => { cancelDrag(); releaseIntoWorld(); });
  button.addEventListener('lostpointercapture', () => { if (drag) { cancelDrag(); releaseIntoWorld(); } });
  button.addEventListener('pointerenter', () => {
    hovering = true;
    if (!drag && !flight) {
      stop();
      if (support?.isConnected) supportOffsetX = x - support.getBoundingClientRect().left;
      pose(Date.now() - lastPet < 6500 ? 'happy' : 'wave'); schedule();
    }
  });
  button.addEventListener('pointerleave', () => { hovering = false; if (!drag) schedule(1500); });
  button.addEventListener('click', () => {
    if (suppressClick) { suppressClick = false; return; }
    if (flight || Date.now() - lastPet < 500) return;
    affection = Date.now() - lastPet < 4000 ? affection + 1 : 1;
    lastPet = Date.now(); stop(); pose('happy'); void chirp();
    say(affection >= 3 ? 'Ещё! ♡' : 'Мр-р ♡', affection >= 3 ? 'More! ♡' : 'Purr ♡');
    bounce(affection >= 3 ? 20 : 10, affection >= 3 ? 2 : 1); schedule(2300);
  });
  button.addEventListener('keydown', event => {
    const offsets = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] };
    const offset = offsets[event.key];
    if (!offset || saving) return;
    event.preventDefault(); stop(); x += offset[0]; y += offset[1]; place();
    releaseIntoWorld();
  });
}
function syncCompanion() {
  if (!state.companionEnabled) {
    cancelDrag(); stop(); support = null; cancelAnimationFrame(surfaceFrame); surfaceFrame = 0;
    supportResize.disconnect(); supportRemoval.disconnect();
    surfaces = [];
    host?.remove(); host = button = image = bubble = null; hovering = false;
    if (audio) { audio.close().catch(() => {}); audio = null; }
    return;
  }
  if (!state.settingsLoaded || !document.body) return;
  if (!host) {
    host = document.createElement('div'); host.id = 'cusade-companion-host';
    Object.assign(host.style, { position: 'fixed', width: '108px', height: '96px', zIndex: '99998', pointerEvents: 'none' });
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>
      button { position:relative; display:block; width:108px; height:96px; padding:0; border:0; background:transparent; cursor:grab; pointer-events:auto; touch-action:none; border-radius:16px; user-select:none; }
      button.held { cursor:grabbing; transform:rotate(-7deg) scale(1.05); }
      button:focus-visible { outline:2px solid #ff5500; outline-offset:3px; }
      .crop { display:block; position:absolute; inset:0; overflow:hidden; pointer-events:none; }
      img { position:absolute; width:120px; height:120px; max-width:none; left:-6px; top:-5px; user-select:none; }
      button[data-pose="think"] img { top:-9px; }
      :host(:not(.gentle)) button[data-pose="idle"] .crop { animation:breathing 4s ease-in-out infinite; transform-origin:50% 95%; }
      @keyframes breathing { 0%,100% { transform:scale(1); } 50% { transform:scale(1.015,.985); } }
      .bubble { position:absolute; bottom:100%; left:0; max-width:145px; padding:6px 9px; border-radius:12px 12px 12px 3px; background:#24212c; color:#fff; font:12px/1.35 system-ui,sans-serif; opacity:0; pointer-events:none; box-shadow:0 3px 12px #0003; }
    </style><button type="button"><span class="crop"><img draggable="false" alt=""></span></button><span class="bubble" role="status" aria-live="polite"></span>`;
    button = shadow.querySelector('button'); image = shadow.querySelector('img'); bubble = shadow.querySelector('.bubble');
    button.setAttribute('aria-label', ui('Спутник cusade. Нажмите, чтобы погладить. Стрелки — переместить.', 'Cusade companion. Click to pet. Arrow keys to move.'));
    button.title = ui('Нажмите — погладить. Тяните — перенести. Резко отпустите — бросить.', 'Click to pet. Drag to move. Flick and release to throw.');
    connectInteractions();
    const origin = home(); x = origin.x; y = origin.y;
    document.body.appendChild(host); place(); pose('wave');
    if (y < bounds().maxY - 2) releaseIntoWorld(); else schedule();
  }
  if (gentle() && !host.classList.contains('gentle')) {
    if (flight) releaseIntoWorld(); else { stop(); pose('idle'); }
  }
  host.classList.toggle('gentle', gentle());
  host.hidden = !isWindowActive() || document.hidden;
  if (host.hidden) { cancelDrag(); const falling = !!flight; stop(); if (falling) { y = bounds().maxY; place(); } hovering = false; }
  else if (!timer && !travel && !drag && !flight) { followSupport(); schedule(); }
  if (!state.companionSounds && audio) { audio.close().catch(() => {}); audio = null; }
}
onWindowActivity(syncCompanion);
document.addEventListener('visibilitychange', syncCompanion);
document.addEventListener('pointermove', event => { pointer = { x: event.clientX, y: event.clientY }; lastActivity = Date.now(); }, { passive: true });
document.addEventListener('keydown', () => { lastActivity = Date.now(); }, { passive: true });
document.addEventListener('scroll', scheduleSupport, { passive: true, capture: true });
window.addEventListener('resize', () => { cancelDrag(); stop(); if (support) followSupport(); else { const origin = home(); x = origin.x; y = origin.y; place(); releaseIntoWorld(); } });
reduced.addEventListener('change', () => {
  if (flight) { if (gentle()) releaseIntoWorld(); }
  else { stop(); pose('idle'); }
  syncCompanion();
});
window.addEventListener('pagehide', () => {
  cancelDrag(); stop(); supportResize.disconnect(); supportRemoval.disconnect();
  cancelAnimationFrame(surfaceFrame); surfaceFrame = 0; surfaces = []; support = null;
  if (audio) { audio.close().catch(() => {}); audio = null; }
});
module.exports = { syncCompanion };
