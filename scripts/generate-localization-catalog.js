'use strict';

// Offline by default. A paid compatible API is used only with explicit --api.
// Observations: JSONL {source,text,page,role}. --reviewed accepts local JSON.
const fs = require('node:fs');
const path = require('node:path');
const { state } = require('../src/preload/state.js');
const { translatedValue } = require('../src/preload/localization-dict.js');
const { catalogValue } = require('../src/preload/localization-catalog.js');
const { cleanObservation, validEntry, observationKey, mergeCatalog } = require('./localization-catalog-core.js');

const root = path.join(__dirname, '..');
const catalogPath = process.env.LOCALIZATION_CATALOG_PATH || path.join(root, 'shared/localization-catalog.json');
const candidatePath = process.env.LOCALIZATION_CANDIDATES_PATH || path.join(root, 'shared/localization-candidates.json');

function argsOf(argv) {
  const flags = new Set(argv.filter(arg => arg.startsWith('--')));
  const reviewedIndex = argv.indexOf('--reviewed');
  return {
    input: argv.find((arg, index) => !arg.startsWith('--') &&
      (reviewedIndex < 0 || index !== reviewedIndex + 1)),
    reviewed: reviewedIndex < 0 ? undefined : argv[reviewedIndex + 1],
    write: flags.has('--write'),
    api: flags.has('--api'),
    draft: flags.has('--draft')
  };
}

function readObservations(file) {
  const unique = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)) {
    const observation = cleanObservation(JSON.parse(line));
    if (observation) unique.set(observationKey(observation), observation);
  }
  return [...unique.values()];
}

async function ask(messages) {
  const endpoint = process.env.LOCALIZATION_API_URL || 'https://api.openai.com/v1/chat/completions';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: process.env.LOCALIZATION_MODEL || 'gpt-4.1-mini', temperature: 0,
      response_format: { type: 'json_object' }, messages })
  });
  if (!response.ok) throw new Error(`Localization API returned ${response.status}`);
  const body = await response.json();
  return JSON.parse(body.choices[0].message.content);
}

async function suggestWithApi(observations) {
  if (!process.env.OPENAI_API_KEY) throw new Error('--api requires OPENAI_API_KEY');
  const proposed = [];
  for (let offset = 0; offset < observations.length; offset += 30) {
    const batch = observations.slice(offset, offset + 30).map(item => ({ ...item,
      current: catalogValue(item.text, null, item.source, item.page, item.role) || null }));
    const draft = await ask([
      { role: 'system', content: 'Localize SoundCloud UI into natural Russian using the page and role. Improve an existing translation when it is literal or inaccurate. For user content return null. Preserve product names, numbers and {user} unchanged. Reply JSON {"items":[{"ru":string|null}]} in input order.' },
      { role: 'user', content: JSON.stringify(batch) }
    ]);
    if (!Array.isArray(draft.items) || draft.items.length !== batch.length) throw new Error('Unexpected draft size');
    const review = await ask([
      { role: 'system', content: 'Independently audit these SoundCloud Russian UI translations. Reject awkward, literal, wrong-context, or user-content translations. Fix accepted translations if needed. Reply JSON {"items":[{"accept":boolean,"ru":string|null}]} in input order.' },
      { role: 'user', content: JSON.stringify(batch.map((item, i) => ({ ...item, proposed: draft.items[i].ru }))) }
    ]);
    if (!Array.isArray(review.items) || review.items.length !== batch.length) throw new Error('Unexpected review size');
    batch.forEach((item, index) => {
      const result = review.items[index];
      if (result.accept && validEntry(result, item)) proposed.push({ source: item.source, text: item.text,
        ru: result.ru.trim(), pages: [item.page], roles: [item.role] });
    });
  }
  return proposed;
}

async function suggestOffline(observations, draftUnknown = false) {
  const accepted = [];
  const drafts = [];
  let translator;
  try {
    if (draftUnknown) {
      const { createTranslator } = require('../src/main/auto-translate.js');
      translator = await createTranslator(path.join(root, 'build'));
    }
    for (const item of observations) {
      state.pageScope = item.page;
      const ru = catalogValue(item.text, null, item.source, item.page, item.role) || translatedValue(item.text);
      const entry = { source: item.source, text: item.text, ru: ru || '',
        pages: [item.page], roles: [item.role] };
      if (ru && validEntry(entry, item)) accepted.push(entry);
      else {
        if (translator && !/\{(?:user|count)\}/.test(item.text)) {
          try {
            const result = await translator.translate({ from: item.source, to: 'ru', text: item.text, html: false });
            entry.ru = result.target.text.trim();
          } catch { /* Keep the candidate for review even if a local model fails. */ }
        }
        drafts.push({ ...entry, status: 'needs-context-review' });
      }
    }
  } finally {
    translator?.delete();
  }
  return { accepted, drafts };
}

async function main(argv = process.argv.slice(2)) {
  const options = argsOf(argv);
  if (!options.input && !argv.includes('--reviewed')) {
    throw new Error('Usage: node scripts/generate-localization-catalog.js observations.jsonl [--write] [--api] [--reviewed entries.json]');
  }
  const current = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  let accepted = [];
  let drafts = [];
  if (options.input) {
    const observations = readObservations(options.input);
    if (options.api) accepted = await suggestWithApi(observations);
    else ({ accepted, drafts } = await suggestOffline(observations, options.draft));
  }
  if (argv.includes('--reviewed')) {
    if (!options.reviewed || options.reviewed.startsWith('--')) throw new Error('--reviewed requires a JSON path');
    const reviewed = JSON.parse(fs.readFileSync(options.reviewed, 'utf8'));
    for (const entry of reviewed) {
      const source = { source: entry.source, text: entry.text,
        page: entry.pages?.[0] || 'other', role: entry.roles?.[0] || 'text' };
      if (!cleanObservation(source) || !validEntry(entry, source)) throw new Error(`Invalid reviewed entry: ${entry.text}`);
      accepted.push(entry);
    }
  }
  const merged = mergeCatalog(current, accepted);
  if (options.write) fs.writeFileSync(catalogPath, `${JSON.stringify(merged, null, 2)}\n`);
  else fs.writeFileSync(candidatePath, `${JSON.stringify({ accepted, drafts }, null, 2)}\n`);
  process.stdout.write(`${accepted.length} verified; ${drafts.length} need review; ${options.write ? catalogPath : candidatePath}\n`);
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { main, readObservations, suggestOffline };
