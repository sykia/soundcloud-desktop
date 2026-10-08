'use strict';

// Development audit uses the renderer's classifier. Private content is counted
// but never serialized, and the authenticated session stays in Electron.
const fs = require('node:fs/promises');
const { ipcMain } = require('electron');
const { isSoundCloudUrl } = require('./urls.js');
const { CHANNEL } = require('../../shared/ipc.js');
const frameLocalization = require('./frame-localization.js');

const ROUTES = [
  ['discover', '/'], ['feed', '/feed'], ['library', '/you/library'],
  ['likes', '/you/likes'], ['search', '/search'], ['settings', '/settings'],
  ['notifications', '/notifications'], ['messages', '/messages'],
  ['upload', '/upload'], ['studio', '/studio'], ['studio', '/artists']
];

function pageStatus(target, actual, loginGate, preload, count, marker = true) {
  if (loginGate) return 'login-required';
  if (actual !== target && !actual.startsWith(`${target}/`) &&
      !(target === '/' && actual === '/discover')) return 'redirected';
  if (!preload) return 'preload-unavailable';
  if (!count || !marker) return 'empty-or-unverified';
  return 'audited';
}

function requestAudit(contents, frame = contents.mainFrame) {
  return new Promise(resolve => {
    const nonce = `${Date.now()}-${Math.random()}`;
    const timer = setTimeout(() => { ipcMain.removeListener(CHANNEL.localizationAuditResponse, receive); resolve(null); }, 5000);
    function receive(event, received, result) {
      if (event.sender !== contents || received !== nonce) return;
      clearTimeout(timer);
      ipcMain.removeListener(CHANNEL.localizationAuditResponse, receive);
      resolve(result);
    }
    ipcMain.on(CHANNEL.localizationAuditResponse, receive);
    frame.send(CHANNEL.localizationAuditRequest, nonce);
  });
}

async function pageInfo(contents, page) {
  return contents.executeJavaScript(`(() => {
    const path = location.pathname;
    const loginGate = Boolean(document.querySelector('form input[type="password"], .authModal')) ||
      /\\/(?:login|signin|sign-in|connect)(?:\\/|$)/i.test(path);
    const settingsRoutes = ${JSON.stringify(page)} === 'settings' ?
      [...new Set([...document.querySelectorAll('a[href^="/settings/"]')]
        .map(a => new URL(a.href).pathname))].slice(0, 16) : [];
    const settingsTabs = ${JSON.stringify(page)} === 'settings' ?
      [...document.querySelectorAll('a[href^="/settings/"]')].slice(0, 12).map(a => ({
        className: a.className, parentClassName: a.parentElement?.className,
        containerTag: a.parentElement?.parentElement?.tagName,
        containerClassName: a.parentElement?.parentElement?.className,
        containerWrap: a.parentElement?.parentElement ?
          getComputedStyle(a.parentElement.parentElement).flexWrap : null,
        width: Math.round(a.getBoundingClientRect().width),
        height: Math.round(a.getBoundingClientRect().height),
        scrollWidth: a.scrollWidth
      })) : [];
    const settingsProbe = ${JSON.stringify(page)} === 'settings' && path === '/settings' ?
      [/Кусаи|cusae/i, /Мужчина, мука/i, /Значки из верифики/i, /Отзыв доступа/i]
        .map((pattern, index) => {
          const element = [...document.querySelectorAll('body *')].find(node =>
            [...node.childNodes].some(child => child.nodeType === Node.TEXT_NODE &&
              pattern.test(child.nodeValue.trim())));
          return { index, tag: element?.tagName, className: element?.className,
            parentClassName: element?.parentElement?.className,
            grandClassName: element?.parentElement?.parentElement?.className };
        }) : [];
    const profile = ${JSON.stringify(page)} === 'discover' ?
      document.querySelector('.header__userNav a[href], a.header__userNavButton[href]')?.getAttribute('href') : null;
    const artistLinks = ${JSON.stringify(page)} === 'discover' ?
      [...new Set([...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href'))
        .filter(href => /^\\/(?:you\\/)?(?:studio|artist-studio|upload)(?:\\/|$)/i.test(href || '')))] : [];
    const markers = {
      feed: '[class*="stream"], [class*="feed"]',
      library: '[class*="library"], [class*="collection"]',
      likes: '[class*="likes"], [class*="collection"]',
      search: '[class*="search"]',
      settings: '[class*="settings"]',
      notifications: '[class*="notification"]',
      messages: '[class*="message"], [class*="inbox"]',
      upload: '[class*="upload"]',
      studio: '[class*="studio"], [class*="Studio"]'
    };
    const marker = ${JSON.stringify(page)} === 'discover' || ${JSON.stringify(page)} === 'profile' ||
      (${JSON.stringify(page)} === 'studio' && location.hostname === 'artists.soundcloud.com' &&
        Boolean(document.querySelector('main, [role="main"]'))) ||
      Boolean(document.body?.querySelector(markers[${JSON.stringify(page)}]));
    const structure = ['upload', 'studio'].includes(${JSON.stringify(page)}) ? {
      bodyChildren: [...document.body.children].slice(0, 15).map(e => [e.tagName, e.className]),
      headings: [...document.querySelectorAll('h1, h2')].slice(0, 8).map(e => [e.tagName, e.className, e.parentElement?.className]),
      shadows: [...document.querySelectorAll('*')].filter(e => e.shadowRoot).slice(0, 12)
        .map(e => [e.tagName, e.className, e.shadowRoot.childElementCount]),
      frames: [...document.querySelectorAll('iframe')].map(e => {
        const box = e.getBoundingClientRect();
        return { className: e.className, width: Math.round(box.width), height: Math.round(box.height) };
      })
    } : undefined;
    return { actual: path, host: location.hostname, lang: document.documentElement.lang,
      loginGate, marker, frames: [...document.querySelectorAll('iframe')].map(frame => {
        try { return new URL(frame.src).hostname; } catch { return 'unknown'; }
      }), visibleFrames: [...document.querySelectorAll('iframe.webiIframe')]
        .filter(e => e.getBoundingClientRect().width > 400 && e.getBoundingClientRect().height > 250)
        .map(e => e.src),
      settingsRoutes, settingsTabs, settingsProbe, profile, artistLinks, structure };
  })()`);
}

