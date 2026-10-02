# SoundCloud Desktop: instructions for Codex agents

## Project

This is a small Electron wrapper around `https://soundcloud.com/`. Keep changes focused on the desktop client and its `cusade` customization panel. The user communicates in Russian; use Russian for user-facing UI text and status reports.

## Structure

- `main.js` owns the Electron window, navigation, OAuth popups, DNS configuration, and settings persistence.
- `preload.js` handles the right-click on SoundCloud's logo, draws the cusade panel inside the page, and applies visual settings. It runs with context isolation and a sandbox.
- `package.json` provides `npm start` and `npm run check`.
- `README.md` documents how to run and use the client.

Settings live in Electron's `app.getPath('userData')/settings.json`, outside this repository. Do not copy user profile data or authentication cookies into the project.

## Working rules

- Preserve `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true` for remote pages. Validate IPC senders and setting values in `main.js`.
- The cusade panel belongs inside the existing SoundCloud page. Do not open a separate BrowserWindow for settings.
- SoundCloud is a changing third-party site. Inspect live DOM before adding selectors, keep selectors narrow, and check both setting states. Prefer SoundCloud's CSS variables for color changes; do not recolor album art.
- Keep settings reversible and persistent. New settings should have a safe default, validation in the main process, immediate UI feedback, and a saved value in `settings.json`.
- Run `npm run check` after JavaScript edits. For visual changes, launch with `npm start` and verify the actual page and panel. Stop debug sessions and remove temporary screenshots or scripts when done.
- Avoid adding dependencies for simple client features.
- For every version, update `CHANGELOG.md` and add `release-notes/vX.Y.Z.md` with the user-visible changes and installation notes. Keep the package version, Git tag, and release notes aligned.
