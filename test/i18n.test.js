// -----------------------------------------------------------------------------
// Every text Gladys shows exists in the four languages of its interface
// (English, French, German, Spanish): the manifest, the tables of the code and
// the documentation. German says "du", never the polite "Sie"; Spanish says
// "usted".
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES } from '../src/config.js';
import {
  ACTION_TEXT,
  FEATURE_NAMES,
  SYMBOL_NAMES,
  TEXT,
  WARNING_LEVEL_NAMES,
  WARNING_TYPE_NAMES,
  WIDGET_TEXT,
} from '../src/i18n.js';
import { PLACE_FEATURES, STATION_FEATURES } from '../src/devices.js';
import { WARNING_TYPE_KEYS } from '../src/geosphere/model.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const LANGS = ['en', 'fr', 'de', 'es'];
const POLITE_GERMAN = /(?<!\p{L})(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)(?!\p{L})/u;
// Informal Spanish pronouns: Guilhem's integrations say "usted". (The verbs
// are left out: "usa" is also the third person the formal register uses.)
const INFORMAL_SPANISH = /(?<!\p{L})(tú|tu|tus|contigo)(?!\p{L})/iu;

// Upper bounds, in characters: what the Gladys interface shows without cutting.
const MAX = {
  catalog: 100,
  widgetLabel: 30,
  label: 60,
  placeholder: 60,
  description: 300,
  message: 200,
  short: 24,
  featureName: 40,
  status: 40,
};

const sorted = (keys) => [...keys].sort();

/** Checks one multi-language object; returns its problems. */
function problems(value, path, max) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [`${path} must be a multi-language object`];
  }
  const found = [];
  if (JSON.stringify(sorted(Object.keys(value))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${path} has [${Object.keys(value)}], expected exactly [${LANGS}]`);
  }
  for (const [lang, text] of Object.entries(value)) {
    found.push(...textProblems(text, `${path}.${lang}`, lang, max));
  }
  return found;
}

function textProblems(text, path, lang, max) {
  if (typeof text !== 'string' || text.trim() === '') {
    return [`${path} is empty`];
  }
  const found = [];
  if (text.length > max) {
    found.push(`${path} has ${text.length} characters (${max} at most)`);
  }
  if (lang === 'de' && POLITE_GERMAN.test(text)) {
    found.push(`${path} uses the polite form: "${text}"`);
  }
  if (lang === 'es' && INFORMAL_SPANISH.test(text)) {
    found.push(`${path} uses the informal form: "${text}"`);
  }
  return found;
}

/** Every multi-language object of the manifest, with its length limit. */
function manifestTexts(root) {
  const texts = [];
  const walk = (value, path, key) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, key));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    const isText =
      ['label', 'description', 'placeholder'].includes(key) ||
      Object.keys(value).some((child) => LANGS.includes(child));
    if (isText) {
      // The store schema caps the catalog and widget descriptions, and widget
      // labels; a section text may hold 1000 characters.
      const max =
        path === 'manifest.description' || /^manifest\.widgets\[\d+\]\.description$/.test(path)
          ? MAX.catalog
          : /^manifest\.widgets\[\d+\]\.label$/.test(path)
            ? MAX.widgetLabel
            : /^manifest\.config_schema\[0\]\.description$/.test(path)
              ? 1000
              : (MAX[key] ?? MAX.label);
      texts.push({ path, value, max });
      return;
    }
    for (const [child, item] of Object.entries(value)) {
      walk(item, `${path}.${child}`, child);
    }
  };
  walk(root, 'manifest', null);
  return texts;
}

// Tables written one language at a time: same keys everywhere, no empty text.
function tableProblems(table, name, max, render = (value) => value) {
  const found = [];
  if (JSON.stringify(sorted(Object.keys(table))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${name} has [${Object.keys(table)}], expected exactly [${LANGS}]`);
  }
  for (const lang of LANGS) {
    const entries = table[lang] ?? {};
    if (
      JSON.stringify(sorted(Object.keys(entries))) !== JSON.stringify(sorted(Object.keys(table.en)))
    ) {
      found.push(`${name}.${lang} does not have the keys of ${name}.en`);
    }
    for (const [key, value] of Object.entries(entries)) {
      const limit = typeof max === 'function' ? max(key) : max;
      found.push(...textProblems(render(value), `${name}.${lang}.${key}`, lang, limit));
    }
  }
  return found;
}

test('the configuration offers the four languages, French by default', () => {
  assert.deepEqual(LANGUAGES, LANGS);
  const field = manifest.config_schema.find((entry) => entry.key === 'language');
  assert.deepEqual(
    field.options.map((option) => option.value),
    LANGS,
  );
  assert.equal(field.default, 'fr');
});

test('every text of the manifest is in English, French, German and Spanish', () => {
  const texts = manifestTexts(manifest);
  assert.ok(texts.length >= 50, `only ${texts.length} texts found in the manifest`);
  const found = texts.flatMap(({ path, value, max }) => problems(value, path, max));
  assert.deepEqual(found, []);
});

test('the name is the same in every language, and the catalog text is 10 to 100 characters', () => {
  assert.equal(typeof manifest.name, 'string');
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  for (const lang of LANGS) {
    assert.ok(manifest.description[lang].length >= 10, `description.${lang} is too short`);
  }
});

