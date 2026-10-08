'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('catalog CLI replaces old translations and repeated writes are identical', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-catalog-test-'));
  try {
    const catalog = path.join(directory, 'catalog.json');
    const reviewed = path.join(directory, 'reviewed.json');
    fs.writeFileSync(catalog, JSON.stringify([{ source: 'it', text: 'Cerca', ru: 'Найти',
      pages: ['feed', 'search'], roles: ['button', 'tab'] }]));
    fs.writeFileSync(reviewed, JSON.stringify([{ source: 'it', text: 'Cerca', ru: 'Поиск',
      pages: ['search'], roles: ['button'] }]));
    const run = () => spawnSync(process.execPath,
      [path.join(__dirname, 'generate-localization-catalog.js'), '--reviewed', reviewed, '--write'],
      { encoding: 'utf8', env: { ...process.env, LOCALIZATION_CATALOG_PATH: catalog } });
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    const bytes = fs.readFileSync(catalog, 'utf8');
    const second = run();
    assert.equal(second.status, 0, second.stderr);
    assert.equal(fs.readFileSync(catalog, 'utf8'), bytes);
    const entries = JSON.parse(bytes);
    assert.equal(entries.length, 4);
    assert.equal(entries.find(e => e.pages[0] === 'search' && e.roles[0] === 'button').ru, 'Поиск');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
