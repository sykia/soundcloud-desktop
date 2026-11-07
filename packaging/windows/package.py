"""Упаковать каталог релизной сборки после windeployqt в установщик SCrip."""
import argparse
from pathlib import Path, PureWindowsPath
import re
import shutil
import subprocess
from tempfile import TemporaryDirectory

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("payload", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--makensis", default="makensis")
parser.add_argument("--sign-certificate", help="SHA-1 отпечаток сертификата подписи кода в хранилище пользователя Windows")
parser.add_argument("--timestamp-url", help="HTTPS-адрес RFC 3161 сервиса издателя сертификата")
args = parser.parse_args()
if bool(args.sign_certificate) != bool(args.timestamp_url):
    parser.error("Для подписи укажите сертификат и сервер меток времени")
if args.sign_certificate and (not re.fullmatch(r"[0-9A-Fa-f]{40}", args.sign_certificate)
                              or not args.timestamp_url.startswith("https://")):
    parser.error("Проверьте отпечаток сертификата и HTTPS-адрес сервера меток времени")


def sign(path):
    subprocess.run(["signtool", "sign", "/sha1", args.sign_certificate, "/fd", "SHA256",
                    "/tr", args.timestamp_url, "/td", "SHA256", str(path)], check=True)
    subprocess.run(["signtool", "verify", "/pa", "/all", "/tw", str(path)], check=True)

payload = args.payload.resolve()
output = args.output.resolve()
if not (payload / "SCrip.exe").is_file():
    parser.error("В каталоге должен находиться SCrip.exe")
if not any(payload.rglob("ffmpegmediaplugin.dll")):
    parser.error("Для потоков SoundCloud добавьте в сборку медиаплагин Qt FFmpeg и его библиотеки")
if output.is_relative_to(payload):
    parser.error("Укажите путь результата за пределами каталога приложения")
output.parent.mkdir(parents=True, exist_ok=True)
filelist = output.with_suffix(".uninstall.nsh")
with filelist.open("w", encoding="utf-8-sig") as manifest:
    for item in sorted(payload.rglob("*"), reverse=True):
        rel = str(PureWindowsPath(item.relative_to(payload))).replace("$", "$$")
        command = "RMDir" if item.is_dir() else "Delete"
        print(f'{command} "$INSTDIR\\{rel}"', file=manifest)
with TemporaryDirectory(dir=output.parent) as staging:
    staging = Path(staging)
    if args.sign_certificate:
        payload = Path(shutil.copytree(payload, staging / "payload"))
        sign(payload / "SCrip.exe")
    installer = staging / output.name
    subprocess.run([args.makensis, f"-DPAYLOAD={payload}", f"-DOUTPUT={installer}",
                    f"-DFILELIST={filelist}", "installer.nsi"],
                   cwd=Path(__file__).resolve().parent, check=True)
    if args.sign_certificate:
        sign(installer)
    installer.replace(output)
