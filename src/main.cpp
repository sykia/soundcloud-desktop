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
#include <QQmlApplicationEngine>

int main(int argc, char *argv[])
{
    QQuickWindow::setDefaultAlphaBuffer(true);
    QApplication app(argc, argv);
    QCoreApplication::setOrganizationName("Qsae");
    QCoreApplication::setApplicationName("SCrip");
    QCoreApplication::setApplicationVersion("1.0.0");
    SoundCloud soundcloud;
    QObject::connect(&soundcloud, &SoundCloud::authorizationRequested, &app, [&soundcloud](const QUrl &url) {
        bool opened = false;
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
        if (!opened) opened = QDesktopServices::openUrl(url);
        if (!opened) soundcloud.browserFailed();
    });
    Plugins plugins;
    ArtworkNetworkFactory artwork;
    QQmlApplicationEngine engine;
    engine.setNetworkAccessManagerFactory(&artwork);
    artwork.prepare(&app, [] {});
    engine.rootContext()->setContextProperty("sc", &soundcloud);
    engine.rootContext()->setContextProperty("pluginManager", &plugins);
    engine.loadFromModule("SCrip", "Main");
    if (engine.rootObjects().isEmpty())
        return EXIT_FAILURE;

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
    return app.exec();
}
