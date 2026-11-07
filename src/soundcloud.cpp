#include "soundcloud.h"
#include <utility>
#include <algorithm>
#include <memory>
#include <QSet>
#include <QBuffer>
#include <QPointer>
#include <QImage>
#include <QCoreApplication>
#include <QCryptographicHash>
#include <QDateTime>
#include <QDesktopServices>
#include <QDir>
#include <QFile>
#include <QJsonArray>
#include <QJsonObject>
#include <QNetworkReply>
#include <QRandomGenerator>
#include <QSaveFile>
#include <QSettings>
#include <QStandardPaths>
#include <QTcpSocket>
#include <QUrlQuery>

namespace {
QByteArray callbackPage(bool valid, bool receivedCode) {
    static const QByteArray page = [] {
        QFile file(":/resources/callback.html");
        file.open(QIODevice::ReadOnly);
        auto html = file.readAll();
        QImage logo(":/qt/qml/SCrip/assets/blob.png");
        QBuffer buffer;
        buffer.open(QIODevice::WriteOnly);
        if (!logo.isNull())
            logo.scaledToWidth(160, Qt::SmoothTransformation).save(&buffer, "PNG");
        html.replace("LOGO_DATA", buffer.data().toBase64());
        return html;
    }();
    auto html = page;
    if (!valid)
        return html.replace("PAGE_TITLE", "Начните вход в SCrip").replace("PAGE_MESSAGE", "Откройте приложение и нажмите «Войти в SoundCloud».");
    if (!receivedCode)
        return html.replace("PAGE_TITLE", "Вход не завершён").replace("PAGE_MESSAGE", "Вернитесь в приложение, чтобы попробовать ещё раз.");
    return html.replace("PAGE_TITLE", "Вернитесь в SCrip").replace("PAGE_MESSAGE", "Аккаунт SoundCloud подключён. Эту вкладку можно закрыть.");
}
QString nonce() {
    QByteArray bytes(32, Qt::Uninitialized);
    for (auto &c : bytes) c = char(QRandomGenerator::system()->generate() & 255);
    return QString::fromLatin1(bytes.toBase64(QByteArray::Base64UrlEncoding | QByteArray::OmitTrailingEquals));
}
bool privateWrite(const QString &path, const QJsonObject &object) {
    QSaveFile file(path);
    if (!file.open(QIODevice::WriteOnly)) return false;
    if (!file.setPermissions(QFileDevice::ReadOwner | QFileDevice::WriteOwner)) return false;
    file.write(QJsonDocument(object).toJson());
    return file.commit();
}
QVariantList items(const QJsonDocument &doc) {
    QJsonArray array = doc.isArray() ? doc.array() : doc.object().value("collection").toArray();
    QVariantList result;
    for (const auto &value : array) {
        auto item = value.toObject();
        if (item.contains("origin")) item = item.value("origin").toObject();
        if (item.contains("track")) item = item.value("track").toObject();
        if (!item.isEmpty()) result.append(item.toVariantMap());
    }
    return result;
}
QString apiPath(const QString &kind, const QString &urn) {
    return "/" + kind + "/" + QString::fromLatin1(QUrl::toPercentEncoding(urn));
}
}

