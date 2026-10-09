'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { NixUpdater, releaseInfo, packageExpression, isNixInstallation } = require('../src/main/nix-updates.js');
const { isAudioAdRequest, installAudioAdRule } = require('../src/main/audio-ads.js');

const sha256 = 'a'.repeat(64);
function release(version, prerelease = false) {
  return { tag_name: `v${version}`, prerelease, draft: false, assets: [{
    name: `SoundCloud-Desktop-${version}-x86_64.AppImage`,
    browser_download_url: `https://github.com/sykia/soundcloud-desktop/releases/download/v${version}/SoundCloud-Desktop-${version}-x86_64.AppImage`,
    digest: `sha256:${sha256}`
  }] };
}

test('Nix detection leaves Windows and normal Linux installers alone', () => {
  assert.equal(isNixInstallation('win32', '/nix/store/electron', '', 'ID=nixos'), false);
  assert.equal(isNixInstallation('linux', '/usr/bin/soundcloud-desktop', '', 'ID=arch'), false);
  assert.equal(isNixInstallation('linux', '/usr/bin/soundcloud-desktop', '', 'ID="nixos"'), true);
  assert.equal(isNixInstallation('linux', '/nix/store/pkg/soundcloud-desktop', '', ''), true);
});

test('stable versions ignore debug releases, debug versions can update, downgrades are rejected', () => {
  const releases = [release('0.5.6-debug.2', true), release('0.5.5'), release('0.5.4')];
  assert.equal(releaseInfo(releases, '0.5.4').version, '0.5.5');
  assert.equal(releaseInfo(releases, '0.5.5-debug.1').version, '0.5.6-debug.2');
  assert.equal(releaseInfo([release('0.5.4')], '0.5.5-debug.1'), null);
  assert.equal(releaseInfo([release('0.5.5')], '0.5.5-debug.1').version, '0.5.5');
  const wrong = release('0.5.5');
  wrong.assets[0].browser_download_url = 'https://example.com/arbitrary.AppImage';
  assert.equal(releaseInfo([wrong], '0.5.4'), null);
});

test('Nix expressions require a verified hash and reject injected versions', () => {
  assert.throws(() => packageExpression({ version: '0.5.5', sha256: '' }));
  assert.throws(() => packageExpression({ version: '0.5.5";abort "bad', sha256 }));
  const expression = packageExpression({ version: '0.5.5', sha256 });
  assert.ok(expression.includes(`sha256 = "${sha256}"`));
  assert.ok(expression.includes('appimageTools.wrapType2'));
  assert.ok(expression.includes('extraPkgs = p: [ p.nix ]'));
});

test('Nix installation uses a separate profile and creates a correctly quoted launcher only after success', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cusade-nix-'));
  const dataHome = path.join(directory, "data with spaces and 'quote'");
  let commandArgs;
  const updater = new NixUpdater({ version: '0.5.4', home: directory, dataHome,
    request: async () => JSON.stringify([release('0.5.5')]),
    run: async (command, args) => {
      assert.equal(command, 'nix-env');
      commandArgs = args;
      const executable = path.join(updater.paths.profile, 'bin/soundcloud-desktop');
      fs.mkdirSync(path.dirname(executable), { recursive: true });
      fs.writeFileSync(executable, '#!/bin/sh\nprintf "%s" "$1"\n', { mode: 0o755 });
    }
  });
  try {
    await updater.checkForUpdates();
    const launcher = await updater.installUpdate();
    assert.deepEqual(commandArgs, ['--profile', updater.paths.profile, '--install', '--file', path.join(updater.paths.directory, 'v0.5.5.nix')]);
    if (process.platform !== 'win32') assert.equal(execFileSync('/bin/sh', [launcher, 'one argument with spaces'], { encoding: 'utf8' }), 'one argument with spaces');
    assert.ok(fs.readFileSync(updater.paths.desktop, 'utf8').includes('MimeType=x-scheme-handler/soundcloud-desktop;'));
    assert.equal(fs.existsSync(path.join(directory, '.nix-profile')), false);
    const previousLauncher = fs.readFileSync(launcher, 'utf8');
    const previousDesktop = fs.readFileSync(updater.paths.desktop, 'utf8');
    updater.run = async () => { throw new Error('build failed'); };
    await assert.rejects(updater.installUpdate(), /build failed/);
    assert.equal(fs.readFileSync(launcher, 'utf8'), previousLauncher);
    assert.equal(fs.readFileSync(updater.paths.desktop, 'utf8'), previousDesktop);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('invalid checksums never invoke Nix', async () => {
  let installs = 0;
  const bad = release('0.5.5');
  delete bad.assets[0].digest;
  const updater = new NixUpdater({ version: '0.5.4', home: os.tmpdir(),
    request: async url => url.endsWith('SHA256SUMS') ? `not-a-checksum  ${bad.assets[0].name}` : JSON.stringify([bad]),
    run: async () => { installs++; }
  });
  await updater.checkForUpdates();
  await assert.rejects(updater.installUpdate(), /контрольная сумма/);
  assert.equal(installs, 0);
});

test('audio advertising is blocked only for its exact GET endpoint and follows the live setting', () => {
  const details = { method: 'GET', url: 'https://api-v2.soundcloud.com/audio-ads?client_id=test' };
  assert.equal(isAudioAdRequest(details), true);
  assert.equal(isAudioAdRequest({ ...details, method: 'POST' }), false);
  assert.equal(isAudioAdRequest({ ...details, url: 'https://api-v2.soundcloud.com/audio-ads-settings' }), false);
  let listener;
  const settings = { blockAudioAds: true };
  installAudioAdRule({ webRequest: { onBeforeRequest(_filter, handler) { listener = handler; } } }, () => settings);
  listener(details, result => assert.equal(result.cancel, true));
  settings.blockAudioAds = false;
  listener(details, result => assert.equal(result.cancel, false));
});