test('every feature has a name in every language', () => {
  assert.deepEqual(tableProblems(FEATURE_NAMES, 'FEATURE_NAMES', MAX.featureName), []);
  assert.deepEqual(
    sorted(Object.keys(FEATURE_NAMES.en)),
    sorted([...Object.keys(STATION_FEATURES), ...Object.keys(PLACE_FEATURES)]),
  );
});

test('warning types and levels, weather symbols, widget texts: four languages', () => {
  assert.deepEqual(tableProblems(WARNING_TYPE_NAMES, 'WARNING_TYPE_NAMES', MAX.short), []);
  assert.deepEqual(
    sorted(Object.keys(WARNING_TYPE_NAMES.en)),
    sorted([...WARNING_TYPE_KEYS, 'other']),
  );
  assert.deepEqual(tableProblems(WARNING_LEVEL_NAMES, 'WARNING_LEVEL_NAMES', MAX.short), []);
  assert.deepEqual(tableProblems(SYMBOL_NAMES, 'SYMBOL_NAMES', MAX.status), []);
  assert.equal(Object.keys(SYMBOL_NAMES.en).length, 32);
  // Tile labels are 24 characters at most; the sentences go in a body text.
  const long = new Set(['notConfigured', 'waiting', 'forecastChart', 'source']);
  assert.deepEqual(
    tableProblems(WIDGET_TEXT, 'WIDGET_TEXT', (key) => (long.has(key) ? MAX.message : MAX.short)),
    [],
  );
});

test('every message of the code has the four languages', () => {
  const found = Object.entries(TEXT).flatMap(([key, value]) =>
    problems(value, `TEXT.${key}`, MAX.message),
  );
  assert.deepEqual(found, []);
  const station = {
    id: '11035',
    label: 'Wien/Hohe Warte',
    state: 'Wien',
    altitude: 198,
    distance: '2,1',
  };
  const render = (value) =>
    typeof value === 'function'
      ? value(...{ 0: [], 1: ['x'], 2: ['x', 'y'], 3: ['x', 1, 'y'] }[value.length])
      : value;
  const rendered = { en: {}, fr: {}, de: {}, es: {} };
  for (const lang of LANGS) {
    for (const [key, value] of Object.entries(ACTION_TEXT[lang])) {
      rendered[lang][key] = key === 'station' ? value(station) : render(value);
    }
  }
  assert.deepEqual(tableProblems(rendered, 'ACTION_TEXT', MAX.message), []);
});

test('the guard catches a missing language, an empty text and the wrong form of address', () => {
  assert.equal(problems({ en: 'Rain', fr: 'Pluie', de: 'Regen' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'Rain', fr: 'Pluie', de: '', es: 'Lluvia' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a', es: 'a', it: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a'.repeat(61), es: 'a' }, 'x', 60).length, 1);
  for (const polite of [
    'Wählen Sie',
    'Ihr Zuhause',
    'Ihre Station',
    'mit Ihrem',
    'Ihren',
    'Ihrer',
    'Ihres',
  ]) {
    assert.equal(problems({ en: 'a', fr: 'a', de: polite, es: 'a' }, 'x', 60).length, 1, polite);
  }
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a', es: 'Elige tu casa' }, 'x', 60).length, 1);
  // Words that only contain the letters stay allowed.
  assert.deepEqual(
    problems({ en: 'a', fr: 'a', de: 'Siebenschläfer, ihre', es: 'Usted' }, 'x', 60),
    [],
  );
  // A manifest text forgotten in German is found.
  const forgotten = structuredClone(manifest);
  delete forgotten.scene_triggers[0].label.de;
  const found = manifestTexts(forgotten).flatMap(({ path, value, max }) =>
    problems(value, path, max),
  );
  assert.deepEqual(found, [
    'manifest.scene_triggers[0].label has [en,fr,es], expected exactly [en,fr,de,es]',
  ]);
});

// --- Documentation -----------------------------------------------------------

const docs = Object.fromEntries(
  await Promise.all(
    LANGS.map(async (lang) => [
      lang,
      await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8'),
    ]),
  ),
);
const outline = (markdown) =>
  markdown
    .split('\n')
    .filter((line) => /^#{1,3} /.test(line))
    .map((line) => line.match(/^#+/)[0].length);

test('the four documentations exist and have the same sections', () => {
  const reference = outline(docs.en);
  assert.ok(reference.filter((level) => level === 2).length >= 8, 'docs/en.md lacks sections');
  for (const lang of LANGS) {
    assert.deepEqual(outline(docs[lang]), reference, `docs/${lang}.md does not follow docs/en.md`);
    assert.ok(docs[lang].length >= 300, `docs/${lang}.md is too short for the store`);
    assert.match(docs[lang], /GeoSphere Austria/);
  }
});

test('the documentations name every feature, the trigger and the widget', () => {
  for (const lang of LANGS) {
    for (const name of Object.values(FEATURE_NAMES[lang])) {
      assert.ok(docs[lang].includes(name), `docs/${lang}.md does not mention "${name}"`);
    }
    for (const entry of [...manifest.scene_triggers, ...manifest.widgets, ...manifest.actions]) {
      assert.ok(
        docs[lang].includes(entry.label[lang]),
        `docs/${lang}.md lacks "${entry.label[lang]}"`,
      );
    }
  }
});

test('the German documentation says "du", the Spanish one "usted"', () => {
  const german = docs.de.replace(/`[^`]*`/g, '');
  assert.doesNotMatch(german, POLITE_GERMAN);
  assert.doesNotMatch(docs.es.replace(/`[^`]*`/g, ''), INFORMAL_SPANISH);
});
