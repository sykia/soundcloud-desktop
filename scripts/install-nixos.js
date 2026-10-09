'use strict';

const os = require('node:os');
const semver = require('semver');
const { NixUpdater, releaseInfo, isNixInstallation } = require('../src/main/nix-updates.js');

async function request(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'SoundCloud-Desktop', Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`GitHub: HTTP ${response.status}`);
  return response.text();
}

async function main() {
  if (!isNixInstallation() || process.arch !== 'x64') throw new Error('Установщик предназначен для NixOS x86_64.');
  const version = process.argv[2];
  if (version && (!semver.valid(version) || !/^[\w.-]+$/.test(version))) throw new Error('Укажите версию, например 0.5.5-debug.1.');
  const endpoint = version ? `tags/v${version}` : 'latest';
  const release = JSON.parse(await request(`https://api.github.com/repos/sykia/soundcloud-desktop/releases/${endpoint}`));
  const updater = new NixUpdater({ version: '0.0.0-debug.0', home: os.homedir(), request });
  updater.release = releaseInfo([release], updater.version);
  if (!updater.release) throw new Error('В релизе отсутствует совместимый AppImage.');
  console.log(`Установка ${updater.release.version} в отдельный профиль Nix…`);
  console.log(`Готово. Запуск: ${await updater.installUpdate()}`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
