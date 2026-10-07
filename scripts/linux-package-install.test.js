'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installLinuxPackage, packageCommand } = require('../src/main/linux-package-install.js');

test('pacman receives the downloaded file as one argument', () => {
  const file = '/tmp/update package.pkg.tar.zst';
  const [command, args] = packageCommand('pacman', file);
  assert.equal(command, '/usr/bin/pacman');
  assert.deepEqual(args, ['-U', '--noconfirm', file]);
});

test('package installation runs without a shell and waits for the exit code', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cusade-update-test-'));
  const packageFile = path.join(directory, 'update package.pkg.tar.zst');
  let launched;
  const run = (command, args, options) => {
    launched = { command, args, options };
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(() => child.emit('close', 0));
    return child;
  };
  fs.writeFileSync(packageFile, 'test');
  try {
    await installLinuxPackage('pacman', packageFile, run);
    assert.equal(launched.options.shell, false);
    assert.equal(launched.args.at(-1), packageFile);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
