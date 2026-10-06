const { ipcRenderer } = require('electron');

const DEFAULT_ACCENT_COLOR = '#ff5500';
const DEFAULT_DISCORD_CLIENT_ID = '1555593977367887893';
const DEFAULT_RADII = { avatarRadius: 50, trackRadius: 3, albumRadius: 3 };
let panelHost;
let updateHost;
let currentUpdateState;
let hideArtistTools = false;
let hideNearbyEvents = false;
let blockAudioAds = false;
let discordRpc = false;
let discordClientId = DEFAULT_DISCORD_CLIENT_ID;
let autoStart = false;
let startMinimized = false;
let lastDiscordStateKey = '';
let lastDiscordSync = 0;
let accentColor = DEFAULT_ACCENT_COLOR;
let savedAccentColor = DEFAULT_ACCENT_COLOR;
let playbackVisualization = false;
let animations = false;
let respectSystemMotion = false;
// Observed on every use, not cached at load: the preference can change while the app runs.
const systemReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let settingsLoaded = false;
let visualizationHost;
let visualizedTrackUrl = '';
let visualizationPendingTrack;
let visualizationSwitchTimer;
let lastAnimatedBadgeUrl = '';
let playerProgressTarget = null;
let playerProgressObserver = null;
let enterWatcher = null;
let enterIntersection = null;
let localizationWatcher = null;
const pendingEnterElements = new Set();
let likesShuffleHost;
let likesShuffleInProgress = false;
let insightsBanner;
let insightsHost;
let insightsLayout = { location: 'sidebar', index: 0, width: 0, height: 0 };
let insightsHiddenUntil = 0;
let insightsEditMode = false;
let insightsDropZones = [];
let insightsFeedSlot;
let insightsResize;
let insightsDrag;
let suppressInsightsClickUntil = 0;
let insightsMissingSince = 0;
let insightsLayoutSave = Promise.resolve();
let insightPlayback;
let playbackThemeArtwork = null;
let playbackThemeAppliedArtwork = null;
let playbackThemeColor = '#10384c';
let playbackThemeRequest = 0;
const playbackColorCache = new Map();
const playbackBackdropCache = new Map();
const waveformCache = new Map();
let showYourLikesButton = true;
let artworkRadii = { ...DEFAULT_RADII };
let savedArtworkRadii = { ...DEFAULT_RADII };
let appLanguage = 'site';
let languageSavePending = false;
let localizationScheduled = false;
let localizationFullScan = false;
let localizationLastCleanup = 0;
const localizationQueue = new Set();
const translatedText = new Map();
const translatedAttributes = new Map();
const RU_TRANSLATIONS = {
  'Home': 'Главная',
  'Feed': 'Лента',
  'Library': 'Медиатека',
  'Search': 'Поиск',
  'Try Go+': 'Попробовать Go+',
  'Try Artist Pro': 'Попробовать Artist Pro',
  'Artist Studio': 'Студия артиста',
  'Upload': 'Загрузить',
  'Notifications': 'Уведомления',
  'Messages': 'Сообщения',
  'Settings and more': 'Настройки и другое',
  'Profile': 'Профиль',
  'Settings': 'Настройки',
  'Sign out': 'Выйти',
  'More of what you like': 'Ещё из того, что вам нравится',
  'Recently Played': 'Недавно прослушано',
  'Events near you': 'События рядом',
  'Discover with Stations': 'Открывайте музыку через станции',
  'New crew, suggested for you': 'Новые исполнители для вас',
  'Liked By': 'Нравится пользователям',
  'Trending by genre': 'Популярное по жанрам',
  'Artists to watch out for': 'Исполнители, на которых стоит обратить внимание',
  'Artist station': 'Станция исполнителя',
  'Trending': 'Популярное',
  'New!': 'Новое!',
  'NEW TRACKS': 'НОВЫЕ ТРЕКИ',
  'New tracks': 'Новые треки',
  'ARTISTS YOU SHOULD FOLLOW': 'РЕКОМЕНДУЕМ ПОДПИСАТЬСЯ',
  'Artists you should follow': 'Рекомендуем подписаться',
  'LISTENING HISTORY': 'ИСТОРИЯ ПРОСЛУШИВАНИЙ',
  'Listening history': 'История прослушиваний',
  'Go mobile': 'Мобильное приложение',
  'Refresh list': 'Обновить список',
  'View all': 'Показать все',
  'Overview': 'Обзор',
  'Likes': 'Понравившееся',
  'Playlists': 'Плейлисты',
  'Albums': 'Альбомы',
  'Following': 'Подписки',
  'Followers': 'Подписчики',
  'History': 'История',
  'Stations': 'Станции',
  'Tracks': 'Треки',
  'All': 'Все',
  'Discover': 'Открыть музыку',
  'Recommended': 'Рекомендовано',
  'Next up': 'Далее',
  'Clear': 'Очистить',
  'Hide queue': 'Скрыть очередь',
  'Skip to previous': 'Предыдущий трек',
  'Play current': 'Воспроизвести',
  'Pause current': 'Пауза',
  'Skip to next': 'Следующий трек',
  'Shuffle': 'Перемешать',
  'Repeat': 'Повтор',
  'Repeat track': 'Повторять трек',
  'Volume': 'Громкость',
  'Play': 'Воспроизвести',
  'Pause': 'Пауза',
  'Like': 'Нравится',
  'Liked': 'Понравилось',
  'Unlike': 'Убрать отметку «Нравится»',
  'Follow': 'Подписаться',
  'Unfollow': 'Отписаться',
  'More': 'Ещё',
  'Share': 'Поделиться',
  'Repost': 'Репост',
  'Comment': 'Комментарий',
  'Add to playlist': 'Добавить в плейлист',
  'Copy Link': 'Скопировать ссылку',
  'Report': 'Пожаловаться',
  'Cancel': 'Отмена',
  'Close': 'Закрыть',
  'Select your language': 'Выберите язык',
  'Language Picker': 'Выбор языка',
  'Language:': 'Язык:',
  'View all likes': 'Все отметки «Нравится»',
  'View all reposts': 'Все репосты',
  'View all comments': 'Все комментарии',
  'followers': 'подписчиков',
  'tracks': 'треков',
  'plays': 'прослушиваний',
  'Legal': 'Правовая информация',
  'Privacy': 'Конфиденциальность',
  'Cookie Policy': 'Политика cookie',
  'Cookie Manager': 'Настройки cookie',
  'Artist Resources': 'Ресурсы для артистов',
  'Newsroom': 'Новости',
  'Topics': 'Темы',
  'Charts': 'Чарты',
  'Transparency Reports': 'Отчёты о прозрачности'
};
Object.assign(RU_TRANSLATIONS, {
  'Início': 'Главная',
  'Biblioteca': 'Медиатека',
  'Pesquisar': 'Поиск',
  'Experimente Go+': 'Попробовать Go+',
  'Experimente Artist Pro': 'Попробовать Artist Pro',
  'Estúdio de Artista': 'Студия артиста',
  'Notificações': 'Уведомления',
  'Mensagens': 'Сообщения',
  'Configurações e mais': 'Настройки и другое',
  'Mais do que você gosta': 'Ещё из того, что вам нравится',
  'Recém Reproduzido': 'Недавно прослушано',
  'Eventos perto de você': 'События рядом',
  'Descubra com Estações': 'Открывайте музыку через станции',
  'Nova galera, sugestão para você': 'Новые исполнители для вас',
  'Curtida Por': 'Нравится пользователям',
  'Tendências por gênero': 'Популярное по жанрам',
  'Artistas para ficar de olho': 'Исполнители, на которых стоит обратить внимание',
  'Novas faixas': 'Новые треки',
  'Artistas que você deveria seguir': 'Рекомендуем подписаться',
  'Histórico de reprodução': 'История прослушиваний',
  'Baixe o app': 'Мобильное приложение',
  'Atualizar lista': 'Обновить список',
  'Exibir tudo': 'Показать все',
  'Seguir': 'Подписаться',
  'Seguindo': 'Подписки',
  'Curtidas': 'Понравившееся',
  'Curtir': 'Нравится',
  'Curtido': 'Понравилось',
  'Mais': 'Ещё',
  'Tocar': 'Воспроизвести',
  'Pausar': 'Пауза',
  'Cancelar': 'Отмена',
  'Próxima': 'Далее',
  'Compartilhar': 'Поделиться',
  'Repostar': 'Репост',
  'Selecione seu idioma': 'Выберите язык',
  'Idioma:': 'Язык:',
  'seguidores': 'подписчиков',
  'faixas': 'треков',
  'reproduções': 'прослушиваний',
  'Recém-reproduzido': 'Недавно прослушано',
  'Todas': 'Все',
  'Álbuns': 'Альбомы',
  'Estações': 'Станции',
  'Estação do artista': 'Станция исполнителя',
  'Procurar playlists do momento': 'Найти популярные плейлисты',
  'Ouça as faixas que você curtiu:': 'Слушайте понравившиеся треки:',
  'Exibir': 'Вид',
  'Filtro': 'Фильтр',
  'Emblemas': 'Плитки',
  'Lista': 'Список',
  'Deixar de curtir': 'Убрать отметку «Нравится»',
  'Deixar de seguir': 'Отписаться',
  'Este é seu feed': 'Это ваша лента',
  'Siga seus artistas, gravadoras e amigos favoritos na SoundCloud': 'Подпишитесь на любимых артистов, лейблы и друзей в SoundCloud',
  'e acompanhe tudo que eles publicam.': 'и следите за их публикациями.',
  'Ouça as últimas publicações de quem você segue:': 'Последние публикации ваших подписок:',
  'Republicações': 'Репосты',
  'Ver todos os comentários': 'Все комментарии',
  'Escreva um comentário': 'Напишите комментарий',
  'Enviar': 'Отправить',
  'Copiar link': 'Скопировать ссылку',
  'Republicar': 'Репост',
  'Ocultar esta mensagem': 'Скрыть сообщение',
  'Excluir publicação / Editar republicação': 'Удалить публикацию / изменить репост',
  'Aviso Legal': 'Правовая информация',
  'Privacidade': 'Конфиденциальность',
  'Política de Cookies': 'Политика cookie',
  'Gerenciador de cookie': 'Настройки cookie',
  'Recursos de Artista': 'Ресурсы для артистов',
  'Sala de imprensa': 'Новости',
  'Tópicos': 'Темы',
  'Paradas': 'Чарты',
  'Relatórios de Transparência': 'Отчёты о прозрачности',
  'Verträge hier kündigen': 'Отменить договор',
  'Vertrag widerrufen': 'Отозвать договор'
});

function ui(ru, en) {
  return appLanguage === 'ru' ? ru : en;
}

function russianCount(number, singular, few, many) {
  const value = Number(number.replace(/[,.\s]/g, ''));
  if (!Number.isFinite(value)) return many;
  if (value % 100 >= 11 && value % 100 <= 14) return many;
  if (value % 10 === 1) return singular;
  if (value % 10 >= 2 && value % 10 <= 4) return few;
  return many;
}

function translatedValue(value, element) {
  if (element?.matches?.('.localeSelector_language')) return 'Русский';
  if (element?.closest?.('.localeSelector') && value.endsWith(':')) return 'Язык:';
  if (element?.closest?.('.header__navMenuItem')) {
    const href = element.closest('.header__navMenuItem').getAttribute('href');
    if (href === '/' || href === '/discover') return 'Главная';
    if (href === '/feed') return 'Лента';
    if (href === '/you/library') return 'Медиатека';
  }
  if (element?.closest?.('.sidebarHeader__actualTitle')) {
    const module = element.closest('.sidebarModule');
    if (module?.classList.contains('artistShortcutsModule')) return 'Новые треки';
    if (module?.classList.contains('whoToFollowModule')) return 'Рекомендуем подписаться';
    if (module?.classList.contains('historyModule')) return 'История прослушиваний';
    if (module?.classList.contains('mobileApps')) return 'Мобильное приложение';
    if (module?.classList.contains('likesModule')) {
      const count = value.match(/[\d.,]+/)?.[0];
      if (count) return `Понравилось: ${count}`;
    }
  }
  if (Object.hasOwn(RU_TRANSLATIONS, value)) return RU_TRANSLATIONS[value];
  let match = value.match(/^(\d[\d,.]*) LIKES$/);
  if (match) return `ПОНРАВИЛОСЬ: ${match[1]}`;
  match = value.match(/^(\d[\d,.]*) (likes|curtidas)$/);
  if (match) return `Понравилось: ${match[1]}`;
  match = value.match(/^(?:Mixed for|Mixado para) (.+)$/);
  if (match) return `Микс для ${match[1]}`;
  match = value.match(/^Criado para (.+)$/);
  if (match) return `Создано для ${match[1]}`;
  match = value.match(/^(\d[\d,.]*) (followers|tracks|plays|seguidores|faixas|reproduções)$/);
  if (match) {
    const forms = {
      followers: ['подписчик', 'подписчика', 'подписчиков'],
      seguidores: ['подписчик', 'подписчика', 'подписчиков'],
      tracks: ['трек', 'трека', 'треков'],
      faixas: ['трек', 'трека', 'треков'],
      plays: ['прослушивание', 'прослушивания', 'прослушиваний'],
      reproduções: ['прослушивание', 'прослушивания', 'прослушиваний']
    };
    return `${match[1]} ${russianCount(match[1], ...forms[match[2]])}`;
  }
  if (value === '1 seguidor') return '1 подписчик';
  match = value.match(/^(?:Follow|Seguir)(.+)$/);
  if (match) return `Подписаться на ${match[1]}`;
  match = value.match(/^(?:Unfollow|Deixar de seguir)(.+)$/);
  if (match) return `Отписаться от ${match[1]}`;
  match = value.match(/^(Publicado|Republicado) há (\d+) horas?$/);
  if (match) return `${match[1] === 'Republicado' ? 'Репост' : 'Опубликовано'} ${match[2]} ч. назад`;
  match = value.match(/^há (\d+) horas?$/);
  if (match) return `${match[1]} ч. назад`;
  match = value.match(/^(.*\S)\s+republicou uma faixa$/);
  if (match) return `${match[1]} сделал репост трека`;
  if (value === 'republicou uma faixa') return 'сделал репост трека';
  if (value === 'postou uma faixa') return 'опубликовал трек';
  return null;
}

function isInterfaceElement(element) {
  if (!element || element.closest('script, style, textarea, [contenteditable], #cusade-panel-host, #cusade-insights-host, .cusade-insights-banner, .cusade-insights-editbar, .cusade-insights-dropzone, .cusade-visualization, .cusade-likes-shuffle')) return false;
  if (element.closest('.playableTile, .soundTitle__title, .soundTitle__username, .userBadge__username, .trackItem__title, .playbackSoundBadge__titleLink, .playbackSoundBadge__lightLink, .commentItem, .searchItem, .fullHero__title, .sound__title, .activity__user, .profileHeaderInfo__userName')) {
    return element.matches('button, .sc-button') && !element.matches('.artistShortcutTile__button');
  }
  if (element.closest('.stream a[href]') && !element.closest('.stream__title, .commentForm, .sc-ministats')) return false;
  return Boolean(element.closest('.header, .streamSidebar, .playControls, [data-test-id="home"], .collection, .localeSelectorContent, .footer, .footer__localeSelector, .profileMenu, .moreMenu, .modal, .l-listen, .l-main'));
}

function translateTextNode(node) {
  const element = node.parentElement;
  if (!isInterfaceElement(element)) return;
  const current = node.nodeValue;
  const prior = translatedText.get(node);
  if (prior?.translated === current) return;
  const key = current.trim();
  const translation = translatedValue(key.replace(/\s+/g, ' '), element);
  if (!translation) {
    translatedText.delete(node);
    return;
  }
  const translated = current.replace(key, translation);
  if (translated === current) return;
  translatedText.set(node, { original: current, translated });
  node.nodeValue = translated;
}

function translateAttributes(element) {
  if (!isInterfaceElement(element) || element.matches('.soundTitle__title, .userBadge__usernameLink, .playbackSoundBadge__titleLink')) return;
  for (const name of ['title', 'aria-label', 'placeholder']) {
    if (!element.hasAttribute(name)) continue;
    const current = element.getAttribute(name);
    const prior = translatedAttributes.get(element)?.get(name);
    if (prior?.translated === current) continue;
    const translation = translatedValue(current, element);
    if (!translation || translation === current) continue;
    if (!translatedAttributes.has(element)) translatedAttributes.set(element, new Map());
    translatedAttributes.get(element).set(name, { original: current, translated: translation });
    element.setAttribute(name, translation);
  }
}

function translateSite() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) translateTextNode(walker.currentNode);
  for (const element of document.querySelectorAll('[title], [aria-label], [placeholder]')) {
    translateAttributes(element);
  }
  for (const [node] of translatedText) if (!node.isConnected) translatedText.delete(node);
  for (const [element] of translatedAttributes) if (!element.isConnected) translatedAttributes.delete(element);
}

function translateAddedNode(root) {
  if (!root.isConnected) return;
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  if (root.hasAttribute('title') || root.hasAttribute('aria-label') || root.hasAttribute('placeholder')) {
    translateAttributes(root);
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
    else if (node.hasAttribute('title') || node.hasAttribute('aria-label') || node.hasAttribute('placeholder')) {
      translateAttributes(node);
    }
  }
}

function restoreSiteLanguage() {
  for (const [node, prior] of translatedText) {
    if (node.isConnected && node.nodeValue === prior.translated) node.nodeValue = prior.original;
  }
  translatedText.clear();
  for (const [element, attributes] of translatedAttributes) {
    if (!element.isConnected) continue;
    for (const [name, prior] of attributes) {
      if (element.getAttribute(name) === prior.translated) element.setAttribute(name, prior.original);
    }
  }
  translatedAttributes.clear();
}

function syncLanguageMenu() {
  const list = document.querySelector('.localeSelectorContent ul');
  if (!list || list.querySelector('[data-testid="language-pick-ru-cusade"]')) return;
  const example = list.querySelector('li');
  if (!example) return;
  const item = document.createElement('li');
  item.className = example.className;
  item.setAttribute('value', 'ru');
  const button = document.createElement('button');
  button.className = example.querySelector('button')?.className || '';
  button.type = 'button';
  button.dataset.testid = 'language-pick-ru-cusade';
  button.textContent = 'Русский';
  item.appendChild(button);
  list.appendChild(item);
}

// soundcloud.com mutates constantly, so the observer only asks for text and
// attribute mutations while the site is actually translated. The Russian entry
// in SoundCloud's own language menu still needs child insertions, so the
// observer stays connected with a cheaper option set.
function updateLocalizationWatcher() {
  const options = appLanguage === 'ru'
    ? {
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['title', 'aria-label', 'placeholder'],
      subtree: true
    }
    : { childList: true, subtree: true };
  if (!localizationWatcher) localizationWatcher = new MutationObserver(scheduleLocalization);
  if (document.body) localizationWatcher.observe(document.body, options);
}

function scheduleLocalization(mutations) {
  if (Array.isArray(mutations)) {
    if (appLanguage === 'ru') {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) localizationQueue.add(node);
        } else localizationQueue.add(mutation.target);
      }
    }
  } else localizationFullScan = true;
  if (localizationScheduled) return;
  localizationScheduled = true;
  requestAnimationFrame(() => {
    localizationScheduled = false;
    syncLanguageMenu();
    if (appLanguage === 'ru') {
      if (localizationFullScan) translateSite();
      else for (const node of localizationQueue) translateAddedNode(node);
      if (Date.now() - localizationLastCleanup > 30000) {
        for (const [node] of translatedText) if (!node.isConnected) translatedText.delete(node);
        for (const [element] of translatedAttributes) if (!element.isConnected) translatedAttributes.delete(element);
        localizationLastCleanup = Date.now();
      }
    }
    localizationFullScan = false;
    localizationQueue.clear();
  });
}

function refreshLocalizedUi() {
  const likesButton = likesShuffleHost?.querySelector('.cusade-likes-shuffle__button');
  if (likesButton) {
    likesButton.querySelector('span').textContent = ui('Мои лайки', 'Your likes');
    likesButton.title = ui('Слушать понравившиеся треки в случайном порядке', 'Play your liked tracks in random order');
  }
  if (visualizationHost) {
    visualizationHost.setAttribute('aria-label', ui('Визуализация воспроизведения', 'Playback visualization'));
    visualizationHost.querySelector('.cusade-visualization__wave')?.setAttribute('aria-label', ui('Перемотать трек', 'Seek track'));
    visualizationHost.querySelector('.cusade-visualization__art')?.setAttribute('alt', ui('Обложка трека', 'Track artwork'));
  }
  if (panelHost) {
    closePanel();
    togglePanel();
  }
}