SoundCloud::SoundCloud(QObject *parent, QNetworkAccessManager *network) : QObject(parent),
    m_network(network ? network : new QNetworkAccessManager(this)) {
    auto dir = QStandardPaths::writableLocation(QStandardPaths::GenericConfigLocation) + "/SCrip";
    QDir().mkpath(dir);
    m_configPath = dir + "/soundcloud.json";
    m_sessionPath = dir + "/session.json";
    m_state = {{"configured", false}, {"connected", false}, {"signedIn", false}, {"busy", false},
        {"home", QVariantList{}}, {"homeBusy", false}, {"homeError", ""}, {"authBusy", false}, {"error", ""}, {"status", "Подключите SoundCloud"}, {"tracks", QVariantList{}},
        {"queue", QVariantList{}}, {"profile", QVariantMap{}}, {"current", QVariantMap{}},
        {"playing", false}, {"position", 0}, {"duration", 0}, {"hasMore", false},
        {"heading", "Откройте свою музыку"}, {"configPath", m_configPath}, {"repeat", false}, {"shuffle", false}};
    loadConfig();
    QFile session(m_sessionPath);
    if (session.open(QIODevice::ReadOnly)) {
        auto s = QJsonDocument::fromJson(session.readAll()).object();
        if (s.value("client_id").toString() == m_clientId && (!m_useWorker || s.value("user_session").toBool())) {
            m_access = s.value("access_token").toString(); m_refresh = s.value("refresh_token").toString();
            m_expires = s.value("expires_at").toVariant().toLongLong(); m_userSession = s.value("user_session").toBool();
        }
    }
    player().setAudioOutput(&m_audio);
    QSettings preferences;
    m_audio.setVolume(preferences.value("player/volume", 0.7).toDouble());
    set("volume", m_audio.volume());
    m_volumeFade.setDuration(65);
    connect(&m_volumeFade, &QVariantAnimation::valueChanged, this, [this](const QVariant &level) {
        m_audio.setVolume(level.toFloat());
    });
    QList<QMediaPlayer *> players{&m_player};
#ifdef Q_OS_ANDROID
    players.append(&m_sparePlayer);
    m_preloadAudio.setMuted(true);
    m_preloadPlayer->setAudioOutput(&m_preloadAudio);
#endif
    for (auto *media : players) {
        connect(media, &QMediaPlayer::positionChanged, this, [this, media](qint64 p) { if (media == m_activePlayer) set("position", p); });
        connect(media, &QMediaPlayer::durationChanged, this, [this, media](qint64 d) { if (media == m_activePlayer) set("duration", d); });
        connect(media, &QMediaPlayer::playbackStateChanged, this, [this, media] { if (media == m_activePlayer) set("playing", media->playbackState() == QMediaPlayer::PlayingState); });
        connect(media, &QMediaPlayer::errorOccurred, this, [this, media](QMediaPlayer::Error e, const QString &) {
            if (media == m_activePlayer && e != QMediaPlayer::NoError) { set("buffering", false); fail("Не удалось воспроизвести трек. Проверьте сеть или выберите другой трек."); }
        });
        connect(media, &QMediaPlayer::mediaStatusChanged, this, [this, media](QMediaPlayer::MediaStatus status) {
#ifdef Q_OS_ANDROID
            if (media != m_activePlayer) {
                if (status == QMediaPlayer::BufferedMedia && media->playbackState() == QMediaPlayer::PlayingState) { media->pause(); if (media->position() > 0) media->setPosition(0); }
                return;
            }
#endif
            set("buffering", status == QMediaPlayer::LoadingMedia || status == QMediaPlayer::BufferingMedia);
            if (status == QMediaPlayer::EndOfMedia) {
                if (m_state.value("repeat").toBool()) startTrack(m_state.value("current").toMap()); else next();
            }
        });
    }
    connect(&m_callback, &QTcpServer::newConnection, this, &SoundCloud::callbackConnection);
    m_loginTimeout.setSingleShot(true); m_loginTimeout.setInterval(600000);
    connect(&m_loginTimeout, &QTimer::timeout, this, [this] { cancelLogin(); fail("Время ожидания входа истекло. Попробуйте снова."); });
    QTimer::singleShot(0, this, [this] { if (m_state.value("configured").toBool() && (!m_useWorker || m_userSession)) connectCatalog(); });
}
void SoundCloud::set(const QString &key, const QVariant &value) {
    if (m_state.value(key) == value) return;
    m_state[key] = value;
    emit changed();
    if (key == "signedIn") emit signedInChanged();
}
void SoundCloud::fail(const QString &message) { set("error", message); }
void SoundCloud::clearError() { set("error", ""); }
bool SoundCloud::loadConfig() {
    m_useWorker = qEnvironmentVariable("SCRIP_AUTH_MODE") != "local";
    if (m_useWorker) {
        // Публичный OAuth-идентификатор нужен браузеру для PKCE.
        m_clientId = "Tg84lXkGKCC4ALkAzLAwO4q3J0d85NKe";
        m_clientSecret.clear();
        m_redirect = "http://127.0.0.1:43821/callback";
        set("configured", true);
        return true;
    }
    QFile file(m_configPath);
    QJsonObject obj;
    if (file.open(QIODevice::ReadOnly)) obj = QJsonDocument::fromJson(file.readAll()).object();
    m_clientId = qEnvironmentVariable("SOUNDCLOUD_CLIENT_ID", obj.value("client_id").toString());
    m_clientSecret = qEnvironmentVariable("SOUNDCLOUD_CLIENT_SECRET", obj.value("client_secret").toString());
    m_redirect = obj.value("redirect_uri").toString("http://127.0.0.1:43821/callback");
    set("configured", !m_clientId.isEmpty() && !m_clientSecret.isEmpty());
    return m_state.value("configured").toBool();
}
void SoundCloud::configure(const QString &id, const QString &secret, const QString &redirect) {
    QUrl url(redirect.trimmed());
    if (id.trimmed().isEmpty() || (secret.isEmpty() && m_clientSecret.isEmpty())) { fail("Укажите Client ID и Client Secret."); return; }
    if (url.scheme() != "http" || url.host() != "127.0.0.1" || (url.port() < 1024 || url.port() > 65535) || url.path() != "/callback" || url.hasQuery() || url.hasFragment() || !url.userInfo().isEmpty()) {
        fail("Адрес возврата должен иметь вид http://127.0.0.1:43821/callback (порт от 1024)."); return;
    }
    auto newSecret = secret.isEmpty() ? m_clientSecret : secret.trimmed();
    if (!privateWrite(m_configPath, {{"client_id", id.trimmed()}, {"client_secret", newSecret}, {"redirect_uri", url.toString()}})) {
        fail("Не удалось сохранить настройки подключения."); return;
    }
    cancelLogin(); clearSession(); loadConfig(); clearError(); connectCatalog();
}
void SoundCloud::saveSession() {
    if (!privateWrite(m_sessionPath, {{"client_id", m_clientId}, {"access_token", m_access}, {"refresh_token", m_refresh},
        {"expires_at", m_expires}, {"user_session", m_userSession}})) fail("Сессия работает, но сохранить её на диске не удалось.");
}
void SoundCloud::token(const QUrlQuery &form, bool basic, std::function<void()> done, std::function<void()> failed) {
    QNetworkRequest request{QUrl(m_useWorker ? "https://scrip-auth.scrip-desktop-aca3d9.workers.dev/oauth/token"
                                            : "https://secure.soundcloud.com/oauth/token")};
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/x-www-form-urlencoded");
    request.setRawHeader("Accept", "application/json"); request.setTransferTimeout(20000);
    request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    if (basic && !m_useWorker) request.setRawHeader("Authorization", "Basic " + (m_clientId + ":" + m_clientSecret).toUtf8().toBase64());
    auto *reply = m_network->post(request, form.query(QUrl::FullyEncoded).toUtf8().replace("+", "%2B"));
    const int epoch = m_epoch;
    connect(reply, &QNetworkReply::finished, this, [this, reply, done, failed, epoch] {
        reply->deleteLater(); if (epoch != m_epoch) return;
        const auto obj = QJsonDocument::fromJson(reply->readAll()).object();
        if (reply->error() != QNetworkReply::NoError || obj.value("access_token").toString().isEmpty()) {
            m_refreshing = false; m_waiting.clear(); set("busy", false); set("authBusy", false); set("buffering", false);
            const int code = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
            if (code == 400 || code == 401) { m_access.clear(); m_refresh.clear(); QFile::remove(m_sessionPath); set("connected", false); set("signedIn", false); }
            if (failed) failed();
            fail(code == 429 ? "Лимит входов SoundCloud. Подождите перед повторной попыткой." : QString("SoundCloud не выдал токен (HTTP %1). Проверьте ключи, адрес возврата и доступ к сети.").arg(code));
            return;
        }
        m_access = obj.value("access_token").toString(); m_refresh = obj.value("refresh_token").toString();
        m_expires = QDateTime::currentSecsSinceEpoch() + obj.value("expires_in").toInt(3600);
        saveSession(); set("connected", true); set("signedIn", m_userSession); set("status", m_userSession ? "Аккаунт подключён" : "Публичный каталог подключён");
        done();
    });
}
void SoundCloud::ensureToken(std::function<void()> continuation) {
    if (!m_access.isEmpty() && QDateTime::currentSecsSinceEpoch() < m_expires - 60) { continuation(); return; }
    if (!m_state.value("configured").toBool()) { set("busy", false); fail("Сначала настройте подключение к SoundCloud."); return; }
    if (m_useWorker && m_refresh.isEmpty()) { set("busy", false); fail("Войдите в SoundCloud."); return; }
    m_waiting.append(continuation);
    if (m_refreshing) return;
    m_refreshing = true;
    QUrlQuery form;
    const bool basic = m_refresh.isEmpty();
    if (basic) { m_userSession = false; form.addQueryItem("grant_type", "client_credentials"); }
    else {
        form.addQueryItem("grant_type", "refresh_token"); form.addQueryItem("refresh_token", m_refresh);
        if (!m_useWorker) { form.addQueryItem("client_id", m_clientId); form.addQueryItem("client_secret", m_clientSecret); }
    }
    token(form, basic, [this] {
        m_refreshing = false;
        auto waiting = std::exchange(m_waiting, {});
        for (const auto &task : waiting) task();
    });
}
void SoundCloud::request(const QString &path, Callback done, const QByteArray &method, const QJsonObject &body, bool retry, std::function<void(QString)> failed) {
    QUrl url(path.startsWith('/') ? "https://api.soundcloud.com" + path : path);
    if (url.scheme() != "https" || url.host() != "api.soundcloud.com" || (url.port() != -1 && url.port() != 443) || !url.userInfo().isEmpty()) { set("busy", false); if (failed) failed("API вернул недопустимый адрес."); else fail("API вернул недопустимый адрес."); return; }
    ensureToken([this, url, path, done, method, body, retry, failed] {
        QNetworkRequest req(url); req.setRawHeader("Authorization", "OAuth " + m_access.toUtf8());
        req.setRawHeader("Accept", "application/json"); req.setTransferTimeout(25000);
        req.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
        req.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
        auto *reply = m_network->sendCustomRequest(req, method, body.isEmpty() ? QByteArray{} : QJsonDocument(body).toJson(QJsonDocument::Compact));
        const int epoch = m_epoch;
        connect(reply, &QNetworkReply::finished, this, [=, this] {
            reply->deleteLater(); if (epoch != m_epoch) return;
            int status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
            if (status == 401 && retry && !m_refresh.isEmpty()) { m_expires = 0; request(path, done, method, body, false, failed); return; }
            if (reply->error() != QNetworkReply::NoError || status >= 300) {
                if (!failed) { set("busy", false); set("buffering", false); }
                const QString message = status == 429 ? "SoundCloud ограничил запросы. Повторите позже." : status == 403 ? "SoundCloud ограничил доступ к этому действию или треку." : status == 401 ? "Сессия истекла. Подключитесь заново." : QString("Не удалось выполнить запрос (HTTP %1). Проверьте сеть и повторите.").arg(status);
                if (failed) failed(message); else fail(message);
                return;
            }
            const QByteArray bytes = reply->readAll(); QJsonParseError error;
            auto doc = QJsonDocument::fromJson(bytes, &error);
            if (!bytes.isEmpty() && error.error != QJsonParseError::NoError) { set("busy", false); if (failed) failed("SoundCloud вернул некорректный ответ."); else fail("SoundCloud вернул некорректный ответ."); return; }
            done(doc);
        });
    });
}
void SoundCloud::connectCatalog() {
    if (m_refreshing || m_state.value("authBusy").toBool()) return;
    clearError(); set("busy", true);
    ensureToken([this] { set("connected", true); set("signedIn", m_userSession); set("busy", false); set("status", m_userSession ? "Аккаунт подключён" : "Публичный каталог подключён"); if (m_userSession) { profile(); browse("likes"); } else browse("tracks", ""); });
}
void SoundCloud::profile() { request("/me", [this](QJsonDocument d) { set("profile", d.object().toVariantMap()); }); }
void SoundCloud::login() {
    if (m_state.value("authBusy").toBool() || m_refreshing) return;
    if (!loadConfig()) { fail("Подключение ещё не настроено. См. раздел «Первое подключение» в README."); return; }
    const QUrl redirect(m_redirect);
    if (redirect.scheme() != "http" || redirect.host() != "127.0.0.1" || redirect.path() != "/callback" || (redirect.port() < 1024 || redirect.port() > 65535) || redirect.hasQuery() || redirect.hasFragment() || !redirect.userInfo().isEmpty()) { fail("Настройте локальный адрес возврата."); return; }
    if (!m_callback.listen(QHostAddress::LocalHost, quint16(redirect.port()))) { fail("Порт для входа занят. Закройте второй экземпляр SCrip или измените порт."); return; }
    clearError(); m_verifier = nonce(); m_oauthState = nonce();
    QUrl url("https://secure.soundcloud.com/authorize"); QUrlQuery query;
    query.addQueryItem("client_id", m_clientId); query.addQueryItem("redirect_uri", m_redirect);
    query.addQueryItem("response_type", "code"); query.addQueryItem("code_challenge_method", "S256"); query.addQueryItem("state", m_oauthState);
    query.addQueryItem("code_challenge", QString::fromLatin1(QCryptographicHash::hash(m_verifier.toLatin1(), QCryptographicHash::Sha256).toBase64(QByteArray::Base64UrlEncoding | QByteArray::OmitTrailingEquals)));
    url.setQuery(query); set("authBusy", true); m_loginTimeout.start();
    set("authStep", "browser"); emit authorizationRequested(url);
}
void SoundCloud::browserFailed() { cancelLogin(); fail("Не удалось открыть окно входа. Проверьте установленный браузер."); }
void SoundCloud::cancelLogin() { m_callback.close(); m_loginTimeout.stop(); m_oauthState.clear(); m_verifier.clear(); set("authBusy", false); set("authStep", ""); }
void SoundCloud::callbackConnection() {
    while (m_callback.hasPendingConnections()) {
        auto *socket = m_callback.nextPendingConnection();
        connect(socket, &QTcpSocket::disconnected, socket, &QObject::deleteLater);
        QTimer::singleShot(10000, socket, [socket] { if (!socket->property("handled").toBool()) socket->disconnectFromHost(); });
        connect(socket, &QTcpSocket::readyRead, this, [this, socket] {
            QByteArray data = socket->property("request").toByteArray() + socket->readAll();
            if (data.size() > 8192) { socket->disconnectFromHost(); return; }
            socket->setProperty("request", data);
            if (!data.contains("\r\n\r\n")) return;
            if (socket->property("handled").toBool()) return; socket->setProperty("handled", true);
            auto parts = data.left(data.indexOf("\r\n")).split(' ');
            QUrl url = parts.size() > 1 ? QUrl::fromEncoded(parts[1]) : QUrl{}; QUrlQuery query(url);
            const bool valid = parts.value(0) == "GET" && url.path() == "/callback" && !m_oauthState.isEmpty() && query.queryItemValue("state") == m_oauthState;
            const bool receivedCode = !query.hasQueryItem("error") && !query.queryItemValue("code").isEmpty();
            const auto respond = [peer = QPointer<QTcpSocket>(socket), valid](bool success) {
                if (!peer || peer->state() != QAbstractSocket::ConnectedState) return;
                const auto html = callbackPage(valid, success);
                peer->write(QByteArray(valid && success ? "HTTP/1.1 200 OK\r\n" : "HTTP/1.1 400 Bad Request\r\n") +
                    "Content-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: " +
                    QByteArray::number(html.size()) + "\r\n\r\n" + html);
                peer->disconnectFromHost();
            };
            if (!valid) { respond(false); return; }
            const auto verifier = m_verifier; cancelLogin();
            if (!receivedCode) { respond(false); fail("Вход отменён в SoundCloud."); return; }
            // Отменяем ответы старой гостевой сессии перед обменом кода.
            ++m_epoch; m_waiting.clear(); m_refreshing = false; set("authBusy", true); set("authStep", "exchange");
            QUrlQuery form; form.addQueryItem("grant_type", "authorization_code");
            if (!m_useWorker) {
                form.addQueryItem("client_id", m_clientId);
                form.addQueryItem("client_secret", m_clientSecret); form.addQueryItem("redirect_uri", m_redirect);
            }
            form.addQueryItem("code", query.queryItemValue("code")); form.addQueryItem("code_verifier", verifier);
            token(form, false, [this, respond] {
                m_userSession = true;
                saveSession();
                set("signedIn", true);
                set("authBusy", false);
                set("authStep", "");
                set("status", "Аккаунт подключён");
                respond(true);
                profile();
                browse("likes");
            }, [this, respond] { set("authStep", ""); respond(false); });
        });
    }
}
void SoundCloud::clearSession() {
    ++m_prefetchGeneration; m_prefetchedId.clear(); m_prefetchedUrl.clear();
    ++m_homeGeneration; set("home", QVariantList{}); set("homeBusy", false); set("homeError", "");
    set("savingTrack", false); set("loadingDestinations", false); set("destinations", QVariantList{}); set("destinationNext", "");
#ifdef Q_OS_ANDROID
    ++m_preloadGeneration; m_preloadUrn.clear(); m_preloadIndex = -1;
    m_preloadPlayer->stop(); m_preloadPlayer->setSource(QUrl{});
#endif
    ++m_epoch; ++m_listing; ++m_playGeneration; player().stop(); player().setSource(QUrl{});
    m_access.clear(); m_refresh.clear(); m_expires = 0; m_userSession = false; m_refreshing = false; m_waiting.clear();
    QFile::remove(m_sessionPath); m_queue.clear(); m_queueIndex = -1; m_nextHref.clear();
    set("queue", m_queue); set("queueIndex", -1); set("buffering", false); set("current", QVariantMap{}); set("tracks", QVariantList{}); set("profile", QVariantMap{});
    set("connected", false); set("signedIn", false); set("busy", false); set("hasMore", false); set("status", "Аккаунт отключён");
}
void SoundCloud::logout() {
    cancelLogin();
    if (m_userSession && !m_access.isEmpty()) {
        // Отзыв доступа подтверждается сервером; при сетевой ошибке локальный выход доступен отдельно через настройки.
        request("/disconnect", [this](QJsonDocument) { clearSession(); clearError(); }, "POST");
    } else { clearSession(); clearError(); }
}
QString SoundCloud::urn(const QVariantMap &item) { return item.value("urn").toString(); }
void SoundCloud::browse(const QString &page, const QString &query) {
    clearError(); QString path;
    const bool personal = page == "likes" || page == "mine" || page == "playlists" || page == "history" || page == "feed" || page == "reposts";
    if (personal && !m_state.value("signedIn").toBool()) { ++m_listing; set("tracks", QVariantList{}); set("hasMore", false); set("heading", "Войдите в SoundCloud"); set("busy", false); return; }
    if (page == "likes") { path = "/me/likes/tracks"; set("heading", "Любимые треки"); }
    else if (page == "reposts") { path = "/me/reposts/tracks"; set("heading", "Репосты"); }
    else if (page == "mine") { path = "/me/tracks"; set("heading", "Мои треки"); }
    else if (page == "playlists") { path = "/me/playlists"; set("heading", "Мои плейлисты"); }
    else if (page == "userTracks" || page == "userSets") {
        if (!query.startsWith("soundcloud:users:")) return;
        const auto userPath = apiPath("users", query);
        if (urn(m_state.value("visitedProfile").toMap()) != query)
            request(userPath, [this, query](QJsonDocument doc) {
                if (urn(doc.object().toVariantMap()) == query) set("visitedProfile", doc.object().toVariantMap());
            });
        path = userPath + (page == "userSets" ? "/playlists" : "/tracks");
    }
    else if (page == "history") { path = "/me/recently-played/tracks"; set("heading", "Недавно слушали"); }
    else if (page == "feed") { path = "/me/feed/tracks"; set("heading", "Лента подписок"); }
    else {
        if (query.trimmed().isEmpty()) { ++m_listing; set("busy", false); set("tracks", QVariantList{}); set("hasMore", false); set("heading", "Введите название или исполнителя"); return; }
        path = page == "users" ? "/users" : page == "sets" ? "/playlists" : "/tracks";
        QUrlQuery q; q.addQueryItem("q", query.trimmed()); path += "?" + q.query(QUrl::FullyEncoded); set("heading", "Результаты: " + query.trimmed());
    }
    if (page != "history") path += (path.contains('?') ? "&" : "?") + QString("limit=30&linked_partitioning=true");
    m_lastPath = path; collection(path);
}
void SoundCloud::collection(const QString &path, bool append) {
    int generation = ++m_listing; set("busy", true); set("hasMore", false);
    if (!append) { m_nextHref.clear(); set("tracks", QVariantList{}); }
    request(path, [this, generation, append](QJsonDocument doc) {
        if (generation != m_listing) return;
        auto list = append ? m_state.value("tracks").toList() : QVariantList{};
        for (auto item : items(doc)) {
            auto map = item.toMap();
            if (m_lastPath.startsWith("/me/likes/tracks")) map["user_favorite"] = true;
            bool exists = false; for (const auto &old : list) if (urn(old.toMap()) == urn(map)) { exists = true; break; }
            if (!exists) list.append(map);
        }
        set("tracks", list); const auto next = doc.object().value("next_href").toString(); m_nextHref = next == m_nextHref ? QString{} : next; set("hasMore", !m_nextHref.isEmpty()); set("busy", false);
    }, "GET", {}, true, [this, generation, append](QString error) {
        if (generation != m_listing) return;
        set("hasMore", append && !m_nextHref.isEmpty()); set("busy", false); fail(error);
    });
}
void SoundCloud::loadHome(bool force) {
    if (!m_state.value("signedIn").toBool() || m_state.value("homeBusy").toBool()) return;
    if (!force && !m_state.value("home").toList().isEmpty()) return;
    const int generation = ++m_homeGeneration;
    set("homeBusy", true); set("homeError", ""); set("home", QVariantList{});
    // Независимые источники: недоступность одного не скрывает остальные.
    auto remaining = std::make_shared<int>(3);
    auto finish = [this, generation, remaining] {
        if (generation == m_homeGeneration && --*remaining == 0) set("homeBusy", false);
    };
    auto failed = [this, generation, finish](QString error) {
        if (generation != m_homeGeneration) return;
        set("homeError", error); finish();
    };
    auto add = [this, generation](QString title, QString subtitle, QVariantList tracks, bool mix, int order) {
        if (generation != m_homeGeneration) return;
        QVariantList clean;
        QSet<QString> seen;
        for (const auto &track : tracks) {
            auto id = urn(track.toMap());
            if (!id.startsWith("soundcloud:tracks:") || seen.contains(id)) continue;
            seen.insert(id); clean.append(track);
        }
        if (clean.isEmpty()) return;
        auto shelves = m_state.value("home").toList();
        shelves.append(QVariantMap{{"title", title}, {"subtitle", subtitle}, {"tracks", clean}, {"mix", mix}, {"order", order}});
        std::stable_sort(shelves.begin(), shelves.end(), [](const QVariant &a, const QVariant &b) { return a.toMap().value("order").toInt() < b.toMap().value("order").toInt(); });
        set("home", shelves);
    };
    request("/me/followings/tracks?limit=24", [add, finish](QJsonDocument doc) {
        auto tracks = items(doc);
        std::stable_sort(tracks.begin(), tracks.end(), [](const QVariant &a, const QVariant &b) { return a.toMap().value("created_at").toString() > b.toMap().value("created_at").toString(); });
        add("Новые релизы", "Свежие загрузки исполнителей из ваших подписок", tracks, false, 1); finish();
    }, "GET", {}, true, failed);
    request("/me/recently-played/tracks", [add, finish](QJsonDocument doc) {
        add("Слушать снова", "Ваши недавние прослушивания", items(doc), false, 3); finish();
    }, "GET", {}, true, failed);
    request("/me/likes/tracks?limit=24&linked_partitioning=true", [this, generation, add, finish, failed](QJsonDocument doc) {
        if (generation != m_homeGeneration) return;
        auto tracks = items(doc);
        for (auto &entry : tracks) { auto track = entry.toMap(); track["user_favorite"] = true; entry = track; }
        add("Микс любимых", "Подборка SCrip из последних добавленных любимых треков", tracks, true, 0);
        if (tracks.isEmpty()) { finish(); return; }
        auto seed = tracks.first().toMap();
        request(apiPath("tracks", urn(seed)) + "/related?limit=24&linked_partitioning=true", [add, finish, seed](QJsonDocument related) {
            add("Вам может понравиться", "Похожие на «" + seed.value("title").toString() + "» · SoundCloud", items(related), false, 2);
            add("Микс открытий", "Подборка SCrip из похожих треков", items(related), true, 0); finish();
        }, "GET", {}, true, failed);
    }, "GET", {}, true, failed);
    QTimer::singleShot(60000, this, [this, generation] {
        if (generation == m_homeGeneration && m_state.value("homeBusy").toBool()) {
            ++m_homeGeneration; set("homeBusy", false); set("homeError", "Загрузка заняла слишком много времени. Обновите главную.");
        }
    });
}
void SoundCloud::playMix(const QVariantList &tracks, int index) {
    if (index < 0 || index >= tracks.size()) return;
    m_queue.clear();
    for (const auto &track : tracks) if (urn(track.toMap()).startsWith("soundcloud:tracks:")) m_queue.append(track);
    set("queue", m_queue); playQueue(qMin(index, int(m_queue.size()) - 1));
}
void SoundCloud::playStation(const QVariantMap &seed) {
    if (!urn(seed).startsWith("soundcloud:tracks:")) return;
    const int generation = ++m_playGeneration;
    request(apiPath("tracks", urn(seed)) + "/related?limit=40", [this, generation, seed](QJsonDocument doc) {
        if (generation != m_playGeneration) return;
        QVariantList queue{seed};
        for (const auto &entry : items(doc))
            if (urn(entry.toMap()) != urn(seed)) queue.append(entry);
        playMix(queue);
    });
}

