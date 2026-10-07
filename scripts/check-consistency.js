'use strict';

// `npm run check` entry point. Verifies the whole modular build without
// launching Electron:
//
//   1. node --check every JavaScript source (src/, shared/, scripts/, build.js)
//      and the produced bundle;
//   2. builds dist-js/preload.js with esbuild (fails on unresolved requires);
//   3. checks the bundle still contains every live function of the original
//      preload.js (scripts/preload-manifest.json) modulo documented renames;
//   4. cross-checks every named require() across src/ and shared/ against the
//      target module's exports, so a typo cannot silently become undefined;
//   5. scans the bundle for bare references to identifiers that were moved into
//      the state/hosts objects during the split;
//   6. asserts the bundle has no leftover relative require() (the sandboxed
//      preload can only load 'electron' at runtime).

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { buildPreload } = require('../build.js');

const ROOT = path.join(__dirname, '..');
let failures = 0;

function fail(message) {
  failures += 1;
  console.error(`  FAIL ${message}`);
}

function ok(message) {
  console.log(`  OK   ${message}`);
}

// ---------------------------------------------------------------------------
// 1. Syntax check
// ---------------------------------------------------------------------------

function collectSources() {
  const files = ['build.js'];
  for (const dir of ['src', 'shared', 'scripts']) {
    walk(dir, file => files.push(file));
  }
  return files;
}

function walk(relativeDir, onFile) {
  const absolute = path.join(ROOT, relativeDir);
  if (!fs.existsSync(absolute)) return;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) walk(relative, onFile);
    else if (entry.name.endsWith('.js')) onFile(relative);
  }
}

function checkSyntax(files) {
  let checked = 0;
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) fail(`syntax: ${file}\n${result.stderr}`);
    else checked += 1;
  }
  return checked;
}

// ---------------------------------------------------------------------------
// 2. Build (single pipeline shared with npm start / predist: build.js)
// ---------------------------------------------------------------------------

async function buildPreloadStep() {
  await buildPreload();
}

// ---------------------------------------------------------------------------
// 3. Function coverage against the original preload
// ---------------------------------------------------------------------------

// Intentional divergence from the original file layout, documented once:
// isUserText existed in the original but nothing ever called it, so it was
// removed as dead code; initializeSettings was renamed to loadSettings when
// the settings-load block became the settings module.
const KNOWN_DEAD = new Set(['isUserText']);
const KNOWN_RENAMES = new Map([['initializeSettings', 'loadSettings']]);

function checkFunctionCoverage() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'preload-manifest.json'), 'utf8'));
  const bundle = fs.readFileSync(path.join(ROOT, 'dist-js', 'preload.js'), 'utf8');
  const base = name => name.replace(/\d+$/, '');
  const present = new Set([...bundle.matchAll(/function ([A-Za-z_$][\w$]*)\s*\(/g)].map(match => base(match[1])));
  let missing = 0;
  for (const name of manifest) {
    if (KNOWN_DEAD.has(name)) continue;
    const covered = present.has(name) || (KNOWN_RENAMES.has(name) && present.has(KNOWN_RENAMES.get(name)));
    if (!covered) {
      missing += 1;
      fail(`function ${name} is missing from dist-js/preload.js`);
    }
  }
  return missing;
}

// ---------------------------------------------------------------------------
// 4. Named require coverage
// ---------------------------------------------------------------------------

const EXTERNAL_REQUIRES = new Set(['electron', 'electron-updater', 'esbuild']);

function resolveRequire(fromFile, specifier) {
  const absolute = path.resolve(path.dirname(fromFile), specifier);
  if (fs.existsSync(absolute)) return absolute;
  if (fs.existsSync(`${absolute}.js`)) return `${absolute}.js`;
  return null;
}

function exportsOf(targetFile) {
  if (!targetFile) return null;
  const source = fs.readFileSync(targetFile, 'utf8');
  const match = source.match(/module\.exports\s*=\s*\{([\s\S]*?)\};/);
  if (!match) return null;
  return new Set([...match[1].matchAll(/\b([A-Za-z_$][\w$]*)\b/g)].map(item => item[1]));
}