async function setAppLanguage(language) {
  await ipcRenderer.invoke('cusade:set-app-language', language);
  appLanguage = language;
  updateLocalizationWatcher();
  if (language === 'ru') scheduleLocalization();
  else restoreSiteLanguage();
  refreshLocalizedUi();
}

function releaseRussianTranslation() {
  if (appLanguage !== 'ru') return;
  appLanguage = 'site';
  updateLocalizationWatcher();
  restoreSiteLanguage();
  refreshLocalizedUi();
  ipcRenderer.invoke('cusade:set-app-language', 'site').catch(error => {
    appLanguage = 'ru';
    updateLocalizationWatcher();
    scheduleLocalization();
    refreshLocalizedUi();
    console.error('Could not save cusade language:', error);
  });
}

document.addEventListener('pointerdown', event => {
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  const button = target?.closest('.localeSelectorContent button[data-testid^="language-pick-"]');
  if (button && button.dataset.testid !== 'language-pick-ru-cusade') releaseRussianTranslation();
}, true);

document.addEventListener('click', async event => {
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  const button = target?.closest('.localeSelectorContent button[data-testid^="language-pick-"]');
  if (!button) return;
  const russian = button.dataset.testid === 'language-pick-ru-cusade';
  if (!russian) {
    releaseRussianTranslation();
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  if (languageSavePending) return;
  languageSavePending = true;
  try {
    await setAppLanguage('ru');
    document.querySelector('.localeSelector__cancel')?.click();
  } catch (error) {
    console.error('Could not save cusade language:', error);
  } finally {
    languageSavePending = false;
  }
}, true);

function applyArtistToolsVisibility() {
  document.documentElement?.classList.toggle('cusade-hide-artist-tools', hideArtistTools);
}

function applyNearbyEventsVisibility() {
  document.documentElement?.classList.toggle('cusade-hide-nearby-events', hideNearbyEvents);
}

function applyAccentColor() {
  const root = document.documentElement;
  if (!root) return;
  const channels = accentColor.match(/[0-9a-f]{2}/gi).map(value => parseInt(value, 16));
  root.style.setProperty('--cusade-accent', accentColor);
  root.style.setProperty('--cusade-accent-rgb', channels.join(','));
  root.classList.toggle('cusade-custom-accent', accentColor !== DEFAULT_ACCENT_COLOR);
  updatePanelColor();
}

function applyArtworkRadii() {
  const root = document.documentElement;
  if (!root) return;
  syncArtworkPage();
  for (const [key, value] of Object.entries(artworkRadii)) {
    root.style.setProperty(`--cusade-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`, `${value}%`);
  }
  updateArtworkRadiusControls();
}

// Single source of truth for every cusade animation. The page CSS reacts to the
// 'cusade-animations' class on the document and on each cusade host, while the
// JavaScript paths ask motionActive() directly, so styles, WAAPI effects, the
// visualization and the panels can never disagree about whether motion is on.
function motionActive() {
  return animations && (!respectSystemMotion || !systemReducedMotion.matches);
}

function applyMotion() {
  const active = motionActive();
  document.documentElement?.classList.toggle('cusade-animations', active);
  panelHost?.classList.toggle('cusade-animations', active);
  insightsHost?.classList.toggle('cusade-animations', active);
  updateHost?.classList.toggle('cusade-animations', active);
  if (!active) {
    // Never leave a half finished effect on screen when motion is switched off.
    finishPlaybackSwitch();
    visualizationHost?.querySelector('.cusade-visualization__art--changing')
      ?.classList.remove('cusade-visualization__art--changing');
    for (const animation of document.getAnimations()) {
      if (animation.id === 'cusade-badge-enter') animation.cancel();
    }
  }
  updateEnterWatcher();
  updateRouteTransition();
  updateSystemMotionHint();
}

const ENTER_TARGETS = '.soundList__item, .searchList__item, .trackList__item,' +
  ' .usersList__item, .soundBadgeList__item, .commentBadgeList__item,' +
  ' .userStreamItem, .playableTile';

function watchEnterTarget(element) {
  if (pendingEnterElements.has(element)) return;
  pendingEnterElements.add(element);
  enterIntersection ??= new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('cusade-enter-target');
      enterIntersection.unobserve(entry.target);
      pendingEnterElements.delete(entry.target);
    }
  }, { rootMargin: '160px 0px' });
  enterIntersection.observe(element);
}

function queueEnterTargets(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  if (node.matches(ENTER_TARGETS)) watchEnterTarget(node);
  for (const nested of node.querySelectorAll(ENTER_TARGETS)) watchEnterTarget(nested);
}

// Feed items fade in through cusade-content-enter. The class is only put on rows
// that actually reach the viewport: without this, a single page render starts
// one animation per inserted row, and Chromium promotes a compositor layer for
// each of them, which is what made long feeds stutter while scrolling.
function updateEnterWatcher() {
  const active = motionActive();
  document.documentElement?.classList.toggle('cusade-enter', active);
  if (active) {
    if (!enterWatcher) {
      enterWatcher = new MutationObserver(mutations => {
        if (!motionActive()) return;
        for (const mutation of mutations) {
          if (mutation.type !== 'childList') continue;
          for (const node of mutation.addedNodes) queueEnterTargets(node);
        }
      });
    }
    if (document.body) enterWatcher.observe(document.body, { childList: true, subtree: true });
    return;
  }
  enterWatcher?.disconnect();
  for (const element of pendingEnterElements) element.classList.remove('cusade-enter-target');
  pendingEnterElements.clear();
}

// Page transitions. SoundCloud routes inside its SPA with history.pushState, so
// a route change is caught there; a full page load only gets the intro reveal.
// Both run on two fixed layers that move opacity and scaleX, which is why a
// transition stays cheap even while the new page renders hundreds of rows.
let routeHost = null;
let routeWatchReady = false;
let routeLastUrl = '';
let routeVeilTimer = 0;
let routeSweepTimer = 0;
const ROUTE_INTRO_WINDOW_MS = 3000;

// The reveal belongs to the first page the app opens, not to the moment someone
// flips the setting in the panel: a veil that appears because a panel was opened
// reads as a glitch. The flag is set only around the settings that arrive at
// startup, so the reveal survives a slow settings round trip, while a deliberate
// toggle never triggers it.
let routeIntroPending = false;

function runRouteTransition() {
  if (!routeHost?.isConnected) return;
  routeHost.classList.remove('cusade-route--veil', 'cusade-route--sweep');
  // Restart the sweep from scaleX(0): without a forced reflow between the class
  // changes the bar has no previous value to animate from and snaps to full width.
  void routeHost.offsetWidth;
  routeHost.classList.add('cusade-route--sweep', 'cusade-route--veil');
  clearTimeout(routeVeilTimer);
  routeVeilTimer = setTimeout(() => routeHost?.classList.remove('cusade-route--veil'), 220);
  clearTimeout(routeSweepTimer);
  routeSweepTimer = setTimeout(() => routeHost?.classList.remove('cusade-route--sweep'), 900);
}

function onRouteChanged() {
  if (!motionActive() || !routeHost?.isConnected) return;
  const url = location.href;
  // SoundCloud pushes the same URL for scroll restoration; a veil for that
  // would flicker on every scroll.
  if (url === routeLastUrl) return;
  routeLastUrl = url;
  runRouteTransition();
}

function installRouteWatch() {
  if (routeWatchReady) return;
  routeWatchReady = true;
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    if (typeof original !== 'function' || original.cusade === true) continue;
    const patched = function (...args) {
      const result = original.apply(this, args);
      queueMicrotask(onRouteChanged);
      return result;
    };
    patched.cusade = true;
    history[method] = patched;
  }
  addEventListener('popstate', onRouteChanged);
}

function updateRouteTransition() {
  if (!motionActive()) {
    clearTimeout(routeVeilTimer);
    clearTimeout(routeSweepTimer);
    routeHost?.remove();
    routeHost = null;
    return;
  }
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', updateRouteTransition, { once: true });
    return;
  }
  installRouteWatch();
  if (routeHost?.isConnected) return;
  routeHost = document.createElement('div');
  routeHost.className = 'cusade-route';
  routeHost.setAttribute('aria-hidden', 'true');
  // The bar goes in first so the accent line stays above the veil.
  routeHost.innerHTML = '<span class="cusade-route__bar"></span>' +
    '<span class="cusade-route__veil"></span>';
  document.body.appendChild(routeHost);
  routeLastUrl = location.href;
  // The reveal plays when motion first turns on during startup, or very early in
  // a document (the second clause covers the case where the body was not ready
  // yet and the work was deferred to DOMContentLoaded).
  if (routeIntroPending || performance.now() < ROUTE_INTRO_WINDOW_MS) {
    routeHost.classList.add('cusade-route--intro');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      routeHost?.classList.remove('cusade-route--intro');
    }));
  }
}

