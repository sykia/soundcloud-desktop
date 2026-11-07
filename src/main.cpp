#include "plugins.h"
#include "soundcloud.h"
#include "artworknetwork.h"
#include <QQuickWindow>
#include <QQmlContext>
#include <cstdlib>
#include <QProcess>
#include <QStandardPaths>
#include <QDesktopServices>
#include <QUrl>

#ifdef Q_OS_ANDROID
#include <QGuiApplication>
#include "androidmedia.h"
#else
#include <QApplication>
#include <QSystemTrayIcon>
#include <QMenu>
#include <QEvent>

class TrayWindowFilter : public QObject {
public:
    bool eventFilter(QObject *object, QEvent *event) override {
        if (event->type() == QEvent::Close && QSystemTrayIcon::isSystemTrayAvailable()) {
            static_cast<QWindow *>(object)->hide();
            event->ignore();
            return true;
        }
        return false;
    }
};
#endif
#include <QQmlApplicationEngine>

int main(int argc, char *argv[])
{
#ifdef Q_OS_ANDROID
    qputenv("QT_BLOCK_EVENT_LOOPS_WHEN_SUSPENDED", "0");
    QGuiApplication app(argc, argv);
#else
    QQuickWindow::setDefaultAlphaBuffer(true);
    QApplication app(argc, argv);
#endif
    QCoreApplication::setOrganizationName("Qsae");
    QCoreApplication::setApplicationName("SCrip");
    QCoreApplication::setApplicationVersion("1.4.0");
    SoundCloud soundcloud;
    QObject::connect(&soundcloud, &SoundCloud::authorizationRequested, &app, [&soundcloud](const QUrl &url) {
        bool opened = false;
#ifndef Q_OS_ANDROID
        // Отдельное окно настоящего браузера поддерживает вход Google и системную сессию.
        const auto firefox = QStandardPaths::findExecutable("firefox");
        if (!firefox.isEmpty())
            opened = QProcess::startDetached(firefox, {"--new-window", url.toString(QUrl::FullyEncoded)});
        else {
            for (const auto &name : {"google-chrome", "chromium", "msedge", "chrome"}) {
                const auto executable = QStandardPaths::findExecutable(QString::fromLatin1(name));
                if (!executable.isEmpty()) {
                    opened = QProcess::startDetached(executable, {"--new-window", url.toString(QUrl::FullyEncoded)});
                    if (opened) break;
                }
            }
        }
#endif
        if (!opened) opened = QDesktopServices::openUrl(url);
        if (!opened) soundcloud.browserFailed();
    });
    Plugins plugins;
    ArtworkNetworkFactory artwork;
#ifdef Q_OS_ANDROID
    AndroidMedia androidMedia(&soundcloud, &artwork);
#endif
    QQmlApplicationEngine engine;
    engine.setNetworkAccessManagerFactory(&artwork);
    artwork.prepare(&app, [] {});
    engine.rootContext()->setContextProperty("sc", &soundcloud);
#ifdef Q_OS_ANDROID
    engine.rootContext()->setContextProperty("androidMedia", &androidMedia);
#else
    engine.rootContext()->setContextProperty("androidMedia", QVariant());
#endif
    engine.rootContext()->setContextProperty("pluginManager", &plugins);
    engine.loadFromModule("SCrip", "Main");
    if (engine.rootObjects().isEmpty())
        return EXIT_FAILURE;

#ifndef Q_OS_ANDROID
    auto *window = qobject_cast<QWindow *>(engine.rootObjects().first());
    QIcon icon(":/qt/qml/SCrip/assets/blob.png");
    app.setWindowIcon(icon);
    QMenu menu;
    QSystemTrayIcon tray(icon);
    TrayWindowFilter filter;
    auto restore = [window] {
        if (window->visibility() == QWindow::Minimized) window->showNormal();
        else window->show();
        window->raise();
        window->requestActivate();
    };
    menu.addAction("Открыть SCrip", restore);
    menu.addSeparator();
    auto *play = menu.addAction("Воспроизвести", &soundcloud, &SoundCloud::togglePlayback);
    auto *previous = menu.addAction("Предыдущий трек", &soundcloud, &SoundCloud::previous);
    auto *next = menu.addAction("Следующий трек", &soundcloud, &SoundCloud::next);
    auto *like = menu.addAction("Поставить лайк", [&] {
        soundcloud.like(soundcloud.state().value("current").toMap());
    });
    menu.addSeparator();
    menu.addAction("Выход", &app, &QCoreApplication::quit);
    QObject::connect(&menu, &QMenu::aboutToShow, &app, [&] {
        const auto state = soundcloud.state();
        const auto current = state.value("current").toMap();
        play->setText(state.value("playing").toBool() ? "Пауза" : "Воспроизвести");
        play->setEnabled(!current.isEmpty());
        previous->setEnabled(!current.isEmpty());
        next->setEnabled(!state.value("queue").toList().isEmpty());
        like->setEnabled(soundcloud.signedIn() && !current.isEmpty());
        like->setText(current.value("user_favorite").toBool() ? "Снять лайк" : "Поставить лайк");
    });
    QObject::connect(&tray, &QSystemTrayIcon::activated, &app, [restore](QSystemTrayIcon::ActivationReason reason) {
        if (reason == QSystemTrayIcon::Trigger || reason == QSystemTrayIcon::DoubleClick) restore();
    });
    tray.setContextMenu(&menu);
    tray.setToolTip("SCrip");
    tray.show();
    window->installEventFilter(&filter);
#endif
    return app.exec();
}
