"""Упаковать каталог релизной сборки после windeployqt в установщик SCrip."""
import argparse
from pathlib import Path, PureWindowsPath
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("payload", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--makensis", default="makensis")
args = parser.parse_args()
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
subprocess.run([args.makensis, f"-DPAYLOAD={payload}", f"-DOUTPUT={output}",
                f"-DFILELIST={filelist}", "installer.nsi"],
               cwd=Path(__file__).resolve().parent, check=True)