function syncArtworkPage() {
  document.documentElement?.classList.toggle('cusade-set-page', /(^|\/)sets\//.test(location.pathname));
}

function initializeSettings() {
  const style = document.createElement('style');
  style.id = 'cusade-page-style';
  style.textContent = `
    html.cusade-hide-artist-tools .newUploadBanner,
    html.cusade-hide-artist-tools .banner,
    html.cusade-hide-artist-tools .sidebarModule:has(iframe[title="Artist tools" i], iframe[src*="/n/embeds/credit-tracker"]) {
      display: none !important;
    }
    html.cusade-hide-nearby-events .mixedModularHome__item:has(.velvetCakeModule > .velvetCakeModule__iframe[src^="https://artist-events.soundcloud.com/banner"]),
    html.cusade-hide-nearby-events .velvetCakeModule:has(> .velvetCakeModule__iframe[src^="https://artist-events.soundcloud.com/banner"]) {
      display: none !important;
    }
    html.cusade-custom-accent body {
      --special-color: var(--cusade-accent) !important;
      --font-special-color: var(--cusade-accent) !important;
      --special-rgb: var(--cusade-accent-rgb) !important;
      --button-special-background-color: var(--cusade-accent) !important;
      --button-secondary-selected-font-color: var(--cusade-accent) !important;
      --button-secondary-selected-active-font-color: var(--cusade-accent) !important;
      --button-secondary-selected-hover-font-color: rgba(var(--cusade-accent-rgb), 0.4) !important;
      --button-tertiary-selected-font-color: var(--cusade-accent) !important;
      --button-tertiary-selected-active-font-color: var(--cusade-accent) !important;
      --button-tertiary-selected-hover-font-color: rgba(var(--cusade-accent-rgb), 0.4) !important;
      --checkbox-checked-background-color: var(--cusade-accent) !important;
      --checkbox-checked-border-color: var(--cusade-accent) !important;
      --toggle-on-body-color: var(--cusade-accent) !important;
      --toggle-on-body-hover-color: var(--cusade-accent) !important;
    }
    .image.image__rounded,
    .image.image__rounded .image__full {
      border-radius: var(--cusade-avatar-radius, 50%) !important;
    }
    .image.sc-artwork:not(.image__rounded),
    .image.sc-artwork:not(.image__rounded) .image__full,
    .playableTile__image,
    .playableTile__imageOverlay,
    .cusade-visualization__art {
      border-radius: var(--cusade-track-radius, 3%) !important;
    }
    .playableTile:has(.playableTile__artworkLink[href*="/sets/"]) .image.sc-artwork,
    .playableTile:has(.playableTile__artworkLink[href*="/sets/"]) .image.sc-artwork .image__full,
    .playableTile:has(.playableTile__artworkLink[href*="/sets/"]) .playableTile__image,
    .playableTile:has(.playableTile__artworkLink[href*="/sets/"]) .playableTile__imageOverlay,
    html.cusade-set-page .listenArtworkWrapper__artwork .image.sc-artwork,
    html.cusade-set-page .listenArtworkWrapper__artwork .image.sc-artwork .image__full {
      border-radius: var(--cusade-album-radius, 3%) !important;
    }
    .cusade-visualization {
      position: relative; overflow: hidden; display: flex; gap: 24px;
      min-height: 330px; margin: 16px 16px 8px; padding: 24px;
      border-radius: 16px; background: #10384c; color: #fff;
      font-family: system-ui, sans-serif; isolation: isolate;
    }
    /* The theme cross-fade of these two cards lives in the card rule further
       down: it has to share one transition declaration with the hover effects,
       otherwise the later rule wins as a whole and the fade is lost. */
    .cusade-track-backdrop {
      position: absolute; inset: 0; z-index: -2; pointer-events: none;
      background-position: center; background-size: cover; background-repeat: no-repeat;
      opacity: 0;
    }
    html.cusade-animations .cusade-track-backdrop { transition: opacity 900ms cubic-bezier(.3,.62,.36,1); }
    .cusade-track-backdrop--visible { opacity: .8; }
    .cusade-visualization::after, .cusade-insights-banner::after {
      content: ''; position: absolute; inset: 0; z-index: -1;
      background: linear-gradient(100deg, #000b 5%, #0008 60%, #0005);
      pointer-events: none;
    }
    .cusade-visualization__main { display: flex; flex: 1; min-width: 0; flex-direction: column; }
    .cusade-visualization__heading { display: flex; align-items: center; gap: 16px; min-width: 0; }
    .cusade-visualization__play {
      flex: none; width: 64px; height: 64px; border: 1px solid #ffffff55;
      border-radius: 50%; background: #ffffff18; color: #fff; cursor: pointer;
      font: 30px system-ui;
    }
    .cusade-visualization__play:hover { background: #ffffff35; }
    .cusade-visualization__meta { min-width: 0; }
    .cusade-visualization__title { display: block; overflow: hidden; color: #fff;
      font-size: clamp(18px, 2vw, 27px); font-weight: 700; text-overflow: ellipsis;
      white-space: nowrap; text-decoration: none; }
    .cusade-visualization__artist { display: block; margin-top: 5px; color: #b9d9e8;
      font-size: 14px; text-decoration: none; }
    .cusade-visualization__title:hover, .cusade-visualization__artist:hover { text-decoration: underline; }
    .cusade-visualization__wave { position: relative; width: 100%; height: 108px;
      margin-top: auto; border: 0; padding: 0; background: transparent; cursor: pointer; }
    .cusade-visualization__bars { position: absolute; inset: 0; display: flex;
      align-items: center; gap: 2px; overflow: hidden; }
    /* Bars fill the strip and are scaled from its centre, which is visually the
       same as a centred height percentage but never needs a re-layout. */
    .cusade-visualization__bars span { flex: 1; min-width: 1px; height: 100%;
      transform: scaleY(.3); background: #b9e6f4; }
    .cusade-visualization__bars--base { opacity: .4; }
    .cusade-visualization__bars--played { clip-path: inset(0 calc(100% - var(--cusade-progress, 0%)) 0 0); }
    .cusade-visualization__times { display: flex; justify-content: space-between; margin-top: 4px;
      color: #e4f4fa; font-size: 12px; }
    .cusade-visualization__art { flex: none; width: min(30%, 280px); aspect-ratio: 1;
      align-self: center; border-radius: 12px; object-fit: cover; box-shadow: 0 12px 30px #0005; }
    html.cusade-animations .cusade-visualization :is(.cusade-visualization__meta,
      .cusade-visualization__art, .cusade-visualization__wave, .cusade-visualization__times) {
      transition: opacity 200ms ease, transform 200ms ease;
    }
    html.cusade-animations .cusade-visualization--switching
      :is(.cusade-visualization__meta, .cusade-visualization__art,
        .cusade-visualization__wave, .cusade-visualization__times),
    html.cusade-animations .cusade-visualization__art--changing {
      opacity: 0;
      transform: translateY(5px);
    }
    html.cusade-animations .cusade-visualization__bars--played {
      transition: clip-path 360ms ease;
    }
    /* The bars themselves carry no transition on purpose: a track switch redraws
       all of them at once, so a height transition would only add 320 layout passes. */
    /* Neutral state for the track switch effects. The switching classes are only
       added while motionActive() is true, so these rules normally never match;
       they exist so that turning the setting off mid-transition cannot leave a
       hidden cover or a moved caption behind. */
    html:not(.cusade-animations) .cusade-visualization
      :is(.cusade-visualization__meta, .cusade-visualization__art,
        .cusade-visualization__wave, .cusade-visualization__times) {
      opacity: 1;
      transform: none;
    }
    @media (max-width: 900px) {
      .cusade-visualization { min-height: 260px; }
      .cusade-visualization__art { width: 32%; }
    }
    @media (max-width: 650px) {
      .cusade-visualization { gap: 12px; padding: 16px; min-height: 220px; }
      .cusade-visualization__art { width: 34%; }
      .cusade-visualization__play { width: 44px; height: 44px; font-size: 21px; }
    }
    .cusade-likes-shuffle { padding: 0 16px 16px; }
    .cusade-likes-shuffle__button {
      display: flex; width: 100%; align-items: center; justify-content: space-between;
      gap: 12px; padding: 10px 0;
      border: 0; border-bottom: 1px solid color-mix(in srgb, var(--font-primary-color, #fff) 15%, transparent);
      border-radius: 0; background: transparent;
      color: var(--font-primary-color, #fff);
      font: 600 12px system-ui, sans-serif; text-align: left; text-transform: uppercase; cursor: pointer;
    }
    .cusade-likes-shuffle__button:hover {
      color: var(--font-special-color, #ff5500);
    }
    .cusade-likes-shuffle__button:disabled { cursor: wait; opacity: .7; }
    .cusade-likes-shuffle__button svg { flex: none; width: 19px; height: 19px;
      color: var(--font-secondary-color, #999); fill: currentColor; }
    .cusade-likes-shuffle__button:hover svg { color: currentColor; }
    .cusade-likes-shuffle__status { margin: 7px 0 0; color: var(--font-error-color, #ff9165);
      font: 12px system-ui, sans-serif; }
    .cusade-likes-shuffle__status:empty { display: none; }
    .cusade-likes-transition { position: fixed; inset: 0; z-index: 2147483646;
      width: 100vw; height: 100vh; cursor: progress; }
    .cusade-likes-transition img { display: block; width: 100%; height: 100%; }
    .cusade-insights-banner { position: relative; box-sizing: border-box; display: flex; flex-direction: column;
      justify-content: space-between; gap: 12px; min-height: 142px; width: 100%; max-width: 100%;
      margin: 0 0 24px; padding: 18px; border-radius: 14px;
      background: #10384c; color: #fff; font: 14px system-ui, sans-serif;
      box-shadow: 0 12px 32px #0002; isolation: isolate; overflow: hidden; }
    .cusade-insights-banner__top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
    .cusade-insights-banner strong { display: block; font-size: 19px; line-height: 1.25; }
    .cusade-insights-banner p { margin: 7px 0 0; color: #d8e8eb; font-size: 12px; line-height: 1.4; }
    .cusade-insights-banner button { box-sizing: border-box; border: 0; cursor: pointer; }
    .cusade-insights-banner__open { align-self: flex-start; padding: 9px 15px; border-radius: 999px;
      background: #fff; color: #452044; font: 700 12px system-ui; }
    .cusade-insights-banner__open:hover { background: #ffe8f3; }
    .cusade-insights-banner__more { flex: none; width: 30px; height: 28px; padding: 0;
      border-radius: 7px; background: #ffffff2b; color: #fff; font: 700 20px system-ui; line-height: 20px; }
    .cusade-insights-banner__more:hover { background: #ffffff45; }
    .cusade-insights-banner__menu { position: absolute; top: 48px; right: 12px; z-index: 2;
      min-width: 180px; padding: 5px; border: 1px solid #ffffff35; border-radius: 10px;
      background: #2d1a32; box-shadow: 0 12px 28px #0008; }
    .cusade-insights-banner__menu[hidden] { display: none; }
    .cusade-insights-banner__menu button { display: block; width: 100%; padding: 9px 10px;
      border-radius: 6px; background: transparent; color: #fff; font: 13px system-ui; text-align: left; }
    .cusade-insights-banner__menu button:hover { background: #ffffff25; }
    .cusade-insights-banner__resize { display: none; }
    html.cusade-insights-editing .cusade-insights-banner { outline: 2px dashed #ffba90;
      outline-offset: 3px; cursor: grab; touch-action: none; }
    html.cusade-insights-dragging, html.cusade-insights-dragging * { user-select: none !important; }
    html.cusade-insights-dragging .cusade-insights-banner { cursor: grabbing; opacity: .45; }
    .cusade-insights-drag-ghost { position: fixed !important; z-index: 2147483646 !important;
      margin: 0 !important; pointer-events: none; opacity: .92; box-shadow: 0 25px 55px #0008; }
    html.cusade-insights-editing .cusade-insights-banner__resize { position: absolute; display: block;
      right: 1px; bottom: 1px; width: 27px; height: 27px; border-radius: 0 0 13px 0;
      background: #ffffff45; cursor: nwse-resize; touch-action: none; }
    html.cusade-insights-editing .cusade-insights-banner__resize::after { content: '◢'; color: #fff; }
    .cusade-insights-slot { display: block; list-style: none; }
    .cusade-insights-dropzone { box-sizing: border-box; display: block; width: 100%; height: 30px;
      margin: 7px 0; border: 2px dashed #b86d83; border-radius: 9px;
      background: #7b34521f; color: var(--font-secondary-color, #bbb);
      font: 600 11px system-ui; text-align: center; cursor: pointer; }
    .cusade-insights-dropzone:hover, .cusade-insights-dropzone.cusade-insights-dropzone--active {
      border-color: #ff955e; background: #ff955e30; color: var(--font-primary-color, #fff); }
    html.cusade-insights-editing .l-main:has([data-test-id="home"]) > :not(.cusade-insights-banner):not(.cusade-insights-dropzone),
    html.cusade-insights-editing .streamSidebar > .sidebarModule,
    html.cusade-insights-editing [data-test-id="home"] .lazyLoadingList__list > :not(.cusade-insights-slot):not(.cusade-insights-dropzone) {
      outline: 1px dashed #ff955e50; outline-offset: -2px; }
    .cusade-insights-editbar { position: fixed; right: 20px; bottom: 62px; z-index: 2147483645;
      display: flex; align-items: center; gap: 14px; padding: 10px 12px; border-radius: 12px;
      background: #2b1b32; color: #fff; box-shadow: 0 10px 30px #0008; font: 13px system-ui; }
    .cusade-insights-editbar button { padding: 8px 15px; border: 0; border-radius: 7px;
      background: var(--cusade-accent, #ff5500); color: #fff; font: 700 12px system-ui; cursor: pointer; }
    .l-fluid-fixed.cusade-insights-wide-sidebar > .l-main { margin-right: var(--cusade-insights-sidebar-width) !important; }
    .l-fluid-fixed.cusade-insights-wide-sidebar > .l-sidebar-right { left: auto !important;
      right: 0 !important; width: var(--cusade-insights-sidebar-width) !important; }
    .l-fluid-fixed.cusade-insights-wide-sidebar .streamSidebar { width: 100% !important; }
    /* One shared curve for every effect in the app, so all reactions start and
       settle together. Two choices matter more than the effects themselves:
       the duration, because 180ms finished before the eye had registered it and
       read as a flicker, and the easing, because a curve that leaves at full
       speed snaps at the start. This one leaves gently (.3 control point) and
       arrives flat, so a hover reads as a reaction rather than a blink.
       --cusade-grow is the same curve with more time on it, for the few buttons
       that change size rather than position: the eye follows the edges of a shape
       it is growing, so a size change needs a longer ramp than a movement. */
    html {
      --cusade-hover: 360ms cubic-bezier(.3,.62,.36,1);
      --cusade-grow: 420ms cubic-bezier(.3,.62,.36,1);
    }
    /* Bare links and inputs keep the cheap set: filter and shadow almost never
       change on them, and an animated property costs a repaint even when the
       value does not move. Buttons get the full treatment, because on a button
       the highlight is the whole point. */
    html.cusade-animations :is(button, .sc-button, [role="button"], a, input, textarea) {
      transition: color var(--cusade-hover), background-color var(--cusade-hover),
        border-color var(--cusade-hover), opacity var(--cusade-hover);
    }
    html.cusade-animations :is(button, .sc-button, [role="button"]):not(:disabled) {
      transition: color var(--cusade-hover), background-color var(--cusade-hover),
        border-color var(--cusade-hover), opacity var(--cusade-hover),
        box-shadow var(--cusade-hover), filter var(--cusade-hover);
    }
    html.cusade-animations :is(button, .sc-button, [role="button"]):not(:disabled):hover {
      filter: brightness(1.09) saturate(1.06);
    }
    html.cusade-animations :is(button, .sc-button, [role="button"]):not(:disabled):active {
      filter: brightness(.9) saturate(.96);
    }
    html.cusade-animations :is(input, textarea, .sc-button, button):focus-visible {
      outline-offset: 3px;
      transition: outline-offset var(--cusade-hover), box-shadow var(--cusade-hover);
    }
    /* The lift is a transform, so it stays on the compositor. The shadow is
       applied without a transition on purpose: measured on a 20 row feed, an
       animated shadow cost 2856ms of paint against 122ms for the same hover with
       the shadow snapped in, and the cost did not drop with the blur radius (a
       blurless inset box-shadow was just as expensive). Repainting the shadow
       invalidates the strip around the element, so a row drags its neighbours in
       on every frame. The lift still carries the motion. */
    html.cusade-animations :is(.playableTile, .sidebarModule, .cusade-insights-banner, .cusade-visualization) {
      transition: transform var(--cusade-hover),
        background-color 820ms cubic-bezier(.3,.62,.36,1);
    }
    html.cusade-animations :is(.playableTile, .cusade-insights-banner, .cusade-visualization):hover {
      transform: translateY(-4px);
      box-shadow: 0 16px 26px #00000038;
    }
    html.cusade-animations .sidebarModule:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px #00000026;
    }
    html.cusade-animations.cusade-insights-editing .cusade-insights-banner,
    html.cusade-animations .cusade-insights-drag-ghost {
      transition: none;
      transform: none !important;
    }
    html.cusade-animations :is(.playableTile__image, .playableTile__imageOverlay,
      .image.sc-artwork, .image.sc-artwork .image__full, .cusade-visualization__art) {
      transition: transform 380ms cubic-bezier(.3,.62,.36,1), opacity var(--cusade-hover);
    }
    html.cusade-animations .playableTile__artworkLink:hover .playableTile__image,
    html.cusade-animations .listenArtworkWrapper__artwork:hover .image.sc-artwork {
      transform: scale(1.04);
    }
    html.cusade-animations .image.image__rounded:hover {
      transform: scale(1.055);
    }
    html.cusade-animations .cusade-visualization:hover .cusade-visualization__art {
      transform: scale(1.025);
    }
    html.cusade-animations :is(.soundList__item, .searchItem, .commentItem,
      .header__navMenuItem) {
      transition: color var(--cusade-hover), opacity var(--cusade-hover);
    }
    html.cusade-animations :is(.soundList__item, .searchItem, .commentItem):hover {
      background-color: color-mix(in srgb, var(--font-primary-color, #fff) 5%, transparent);
    }
    html.cusade-animations :is(.dropdownMenu, [role="menu"], .cusade-insights-banner__menu):not([hidden]) {
      animation: cusade-menu-enter 280ms cubic-bezier(.3,.62,.36,1) both;
      transform-origin: top center;
    }
    /* Our own buttons get the full treatment: lift, accent glow and a brightness
       nudge, all on the shared curve, so the press settles instead of snapping.
       A button is small enough that the glow costs nothing measurable, which is
       not true of a full width row or a card. */
    html.cusade-animations :is(.cusade-visualization__play, .cusade-likes-shuffle__button,
      .cusade-insights-banner button, .cusade-insights-editbar button) {
      transition: transform var(--cusade-hover), background-color var(--cusade-hover),
        filter var(--cusade-hover);
    }
    html.cusade-animations :is(.cusade-visualization__play, .cusade-likes-shuffle__button,
      .cusade-insights-banner button, .cusade-insights-editbar button):hover:not(:disabled) {
      transform: translateY(-2px);
      filter: brightness(1.08);
      box-shadow: 0 10px 24px color-mix(in srgb, var(--cusade-accent, #ff5500) 26%, transparent);
    }
    html.cusade-animations :is(.cusade-visualization__play, .cusade-likes-shuffle__button,
      .cusade-insights-banner button, .cusade-insights-editbar button):active:not(:disabled) {
      transform: translateY(-1px) scale(.97);
      filter: brightness(.94);
    }
    /* Action pills grow on hover instead of only lifting. A scale on a pill reads as
       a reaction of its own, and these are the buttons a person aims at, so they
       all get what the insights pill proved out: a longer ramp than the shared
       hover curve, a soft ring in the button's own colour, a small lift on top of
       the scale, and a press that settles instead of snapping. Scale is written
       first in the transform because transform functions apply right to left, so
       the button grows around its own centre and then lifts. Bare icon buttons
       are deliberately left out: they already have their own scale, and growing a
       32px icon by the same ratio reads as wobbly rather than deliberate. */
    html.cusade-animations :is(.sc-button-follow, .sc-button:not(.sc-button-icon),
      .cusade-visualization__play, .cusade-insights-editbar button,
      .cusade-insights-banner__open) {
      transition: transform var(--cusade-grow), background-color var(--cusade-hover),
        box-shadow var(--cusade-hover), filter var(--cusade-hover);
    }
    html.cusade-animations :is(.sc-button-follow, .sc-button:not(.sc-button-icon),
      .cusade-visualization__play, .cusade-insights-editbar button,
      .cusade-insights-banner__open):hover:not(:disabled) {
      transform: scale(1.07) translateY(-1px);
      filter: brightness(1.04);
      box-shadow: 0 10px 24px #0000003d, 0 0 0 5px color-mix(in srgb, currentColor 14%, transparent);
    }
    html.cusade-animations :is(.sc-button-follow, .sc-button:not(.sc-button-icon),
      .cusade-visualization__play, .cusade-insights-editbar button,
      .cusade-insights-banner__open):active:not(:disabled) {
      transform: scale(1.02) translateY(0);
      filter: brightness(.98);
    }
    /* Applied to items the enter observer has seen reach the viewport, so a feed
       that renders hundreds of rows promotes only the visible ones. */
    html.cusade-animations.cusade-enter .cusade-enter-target {
      animation: cusade-content-enter 400ms cubic-bezier(.3,.62,.36,1) backwards;
    }
    html.cusade-animations :is(.soundList__item, .searchList__item, .trackList__item,
      .usersList__item, .soundBadgeList__item, .commentBadgeList__item,
      .userStreamItem, .searchItem, .trackItem, .userBadge, .soundBadge,
      .commentBadge, .profileTabs a, .userNetworkTabs a, .header__navMenuItem) {
      /* Rows fade the highlight in instead of switching it, which is what the
         180ms snap could not do. The shadow is not in this list for the same
         reason as on the cards: on a full width row it repaints the strip and
         costs an order of magnitude more than the fade itself. The tab links are
         in this list on purpose, so the underline they show on hover grows out of
         nothing. */
      transition: color var(--cusade-hover), opacity var(--cusade-hover),
        background-color var(--cusade-hover);
    }
    html.cusade-animations :is(.soundList__item, .searchList__item, .trackList__item,
      .usersList__item, .soundBadgeList__item, .commentBadgeList__item,
      .userStreamItem, .searchItem, .trackItem, .userBadge, .soundBadge,
      .commentBadge):hover {
      background-color: color-mix(in srgb, var(--font-primary-color, #fff) 6%, transparent);
      box-shadow: 0 4px 12px #00000021;
    }
    html.cusade-animations :is(.sound__coverArt, .trackItem__image, .soundBadge__artwork,
      .userBadge__avatar, .profileHeaderInfo__avatar, .listenArtworkWrapper__artwork,
      .commentPopover__avatar, .commentForm__avatar) .image {
      transition: transform var(--cusade-hover);
    }
    html.cusade-animations :is(.sound__coverArt, .trackItem__image, .soundBadge__artwork,
      .userBadge__avatar, .profileHeaderInfo__avatar, .listenArtworkWrapper__artwork,
      .commentPopover__avatar, .commentForm__avatar):hover .image {
      transform: scale(1.045);
    }
    html.cusade-animations :is(.profileHeaderInfo, .userNetworkInfo, .listenInfo,
      .listenEngagement, .sidebarModule, .commentsModule, .likesModule) {
      animation: cusade-content-enter 420ms cubic-bezier(.3,.62,.36,1) backwards;
    }
    html.cusade-animations :is(.profileHeaderBackground__visual, .listenArtworkWrapper__artwork) {
      transition: transform var(--cusade-hover), opacity var(--cusade-hover);
    }
    html.cusade-animations :is(.profileTabs a, .userNetworkTabs a, .header__navMenuItem):hover {
      box-shadow: inset 0 -2px currentColor;
    }
    html.cusade-animations :is(.sc-button-icon, .sc-button-like, .sc-button-follow,
      .sc-button-repost, .sc-button-share, .sc-button-more, .sc-button-copylink,
      .sc-button-play, .playControls__control, .volume__button,
      .header__moreButton, .headerSearch__submit, .userNetwork__likeActions button) {
      transition: transform 280ms cubic-bezier(.3,.62,.36,1), filter var(--cusade-hover),
        color var(--cusade-hover), background-color var(--cusade-hover),
        box-shadow var(--cusade-hover);
    }
    html.cusade-animations :is(.sc-button-icon, .sc-button-like, .sc-button-follow,
      .sc-button-repost, .sc-button-share, .sc-button-more, .sc-button-copylink,
      .sc-button-play, .playControls__control, .volume__button,
      .header__moreButton, .headerSearch__submit, .userNetwork__likeActions button):hover:not(:disabled) {
      transform: scale(1.08);
    }
    html.cusade-animations :is(.sc-button-icon, .sc-button-like, .sc-button-follow,
      .sc-button-repost, .sc-button-share, .sc-button-more, .sc-button-copylink,
      .sc-button-play, .playControls__control, .volume__button,
      .header__moreButton, .headerSearch__submit, .userNetwork__likeActions button):active:not(:disabled) {
      transform: scale(.93);
    }
    html.cusade-animations :is(.sc-button-like, .sc-button-follow, .sc-button-repost):is(
      .sc-button-selected, .sc-button-active, [aria-pressed="true"]) {
      animation: cusade-action-pop 380ms cubic-bezier(.3,.62,.36,1);
    }
    html.cusade-animations .volume__sliderProgress {
      transition: width 180ms linear, background-color var(--cusade-hover);
    }
    /* SoundCloud drives the player fill with an inline width, and animating that
       width re-ran layout for the bottom bar on every frame. The preload mirrors
       the same value as a scaleX, which is composited. cusade-player-progress is
       only set once that mirror works, so a broken mirror keeps SoundCloud's own
       width instead of showing an empty or full bar. */
    html.cusade-animations.cusade-player-progress .playbackTimeline__progressBar {
      width: 100% !important;
      transform: scaleX(var(--cusade-player-progress, 0));
      transform-origin: left center;
      transition: transform 180ms linear, background-color 180ms ease;
    }
    html.cusade-animations .volume__sliderHandle {
      transition: box-shadow var(--cusade-hover), filter var(--cusade-hover);
    }
    html.cusade-animations .volume__sliderWrapper:hover .volume__sliderHandle {
      box-shadow: 0 0 0 5px color-mix(in srgb, var(--font-primary-color, #fff) 16%, transparent);
    }
    html.cusade-animations :is(.commentPopover, .userDropbar, .playControlsPanel):not([hidden]) {
      animation: cusade-menu-enter 300ms cubic-bezier(.3,.62,.36,1) both;
    }
    /* Page transitions. Two fixed layers that only ever move opacity and scaleX,
       so a route change stays on the compositor instead of repainting the column
       that is being swapped underneath. The bar is a 2px accent line across the
       top, the veil a soft dim that rises for a moment and clears again. */
    .cusade-route { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; }
    .cusade-route__veil { position: absolute; inset: 0; opacity: 0;
      background: radial-gradient(130% 100% at 50% 35%, #0b0d13b0, #05060ae8); }
    .cusade-route__bar { position: absolute; top: 0; left: 0; width: 100%; height: 2px;
      opacity: 0; transform: scaleX(0); transform-origin: left center;
      background: linear-gradient(90deg, transparent 2%, var(--cusade-accent, #ff5500) 18%,
        #ffffffd9 50%, var(--cusade-accent, #ff5500) 82%, transparent 98%); }
    html.cusade-animations .cusade-route__veil { transition: opacity 520ms cubic-bezier(.3,.62,.36,1); }
    html.cusade-animations .cusade-route__bar { transition: transform 760ms cubic-bezier(.3,.62,.36,1),
      opacity 340ms ease; }
    html.cusade-animations .cusade-route--intro .cusade-route__veil { opacity: 1; }
    html.cusade-animations .cusade-route--veil .cusade-route__veil { opacity: .42; }
    html.cusade-animations .cusade-route--sweep .cusade-route__bar { opacity: 1; transform: scaleX(1); }
    @keyframes cusade-content-enter {
      from { opacity: 0; transform: translateY(9px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes cusade-action-pop {
      45% { transform: scale(1.14); }
    }
    @keyframes cusade-menu-enter {
      from { opacity: 0; transform: translateY(-7px) scale(.985); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    /* No prefers-reduced-motion override here on purpose: every effect above is
       scoped to html.cusade-animations, and that class now means "cusade motion
       is active" (see motionActive()). The list enter effect additionally needs
       html.cusade-enter, which is only set while motion is active. With the
       setting off, or with the system preference respected, no animation rule
       matches at all, so there is no second selector list to keep in sync and no
       !important that could silently defeat an explicit choice. */
  `;
  document.head.appendChild(style);
  updateLocalizationWatcher();
  scheduleLocalization();

  ipcRenderer.invoke('cusade:get-settings').then(saved => {
    hideArtistTools = saved.hideArtistTools === true;
    hideNearbyEvents = saved.hideNearbyEvents === true;
    blockAudioAds = saved.blockAudioAds === true;
    discordRpc = saved.discordRpc === true;
    discordClientId = /^\d{17,20}$/.test(saved.discordClientId)
      ? saved.discordClientId : DEFAULT_DISCORD_CLIENT_ID;
    autoStart = saved.autoStart === true;
    startMinimized = saved.startMinimized === true;
    playbackVisualization = saved.playbackVisualization === true;
    animations = saved.animations === true;
    respectSystemMotion = saved.respectSystemMotion === true;
    showYourLikesButton = saved.showYourLikesButton !== false;
    insightsHiddenUntil = Number.isFinite(saved.insightsHiddenUntil) ? saved.insightsHiddenUntil : 0;
    if (saved.insightsLayout && ['sidebar', 'main', 'feed'].includes(saved.insightsLayout.location)) {
      insightsLayout = { ...insightsLayout, ...saved.insightsLayout };
    }
    appLanguage = saved.appLanguage === 'ru' ? 'ru' : 'site';
    for (const key of Object.keys(DEFAULT_RADII)) {
      artworkRadii[key] = Number.isInteger(saved[key]) && saved[key] >= 0 && saved[key] <= 50
        ? saved[key] : DEFAULT_RADII[key];
    }
    savedArtworkRadii = { ...artworkRadii };
    accentColor = /^#[0-9a-fA-F]{6}$/.test(saved.accentColor)
      ? saved.accentColor.toLowerCase() : DEFAULT_ACCENT_COLOR;
    savedAccentColor = accentColor;
    settingsLoaded = true;
    applyArtistToolsVisibility();
    applyNearbyEventsVisibility();
    applyAccentColor();
    applyArtworkRadii();
    routeIntroPending = true;
    applyMotion();
    routeIntroPending = false;
    updatePanelToggle();
    updateNearbyEventsToggle();
    updateAudioAdsToggle();
    updateDiscordControls();
    updateAutoStartControls();
    updateVisualizationToggle();
    updateAnimationsToggle();
    updateRespectSystemMotionToggle();
    updateYourLikesToggle();
    updatePanelColor();
    syncPlaybackVisualization();
    syncHomeLikesButton();
    syncInsightsBanner();
    syncPlaybackTheme();
    if (insightsBanner?.isConnected) placeInsights();
    updateInsightsRestoreControl();
    syncDiscordPresence();
    refreshLocalizedUi();
    scheduleLocalization();
  }).catch(error => console.error('Could not load cusade settings:', error));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSettings, { once: true });
} else {
  initializeSettings();
}

// The system preference can change at any moment, so motion is recalculated
// instead of relying on a snapshot taken when the page loaded.
systemReducedMotion.addEventListener('change', applyMotion);

function updatePanelToggle() {
  const toggle = panelHost?.shadowRoot.querySelector('#hide-artist-tools');
  if (!toggle) return;
  toggle.checked = hideArtistTools;
  toggle.disabled = !settingsLoaded;
}

