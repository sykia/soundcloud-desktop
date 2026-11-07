#include "plugins.h"
#include <QtTest>
#include <QTemporaryDir>

class PluginTests : public QObject {
    Q_OBJECT
private slots:
    void lifecycle() {
        QTemporaryDir data;
        QVERIFY(data.isValid());
        // Тест регистрируется с отдельным каталогом данных через CTest.
        QCoreApplication::setApplicationName("SCrip-plugin-tests-" + QFileInfo(data.path()).fileName());
        const auto sample = QUrl::fromLocalFile(QString(SCRIP_SOURCE_DIR) + "/examples/plugins/studio.json");
        Plugins host;
        QCOMPARE(host.install(sample), QString());
        QVERIFY(host.theme().isEmpty());
        QVERIFY(!host.install(sample).isEmpty());
        QCOMPARE(host.enable("studio", true), QString());
        QCOMPARE(host.theme()["accent"].toString(), QString("#614899"));
        QCOMPARE(host.configure("studio", 0, false), QString());
        Plugins restored;
        QVERIFY(!restored.theme().contains("accent"));
        QCOMPARE(restored.theme()["covers"].toString(), QString("artist"));
        QCOMPARE(restored.remove("studio"), QString());
        QVERIFY(restored.panels().isEmpty());
        Plugins empty;
        QVERIFY(empty.installed().isEmpty());
    }
    void rejectsUnexpectedCapabilities() {
        QTemporaryDir dir;
        QFile file(dir.filePath("plugin.json"));
        QVERIFY(file.open(QIODevice::WriteOnly));
        file.write(R"({"api":1,"id":"test","name":"Test","groups":[{"label":"Test","page":"home","buttons":[{"label":"Open","action":"openExternal"}]}]})");
        file.close();
        Plugins host;
        QVERIFY(!host.install(QUrl::fromLocalFile(file.fileName())).isEmpty());
        QVERIFY(!host.install(QUrl("https://example.org/plugin.json")).isEmpty());
        QVERIFY(host.installed().isEmpty());
    }
};
QTEST_GUILESS_MAIN(PluginTests)
#include "tst_plugins.moc"