async function auditMenu(contents, selector, request = requestAudit) {
  const opened = await contents.executeJavaScript(`(() => {
    const button = document.querySelector(${JSON.stringify(selector)});
    if (!button || !button.getClientRects().length) return false;
    button.click();
    return true;
  })()`);
  if (!opened) return { status: 'control-unavailable' };
  await new Promise(resolve => setTimeout(resolve, 450));
  const audit = await request(contents);
  const links = await contents.executeJavaScript(`[...document.querySelectorAll('a[href]')]
    .map(a => a.href).filter(href => {
      try { const url = new URL(href); return /(^|\\.)soundcloud\\.com$/i.test(url.hostname) &&
        (/^\\/(?:you\\/)?(?:studio|artist-studio|artists)(?:\\/|$)/i.test(url.pathname) ||
          url.hostname === 'artists.soundcloud.com'); } catch { return false; }
    }).slice(0, 8)`);
  await contents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)})?.click()`);
  return audit ? { status: 'audited', ...audit.counts, reasons: audit.reasons, links } :
    { status: 'preload-unavailable' };
}

async function captureRoutes(contents, output) {
  const previous = contents.getURL();
  const selected = process.env.LOCALIZATION_CAPTURE_ROUTES?.split(',').map(value => value.trim());
  const routes = selected ? ROUTES.filter(([page]) => selected.includes(page)) : [...ROUTES];
  const report = [];
  const candidates = [];
  try {
    for (let index = 0; index < routes.length; index++) {
      const [page, route] = routes[index];
      try {
        const destination = route.startsWith('https://') ? route : `https://soundcloud.com${route}`;
        await contents.loadURL(destination);
        await new Promise(resolve => setTimeout(resolve, 3000));
        const info = await pageInfo(contents, page);
        const shellAudit = await requestAudit(contents);
        const webi = ['upload', 'studio'].includes(page) && contents.mainFrame.frames.find(frame => info.visibleFrames.some(src => {
          try { return new URL(src).origin === new URL(frame.url).origin &&
            new URL(src).pathname === new URL(frame.url).pathname; }
          catch { return false; }
        }));
        let frameAudit = null;
        if (webi && await frameLocalization.ensure(contents, webi)) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          frameAudit = await webi.executeJavaScript('window.__cusadeFrameLocale?.audit()').catch(() => null);
        }
        const studioProbe = page === 'studio' && webi ? await webi.executeJavaScript(`(() => {
          const labels = ${JSON.stringify(['Ripubblicazioni', 'Commenti', 'Tracce SoundCloud',
            'Distribuzione', 'Dischi in vinile', 'Statistiche complessive aggiornate ogni giorno.',
            'Come funziona SoundCloud per artisti in ogni fase.', 'Remix "I WANNA SHOW YOU" di San Holo'])};
          return labels.map((label, index) => {
            const element = [...document.querySelectorAll('*')].find(node =>
              [...node.childNodes].some(child => child.nodeType === Node.TEXT_NODE &&
                child.nodeValue.trim() === label));
            const ancestors = [];
            for (let node = element; node && ancestors.length < 7; node = node.parentElement) {
              ancestors.push([node.tagName, node.className]);
            }
            return { index, ancestors, tag: element?.tagName, className: element?.className,
              parentClassName: element?.parentElement?.className,
              grandClassName: element?.parentElement?.parentElement?.className };
          });
        })()`).catch(() => null) : null;
        const audit = webi ? frameAudit : shellAudit;
        if (process.argv.includes('--capture-localization-screenshots') &&
            (route === '/settings' || route === '/upload' || route === '/studio' || route === '/artists')) {
          const name = route.replace(/[^a-z]+/gi, '-').replace(/^-|-$/g, '');
          await fs.writeFile(`/tmp/soundcloud-${name}.png`, (await contents.capturePage()).toPNG());
        }
        let roundTrip;
        if (route === '/settings' && shellAudit) {
          const initial = await contents.executeJavaScript("document.querySelector('h1')?.textContent.includes('Настройки')");
          contents.send(CHANNEL.localizationCaptureBegin);
          await new Promise(resolve => setTimeout(resolve, 350));
          const original = await contents.executeJavaScript("document.querySelector('h1')?.textContent.includes('Impostazioni')");
          contents.send(CHANNEL.localizationCaptureEnd);
          await new Promise(resolve => setTimeout(resolve, 500));
          const resumed = await contents.executeJavaScript("document.querySelector('h1')?.textContent.includes('Настройки')");
          roundTrip = { initial, original, resumed };
        }
        if (route === '/upload' && webi && frameAudit) {
          const initial = await webi.executeJavaScript("document.body.innerText.includes('Загрузите аудиофайлы.')");
          frameLocalization.reset(webi);
          await webi.executeJavaScript('window.__cusadeFrameLocale?.stop()');
          const original = await webi.executeJavaScript("document.body.innerText.includes('Carica i tuoi file audio.')");
          await frameLocalization.ensure(contents, webi);
          await new Promise(resolve => setTimeout(resolve, 1200));
          const resumed = await webi.executeJavaScript("document.body.innerText.includes('Загрузите аудиофайлы.')");
          roundTrip = { initial, original, resumed };
        }
        const status = pageStatus(new URL(destination).pathname, info.actual, info.loginGate, audit,
          audit?.counts?.total || 0, info.marker || Boolean(frameAudit?.counts?.total));
        if (page === 'settings' && status === 'audited') {
          for (const subroute of info.settingsRoutes) {
            if (!routes.some(([, path]) => path === subroute)) routes.push(['settings', subroute]);
          }
        }
        if (page === 'discover' && info.profile && /^\/[a-z0-9_.-]+\/?$/i.test(info.profile) &&
            !routes.some(([name]) => name === 'profile')) routes.push(['profile', info.profile]);
        if (page === 'discover') {
          for (const link of info.artistLinks) {
            if (!routes.some(([, path]) => path === link)) routes.push([link.includes('upload') ? 'upload' : 'studio', link]);
          }
        }
        const menus = page === 'discover' && status === 'audited' ? {
          language: await auditMenu(contents, '.localeSelector__toggle'),
          account: await auditMenu(contents, '.header__userNavButton')
        } : undefined;
        for (const link of menus?.account?.links || []) {
          if (!routes.some(([, path]) => new URL(path, 'https://soundcloud.com').pathname ===
            new URL(link).pathname)) routes.push(['studio', link]);
        }
        report.push({ page, route: page === 'profile' ? '/profile/*' : route,
          actual: page === 'profile' ? '/profile/*' :
            page === 'messages' && info.actual.startsWith('/messages/') ? '/messages/*' : info.actual,
          host: info.host, lang: info.lang, frames: info.frames, marker: info.marker, status,
          ...(webi ? { visibleIframe: true, shell: shellAudit?.counts || null } : {}),
          ...(roundTrip ? { roundTrip } : {}),
          ...(studioProbe ? { studioProbe } : {}),
          ...(page === 'discover' ? { artistLinks: info.artistLinks } : {}),
          ...(menus ? { menus } : {}),
          ...(page === 'settings' ? { settingsTabs: info.settingsTabs } : {}),
          ...(page === 'settings' && route === '/settings' ? { settingsProbe: info.settingsProbe } : {}),
          ...(info.structure ? { structure: info.structure } : {}),
          ...(audit ? { ...audit.counts, reasons: audit.reasons,
            untranslatedItems: audit.untranslatedItems,
            ambiguousItems: audit.ambiguousItems } : {}) });
        if (status === 'audited') candidates.push(...audit.candidates);
      } catch (error) {
        report.push({ page, route: page === 'profile' ? '/profile/*' : route,
          status: 'error', message: error.message });
      }
    }
  } finally {
    if (isSoundCloudUrl(previous) && !contents.isDestroyed()) await contents.loadURL(previous).catch(() => {});
  }
  const unique = [...new Map(candidates.map(item =>
    [`${item.source}\0${item.text}\0${item.page}\0${item.role}`, item])).values()];
  await fs.writeFile(output, unique.map(item => JSON.stringify(item)).join('\n') + '\n');
  await fs.writeFile(`${output}.report.json`, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

module.exports = { captureRoutes, pageStatus, pageInfo, auditMenu, ROUTES };