function updateNearbyEventsToggle() {
  const toggle = panelHost?.shadowRoot.querySelector('#hide-nearby-events');
  if (!toggle) return;
  toggle.checked = hideNearbyEvents;
  toggle.disabled = !settingsLoaded;
}

function updateAudioAdsToggle() {
  const toggle = panelHost?.shadowRoot.querySelector('#block-audio-ads');
  if (!toggle) return;
  toggle.checked = blockAudioAds;
  toggle.disabled = !settingsLoaded;
}

function updateDiscordControls() {
  const shadow = panelHost?.shadowRoot;
  const toggle = shadow?.querySelector('#discord-rpc');
  const input = shadow?.querySelector('#discord-client-id');
  if (toggle) {
    toggle.checked = discordRpc;
    toggle.disabled = !settingsLoaded;
  }
  if (input) {
    input.value = discordClientId;
    input.disabled = !settingsLoaded;
  }
}

function updateAutoStartControls() {
  const shadow = panelHost?.shadowRoot;
  const toggle = shadow?.querySelector('#auto-start');
  const minimized = shadow?.querySelector('#start-minimized');
  if (toggle) {
    toggle.checked = autoStart;
    toggle.disabled = !settingsLoaded;
  }
  if (minimized) {
    minimized.checked = startMinimized;
    minimized.disabled = !settingsLoaded || !autoStart;
  }
}

function updateVisualizationToggle() {
  const toggle = panelHost?.shadowRoot.querySelector('#playback-visualization');
  if (!toggle) return;
  toggle.checked = playbackVisualization;
  toggle.disabled = !settingsLoaded;
}

function updateAnimationsToggle() {
  const toggle = panelHost?.shadowRoot.querySelector('#animations');
  if (!toggle) return;
  toggle.checked = animations;
  toggle.disabled = !settingsLoaded;
  updateSystemMotionHint();
}

function updateRespectSystemMotionToggle() {
  const toggle = panelHost?.shadowRoot.querySelector('#respect-system-motion');
  if (!toggle) return;
  toggle.checked = respectSystemMotion;
  toggle.disabled = !settingsLoaded;
}

// Keeps the switch honest: when the system asks for reduced motion the panel says
// so instead of leaving a checked switch that silently does nothing.
function updateSystemMotionHint() {
  const hint = panelHost?.shadowRoot.querySelector('.motion-hint');
  if (!hint) return;
  const visible = animations && systemReducedMotion.matches;
  hint.hidden = !visible;
  hint.textContent = !visible ? '' : respectSystemMotion
    ? ui('Система сообщает об уменьшении движения, поэтому эффекты cusade приглушены.',
      'Your system asks for reduced motion, so cusade effects stay dimmed.')
    : ui('Система сообщает об уменьшении движения, но cusade использует ваш выбор.',
      'Your system asks for reduced motion, but cusade follows your choice.');
}

function updateYourLikesToggle() {
  const toggle = panelHost?.shadowRoot.querySelector('#show-your-likes-button');
  if (!toggle) return;
  toggle.checked = showYourLikesButton;
  toggle.disabled = !settingsLoaded;
}

function updateInsightsRestoreControl() {
  const restore = panelHost?.shadowRoot.querySelector('.insights-restore');
  if (!restore) return;
  restore.hidden = insightsHiddenUntil <= Date.now();
  const until = restore.querySelector('span');
  if (until) until.textContent = ui('Insights скрыт до', 'Insights hidden until') +
    ` ${formatInsightDate(insightsHiddenUntil)}.`;
}

function updateArtworkRadiusControls() {
  for (const key of Object.keys(DEFAULT_RADII)) {
    const slider = panelHost?.shadowRoot.querySelector(`#${key}`);
    const value = panelHost?.shadowRoot.querySelector(`#${key}-value`);
    if (slider) {
      slider.value = artworkRadii[key];
      slider.disabled = !settingsLoaded;
    }
    if (value) value.textContent = `${artworkRadii[key]}%`;
  }
}

function createPlaybackVisualization() {
  const card = document.createElement('section');
  card.className = 'cusade-visualization';
  card.setAttribute('aria-label', ui('Визуализация воспроизведения', 'Playback visualization'));
  card.innerHTML = `
    <div class="cusade-visualization__main">
      <div class="cusade-visualization__heading">
        <button class="cusade-visualization__play" type="button" aria-label="${ui('Воспроизвести', 'Play')}">▶</button>
        <div class="cusade-visualization__meta">
          <a class="cusade-visualization__title"></a>
          <a class="cusade-visualization__artist"></a>
        </div>
      </div>
      <button class="cusade-visualization__wave" type="button" aria-label="${ui('Перемотать трек', 'Seek track')}">
        <span class="cusade-visualization__bars cusade-visualization__bars--base"></span>
        <span class="cusade-visualization__bars cusade-visualization__bars--played"></span>
      </button>
      <div class="cusade-visualization__times"><span>0:00</span><span>0:00</span></div>
    </div>
    <img class="cusade-visualization__art" alt="${ui('Обложка трека', 'Track artwork')}">`;
  card.querySelector('.cusade-visualization__play').addEventListener('click', () => {
    document.querySelector('.playControls__play')?.click();
  });
  card.querySelector('.cusade-visualization__wave').addEventListener('click', event => {
    const timeline = document.querySelector('.playbackTimeline__progressWrapper');
    if (!timeline) return;
    const wave = event.currentTarget.getBoundingClientRect();
    const target = timeline.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (event.clientX - wave.left) / wave.width));
    for (const type of ['mousedown', 'mouseup']) {
      timeline.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        button: 0,
        buttons: type === 'mousedown' ? 1 : 0,
        clientX: target.left + target.width * fraction,
        clientY: target.top + target.height / 2
      }));
    }
  });
  return card;
}