void SoundCloud::listDestinations(const QString &next) {
    if (!signedIn() || m_state.value("loadingDestinations").toBool()) return;
    if (!next.isEmpty() && next != m_state.value("destinationNext").toString()) return;
    if (next.isEmpty()) { set("destinations", QVariantList{}); set("destinationNext", ""); }
    set("loadingDestinations", true);
    request(next.isEmpty() ? QString("/me/playlists?limit=50&linked_partitioning=true") : next,
        [this](QJsonDocument doc) {
            auto list = m_state.value("destinations").toList();
            list.append(items(doc));
            set("destinations", list);
            set("destinationNext", doc.object().value("next_href").toString());
            set("loadingDestinations", false);
        }, "GET", {}, true, [this](QString error) { set("loadingDestinations", false); fail(error); });
}

void SoundCloud::saveToPlaylist(const QString &track, const QString &playlist, const QString &newTitle) {
    if (!signedIn() || !track.startsWith("soundcloud:tracks:") || m_state.value("savingTrack").toBool()) return;
    if (playlist.isEmpty() ? newTitle.trimmed().isEmpty() : !playlist.startsWith("soundcloud:playlists:")) return;
    set("savingTrack", true);
    auto failed = [this](QString error) { set("savingTrack", false); fail(error); };
    auto done = [this](QJsonDocument) { set("savingTrack", false); emit trackSaved(); };
    const QJsonObject entry{{"urn", track}};
    if (playlist.isEmpty()) {
        QJsonObject album{{"title", newTitle.trimmed()}, {"sharing", "private"}, {"set_type", "album"}, {"tracks", QJsonArray{entry}}};
        request("/playlists", done, "POST", {{"playlist", album}}, true, failed);
        return;
    }
    const auto path = apiPath("playlists", playlist);
    request(path + "?representation=full", [=, this](QJsonDocument doc) {
        const auto album = doc.object();
        const auto existing = album.value("tracks").toArray();
        if (!album.value("tracks").isArray() || existing.size() != album.value("track_count").toInt(-1)) {
            failed("SoundCloud вернул неполный список треков. Альбом сохранён без изменений."); return;
        }
        QJsonArray updated;
        for (const auto &value : existing) {
            const auto id = value.toObject().value("urn").toString();
            if (!id.startsWith("soundcloud:tracks:")) { failed("Не удалось прочитать состав альбома."); return; }
            if (id == track) { done({}); return; }
            updated.append(QJsonObject{{"urn", id}});
        }
        updated.append(entry);
        request(path, done, "PUT", {{"playlist", QJsonObject{{"tracks", updated}}}}, true, failed);
    }, "GET", {}, true, failed);
}

