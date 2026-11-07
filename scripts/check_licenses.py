#!/usr/bin/env python3
"""Проверка учёта файлов, лицензий и наличия локальных исходников; не юридическое заключение."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
import tarfile
import zipfile

# Только уже рассмотренные простые идентификаторы. Сложные SPDX-выражения требуют ревью.
ALLOWED = {'GPL-3.0-only', 'GPL-3.0-or-later', 'LGPL-3.0-only', 'LGPL-3.0-or-later',
           'LGPL-2.1-only', 'LGPL-2.1-or-later', 'MIT', 'BSD-2-Clause', 'BSD-3-Clause',
           'Apache-2.0', 'ISC', 'Zlib', 'BSL-1.0', 'CC0-1.0', 'Unlicense',
           'MPL-2.0', 'Unicode-3.0', 'FTL', 'Libpng', 'libpng-2.0'}


def digest(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def local_file(root, name):
    if not isinstance(name, str) or not name or Path(name).is_absolute():
        raise ValueError('Нужен относительный путь файла')
    path = root / name
    if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError('Отсутствует локальный файл или путь выходит за каталог: ' + name)
    return path


def source_archive(path):
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
    else:
        with tarfile.open(path) as archive:
            names = [entry.name for entry in archive if entry.isfile()]
    if any(Path(name).is_absolute() or '..' in Path(name).parts for name in names):
        raise ValueError('Небезопасные пути в архиве исходников')
    if not any(Path(name).suffix in {'.c', '.cpp', '.h', '.java', '.rs', '.py', '.qml', '.S'} for name in names):
        raise ValueError('В архиве не найден исходный код: ' + str(path))
    if not any(Path(name).name.lower() in {'cmakelists.txt', 'configure', 'makefile', 'cargo.toml', 'build.gradle', 'pkgbuild', 'readme', 'readme.md', 'readme.txt'} for name in names):
        raise ValueError('Нет инструкций/материалов сборки: ' + str(path))


def check(payload, manifest):
    data = json.loads(manifest.read_text())
    actual = set()
    for p in payload.rglob('*'):
        if p.is_symlink():
            raise ValueError('Символическая ссылка требует отдельной проверки: ' + str(p))
        if p.is_file():
            actual.add(p.relative_to(payload).as_posix())
    if not actual or actual != set(data['files']):
        raise ValueError('Состав payload расходится с манифестом: ' + str(sorted(actual ^ set(data['files']))))
    used = set()
    for name, entry in data['files'].items():
        if digest(local_file(payload, name)) != entry['sha256']:
            raise ValueError('Изменился SHA-256: ' + name)
        if not entry['components'] or not isinstance(entry['components'], list):
            raise ValueError('Не указаны компоненты: ' + name)
        used.update(entry['components'])
    for identifier in used:
        component = data['components'][identifier]
        if component['license'] not in ALLOWED:
            raise ValueError('Лицензия требует ручной проверки: ' + identifier + ': ' + component['license'])
        notice = local_file(manifest.parent, component['notice'])
        source = local_file(manifest.parent, component['source'])
        if not notice.stat().st_size or not source.stat().st_size:
            raise ValueError('Пустые уведомления/исходники: ' + identifier)
        source_archive(source)
        if digest(source) != component['source_sha256']:
            raise ValueError('Изменились исходники: ' + identifier)
        # Уведомление обязано реально поставляться в payload, а не только лежать у сборщика.
        if digest(notice) not in {e['sha256'] for e in data['files'].values()}:
            raise ValueError('Уведомление не включено в пакет: ' + identifier)
    return len(actual), len(used)


def repo_check(root):
    text = (root / 'LICENSE').read_text()
    if 'GNU GENERAL PUBLIC LICENSE' not in text or 'Version 3, 29 June 2007' not in text or len(text) < 30000:
        raise ValueError('Нет полного текста GPLv3')
    for name in ['README.md', 'THIRD_PARTY_NOTICES.md', 'TRADEMARKS.md']:
        if 'GPL-3.0-only' not in (root / name).read_text():
            raise ValueError('Не согласована лицензия: ' + name)
    if 'SCrip Proprietary License' in (root / 'README.md').read_text():
        raise ValueError('Остались проприетарные условия README')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path)
    parser.add_argument('--payload', type=Path)
    parser.add_argument('--manifest', type=Path)
    args = parser.parse_args()
    try:
        if args.repo:
            repo_check(args.repo)
        elif args.payload and args.manifest:
            count, components = check(args.payload, args.manifest)
            print(f'Учтено файлов: {count}; компонентов: {components}. Наличие материалов проверено, совместимость не сертифицирована.')
        else:
            parser.error('Укажите --repo либо --payload и --manifest')
    except (ValueError, OSError, KeyError, TypeError, tarfile.TarError, zipfile.BadZipFile) as error:
        print('ОШИБКА: ' + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