function checkImportCoverage(files) {
  let checked = 0;
  const destructurePattern = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(\s*(['"])([^'"]+)\2\s*\)/g;
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = destructurePattern.exec(source)) !== null) {
      const specifier = match[3];
      if (EXTERNAL_REQUIRES.has(specifier) || specifier.startsWith('node:')) continue;
      const target = resolveRequire(file, specifier);
      if (!target) {
        fail(`${file}: cannot resolve require('${specifier}')`);
        continue;
      }
      const exported = exportsOf(target);
      if (!exported) {
        fail(`${file}: imports from ${specifier} which has no module.exports object`);
        continue;
      }
      for (const name of match[1].matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
        if (name[1] === 'require') continue;
        if (!exported.has(name[1])) {
          fail(`${file}: imports ${name[1]} from ${specifier} which ${path.relative(ROOT, target)} does not export`);
        }
        checked += 1;
      }
    }
  }
  return checked;
}

// ---------------------------------------------------------------------------
// 5. Bare state/hosts references in the bundle
// ---------------------------------------------------------------------------

const STATE_HOST_FIELDS = [
  'hideArtistTools', 'hideNearbyEvents', 'blockAudioAds', 'discordRpc',
  'discordClientId', 'autoStart', 'startMinimized', 'accentColor',
  'savedAccentColor', 'playbackVisualization', 'animations',
  'respectSystemMotion', 'settingsLoaded', 'showYourLikesButton',
  'artworkRadii', 'savedArtworkRadii', 'appLanguage', 'languageSavePending',
  'insightsHiddenUntil', 'insightsLayout', 'pageScope', 'panelHost',
  'updateHost', 'likesShuffleHost', 'visualizationHost', 'insightsHost',
  'insightsBanner'
];

// Tokenises the bundle once and returns a per-character mask: 1 marks real
// JavaScript code, 0 marks comments, string contents and template literal
// text. Template interpolations `${...}` are code (so a bare reference inside
// one is still reported); regex literals are recognised with the usual
// heuristic (a `/` starts a regex after an expression-shaped token or after
// keywords like `return`/`typeof`).
const REGEX_CONTEXT = new Set('(,=:;!&|?+-*%^~<>[{}\\0'.split(''));

function buildCodeMask(source) {
  const mask = Buffer.alloc(source.length, 0);
  const stack = []; // 'template' | 'interp'
  let mode = 'code';
  let paren = 0; // bracket depth inside a `${...}` interpolation
  let prev = '\0'; // previous significant character, only in code mode
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (mode === 'code') {
      // Dispatch to a non-code mode first; the opening punctuation stays
      // masked so it never leaks into the code text as a bogus surrounding
      // character (a lone '/' from a `//` comment must not be seen as the
      // previous significant char of an object key on the next line).
      if (ch === '/' && source[i + 1] === '/') { mode = 'line-comment'; i += 2; continue; }
      if (ch === '/' && source[i + 1] === '*') { mode = 'block-comment'; i += 2; continue; }
      if (ch === '"') { mode = 'double'; i += 1; continue; }
      if (ch === "'") { mode = 'single'; i += 1; continue; }
      if (ch === '`') { stack.push('template'); mode = 'template'; i += 1; continue; }
      if (ch === '/' && (REGEX_CONTEXT.has(prev) ||
          /\b(?:return|typeof|instanceof|in|of|case|delete|void|do|else|throw|new)\s*$/.test(source.slice(0, i)))) {
        mode = 'regex'; i += 1; continue;
      }
      if (ch === '}' && stack[stack.length - 1] === 'interp' && paren === 0) {
        stack.pop(); mode = 'template'; i += 1; continue;
      }
      mask[i] = 1;
      if (stack[stack.length - 1] === 'interp') {
        if (ch === '{' || ch === '(' || ch === '[') paren += 1;
        else if ((ch === '}' || ch === ')' || ch === ']') && paren > 0) paren -= 1;
      }
      if (!/\s/.test(ch)) prev = ch;
      i += 1;
      continue;
    }
    mask[i] = 0;
    if (mode === 'line-comment') {
      if (ch === '\n') mode = 'code';
      i += 1;
    } else if (mode === 'block-comment') {
      if (ch === '*' && source[i + 1] === '/') { mode = 'code'; i += 2; }
      else i += 1;
    } else if (mode === 'single' || mode === 'double') {
      const quote = mode === 'single' ? "'" : '"';
      if (ch === '\\') i += 2;
      else if (ch === quote) { mode = 'code'; i += 1; }
      else i += 1;
    } else if (mode === 'template') {
      if (ch === '\\') i += 2;
      else if (ch === '`') { stack.pop(); mode = 'code'; i += 1; }
      else if (ch === '$' && source[i + 1] === '{') { stack.push('interp'); paren = 0; mode = 'code'; i += 2; }
      else i += 1;
    } else if (mode === 'regex') {
      if (ch === '\\') i += 2;
      else if (ch === '[') {
        i += 1;
        while (i < source.length) {
          if (source[i] === '\\') i += 2;
          else if (source[i] === ']') { i += 1; break; }
          else i += 1;
        }
      }
      else if (ch === '/') { mode = 'code'; i += 1; }
      else i += 1;
    }
  }
  return mask;
}

