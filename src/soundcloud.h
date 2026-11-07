#pragma once
#include <QObject>
#include <QVariantMap>
#include <QNetworkAccessManager>
#include <QMediaPlayer>
#include <QAudioOutput>
#include <QVariantAnimation>
#include <QTcpServer>
#include <QTimer>
#include <QJsonDocument>
#include <QJsonObject>
#include <QUrlQuery>
#include <functional>

// Все секреты загружаются из пользовательского каталога, а не из ресурсов приложения.
class SoundCloud : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool signedIn READ signedIn NOTIFY signedInChanged)
    Q_PROPERTY(QVariantMap state READ state NOTIFY changed)
public:
    explicit SoundCloud(QObject *parent = nullptr, QNetworkAccessManager *network = nullptr);
    bool signedIn() const { return m_state.value("signedIn").toBool(); }
    QVariantMap state() const { return m_state; }
    Q_INVOKABLE void connectCatalog();
    Q_INVOKABLE void login();
    Q_INVOKABLE void cancelLogin();
    Q_INVOKABLE void browserFailed();
    Q_INVOKABLE void logout();
    Q_INVOKABLE void configure(const QString &id, const QString &secret, const QString &redirect);
    Q_INVOKABLE void browse(const QString &page, const QString &query = {});
    Q_INVOKABLE void more();
    Q_INVOKABLE void loadHome(bool force = false);
    Q_INVOKABLE void playMix(const QVariantList &tracks, int index = 0);
    Q_INVOKABLE void playStation(const QVariantMap &seed);
    Q_INVOKABLE void listDestinations(const QString &next = {});
    Q_INVOKABLE void saveToPlaylist(const QString &track, const QString &playlist, const QString &newTitle);
    Q_INVOKABLE void openPlaylist(const QVariantMap &item);
    Q_INVOKABLE void play(const QVariantMap &item);
    Q_INVOKABLE void enqueue(const QVariantMap &item);
    Q_INVOKABLE void playQueue(int index);
    Q_INVOKABLE void moveQueue(int from, int to);
    Q_INVOKABLE void queueNext(int index);
    Q_INVOKABLE void removeQueue(int index);
    Q_INVOKABLE void togglePlayback();
    Q_INVOKABLE void next();
    Q_INVOKABLE void previous();
    Q_INVOKABLE void seek(qint64 position);
    Q_INVOKABLE void volume(double value);
    Q_INVOKABLE void like(const QVariantMap &item);
    Q_INVOKABLE void createPlaylist(const QString &title, bool includeCurrent);
    Q_INVOKABLE void openExternal(const QString &url);
    Q_INVOKABLE void checkForUpdates();
    Q_INVOKABLE void downloadTrack(const QVariantMap &track);
    Q_INVOKABLE void downloadLikedTracks();
    Q_INVOKABLE void playOffline(const QVariantMap &track);
    Q_INVOKABLE void removeOffline(const QVariantMap &track);
    Q_INVOKABLE void clearError();
    Q_INVOKABLE void setRepeat(bool enabled);
    Q_INVOKABLE void setShuffle(bool enabled);
    Q_INVOKABLE void setCrossfade(bool enabled);
signals:
    void changed();
    void signedInChanged();
    void trackSaved();
    void authorizationRequested(const QUrl &url);
private:
    using Callback = std::function<void(QJsonDocument)>;
    void set(const QString &key, const QVariant &value);
    void fail(const QString &message);
    bool loadConfig();
    void saveSession();
    void ensureToken(std::function<void()> continuation);
    void token(const QUrlQuery &form, bool basic, std::function<void()> done, std::function<void()> failed = {});
    void request(const QString &path, Callback done, const QByteArray &method = "GET", const QJsonObject &body = {}, bool retry = true, std::function<void(QString)> failed = {});
    void collection(const QString &path, bool append = false);
    void profile();
    void startTrack(const QVariantMap &track);
    void resolveStream(const QUrl &url, int generation, int redirects = 0);
    void prepareNext();
    void prepareStream(const QUrl &url, int generation, int redirects = 0);
    void beginCrossfade();
    void downloadFile(const QVariantMap &track, const QUrl &url, int redirects = 0);
    void downloadNext();
    void refreshOffline();
    void callbackConnection();
    void clearSession();
    static QString urn(const QVariantMap &item);
    QVariantMap m_state;
    QNetworkAccessManager *m_network;
    QMediaPlayer m_player;
    QMediaPlayer m_sparePlayer;
    QMediaPlayer &player() { return *m_activePlayer; }
    QMediaPlayer *m_activePlayer = &m_player;
    QAudioOutput m_preloadAudio;
    QMediaPlayer *m_preloadPlayer = &m_sparePlayer;
    QString m_preloadUrn;
    int m_preloadGeneration = 0;
    int m_preloadIndex = -1;
    QAudioOutput m_audio;
    QVariantAnimation m_volumeFade;
    QVariantAnimation m_crossfade;
    QTcpServer m_callback;
    QTimer m_loginTimeout;
    QString m_configPath, m_sessionPath, m_clientId, m_clientSecret, m_redirect;
    QString m_access, m_refresh, m_verifier, m_oauthState, m_nextHref, m_lastPath;
    qint64 m_expires = 0;
    bool m_useWorker = true;
    bool m_userSession = false, m_refreshing = false;
    QString m_offlinePath;
    QVariantList m_offlineTracks, m_downloadQueue;
    bool m_downloadAll = false;
    bool m_crossfadeStarted = false;
    int m_homeGeneration = 0;
    int m_epoch = 0, m_listing = 0, m_playGeneration = 0, m_queueIndex = -1;
    QList<std::function<void()>> m_waiting;
    bool m_forceNext = false;
    QVariantList m_queue;
};
