#!/usr/bin/env python3
"""Распаковать реальные пакеты и проверить их по отдельным материалам соответствия."""
import argparse
import hashlib
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile
from check_licenses import check, digest
import json


def audit(assets, materials):
    patterns = {'Windows': '*-Windows-x64.exe', 'Linux-DEB': '*.deb',
                'Linux-Arch': '*.pkg.tar.zst', 'Android': '*.apk'}
    for platform, pattern in patterns.items():
        files = list(assets.glob(pattern))
        if len(files) != 1:
            raise ValueError(f'{platform}: требуется ровно один пакет {pattern}')
        package = files[0]
        manifest = materials / platform / 'compliance.json'
        data = json.loads(manifest.read_text())
        if data['artifact_sha256'] != digest(package):
            raise ValueError('Материалы относятся к другому пакету: ' + platform)
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary)
            if platform == 'Android':
                with zipfile.ZipFile(package) as archive:
                    for entry in archive.infolist():
                        name = Path(entry.filename)
                        if name.is_absolute() or '..' in name.parts or (entry.external_attr >> 16) & 0o170000 == 0o120000:
                            raise ValueError('Небезопасный путь в APK')
                    archive.extractall(target)
            elif platform == 'Windows':
                subprocess.run(['7z', 'x', '-y', '-o' + str(target), str(package.resolve())], check=True, stdout=subprocess.DEVNULL)
            elif platform == 'Linux-DEB':
                subprocess.run(['dpkg-deb', '-x', str(package.resolve()), str(target)], check=True)
            else:
                subprocess.run(['bsdtar', '-xf', str(package.resolve()), '-C', str(target)], check=True)
            count, components = check(target, manifest)
            print(f'{platform}: {count} файлов, {components} компонентов; состав проверен по реальному пакету')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets', type=Path, required=True)
    parser.add_argument('--materials', type=Path, required=True)
    args = parser.parse_args()
    try:
        audit(args.assets, args.materials)
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        print('Аудит пакетов не пройден: ' + str(error), file=sys.stderr)
        sys.exit(1)