void SoundCloud::more() { if (!m_state.value("busy").toBool() && !m_nextHref.isEmpty()) collection(m_nextHref, true); }
void SoundCloud::openPlaylist(const QVariantMap &item) {
    if (urn(item).isEmpty()) return;
    m_lastPath = apiPath("playlists", urn(item)) + "/tracks?linked_partitioning=true";
    set("heading", item.value("title")); collection(m_lastPath);
}
void SoundCloud::enqueue(const QVariantMap &item) {
    if (!urn(item).startsWith("soundcloud:tracks:")) return;
    m_queue.append(item); set("queue", m_queue);
#ifdef Q_OS_ANDROID
    prepareNext();
#endif
}
void SoundCloud::play(const QVariantMap &item) {
    if (item.value("kind").toString() == "playlist" || urn(item).startsWith("soundcloud:playlists:")) { openPlaylist(item); return; }
    m_queue.clear();
    for (const auto &entry : m_state.value("tracks").toList()) if (urn(entry.toMap()).startsWith("soundcloud:tracks:")) m_queue.append(entry);
    m_queueIndex = -1;
    for (int i=0; i<m_queue.size(); ++i) if (urn(m_queue[i].toMap()) == urn(item)) m_queueIndex = i;
    if (m_queueIndex < 0) { m_queue.prepend(item); m_queueIndex = 0; }
    set("queue", m_queue); set("queueIndex", m_queueIndex); startTrack(item);
}
void SoundCloud::playQueue(int index) { if (index >= 0 && index < m_queue.size()) { m_queueIndex = index; set("queueIndex", index); startTrack(m_queue[index].toMap()); } }
void SoundCloud::moveQueue(int from, int to) {
    if (from < 0 || to < 0 || from >= m_queue.size() || to >= m_queue.size() || from == to) return;
    m_queue.move(from, to);
    if (m_queueIndex == from) m_queueIndex = to;
    else if (from < m_queueIndex && to >= m_queueIndex) --m_queueIndex;
    else if (from > m_queueIndex && to <= m_queueIndex) ++m_queueIndex;
    m_state["queueIndex"] = m_queueIndex;
    m_state["queue"] = m_queue;
    emit changed();
#ifdef Q_OS_ANDROID
    prepareNext();
#endif
}
void SoundCloud::queueNext(int index) {
    if (index < 0 || index >= m_queue.size() || index == m_queueIndex) return;
    moveQueue(index, index < m_queueIndex ? m_queueIndex : m_queueIndex + 1);
    m_forceNext = true;
#ifdef Q_OS_ANDROID
    prepareNext();
#endif
}
void SoundCloud::removeQueue(int index) {
    if (index < 0 || index >= m_queue.size()) return;
    m_queue.removeAt(index); if (index <= m_queueIndex) --m_queueIndex;
    set("queue", m_queue); set("queueIndex", m_queueIndex);
#ifdef Q_OS_ANDROID
    prepareNext();
#endif
}
void SoundCloud::next() {
    if (m_queue.isEmpty()) return;
    int index = m_queueIndex + 1;
    if (!m_forceNext && m_state.value("shuffle").toBool() && m_queue.size() > 1) { do { index = QRandomGenerator::global()->bounded(int(m_queue.size())); } while (index == m_queueIndex); }
#ifdef Q_OS_ANDROID
    if (m_preloadIndex >= 0 && m_preloadIndex < m_queue.size() && urn(m_queue[m_preloadIndex].toMap()) == m_preloadUrn) index = m_preloadIndex;
#endif
    if (index < m_queue.size()) playQueue(index);
}
void SoundCloud::previous() { if (player().position() > 3000) player().setPosition(0); else if (m_queueIndex > 0) playQueue(m_queueIndex - 1); }
void SoundCloud::togglePlayback() { if (player().playbackState() == QMediaPlayer::PlayingState) player().pause(); else if (!player().source().isEmpty()) player().play(); }
void SoundCloud::seek(qint64 position) { if (player().isSeekable()) player().setPosition(qBound(qint64(0), position, player().duration())); }
void SoundCloud::volume(double value) {
    const double target = qBound(0.0, value, 1.0);
    if (target == m_state.value("volume").toDouble()) return;
    m_volumeFade.stop();
    m_volumeFade.setStartValue(double(m_audio.volume()));
    m_volumeFade.setEndValue(target);
    m_volumeFade.start();
    set("volume", target);
    QSettings().setValue("player/volume", target);
}
void SoundCloud::setRepeat(bool enabled) { set("repeat", enabled); }
void SoundCloud::setShuffle(bool enabled) { set("shuffle", enabled);
#ifdef Q_OS_ANDROID
    prepareNext();
#endif
}
void SoundCloud::startTrack(const QVariantMap &track) {
    m_forceNext = false;
    if (!urn(track).startsWith("soundcloud:tracks:")) return;
    clearError(); ++m_playGeneration;
#ifdef Q_OS_ANDROID
    const bool prepared = urn(track) == m_preloadUrn && !m_preloadPlayer->source().isEmpty() && m_preloadPlayer->error() == QMediaPlayer::NoError;
    ++m_preloadGeneration;
    player().stop(); player().setSource(QUrl{});
    if (prepared) {
        player().setAudioOutput(nullptr);
        m_preloadPlayer->setAudioOutput(nullptr);
        std::swap(m_activePlayer, m_preloadPlayer);
        player().setAudioOutput(&m_audio);
        m_preloadPlayer->setAudioOutput(&m_preloadAudio);
    }
    m_preloadUrn.clear(); m_preloadIndex = -1;
#else
    player().stop(); player().setSource(QUrl{});
#endif
    set("current", track); set("position", 0); set("duration", track.value("duration"));
    if (track.value("access").toString() == "blocked" || track.value("streamable") == false) { fail("Этот трек недоступен для воспроизведения через API."); return; }
#ifdef Q_OS_ANDROID
    if (prepared) {
        set("buffering", player().mediaStatus() != QMediaPlayer::BufferedMedia);
        player().setPosition(0); player().play(); prepareNext(); return;
    }
#endif
    const int generation = m_playGeneration; set("buffering", true);
    if (m_prefetchedId == urn(track) && !m_prefetchedUrl.isEmpty()) {
        const auto url = m_prefetchedUrl;
        m_prefetchedId.clear(); m_prefetchedUrl.clear();
        resolveStream(url, generation);
        return;
    }
    request(apiPath("tracks", urn(track)) + "/streams", [this, generation](QJsonDocument doc) {
        if (generation != m_playGeneration) return;
        auto object = doc.object(); QString url = object.value("hls_aac_160_url").toString();
        if (url.isEmpty()) url = object.value("hls_mp3_128_url").toString();
        if (url.isEmpty()) url = object.value("preview_mp3_128_url").toString();
        if (url.isEmpty()) { set("buffering", false); fail("SoundCloud не предоставил доступный аудиопоток."); return; }
        resolveStream(QUrl(url), generation);
    });
}
void SoundCloud::resolveStream(const QUrl &url, int generation, int redirects) {
    if (generation != m_playGeneration) return;
    if (url.scheme() != "https" || redirects > 5 || !url.userInfo().isEmpty()) { set("buffering", false); fail("Недопустимый адрес аудиопотока."); return; }
    // CDN SoundCloud выдаёт подписанные URL. OAuth передаём только API, никогда стороннему хосту.
    if (url.host() != "api.soundcloud.com") { player().setSource(url); player().play(); prefetchNext(); return; }
    QNetworkRequest req(url); req.setRawHeader("Authorization", "OAuth " + m_access.toUtf8()); req.setTransferTimeout(20000);
    req.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    auto *reply = m_network->get(req);
    connect(reply, &QNetworkReply::finished, this, [=, this] {
        reply->deleteLater(); if (generation != m_playGeneration) return;
        auto redirect = reply->attribute(QNetworkRequest::RedirectionTargetAttribute).toUrl();
        if (!redirect.isEmpty()) { resolveStream(url.resolved(redirect), generation, redirects + 1); return; }
        auto doc = QJsonDocument::fromJson(reply->readAll());
        auto nextUrl = doc.object().value("url").toString();
        if (!nextUrl.isEmpty()) { resolveStream(QUrl(nextUrl), generation, redirects + 1); return; }
        set("buffering", false); fail("Не удалось получить адрес потока SoundCloud. Попробуйте другой трек.");
    });
}
void SoundCloud::prefetchNext() {
    const int generation = ++m_prefetchGeneration;
    m_prefetchedId.clear(); m_prefetchedUrl.clear();
    if (m_state.value("shuffle").toBool() || m_queueIndex + 1 >= m_queue.size()) return;
    const auto track = m_queue.at(m_queueIndex + 1).toMap();
    const auto id = urn(track);
    if (!id.startsWith("soundcloud:tracks:") || track.value("access").toString() == "blocked" || track.value("streamable") == false) return;
    request(apiPath("tracks", id) + "/streams", [this, generation, id](QJsonDocument doc) {
        if (generation != m_prefetchGeneration) return;
        const auto object = doc.object();
        QString url = object.value("hls_aac_160_url").toString();
        if (url.isEmpty()) url = object.value("hls_mp3_128_url").toString();
        if (url.isEmpty()) url = object.value("preview_mp3_128_url").toString();
        if (QUrl(url).scheme() != "https") return;
        m_prefetchedId = id;
        m_prefetchedUrl = QUrl(url);
    }, "GET", {}, true, [](QString) {});
}
void SoundCloud::like(const QVariantMap &item) {
    if (!m_state.value("signedIn").toBool()) { fail("Войдите в аккаунт, чтобы менять избранное."); return; }
    const auto id = urn(item); if (!id.startsWith("soundcloud:tracks:")) return; const bool liked = item.value("user_favorite").toBool();
    request(apiPath("likes/tracks", id), [this, id, liked](QJsonDocument) {
        auto update = [id, liked](QVariantList list) { for (auto &v : list) { auto m = v.toMap(); if (urn(m) == id) { m["user_favorite"] = !liked; v = m; } } return list; };
        set("tracks", update(m_state.value("tracks").toList())); m_queue = update(m_queue); set("queue", m_queue);
        auto shelves = m_state.value("home").toList();
        for (auto &entry : shelves) {
            auto shelf = entry.toMap();
            shelf["tracks"] = update(shelf.value("tracks").toList());
            entry = shelf;
        }
        set("home", shelves);
        auto current = m_state.value("current").toMap(); if (urn(current) == id) { current["user_favorite"] = !liked; set("current", current); }
    }, liked ? "DELETE" : "POST");
}
void SoundCloud::createPlaylist(const QString &title, bool includeCurrent) {
    if (!m_state.value("signedIn").toBool()) { fail("Сначала войдите в SoundCloud."); return; }
    if (title.trimmed().isEmpty()) { fail("Укажите название плейлиста."); return; }
    QJsonObject playlist{{"title", title.trimmed()}, {"sharing", "private"}};
    if (includeCurrent && !m_state.value("current").toMap().isEmpty()) playlist["tracks"] = QJsonArray{QJsonObject{{"urn", urn(m_state.value("current").toMap())}}};
    request("/playlists", [this](QJsonDocument) { browse("playlists"); }, "POST", {{"playlist", playlist}});
}
void SoundCloud::openExternal(const QString &value) {
    QUrl url(value); if (url.scheme() == "https" && (url.host() == "soundcloud.com" || url.host().endsWith(".soundcloud.com"))) QDesktopServices::openUrl(url);
}

