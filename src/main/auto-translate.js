'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MODEL_FILES = {
  enru: ['model.enru.intgemm.alphas.bin', 'lex.50.50.enru.s2t.bin', 'vocab.enru.spm'],
  iten: ['model.iten.intgemm.alphas.bin', 'lex.50.50.iten.s2t.bin', 'vocab.iten.spm'],
  esen: ['model.esen.intgemm.alphas.bin', 'lex.50.50.esen.s2t.bin', 'vocab.esen.spm']
};
const SUPPORTED_SOURCES = new Set(['en', 'it', 'es']);
let translatorPromise;
const cache = new Map();

function resourceRoot() {
  return process.resourcesPath && require('electron').app.isPackaged
    ? process.resourcesPath : path.join(__dirname, '../../build');
}

function asArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function createTranslator(root = resourceRoot()) {
  const engine = pathToFileURL(path.join(root, 'translation-engine', 'translator.js')).href;
  const { BatchTranslator, TranslatorBacking } = await import(engine);
  class LocalBacking extends TranslatorBacking {
    async loadModelRegistery() {
      return Object.keys(MODEL_FILES).map(pair => ({ from: pair.slice(0, 2), to: pair.slice(2) }));
    }

    async loadTranslationModel({ from, to }) {
      const pair = `${from}${to}`;
      const names = MODEL_FILES[pair];
      if (!names) throw new Error(`Модель перевода ${pair} недоступна.`);
      const bytes = await Promise.all(names.map(name => fs.readFile(path.join(root, 'translation-model', pair, name))));
      return {
        model: asArrayBuffer(bytes[0]),
        shortlist: asArrayBuffer(bytes[1]),
        vocabs: [asArrayBuffer(bytes[2])],
        config: {}
      };
    }
  }
  const options = { workers: 1, batchSize: 16, pivotLanguage: 'en', cacheSize: 1000 };
  return new BatchTranslator(options, new LocalBacking(options));
}

async function translateLabels(language, values) {
  if (!SUPPORTED_SOURCES.has(language) || !Array.isArray(values) || values.length > 60 ||
      values.some(value => typeof value !== 'string' || value.length > 300) ||
      values.reduce((sum, value) => sum + value.length, 0) > 6000) {
    throw new Error('Invalid translation request');
  }
  if (!translatorPromise) {
    translatorPromise = createTranslator().catch(error => {
      translatorPromise = null;
      throw error;
    });
  }
  const translator = await translatorPromise;
  return Promise.all(values.map(async value => {
    const key = `${language}:${value}`;
    if (cache.has(key)) return cache.get(key);
    const result = await translator.translate({ from: language, to: 'ru', text: value, html: false });
    const translated = result.target.text.trim();
    if (translated && cache.size < 3000) cache.set(key, translated);
    return translated || value;
  }));
}

function teardown() {
  if (translatorPromise) translatorPromise.then(translator => translator.delete()).catch(() => {});
  translatorPromise = null;
}

module.exports = { translateLabels, createTranslator, teardown, SUPPORTED_SOURCES };
