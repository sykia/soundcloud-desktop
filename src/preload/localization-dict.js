'use strict';

// Russian dictionary, plural forms, relative time and the ui() helper. A pure
// lookup table over the shared state: it only ever reads state.appLanguage and
// state.pageScope.

const { state } = require('./state.js');

// ---------------------------------------------------------------------------
// Localization
//
// SoundCloud renders one bundle of interface strings into pages whose markup
// changes every few months. The first version of this file asked "is this text
// inside one of a dozen containers that existed in 2020" and returned false for
// everything else, which silently skipped whole pages: settings, Artist Studio,
// upload, subscriptions and the notification list never matched a container, so
// they were never translated. The gate is inverted now: everything inside the
// page is a candidate and the user content veto below decides what is never
// touched. New pages are covered without another selector list, and the veto is
// the part that has to be right, because it is the only thing standing between
// a track title and a machine translation.
// ---------------------------------------------------------------------------
const RU_TRANSLATIONS = {
  // Navigation
  'Home': 'Главная',
  'Feed': 'Лента',
  'Library': 'Медиатека',
  'Search': 'Поиск',
  'Upload': 'Загрузить',
  'Discover': 'Открыть музыку',
  'Next up': 'Далее',
  'Recommended': 'Рекомендовано',
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
  'More': 'Ещё',
  'All': 'Все',
  'See all': 'Показать все',
  'View all': 'Показать все',
  'View all likes': 'Все отметки «Нравится»',
  'View all reposts': 'Все репосты',
  'View all comments': 'Все комментарии',
  'View all notifications': 'Все уведомления',
  'View all messages': 'Все сообщения',
  'Try Go+': 'Попробовать Go+',
  'Try Artist Pro': 'Попробовать Artist Pro',
  'Artist Studio': 'Студия артиста',
  'Notifications': 'Уведомления',
  'Messages': 'Сообщения',
  'Settings and more': 'Настройки и другое',
  'Profile': 'Профиль',
  'Settings': 'Настройки',
  'Sign out': 'Выйти',
  'Sign up': 'Регистрация',
  'Log in': 'Войти',
  'Copyright': 'Авторские права',
  // Player actions
  'Play': 'Воспроизвести',
  'Pause': 'Пауза',
  'Like': 'Нравится',
  'Liked': 'Понравилось',
  'Unlike': 'Убрать отметку «Нравится»',
  'Follow': 'Подписаться',
  'Unfollow': 'Отписаться',
  'Share': 'Поделиться',
  'Repost': 'Репост',
  'Comment': 'Комментарий',
  'Add to playlist': 'Добавить в плейлист',
  'Copy Link': 'Скопировать ссылку',
  'Report': 'Пожаловаться',
  'Edit': 'Редактировать',
  'Delete': 'Удалить',
  'Remove': 'Убрать',
  'Save': 'Сохранить',
  'Done': 'Готово',
  'Next': 'Далее',
  'Back': 'Назад',
  'Apply': 'Применить',
  'Submit': 'Отправить',
  'Send': 'Отправить',
  'Continue': 'Продолжить',
  'Retry': 'Повторить',
  'Try again': 'Попробовать снова',
  'Reset': 'Сбросить',
  'Restore': 'Восстановить',
  'Add': 'Добавить',
  'Confirm': 'Подтвердить',
  'Cancel': 'Отмена',
  'Close': 'Закрыть',
  'Block': 'Заблокировать',
  'Unblock': 'Разблокировать',
  'Ok': 'ОК',
  'OK': 'ОК',
  'Loading…': 'Загрузка…',
  'Loading...': 'Загрузка…',
  'Something went wrong': 'Что-то пошло не так',
  'An error occurred': 'Произошла ошибка',
  'Learn more': 'Подробнее',
  'Learn More': 'Подробнее',
  // Home
  'Made for you': 'Создано для вас',
  'Curated by SoundCloud': 'Подборка SoundCloud',
  'More of what you like': 'Ещё из того, что вам нравится',
  'Recently played': 'Недавно прослушано',
  'Recently Played': 'Недавно прослушано',
  'Recently played:': 'Недавно прослушано:',
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
  'LATEST TRACKS': 'ПОСЛЕДНИЕ ТРЕКИ',
  'Discover new music': 'Открывайте новую музыку',
  // Feed
  'This is your feed': 'Это ваша лента',
  'Hear the latest posts from the people you’re following:':
    'Последние публикации тех, на кого вы подписаны:',
  'Hear the latest posts from the people you\'re following:':
    'Последние публикации тех, на кого вы подписаны:',
  'Follow artists, labels, and friends you love on SoundCloud':
    'Подпишитесь на любимых артистов, лейблы и друзей в SoundCloud',
  'and keep up with everything they post.': 'и следите за их публикациями.',
  'Reposts': 'Репосты',
  'Write a comment': 'Напишите комментарий',
  // Library
  'Overview': 'Обзор',
  'Likes': 'Понравившееся',
  'Playlists': 'Пейлисты',
  'Albums': 'Альбомы',
  'Stations': 'Станции',
  'Following': 'Подписки',
  'Followers': 'Подписчики',
  'History': 'История',
  'Tracks': 'Треки',
  'Vinyl': 'Винил',
  'Recent': 'Недавнее',
  'Popular tracks': 'Популярные треки',
  'Liked stations': 'Понравившиеся станции',
  'Browse trending playlists': 'Посмотреть популярные плейлисты',
  'Hear the tracks you’ve liked:': 'Слушайте понравившиеся треки:',
  'Hear the tracks you\'ve liked:': 'Слушайте понравившиеся треки:',
  'Hear your own playlists and the playlists you’ve liked:':
    'Ваши плейлисты и плейлисты, которые вам понравились:',
  'Hear your own playlists and the playlists you\'ve liked:':
    'Ваши плейлисты и плейлисты, которые вам понравились:',
  'Hear the stations you’ve liked:': 'Слушайте понравившиеся станции:',
  'Hear the stations you\'ve liked:': 'Слушайте понравившиеся станции:',
  'Hear what the people you follow have posted:': 'Публикации тех, на кого вы подписаны:',
  'Hear the tracks you’ve played:': 'Слушайте недавно воспроизведённые треки:',
  'Hear the tracks you\'ve played:': 'Слушайте недавно воспроизведённые треки:',
  'Clear all history': 'Очистить всю историю',
  'Filter': 'Фильтр',
  'You haven’t liked any albums yet': 'Вы ещё не отметили ни одного альбома',
  'You haven\'t liked any albums yet': 'Вы ещё не отметили ни одного альбома',
  'You haven’t created any playlists.': 'Вы ещё не создали ни одного плейлиста.',
  'You haven\'t created any playlists.': 'Вы ещё не создали ни одного плейлиста.',
  'Seems a little quiet over here': 'Здесь пока пусто',
  'Nothing to see here yet': 'Здесь пока ничего нет',
  'No results': 'Ничего не найдено',
  'Nothing here yet': 'Здесь пока ничего нет',
  'Upload now': 'Загрузить сейчас',
  // Profile
  'Upload header image': 'Загрузить изображение шапки',
  'Edit profile': 'Редактировать профиль',
  'ON TOUR': 'НА ГАСТРОЛЯХ',
  'LATEST COMMENTS': 'ПОСЛЕДНИЕ КОММЕНТАРИИ',
  'LATEST TRACKS AND REPOSTS': 'ПОСЛЕДНИЕ ТРЕКИ И РЕПОСТЫ',
  'Upgrade to Artist Pro': 'Перейти на Artist Pro',
  'Get Artist Pro': 'Подключить Artist Pro',
  'Learn more about Artist Pro': 'Подробнее об Artist Pro',
  'Artist Pro Membership Benefits': 'Преимущества подписки Artist Pro',
  'Benefits': 'Преимущества',
  'Unlimited uploads': 'Неограниченные загрузки',
  'Deep stats': 'Подробная статистика',
  'Support independent creators': 'Поддержите независимых авторов',
  'See our plans': 'Посмотреть тарифы',
  'Buy Artist Pro': 'Купить Artist Pro',
  'Not a Pro member yet?': 'Ещё не подписаны на Artist Pro?',
  'Upload your first track': 'Загрузите первый трек',
  'Followers you know': 'Знакомые подписчики',
  'Appears on': 'Появляется в',
  // Notifications
  'mentioned you': 'упомянул вас',
  'started following you': 'подписался на вас',
  'followed you': 'подписался на вас',
  'liked your track': 'понравился ваш трек',
  'liked your playlist': 'понравился ваш плейлист',
  'reposted your track': 'сделал репост вашего трека',
  'reposted your playlist': 'сделал репост вашего плейлиста',
  'commented on your track': 'оставил комментарий к вашему треку',
  'added your track to a playlist': 'добавил ваш трек в плейлист',
  'added a track to your playlist': 'добавил трек в ваш плейлист',
  'your track is trending': 'ваш трек в тренде',
  'is now trending': 'сейчас в тренде',
  'Follow back': 'Подписаться в ответ',
  // Messages
  'New message': 'Новое сообщение',
  'Message': 'Сообщение',
  'Write your message and add tracks or playlists':
    'Напишите сообщение и добавьте треки или плейлисты',
  'Write a message…': 'Напишите сообщение…',
  'Search for a message': 'Поиск по сообщениям',
  'Start a conversation': 'Начните переписку',
  'Your messages': 'Ваши сообщения',
  'Inbox': 'Входящие',
  // ... menu
  'About us': 'О нас',
  'Legal': 'Правовая информация',
  'Get SoundCloud Go+': 'Подключить SoundCloud Go+',
  'Mobile apps': 'Мобильные приложения',
  'Artist Membership': 'Подписка для артистов',
  'News': 'Новости',
  'Jobs': 'Вакансии',
  'Developers': 'Разработчикам',
  'SoundCloud Store': 'Магазин SoundCloud',
  'Support': 'Поддержка',
  'Keyboard shortcuts': 'Горячие клавиши',
  'Subscription': 'Подписка',
  'Get the mobile app': 'Скачать мобильное приложение',
  'Download app': 'Скачать приложение',
  'For creators': 'Для авторов',
  // Footer
  'Privacy': 'Конфиденциальность',
  'Cookie Policy': 'Политика cookie',
  'Cookie Manager': 'Настройки cookie',
  'Imprint': 'Выходные сведения',
  'Artist Resources': 'Ресурсы для артистов',
  'Newsroom': 'Новости',
  'Topics': 'Темы',
  'Charts': 'Чарты',
  'Transparency Reports': 'Отчёты о прозрачности',
  'Help': 'Помощь',
  'Terms of Use': 'Условия использования',
  'Terms': 'Условия',
  'Desktop app': 'Приложение для компьютера',
  'Download the app': 'Скачать приложение',
  'Blog': 'Блог',
  // Settings: tabs
  'Account': 'Аккаунт',
  'Content': 'Контент',
  'Streaming': 'Воспроизведение',
  'Advertising': 'Реклама',
  'Security': 'Безопасность',
  // Settings: content tab
  'RSS feed': 'RSS-лента',
  'Email address displayed': 'Отображение email',
  'Don’t display email address': 'Не показывать email',
  'Don\'t display email address': 'Не показывать email',
  'Custom feed title': 'Название RSS-ленты',
  'Category': 'Категория',
  'Stats-service URL prefix': 'URL сервиса статистики',
  'Custom author name': 'Имя автора',
  'Language': 'Язык',
  'Subscriber redirect': 'Перенаправление подписчиков',
  'Contains explicit content': 'Содержит контент 18+',
  'Upload Defaults': 'Настройки загрузки по умолчанию',
  'Include in RSS feed': 'Добавлять в RSS-ленту',
  'Creative Commons license': 'Лицензия Creative Commons',
  'Save changes': 'Сохранить изменения',
  'Attribution': 'С указанием авторства',
  'Attribution-NonCommercial': 'С указанием авторства и для некоммерческого использования',
  // Settings: account and common controls
  'Username': 'Имя пользователя',
  'Email': 'Email',
  'Password': 'Пароль',
  'Change password': 'Изменить пароль',
  'Full name': 'Имя и фамилия',
  'Bio': 'О себе',
  'Website': 'Сайт',
  'City': 'Город',
  'Country': 'Страна',
  'Date of birth': 'Дата рождения',
  'Gender': 'Пол',
  'Avatar': 'Аватар',
  'Profile image': 'Изображение профиля',
  'Header image': 'Изображение шапки',
  'Delete account': 'Удалить аккаунт',
  'Deactivate account': 'Деактивировать аккаунт',
  'Comments on my tracks': 'Комментарии к моим трекам',
  'Reposts of my tracks': 'Репосты моих треков',
  'Likes on my tracks': 'Отметки «Нравится» к моим трекам',
  'Mentions': 'Упоминания',
  'New followers': 'Новые подписчики',
  'Play counts': 'Счётчики прослушиваний',
  'Email notifications': 'Уведомления по email',
  'Push notifications': 'Push-уведомления',
  'Not available on this device': 'Недоступно на этом устройстве',
  'Explicit content filter': 'Фильтр контента 18+',
  'Player quality': 'Качество воспроизведения',
  'Allow playback on other devices': 'Разрешить воспроизведение на других устройствах',
  'Discoverability': 'Видимость профиля',
  'Allow direct messages': 'Разрешить личные сообщения',
  'Show my listening activity': 'Показывать мою активность',
  'Third-party advertising': 'Реклама от третьих лиц',
  'Advertising partners': 'Рекламные партнёры',
  'Enable personalized ads': 'Включить персонализированную рекламу',
  'Two-factor authentication': 'Двухфакторная аутентификация',
  'Active sessions': 'Активные сессии',
  'Connected apps': 'Подключённые приложения',
  'Sign out everywhere': 'Выйти на всех устройствах',
  'Download your data': 'Скачать ваши данные',
  'Advanced': 'Дополнительно',
  'Default': 'По умолчанию',
  'None': 'Нет',
  'Off': 'Выкл.',
  'On': 'Вкл.',
  'Enable': 'Включить',
  'Disable': 'Отключить',
  'Required': 'Обязательно',
  'Optional': 'Необязательно',
  // Language
  'Select your language': 'Выберите язык',
  'Language Picker': 'Выбор языка',
  'Language:': 'Язык:',
  // Subscriptions
  'Subscriptions': 'Подписки',
  'Current plans': 'Текущие планы',
  'Artist Pro plans include unlimited upload space and advanced features.':
    'Планы Artist Pro включают неограниченное место для загрузок и расширенные возможности.',
  'Hear full Go+ tracks from major and indie labels.':
    'Слушайте полные треки Go+ от крупных и независимых лейблов.',
  'Access full catalog, no ads, and offline listening.':
    'Полный каталог, без рекламы и прослушивание офлайн.',
  'Are you a student?': 'Вы студент?',
  'Get SoundCloud Go+ for 50% off': 'Получите SoundCloud Go+ со скидкой 50%',
  'Purchase history': 'История покупок',
  'Helpful links': 'Полезные ссылки',
  'Free': 'Бесплатно',
  'Pay monthly': 'Ежемесячная оплата',
  'Pay yearly': 'Годовая оплата',
  'Continue to payment': 'Перейти к оплате',
  'Cancel subscription': 'Отменить подписку',
  'Manage subscription': 'Управление подпиской',
  'You are currently subscribed to': 'Текущая подписка',
  // Artist Studio
  'Get unlimited uploads': 'Получайте безлимитные загрузки',
  'All time stats updated daily.': 'Статистика за всё время обновляется ежедневно.',
  'SC plays': 'Прослушивания SC',
  'Downloads': 'Скачивания',
  'Comments': 'Комментарии',
  'Insights': 'Статистика',
  'Earnings': 'Доход',
  'Fans': 'Фанаты',
  'Get started': 'Начать',
  'SoundCloud Tracks': 'Треки SoundCloud',
  'Distribution': 'Дистрибуция',
  'Vinyl Records': 'Виниловые пластинки',
  'Get Paid': 'Получать доход',
  'Drag and drop audio files to get started.': 'Перетащите аудиофайлы, чтобы начать.',
  'Choose files': 'Выбрать файлы',
  'Or record with a microphone': 'Или запишите с микрофона',
  'Upload recorded voice memos, updates, news, or intros to new releases.':
    'Загружайте голосовые заметки, обновления, новости и анонсы новых релизов.',
  'How SoundCloud works for artists at any stage.':
    'Как SoundCloud работает для артистов на любом этапе.',
  'UPLOAD': 'ЗАГРУЗКА',
  'GET HEARD': 'УСЛЫШАЛИ',
  'GET FANS': 'ОБРЕЛИ ФАНАТОВ',
  'GET PAID': 'ПОЛУЧАЙТЕ ДОХОД',
  'Last 7 days': 'Последние 7 дней',
  'Total': 'Всего',
  'of uploads used': 'загрузок использовано',
  // Upload
  'Upload your audio files.': 'Загрузите свои аудиофайлы.',
  'For best quality, use WAV, FLAC, AIFF, or ALAC.':
    'Для лучшего качества используйте WAV, FLAC, AIFF или ALAC.',
  'The maximum file size is 4GB uncompressed.':
    'Максимальный размер файла — 4 ГБ без сжатия.',
  'Upload track': 'Загрузить трек',
  'Track title': 'Название трека',
  'Title': 'Название',
  'Description': 'Описание',
  'Tags': 'Теги',
  'Genre': 'Жанр',
  'What’s the genre?': 'Какой жанр?',
  'What\'s the genre?': 'Какой жанр?',
  'Add a description': 'Добавьте описание',
  'Add tags': 'Добавьте теги',
  'Choose a thumbnail': 'Выберите обложку',
  'Publish': 'Опубликовать',
  'Processing…': 'Обработка…',
  'Uploading…': 'Загрузка…',
  'Unlisted': 'Не в списке',
  'Public': 'Публичный',
  'Private': 'Приватный',
  'Enable download': 'Разрешить скачивание',
  'Save as draft': 'Сохранить как черновик',
  // Shared blocks
  'followers': 'подписчиков',
  'tracks': 'треков',
  'plays': 'прослушиваний',
  'likes': 'отметок «Нравится»',
  'reposts': 'репостов',
  'comments': 'комментариев'
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
  'Procurar playlists do momento': 'Посмотреть популярные плейлисты',
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
  'Ouça as últimas publicações de quem você segue:': 'Последние публикации тех, на кого вы подписаны:',
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

// Words that mean the same label on a different page. Applied before the shared
// dictionary, so a page can own a word without breaking the other one.
const PAGE_TRANSLATIONS = {
  studio: { 'Likes': 'Нравится', 'Reposts': 'Репосты', 'Comments': 'Комментарии' },
  messages: { 'New': 'Новое сообщение', 'Me': 'Я' },
  notifications: { 'Following': 'Вы подписаны' }
};

// SoundCloud mixes typographic and straight apostrophes in the same bundle, so
// the lookup normalises whitespace and quotes but keeps case: 'NEW TRACKS' and
// 'New tracks' are two different labels with two different Russian captions.
function translationKey(value) {
  return value.trim().replace(/\s+/g, ' ').replace(/[\u2018\u2019\u02bc\u00b4]/g, "'");
}

const RU_EXACT = new Map();
const RU_FOLDED = new Map();
for (const [key, value] of Object.entries(RU_TRANSLATIONS)) {
  const normalized = translationKey(key);
  if (!RU_EXACT.has(normalized)) RU_EXACT.set(normalized, value);
  const folded = normalized.toLowerCase();
  if (folded.length > 2 && !RU_FOLDED.has(folded)) RU_FOLDED.set(folded, value);
}

// Number words that follow a digit. A count is only translated when the noun is
// in this table, so an arbitrary word next to a number is left alone.
const RU_COUNT_FORMS = {
  follower: ['подписчик', 'подписчика', 'подписчиков'],
  followers: ['подписчик', 'подписчика', 'подписчиков'],
  subscriber: ['подписчик', 'подписчика', 'подписчиков'],
  subscribers: ['подписчик', 'подписчика', 'подписчиков'],
  track: ['трек', 'трека', 'треков'],
  tracks: ['трек', 'трека', 'треков'],
  play: ['прослушивание', 'прослушивания', 'прослушиваний'],
  plays: ['прослушивание', 'прослушивания', 'прослушиваний'],
  like: ['отметка «Нравится»', 'отметки «Нравится»', 'отметок «Нравится»'],
  likes: ['отметка «Нравится»', 'отметки «Нравится»', 'отметок «Нравится»'],
  repost: ['репост', 'репоста', 'репостов'],
  reposts: ['репост', 'репоста', 'репостов'],
  comment: ['комментарий', 'комментария', 'комментариев'],
  comments: ['комментарий', 'комментария', 'комментариев'],
  download: ['скачивание', 'скачивания', 'скачиваний'],
  downloads: ['скачивание', 'скачивания', 'скачиваний'],
  playlist: ['плейлист', 'плейлиста', 'плейлистов'],
  playlists: ['плейлист', 'плейлиста', 'плейлистов'],
  album: ['альбом', 'альбома', 'альбомов'],
  albums: ['альбом', 'альбома', 'альбомов'],
  station: ['станция', 'станции', 'станций'],
  stations: ['станция', 'станции', 'станций'],
  visit: ['визит', 'визита', 'визитов'],
  visits: ['визит', 'визита', 'визитов'],
  reposted: ['репост', 'репоста', 'репостов'],
  seguidor: ['подписчик', 'подписчика', 'подписчиков'],
  seguidores: ['подписчик', 'подписчика', 'подписчиков'],
  faixa: ['трек', 'трека', 'треков'],
  faixas: ['трек', 'трека', 'треков'],
  reproducao: ['прослушивание', 'прослушивания', 'прослушиваний'],
  reproducoes: ['прослушивание', 'прослушивания', 'прослушиваний']
};

const RU_TIME_FORMS = {
  second: ['секунду', 'секунды', 'секунд'],
  minute: ['минуту', 'минуты', 'минут'],
  hour: ['час', 'часа', 'часов'],
  day: ['день', 'дня', 'дней'],
  week: ['неделю', 'недели', 'недель'],
  month: ['месяц', 'месяца', 'месяцев'],
  year: ['год', 'года', 'лет'],
  minute_abbr: ['минуту', 'минуты', 'минут'],
  min: ['минуту', 'минуты', 'минут'],
  mins: ['минуту', 'минуты', 'минут'],
  hr: ['час', 'часа', 'часов'],
  hrs: ['час', 'часа', 'часов'],
  sec: ['секунду', 'секунды', 'секунд'],
  secs: ['секунду', 'секунды', 'секунд'],
  yr: ['год', 'года', 'лет'],
  yrs: ['год', 'года', 'лет'],
  wk: ['неделю', 'недели', 'недель'],
  wks: ['неделю', 'недели', 'недель']
};

const RU_MONTHS = {
  january: 'января', february: 'февраля', march: 'марта', april: 'апреля',
  may: 'мая', june: 'июня', july: 'июля', august: 'августа',
  september: 'сентября', october: 'октября', november: 'ноября', december: 'декабря'
};

function ui(ru, en) {
  return state.appLanguage === 'ru' ? ru : en;
}

function russianCount(number, singular, few, many) {
  const value = typeof number === 'number' ? number : Number(String(number).replace(/[,.\s]/g, ''));
  if (!Number.isFinite(value)) return many;
  if (value % 100 >= 11 && value % 100 <= 14) return many;
  if (value % 10 === 1) return singular;
  if (value % 10 >= 2 && value % 10 <= 4) return few;
  return many;
}

// '1,234' and '1.2K' both decide the same Russian form, so the token is read as
// a number and only the noun changes; the digits SoundCloud wrote stay as they
// are, because they are part of the site's own formatting.
function countAmount(token) {
  const clean = token.replace(/\s/g, '');
  const suffix = clean.match(/[kKmMbB]$/)?.[0].toLowerCase() || '';
  const digits = (suffix ? clean.slice(0, -1) : clean).replace(/,/g, '');
  const value = Number(digits);
  if (!Number.isFinite(value)) return NaN;
  if (suffix === 'k') return value * 1e3;
  if (suffix === 'm') return value * 1e6;
  if (suffix === 'b') return value * 1e9;
  return value;
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
  const owned = PAGE_TRANSLATIONS[state.pageScope];
  if (owned && Object.hasOwn(owned, value)) return owned[value];
  if (RU_EXACT.has(value)) return RU_EXACT.get(value);
  const folded = value.toLowerCase();
  if (RU_FOLDED.has(folded)) return RU_FOLDED.get(folded);

  let match = value.match(/^(\d[\d,.]*) LIKES$/);
  if (match) return `ПОНРАВИЛОСЬ: ${match[1]}`;
  match = value.match(/^(\d[\d,.]*) (likes|curtidas)$/);
  if (match) return `Понравилось: ${match[1]}`;
  match = value.match(/^(?:Mixed for|Mixado para) (.+)$/);
  if (match) return `Микс для ${match[1]}`;
  match = value.match(/^Criado para (.+)$/);
  if (match) return `Создано для ${match[1]}`;
  match = value.match(/^(\d[\d.,]*%?) of uploads used$/);
  if (match) return `Использовано загрузок: ${match[1]}`;
  match = value.match(/^(.*)\s+of uploads used$/);
  if (match) return `Использовано загрузок: ${match[1]}`;
  // Relative time: '4 hours ago' becomes '4 часа назад', with the right form.
  // The pattern takes both singular and plural units; the lookup strips the
  // trailing 's', because 'days' and 'day' share one declension table.
  match = value.match(/^(\d[\d.,]*)\s+(seconds?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?|secs?|yrs?|wks?)\s+ago$/i);
  if (match) {
    const unit = match[2].toLowerCase();
    const forms = RU_TIME_FORMS[unit] || RU_TIME_FORMS[unit.replace(/s$/, '')];
    if (forms) {
      const amount = countAmount(match[1]);
      return `${match[1]} ${russianCount(amount, ...forms)} назад`;
    }
  }
  if (value === 'just now' || value === 'Just now') return 'только что';
  if (value === 'yesterday' || value === 'Yesterday') return 'вчера';
  if (value === 'today' || value === 'Today') return 'сегодня';
  if (value === 'now') return 'сейчас';
  // Feed context lines wrap the same relative time: 'Posted 1 day ago' and
  // 'Reposted 9 hours ago' translate the inner phrase with its own pattern.
  match = value.match(/^(?:Reposted|Posted) (.+ ago)$/i);
  if (match) {
    const inner = translatedValue(match[1], element);
    if (inner) return `${match[1].toLowerCase() === 'reposted' ? 'Репост' : 'Опубликовано'} ${inner}`;
  }
  // Counts: '1 follower' becomes '1 подписчик', '5 plays' becomes '5 прослушиваний'.
  // '1.2K' and '1,234' go through countAmount so they pick the right form.
  match = value.match(/^([\d][\d.,\s]*[kKmM]?)\s+([A-Za-zÀ-ÖØ-öø-ÿА-Яа-яЁё]+)\.?$/);
  if (match) {
    const forms = RU_COUNT_FORMS[match[2].toLowerCase()];
    if (forms) return `${match[1].trim()} ${russianCount(countAmount(match[1]), ...forms)}`;
  }
  // Absolute dates written the English way.
  match = value.match(/^([A-Z][a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (match && RU_MONTHS[match[1].toLowerCase()]) {
    return `${match[2]} ${RU_MONTHS[match[1].toLowerCase()]} ${match[3]} г.`;
  }
  match = value.match(/^(\d{1,2})\s+([A-Z][a-z]+)\s+(\d{4})$/);
  if (match && RU_MONTHS[match[2].toLowerCase()]) {
    return `${match[1]} ${RU_MONTHS[match[2].toLowerCase()]} ${match[3]} г.`;
  }
  match = value.match(/^([A-Z][a-z]+)\s+(\d{4})$/);
  if (match && RU_MONTHS[match[1].toLowerCase()]) {
    return `${RU_MONTHS[match[1].toLowerCase()]} ${match[2]} г.`;
  }
  match = value.match(/^(\d[\d.,]*[kKmM]?)\s+(followers|tracks|plays|likes|reposts|comments|seguidores|faixas|reproduções)$/);
  if (match) {
    const forms = {
      followers: ['подписчик', 'подписчика', 'подписчиков'],
      seguidores: ['подписчик', 'подписчика', 'подписчиков'],
      tracks: ['трек', 'трека', 'треков'],
      faixas: ['трек', 'трека', 'треков'],
      plays: ['прослушивание', 'прослушивания', 'прослушиваний'],
      reproduções: ['прослушивание', 'прослушивания', 'прослушиваний'],
      likes: ['отметка «Нравится»', 'отметки «Нравится»', 'отметок «Нравится»'],
      reposts: ['репост', 'репоста', 'репостов'],
      comments: ['комментарий', 'комментария', 'комментариев']
    };
    return `${match[1]} ${russianCount(countAmount(match[1]), ...forms[match[2]])}`;
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

module.exports = { ui, russianCount, translatedValue, translationKey };