#ifdef Q_OS_ANDROID
// Готовим только один следующий поток. Ошибки фоновой загрузки не прерывают текущий трек.
void SoundCloud::prepareNext() {
    const int generation = ++m_preloadGeneration;
    m_preloadPlayer->stop(); m_preloadPlayer->setSource(QUrl{});
    m_preloadUrn.clear(); m_preloadIndex = -1;
    if (m_queueIndex < 0 || m_queue.isEmpty() || player().source().isEmpty()) return;
    int index = m_queueIndex + 1;
    if (!m_forceNext && m_state.value("shuffle").toBool() && m_queue.size() > 1) {
        do { index = QRandomGenerator::global()->bounded(int(m_queue.size())); } while (index == m_queueIndex);
    }
    if (index >= m_queue.size()) return;
    const auto track = m_queue[index].toMap();
    if (track.value("access").toString() == "blocked" || track.value("streamable") == false) return;
    m_preloadIndex = index; m_preloadUrn = urn(track);
    request(apiPath("tracks", m_preloadUrn) + "/streams", [this, generation](QJsonDocument doc) {
        if (generation != m_preloadGeneration) return;
        const auto object = doc.object();
        QString url = object.value("hls_aac_160_url").toString();
        if (url.isEmpty()) url = object.value("hls_mp3_128_url").toString();
        if (url.isEmpty()) url = object.value("preview_mp3_128_url").toString();
        if (!url.isEmpty()) prepareStream(QUrl(url), generation);
    }, "GET", {}, true, [](QString) {});
}
void SoundCloud::prepareStream(const QUrl &url, int generation, int redirects) {
    if (generation != m_preloadGeneration || url.scheme() != "https" || redirects > 5 || !url.userInfo().isEmpty()) return;
    if (url.host() != "api.soundcloud.com") {
        m_preloadPlayer->setSource(url);
        // Запускаем без звука до заполнения буфера, затем приостанавливаем у начала.
        m_preloadPlayer->play();
        QTimer::singleShot(4000, this, [this, generation] {
            if (generation != m_preloadGeneration) return;
            m_preloadPlayer->pause(); m_preloadPlayer->setPosition(0);
        });
        return;
    }
    QNetworkRequest req(url);
    req.setRawHeader("Authorization", "OAuth " + m_access.toUtf8());
    req.setTransferTimeout(20000);
    req.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    auto *reply = m_network->get(req);
    connect(reply, &QNetworkReply::finished, this, [this, reply, url, generation, redirects] {
        reply->deleteLater();
        if (generation != m_preloadGeneration || reply->error() != QNetworkReply::NoError) return;
        auto redirect = reply->attribute(QNetworkRequest::RedirectionTargetAttribute).toUrl();
        if (!redirect.isEmpty()) { prepareStream(url.resolved(redirect), generation, redirects + 1); return; }
        const auto next = QJsonDocument::fromJson(reply->readAll()).object().value("url").toString();
        if (!next.isEmpty()) prepareStream(QUrl(next), generation, redirects + 1);
    });
}
#endif
