'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, session } = require('electron');
const dns = require('./dns.js');
const { startEngine } = require('./connection-engine.js');
const { ConnectionManager } = require('./connection-manager.js');

let manager;
function getManager() {
  if (!manager) {
    const savedPath = path.join(app.getPath('userData'), 'connection-strategy.json');
    let dnsIndex = 0;
    manager = new ConnectionManager({
      ses: session.defaultSession,
      engineFactory: (strategy, onExit) => startEngine(app.isPackaged
        ? path.join(process.resourcesPath, 'byedpi')
        : path.join(__dirname, '../../build/byedpi'), strategy, onExit),
      loadStrategy: () => { try { return JSON.parse(fs.readFileSync(savedPath, 'utf8')).strategy; } catch { return ''; } },
      saveStrategy: strategy => { try { fs.writeFileSync(savedPath, JSON.stringify({ strategy })); } catch {} },
      rotateDns: () => dns.configureDnsServer((++dnsIndex) % 3)
    });
  }
  return manager;
}

function setMode(mode) { return getManager().setMode(mode); }
function getStatus() { return getManager().getStatus(); }
function reportFailure(url, options) { getManager().reportFailure(url, options); }
function stop() { manager?.stop(); }

function observeSession() {
  // Electron supports one listener per webRequest event; keep this centralized.
  session.defaultSession.webRequest.onErrorOccurred({ urls: [
    'https://*.soundcloud.com/*', 'https://soundcloud.com/*',
    'https://*.sndcdn.com/*', 'https://*.soundcloud.cloud/*'
  ] }, details => {
    if (details.error === 'net::ERR_ABORTED' || details.error?.includes('BLOCKED_BY')) return;
    if (['image', 'font', 'ping', 'cspReport'].includes(details.resourceType)) return;
    reportFailure(details.url, { mainFrame: ['mainFrame', 'script', 'stylesheet'].includes(details.resourceType) });
  });
}

module.exports = { getManager, setMode, getStatus, reportFailure, observeSession, stop };
