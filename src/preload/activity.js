'use strict';

const { ipcRenderer } = require('electron');
const { CHANNEL } = require('../../shared/ipc.js');
let active = true;
let revision = 0;
const listeners = new Set();
function setActive(value) {
  if (typeof value !== 'boolean' || value === active) return;
  active = value;
  for (const listener of listeners) listener(value);
}
ipcRenderer.on(CHANNEL.windowActive, (_event, value) => { revision++; setActive(value); });
const initialRevision = revision;
ipcRenderer.invoke(CHANNEL.getWindowActive).then(value => {
  if (revision === initialRevision) setActive(value);
}).catch(() => {});
function isWindowActive() { return active; }
function onWindowActivity(listener) { listeners.add(listener); }
module.exports = { isWindowActive, onWindowActivity };
