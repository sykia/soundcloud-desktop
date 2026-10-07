'use strict';

// Minimal Discord Rich Presence client over the local IPC socket. It is a plain
// net.Socket conversation with the Discord client: a handshake frame, then
// SET_ACTIVITY frames with the standard nonce answer for heartbeats. Moved
// verbatim from the root discord-rpc.js during the modularization refactor.

const net = require('node:net');
const path = require('node:path');

const RETRY_MS = 15000;
const CONNECT_TIMEOUT_MS = 1000;
const HANDSHAKE_TIMEOUT_MS = 5000;
const MAX_FRAME_SIZE = 1024 * 1024;

function socketPaths() {
  const roots = process.platform === 'win32'
    ? ['\\\\?\\pipe']
    : [...new Set([process.env.XDG_RUNTIME_DIR, process.env.TMPDIR,
      process.env.TMP, process.env.TEMP, '/tmp'].filter(Boolean))];
  return roots.flatMap(root => Array.from({ length: 10 }, (_, index) =>
    process.platform === 'win32'
      ? `${root}\\discord-ipc-${index}`
      : path.join(root, `discord-ipc-${index}`)));
}

function frame(opcode, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  const header = Buffer.alloc(8);
  header.writeUInt32LE(opcode, 0);
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

class DiscordRpc {
  constructor() {
    this.clientId = '';
    this.activity = null;
    this.socket = null;
    this.ready = false;
    this.connecting = false;
    this.retryTimer = null;
    this.buffer = Buffer.alloc(0);
    this.nonce = 0;
  }

  start(clientId) {
    if (this.clientId === clientId) return;
    this.stop();
    this.clientId = clientId;
    this.connect();
  }

  stop() {
    if (this.ready) this.sendActivity(null);
    this.clientId = '';
    this.activity = null;
    this.ready = false;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.socket) {
      if (this.socket.writable) this.socket.end();
      else this.socket.destroy();
      this.socket = null;
    }
    this.connecting = false;
  }

  update(activity) {
    this.activity = activity;
    if (this.ready) this.sendActivity(activity);
  }

  sendActivity(activity) {
    this.socket?.write(frame(1, {
      cmd: 'SET_ACTIVITY',
      args: { pid: process.pid, activity },
      nonce: String(++this.nonce)
    }));
  }

  scheduleRetry() {
    if (!this.clientId || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, RETRY_MS);
  }

  async connect() {
    if (!this.clientId || this.connecting || this.socket) return;
    this.connecting = true;
    const clientId = this.clientId;
    for (const socketPath of socketPaths()) {
      if (clientId !== this.clientId) break;
      const socket = await new Promise(resolve => {
        const candidate = net.createConnection(socketPath);
        candidate.setTimeout(CONNECT_TIMEOUT_MS);
        candidate.once('connect', () => {
          candidate.setTimeout(HANDSHAKE_TIMEOUT_MS, () => candidate.destroy());
          candidate.removeAllListeners('error');
          resolve(candidate);
        });
        candidate.once('error', () => { candidate.destroy(); resolve(null); });
        candidate.once('timeout', () => { candidate.destroy(); resolve(null); });
      });
      if (!socket) continue;
      if (clientId !== this.clientId) { socket.destroy(); break; }
      this.socket = socket;
      this.buffer = Buffer.alloc(0);
      socket.on('data', chunk => this.onData(chunk));
      socket.on('error', () => socket.destroy());
      socket.on('close', () => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.ready = false;
        this.scheduleRetry();
      });
      socket.write(frame(0, { v: 1, client_id: clientId }));
      break;
    }
    this.connecting = false;
    if (!this.socket) this.scheduleRetry();
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 8) {
      const opcode = this.buffer.readUInt32LE(0);
      const length = this.buffer.readUInt32LE(4);
      if (length > MAX_FRAME_SIZE) { this.socket?.destroy(); return; }
      if (this.buffer.length < length + 8) return;
      const payload = this.buffer.subarray(8, length + 8);
      this.buffer = this.buffer.subarray(length + 8);
      if (opcode === 3) {
        try { this.socket?.write(frame(4, JSON.parse(payload.toString()))); }
        catch { this.socket?.destroy(); }
      } else if (opcode === 2) {
        this.socket?.destroy();
      } else if (opcode === 1) {
        let message;
        try { message = JSON.parse(payload.toString()); } catch { continue; }
        if (message.evt === 'READY') {
          this.socket?.setTimeout(0);
          this.ready = true;
          if (this.activity) this.sendActivity(this.activity);
        } else if (message.evt === 'ERROR') {
          console.error('Discord RPC:', message.data?.message || 'Unknown error');
        }
      }
    }
  }
}

module.exports = new DiscordRpc();