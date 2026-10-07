# SoundCloud Desktop: instructions for Codex agents

## Project

This is a small Electron wrapper around `https://soundcloud.com/`. Keep changes focused on the desktop client and its `cusade` customization panel. The user communicates in Russian; use Russian for user-facing UI text and status reports.

## Structure

The code is modularised end-to-end. The entry point for the whole app is `src/main/index.js`; the preload is a flat list of modules that esbuild bundles into a single `dist-js/preload.js` (the sandboxed preload can only `require('electron')`, so a bundle is mandatory).

- `src/main/` — the Electron main process, one subsystem per file:
  - `index.js` — entry: single-instance lock, `open-url`/`second-instance`, GPU crash fallback, `before-quit`, and the `whenReady` orchestration (DNS, settings/insights load, Discord start, audio-ad rule, IPC registration, menu, tray, window, update timers). Also wires the dependency hooks: `window.setHasTray(tray.hasTray)` and `updates.attachRefresh(tray.refreshMenu)`.
  - `window.js` — the SoundCloud `BrowserWindow`, navigation guards, load timeout + DNS rotation, OAuth popups, external-link routing, tray-aware close, pending launch URL.
  - `ipc.js` — every `cusade:*` channel; keeps sender checks (`isMainSoundCloudPage`) and setting validation.
  - `settings.js` — live settings state + persistence; validation/coercion lives in `shared/settings-schema.js`.
  - `insights-store.js` — cusade Insights sessions store (validate, debounced save, flush on quit).
  - `discord.js` / `discord-rpc.js` — Rich Presence bridge over the local IPC socket.
  - `updates.js` — electron-updater orchestration and the `updateState()` event, notifications, timers.
  - `tray.js` — tray icon + menu; reads update state through `updates.getMenuStatus()`.
  - `autostart.js`, `dns.js`, `gpu.js`, `urls.js` — isolated subsystems.
- `src/preload/` — the renderer-side logic: `index.js` boot/event wiring, `state.js`/`hosts.js` own the shared objects, and `panel.js`, `localization*.js`, `motion.js`, `styles.js`, `appearance.js`, `page-scope.js`, `route.js`, `enter.js`, `visualization.js`, `likes.js`, `insights.js`, `presence.js`, `updates-ui.js`, `settings.js`.
- `shared/` — `constants.js`, `settings-schema.js` (defaults/validators/coercion — the single source of truth for settings), `ipc.js` (the `CHANNEL` table, one place for every channel name).
- `build.js` — esbuild bundle `src/preload/index.js` → `dist-js/preload.js`; it owns the one build config and exports it, so `npm start`, `npm run check` (through `scripts/check-consistency.js`) and the `predist:` hooks all use the same pipeline — never a duplicate. `dist-js/` is gitignored and rebuilt on every run. Packaged output (`build.files`) ships `src/**`, `shared/**`, `dist-js/**`, `package.json`, `build/icons/*`, `build/icon.ico`, and electron-builder adds the runtime `dependencies` tree automatically. `npm run dist:linux` also targets `rpm`, which needs the system `rpm` package (CI installs it; on a machine without it, skip rpm by building the other targets separately).
- `scripts/check-consistency.js` — `npm run check`: `node --check` on all sources, bundle build, coverage of the original preload functions (`scripts/preload-manifest.json`), named-import vs. export cross-check, bare state/hosts reference scan, and a no-relative-require check inside the bundle.

Settings live in Electron's `app.getPath('userData')/settings.json`, outside this repository. Do not copy user profile data or authentication cookies into the project.

## Dependency rules

- Keep the graph acyclic and one-way: `index` → `tray` → `updates` → `window` → `{settings, dns, discord, urls}`; `window` never imports `tray`/`updates` (it reads tray existence through the `setHasTray` hook), `updates` never imports `tray` (it refreshes it through `attachRefresh`). The preload modules follow the same rule; `state.js`/`hosts.js` are leaves.
- Channel names only via `shared/ipc.js` `CHANNEL` — never hardcode `cusade:*` strings.
- Settings changes: add the key to `shared/settings-schema.js` (default, validate, coerce), its control in `src/preload/panel.js`, and any main-side effect in `src/main/ipc.js` (the setter channel is generated from the kebab-case key).

## Working rules

- Preserve `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true` for remote pages. Validate IPC senders and setting values in the main process.
- The cusade panel belongs inside the existing SoundCloud page. Do not open a separate BrowserWindow for settings.
- SoundCloud is a changing third-party site. Inspect live DOM before adding selectors, keep selectors narrow, and check both setting states. Prefer SoundCloud's CSS variables for color changes; do not recolor album art.
- Keep settings reversible and persistent. New settings should have a safe default, validation in the main process, immediate UI feedback, and a saved value in `settings.json`.
- Run `npm run check` after JavaScript edits. For visual changes, launch with `npm start` and verify the actual page and panel. Stop debug sessions and remove temporary screenshots or scripts when done.
- Avoid adding dependencies for simple client features.
- For every version, update `CHANGELOG.md` and add `release-notes/vX.Y.Z.md` with the user-visible changes and installation notes. Keep the package version, Git tag, and release notes aligned.