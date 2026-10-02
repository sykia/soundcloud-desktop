const { ipcRenderer } = require('electron');

const DEFAULT_ACCENT_COLOR = '#ff5500';
const DEFAULT_DISCORD_CLIENT_ID = '1555593977367887893';
const DEFAULT_RADII = { avatarRadius: 50, trackRadius: 3, albumRadius: 3 };
let panelHost;
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
let settingsLoaded = false;
let visualizationHost;
let visualizedTrackUrl = '';
let likesShuffleHost;
let likesShuffleInProgress = false;
let showYourLikesButton = true;
let artworkRadii = { ...DEFAULT_RADII };
let savedArtworkRadii = { ...DEFAULT_RADII };
let appLanguage = 'site';
let languageSavePending = false;
let localizationScheduled = false;
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
  if (!element || element.closest('script, style, textarea, [contenteditable], #cusade-panel-host, .cusade-visualization, .cusade-likes-shuffle')) return false;
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

function scheduleLocalization() {
  if (localizationScheduled) return;
  localizationScheduled = true;
  requestAnimationFrame(() => {
    localizationScheduled = false;
    syncLanguageMenu();
    if (appLanguage === 'ru') translateSite();
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
  if (language === 'ru') scheduleLocalization();
  else restoreSiteLanguage();
  refreshLocalizedUi();
}

function releaseRussianTranslation() {
  if (appLanguage !== 'ru') return;
  appLanguage = 'site';
  restoreSiteLanguage();
  refreshLocalizedUi();
  ipcRenderer.invoke('cusade:set-app-language', 'site').catch(error => {
    appLanguage = 'ru';
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
    .cusade-visualization::before {
      content: ''; position: absolute; inset: -35px; z-index: -2;
      background: var(--cusade-artwork) center / cover no-repeat;
      filter: blur(40px) saturate(1.4); opacity: .65;
    }
    .cusade-visualization::after {
      content: ''; position: absolute; inset: 0; z-index: -1;
      background: linear-gradient(100deg, #082b41ed 5%, #082b41aa 60%, #082b4180);
    }
    .cusade-visualization__main { display: flex; flex: 1; min-width: 0; flex-direction: column; }
    .cusade-visualization__heading { display: flex; align-items: center; gap: 16px; min-width: 0; }
    .cusade-visualization__play {
      flex: none; width: 64px; height: 64px; border: 1px solid #ffffff55;
      border-radius: 50%; background: #ffffff18; color: #fff; cursor: pointer;
      font: 30px system-ui; backdrop-filter: blur(8px);
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
    .cusade-visualization__bars span { flex: 1; min-width: 1px; background: #b9e6f4; }
    .cusade-visualization__bars--base { opacity: .4; }
    .cusade-visualization__bars--played { clip-path: inset(0 calc(100% - var(--cusade-progress, 0%)) 0 0); }
    .cusade-visualization__times { display: flex; justify-content: space-between; margin-top: 4px;
      color: #e4f4fa; font-size: 12px; }
    .cusade-visualization__art { flex: none; width: min(30%, 280px); aspect-ratio: 1;
      align-self: center; border-radius: 12px; object-fit: cover; box-shadow: 0 12px 30px #0005; }
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
  `;
  document.head.appendChild(style);
  new MutationObserver(scheduleLocalization).observe(document.body, {
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['title', 'aria-label', 'placeholder'],
    subtree: true
  });
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
    showYourLikesButton = saved.showYourLikesButton !== false;
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
    updatePanelToggle();
    updateNearbyEventsToggle();
    updateAudioAdsToggle();
    updateDiscordControls();
    updateAutoStartControls();
    updateVisualizationToggle();
    updateYourLikesToggle();
    updatePanelColor();
    syncPlaybackVisualization();
    syncHomeLikesButton();
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

function updateYourLikesToggle() {
  const toggle = panelHost?.shadowRoot.querySelector('#show-your-likes-button');
  if (!toggle) return;
  toggle.checked = showYourLikesButton;
  toggle.disabled = !settingsLoaded;
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

function drawPlaybackWave(card, seed, waveform) {
  let state = 0;
  for (const character of seed) state = (Math.imul(state, 31) + character.charCodeAt(0)) | 0;
  const bars = Array.from({ length: 160 }, (_, index) => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    const sample = waveform?.samples.slice(
      Math.floor(index * waveform.samples.length / 160),
      Math.max(1, Math.floor((index + 1) * waveform.samples.length / 160))
    );
    const height = sample?.length
      ? Math.max(10, Math.max(...sample) / waveform.height * 96)
      : 18 + ((state >>> 16) % 60) + 12 * Math.sin(index / 9) ** 2;
    const bar = document.createElement('span');
    bar.style.height = `${Math.min(96, height)}%`;
    return bar;
  });
  for (const layer of card.querySelectorAll('.cusade-visualization__bars')) {
    layer.replaceChildren(...bars.map(bar => bar.cloneNode()));
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
  if (visualizationHost === card && visualizedTrackUrl === trackUrl) {
    drawPlaybackWave(card, trackUrl, waveform);
  }
}

function syncPlaybackVisualization() {
  const home = document.querySelector('[data-test-id="home"]');
  const main = home?.closest('.l-main');
  const badge = document.querySelector('.playbackSoundBadge');
  const titleLink = badge?.querySelector('.playbackSoundBadge__titleLink');
  const artistLink = badge?.querySelector('.playbackSoundBadge__lightLink');
  if (!playbackVisualization || !main || !titleLink || !artistLink) {
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
    const title = visualizationHost.querySelector('.cusade-visualization__title');
    const artist = visualizationHost.querySelector('.cusade-visualization__artist');
    title.textContent = titleLink.title || titleLink.querySelector('[aria-hidden="true"]')?.textContent || '';
    title.href = titleLink.href;
    artist.textContent = artistLink.textContent.trim();
    artist.href = artistLink.href;
    const smallArtwork = badge.querySelector('.image__full')?.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
    const artwork = smallArtwork?.replace(/-t\d+x\d+\./, '-t500x500.');
    const cover = visualizationHost.querySelector('.cusade-visualization__art');
    if (artwork) {
      cover.src = artwork;
      cover.hidden = false;
      visualizationHost.style.setProperty('--cusade-artwork', `url("${artwork}")`);
    } else {
      cover.hidden = true;
      visualizationHost.style.removeProperty('--cusade-artwork');
    }
    drawPlaybackWave(visualizationHost, visualizedTrackUrl);
    loadPlaybackWave(visualizationHost, visualizedTrackUrl).catch(error => {
      console.error('Could not load SoundCloud waveform:', error);
    });
  }

  const play = visualizationHost.querySelector('.cusade-visualization__play');
  const paused = badge.classList.contains('paused');
  play.textContent = paused ? '▶' : 'Ⅱ';
  play.setAttribute('aria-label', paused ? ui('Воспроизвести', 'Play') : ui('Пауза', 'Pause'));
  const timeline = document.querySelector('.playbackTimeline__progressWrapper');
  const maximum = Number(timeline?.getAttribute('aria-valuemax'));
  const current = Number(timeline?.getAttribute('aria-valuenow'));
  const progress = maximum > 0 ? Math.max(0, Math.min(100, current / maximum * 100)) : 0;
  visualizationHost.style.setProperty('--cusade-progress', `${progress}%`);
  const times = visualizationHost.querySelectorAll('.cusade-visualization__times span');
  times[0].textContent = document.querySelector('.playbackTimeline__timePassed [aria-hidden="true"]')?.textContent || '0:00';
  times[1].textContent = document.querySelector('.playbackTimeline__duration [aria-hidden="true"]')?.textContent || '0:00';
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

setInterval(() => {
  syncArtworkPage();
  syncPlaybackVisualization();
  syncHomeLikesButton();
  syncDiscordPresence();
}, 750);

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

function togglePanel() {
  if (panelHost) {
    closePanel();
    return;
  }

  panelHost = document.createElement('div');
  panelHost.id = 'cusade-panel-host';
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
    </style>
    <div class="panel" role="dialog" aria-label="cusade">
      <div class="top">
        <h2 class="title">cusade</h2>
        <button class="close" type="button" aria-label="${ui('Закрыть', 'Close')}">×</button>
      </div>
      <div class="section">
        <h3 class="section-title">${ui('Настройки мода', 'Mod settings')}</h3>
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
  updateYourLikesToggle();
  updateDiscordControls();
  updateAutoStartControls();
  updatePanelColor();
  updateArtworkRadiusControls();
}

ipcRenderer.on('cusade:toggle-panel', togglePanel);

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
