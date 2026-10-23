'use strict';

// Presentation only: controls retain their IDs, listeners and persistence logic.
const PANEL_CSS = `
:host { --panel-bg:#191a1c; --panel-text:#ededed; --panel-muted:#a0a2a7; --panel-line:#ffffff12; --panel-card:#202123; --panel-sidebar:#141517; --panel-input:#18191b; --panel-switch:#494b50; --panel-scheme:dark; }
:host([data-theme="light"]) { --panel-bg:#fafaf9; --panel-text:#242424; --panel-muted:#686b70; --panel-line:#00000016; --panel-card:#fff; --panel-sidebar:#f0f0ee; --panel-input:#f7f7f5; --panel-switch:#a2a4a7; --panel-scheme:light; }

* { box-sizing:border-box; }
[hidden] { display:none!important; }
.panel { width:min(860px,calc(100vw - 24px)); height:min(690px,calc(100dvh - 80px)); display:flex; flex-direction:column; overflow:hidden; border:0; border-radius:10px; background:var(--panel-bg); color:var(--panel-text); box-shadow:0 24px 90px #0009; font:14px system-ui,sans-serif; }
.top { display:flex; align-items:center; gap:12px; padding:20px 26px 12px; }
.title { margin:0; font-size:21px; letter-spacing:-.7px; }
.close { margin-left:auto; width:32px; height:32px; border:0; border-radius:6px; background:transparent; color:var(--panel-muted); font:23px system-ui; cursor:pointer; }
.workspace { flex:1; min-height:0; display:grid; grid-template-columns:190px minmax(0,1fr); }
.sidebar::-webkit-scrollbar { display:none; }
.sidebar { scrollbar-width:none; padding:22px 12px; background:transparent; display:flex; flex-direction:column; gap:6px; }
.nav-label { margin:0 12px 12px; color:var(--panel-muted); font-size:10px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; }
.nav-button { display:flex; gap:10px; align-items:center; position:relative; border:0; border-radius:5px; padding:11px 12px; background:transparent; color:var(--panel-muted); font:500 13px system-ui; text-align:left; cursor:pointer; }
.nav-button[aria-current="page"] { background:var(--panel-card); color:var(--panel-text); }
.nav-button::before { content:""; position:absolute; left:0; top:12px; bottom:12px; width:2px; border-radius:2px; background:var(--cusade-accent,#ff5500); opacity:0; transform:scaleY(.4); }
.nav-button[aria-current="page"]::before { opacity:1; transform:scaleY(1); }
.sidebar-note { margin:auto 12px 0; padding-top:24px; color:var(--panel-muted); font-size:11px; line-height:1.6; }
.content { overflow-y:auto; padding:24px; scrollbar-width:thin; scrollbar-color:#42454e transparent; }
.page-title { margin:0 0 7px; font-size:23px; font-weight:600; letter-spacing:-.8px; }
.page-description { margin:0 0 24px; color:var(--panel-muted); font-size:13px; line-height:1.6; }
.section { margin:0 0 26px; padding:0; border:0; background:transparent; }
.section-title { margin:24px 0 8px; font-size:12px; color:var(--panel-muted); letter-spacing:.3px; }
.section > .color-setting { margin-top:10px!important; }
.setting,.color-setting { display:flex; align-items:center; justify-content:space-between; gap:24px; margin:0!important; padding:12px 0; cursor:pointer; }

.setting-name { display:block; font-size:13px; font-weight:550; line-height:1.5; }
.hint { display:block; margin-top:5px; color:var(--panel-muted); font-size:12px; line-height:1.6; }
input[type=checkbox] { appearance:none; flex:none; width:36px; height:21px; margin:0; border:1px solid transparent; border-radius:20px; background:var(--panel-switch); cursor:pointer; position:relative; }
input[type=checkbox]::after { content:''; position:absolute; width:15px; height:15px; top:2px; left:3px; border-radius:50%; background:#fff; }
input[type=checkbox]:checked { background:var(--cusade-accent,#ff5500); border-color:transparent; }
input[type=checkbox]:checked::after { transform:translateX(14px); }
input:disabled,button:disabled,select:disabled { opacity:.45; cursor:default; }
input[type=checkbox]:disabled { opacity:1; }
:where(button,input,select):focus-visible { outline:2px solid var(--cusade-accent,#ff5500); outline-offset:4px; }
.color-control { display:flex; gap:9px; align-items:center; }
input[type=color] { width:36px; height:36px; padding:3px; border:0; border-radius:5px; background:transparent; cursor:pointer; }
.color-value { font:11px ui-monospace,monospace; color:var(--panel-muted); }
.text-input { display:block; width:100%; padding:10px 12px; margin-top:8px; border:0; border-radius:5px; background:var(--panel-card); color:var(--panel-text); font:13px system-ui; color-scheme:var(--panel-scheme); }
.radius-setting { display:grid; grid-template-columns:80px minmax(0,1fr) 36px; gap:12px; align-items:center; margin-top:20px; font-size:12px; }
.radius-setting input { width:100%; accent-color:var(--cusade-accent,#ff5500); }
.radius-setting output { color:var(--panel-muted); font:12px ui-monospace,monospace; text-align:right; }
.check-updates,.insights-restore button { border:0; border-radius:9px; padding:11px 16px; background:var(--cusade-accent,#ff5500); color:white; font:600 12px system-ui; cursor:pointer; margin-top:10px; }
.status { margin:0; padding:0 26px; color:#ffac8a; font-size:12px; }
.status:not(:empty) { padding:12px 26px; border-top:1px solid var(--panel-line); }
.nav-button:hover,.close:hover { background:var(--panel-card); color:var(--panel-text); }
.check-updates:hover,.insights-restore button:hover { filter:brightness(1.1); }
:host(.cusade-animations) .panel { animation:panel-in .28s cubic-bezier(.2,.7,.2,1) both; }
:host(.cusade-animations) .content > section { animation:section-in .24s cubic-bezier(.2,.7,.2,1) both; }
:host(.cusade-animations) :is(.panel,.nav-button,.close,.text-input,input[type=checkbox]) { transition:background-color .2s ease,color .2s ease; }
:host(.cusade-animations) .nav-button::before { transition:opacity .2s ease,transform .2s ease; }
:host(.cusade-animations) .check-updates { transition:filter .16s ease; }
@keyframes section-in { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
:host(.cusade-animations) input[type=checkbox]::after { transition:transform .2s cubic-bezier(.2,.7,.2,1); }
@keyframes panel-in { from { opacity:0; transform:translateY(9px); } to { opacity:1; transform:none; } }
@media(max-width:640px) { .workspace { grid-template-columns:1fr; grid-template-rows:auto minmax(0,1fr); } .sidebar { flex-direction:row; overflow-x:auto; padding:10px; border:0; } .nav-label,.sidebar-note,.nav-icon,.brand-caption { display:none; } .nav-button { white-space:nowrap; padding:10px; } .content { padding:20px 16px; } .top { padding:16px 20px; } .section { padding:0; } .color-setting { flex-wrap:wrap; gap:12px; } }
`;

