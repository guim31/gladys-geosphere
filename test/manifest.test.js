// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTIONS } from '../src/app.js';
import { DEFAULT_CONFIG, REFRESH_CHOICES } from '../src/config.js';
import { WARNING_LEVEL_KEYS, WARNING_TYPE_KEYS } from '../src/geosphere/model.js';
import { WARNING_TRIGGER } from '../src/service.js';
import { WIDGET_KEY } from '../src/widgets.js';
import { createWorld } from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest can declare (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

// The handlers the integration actually registers on the SDK.
const { gladys: registered, app } = await createWorld({ connect: false });
await app.stop();
const handlerKeys = (prefix) =>
  Object.keys(registered.handlers)
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

// Minimum version of the manifest `gladys_version` range, e.g. [5, 2, 0].
function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('the handlers registered match the manifest: actions, widget, no scene action', () => {
  assert.deepEqual(handlerKeys('action:').sort(), keysOf(manifest.actions).sort());
  assert.deepEqual(Object.values(ACTIONS).sort(), keysOf(manifest.actions).sort());
  assert.deepEqual(keysOf(manifest.widgets), [WIDGET_KEY]);
  assert.deepEqual(handlerKeys('widget:'), [WIDGET_KEY]);
  assert.equal(manifest.scene_actions, undefined);
  assert.deepEqual(handlerKeys('sceneAction:'), []);
});

test('the only scene trigger is the one the code fires, with the type and level keys of the code', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers), [WARNING_TRIGGER]);
  const [trigger] = manifest.scene_triggers;
  const options = (key) =>
    trigger.fields.find((field) => field.key === key).options.map((o) => o.value);
  assert.deepEqual(options('warning_type'), WARNING_TYPE_KEYS);
  assert.deepEqual(options('level'), WARNING_LEVEL_KEYS);
});

test('read-only integration: no command handler', () => {
  assert.equal(registered.handlers.setValue, undefined);
});

test('Gladys version: 5.2.0 at least (house select), and the capability fields', () => {
  // `source: "houses"` is accepted from 5.2.0 on; widgets and scene triggers
  // from 5.1.0; categories from 4.86.0. An older core rejects the manifest.
  assert.ok(allFields.some((field) => field.source === 'houses'));
  assert.ok(isAtLeast(minGladysVersion(), [5, 2, 0]), manifest.gladys_version);
  assert.equal(manifest.location, true, 'getHouses() needs location: true');
});

test('catalog: one category of the store vocabulary, cloud transport only', () => {
  assert.deepEqual(manifest.categories, ['environment']);
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.equal(manifest.name, 'GeoSphere Austria');
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.type === 'section') {
      continue;
    }
    assert.ok(field.key in DEFAULT_CONFIG, `DEFAULT_CONFIG lacks ${field.key}`);
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `DEFAULT_CONFIG.${field.key}`);
    }
  }
  const refresh = manifest.config_schema.find((field) => field.key === 'refresh_minutes');
  assert.deepEqual(
    refresh.options.map((option) => option.value),
    REFRESH_CHOICES,
  );
});

test('no secret, no number field (decimals are typed in strings), no field without label', () => {
  for (const field of allFields) {
    assert.notEqual(field.type, 'secret', field.key);
    assert.notEqual(
      field.type,
      'number',
      `${field.key}: a number field refuses decimals on some cores`,
    );
    assert.ok(field.label?.en, `${field.key} needs a label`);
  }
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((f) => f.type === 'section');
  for (const section of sections) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    assert.equal(section.placeholder, undefined);
    assert.ok(!(section.key in DEFAULT_CONFIG));
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('dynamic selects declare a source and no static options', () => {
  for (const field of allFields.filter((f) => f.source !== undefined)) {
    assert.ok(['devices', 'houses'].includes(field.source));
    assert.equal(field.options, undefined, `field "${field.key}": source and options together`);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  // The Release workflow writes all three: a mismatch means one was edited by
  // hand, and Gladys would offer a version whose image is another one.
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.equal(manifest.docker_image, `ghcr.io/guim31/gladys-geosphere:${manifest.version}`);
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${lang} has ${text.length} characters`,
    );
  }
});

test('field placeholders are multi-language objects', () => {
  for (const field of allFields.filter((f) => f.placeholder !== undefined)) {
    assert.equal(typeof field.placeholder, 'object', `field "${field.key}": placeholder`);
    assert.ok(field.placeholder.en, `field "${field.key}": placeholder needs an English text`);
  }
});
