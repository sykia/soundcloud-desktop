'use strict';

// Bundles the modular preload source into the single file Electron loads. The
// preload runs sandboxed: the renderer only exposes `require('electron')`, so
// relative requires have to be resolved at build time. esbuild keeps the bundle
// readable (no minification) and fast (tens of milliseconds).
//
// `npm start` and `npm run check` run this first, and `npm run build:watch`
// rebuilds on every change while developing.

const { build } = require('esbuild');

// Single source of truth for the preload bundle. `npm start`, `npm run check`
// and the `predist:*` hooks all go through here — there is exactly one build
// configuration, never a separate one hidden inside another script.
const common = {
  entryPoints: ['src/preload/index.js'],
  bundle: true,
  outfile: 'dist-js/preload.js',
  format: 'cjs',
  platform: 'node',
  external: ['electron'],
  logLevel: 'warning'
};

async function buildPreload() {
  await build(common);
}

if (require.main === module) {
  run().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

async function run() {
  if (process.argv.includes('--watch')) {
    const context = await require('esbuild').context(common);
    await context.watch();
    console.log('[build] watching src/preload for changes…');
    return;
  }
  await buildPreload();
  console.log('[build] dist-js/preload.js written');
}

module.exports = { common, buildPreload };