'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { binaryPath } = require('../src/main/connection-engine.js');
const manifest = require('../shared/byedpi.json');
const root = path.join(__dirname, '../build/byedpi');
for (const key of Object.keys(manifest.binaries)) {
  const [platform, arch] = key.split('-');
  binaryPath(root, platform, arch);
  console.log(`OK ByeDPI ${manifest.version}: ${key}`);
}
if (!fs.existsSync(path.join(root, 'LICENSE'))) throw new Error('Missing ByeDPI license');