function playbackArtworkFromBadge(badge) {
  const raw = badge?.querySelector('.image__full')?.style.backgroundImage
    .match(/url\(["']?(.*?)["']?\)/)?.[1]?.replace(/-t\d+x\d+\./, '-t500x500.');
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' && (url.hostname === 'sndcdn.com' || url.hostname.endsWith('.sndcdn.com'))) {
      return url.href;
    }
  } catch { /* Artwork can be absent while SoundCloud updates the player. */ }
  return '';
}

function fallbackPlaybackColor(artwork) {
  if (!artwork) return '#10384c';
  let hash = 0;
  for (const character of artwork) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 43% 27%)`;
}

async function artworkThemeColor(artwork) {
  if (playbackColorCache.has(artwork)) return playbackColorCache.get(artwork);
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = artwork.replace(/-t\d+x\d+\./, '-t200x200.');
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, 32, 32);
  const pixels = context.getImageData(0, 0, 32, 32).data;
  const channels = [0, 0, 0];
  let count = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 128) continue;
    for (let channel = 0; channel < 3; channel++) channels[channel] += pixels[index + channel];
    count++;
  }
  const color = count
    ? `rgb(${channels.map(sum => Math.max(25, Math.round(sum / count * .56))).join(',')})`
    : fallbackPlaybackColor(artwork);
  const backdrop = document.createElement('canvas');
  backdrop.width = 128;
  backdrop.height = 128;
  const backdropContext = backdrop.getContext('2d');
  backdropContext.filter = 'blur(12px) saturate(1.2)';
  backdropContext.drawImage(image, -16, -16, 160, 160);
  playbackBackdropCache.set(artwork, backdrop.toDataURL('image/jpeg', .72));
  playbackColorCache.set(artwork, color);
  if (playbackColorCache.size > 32) {
    const oldest = playbackColorCache.keys().next().value;
    playbackColorCache.delete(oldest);
    playbackBackdropCache.delete(oldest);
  }
  return color;
}

function applyPlaybackTheme(host, artwork, color) {
  if (!host || host.dataset.cusadeThemeArtwork === artwork) return;
  host.dataset.cusadeThemeArtwork = artwork;
  host.style.backgroundColor = color;
  const previous = [...host.children].filter(child => child.classList.contains('cusade-track-backdrop'));
  for (const layer of previous) {
    layer.classList.remove('cusade-track-backdrop--visible');
    setTimeout(() => layer.remove(), 1050);
  }
  if (!artwork) return;
  const layer = document.createElement('div');
  layer.className = 'cusade-track-backdrop';
  layer.setAttribute('aria-hidden', 'true');
  const backdrop = playbackBackdropCache.get(artwork) || artwork.replace(/-t\d+x\d+\./, '-t200x200.');
  layer.style.backgroundImage = `url(${JSON.stringify(backdrop)})`;
  host.prepend(layer);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (layer.isConnected) layer.classList.add('cusade-track-backdrop--visible');
  }));
}

function syncInsightsModalTheme(artwork, color) {
  const hero = insightsHost?.shadowRoot?.querySelector('.hero');
  if (!hero) return;
  hero.style.setProperty('--hero-color', color);
  const image = hero.querySelector('.hero-art');
  if (image && artwork && image.src !== artwork) image.src = artwork;
  else if (image && !artwork) image.removeAttribute('src');
}

function syncPlaybackTheme() {
  const artwork = playbackArtworkFromBadge(document.querySelector('.playbackSoundBadge'));
  const hosts = [visualizationHost, insightsBanner?.isConnected ? insightsBanner : null];
  if (artwork === playbackThemeArtwork) {
    if (artwork === playbackThemeAppliedArtwork) {
      for (const host of hosts) applyPlaybackTheme(host, artwork, playbackThemeColor);
    }
    return;
  }
  playbackThemeArtwork = artwork;
  const request = ++playbackThemeRequest;
  if (!artwork) {
    playbackThemeColor = '#10384c';
    playbackThemeAppliedArtwork = '';
    for (const host of hosts) applyPlaybackTheme(host, '', playbackThemeColor);
    syncInsightsModalTheme('', playbackThemeColor);
    return;
  }
  artworkThemeColor(artwork).catch(() => fallbackPlaybackColor(artwork)).then(color => {
    if (request !== playbackThemeRequest) return;
    playbackThemeColor = color;
    playbackThemeAppliedArtwork = artwork;
    for (const host of [visualizationHost, insightsBanner?.isConnected ? insightsBanner : null]) {
      applyPlaybackTheme(host, artwork, color);
    }
    syncInsightsModalTheme(artwork, color);
  });
}

const WAVE_BAR_COUNT = 160;

// The bars stay in the card for as long as it lives: a track switch only
// rewrites their transforms instead of replacing 320 elements, and the height
// that is animated is a compositor-only scale.
function drawPlaybackWave(card, seed, waveform) {
  let state = 0;
  for (const character of seed) state = (Math.imul(state, 31) + character.charCodeAt(0)) | 0;
  const scales = new Array(WAVE_BAR_COUNT);
  for (let index = 0; index < WAVE_BAR_COUNT; index++) {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    const sample = waveform?.samples.slice(
      Math.floor(index * waveform.samples.length / WAVE_BAR_COUNT),
      Math.max(1, Math.floor((index + 1) * waveform.samples.length / WAVE_BAR_COUNT))
    );
    const height = sample?.length
      ? Math.max(10, Math.max(...sample) / waveform.height * 96)
      : 18 + ((state >>> 16) % 60) + 12 * Math.sin(index / 9) ** 2;
    scales[index] = Math.min(96, height) / 100;
  }
  for (const layer of card.querySelectorAll('.cusade-visualization__bars')) {
    if (layer.children.length !== WAVE_BAR_COUNT) {
      layer.replaceChildren(...Array.from({ length: WAVE_BAR_COUNT }, () => document.createElement('span')));
    }
    for (let index = 0; index < WAVE_BAR_COUNT; index++) {
      const transform = `scaleY(${scales[index].toFixed(4)})`;
      if (layer.children[index].style.transform !== transform) {
        layer.children[index].style.transform = transform;
      }
    }
  }
}

function waveformUrlFromHydration(scriptText, trackUrl) {
  const prefix = 'window.__sc_hydration = ';
  if (!scriptText?.startsWith(prefix)) return null;
  try {
    const entries = JSON.parse(scriptText.slice(prefix.length).trim().replace(/;$/, ''));
    return entries.find(entry => entry.hydratable === 'sound' &&
      entry.data?.permalink_url === trackUrl)?.data.waveform_url || null;
  } catch {
    return null;
  }
}

async function loadPlaybackWave(card, trackUrl) {
  if (waveformCache.has(trackUrl)) {
    if (visualizationHost === card && visualizedTrackUrl === trackUrl) {
      drawPlaybackWave(card, trackUrl, waveformCache.get(trackUrl));
    }
    return;
  }
  let waveformUrl = waveformUrlFromHydration(
    [...document.scripts].find(script => script.textContent.startsWith('window.__sc_hydration = '))?.textContent,
    trackUrl
  );
  if (!waveformUrl) {
    const response = await fetch(trackUrl);
    if (!response.ok) return;
    const page = new DOMParser().parseFromString(await response.text(), 'text/html');
    waveformUrl = waveformUrlFromHydration(
      [...page.scripts].find(script => script.textContent.startsWith('window.__sc_hydration = '))?.textContent,
      trackUrl
    );
  }
  if (!waveformUrl || new URL(waveformUrl).hostname !== 'wave.sndcdn.com') return;
  const response = await fetch(waveformUrl);
  if (!response.ok) return;
  const waveform = await response.json();
  if (!Array.isArray(waveform.samples) || waveform.samples.length > 5000 ||
      !Number.isFinite(waveform.height) || waveform.height <= 0) return;
  waveformCache.set(trackUrl, { samples: waveform.samples, height: waveform.height });
  if (waveformCache.size > 8) waveformCache.delete(waveformCache.keys().next().value);
  if (visualizationHost === card && visualizedTrackUrl === trackUrl) {
    drawPlaybackWave(card, trackUrl, waveform);
  }
}

function setVisualizationArtwork(card, artwork, immediate = false) {
  const cover = card.querySelector('.cusade-visualization__art');
  if (cover.dataset.cusadeArtwork === artwork) return;
  cover.dataset.cusadeArtwork = artwork;
  clearTimeout(card.cusadeArtworkTimer);
  const apply = () => {
    if (cover.dataset.cusadeArtwork !== artwork || !cover.isConnected) return;
    if (artwork) { cover.src = artwork; cover.hidden = false; }
    else { cover.removeAttribute('src'); cover.hidden = true; }
    requestAnimationFrame(() => cover.classList.remove('cusade-visualization__art--changing'));
  };
  if (!immediate && motionActive() && cover.hasAttribute('src')) {
    cover.classList.add('cusade-visualization__art--changing');
    card.cusadeArtworkTimer = setTimeout(apply, 180);
  } else apply();
}

function commitPlaybackTrack(card, track) {
  if (visualizationHost !== card || !card.isConnected) return;
  const title = card.querySelector('.cusade-visualization__title');
  const artist = card.querySelector('.cusade-visualization__artist');
  title.textContent = track.title;
  title.href = track.url;
  artist.textContent = track.artist;
  artist.href = track.artistUrl;
  card.dataset.cusadeTrackUrl = track.url;
  card.style.setProperty('--cusade-progress', '0%');
  setVisualizationArtwork(card, track.artwork, true);
  drawPlaybackWave(card, track.url);
  loadPlaybackWave(card, track.url).catch(error => {
    console.error('Could not load SoundCloud waveform:', error);
  });
}

function finishPlaybackSwitch() {
  if (!visualizationPendingTrack) return;
  clearTimeout(visualizationSwitchTimer);
  const { card, track } = visualizationPendingTrack;
  visualizationPendingTrack = null;
  if (visualizationHost !== card || visualizedTrackUrl !== track.url) return;
  commitPlaybackTrack(card, track);
  requestAnimationFrame(() => card.classList.remove('cusade-visualization--switching'));
  syncPlaybackVisualization();
}

function syncPlaybackVisualization() {
  const home = document.querySelector('[data-test-id="home"]');
  const main = home?.closest('.l-main');
  const badge = document.querySelector('.playbackSoundBadge');
  const titleLink = badge?.querySelector('.playbackSoundBadge__titleLink');
  const artistLink = badge?.querySelector('.playbackSoundBadge__lightLink');
  if (!playbackVisualization || !main || !titleLink || !artistLink) {
    clearTimeout(visualizationSwitchTimer);
    visualizationPendingTrack = null;
    visualizationHost?.remove();
    visualizationHost = null;
    visualizedTrackUrl = '';
    return;
  }

  if (!visualizationHost || !visualizationHost.isConnected) {
    visualizationHost = createPlaybackVisualization();
    main.prepend(visualizationHost);
    visualizedTrackUrl = '';
  }
  if (visualizedTrackUrl !== titleLink.href) {
    visualizedTrackUrl = titleLink.href;
    const track = {
      url: titleLink.href,
      title: titleLink.title || titleLink.querySelector('[aria-hidden="true"]')?.textContent || '',
      artist: artistLink.textContent.trim(),
      artistUrl: artistLink.href,
      artwork: playbackArtworkFromBadge(badge)
    };
    clearTimeout(visualizationSwitchTimer);
    if (motionActive() && visualizationHost.dataset.cusadeTrackUrl) {
      visualizationPendingTrack = { card: visualizationHost, track };
      visualizationHost.classList.add('cusade-visualization--switching');
      visualizationSwitchTimer = setTimeout(finishPlaybackSwitch, 180);
      return;
    }
    visualizationPendingTrack = null;
    visualizationHost.classList.remove('cusade-visualization--switching');
    commitPlaybackTrack(visualizationHost, track);
  }

  const artwork = playbackArtworkFromBadge(badge);
  setVisualizationArtwork(visualizationHost, artwork);

  const play = visualizationHost.querySelector('.cusade-visualization__play');
  const paused = badge.classList.contains('paused');
  const playSymbol = paused ? '▶' : 'Ⅱ';
  const playLabel = paused ? ui('Воспроизвести', 'Play') : ui('Пауза', 'Pause');
  if (play.textContent !== playSymbol) play.textContent = playSymbol;
  if (play.getAttribute('aria-label') !== playLabel) play.setAttribute('aria-label', playLabel);
  const timeline = document.querySelector('.playbackTimeline__progressWrapper');
  const maximum = Number(timeline?.getAttribute('aria-valuemax'));
  const current = Number(timeline?.getAttribute('aria-valuenow'));
  const progress = maximum > 0 ? Math.max(0, Math.min(100, current / maximum * 100)) : 0;
  const progressValue = `${progress}%`;
  if (visualizationHost.style.getPropertyValue('--cusade-progress') !== progressValue) {
    visualizationHost.style.setProperty('--cusade-progress', progressValue);
  }
  const times = visualizationHost.querySelectorAll('.cusade-visualization__times span');
  const passed = document.querySelector('.playbackTimeline__timePassed [aria-hidden="true"]')?.textContent || '0:00';
  const duration = document.querySelector('.playbackTimeline__duration [aria-hidden="true"]')?.textContent || '0:00';
  if (times[0].textContent !== passed) times[0].textContent = passed;
  if (times[1].textContent !== duration) times[1].textContent = duration;
}

// SoundCloud paints the player fill with an inline width. Growing that width
// re-ran layout for the whole bottom bar on every frame, so the preload mirrors
// the same value as a scaleX, which only the compositor has to handle. The
// mirror owns the bar from the first valid sample onwards and hands it back if
// the timeline ever stops reporting a range.
function applyPlayerProgress(wrapper) {
  const maximum = Number(wrapper.getAttribute('aria-valuemax'));
  const current = Number(wrapper.getAttribute('aria-valuenow'));
  const root = document.documentElement;
  if (!(maximum > 0) || !Number.isFinite(current)) {
    root?.classList.remove('cusade-player-progress');
    return;
  }
  const value = Math.max(0, Math.min(1, current / maximum)).toFixed(4);
  if (wrapper.style.getPropertyValue('--cusade-player-progress') !== value) {
    wrapper.style.setProperty('--cusade-player-progress', value);
  }
  root?.classList.add('cusade-player-progress');
}

function syncPlayerProgress() {
  const wrapper = document.querySelector('.playbackTimeline__progressWrapper');
  if (!wrapper) {
    if (playerProgressTarget) {
      playerProgressObserver?.disconnect();
      playerProgressObserver = null;
      playerProgressTarget = null;
      document.documentElement?.classList.remove('cusade-player-progress');
    }
    return;
  }
  if (playerProgressTarget !== wrapper) {
    playerProgressObserver?.disconnect();
    playerProgressObserver = new MutationObserver(() => applyPlayerProgress(wrapper));
    playerProgressObserver.observe(wrapper, {
      attributes: true,
      attributeFilter: ['aria-valuenow', 'aria-valuemax']
    });
    playerProgressTarget = wrapper;
  }
  applyPlayerProgress(wrapper);
}

function playbackSeconds(value) {
  const parts = value.trim().split(':').map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some(part => !Number.isInteger(part) || part < 0)) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function syncDiscordPresence() {
  if (!discordRpc || !discordClientId) return;
  const badge = document.querySelector('.playbackSoundBadge');
  const titleLink = badge?.querySelector('.playbackSoundBadge__titleLink');
  const artistLink = badge?.querySelector('.playbackSoundBadge__lightLink');
  if (!titleLink?.href || !artistLink?.textContent.trim()) {
    if (lastDiscordStateKey) ipcRenderer.send('cusade:playback-state', null);
    lastDiscordStateKey = '';
    return;
  }
  const title = titleLink.title || titleLink.querySelector('[aria-hidden="true"]')?.textContent || titleLink.textContent;
  const artwork = badge.querySelector('.image__full')?.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1]
    ?.replace(/-t\d+x\d+\./, '-t500x500.');
  const paused = badge.classList.contains('paused');
  const key = `${titleLink.href}|${title}|${artistLink.textContent}|${artwork}|${paused}`;
  if (key === lastDiscordStateKey && Date.now() - lastDiscordSync < 5000) return;
  lastDiscordStateKey = key;
  lastDiscordSync = Date.now();
  ipcRenderer.send('cusade:playback-state', {
    title: title?.trim() || '',
    artist: artistLink.textContent.trim(),
    artwork: artwork || '',
    url: titleLink.href,
    paused,
    elapsed: playbackSeconds(document.querySelector('.playbackTimeline__timePassed [aria-hidden="true"]')?.textContent || ''),
    duration: playbackSeconds(document.querySelector('.playbackTimeline__duration [aria-hidden="true"]')?.textContent || '')
  });
}

function waitForPageElement(selector, path, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const element = location.pathname === path && document.querySelector(selector);
      if (element) {
        clearInterval(timer);
        resolve(element);
      } else if (Date.now() - started > timeout) {
        clearInterval(timer);
        reject(new Error(`SoundCloud did not open ${path}`));
      }
    }, 150);
  });
}

function waitForPlayback(trackUrl, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (document.querySelector('.playbackSoundBadge__titleLink')?.href === trackUrl) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > timeout) {
        clearInterval(timer);
        reject(new Error('Liked track did not start'));
      }
    }, 150);
  });
}

async function playShuffledLikes() {
  if (likesShuffleInProgress) return;
  likesShuffleInProgress = true;
  const originalScrollY = window.scrollY;
  let transition;
  let failed = false;
  try {
    const likesLink = document.querySelector('.likesModule .sidebarHeader[href="/you/likes"]');
    if (!likesLink) throw new Error('Likes link is unavailable');
    const screenshot = await ipcRenderer.invoke('cusade:capture-page');
    if (!screenshot?.startsWith('data:image/png;base64,')) {
      throw new Error('Could not capture the current page');
    }
    const image = new Image();
    image.src = screenshot;
    await image.decode();
    transition = document.createElement('div');
    transition.className = 'cusade-likes-transition';
    transition.setAttribute('aria-label', ui('Загружаю лайкнутые треки', 'Loading liked tracks'));
    transition.appendChild(image);
    document.body.appendChild(transition);
    likesLink.click();
    await waitForPageElement('.collection__likesSection .badgeList__item .playableTile__playButton a', '/you/likes');
    const currentTrack = document.querySelector('.playbackSoundBadge__titleLink')?.href;
    const tracks = [...document.querySelectorAll('.collection__likesSection .badgeList__item')]
      .map(item => ({
        play: item.querySelector('.playableTile__playButton a'),
        url: item.querySelector('.playableTile__artworkLink')?.href
      }))
      .filter(track => track.play && track.url && track.url !== currentTrack);
    if (!tracks.length) throw new Error('No liked tracks found');
    const shuffle = document.querySelector('.playControls .shuffleControl');
    if (!shuffle) throw new Error('Shuffle control is unavailable');
    if (!shuffle.classList.contains('m-shuffling')) shuffle.click();
    const track = tracks[Math.floor(Math.random() * tracks.length)];
    track.play.click();
    await waitForPlayback(track.url);
  } catch (error) {
    failed = true;
    console.error('Could not play shuffled likes:', error);
  } finally {
    if (location.pathname !== '/discover') {
      document.querySelector('a.header__logoLink')?.click();
    }
    await Promise.all([
      waitForPageElement('[data-test-id="home"] .mixedSelectionModule', '/discover', 10000),
      waitForPageElement('.streamSidebar .likesModule', '/discover', 10000)
    ])
      .catch(error => {
        failed = true;
        console.error('Could not return to SoundCloud home:', error);
      });
    window.scrollTo(0, originalScrollY);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    transition?.remove();
    likesShuffleInProgress = false;
    syncHomeLikesButton();
    if (failed) {
      const status = likesShuffleHost?.querySelector('.cusade-likes-shuffle__status');
      if (status) status.textContent = ui('Не удалось запустить лайкнутые треки.', 'Could not play liked tracks.');
    }
  }
}

function syncHomeLikesButton() {
  const likesModule = document.querySelector('[data-test-id="home"]') &&
    document.querySelector('.likesModule');
  if (!showYourLikesButton || !likesModule) {
    likesShuffleHost?.remove();
    likesShuffleHost = null;
    return;
  }
  if (likesShuffleHost?.isConnected) return;
  likesShuffleHost = document.createElement('article');
  likesShuffleHost.className = 'sidebarModule cusade-likes-shuffle';
  likesShuffleHost.innerHTML = `
    <button class="cusade-likes-shuffle__button" type="button" title="${ui('Слушать понравившиеся треки в случайном порядке', 'Play your liked tracks in random order')}">
      <span>${ui('Мои лайки', 'Your likes')}</span>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.03 7.03 15.56 4.5 13.03 1.97l-1.06 1.06.72.72h-.45c-1.32 0-2.58.55-3.48 1.52L7.25 6.9 5.74 5.27C4.84 4.3 3.58 3.75 2.26 3.75H1v1.5h1.26c.9 0 1.77.38 2.38 1.04L6.23 8l-1.59 1.71c-.61.66-1.48 1.04-2.38 1.04H1v1.5h1.26c1.32 0 2.58-.55 3.48-1.52L7.25 9.1l1.51 1.63c.9.97 2.16 1.52 3.48 1.52h.45l-.72.72 1.06 1.06 2.53-2.53-2.53-2.53-1.06 1.06.72.72h-.45c-.9 0-1.77-.38-2.38-1.04L8.27 8l1.59-1.71c.61-.66 1.48-1.04 2.38-1.04h.45l-.72.72 1.06 1.06Z"/></svg>
    </button>
    <p class="cusade-likes-shuffle__status" aria-live="polite"></p>`;
  likesShuffleHost.querySelector('button').addEventListener('click', playShuffledLikes);
  likesModule.parentElement.prepend(likesShuffleHost);
}

function insightsContainers() {
  const main = document.querySelector('[data-test-id="home"]')?.closest('.l-main');
  return main ? {
    main,
    sidebar: main.parentElement.querySelector('.streamSidebar'),
    feed: main.querySelector('[data-test-id="home"] .lazyLoadingList__list')
  } : null;
}

function insightsItems(container) {
  return [...container.children].filter(child =>
    child !== insightsBanner && child !== insightsFeedSlot && !child.classList.contains('cusade-insights-dropzone'));
}

function applyInsightsDimensions() {
  if (insightsBanner) {
    const width = insightsLayout.width ? `${insightsLayout.width}px` : '100%';
    const height = insightsLayout.height ? `${insightsLayout.height}px` : '';
    if (insightsBanner.style.width !== width) insightsBanner.style.width = width;
    if (insightsBanner.style.height !== height) insightsBanner.style.height = height;
  }
  const frame = insightsContainers()?.main.parentElement;
  if (!frame) return;
  const wide = insightsLayout.location === 'sidebar' && insightsLayout.width > 360 && insightsBanner?.isConnected;
  if (frame.classList.contains('cusade-insights-wide-sidebar') !== Boolean(wide)) {
    frame.classList.toggle('cusade-insights-wide-sidebar', wide);
  }
  const sidebarWidth = wide ? `${insightsLayout.width + 24}px` : '';
  if (frame.style.getPropertyValue('--cusade-insights-sidebar-width') !== sidebarWidth) {
    if (sidebarWidth) frame.style.setProperty('--cusade-insights-sidebar-width', sidebarWidth);
    else frame.style.removeProperty('--cusade-insights-sidebar-width');
  }
}

function placeInsights() {
  const containers = insightsContainers();
  if (!containers) return;
  const location = containers[insightsLayout.location] ? insightsLayout.location
    : containers.sidebar ? 'sidebar' : 'main';
  const container = containers[location];
  if (!container) return;
  if (location === 'feed') {
    if (!insightsFeedSlot) {
      insightsFeedSlot = document.createElement('li');
      insightsFeedSlot.className = 'cusade-insights-slot';
    }
    insightsFeedSlot.append(insightsBanner);
    const items = insightsItems(container);
    container.insertBefore(insightsFeedSlot, items[insightsLayout.index] || null);
  } else {
    insightsFeedSlot?.remove();
    const items = insightsItems(container);
    container.insertBefore(insightsBanner, items[insightsLayout.index] || null);
  }
  applyInsightsDimensions();
}

function saveInsightsLayout(previous) {
  const selected = { ...insightsLayout };
  insightsLayoutSave = insightsLayoutSave.then(async () => {
    try {
      await ipcRenderer.invoke('cusade:set-insights-layout', selected);
    } catch (error) {
      if (Object.keys(selected).every(key => insightsLayout[key] === selected[key])) {
        insightsLayout = previous;
        placeInsights();
        renderInsightsDropZones();
      }
      console.error('Could not save cusade Insights layout:', error);
    }
  });
  return insightsLayoutSave;
}

function clearInsightsDropZones() {
  for (const zone of insightsDropZones) zone.remove();
  insightsDropZones = [];
}

function renderInsightsDropZones() {
  clearInsightsDropZones();
  if (!insightsEditMode) return;
  const containers = insightsContainers();
  if (!containers) return;
  for (const [location, container] of Object.entries(containers)) {
    if (!container) continue;
    const items = insightsItems(container);
    for (let index = 0; index <= items.length; index++) {
      const zone = document.createElement(location === 'feed' ? 'li' : 'button');
      zone.className = 'cusade-insights-dropzone';
      zone.dataset.location = location;
      zone.dataset.index = String(index);
      zone.textContent = '＋ Insights';
      zone.setAttribute('aria-label', ui('Поместить Insights сюда', 'Place Insights here'));
      if (location === 'feed') { zone.tabIndex = 0; zone.setAttribute('role', 'button'); }
      else zone.type = 'button';
      const move = () => moveInsightsTo(location, index);
      zone.addEventListener('click', event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        move();
      });
      zone.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault(); event.stopImmediatePropagation(); move();
        }
      });
      container.insertBefore(zone, items[index] || null);
      insightsDropZones.push(zone);
    }
  }
}

function finishInsightsEdit() {
  clearInsightsDrag();
  insightsEditMode = false;
  document.documentElement.classList.remove('cusade-insights-editing');
  clearInsightsDropZones();
  document.querySelector('.cusade-insights-editbar')?.remove();
}

function clearInsightsDrag() {
  insightsDrag?.ghost?.remove();
  document.querySelectorAll('.cusade-insights-drag-ghost').forEach(ghost => ghost.remove());
  insightsDrag = null;
  document.documentElement.classList.remove('cusade-insights-dragging');
  for (const zone of insightsDropZones) zone.classList.remove('cusade-insights-dropzone--active');
}

function moveInsightsTo(location, index) {
  const previous = { ...insightsLayout };
  const changedColumn = location !== insightsLayout.location;
  insightsLayout = { ...insightsLayout, location, index,
    width: changedColumn ? 0 : insightsLayout.width,
    height: changedColumn ? 0 : insightsLayout.height };
  placeInsights();
  renderInsightsDropZones();
  saveInsightsLayout(previous);
}

function nearestInsightsDropZone(x, y) {
  let selected;
  let bestDistance = Infinity;
  for (const zone of insightsDropZones) {
    const rect = zone.getBoundingClientRect();
    const dx = Math.max(rect.left - x, 0, x - rect.right);
    const dy = Math.max(rect.top - y, 0, y - rect.bottom);
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) { bestDistance = distance; selected = zone; }
  }
  return selected;
}

function startInsightsEdit() {
  if (insightsEditMode) return;
  insightsEditMode = true;
  document.documentElement.classList.add('cusade-insights-editing');
  const bar = document.createElement('div');
  bar.className = 'cusade-insights-editbar';
  const hint = document.createElement('span');
  hint.textContent = ui('Зажмите карточку и перенесите. Тяните за угол, чтобы изменить размер.',
    'Hold and drag the card. Drag the corner to resize.');
  const done = document.createElement('button');
  done.type = 'button'; done.textContent = ui('Готово', 'Done');
  done.addEventListener('click', finishInsightsEdit);
  bar.append(hint, done);
  document.body.append(bar);
  renderInsightsDropZones();
}

function createInsightsBanner() {
  const banner = document.createElement('article');
  banner.className = 'cusade-insights-banner';
  const top = document.createElement('div'); top.className = 'cusade-insights-banner__top';
  const copy = document.createElement('div');
  const title = document.createElement('strong'); title.textContent = 'cusade Insights';
  const detail = document.createElement('p');
  detail.textContent = ui('Ваш музыкальный дневник и статистика прослушиваний.',
    'Your music diary and listening stats.');
  copy.append(title, detail);
  const more = document.createElement('button');
  more.type = 'button'; more.className = 'cusade-insights-banner__more';
  more.textContent = '⋯'; more.setAttribute('aria-label', ui('Меню Insights', 'Insights menu'));
  more.setAttribute('aria-expanded', 'false');
  const menu = document.createElement('div'); menu.className = 'cusade-insights-banner__menu'; menu.hidden = true;
  const move = document.createElement('button'); move.type = 'button';
  move.textContent = ui('Перенести', 'Move');
  move.addEventListener('click', () => { menu.hidden = true; more.setAttribute('aria-expanded', 'false'); startInsightsEdit(); });
  const hide = document.createElement('button'); hide.type = 'button';
  hide.textContent = ui('Скрыть на 3 дня', 'Hide for 3 days');
  hide.addEventListener('click', async () => {
    hide.disabled = true;
    try {
      insightsHiddenUntil = await ipcRenderer.invoke('cusade:hide-insights');
      finishInsightsEdit();
      syncInsightsBanner();
      updateInsightsRestoreControl();
    } catch (error) { console.error('Could not hide cusade Insights:', error); hide.disabled = false; }
  });
  menu.append(move, hide);
  more.addEventListener('click', () => {
    menu.hidden = !menu.hidden;
    more.setAttribute('aria-expanded', String(!menu.hidden));
  });
  top.append(copy, more);
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'cusade-insights-banner__open';
  button.textContent = ui('Моя статистика →', 'My insights →');
  button.addEventListener('click', openInsights);
  const resize = document.createElement('button');
  resize.type = 'button'; resize.className = 'cusade-insights-banner__resize';
  resize.setAttribute('aria-label', ui('Изменить размер Insights', 'Resize Insights'));
  resize.addEventListener('pointerdown', event => {
    if (!insightsEditMode) return;
    event.preventDefault();
    const rect = banner.getBoundingClientRect();
    insightsResize = { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      width: rect.width, height: rect.height,
      previous: { ...insightsLayout } };
  });
  banner.addEventListener('pointerdown', event => {
    if (!insightsEditMode || event.button !== 0 || event.target.closest('button')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const rect = banner.getBoundingClientRect();
    insightsDrag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, width: rect.width,
      height: rect.height, ghost: null, zone: null };
  });
  banner.append(top, button, menu, resize);
  return banner;
}

document.addEventListener('pointermove', event => {
  if (insightsResize?.pointerId === event.pointerId) {
    event.preventDefault();
    insightsLayout.width = Math.max(240, Math.min(insightsLayout.location === 'sidebar' ? 600 : 900,
      Math.round(insightsResize.width + event.clientX - insightsResize.x)));
    insightsLayout.height = Math.max(120, Math.min(800,
      Math.round(insightsResize.height + event.clientY - insightsResize.y)));
    applyInsightsDimensions();
    return;
  }
  const drag = insightsDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  if (!drag.ghost && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
  event.preventDefault();
  if (!drag.ghost) {
    drag.ghost = insightsBanner.cloneNode(true);
    drag.ghost.classList.add('cusade-insights-drag-ghost');
    drag.ghost.style.width = `${drag.width}px`;
    drag.ghost.style.height = `${drag.height}px`;
    document.body.append(drag.ghost);
    document.documentElement.classList.add('cusade-insights-dragging');
  }
  drag.ghost.style.left = `${event.clientX - drag.offsetX}px`;
  drag.ghost.style.top = `${event.clientY - drag.offsetY}px`;
  if (event.clientY < 75) window.scrollBy(0, -14);
  else if (event.clientY > window.innerHeight - 80) window.scrollBy(0, 14);
  const zone = nearestInsightsDropZone(event.clientX, event.clientY);
  if (zone !== drag.zone) {
    drag.zone?.classList.remove('cusade-insights-dropzone--active');
    zone?.classList.add('cusade-insights-dropzone--active');
    drag.zone = zone;
  }
}, true);

function endInsightsDrag(event) {
  if (insightsResize?.pointerId === event.pointerId) {
    const previous = insightsResize.previous;
    insightsResize = null;
    saveInsightsLayout(previous);
    return;
  }
  const drag = insightsDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const zone = drag.ghost ? drag.zone : null;
  if (drag.ghost) {
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressInsightsClickUntil = Date.now() + 300;
  }
  clearInsightsDrag();
  if (zone?.isConnected && event.type === 'pointerup') {
    moveInsightsTo(zone.dataset.location, Number(zone.dataset.index));
  }
}

document.addEventListener('pointerup', endInsightsDrag, true);
document.addEventListener('pointercancel', endInsightsDrag, true);
document.addEventListener('click', event => {
  if (Date.now() < suppressInsightsClickUntil) {
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressInsightsClickUntil = 0;
  }
}, true);

function syncInsightsBanner() {
  const containers = insightsContainers();
  if (!containers) {
    if (!insightsMissingSince) insightsMissingSince = Date.now();
    if (Date.now() - insightsMissingSince < 3000) return;
  } else insightsMissingSince = 0;
  if (!containers || insightsHiddenUntil > Date.now()) {
    insightsBanner?.remove();
    insightsFeedSlot?.remove();
    if (insightsHiddenUntil > Date.now()) {
      if (insightsEditMode) finishInsightsEdit();
    } else clearInsightsDropZones();
    applyInsightsDimensions();
    return;
  }
  if (!insightsBanner) insightsBanner = createInsightsBanner();
  const expected = insightsLayout.location === 'feed' ? insightsFeedSlot : containers[insightsLayout.location];
  const actualContainer = insightsLayout.location === 'feed' ? containers.feed : containers[insightsLayout.location];
  const node = insightsLayout.location === 'feed' ? insightsFeedSlot : insightsBanner;
  const positioned = actualContainer && node?.parentElement === actualContainer &&
    [...actualContainer.children].filter(child => !child.classList.contains('cusade-insights-dropzone'))
      .indexOf(node) === Math.min(insightsLayout.index, insightsItems(actualContainer).length);
  if (!insightsBanner.isConnected || !expected ||
      (insightsLayout.location === 'feed' && insightsFeedSlot?.parentElement !== containers.feed) ||
      (insightsLayout.location !== 'feed' && insightsBanner.parentElement !== expected) || !positioned) {
    placeInsights();
    if (insightsEditMode) renderInsightsDropZones();
  }
  if (insightsEditMode && (insightsDropZones.some(zone => !zone.isConnected) ||
      insightsDropZones.length !== Object.values(containers).filter(Boolean)
        .reduce((total, container) => total + insightsItems(container).length + 1, 0))) {
    renderInsightsDropZones();
  }
  applyInsightsDimensions();
}

document.addEventListener('click', event => {
  const menu = insightsBanner?.querySelector('.cusade-insights-banner__menu');
  if (menu && !insightsBanner.contains(event.target)) {
    menu.hidden = true;
    insightsBanner.querySelector('.cusade-insights-banner__more')?.setAttribute('aria-expanded', 'false');
  }
});

function flushInsightPlayback(state) {
  const seconds = Math.floor(state.pending);
  if (seconds < 1 || state.saving) return;
  state.pending -= seconds;
  state.saving = true;
  ipcRenderer.invoke('cusade:record-insight', {
    sessionId: state.id, title: state.title, artist: state.artist,
    url: state.url, artwork: state.artwork, seconds: Math.min(seconds, 10)
  }).then(() => {
    state.saving = false;
    if (state.pending >= 1 && state !== insightPlayback) flushInsightPlayback(state);
  }).catch(error => {
    state.saving = false;
    state.pending += Math.min(seconds, 10);
    console.error('Could not save cusade Insights playback:', error);
  });
  if (seconds > 10) state.pending += seconds - 10;
}

function syncInsightsPlayback() {
  const badge = document.querySelector('.playbackSoundBadge');
  const titleLink = badge?.querySelector('.playbackSoundBadge__titleLink');
  const artist = badge?.querySelector('.playbackSoundBadge__lightLink')?.textContent.trim();
  const title = titleLink?.title || titleLink?.querySelector('[aria-hidden="true"]')?.textContent || titleLink?.textContent.trim();
  const url = titleLink?.href;
  const now = Date.now();
  if (!url || !artist || !title || badge.classList.contains('paused')) {
    if (insightPlayback) {
      if (insightPlayback.pending >= 1) flushInsightPlayback(insightPlayback);
      insightPlayback.lastElapsed = null;
    }
    return;
  }
  const elapsed = playbackSeconds(document.querySelector('.playbackTimeline__timePassed [aria-hidden="true"]')?.textContent || '');
  if (!insightPlayback || insightPlayback.url !== url) {
    if (insightPlayback?.pending >= 1) flushInsightPlayback(insightPlayback);
    const artworkUrl = badge.querySelector('.image__full')?.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1]
      ?.replace(/-t\d+x\d+\./, '-t500x500.') || '';
    const artwork = /^https:\/\/([a-z0-9-]+\.)*sndcdn\.com\//i.test(artworkUrl) ? artworkUrl : '';
    insightPlayback = { id: `${now}-${Math.random().toString(36).slice(2)}`, title: title.trim().slice(0, 300),
      artist: artist.slice(0, 300), url, artwork, pending: 0, saving: false, lastElapsed: elapsed, lastWall: now };
    return;
  }
  const state = insightPlayback;
  if (state.lastElapsed !== null) {
    const progress = elapsed - state.lastElapsed;
    const wall = (now - state.lastWall) / 1000;
    if (progress > 0 && wall > 0) state.pending += Math.min(progress, wall + 1);
  }
  state.lastElapsed = elapsed;
  state.lastWall = now;
  if (state.pending >= 5) flushInsightPlayback(state);
}

function insightSummary(sessions, since = 0) {
  const tracks = new Map();
  const artists = new Map();
  let seconds = 0;
  let plays = 0;
  for (const session of sessions) {
    if (session.lastPlayedAt < since || !Number.isFinite(session.seconds)) continue;
    seconds += session.seconds;
    if (session.seconds < 30) continue;
    plays++;
    const track = tracks.get(session.url) || { ...session, plays: 0, seconds: 0 };
    track.plays++;
    track.seconds += session.seconds;
    track.lastPlayedAt = Math.max(track.lastPlayedAt, session.lastPlayedAt);
    if (session.artwork) track.artwork = session.artwork;
    tracks.set(session.url, track);
    const artist = artists.get(session.artist) || { name: session.artist, plays: 0, seconds: 0, artwork: '' };
    artist.plays++;
    artist.seconds += session.seconds;
    if (session.artwork && (!artist.artwork || session.lastPlayedAt >= (artist.artworkAt || 0))) {
      artist.artwork = session.artwork;
      artist.artworkAt = session.lastPlayedAt;
    }
    artists.set(session.artist, artist);
  }
  const byPlays = (a, b) => b.plays - a.plays || b.seconds - a.seconds;
  return { seconds, plays, tracks: [...tracks.values()].sort(byPlays),
    artists: [...artists.values()].sort(byPlays) };
}

function formatInsightDate(value) {
  return new Date(value).toLocaleDateString(appLanguage === 'ru' ? 'ru-RU' : 'en-US',
    { day: 'numeric', month: 'short', year: 'numeric' });
}

function insightArtwork(item, round = false) {
  const art = document.createElement('span');
  art.className = `insight-art${round ? ' round' : ''}`;
  if (/^https:\/\/([a-z0-9-]+\.)*sndcdn\.com\//i.test(item.artwork || '')) {
    const image = document.createElement('img');
    image.src = item.artwork.replace(/-t\d+x\d+\./, '-t200x200.');
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.onerror = () => image.remove();
    art.append(image);
  }
  return art;
}

function insightRow(item, index, kind, maxPlays = 0) {
  const row = document.createElement('li');
  row.className = 'rank-row';
  const rank = document.createElement('span'); rank.className = 'rank'; rank.textContent = String(index + 1).padStart(2, '0');
  const art = insightArtwork(item, kind === 'artist');
  const info = document.createElement('div'); info.className = 'rank-info';
  const name = document.createElement(kind === 'track' ? 'a' : 'span');
  name.className = 'rank-name'; name.textContent = kind === 'track' ? item.title : item.name;
  if (kind === 'track') name.href = item.url;
  const detail = document.createElement('small');
  detail.textContent = kind === 'track' ? item.artist : `${item.plays} ${ui('прослушиваний', 'plays')}`;
  const bar = document.createElement('span'); bar.className = 'rank-bar';
  const fill = document.createElement('span');
  fill.style.transform = `scaleX(${(Math.max(4, item.plays / Math.max(1, maxPlays)) / 100).toFixed(4)})`;
  bar.append(fill); info.append(name, detail, bar);
  const count = document.createElement('span'); count.className = 'rank-count'; count.textContent = `${item.plays} ×`;
  row.append(rank, art, info, count);
  return row;
}

function insightActivity(sessions, period) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const count = period === 'week' ? 7 : period === 'month' ? 10 : 12;
  const buckets = Array.from({ length: count }, (_, index) => {
    const start = period === 'all'
      ? new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1)
      : new Date(first.getFullYear(), first.getMonth(), first.getDate() - (count - 1 - index) * (period === 'month' ? 3 : 1) - (period === 'month' ? 2 : 0));
    const end = period === 'all' ? new Date(start.getFullYear(), start.getMonth() + 1, 1)
      : new Date(start.getFullYear(), start.getMonth(), start.getDate() + (period === 'month' ? 3 : 1));
    const label = period === 'all' ? start.toLocaleDateString(appLanguage === 'ru' ? 'ru-RU' : 'en-US', { month: 'short' })
      : start.toLocaleDateString(appLanguage === 'ru' ? 'ru-RU' : 'en-US', period === 'week' ? { weekday: 'short' } : { day: 'numeric', month: 'short' });
    return { start: start.getTime(), end: end.getTime(), label, seconds: 0 };
  });
  for (const session of sessions) {
    if (!Number.isFinite(session.seconds)) continue;
    const bucket = buckets.find(item => session.lastPlayedAt >= item.start && session.lastPlayedAt < item.end);
    if (bucket) bucket.seconds += session.seconds;
  }
  return buckets;
}

function insightCoverColor(image) {
  const sample = document.createElement('canvas');
  sample.width = 48; sample.height = 48;
  const context = sample.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, 48, 48);
  const pixels = context.getImageData(0, 0, 48, 48).data;
  const bins = Array.from({ length: 12 }, () => ({ weight: 0, channels: [0, 0, 0] }));
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 180) continue;
    const rgb = [pixels[index], pixels[index + 1], pixels[index + 2]];
    const max = Math.max(...rgb), min = Math.min(...rgb), delta = max - min;
    if (delta < 50 || max < 65 || min > 205) continue;
    let hue = max === rgb[0] ? (rgb[1] - rgb[2]) / delta
      : max === rgb[1] ? (rgb[2] - rgb[0]) / delta + 2 : (rgb[0] - rgb[1]) / delta + 4;
    hue = ((hue * 60) + 360) % 360;
    const weight = delta / 255 * (0.5 + max / 255);
    const bin = bins[Math.floor(hue / 30)];
    bin.weight += weight;
    for (let channel = 0; channel < 3; channel++) bin.channels[channel] += rgb[channel] * weight;
  }
  const best = bins.sort((a, b) => b.weight - a.weight)[0];
  if (best.weight < 2) return null;
  return best.channels.map(value => Math.round(value / best.weight));
}

async function drawInsightCard(summary, period) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 630;
  const ctx = canvas.getContext('2d');
  const topTrack = summary.tracks[0];
  let cover = null;
  let color = '#443554';
  if (/^https:\/\/([a-z0-9-]+\.)*sndcdn\.com\//i.test(topTrack?.artwork || '')) {
    try {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = topTrack.artwork;
      await image.decode();
      cover = image;
      const vibrant = insightCoverColor(image);
      if (vibrant) color = `rgb(${vibrant.map(value => Math.round(value * .3 + 9)).join(',')})`;
      else color = await artworkThemeColor(topTrack.artwork);
    } catch { color = fallbackPlaybackColor(topTrack.artwork); }
  }
  const parsed = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  const channels = parsed ? parsed.slice(1).map(Number) : [68, 53, 84];
  const accent = channels.map(value => Math.min(255, Math.round(value * 2.15 + 75)));
  const accentColor = `rgb(${accent.join(',')})`;
  const background = ctx.createLinearGradient(0, 0, 1200, 630);
  background.addColorStop(0, color);
  background.addColorStop(.53, '#1d1d28');
  background.addColorStop(1, '#10131a');
  ctx.fillStyle = background; ctx.fillRect(0, 0, 1200, 630);
  const glow = ctx.createRadialGradient(925, 290, 20, 925, 290, 600);
  glow.addColorStop(0, `rgba(${accent.join(',')},.27)`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, 1200, 630);
  ctx.strokeStyle = '#ffffff1c'; ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, 1152, 582);
  ctx.fillStyle = '#ffffff24'; ctx.beginPath(); ctx.roundRect(64, 56, 35, 35, 10); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '700 23px system-ui'; ctx.textAlign = 'center'; ctx.fillText('♫', 81.5, 82);
  ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = '750 23px system-ui'; ctx.fillText('cusade', 113, 82);
  ctx.fillStyle = accentColor; ctx.font = '700 18px system-ui'; ctx.fillText('INSIGHTS', 213, 81);
  ctx.fillStyle = '#ffffff22'; ctx.beginPath(); ctx.roundRect(64, 127, Math.max(175, ctx.measureText(period).width + 45), 38, 19); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '600 16px system-ui'; ctx.fillText(period, 85, 153);
  ctx.font = '750 50px system-ui'; ctx.fillText(ui('Моя музыка', 'My music'), 64, 230);
  ctx.fillStyle = '#ffffffa8'; ctx.font = '18px system-ui';
  ctx.fillText(ui('Моменты, которые звучали со мной', 'The moments that stayed with me'), 66, 263);
  const drawStat = (value, label, x) => {
    ctx.fillStyle = '#fff'; ctx.font = '750 60px system-ui'; ctx.fillText(String(value), x, 365);
    ctx.fillStyle = '#ffffffaa'; ctx.font = '17px system-ui'; ctx.fillText(label, x + 2, 397);
  };
  drawStat(summary.plays, ui('прослушиваний', 'plays'), 64);
  drawStat(Math.round(summary.seconds / 60), ui('минут', 'minutes'), 265);
  drawStat(summary.tracks.length, ui('треков', 'tracks'), 440);
  ctx.fillStyle = '#ffffff25'; ctx.fillRect(64, 434, 590, 1);
  const fit = (value, max) => {
    const chars = [...(value || '—')];
    while (chars.length > 1 && ctx.measureText(chars.join('') + '…').width > max) chars.pop();
    return chars.length < [...(value || '—')].length ? chars.join('') + '…' : chars.join('');
  };
  ctx.fillStyle = accentColor; ctx.font = '700 15px system-ui'; ctx.fillText(ui('ТРЕК НА ПОВТОРЕ', 'ON REPEAT'), 64, 471);
  ctx.fillStyle = '#fff'; ctx.font = '700 26px system-ui'; ctx.fillText(fit(topTrack?.title, 580), 64, 506);
  ctx.fillStyle = '#ffffffb8'; ctx.font = '18px system-ui'; ctx.fillText(fit(topTrack?.artist, 580), 64, 535);
  ctx.fillStyle = '#ffffffaa'; ctx.font = '15px system-ui';
  ctx.fillText(`${ui('Любимый исполнитель', 'Top artist')}: ${fit(summary.artists[0]?.name, 420)}`, 64, 581);
  ctx.fillStyle = '#ffffff50'; ctx.fillText('cusade · SoundCloud Desktop', 730, 580);
  ctx.save();
  ctx.shadowColor = '#0009'; ctx.shadowBlur = 36; ctx.shadowOffsetY = 16;
  ctx.fillStyle = '#ffffff12'; ctx.beginPath(); ctx.roundRect(708, 106, 426, 426, 24); ctx.fill();
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.roundRect(715, 113, 412, 412, 19); ctx.clip();
  if (cover) {
    const side = Math.min(cover.naturalWidth, cover.naturalHeight);
    ctx.drawImage(cover, (cover.naturalWidth - side) / 2, (cover.naturalHeight - side) / 2, side, side, 715, 113, 412, 412);
  } else {
    const placeholder = ctx.createLinearGradient(715, 113, 1127, 525);
    placeholder.addColorStop(0, accentColor); placeholder.addColorStop(1, color);
    ctx.fillStyle = placeholder; ctx.fillRect(715, 113, 412, 412);
    ctx.fillStyle = '#ffffff90'; ctx.textAlign = 'center'; ctx.font = '140px system-ui'; ctx.fillText('♫', 921, 370); ctx.textAlign = 'left';
  }
  ctx.restore();
  ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(715, 113, 412, 412, 19); ctx.stroke();
  return canvas.toDataURL('image/png');
}

async function openInsights() {
  if (insightsHost) insightsHost.shadowRoot?.querySelector('.close')?.click();
  insightsHost = document.createElement('div');
  insightsHost.id = 'cusade-insights-host';
  insightsHost.classList.toggle('cusade-animations', motionActive());
  insightsHost.style.cssText = 'position:fixed;inset:0;z-index:2147483646';
  const shadow = insightsHost.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>
    *{box-sizing:border-box} .backdrop{position:fixed;inset:0;background:#07080ce0}
    .panel{--text:var(--font-primary-color,#f7f7f8);--subtle:var(--font-secondary-color,#a6a8b1);--surface:color-mix(in srgb,var(--text) 5%,var(--background-surface-color,#191a20));--line:color-mix(in srgb,var(--text) 11%,transparent);--accent:var(--cusade-accent,#ff5500);position:fixed;inset:3vh 24px;max-width:1100px;margin:auto;overflow:auto;border:1px solid var(--line);border-radius:22px;background:var(--background-surface-color,#191a20);color:var(--text);box-shadow:0 16px 40px #0008;font:14px system-ui,sans-serif;scrollbar-color:var(--line) transparent}
    button{border:0;cursor:pointer;font:600 13px system-ui,sans-serif} button:disabled{opacity:.55;cursor:wait} button:hover{filter:brightness(1.13)} a{color:inherit;text-decoration:none} a:hover{text-decoration:underline}
    .hero{position:relative;overflow:hidden;min-height:216px;padding:29px 34px;background-color:var(--hero-color,#4d3541);background-image:linear-gradient(115deg,#17192388,#191b24 85%);color:#fff}
    :host(.cusade-animations) .hero{transition:background-color 880ms cubic-bezier(.3,.62,.36,1)}
    .hero:after{content:"";position:absolute;right:-90px;top:-205px;width:500px;height:500px;border:1px solid #ffffff18;border-radius:50%;pointer-events:none}
    .hero-art{position:absolute;right:16%;top:-95px;width:360px;height:360px;object-fit:cover;opacity:.12;transform:rotate(-15deg)}
    .hero-top,.hero-content{position:relative;z-index:1}.hero-top{display:flex;justify-content:space-between;align-items:center}.brand{display:flex;align-items:center;gap:9px;font-size:13px;font-weight:750;letter-spacing:.02em}.brand-mark{width:22px;height:22px;border-radius:7px;background:#fff3;display:grid;place-items:center;color:#fff}.hero h1{margin:26px 0 5px;font-size:34px;line-height:1.12;letter-spacing:-.045em}.hero p{max-width:620px;margin:0;color:#ffffffb8;line-height:1.5}.close{width:32px;height:32px;border-radius:50%;background:#ffffff20;color:#fff;font-size:21px;line-height:1}
    .content{padding:28px 34px 32px}.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:22px}.eyebrow{font-size:11px;font-weight:750;letter-spacing:.11em;text-transform:uppercase;color:var(--subtle)}.controls{display:flex;gap:4px;padding:4px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}.controls button{padding:8px 13px;border-radius:8px;background:transparent;color:var(--subtle)}.controls button.selected{background:var(--accent);color:#fff;box-shadow:0 3px 12px #0002}
    .metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.metric{min-height:109px;padding:17px 18px;border:1px solid var(--line);border-radius:14px;background:var(--surface)}.metric-top{display:flex;align-items:center;gap:8px;color:var(--subtle);font-size:12px}.metric-icon{width:24px;height:24px;border-radius:7px;display:grid;place-items:center;background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent);font-size:14px}.metric strong{display:block;margin-top:13px;font-size:28px;line-height:1;letter-spacing:-.035em;font-variant-numeric:tabular-nums}
    .section{margin-top:28px}.section-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:15px}.section h2{margin:0;font-size:18px;letter-spacing:-.02em}.section-note,.muted,small{color:var(--subtle)}.section-note{font-size:12px}.activity-card{padding:19px 22px 16px;border:1px solid var(--line);border-radius:16px;background:var(--surface)}.activity-graph{display:grid;grid-template-columns:repeat(var(--bars),minmax(0,1fr));align-items:end;gap:8px;height:142px;border-bottom:1px solid var(--line)}.bar-slot{display:flex;align-items:flex-end;justify-content:center;height:100%;min-width:0}.bar{width:100%;max-width:45px;height:100%;transform:scaleY(.05);transform-origin:bottom;border-radius:6px 6px 0 0;background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 70%,#fff),var(--accent));opacity:.85}
    :host(.cusade-animations) .bar{transition:transform .62s cubic-bezier(.3,.62,.36,1)}.bar-slot:hover .bar{opacity:1}.activity-labels{display:grid;grid-template-columns:repeat(var(--bars),minmax(0,1fr));gap:8px;margin-top:9px;text-align:center;color:var(--subtle);font-size:10px}.activity-labels span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.activity-empty{padding:30px 0;text-align:center;color:var(--subtle)}
    .columns{display:grid;grid-template-columns:1fr 1fr;gap:26px}.list-card{padding:5px 17px;border:1px solid var(--line);border-radius:16px;background:var(--surface)}ol{padding:0;margin:0;list-style:none}.rank-row,.history-row{display:flex;align-items:center;gap:12px;min-height:67px;padding:9px 0;border-bottom:1px solid var(--line)}li:last-child{border-bottom:0}.rank{width:21px;flex:none;color:var(--subtle);font-size:11px;font-variant-numeric:tabular-nums}.insight-art{position:relative;display:block;flex:none;width:46px;height:46px;overflow:hidden;border-radius:9px;background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 28%,#34323a),#292b34)}.insight-art:before{content:"♫";position:absolute;inset:0;display:grid;place-items:center;color:#ffffff90;font-size:19px}.insight-art.round{border-radius:50%}.insight-art img{position:relative;width:100%;height:100%;object-fit:cover}.rank-info,.history-info{min-width:0;flex:1}.rank-name,.history-name{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:650}.rank-info small,.history-info small{display:block;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}.rank-bar{display:block;width:100%;height:3px;overflow:hidden;margin-top:8px;border-radius:2px;background:var(--line)}.rank-bar span{display:block;width:100%;height:100%;transform-origin:left center;border-radius:2px;background:var(--accent)}.rank-count{flex:none;color:var(--subtle);font-size:11px;font-variant-numeric:tabular-nums}.empty{padding:28px 4px;text-align:center;color:var(--subtle);line-height:1.5}
    .lower{display:grid;grid-template-columns:1fr 1fr;gap:26px}.history-row{min-height:60px}.history-row .insight-art{width:39px;height:39px}.history-row time{flex:none;color:var(--subtle);font-size:11px}.history-more{display:block;width:100%;padding:12px;border-top:1px solid var(--line);background:transparent;color:var(--accent)}.history-more[hidden]{display:none}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px;padding-top:22px;border-top:1px solid var(--line)}.actions button{padding:11px 15px;border-radius:9px;background:var(--surface);color:var(--text)}.actions .primary{background:var(--accent);color:#fff}.status{margin:10px 0 0;color:var(--subtle)}
    @media(max-width:750px){.panel{inset:0;border-radius:0}.hero{padding:24px}.content{padding:22px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.columns,.lower{grid-template-columns:1fr;gap:0}.topbar{align-items:flex-start;flex-direction:column}.activity-graph,.activity-labels{gap:3px}.hero-art{right:-80px}}
    @media(max-width:410px){.controls{width:100%}.controls button{flex:1;padding:8px 4px}.metric{padding:14px}.history-row time{max-width:65px;text-align:right}}
    :host(.cusade-animations) .backdrop{animation:cusade-fade-in 320ms cubic-bezier(.3,.62,.36,1) both}
    :host(.cusade-animations) .panel{animation:cusade-panel-in 380ms cubic-bezier(.3,.62,.36,1) both}
    :host(.cusade-animations){--cusade-hover:360ms cubic-bezier(.3,.62,.36,1)}
    /* Same rule as on the page: the lift animates, the shadow snaps in. A metric
       card is small, but the row list inside the window is not, and one animated
       shadow there costs the same order of paint as a whole feed. */
    :host(.cusade-animations) :is(button,.metric,.activity-card,.list-card,.rank-row,.history-row,.insight-art){transition:transform var(--cusade-hover),background-color var(--cusade-hover),filter var(--cusade-hover)}
    :host(.cusade-animations) :is(.metric,.activity-card,.list-card,.rank-row,.history-row,.insight-art):hover{transform:translateY(-2px);box-shadow:0 10px 22px #00000059}
    :host(.cusade-animations) button:hover{box-shadow:0 8px 20px color-mix(in srgb,var(--accent) 22%,transparent)}
    :host(.cusade-animations) button:active{transform:scale(.96)}
    :host(.cusade-animations) :is(.rank-row,.history-row):hover{background:color-mix(in srgb,var(--text) 4%,transparent)}
    @keyframes cusade-fade-in{from{opacity:0}to{opacity:1}}
    @keyframes cusade-panel-in{from{opacity:0;transform:translateY(16px) scale(.982)}to{opacity:1;transform:none}}
  </style><div class="backdrop"></div><main class="panel" role="dialog" aria-modal="true" aria-label="cusade Insights">
    <header class="hero"><img class="hero-art" alt=""><div class="hero-top"><span class="brand"><span class="brand-mark">♫</span>cusade Insights</span><button class="close" aria-label="${ui('Закрыть','Close')}">×</button></div><div class="hero-content"><h1>${ui('Ваша музыка в деталях','Your music, in detail')}</h1><p>${ui('Личный музыкальный дневник. Данные хранятся только на этом компьютере и пополняются во время прослушивания в приложении.', 'Your personal music diary. Data stays on this computer and grows while you listen in the app.')}</p></div></header>
    <div class="content"><div class="topbar"><span class="eyebrow">${ui('Обзор прослушиваний','Listening overview')}</span><nav class="controls" aria-label="${ui('Период','Period')}"><button data-period="week">${ui('7 дней','7 days')}</button><button data-period="month">${ui('30 дней','30 days')}</button><button data-period="all">${ui('Всё время','All time')}</button></nav></div>
    <div class="metrics"></div>
    <section class="section"><div class="section-head"><h2>${ui('Ритм прослушиваний','Listening activity')}</h2><span class="section-note activity-note"></span></div><div class="activity-card"><div class="activity-graph"></div><div class="activity-labels"></div></div></section>
    <div class="columns"><section class="section"><div class="section-head"><h2>${ui('Любимые треки','Top tracks')}</h2><span class="section-note">${ui('По прослушиваниям','By plays')}</span></div><div class="list-card"><ol class="tracks"></ol></div></section><section class="section"><div class="section-head"><h2>${ui('Любимые исполнители','Top artists')}</h2><span class="section-note">${ui('По прослушиваниям','By plays')}</span></div><div class="list-card"><ol class="artists"></ol></div></section></div>
    <div class="lower"><section class="section"><div class="section-head"><h2>${ui('Забытые композиции','Forgotten tracks')}</h2><span class="section-note">${ui('Не звучали 30 дней','Not played for 30 days')}</span></div><div class="list-card"><ol class="forgotten"></ol></div></section><section class="section"><div class="section-head"><h2>${ui('Недавно слушали','Recently played')}</h2><span class="section-note">${ui('История','History')}</span></div><div class="list-card"><ol class="history-list"></ol><button class="history-more" hidden>${ui('Показать ещё','Show more')}</button></div></section></div>
    <div class="actions"><button class="primary" data-export="save">${ui('Сохранить карточку PNG','Save PNG card')}</button><button data-export="copy">${ui('Скопировать карточку','Copy card')}</button></div><p class="status" aria-live="polite"></p></div>
  </main>`;
  document.body.appendChild(insightsHost);
  const close = () => {
    insightsHost?.remove();
    insightsHost = null;
    document.removeEventListener('keydown', onKey);
    syncVisiblePage();
    syncVisiblePlayback();
  };
  const onKey = event => { if (event.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  shadow.querySelector('.close').addEventListener('click', close);
  shadow.querySelector('.backdrop').addEventListener('click', close);
  shadow.addEventListener('click', event => { if (event.target.closest('a')) close(); });
  const hero = shadow.querySelector('.hero');
  hero.style.setProperty('--hero-color', playbackThemeColor || '#4d3541');
  const heroArt = shadow.querySelector('.hero-art');
  if (/^https:\/\/([a-z0-9-]+\.)*sndcdn\.com\//i.test(playbackThemeArtwork || '')) heroArt.src = playbackThemeArtwork;
  const status = shadow.querySelector('.status');
  let sessions;
  try { sessions = await ipcRenderer.invoke('cusade:get-insights'); }
  catch (error) { status.textContent = ui('Не удалось загрузить статистику.', 'Could not load insights.'); console.error(error); return; }
  const allSummary = insightSummary(sessions);
  const forgotten = allSummary.tracks.filter(track => track.lastPlayedAt < Date.now() - 30 * 86400000).slice(0, 5);
  const forgottenList = shadow.querySelector('.forgotten');
  forgotten.forEach((item, index) => forgottenList.append(insightRow(item, index, 'track', forgotten[0].plays)));
  if (!forgotten.length) { const empty = document.createElement('li'); empty.className = 'empty'; empty.textContent = ui('Пока нет забытых треков','No forgotten tracks yet'); forgottenList.append(empty); }
  const sortedHistory = sessions.filter(item => item.seconds >= 30).sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
  const history = shadow.querySelector('.history-list');
  const moreHistory = shadow.querySelector('.history-more');
  const appendHistoryRow = item => {
    const row = document.createElement('li'); row.className = 'history-row';
    const art = insightArtwork(item);
    const info = document.createElement('div'); info.className = 'history-info';
    const link = document.createElement('a'); link.className = 'history-name'; link.href = item.url; link.textContent = item.title;
    const artist = document.createElement('small'); artist.textContent = item.artist;
    info.append(link, artist);
    const date = document.createElement('time'); date.dateTime = new Date(item.lastPlayedAt).toISOString(); date.textContent = formatInsightDate(item.lastPlayedAt);
    row.append(art, info, date); history.append(row);
  };
  let period = 'week';
  let summary;
  let visibleHistory = [];
  const periodCache = new Map();
  const render = () => {
    if (!periodCache.has(period)) {
      const activity = insightActivity(sessions, period);
      const since = period === 'all' ? 0 : activity[0].start;
      periodCache.set(period, { activity, since, summary: period === 'all' ? allSummary : insightSummary(sessions, since) });
    }
    const { activity, since, summary: periodSummary } = periodCache.get(period);
    summary = periodSummary;
    shadow.querySelectorAll('[data-period]').forEach(button => {
      button.classList.toggle('selected', button.dataset.period === period);
      button.setAttribute('aria-pressed', String(button.dataset.period === period));
    });
    const metrics = shadow.querySelector('.metrics');
    metrics.replaceChildren();
    for (const [icon, value, label] of [['▶', summary.plays, ui('Прослушиваний','Plays')], ['◷', Math.round(summary.seconds / 60), ui('Минут музыки','Minutes listened')], ['♫', summary.tracks.length, ui('Треков','Tracks')], ['◎', summary.artists.length, ui('Исполнителей','Artists')]]) {
      const metric = document.createElement('div'); metric.className = 'metric';
      const top = document.createElement('div'); top.className = 'metric-top';
      const symbol = document.createElement('span'); symbol.className = 'metric-icon'; symbol.textContent = icon;
      const caption = document.createElement('span'); caption.textContent = label;
      top.append(symbol, caption);
      const strong = document.createElement('strong'); strong.textContent = value;
      metric.append(top, strong); metrics.append(metric);
    }
    const maxSeconds = Math.max(1, ...activity.map(item => item.seconds));
    const graph = shadow.querySelector('.activity-graph');
    const labels = shadow.querySelector('.activity-labels');
    graph.replaceChildren(); labels.replaceChildren();
    graph.style.setProperty('--bars', activity.length);
    labels.style.setProperty('--bars', activity.length);
    shadow.querySelector('.activity-note').textContent = period === 'all'
      ? ui('Последние 12 месяцев · минуты', 'Last 12 months · minutes')
      : ui('Время прослушивания · минуты', 'Listening time · minutes');
    for (const item of activity) {
      const slot = document.createElement('div'); slot.className = 'bar-slot';
      const bar = document.createElement('div'); bar.className = 'bar';
      bar.style.transform = `scaleY(${Math.max(.03, item.seconds / maxSeconds).toFixed(4)})`;
      const minutes = Math.round(item.seconds / 60);
      slot.title = `${item.label}: ${minutes} ${ui('мин', 'min')}`;
      slot.setAttribute('aria-label', slot.title);
      slot.append(bar); graph.append(slot);
      const label = document.createElement('span'); label.textContent = item.label; labels.append(label);
    }
    for (const [selector, items, kind] of [['.tracks', summary.tracks.slice(0, 5), 'track'], ['.artists', summary.artists.slice(0, 5), 'artist']]) {
      const list = shadow.querySelector(selector); list.replaceChildren();
      items.forEach((item, index) => list.append(insightRow(item, index, kind, items[0].plays)));
      if (!items.length) { const empty = document.createElement('li'); empty.className = 'empty'; empty.textContent = ui('Пока нет данных','No data yet'); list.append(empty); }
    }
    history.replaceChildren();
    visibleHistory = sortedHistory.filter(item => item.lastPlayedAt >= since).slice(0, 20);
    visibleHistory.slice(0, 6).forEach(appendHistoryRow);
    moreHistory.hidden = visibleHistory.length <= 6;
    if (!history.children.length) { const empty = document.createElement('li'); empty.className = 'empty'; empty.textContent = ui('История появится после 30 секунд прослушивания трека.','History appears after 30 seconds of listening to a track.'); history.append(empty); }
  };
  moreHistory.addEventListener('click', () => {
    visibleHistory.slice(6).forEach(appendHistoryRow);
    moreHistory.hidden = true;
  });
  shadow.querySelectorAll('[data-period]').forEach(button => button.addEventListener('click', () => { period = button.dataset.period; render(); }));
  shadow.querySelectorAll('[data-export]').forEach(button => button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const label = period === 'week' ? ui('Последние 7 дней','Last 7 days') : period === 'month' ? ui('Последние 30 дней','Last 30 days') : ui('Всё время','All time');
      const card = await drawInsightCard(summary, label);
      const done = await ipcRenderer.invoke('cusade:export-insight-card', card, button.dataset.export);
      status.textContent = done ? ui('Карточка готова для публикации.','Card ready to share.') : '';
    } catch (error) { status.textContent = ui('Не удалось создать карточку.','Could not create the card.'); console.error(error); }
    finally { button.disabled = false; }
  }));
  render();
}

