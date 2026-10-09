'use strict';

// Nix store paths are immutable. Install a verified release into a dedicated
// user profile, then restart through its FHS wrapper instead of replacing an
// AppImage or executing the extracted ELF directly.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const semver = require('semver');

const REPOSITORY = 'https://github.com/sykia/soundcloud-desktop';
const API = 'https://api.github.com/repos/sykia/soundcloud-desktop/releases?per_page=30';
const NIXPKGS_REVISION = '7c8764b7c7b09b34f632464276218ef9090eaa11';

function isNixInstallation(platform = process.platform, executable = process.execPath,
    resources = process.resourcesPath || '', osRelease) {
  if (platform !== 'linux') return false;
  if (executable.startsWith('/nix/store/') || resources.startsWith('/nix/store/')) return true;
  if (osRelease === undefined) {
    try { osRelease = fs.readFileSync('/etc/os-release', 'utf8'); } catch { osRelease = ''; }
  }
  return /^ID=["']?nixos["']?$/m.test(osRelease);
}

function releaseInfo(releases, currentVersion) {
  const current = semver.valid(currentVersion);
  if (!current || !Array.isArray(releases)) throw new Error('Некорректный список релизов.');
  const allowPrerelease = semver.prerelease(current) !== null;
  const candidates = releases.filter(release => !release.draft &&
    (allowPrerelease || !release.prerelease) && /^v\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(release.tag_name || '') &&
    semver.valid(release.tag_name.slice(1)) && semver.gt(release.tag_name.slice(1), current));
  candidates.sort((a, b) => semver.rcompare(a.tag_name.slice(1), b.tag_name.slice(1)));
  for (const release of candidates) {
    const version = release.tag_name.slice(1);
    const filename = `SoundCloud-Desktop-${version}-x86_64.AppImage`;
    const url = `${REPOSITORY}/releases/download/v${version}/${filename}`;
    const asset = release.assets?.find(item => item.name === filename && item.browser_download_url === url);
    if (!asset) continue;
    return { version, filename, url, sha256: /^sha256:[a-f0-9]{64}$/i.test(asset.digest || '') ? asset.digest.slice(7).toLowerCase() : null };
  }
  return null;
}

function packageExpression(info) {
  if (!semver.valid(info.version) || !/^[\w.-]+$/.test(info.version) || !/^[a-f0-9]{64}$/.test(info.sha256)) {
    throw new Error('Отсутствует проверенная контрольная сумма релиза.');
  }
  return `{ pkgs ? import (let channel = builtins.tryEval (builtins.findFile builtins.nixPath "nixpkgs"); in
    if channel.success then channel.value else builtins.fetchTarball "https://github.com/NixOS/nixpkgs/archive/${NIXPKGS_REVISION}.tar.gz") { } }:
let
  pname = "soundcloud-desktop";
  version = "${info.version}";
  src = pkgs.fetchurl {
    url = "${REPOSITORY}/releases/download/v${info.version}/SoundCloud-Desktop-${info.version}-x86_64.AppImage";
    sha256 = "${info.sha256}";
  };
  contents = pkgs.appimageTools.extractType2 { inherit pname version src; };
in pkgs.appimageTools.wrapType2 {
  inherit pname version src;
  extraPkgs = p: [ p.nix ];
  extraInstallCommands = ''
    install -Dm644 "\${contents}/io.github.sykia.soundcloud-desktop.desktop" "$out/share/applications/io.github.sykia.soundcloud-desktop.desktop"
    substituteInPlace "$out/share/applications/io.github.sykia.soundcloud-desktop.desktop" --replace-fail 'Exec=AppRun' "Exec=$out/bin/soundcloud-desktop"
    cp -r "\${contents}/usr/share/icons" "$out/share/"
  '';
}
`;
}

function runNix(command, args, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'], signal });
    let output = '';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output = (output + chunk).slice(-4096); });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(output.trim() || `Nix завершился с кодом ${code}.`)));
  });
}

