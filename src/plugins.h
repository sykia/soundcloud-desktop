#pragma once
#include <QObject>
#include <QUrl>
#include <QVariant>

class Plugins : public QObject {
    Q_OBJECT
    Q_PROPERTY(QVariantList installed READ installed NOTIFY changed)
    Q_PROPERTY(QVariantMap theme READ theme NOTIFY changed)
    Q_PROPERTY(QVariantList panels READ panels NOTIFY changed)
public:
    explicit Plugins(QObject *parent = nullptr);
    QVariantList installed() const { return entries; }
    QVariantMap theme() const;
    QVariantList panels() const;
    Q_INVOKABLE QString install(const QUrl &file);
    Q_INVOKABLE QString enable(const QString &id, bool value);
    Q_INVOKABLE QString configure(const QString &id, int group, bool value);
    Q_INVOKABLE QString remove(const QString &id);
signals:
    void changed();
private:
    QVariantList entries;
    int indexOf(const QString &id) const;
    QString save(const QVariantList &next);
};