function checkNoBareRefs() {
  const source = fs.readFileSync(path.join(ROOT, 'dist-js', 'preload.js'), 'utf8');
  const mask = buildCodeMask(source);
  // One-to-one text where only code characters survive; newlines are kept so
  // the reported line numbers match the real bundle.
  const codeText = Array.from(
    source,
    (ch, index) => (mask[index] ? ch : ch === '\n' ? '\n' : ' ')
  ).join('');
  // The bundle is scanned occurrence-by-occurrence, not line-by-line: one
  // legitimate `state.hideArtistTools` on a line must not excuse a bare
  // `return hideArtistTools;` on the same line. An occurrence is legitimate
  // only when it is a property access (anything.field, e.g.
  // state.hideArtistTools / hosts.insightsBanner / settings.accentColor) or
  // an object key (`hideArtistTools: ...` in state.js / settings-schema).
  // Anything else — return, condition, assignment target, argument, operator
  // operand, `${...}` interpolation, shorthand `{ hideArtistTools }` — is a
  // bare reference to an identifier that must live in state/hosts.
  const fieldPattern = STATE_HOST_FIELDS
    .map(field => field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  // Line lookup and neighbour characters are done without copying the string
  // per match, so the scan stays linear even on a large bundle.
  const lineStarts = [0];
  for (let k = 0; k < source.length; k += 1) if (source[k] === '\n') lineStarts.push(k + 1);
  const lineOf = index => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  const SIGNIFICANT_SCAN = 8192;
  let suspects = 0;
  const re = new RegExp('\\b(' + fieldPattern + ')\\b', 'g');
  let match;
  while ((match = re.exec(codeText)) !== null) {
    const field = match[1];
    let previousSignificant = null;
    for (let j = match.index - 1; j >= 0 && j >= match.index - SIGNIFICANT_SCAN; j -= 1) {
      if (!/\s/.test(codeText[j])) { previousSignificant = codeText[j]; break; }
    }
    let nextSignificant = null;
    for (let j = match.index + field.length; j < codeText.length && j <= match.index + field.length + SIGNIFICANT_SCAN; j += 1) {
      if (!/\s/.test(codeText[j])) { nextSignificant = codeText[j]; break; }
    }
    if (previousSignificant === '.') continue;
    if (nextSignificant === ':' && (previousSignificant === '{' || previousSignificant === ',')) continue;
    suspects += 1;
    fail(`dist-js/preload.js:${lineOf(match.index)}: bare ${field}`);
  }
  return suspects;
}

// ---------------------------------------------------------------------------
// 6. No relative require() inside the bundle
// ---------------------------------------------------------------------------

function checkBundleRequires() {
  const bundle = fs.readFileSync(path.join(ROOT, 'dist-js', 'preload.js'), 'utf8');
  let issues = 0;
  for (const match of bundle.matchAll(/require\(\s*(['"])([^'"]+)\1\s*\)/g)) {
    const specifier = match[2];
    if (specifier.startsWith('.') || specifier.startsWith('../') || specifier.startsWith('./')) {
      issues += 1;
      fail(`dist-js/preload.js: leftover relative require('${specifier}')`);
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------

async function main() {
  console.log('check-consistency');
  console.log('  syntax…');
  const files = collectSources();
  const checked = checkSyntax(files);
  ok(`node --check on ${checked} sources`);

  console.log('  build…');
  try {
    await buildPreloadStep();
    const bundleResult = spawnSync(process.execPath, ['--check', 'dist-js/preload.js'], { encoding: 'utf8' });
    if (bundleResult.status !== 0) fail(`bundle syntax\n${bundleResult.stderr}`);
    else ok('dist-js/preload.js built and parses');
  } catch (error) {
    fail(`esbuild: ${error.message}`);
  }

  console.log('  coverage…');
  if (checkFunctionCoverage() === 0) ok('all live preload functions present in the bundle');

  console.log('  imports…');
  const importsChecked = checkImportCoverage(files);
  ok(`${importsChecked} named imports resolved against target exports`);

  console.log('  bundle…');
  if (checkNoBareRefs() === 0) ok('no bare state/hosts references');
  if (checkBundleRequires() === 0) ok('no relative require() in the bundle');

  if (failures > 0) {
    console.error(`\ncheck-consistency: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log('\ncheck-consistency: all checks passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});