function organizePanel(shadow, ui, closePanel) {
  const panel = shadow.querySelector('.panel');
  const top = shadow.querySelector('.top');
  const workspace = document.createElement('div');
  workspace.className = 'workspace';
  const nav = document.createElement('nav');
  nav.className = 'sidebar';
  nav.setAttribute('aria-label', ui('Разделы настроек', 'Settings sections'));
  const navLabel = document.createElement('p');
  navLabel.className = 'nav-label';
  navLabel.textContent = ui('Настройки', 'Settings');
  nav.append(navLabel);
  const content = document.createElement('main');
  content.className = 'content';
  const definitions = [
    ['appearance', ui('Оформление', 'Appearance'), ui('Тема, цвета, обложки и анимации.', 'Theme, colors, artwork and animations.'), ['accent-color', 'app-icon-style', 'avatarRadius', 'animations', 'respect-system-motion']],
    ['player', ui('Главная и плеер', 'Home and player'), ui('Элементы страницы и воспроизведение.', 'Page elements and playback.'), ['hide-artist-tools', 'hide-nearby-events', 'block-audio-ads', 'playback-visualization', 'show-your-likes-button']],
    ['companion', ui('Спутник', 'Companion'), ui('Отображение персонажа и звуки.', 'Character visibility and sounds.'), ['companion-enabled']],
    ['discord', 'Discord', ui('Текущий трек в статусе Discord.', 'Current track in your Discord status.'), ['discord-rpc']],
    ['application', ui('Приложение', 'Application'), ui('Запуск, обновления и ваши Insights.', 'Startup, updates and your Insights.'), ['auto-start']]
  ];
  const pages = [];
  for (const [id, title, description, controls] of definitions) {
    const page = document.createElement('section');
    page.id = `settings-${id}`;
    page.setAttribute('aria-labelledby', `heading-${id}`);
    const heading = document.createElement('h2');
    heading.id = `heading-${id}`;
    heading.className = 'page-title';
    heading.textContent = title;
    const intro = document.createElement('p');
    intro.className = 'page-description';
    intro.textContent = description;
    page.append(heading, intro);
    for (const controlId of controls) {
      const control = shadow.getElementById(controlId);
      // Entire groups carry their descriptions and dependent controls along.
      const grouped = ['avatarRadius', 'companion-enabled', 'discord-rpc', 'auto-start'].includes(controlId);
      if (grouped) page.append(control.closest('.section'));
      else {
        const card = document.createElement('div');
        card.className = 'section';
        if (controlId === 'app-icon-style') {
          card.append(shadow.querySelector('label[for="app-icon-style"]'), control);
        } else card.append(control.closest('label'));
        page.append(card);
      }
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav-button';
    button.setAttribute('aria-controls', page.id);
    button.append(document.createTextNode(title));
    button.addEventListener('click', () => selectPage(id));
    nav.append(button);
    content.append(page);
    pages.push({ id, page, button });
  }
  const themeCard = document.createElement('div');
  themeCard.className = 'section';
  const themeLabel = document.createElement('label');
  themeLabel.className = 'setting-name';
  themeLabel.htmlFor = 'panel-theme';
  themeLabel.textContent = ui('Тема настроек', 'Settings theme');
  const themeSelect = document.createElement('select');
  themeSelect.id = 'panel-theme';
  themeSelect.className = 'text-input';
  for (const [value, label] of [['dark', ui('Тёмная', 'Dark')], ['light', ui('Светлая', 'Light')]]) {
    const option = document.createElement('option'); option.value = value; option.textContent = label; themeSelect.append(option);
  }
  themeCard.append(themeLabel, themeSelect);
  pages[0].page.insertBefore(themeCard, pages[0].page.children[2]);
  // Related controls share a surface rather than each becoming a separate card.
  const appearanceCards = [...pages[0].page.querySelectorAll(':scope > .section')];
  for (const card of appearanceCards.slice(1, 3)) { themeCard.append(...card.childNodes); card.remove(); }
  const animationCards = appearanceCards.slice(-2);
  animationCards[0].append(...animationCards[1].childNodes);
  animationCards[1].remove();
  const playerCards = [...pages[1].page.querySelectorAll(':scope > .section')];
  for (const card of playerCards.slice(1)) { playerCards[0].append(...card.childNodes); card.remove(); }
  const appPage = pages.at(-1).page;
  const updates = document.createElement('div');
  updates.className = 'section';
  const updateTitle = document.createElement('h3');
  updateTitle.className = 'section-title';
  updateTitle.textContent = ui('Обновления и Insights', 'Updates and Insights');
  updates.append(updateTitle, shadow.querySelector('.check-updates'), shadow.querySelector('.insights-restore'));
  appPage.append(updates);
  const note = document.createElement('p');
  note.className = 'sidebar-note';
  note.textContent = ui('Изменения сохраняются автоматически.', 'Changes are saved automatically.');
  nav.append(note);
  const status = shadow.querySelector('.status');
  for (const child of [...panel.children]) if (child !== top) child.remove();
  workspace.append(nav, content);
  panel.append(workspace, status);
  function selectPage(id) {
    for (const item of pages) {
      item.page.hidden = item.id !== id;
      if (item.id === id) item.button.setAttribute('aria-current', 'page');
      else item.button.removeAttribute('aria-current');
    }
    content.scrollTop = 0;
  }
  selectPage('appearance');
  shadow.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.stopPropagation(); closePanel(); }
  });
  shadow.querySelector('.close').focus();
}

module.exports = { PANEL_CSS, organizePanel };
