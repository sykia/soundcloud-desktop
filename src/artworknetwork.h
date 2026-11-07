#pragma once
#include <QQmlNetworkAccessManagerFactory>
#include <QNetworkAccessManager>
#include <QNetworkRequest>
#include <QMutex>
#include <QHash>
#include <memory>
#include <functional>

// Маршрут только для публичных изображений; OAuth-запросы этим транспортом не идут.
struct ArtworkRoutes {
    QMutex mutex;
    QHash<QString, QString> addresses;
};
class ArtworkNetworkFactory : public QQmlNetworkAccessManagerFactory {
public:
    ArtworkNetworkFactory();
    QNetworkAccessManager *create(QObject *parent) override;
    void prepare(QObject *context, std::function<void()> ready);
private:
    std::shared_ptr<ArtworkRoutes> routes;
};