function syncVisiblePlayback() {
  if (document.visibilityState !== 'visible') return;
  if (!insightsHost) syncPlaybackVisualization();
  syncPlaybackTheme();
  syncPlayerProgress();
  const badge = document.querySelector('.playbackSoundBadge');
  const url = badge?.querySelector('.playbackSoundBadge__titleLink')?.href || '';
  if (url && url !== lastAnimatedBadgeUrl) {
    const firstTrack = !lastAnimatedBadgeUrl;
    lastAnimatedBadgeUrl = url;
    if (!firstTrack && motionActive()) {
      for (const element of badge.querySelectorAll(
        '.playbackSoundBadge__titleLink, .playbackSoundBadge__lightLink, .image.sc-artwork')) {
        element.animate([
          { opacity: 0, transform: 'translateY(6px)' },
          { opacity: 1, transform: 'translateY(0)' }
        ], { duration: 420, easing: 'cubic-bezier(.3,.62,.36,1)', id: 'cusade-badge-enter' });
      }
    }
  }
}

function syncVisiblePage() {
  if (document.visibilityState !== 'visible' || insightsHost) return;
  syncArtworkPage();
  syncHomeLikesButton();
  syncInsightsBanner();
}

setInterval(() => {
  syncInsightsPlayback();
  syncVisiblePlayback();
}, 1000);
setInterval(syncVisiblePage, 2500);
setInterval(() => {
  syncDiscordPresence();
}, 5000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    syncVisiblePage();
    syncVisiblePlayback();
    syncDiscordPresence();
  }
});

