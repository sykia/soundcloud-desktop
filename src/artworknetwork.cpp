#include "artworknetwork.h"
#include <QNetworkReply>
#include <QNetworkDiskCache>
#include <QStandardPaths>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QHostAddress>
#include <QMutexLocker>

namespace {
class ArtworkManager : public QNetworkAccessManager {
public:
    ArtworkManager(QObject *parent, std::shared_ptr<ArtworkRoutes> routes)
        : QNetworkAccessManager(parent), routes(std::move(routes)) {
        auto *cache = new QNetworkDiskCache(this);
        cache->setCacheDirectory(QStandardPaths::writableLocation(QStandardPaths::CacheLocation) + "/artwork");
        setCache(cache);
    }
protected:
    QNetworkReply *createRequest(Operation op, const QNetworkRequest &original, QIODevice *data) override {
        QNetworkRequest request(original);
        const QUrl url = original.url();
        if (url.scheme() == "https" && url.port(443) == 443 && url.userInfo().isEmpty()) {
            QMutexLocker lock(&routes->mutex);
            const QString address = routes->addresses.value(url.host());
            if (!address.isEmpty()) {
                QUrl destination = url; destination.setHost(address); request.setUrl(destination);
                request.setAttribute(QNetworkRequest::CacheLoadControlAttribute, QNetworkRequest::PreferCache);
                // Проверяется сертификат официального CDN-алиаса CloudFront.
                // TLS-проверки не отключаются, запросы аккаунта здесь не проходят.
                request.setPeerVerifyName(address);
                request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
            }
        }
        request.setTransferTimeout(15000);
        return QNetworkAccessManager::createRequest(op, request, data);
    }
private:
    std::shared_ptr<ArtworkRoutes> routes;
};
}
ArtworkNetworkFactory::ArtworkNetworkFactory() : routes(std::make_shared<ArtworkRoutes>()) {
    // Проверенный CNAME CDN доступен и при временном отказе DNS-over-HTTPS.
    routes->addresses.insert("i1.sndcdn.com", "d36lkcxq7qra7v.cloudfront.net");
}
QNetworkAccessManager *ArtworkNetworkFactory::create(QObject *parent) { return new ArtworkManager(parent, routes); }
void ArtworkNetworkFactory::prepare(QObject *context, std::function<void()> ready) {
    auto *network = new QNetworkAccessManager(context);
    QNetworkRequest request(QUrl("https://cloudflare-dns.com/dns-query?name=i1.sndcdn.com&type=A"));
    request.setRawHeader("Accept", "application/dns-json"); request.setTransferTimeout(3000);
    request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    auto *reply = network->get(request);
    auto sharedRoutes = routes;
    QObject::connect(reply, &QNetworkReply::finished, context, [reply, network, sharedRoutes, ready] {
        if (reply->error() == QNetworkReply::NoError) {
            auto answers = QJsonDocument::fromJson(reply->readAll()).object().value("Answer").toArray();
            for (const auto &value : answers) {
                auto record = value.toObject();
                QString alias = record.value("data").toString().toLower();
                if (alias.endsWith('.')) alias.chop(1);
                if (record.value("type").toInt() == 5 && alias.endsWith(".cloudfront.net")
                    && !alias.contains('/') && !alias.contains(':') && !alias.contains('@')) {
                    QMutexLocker lock(&sharedRoutes->mutex);
                    sharedRoutes->addresses.insert("i1.sndcdn.com", alias);
                    break;
                }
            }
        }
        reply->deleteLater(); network->deleteLater(); ready();
    });
}
