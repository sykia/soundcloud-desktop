#include "plugins.h"
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QRegularExpression>
#include <QSaveFile>
#include <QStandardPaths>
#include <QDir>

namespace {
QString storage() {
    return QStandardPaths::writableLocation(QStandardPaths::AppDataLocation) + "/plugins-v1.json";
}
bool keys(const QJsonObject &o, const QStringList &allowed) {
    for (const auto &key : o.keys())
        if (!allowed.contains(key)) return false;
    return true;
}
bool label(const QJsonValue &v, int max) {
    const auto s = v.toString();
    if (s.trimmed().isEmpty() || s.size() > max) return false;
    for (const auto c : s)
        if (!c.isPrint() || c == '<' || c == '>') return false;
    return true;
}
QString validate(const QJsonObject &o) {
    static const QRegularExpression id("^[a-z][a-z0-9.-]{0,47}\\z");
    static const QRegularExpression color("^#[0-9a-fA-F]{6}\\z");
    if (!keys(o, {"api","id","name","groups"}) || o["api"] != 1 ||
        !id.match(o["id"].toString()).hasMatch() || !label(o["name"],48))
        return "Проверьте версию API, идентификатор и название плагина.";
    const auto groups = o["groups"].toArray();
    if (groups.isEmpty() || groups.size() > 6) return "Допустимо от 1 до 6 групп.";
    for (const auto v : groups) {
        const auto g = v.toObject();
        if (!keys(g, {"label","accent","coverRadius","covers","page","text","buttons"}) || !label(g["label"],48))
            return "Недопустимое поле или название группы.";
        if ((g.contains("accent") && !color.match(g["accent"].toString()).hasMatch()) ||
            (g.contains("coverRadius") && (g["coverRadius"].toInt(-1)<0 || g["coverRadius"].toInt()>24)) ||
            (g.contains("covers") && !QStringList{"artwork","artist"}.contains(g["covers"].toString())))
            return "Некорректное оформление.";
        if (g.contains("page") && !QStringList{"home","profile"}.contains(g["page"].toString()))
            return "Неизвестная страница панели.";
        if ((g.contains("text") || g.contains("buttons")) && !g.contains("page"))
            return "Для панели укажите страницу.";
        if (g.contains("text") && !label(g["text"],180)) return "Некорректный текст панели.";
        if (g.contains("buttons") && (!g["buttons"].isArray() || g["buttons"].toArray().size()>4))
            return "Допустимо до четырёх кнопок в группе.";
        for (const auto b : g["buttons"].toArray()) {
            const auto button = b.toObject();
            if (!keys(button, {"label","action"}) || !label(button["label"],32) ||
                !QStringList{"likes","history","feed","playlists","profile","search"}.contains(button["action"].toString()))
                return "Недопустимая кнопка или действие.";
        }
    }
    return {};
}
}

Plugins::Plugins(QObject *parent) : QObject(parent) {
    QFile f(storage());
    if (!f.open(QIODevice::ReadOnly) || f.size()>4*1024*1024) return;
    for (const auto v : QJsonDocument::fromJson(f.readAll()).array()) {
        const auto row = v.toObject();
        const auto plugin = row["plugin"].toObject();
        const auto groups = plugin["groups"].toArray();
        const auto flags = row["flags"].toArray();
        if (entries.size()>=24 || !validate(plugin).isEmpty() || !row["enabled"].isBool() ||
            flags.size()!=groups.size() || indexOf(plugin["id"].toString())>=0) continue;
        bool valid = true;
        for (const auto flag : flags) valid &= flag.isBool();
        if (valid) entries.append(row.toVariantMap());
    }
}
int Plugins::indexOf(const QString &id) const {
    for (int i=0; i<entries.size(); ++i)
        if (entries[i].toMap()["plugin"].toMap()["id"].toString()==id) return i;
    return -1;
}
QString Plugins::save(const QVariantList &next) {
    QSaveFile f(storage());
    const auto data = QJsonDocument::fromVariant(next).toJson(QJsonDocument::Compact);
    if (!QDir().mkpath(QFileInfo(f).absolutePath()) || !f.open(QIODevice::WriteOnly) ||
        f.write(data)!=data.size() || !f.commit()) return "Не удалось сохранить изменения на диске.";
    entries = next;
    emit changed();
    return {};
}
QString Plugins::install(const QUrl &url) {
    if (!url.isLocalFile() || !url.host().isEmpty()) return "Выберите локальный файл.";
    QFile file(url.toLocalFile());
    if (!QFileInfo(file).isFile() || !file.open(QIODevice::ReadOnly)) return "Не удалось открыть файл.";
    const auto bytes = file.read(32769);
    if (bytes.size()>32768) return "Файл превышает 32 КиБ.";
    const auto plugin = QJsonDocument::fromJson(bytes).object();
    const auto error = validate(plugin);
    if (!error.isEmpty()) return error;
    if (indexOf(plugin["id"].toString())>=0) return "Этот идентификатор уже установлен.";
    if (entries.size()>=24) return "Достигнут предел в 24 плагина.";
    QVariantList flags;
    for (int i=0; i<plugin["groups"].toArray().size(); ++i) flags.append(true);
    auto next = entries;
    next.append(QVariantMap{{"plugin",plugin.toVariantMap()},{"enabled",false},{"flags",flags}});
    return save(next);
}
QString Plugins::enable(const QString &id, bool value) {
    const int i = indexOf(id);
    if (i<0) return "Плагин не найден.";
    auto next = entries;
    auto row = next[i].toMap();
    row["enabled"] = value;
    next[i] = row;
    return save(next);
}
QString Plugins::configure(const QString &id, int group, bool value) {
    const int i = indexOf(id);
    if (i<0) return "Плагин не найден.";
    auto next = entries;
    auto row = next[i].toMap();
    auto flags = row["flags"].toList();
    if (group<0 || group>=flags.size()) return "Группа не найдена.";
    flags[group] = value;
    row["flags"] = flags;
    next[i] = row;
    return save(next);
}
QString Plugins::remove(const QString &id) {
    auto next = entries;
    const int i = indexOf(id);
    if (i<0) return "Плагин не найден.";
    next.removeAt(i);
    return save(next);
}
QVariantList Plugins::panels() const {
    QVariantList active;
    for (const auto &entry : entries) {
        const auto row = entry.toMap();
        if (!row["enabled"].toBool()) continue;
        const auto groups = row["plugin"].toMap()["groups"].toList();
        const auto flags = row["flags"].toList();
        for (int i=0; i<groups.size(); ++i)
            if (flags[i].toBool()) active.append(groups[i]);
    }
    return active;
}
QVariantMap Plugins::theme() const {
    QVariantMap result;
    for (const auto &group : panels()) {
        const auto g = group.toMap();
        for (const auto key : {"accent","covers","coverRadius"})
            if (g.contains(key)) result[key] = g[key];
    }
    return result;
}