function updatePanelColor() {
  const picker = panelHost?.shadowRoot.querySelector('#accent-color');
  const value = panelHost?.shadowRoot.querySelector('#accent-value');
  if (picker) {
    picker.value = accentColor;
    picker.disabled = !settingsLoaded;
  }
  if (value) value.textContent = accentColor.toUpperCase();
}

function closePanel() {
  panelHost?.remove();
  panelHost = null;
}

function renderUpdatePanel() {
  if (!updateHost || !currentUpdateState) return;
  const state = currentUpdateState;
  if (!state.version || state.status === 'none') {
    updateHost.remove();
    updateHost = null;
    return;
  }
  const shadow = updateHost.shadowRoot;
  shadow.querySelector('.version').textContent = ui(`Доступна версия ${state.version}`, `Version ${state.version} is available`);
  const details = shadow.querySelector('.details');
  const action = shadow.querySelector('.action');
  const progress = shadow.querySelector('progress');
  const isPackage = ['deb', 'rpm', 'pacman'].includes(state.packageType);
  if (state.status === 'downloading') {
    details.textContent = ui(`Загрузка обновления: ${state.progress}%`, `Downloading update: ${state.progress}%`);
    action.textContent = ui('Загрузка…', 'Downloading…');
  } else if (state.status === 'installing') {
    details.textContent = isPackage
      ? ui('Подтвердите установку в системном окне.', 'Confirm installation in the system dialog.')
      : ui('Запускается установка и перезапуск.', 'Starting installation and restart.');
    action.textContent = ui('Установка…', 'Installing…');
  } else if (state.ready) {
    details.textContent = state.error || (isPackage
      ? ui('При установке система запросит права администратора.', 'Your system will request administrator access to install.')
      : state.packageType === 'win'
        ? ui('Установщик может запросить права администратора.', 'The installer may request administrator access.')
        : ui('AppImage будет обновлён, затем приложение перезапустится.', 'The AppImage will update and the app will restart.'));
    action.textContent = ui('Установить и перезапустить', 'Install and restart');
  } else {
    details.textContent = state.error || ui('Нажмите «Обновить», чтобы загрузить новую версию.',
      'Select Update to download the new version.');
    action.textContent = ui('Обновить', 'Update');
  }
  action.disabled = state.status === 'downloading' || state.status === 'installing';
  progress.hidden = state.status !== 'downloading';
  progress.value = state.progress || 0;
}

