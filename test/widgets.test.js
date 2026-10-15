// The "GeoSphere weather" widget: within the core budget (the SDK's own
// validator), localized, in metric and US units, honest when data is missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY, buildWeatherContent } from '../src/widgets.js';
import { NOW, warningsAround } from './helpers/fakeGeoSphere.js';
import { createWorld } from './helpers/world.js';

const get = async (world, language = 'en', units = 'metric') => {
  const ack = await world.gladys.fake.widgetGet(WIDGET_KEY, { language, units });
  assert.equal(ack.success, true);
  return ack.data.content;
};
const ofType = (content, type) => content.components.filter((c) => c.type === type);

test('the full content fits the budget and renders exactly as sent', async () => {
  const world = await createWorld({ connect: false });
  world.geosphere.answers.warnings = warningsAround(NOW, [
    { start: -1, end: 5 },
    { start: 6, end: 9, level: 2 },
    { start: -2, end: 2, level: 3 },
  ]);
  await world.gladys.connect();
  await world.app.ready;
  for (const language of ['en', 'fr', 'de', 'es']) {
    for (const units of ['metric', 'us']) {
      const content = await get(world, language, units);
      assert.deepEqual(validateWidgetContent(content), [], `${language}/${units}`);
      assert.ok(content.components.length <= 8);
    }
  }
  const content = await get(world, 'fr');
  assert.equal(ofType(content, 'text')[0].text, 'Maison');
  assert.deepEqual(
    ofType(content, 'value').map((tile) => [tile.label, tile.value, tile.unit]),
    [
      ['Température', 8.6, '°C'],
      ['Rafales', 11.2, 'km/h'],
    ],
  );
  const [chart] = ofType(content, 'chart');
  assert.equal(chart.series[0].points.length, 24);
  const [status] = ofType(content, 'status');
  assert.deepEqual(
    status.items.map((item) => item.label),
    [
      'Rouge · Verglas',
      'Jaune · Canicule',
      'Orange · Orage',
      'Maintenant',
      '24 prochaines h',
      'Demain',
    ],
  );
  assert.equal(status.items[0].color, 'danger');
  assert.match(status.items[0].value, /^jusqu'à \d\d:\d\d$/);
  assert.match(status.items[2].value, /^à partir de \d\d:\d\d$/);
  assert.equal(status.items[4].value, '3,5 – 14,5 °C · 0,3 mm');
  assert.match(ofType(content, 'text').at(-1).text, /^Source : GeoSphere Austria · \d\d:\d\d$/);
  await world.app.stop();
});

test('US units: Fahrenheit, mph and inches', async () => {
  const world = await createWorld();
  const content = await get(world, 'en', 'us');
  assert.deepEqual(
    ofType(content, 'value').map((tile) => [tile.value, tile.unit]),
    [
      [47.5, '°F'],
      [7, 'mph'],
    ],
  );
  assert.equal(ofType(content, 'status')[0].items.at(-1).value, '38.3 – 56.8 °F · 0.17 in');
  await world.app.stop();
});

test('no warning: one green line', async () => {
  const world = await createWorld();
  const [status] = ofType(await get(world, 'de'), 'status');
  assert.deepEqual(status.items[0], {
    label: 'Warnungen',
    value: 'Keine',
    color: 'success',
    icon: 'check-circle',
  });
  await world.app.stop();
});

test('not configured, or nothing read yet: a sentence instead of an empty card', async () => {
  const world = await createWorld({ houses: [] });
  const content = await get(world, 'es');
  assert.deepEqual(validateWidgetContent(content), []);
  assert.match(content.components[0].text, /Ningún lugar/);
  await world.app.stop();

  const waiting = buildWeatherContent(
    {
      target: { station: null, place: { name: 'X', lat: 47, lon: 15 } },
      observation: null,
      forecast: null,
      warnings: null,
    },
    { language: 'fr', units: 'metric', now: NOW },
  );
  assert.match(waiting.components[0].text, /En attente/);
});

test('a refresh that changes what the widget shows nudges it; an identical one does not', async () => {
  const world = await createWorld();
  const nudges = () => world.gladys.fake.widgetRefreshes.length;
  const before = nudges();
  world.geosphere.answers.current = (() => {
    const recorded = world.geosphere.answers.current;
    return (url) => {
      const answer = recorded(url);
      answer.timestamps = ['2026-10-14T10:00+00:00'];
      return answer;
    };
  })();
  await world.refresh(10);
  const after = nudges();
  await world.refresh(1);
  assert.equal(nudges(), after);
  assert.ok(after >= before);
  await world.app.stop();
});