const shellQuote = value => `'${value.replace(/'/g, `'\\''`)}'`;
const desktopQuote = value => `"${value.replace(/([\\"$`])/g, '\\$1').replace(/%/g, '%%')}"`;

function managedPaths(home, dataHome = process.env.XDG_DATA_HOME || path.join(home, '.local/share')) {
  const directory = path.join(dataHome, 'soundcloud-desktop', 'nix');
  return { directory, profile: path.join(directory, 'profile'), launcher: path.join(directory, 'soundcloud-desktop'),
    desktop: path.join(dataHome, 'applications', 'io.github.sykia.soundcloud-desktop.desktop') };
}

async function fetchText(url) {
  const { net } = require('electron');
  const response = await net.fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'SoundCloud-Desktop' }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`GitHub вернул код ${response.status}.`);
  const text = await response.text();
  if (text.length > 2_000_000) throw new Error('Слишком большой ответ сервера обновлений.');
  return text;
}

class NixUpdater extends EventEmitter {
  constructor({ version, home, dataHome, request = fetchText, run = runNix, arch = process.arch }) {
    super();
    this.version = version;
    this.paths = managedPaths(home, dataHome);
    this.request = request;
    this.run = run;
    this.arch = arch;
    this.release = null;
    this.installing = false;
    this.abort = null;
  }

  async checkForUpdates() {
    if (this.arch !== 'x64') throw new Error('В этом релизе NixOS поддерживается на x86_64.');
    this.release = releaseInfo(JSON.parse(await this.request(API)), this.version);
    this.emit(this.release ? 'update-available' : 'update-not-available', this.release);
    return this.release;
  }

  async installUpdate() {
    if (!this.release || this.installing) throw new Error('Обновление Nix недоступно или уже устанавливается.');
    this.installing = true;
    this.abort = new AbortController();
    try {
      const info = { ...this.release };
      if (!info.sha256) {
        const sums = await this.request(`${REPOSITORY}/releases/download/v${info.version}/SHA256SUMS`);
        const line = sums.split(/\r?\n/).find(value => value.trim().split(/\s+/)[1]?.replace(/^\*/, '') === info.filename);
        info.sha256 = line?.trim().split(/\s+/)[0]?.toLowerCase();
      }
      const expression = packageExpression(info);
      const { directory, profile, launcher, desktop } = this.paths;
      fs.mkdirSync(directory, { recursive: true });
      const file = path.join(directory, `v${info.version}.nix`);
      fs.writeFileSync(file, expression, { mode: 0o600 });
      // nix-env atomically replaces the same-named package in this dedicated
      // legacy profile; system/Home Manager profiles and their packages stay put.
      await this.run('nix-env', ['--profile', profile, '--install', '--file', file], this.abort.signal);
      const executable = path.join(profile, 'bin', 'soundcloud-desktop');
      fs.accessSync(executable, fs.constants.X_OK);
      const script = `#!/bin/sh\nexport SOUNDCLOUD_DESKTOP_NIX_LAUNCHER=${shellQuote(launcher)}\nexec ${shellQuote(executable)} "$@"\n`;
      fs.writeFileSync(launcher + '.tmp', script, { mode: 0o755 });
      fs.renameSync(launcher + '.tmp', launcher);
      fs.mkdirSync(path.dirname(desktop), { recursive: true });
      fs.writeFileSync(desktop + '.tmp', `[Desktop Entry]\nType=Application\nName=SoundCloud Desktop\nExec=${desktopQuote(launcher)} %U\nIcon=${path.join(profile, 'share/icons/hicolor/512x512/apps/soundcloud-desktop.png')}\nTerminal=false\nCategories=AudioVideo;\nMimeType=x-scheme-handler/soundcloud-desktop;\n`, { mode: 0o644 });
      fs.renameSync(desktop + '.tmp', desktop);
      return launcher;
    } finally {
      this.installing = false;
      this.abort = null;
    }
  }

  teardown() { this.abort?.abort(); }
}

module.exports = { NixUpdater, isNixInstallation, releaseInfo, packageExpression, managedPaths, runNix };
