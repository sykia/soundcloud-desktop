#include "soundcloud.h"
#include <QtTest>
#include <QNetworkReply>
#include <QTemporaryDir>
#include <QFile>
#include <QDir>
#include <QStandardPaths>
#include <cstring>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickWindow>
#include <QDesktopServices>
#include <QTcpSocket>
#include <QWheelEvent>
#ifdef Q_OS_WIN
#include <qt_windows.h>
#endif

// Транспорт подменяется только в тестах. Рабочий клиент использует фиксированные HTTPS-хосты.
#ifndef Q_MOC_RUN
struct Response { int status = 200; QByteArray body; int delay = 0; };
class Reply : public QNetworkReply {
public:
    Reply(const QNetworkRequest &request, Response response, QObject *parent) : QNetworkReply(parent), bytes(response.body) {
        setRequest(request); setUrl(request.url()); setOperation(QNetworkAccessManager::GetOperation);
        setAttribute(QNetworkRequest::HttpStatusCodeAttribute, response.status);
        open(QIODevice::ReadOnly | QIODevice::Unbuffered);
        QTimer::singleShot(response.delay, this, [this, response] {
            if (response.status >= 400) setError(QNetworkReply::ContentAccessDenied, "Test failure");
            setFinished(true); emit readyRead(); emit finished();
        });
    }
    void abort() override {}
    qint64 bytesAvailable() const override { return bytes.size() - offset + QNetworkReply::bytesAvailable(); }
protected:
    qint64 readData(char *data, qint64 size) override {
        qint64 count = qMin(size, qint64(bytes.size() - offset));
        if (count <= 0) return -1;
        memcpy(data, bytes.constData() + offset, size_t(count)); offset += count; return count;
    }
private:
    QByteArray bytes; qint64 offset = 0;
};
class Network : public QNetworkAccessManager {
public:
    QList<Response> responses;
    QList<QNetworkRequest> requests;
    QList<QByteArray> bodies;
    QList<QByteArray> methods;
protected:
    QNetworkReply *createRequest(Operation op, const QNetworkRequest &request, QIODevice *outgoing) override {
        Q_UNUSED(op)
        requests.append(request); bodies.append(outgoing ? outgoing->readAll() : QByteArray{});
        methods.append(request.attribute(QNetworkRequest::CustomVerbAttribute).toByteArray());
        Response r = responses.isEmpty() ? Response{500, "{}"} : responses.takeFirst();
        return new Reply(request, r, this);
    }
};
#endif
class SoundCloudTest : public QObject {
    Q_OBJECT
    QTemporaryDir directory;
    QString config;
    QUrl authorizationUrl;
    quint16 callbackPort = 0;
public slots:
    void captureUrl(const QUrl &url) { authorizationUrl = url; }
private:
    static Response guest() { return {200, "{\"access_token\":\"test-access\",\"refresh_token\":\"test-refresh\",\"expires_in\":3600}"}; }
    void prepare() {
        QFile::remove(config + "/session.json");
        QFile file(config + "/soundcloud.json"); QVERIFY(file.open(QIODevice::WriteOnly));
        QTcpServer freePort; QVERIFY(freePort.listen(QHostAddress::LocalHost, 0)); callbackPort = freePort.serverPort();
        file.write(QJsonDocument(QJsonObject{{"client_id", "test-client"}, {"client_secret", "test-secret"}, {"redirect_uri", QString("http://127.0.0.1:%1/callback").arg(callbackPort)}}).toJson());
    }
private slots:
    void initTestCase() {
#ifdef Q_OS_WIN
        QStandardPaths::setTestModeEnabled(true);
#endif
        QCoreApplication::setOrganizationName("SCripTests"); QCoreApplication::setApplicationName("SCripTests");
        QVERIFY(directory.isValid()); qputenv("XDG_CONFIG_HOME", directory.path().toUtf8());
        qputenv("SCRIP_AUTH_MODE", "local");
        qunsetenv("SOUNDCLOUD_CLIENT_ID"); qunsetenv("SOUNDCLOUD_CLIENT_SECRET");
        config = QStandardPaths::writableLocation(QStandardPaths::GenericConfigLocation) + "/SCrip";
        QVERIFY(QDir().mkpath(config));
    }
    void init() { qputenv("SCRIP_AUTH_MODE", "local"); prepare(); }
    void authenticatesAndSearches() {
        Network net; net.responses = {guest(), {200, "{\"collection\":[{\"urn\":\"soundcloud:tracks:1\",\"title\":\"Real response\"}],\"next_href\":null}"}};
        SoundCloud sc(nullptr, &net); QTRY_VERIFY(sc.state()["connected"].toBool());
        QCOMPARE(net.requests.size(), 1); QVERIFY(net.requests[0].rawHeader("Authorization").startsWith("Basic "));
        QCOMPARE(net.bodies[0], QByteArray("grant_type=client_credentials"));
        sc.browse("tracks", "rock & roll"); QTRY_COMPARE(sc.state()["tracks"].toList().size(), 1);
        QCOMPARE(QUrlQuery(net.requests.last().url()).queryItemValue("q"), QString("rock & roll"));
        QCOMPARE(net.requests.last().rawHeader("Authorization"), QByteArray("OAuth test-access"));
        QVERIFY(!sc.state()["busy"].toBool()); QVERIFY(sc.state()["error"].toString().isEmpty());
    }
    void rejectsForeignPagination() {
        Network net; net.responses = {guest(), {200, "{\"collection\":[],\"next_href\":\"https://evil.example/steal\"}"}};
        SoundCloud sc(nullptr, &net); QTRY_VERIFY(sc.state()["connected"].toBool());
        sc.browse("tracks", "test"); QTRY_VERIFY(sc.state()["hasMore"].toBool()); sc.more();
        QCOMPARE(net.requests.size(), 2); QVERIFY(!sc.state()["error"].toString().isEmpty());
    }
    void deduplicatesPagination() {
        Network net; net.responses = {guest(), {200, "{\"collection\":[{\"urn\":\"soundcloud:tracks:1\"}],\"next_href\":\"https://api.soundcloud.com/tracks?cursor=2\"}"},
            {200, "{\"collection\":[{\"urn\":\"soundcloud:tracks:1\"},{\"urn\":\"soundcloud:tracks:2\"}]}"}};
        SoundCloud sc(nullptr, &net); QTRY_VERIFY(sc.state()["connected"].toBool());
        sc.browse("tracks", "test"); QTRY_VERIFY(sc.state()["hasMore"].toBool()); sc.more();
        QTRY_COMPARE(sc.state()["tracks"].toList().size(), 2); QVERIFY(!sc.state()["hasMore"].toBool());
    }
    void ignoresOutdatedResults() {
        Network net; net.responses = {guest(), {200, "{\"collection\":[{\"urn\":\"soundcloud:tracks:1\"}]}", 100}, {200, "{\"collection\":[{\"urn\":\"soundcloud:tracks:2\"}]}"}};
        SoundCloud sc(nullptr, &net); QTRY_VERIFY(sc.state()["connected"].toBool());
        sc.browse("tracks", "old"); sc.browse("tracks", "new");
        QTRY_COMPARE(sc.state()["tracks"].toList().size(), 1); QTest::qWait(150);
        QCOMPARE(sc.state()["tracks"].toList()[0].toMap()["urn"].toString(), QString("soundcloud:tracks:2"));
    }
    void refreshesOnceForConcurrentRequests() {
        QFile session(config + "/session.json"); QVERIFY(session.open(QIODevice::WriteOnly));
        session.write("{\"client_id\":\"test-client\",\"access_token\":\"old\",\"refresh_token\":\"refresh-once\",\"expires_at\":0,\"user_session\":false}"); session.close();
        Network net; auto token = guest(); token.delay = 50; net.responses = {token, {200,"[]"}, {200,"[]"}};
        SoundCloud sc(nullptr, &net); sc.browse("tracks", "first"); sc.browse("tracks", "second");
        QTRY_VERIFY(sc.state()["connected"].toBool()); QTRY_COMPARE(net.requests.size(), 3);
        int exchanges = 0; for (const auto &r : net.requests) if (r.url().host() == "secure.soundcloud.com") ++exchanges;
        QCOMPARE(exchanges, 1); QVERIFY(net.bodies[0].contains("grant_type=refresh_token"));
    }
    void failedAuthenticationIsVisible() {
        Network net; net.responses = {{401, "{\"error\":\"invalid_client\"}"}};
        SoundCloud sc(nullptr, &net); QTRY_VERIFY(!sc.state()["error"].toString().isEmpty());
        QVERIFY(!sc.state()["connected"].toBool()); QVERIFY(!sc.state()["busy"].toBool());
        QVERIFY(!sc.state()["error"].toString().contains("test-secret"));
    }
    void rateLimitDoesNotRetryLoop() {
        Network net; net.responses = {guest(), {429,"{}"}};
        SoundCloud sc(nullptr, &net); QTRY_VERIFY(sc.state()["connected"].toBool()); sc.browse("tracks", "test");
        QTRY_VERIFY(!sc.state()["error"].toString().isEmpty()); QCOMPARE(net.requests.size(), 2); QVERIFY(!sc.state()["busy"].toBool());
    }
    void personalPagesRequireUser() {
        Network net; net.responses = {guest()}; SoundCloud sc(nullptr, &net);
        QTRY_VERIFY(sc.state()["connected"].toBool()); sc.browse("likes");
        QCOMPARE(net.requests.size(), 1); QVERIFY(sc.state()["tracks"].toList().isEmpty());
        sc.like({{"urn","soundcloud:tracks:1"}}); QCOMPARE(net.requests.size(), 1);
    }
    void blockedTrackIsNotStreamed() {
        Network net; net.responses = {guest()}; SoundCloud sc(nullptr, &net);
        QTRY_VERIFY(sc.state()["connected"].toBool()); sc.play({{"urn","soundcloud:tracks:1"},{"access","blocked"}});
        QCOMPARE(net.requests.size(), 1); QVERIFY(!sc.state()["error"].toString().isEmpty());
        sc.enqueue({{"urn","soundcloud:tracks:2"}}); QCOMPARE(sc.state()["queue"].toList().size(), 2);
        sc.removeQueue(0); QCOMPARE(sc.state()["queue"].toList().size(), 1);
    }
    void movingQueuePreservesCurrentAndSetsNext() {
        Network net; net.responses = {guest()}; SoundCloud sc(nullptr, &net);
        QTRY_VERIFY(sc.state()["connected"].toBool());
        QVariantList tracks;
        for (int i = 0; i < 4; ++i)
            tracks.append(QVariantMap{{"urn", QString("soundcloud:tracks:%1").arg(i)}, {"access", "blocked"}});
        sc.playMix(tracks, 1);
        sc.moveQueue(3, 0);
        QCOMPARE(sc.state()["queueIndex"].toInt(), 2);
        QCOMPARE(sc.state()["current"], tracks[1]);
        sc.setShuffle(true);
        sc.queueNext(0);
        QCOMPARE(sc.state()["queueIndex"].toInt(), 1);
        sc.next();
        QCOMPARE(sc.state()["current"], tracks[3]);
    }
    void refusesRemoteCallback() {
        Network net; net.responses = {guest()}; SoundCloud sc(nullptr, &net);
        QTRY_VERIFY(sc.state()["connected"].toBool()); sc.configure("id", "secret", "https://evil.example/callback");
        QVERIFY(!sc.state()["error"].toString().isEmpty()); QCOMPARE(net.requests.size(), 1);
    }
    void oauthRejectsWrongStateAndExchangesValidCode_data() {
        QTest::addColumn<bool>("worker");
        QTest::newRow("local") << false;
        QTest::newRow("worker") << true;
    }
    void oauthRejectsWrongStateAndExchangesValidCode() {
        QFETCH(bool, worker);
        if (worker) { qunsetenv("SCRIP_AUTH_MODE"); callbackPort = 43821; }

        Network net; net.responses = {guest()}; SoundCloud sc(nullptr, &net);
        if (!worker) QTRY_VERIFY(sc.state()["connected"].toBool());
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("sc", &sc);
        engine.load(QUrl::fromLocalFile(QString(SCRIP_SOURCE_DIR) + "/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *welcome = engine.rootObjects().first()->findChild<QObject *>("welcomeScreen");
        QVERIFY(welcome && welcome->property("visible").toBool());
        connect(&sc, &SoundCloud::authorizationRequested, this, &SoundCloudTest::captureUrl);
        sc.login(); QVERIFY2(sc.state()["authBusy"].toBool(), qPrintable(sc.state()["error"].toString()));
        QVERIFY(authorizationUrl.host() == "secure.soundcloud.com");
        auto query = QUrlQuery(authorizationUrl); QCOMPARE(query.queryItemValue("code_challenge_method"), QString("S256"));
        QVERIFY(query.queryItemValue("code_challenge").size() >= 43);
        QTcpSocket invalid; invalid.connectToHost(QHostAddress::LocalHost, callbackPort); QVERIFY(invalid.waitForConnected());
        invalid.write("GET /callback?code=wrong&state=invalid HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"); invalid.flush();
        QTRY_VERIFY(invalid.bytesAvailable() > 0); QVERIFY(invalid.readAll().startsWith("HTTP/1.1 400"));
        QCOMPARE(net.requests.size(), worker ? 0 : 1); QVERIFY(sc.state()["authBusy"].toBool());
        net.responses = {guest(), {200, "{\"username\":\"Test account\"}"}, {200, "[]"}};
        QTcpSocket valid; valid.connectToHost(QHostAddress::LocalHost, callbackPort); QVERIFY(valid.waitForConnected());
        const QByteArray callback = "GET /callback?code=valid-code&state=" + query.queryItemValue("state").toUtf8() + " HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n";
        valid.write(callback); valid.flush(); QTRY_VERIFY(sc.state()["signedIn"].toBool());
        QTRY_COMPARE(sc.state()["profile"].toMap()["username"].toString(), QString("Test account"));
        QTRY_VERIFY(!welcome->property("visible").toBool());
        QTRY_VERIFY(valid.bytesAvailable() > 0);
        QVERIFY(valid.readAll().contains("Аккаунт SoundCloud подключён"));
        const int exchangeIndex = worker ? 0 : 1;
        const QUrlQuery exchange(QString::fromUtf8(net.bodies[exchangeIndex]));
        if (worker) {
            QCOMPARE(net.requests[0].url().host(), QString("scrip-auth.scrip-desktop-aca3d9.workers.dev"));
            QVERIFY(!exchange.hasQueryItem("client_secret"));
            QVERIFY(!net.requests[0].hasRawHeader("Authorization"));
        }
        QCOMPARE(exchange.queryItemValue("grant_type"), QString("authorization_code"));
        QCOMPARE(exchange.queryItemValue("code"), QString("valid-code"));
        QVERIFY(exchange.queryItemValue("code_verifier").size() >= 43);
        QVERIFY(!sc.state()["authBusy"].toBool());
    }
    void windowControls() {
        Network net;
        net.responses = {guest(), {200, "[]"}};
        SoundCloud sc(nullptr, &net);
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("sc", &sc);
        engine.load(QUrl::fromLocalFile(QString(SCRIP_SOURCE_DIR) + "/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(window);
        QVERIFY(QTest::qWaitForWindowExposed(window));
        QVERIFY(window->flags().testFlag(Qt::FramelessWindowHint));
#ifdef Q_OS_WIN
        const bool native = QGuiApplication::platformName() == "windows";
        const auto hwnd = reinterpret_cast<HWND>(window->winId());
        if (native) {
            QVERIFY(IsWindow(hwnd));
            QVERIFY((GetWindowLongPtrW(hwnd, GWL_STYLE) & WS_CAPTION) != WS_CAPTION);
        }
#endif
        // Щелчки по центрам зелёной, жёлтой и красной кнопок в реальном QML.
        QTest::mouseClick(window, Qt::LeftButton, Qt::NoModifier, QPoint(65, 28));
        QTRY_COMPARE(window->visibility(), QWindow::Maximized);
#ifdef Q_OS_WIN
        if (native) QTRY_VERIFY(IsZoomed(hwnd));
#endif
        QTest::mouseClick(window, Qt::LeftButton, Qt::NoModifier, QPoint(65, 28));
        QTRY_COMPARE(window->visibility(), QWindow::Windowed);
        QTest::mouseClick(window, Qt::LeftButton, Qt::NoModifier, QPoint(45, 28));
        QTRY_COMPARE(window->visibility(), QWindow::Minimized);
#ifdef Q_OS_WIN
        if (native) QTRY_VERIFY(IsIconic(hwnd));
#endif
        window->showNormal();
        QVERIFY(QTest::qWaitForWindowExposed(window));
        QTest::mouseClick(window, Qt::LeftButton, Qt::NoModifier, QPoint(25, 28));
        QTRY_VERIFY(!window->isVisible());
    }
    void qmlScreensRender() {
        QFile session(config + "/session.json"); QVERIFY(session.open(QIODevice::WriteOnly));
        session.write(QJsonDocument(QJsonObject{{"client_id", "test-client"}, {"access_token", "test-access"}, {"refresh_token", "test-refresh"}, {"expires_at", QDateTime::currentSecsSinceEpoch()+3600}, {"user_session", true}}).toJson()); session.close();
        Network net; net.responses = {{200, "{\"username\":\"Тестовый аккаунт\"}"}, {200, "[]"}}; SoundCloud sc(nullptr, &net);
        QTRY_VERIFY(sc.state()["connected"].toBool());
        QTRY_VERIFY(!sc.state()["busy"].toBool());
        QQmlApplicationEngine engine; engine.rootContext()->setContextProperty("sc", &sc);
        QStringList warnings;
        connect(&engine, &QQmlEngine::warnings, this, [&warnings](const QList<QQmlError> &errors) { for (const auto &error : errors) warnings.append(error.toString()); });
        net.responses = {{200, R"([{"urn":"soundcloud:tracks:10","title":"Релиз"}])"}, {200, "[]"}, {200, R"([{"urn":"soundcloud:tracks:11","title":"Основа"}])"}, {200, R"([{"urn":"soundcloud:tracks:12","title":"Похожий"}])"}};
        engine.load(QUrl::fromLocalFile(QString(SCRIP_SOURCE_DIR) + "/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty()); auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().first()); QVERIFY(window);
        QTRY_COMPARE(sc.state()["home"].toList().size(), 4);
        QTRY_VERIFY(!sc.state()["homeBusy"].toBool());
        QCOMPARE(window->property("section").toInt(), 5);
        window->setProperty("section", 0);
        window->setWidth(1320); window->setHeight(820);
        net.responses = {{200, "{\"collection\":[{\"urn\":\"soundcloud:tracks:1\",\"title\":\"Тестовый трек с длинным названием для проверки вёрстки\",\"duration\":185000,\"user\":{\"username\":\"Исполнитель\"}},{\"urn\":\"soundcloud:tracks:2\",\"title\":\"Второй трек\",\"duration\":220000,\"access\":\"preview\"}]}"}};
        sc.browse("tracks", "Тест интерфейса"); QTRY_COMPARE(sc.state()["tracks"].toList().size(), 2);
        QTest::qWait(450); QVERIFY(window->grabWindow().save("ui-catalog.png"));
        QVERIFY(window->property("dockedInspector").toBool());
        QJsonArray scrollTracks;
        for (int i=0; i<32; ++i) scrollTracks.append(QJsonObject{{"urn", QString("soundcloud:tracks:%1").arg(i+10)}, {"title", "Проверка прокрутки"}});
        net.responses = {{200, QJsonDocument(QJsonObject{{"collection", scrollTracks}, {"next_href","https://api.soundcloud.com/tracks?cursor=next"}}).toJson()}};
        sc.browse("tracks", "scroll"); QTRY_COMPARE(sc.state()["tracks"].toList().size(),32);
        QTest::qWait(100);
        auto *scroll = window->findChild<QObject *>("libraryScroll"); QVERIFY(scroll);
        QWheelEvent wheel(QPointF(600,400),QPointF(600,400),QPoint(),QPoint(0,-120),Qt::NoButton,Qt::NoModifier,Qt::NoScrollPhase,false);
        QCoreApplication::sendEvent(window,&wheel);
        QTRY_VERIFY(scroll->property("contentY").toReal()>0);
        QVERIFY(scroll->property("contentY").toReal()<=scroll->property("contentHeight").toReal()-scroll->property("height").toReal());
        net.responses = {{200, "[]"}};
        net.responses = {{200, R"([{"urn":"soundcloud:tracks:99","title":"Следующая страница"}])"}};
        QTest::qWait(550); // Дождаться завершения анимации колеса перед переходом в конец.
        scroll->setProperty("contentY", scroll->property("contentHeight").toReal() - scroll->property("height").toReal());
        QTRY_COMPARE(sc.state()["tracks"].toList().size(), 33);
        net.responses = {{200, "[]"}};
        window->setProperty("section", 3); QTest::qWait(400);
        QVERIFY(window->grabWindow().save("ui-profile.png"));
        window->setProperty("section", 4); window->setProperty("settingGroup", 3); QTest::qWait(100);
        QVERIFY(window->grabWindow().save("ui-connection.png"));
        window->setWidth(760); window->setHeight(560); QTest::qWait(350);
        QVERIFY(!window->property("dockedInspector").toBool());
        QVERIFY(window->grabWindow().save("ui-narrow.png"));
        for (const auto &warning : warnings) QVERIFY2(!warning.contains("ReferenceError") && !warning.contains("TypeError") && !warning.contains("Binding loop"), qPrintable(warning));
    }
    void logoutInvalidatesPendingResponses() {
        Network net; net.responses = {guest(), {200, "{\"collection\":[{\"urn\":\"soundcloud:tracks:1\"}]}", 100}};
        SoundCloud sc(nullptr, &net); QTRY_VERIFY(sc.state()["connected"].toBool()); sc.browse("tracks", "test"); sc.logout();
        QTest::qWait(150); QVERIFY(!sc.state()["connected"].toBool()); QVERIFY(sc.state()["tracks"].toList().isEmpty());
        QVERIFY(!QFile::exists(config + "/session.json"));
    }
};
QTEST_MAIN(SoundCloudTest)
#include "tst_soundcloud.moc"