function showUpdatePanel(state) {
  if (state) currentUpdateState = state;
  if (!currentUpdateState?.version) return;
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', () => showUpdatePanel(), { once: true });
    return;
  }
  if (!updateHost) {
    updateHost = document.createElement('div');
    updateHost.id = 'cusade-update-host';
    updateHost.classList.toggle('cusade-animations', motionActive());
    updateHost.style.cssText = 'position:fixed;right:18px;bottom:70px;z-index:2147483647';
    const shadow = updateHost.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; }
        .panel { width: min(350px, calc(100vw - 36px)); padding: 18px; border: 1px solid
          color-mix(in srgb, var(--font-primary-color, #fff) 18%, transparent); border-radius: 14px;
          background: var(--background-surface-color, #171717); color: var(--font-primary-color, #fff);
          box-shadow: 0 16px 44px #0007; font: 13px system-ui, sans-serif; }
        .top { display:flex;align-items:start;justify-content:space-between;gap:12px; }
        h2 { margin:0;font-size:17px; }
        .close { border:0;background:transparent;color:var(--font-secondary-color,#aaa);
          cursor:pointer;font-size:23px;line-height:1; }
        .details { margin:12px 0;color:var(--font-secondary-color,#aaa);line-height:1.45; }
        progress { width:100%;height:6px;margin-bottom:12px;accent-color:var(--cusade-accent,#ff5500); }
        progress[hidden] { display:none; }
        .actions { display:flex;align-items:center;gap:12px; }
        .action { padding:9px 15px;border:0;border-radius:8px;background:var(--cusade-accent,#ff5500);
          color:#fff;font:700 13px system-ui;cursor:pointer; }
        .action:disabled { opacity:.6;cursor:wait; }
        .release { color:var(--font-secondary-color,#aaa);text-decoration:underline;cursor:pointer;
          border:0;background:transparent;font:inherit; }
        :host(.cusade-animations) .panel { animation:enter 360ms cubic-bezier(.3,.62,.36,1) both; }
        :host(.cusade-animations) button { transition:filter 360ms cubic-bezier(.3,.62,.36,1),transform 360ms cubic-bezier(.3,.62,.36,1); }
        :host(.cusade-animations) button:hover:not(:disabled) { filter:brightness(1.09);transform:translateY(-2px); }
        @keyframes enter { from { opacity:0;transform:translateY(14px) scale(.982); }
          to { opacity:1;transform:none; } }
      </style>
      <section class="panel" role="dialog" aria-label="${ui('Обновление SoundCloud Desktop', 'SoundCloud Desktop update')}">
        <div class="top"><h2 class="version"></h2><button class="close" type="button" aria-label="${ui('Закрыть', 'Close')}">×</button></div>
        <p class="details" aria-live="polite"></p><progress max="100" hidden></progress>
        <div class="actions"><button class="action" type="button"></button>
          <button class="release" type="button">${ui('Страница релиза', 'Release page')}</button></div>
      </section>`;
    shadow.querySelector('.close').addEventListener('click', () => {
      updateHost.remove();
      updateHost = null;
    });
    shadow.querySelector('.action').addEventListener('click', async event => {
      if (!event.isTrusted) return;
      const action = shadow.querySelector('.action');
      action.disabled = true;
      try { currentUpdateState = await ipcRenderer.invoke('cusade:run-update'); }
      catch (error) {
        shadow.querySelector('.details').textContent = ui('Не удалось начать обновление.', 'Could not start the update.');
        console.error('Could not run update:', error);
      } finally { renderUpdatePanel(); }
    });
    shadow.querySelector('.release').addEventListener('click', () => {
      ipcRenderer.invoke('cusade:open-update-release').catch(error => console.error('Could not open release:', error));
    });
    document.body.appendChild(updateHost);
  }
  renderUpdatePanel();
}

function togglePanel() {
  if (panelHost) {
    closePanel();
    return;
  }

  panelHost = document.createElement('div');
  panelHost.id = 'cusade-panel-host';
  panelHost.classList.toggle('cusade-animations', motionActive());
  Object.assign(panelHost.style, {
    position: 'fixed',
    top: '56px',
    left: '12px',
    zIndex: '2147483647'
  });

  const shadow = panelHost.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      * { box-sizing: border-box; }
      .panel {
        width: min(340px, calc(100vw - 24px));
        max-height: calc(100vh - 68px);
        overflow-y: auto;
        padding: 18px;
        border: 1px solid color-mix(in srgb, var(--font-primary-color, #fff) 18%, transparent);
        border-radius: 12px;
        background: var(--background-surface-color, #171717);
        box-shadow: 0 18px 48px #0005;
        color: var(--font-primary-color, #f5f5f5);
        font: 14px system-ui, sans-serif;
      }
      .top { display: flex; align-items: center; justify-content: space-between; }
      .title { margin: 0; font-size: 18px; font-weight: 700; }
      .close { border: 0; background: transparent; color: var(--font-secondary-color, #aaa); cursor: pointer; font: 24px system-ui; line-height: 1; }
      .close:hover { color: var(--font-primary-color, #fff); }
      .section { margin-top: 16px; padding-top: 16px; border-top: 1px solid color-mix(in srgb, var(--font-primary-color, #fff) 18%, transparent); }
      .section-title { margin: 0 0 8px; font-size: 14px; font-weight: 600; }
      .setting { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; cursor: pointer; }
      .setting-name { display: block; font-weight: 600; }
      .hint { display: block; margin-top: 5px; color: var(--font-secondary-color, #aaa); font-size: 12px; line-height: 1.5; }
      .hint[hidden] { display: none; }
      input[type="checkbox"] { flex: none; width: 18px; height: 18px; margin: 2px 0 0; accent-color: var(--cusade-accent, #ff5500); cursor: pointer; }
      input:disabled { cursor: wait; }
      .color-setting { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 18px; }
      .color-control { display: flex; align-items: center; gap: 8px; }
      input[type="color"] { width: 42px; height: 34px; padding: 2px; border: 1px solid color-mix(in srgb, var(--font-primary-color, #fff) 25%, transparent); border-radius: 7px; background: var(--button-secondary-background-color, #242424); cursor: pointer; }
      .text-input { width: 100%; margin-top: 8px; padding: 8px 10px; border: 1px solid color-mix(in srgb, var(--font-primary-color, #fff) 25%, transparent); border-radius: 7px; background: var(--button-secondary-background-color, #242424); color: var(--font-primary-color, #fff); font: inherit; }
      .color-value { min-width: 68px; color: var(--font-secondary-color, #aaa); font: 12px ui-monospace, monospace; }
      .radius-setting { display: grid; grid-template-columns: 74px 1fr 35px; align-items: center; gap: 10px; margin-top: 10px; }
      .radius-setting input { width: 100%; accent-color: var(--cusade-accent, #ff5500); cursor: pointer; }
      .radius-setting output { color: var(--font-secondary-color, #aaa); text-align: right; font: 12px ui-monospace, monospace; }
      .status { min-height: 0; margin: 8px 0 0; color: var(--font-error-color, #ff9165); font-size: 12px; }
      .status:empty { display: none; }
      .insights-restore button { margin-top: 9px; padding: 8px 12px; border: 0; border-radius: 7px;
        background: var(--cusade-accent, #ff5500); color: #fff; font: 600 12px system-ui; cursor: pointer; }
      :host(.cusade-animations) { --cusade-hover: 360ms cubic-bezier(.3,.62,.36,1); }
      :host(.cusade-animations) .panel { animation: cusade-panel-in 360ms cubic-bezier(.3,.62,.36,1) both; }
      /* The lift and the colour changes animate, the panel wide shadows do not:
         same measured trade as on the page, where an animated shadow repainted
         the strip around the element on every frame. */
      :host(.cusade-animations) :is(button, input, .setting, .section) {
        transition: color var(--cusade-hover), background-color var(--cusade-hover),
          border-color var(--cusade-hover), filter var(--cusade-hover),
          transform var(--cusade-hover);
      }
      :host(.cusade-animations) :is(.setting, .section):hover { box-shadow: 0 8px 20px #00000029; }
      :host(.cusade-animations) button:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 18px #00000033;
      }
      :host(.cusade-animations) button:active { transform: scale(.96); }
      @keyframes cusade-panel-in {
        from { opacity: 0; transform: translateY(12px) scale(.982); }
        to { opacity: 1; transform: none; }
      }
    </style>
    <div class="panel" role="dialog" aria-label="cusade">
      <div class="top">
        <h2 class="title">cusade</h2>
        <button class="close" type="button" aria-label="${ui('Закрыть', 'Close')}">×</button>
      </div>
      <div class="section">
        <h3 class="section-title">${ui('Настройки мода', 'Mod settings')}</h3>
        <div class="insights-restore" hidden><span class="hint"></span><button type="button">${ui('Показать Insights сейчас', 'Show Insights now')}</button></div>
        <label class="setting">
          <span><span class="setting-name">${ui('Скрыть Artist tools', 'Hide Artist tools')}</span>
          <span class="hint">${ui('Убирает промобаннеры и блок Artist tools.', 'Hides promotional banners and the Artist tools section.')}</span></span>
          <input id="hide-artist-tools" type="checkbox" disabled>
        </label>
        <label class="setting" style="margin-top: 18px">
          <span><span class="setting-name">${ui('Скрыть «События рядом»', 'Hide Events near you')}</span>
          <span class="hint">${ui('Убирает весь баннер с главной страницы.', 'Removes the entire banner from the home page.')}</span></span>
          <input id="hide-nearby-events" type="checkbox" disabled>
        </label>
        <label class="setting" style="margin-top: 18px">
          <span><span class="setting-name">${ui('Скрыть рекламу', 'Hide ads')}</span>
          <span class="hint">${ui('Блокирует аудиорекламу при запуске следующих треков.', 'Blocks audio ads when starting the next tracks.')}</span></span>
          <input id="block-audio-ads" type="checkbox" disabled>
        </label>
        <label class="setting" style="margin-top: 18px">
          <span><span class="setting-name">${ui('Визуализация воспроизведения', 'Playback visualization')}</span>
          <span class="hint">${ui('Показывает текущий трек над подборками на главной.', 'Shows the current track above the home page recommendations.')}</span></span>
          <input id="playback-visualization" type="checkbox" disabled>
        </label>
        <label class="setting" style="margin-top: 18px">
          <span><span class="setting-name">${ui('Показывать «Мои лайки»', 'Show Your likes')}</span>
          <span class="hint">${ui('Кнопка перемешивания лайков вверху правого столбца.', 'Shuffle button at the top of the right sidebar.')}</span></span>
          <input id="show-your-likes-button" type="checkbox" disabled>
        </label>
        <label class="setting" style="margin-top: 18px">
          <span><span class="setting-name">${ui('Анимации', 'Animations')}</span>
          <span class="hint">${ui('Оживляет обложки, карточки, кнопки и меню.', 'Animates artwork, cards, buttons and menus.')}</span>
          <span class="hint motion-hint" hidden></span></span>
          <input id="animations" type="checkbox" disabled>
        </label>
        <label class="setting" style="margin-top: 12px">
          <span><span class="setting-name">${ui('Учитывать системное уменьшение движения', 'Follow the system reduced motion setting')}</span>
          <span class="hint">${ui('Выключено: cusade показывает анимации, даже если система их отключает. Включите, чтобы уважать настройку системы — на Windows анимации интерфейса часто выключены.', 'Off: cusade animates even when the system turns animations off. Turn it on to respect the system setting — Windows often has interface animations disabled.')}</span></span>
          <input id="respect-system-motion" type="checkbox" disabled>
        </label>
        <div class="section">
          <label class="setting">
            <span><span class="setting-name">Discord RPC</span>
            <span class="hint">${ui('Показывает трек, исполнителя, обложку и время воспроизведения в Discord.', 'Shows the track, artist, artwork and playback time in Discord.')}</span></span>
            <input id="discord-rpc" type="checkbox" disabled>
          </label>
          <label class="hint" for="discord-client-id">${ui('ID приложения Discord', 'Discord Application ID')}</label>
          <input class="text-input" id="discord-client-id" type="text" inputmode="numeric" maxlength="20" placeholder="123456789012345678" disabled>
          <span class="hint">${ui('По умолчанию используется ID cusade. Очистите поле, чтобы вернуть его.', 'Uses the cusade ID by default. Clear the field to restore it.')}</span>
        </div>
        <div class="section">
          <label class="setting">
            <span><span class="setting-name">${ui('Автозапуск', 'Start with system')}</span>
            <span class="hint">${ui('Запускать приложение при входе в систему.', 'Launch the app when you sign in.')}</span></span>
            <input id="auto-start" type="checkbox" disabled>
          </label>
          <label class="setting" style="margin-top: 18px">
            <span><span class="setting-name">${ui('Запускать свёрнутым', 'Start minimized')}</span>
            <span class="hint">${ui('При автозапуске оставлять окно в системном трее.', 'Keep the window in the system tray on automatic start.')}</span></span>
            <input id="start-minimized" type="checkbox" disabled>
          </label>
        </div>
        <label class="color-setting">
          <span><span class="setting-name">${ui('Основной цвет', 'Accent color')}</span>
          <span class="hint">${ui('Выберите цвет акцентов SoundCloud.', 'Choose the SoundCloud accent color.')}</span></span>
          <span class="color-control"><input id="accent-color" type="color" value="#ff5500" disabled>
          <span id="accent-value" class="color-value">#FF5500</span></span>
        </label>
        <div class="section">
          <h3 class="section-title">${ui('Скругление обложек', 'Artwork rounding')}</h3>
          <span class="hint">${ui('0% — прямые углы, 50% — круг.', '0% means square corners; 50% means a circle.')}</span>
          <label class="radius-setting"><span>${ui('Аватарки', 'Avatars')}</span><input id="avatarRadius" type="range" min="0" max="50" step="1" disabled><output id="avatarRadius-value">50%</output></label>
          <label class="radius-setting"><span>${ui('Треки', 'Tracks')}</span><input id="trackRadius" type="range" min="0" max="50" step="1" disabled><output id="trackRadius-value">3%</output></label>
          <label class="radius-setting"><span>${ui('Альбомы', 'Albums')}</span><input id="albumRadius" type="range" min="0" max="50" step="1" disabled><output id="albumRadius-value">3%</output></label>
        </div>
        <p class="status" aria-live="polite"></p>
      </div>
    </div>`;
  shadow.querySelector('.close').addEventListener('click', closePanel);
  shadow.querySelector('.insights-restore button').addEventListener('click', async () => {
    try {
      await ipcRenderer.invoke('cusade:show-insights');
      insightsHiddenUntil = 0;
      updateInsightsRestoreControl();
      syncInsightsBanner();
    } catch (error) {
      shadow.querySelector('.status').textContent = ui('Не удалось показать Insights.', 'Could not show Insights.');
      console.error('Could not restore cusade Insights:', error);
    }
  });
  const toggle = shadow.querySelector('#hide-artist-tools');
  toggle.addEventListener('change', async () => {
    const previous = hideArtistTools;
    hideArtistTools = toggle.checked;
    applyArtistToolsVisibility();
    toggle.disabled = true;
    try {
      await ipcRenderer.invoke('cusade:set-hide-artist-tools', hideArtistTools);
    } catch (error) {
      hideArtistTools = previous;
      applyArtistToolsVisibility();
      shadow.querySelector('.status').textContent = ui('Не удалось сохранить настройку.', 'Could not save the setting.');
      console.error('Could not save cusade settings:', error);
    } finally {
      updatePanelToggle();
    }
  });
  const nearbyEventsToggle = shadow.querySelector('#hide-nearby-events');
  nearbyEventsToggle.addEventListener('change', async () => {
    const previous = hideNearbyEvents;
    hideNearbyEvents = nearbyEventsToggle.checked;
    applyNearbyEventsVisibility();
    nearbyEventsToggle.disabled = true;
    try {
      await ipcRenderer.invoke('cusade:set-hide-nearby-events', hideNearbyEvents);
    } catch (error) {
      hideNearbyEvents = previous;
      applyNearbyEventsVisibility();
      shadow.querySelector('.status').textContent = ui('Не удалось сохранить настройку.', 'Could not save the setting.');
      console.error('Could not save cusade nearby events visibility:', error);
    } finally {
      updateNearbyEventsToggle();
    }
  });
  const audioAdsToggle = shadow.querySelector('#block-audio-ads');
  audioAdsToggle.addEventListener('change', async () => {
    const previous = blockAudioAds;
    blockAudioAds = audioAdsToggle.checked;
    audioAdsToggle.disabled = true;
    try {
      await ipcRenderer.invoke('cusade:set-block-audio-ads', blockAudioAds);
    } catch (error) {
      blockAudioAds = previous;
      shadow.querySelector('.status').textContent = ui('Не удалось сохранить настройку.', 'Could not save the setting.');
      console.error('Could not save cusade audio ad blocking:', error);
    } finally {
      updateAudioAdsToggle();
    }
  });
  const visualizationToggle = shadow.querySelector('#playback-visualization');
  visualizationToggle.addEventListener('change', async () => {
    const previous = playbackVisualization;
    playbackVisualization = visualizationToggle.checked;
    syncPlaybackVisualization();
    visualizationToggle.disabled = true;
    try {
      await ipcRenderer.invoke('cusade:set-playback-visualization', playbackVisualization);
    } catch (error) {
      playbackVisualization = previous;
      syncPlaybackVisualization();
      shadow.querySelector('.status').textContent = ui('Не удалось сохранить настройку.', 'Could not save the setting.');
      console.error('Could not save cusade playback visualization:', error);
    } finally {
      updateVisualizationToggle();
    }
  });
  const yourLikesToggle = shadow.querySelector('#show-your-likes-button');
  yourLikesToggle.addEventListener('change', async () => {
    const previous = showYourLikesButton;
    showYourLikesButton = yourLikesToggle.checked;
    syncHomeLikesButton();
    yourLikesToggle.disabled = true;
    try {
      await ipcRenderer.invoke('cusade:set-show-your-likes-button', showYourLikesButton);
    } catch (error) {
      showYourLikesButton = previous;
      syncHomeLikesButton();
      shadow.querySelector('.status').textContent = ui('Не удалось сохранить настройку.', 'Could not save the setting.');
      console.error('Could not save cusade Your likes visibility:', error);
    } finally {
      updateYourLikesToggle();
    }
  });
  const animationsToggle = shadow.querySelector('#animations');
  animationsToggle.addEventListener('change', async () => {
    const previous = animations;
    animations = animationsToggle.checked;
    applyMotion();
    animationsToggle.disabled = true;
    try {
      await ipcRenderer.invoke('cusade:set-animations', animations);
    } catch (error) {
      animations = previous;
      applyMotion();
      shadow.querySelector('.status').textContent = ui('Не удалось сохранить настройку.', 'Could not save the setting.');
      console.error('Could not save cusade animations:', error);
    } finally {
      updateAnimationsToggle();
    }
  });
  const respectSystemMotionToggle = shadow.querySelector('#respect-system-motion');
  respectSystemMotionToggle.addEventListener('change', async () => {
    const previous = respectSystemMotion;
    respectSystemMotion = respectSystemMotionToggle.checked;
    applyMotion();
    respectSystemMotionToggle.disabled = true;
    try {
      await ipcRenderer.invoke('cusade:set-respect-system-motion', respectSystemMotion);
    } catch (error) {
      respectSystemMotion = previous;
      applyMotion();
      shadow.querySelector('.status').textContent = ui('Не удалось сохранить настройку.', 'Could not save the setting.');
      console.error('Could not save the cusade reduced motion setting:', error);
    } finally {
      updateRespectSystemMotionToggle();
    }
  });
  const discordToggle = shadow.querySelector('#discord-rpc');
  discordToggle.addEventListener('change', async () => {
    const previous = discordRpc;
    discordRpc = discordToggle.checked;
    discordToggle.disabled = true;
    try {
      await ipcRenderer.invoke('cusade:set-discord-rpc', discordRpc);
      if (discordRpc) syncDiscordPresence();
      else lastDiscordStateKey = '';
    } catch (error) {
      discordRpc = previous;
      shadow.querySelector('.status').textContent = ui('Не удалось изменить Discord RPC.', 'Could not change Discord RPC.');
      console.error('Could not change Discord RPC:', error);
    } finally {
      updateDiscordControls();
    }
  });
  const discordIdInput = shadow.querySelector('#discord-client-id');
  discordIdInput.addEventListener('change', async () => {
    const selected = discordIdInput.value.trim();
    if (selected && !/^\d{17,20}$/.test(selected)) {
      shadow.querySelector('.status').textContent = ui('ID Discord должен содержать 17–20 цифр.', 'Discord ID must contain 17–20 digits.');
      updateDiscordControls();
      return;
    }
    discordIdInput.disabled = true;
    try {
      const saved = await ipcRenderer.invoke('cusade:set-discord-client-id', selected);
      discordClientId = saved.discordClientId;
      discordRpc = saved.discordRpc;
      lastDiscordStateKey = '';
      syncDiscordPresence();
    } catch (error) {
      shadow.querySelector('.status').textContent = ui('Не удалось сохранить ID Discord.', 'Could not save Discord ID.');
      console.error('Could not save Discord ID:', error);
    } finally {
      updateDiscordControls();
    }
  });
  const autoStartToggle = shadow.querySelector('#auto-start');
  autoStartToggle.addEventListener('change', async () => {
    const previous = autoStart;
    autoStart = autoStartToggle.checked;
    autoStartToggle.disabled = true;
    try {
      await ipcRenderer.invoke('cusade:set-auto-start', autoStart);
    } catch (error) {
      autoStart = previous;
      shadow.querySelector('.status').textContent = ui('Не удалось настроить автозапуск.', 'Could not configure autostart.');
      console.error('Could not configure autostart:', error);
    } finally {
      updateAutoStartControls();
    }
  });
  const minimizedToggle = shadow.querySelector('#start-minimized');
  minimizedToggle.addEventListener('change', async () => {
    const previous = startMinimized;
    startMinimized = minimizedToggle.checked;
    minimizedToggle.disabled = true;
    try {
      await ipcRenderer.invoke('cusade:set-start-minimized', startMinimized);
    } catch (error) {
      startMinimized = previous;
      shadow.querySelector('.status').textContent = ui('Не удалось настроить запуск свёрнутым.', 'Could not configure minimized start.');
      console.error('Could not configure minimized start:', error);
    } finally {
      updateAutoStartControls();
    }
  });
  const picker = shadow.querySelector('#accent-color');
  picker.addEventListener('input', () => {
    accentColor = picker.value.toLowerCase();
    applyAccentColor();
  });
  picker.addEventListener('change', async () => {
    const selected = picker.value.toLowerCase();
    picker.disabled = true;
    try {
      await ipcRenderer.invoke('cusade:set-accent-color', selected);
      savedAccentColor = selected;
    } catch (error) {
      accentColor = savedAccentColor;
      applyAccentColor();
      shadow.querySelector('.status').textContent = ui('Не удалось сохранить цвет.', 'Could not save the color.');
      console.error('Could not save cusade color:', error);
    } finally {
      updatePanelColor();
    }
  });
  for (const key of Object.keys(DEFAULT_RADII)) {
    const slider = shadow.querySelector(`#${key}`);
    slider.addEventListener('input', () => {
      artworkRadii[key] = Number(slider.value);
      applyArtworkRadii();
    });
    slider.addEventListener('change', async () => {
      const selected = Number(slider.value);
      slider.disabled = true;
      try {
        await ipcRenderer.invoke('cusade:set-artwork-radius', key, selected);
        savedArtworkRadii[key] = selected;
      } catch (error) {
        artworkRadii[key] = savedArtworkRadii[key];
        applyArtworkRadii();
        shadow.querySelector('.status').textContent = ui('Не удалось сохранить скругление.', 'Could not save the rounding.');
        console.error('Could not save cusade artwork radius:', error);
      } finally {
        updateArtworkRadiusControls();
      }
    });
  }
  document.body.appendChild(panelHost);
  updatePanelToggle();
  updateNearbyEventsToggle();
  updateAudioAdsToggle();
  updateVisualizationToggle();
  updateAnimationsToggle();
  updateRespectSystemMotionToggle();
  updateYourLikesToggle();
  updateInsightsRestoreControl();
  updateDiscordControls();
  updateAutoStartControls();
  updatePanelColor();
  updateArtworkRadiusControls();
}

ipcRenderer.on('cusade:toggle-panel', togglePanel);
ipcRenderer.on('cusade:update-state', (_event, state) => {
  currentUpdateState = state;
  renderUpdatePanel();
});
ipcRenderer.on('cusade:show-update', (_event, state) => showUpdatePanel(state));

document.addEventListener('pointerdown', event => {
  if (panelHost && !panelHost.contains(event.target)) closePanel();
}, true);

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closePanel();
}, true);

document.addEventListener('contextmenu', event => {
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  if (!target?.closest('a.header__logoLink')) return;

  event.preventDefault();
  ipcRenderer.send('cusade:logo-context-menu');
}, true);
