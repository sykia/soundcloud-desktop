'use strict';

// Software-rendering fallback for machines whose GPU process keeps dying. The
// one-shot marker is read at startup (consumeGpuFallback) before app readiness,
// and written again by handleGpuProcessGone once the crash limit is reached, so
// the app restarts once with acceleration off and tries the GPU again on the
// next launch instead of staying degraded forever.

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const GPU_FALLBACK_FILE = 'gpu-fallback.json';
const GPU_CRASH_LIMIT = 2;
// Electron reports every GPU process exit through 'child-process-gone', and most of
// those reasons are not a fault: 'clean-exit' (exit code 0), 'killed' (external
// SIGTERM, shutdown, task manager) and 'memory-eviction' (Chromium reclaims the
// process on purpose to stay ahead of OOM). Only reasons that mean the GPU process
// could not do its job count towards the fallback. Unknown reasons are ignored, so
// an unexpected value from a future Chromium keeps acceleration enabled instead of
// degrading a healthy machine.
const GPU_FAILURE_REASONS = new Set(['abnormal-exit', 'crashed', 'oom', 'launch-failed', 'integrity-failure']);

let gpuCrashCount = 0;
let gpuFallbackRestarted = false;

function gpuFallbackPath() {
  return path.join(app.getPath('userData'), GPU_FALLBACK_FILE);
}

// Reads the one-shot marker that asks for software rendering and clears it, so the
// next launch tries the GPU again instead of staying degraded forever.
function consumeGpuFallback() {
  try {
    const state = JSON.parse(fs.readFileSync(gpuFallbackPath(), 'utf8'));
    if (state?.disableHardwareAcceleration !== true) return false;
    fs.rmSync(gpuFallbackPath(), { force: true });
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not read the GPU fallback state:', error);
    return false;
  }
}

function rememberGpuFallback() {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(gpuFallbackPath(), JSON.stringify({ disableHardwareAcceleration: true }));
  } catch (error) {
    console.error('Could not save the GPU fallback state:', error);
  }
}

function isFallbackRestarted() {
  return gpuFallbackRestarted;
}

// Returns true when the crash limit is reached and the caller should relaunch.
function handleGpuProcessGone(reason) {
  if (!GPU_FAILURE_REASONS.has(reason)) return false;
  gpuCrashCount += 1;
  console.error(`GPU process is gone (${reason}), failure ${gpuCrashCount} of ${GPU_CRASH_LIMIT}`);
  if (gpuCrashCount < GPU_CRASH_LIMIT) return false;
  // Only a repeated failure counts as a broken driver, and the restart is
  // guarded so the app can never end up in a relaunch loop.
  gpuFallbackRestarted = true;
  rememberGpuFallback();
  console.error('Restarting once with hardware acceleration disabled.');
  return true;
}

module.exports = { consumeGpuFallback, handleGpuProcessGone, isFallbackRestarted };