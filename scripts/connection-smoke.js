'use strict';

// Actual Chromium PAC evaluation and bundled engine, without external traffic
// or the user's profile. Run with Electron, not node --test.
const { app, session } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ConnectionManager } = require('../src/main/connection-manager.js');
const { startEngine } = require('../src/main/connection-engine.js');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'scd-connection-smoke-'));
app.setPath('userData', profile);
app.setPath('sessionData', profile);
let manager;
const timeout = setTimeout(() => { manager?.stop(); app.exit(1); }, 30000);
app.whenReady().then(async () => {
  const ses = session.defaultSession;
  manager = new ConnectionManager({ ses,
    engineFactory: (strategy, onExit) => startEngine(path.join(__dirname, '../build/byedpi'), strategy, onExit)
  });
  for (const mode of ['auto', 'bypass', 'direct', 'auto']) {
    await manager.setMode(mode);
    clearTimeout(manager.timer); manager.timer = null;
    for (const url of ['https://soundcloud.com/', 'https://api-v2.soundcloud.com/',
      'https://cf-hls-media.sndcdn.com/', 'https://playback.media-streaming.soundcloud.cloud/']) {
      const result = await ses.resolveProxy(url);
      assert.match(result, mode === 'direct' ? /DIRECT/ : /^PROXY 127\.0\.0\.1:\d+$/);
    }
    if (mode !== 'direct') {
      for (const url of ['https://example.org/', 'https://soundcloud.com.example.org/']) {
        assert.equal(await ses.resolveProxy(url), 'DIRECT');
      }
    }
    console.log(`PASS: Chromium PAC and engine lifecycle (${mode})`);
  }
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  clearTimeout(timeout); manager?.stop(); app.exit(process.exitCode || 0);
});
