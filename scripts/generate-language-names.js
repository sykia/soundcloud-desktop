'use strict';

// Build once with the local ICU data. The renderer reads a static mapping and
// does not spend time constructing DisplayNames for every page.
const fs = require('node:fs');
const path = require('node:path');
const names = {};
for (const source of ['en', 'it', 'es']) {
  const from = new Intl.DisplayNames([source], { type: 'language' });
  const russian = new Intl.DisplayNames(['ru'], { type: 'language' });
  const mapping = {};
  for (let first = 97; first <= 122; first++) {
    for (let second = 97; second <= 122; second++) {
      const code = String.fromCharCode(first, second);
      const label = from.of(code);
      const translation = russian.of(code);
      if (label === code || translation === code || !/[a-zá-ÿ]/i.test(label)) continue;
      mapping[label.toLocaleLowerCase(source)] = translation[0].toLocaleUpperCase('ru') + translation.slice(1);
    }
  }
  names[source] = Object.fromEntries(Object.entries(mapping).sort(([a], [b]) => a.localeCompare(b, source)));
}
fs.writeFileSync(path.join(__dirname, '../shared/localization-language-names.json'),
  `${JSON.stringify(names, null, 2)}\n`);
