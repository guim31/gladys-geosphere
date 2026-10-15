// -----------------------------------------------------------------------------
// The integration end to end: the SDK's fake Gladys, a simulated GeoSphere
// (recorded answers), a controllable clock. Devices, states, the container's
// own refresh timer, the onPoll fallback, the "new warning" trigger, the logs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/store.js';
import { HEARTBEAT, WARNING_TRIGGER } from '../src/service.js';
import { NOW, warningsAround } from './helpers/fakeGeoSphere.js';
import { HOUSE, createWorld, featureId } from './helpers/world.js';

const PLACE = '4707_1544'; // HOUSE rounded to 0.01°
const STATION = '11290'; // Graz Universität, 1.1 km from HOUSE

const stationFeature = (world, key) => featureId(world.gladys, 'station', STATION, key);
const placeFeature = (world, key) => featureId(world.gladys, 'place', PLACE, key);
const statesOf = (world, featureExternalId) =>
  world.gladys.fake.states.filter(
    (state) => state.device_feature_external_id === featureExternalId,
  );

/** The recorded observation with another temperature. */
function withTemperature(world, temperature) {
  const recorded = world.geosphere.answers.current;
  world.geosphere.answers.current = (url) => {
    const answer = recorded(url);
    answer.features[0].properties.parameters.TL.data = [temperature];
    return answer;
  };
}

test('the house gives two devices: the nearest station, and the place for forecast and warnings', async () => {
  const world = await createWorld();
  const devices = world.gladys.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((device) => [device.name, device.external_id]),
    [
      ['GeoSphere Graz Universitaet', world.gladys.externalIds('station', STATION).device],
      ['GeoSphere Maison', world.gladys.externalIds('place', PLACE).device],
    ],
  );
  assert.deepEqual(world.gladys.fake.connectionStatus, { connected: true });
  // Nothing is published for devices the user has not added.
  assert.equal(world.gladys.fake.states.length, 0);
  await world.app.stop();
});

test('adding the devices publishes their states at once, from what was already read', async () => {
  const world = await createWorld();
  const requests = world.geosphere.requests.length;
  await world.createAll();
  assert.equal(world.geosphere.requests.length, requests, 'no new request');
  const last = (key) => world.gladys.fake.lastState(key);
  assert.equal(last(stationFeature(world, 'temperature')), 8.6);
  assert.equal(last(stationFeature(world, 'wind_gust')), 11.2);
  assert.equal(last(placeFeature(world, 'next24_max')), 14.5);
  assert.equal(last(placeFeature(world, 'tomorrow_precipitation')), 4.2);
  assert.equal(last(placeFeature(world, 'warning_level')), 0);
  const warnings = statesOf(world, placeFeature(world, 'warnings')).at(-1);
  assert.equal(warnings.text, 'Aucun avertissement');
  assert.ok(world.gladys.fake.widgetRefreshes.includes('weather'));
  await world.app.stop();
});

test('the states refresh on the container timer, without any onPoll from the core', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const world = await createWorld({ timers: true });
  await world.createAll();
  withTemperature(world, 9.4);
  const before = world.geosphere.count('current');

  world.clock.now += 10 * 60 * 1000;
  t.mock.timers.tick(10 * 60 * 1000);
  await world.app.poller.idle;

  assert.equal(world.geosphere.count('current'), before + 1);
  assert.equal(world.gladys.fake.lastState(stationFeature(world, 'temperature')), 9.4);
  const polls = world.gladys.fake.wsMessages.filter((message) => /poll/i.test(message.type));
  assert.equal(polls.length, 0, 'the core never polled');
  await world.app.stop();
});

test("the core's onPoll is a fallback: skipped after a recent refresh, used when the timer stalls", async () => {
  const world = await createWorld();
  await world.createAll();
  const [station] = world.gladys.fake.discoveredDevices;
  const before = world.geosphere.count('current');

  assert.deepEqual(await world.gladys.fake.poll(station), { success: true });
  assert.equal(world.geosphere.count('current'), before, 'refreshed recently: skipped');

  world.clock.now += 10 * 60 * 1000;
  withTemperature(world, 7.1);
  await world.gladys.fake.poll(station);
  assert.equal(world.geosphere.count('current'), before + 1);
  assert.equal(world.gladys.fake.lastState(stationFeature(world, 'temperature')), 7.1);

  // A device of another integration (or a stale one) is ignored.
  await world.gladys.fake.poll({ external_id: 'ext:test-integration:station:1' });
  assert.equal(world.geosphere.count('current'), before + 1);
  await world.app.stop();
});

test('only the changes are published, and an unchanged value is re-sent every 6 hours', async (t) => {
  // The SDK dates its heartbeat with the system clock.
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  const world = await createWorld();
  await world.createAll();
  const temperature = stationFeature(world, 'temperature');
  assert.equal(statesOf(world, temperature).length, 1);
  t.mock.timers.setTime(NOW + 10 * 60 * 1000);
  await world.refresh(10);
  assert.equal(statesOf(world, temperature).length, 1, 'unchanged: not sent again');
  t.mock.timers.setTime(NOW + HEARTBEAT + 20 * 60 * 1000);
  world.clock.now += HEARTBEAT;
  await world.refresh(10);
  assert.equal(statesOf(world, temperature).length, 2, 'heartbeat');
  await world.app.stop();
});

test('the forecast is read once an hour, the observation and the warnings every cycle', async () => {
  const world = await createWorld();
  for (let i = 0; i < 6; i += 1) {
    await world.refresh(10);
  }
  assert.equal(world.geosphere.count('current'), 7);
  assert.equal(world.geosphere.count('warnings'), 7);
  assert.equal(world.geosphere.count('forecast'), 2);
  assert.equal(world.geosphere.count('stations'), 1);
  // About 13 requests an hour, far below the published limits.
  assert.ok(world.geosphere.requests.length <= 17);
  await world.app.stop();
});

test('a station silent for hours: its last values are not re-sent as current', async () => {
  const world = await createWorld();
  await world.createAll();
  const recorded = world.geosphere.answers.current;
  world.geosphere.answers.current = (url) => {
    const answer = recorded(url);
    answer.timestamps = ['2026-10-14T05:00+00:00'];
    answer.features[0].properties.parameters.TL.data = [1.5];
    return answer;
  };
  await world.refresh(10);
  assert.equal(world.gladys.fake.lastState(stationFeature(world, 'temperature')), 8.6);
  await world.app.stop();
});

test('the first run only takes note of the warnings in force: no scene event', async () => {
  const world = await createWorld({ connect: false });
  world.geosphere.answers.warnings = warningsAround(NOW, [{ start: -1, end: 5 }]);
  await world.gladys.connect();
  await world.app.ready;
  assert.equal(world.gladys.fake.sceneEvents.length, 0);
  assert.deepEqual(Object.keys((await world.store.load()).seen), ['10']);
  await world.app.stop();
});

test('a new warning fires the trigger with its details, once; a raised level fires again', async () => {
  const world = await createWorld();
  await world.createAll();
  world.geosphere.answers.warnings = warningsAround(NOW, [
    { start: -1, end: 5 }, // heat, yellow, in force
    { start: 6, end: 9, level: 2 }, // thunderstorm, orange, announced
  ]);
  await world.refresh(10);
  const events = world.gladys.fake.sceneEvents;
  assert.equal(events.length, 2);
  assert.ok(events.every((event) => event.key === WARNING_TRIGGER));
  const storm = events.find((event) => event.data.warning_type === 'thunderstorm').data;
  assert.equal(storm.level, 'orange');
  assert.equal(storm.level_number, 2);
  assert.equal(storm.type_label, 'Orage');
  assert.equal(storm.level_label, 'Orange');
  assert.equal(storm.in_force, false);
  assert.equal(storm.is_update, false);
  assert.equal(storm.place, 'Salzburg');
  assert.match(storm.starts_at, /^\d\d:\d\d$/);
  assert.match(storm.description, /Gewitterwarnung/);

  // The states follow the warnings in force.
  assert.equal(world.gladys.fake.lastState(placeFeature(world, 'warning_heat')), 1);
  assert.equal(world.gladys.fake.lastState(placeFeature(world, 'warning_thunderstorm')), 0);
  assert.equal(world.gladys.fake.lastState(placeFeature(world, 'warning_level')), 1);
  assert.match(statesOf(world, placeFeature(world, 'warnings')).at(-1).text, /Jaune · Canicule/);

  // Same warnings: nothing more.
  await world.refresh(10);
  assert.equal(world.gladys.fake.sceneEvents.length, 2);

  // The thunderstorm goes red: fired again, as an update.
  world.geosphere.answers.warnings = warningsAround(NOW, [
    { start: -1, end: 5 },
    { start: 6, end: 9, level: 3 },
  ]);
  await world.refresh(10);
  const raised = world.gladys.fake.sceneEvents.at(-1).data;
  assert.equal(world.gladys.fake.sceneEvents.length, 3);
  assert.deepEqual([raised.level, raised.is_update], ['red', true]);

  // Six hours later the thunderstorm is in force.
  world.clock.now += 6 * 3600 * 1000;
  await world.refresh(1);
  assert.equal(world.gladys.fake.lastState(placeFeature(world, 'warning_thunderstorm')), 3);
  assert.equal(world.gladys.fake.lastState(placeFeature(world, 'warning_level')), 3);
  await world.app.stop();
});

test('a restart does not fire again for the warnings already announced', async () => {
  const store = new MemoryStore();
  const first = await createWorld({ store, connect: false });
  first.geosphere.answers.warnings = warningsAround(NOW, [{ start: -1, end: 5 }]);
  await first.gladys.connect();
  await first.app.ready;
  assert.equal(first.gladys.fake.sceneEvents.length, 0, 'baseline run');
  first.geosphere.answers.warnings = warningsAround(NOW, [
    { start: -1, end: 5 },
    { start: 2, end: 4 },
  ]);
  await first.refresh(10);
  assert.equal(first.gladys.fake.sceneEvents.length, 1);
  await first.app.stop();

  const second = await createWorld({ store, connect: false });
  second.geosphere.answers.warnings = warningsAround(NOW, [
    { start: -1, end: 5 },
    { start: 2, end: 4 },
  ]);
  await second.gladys.connect();
  await second.app.ready;
  assert.equal(second.gladys.fake.sceneEvents.length, 0);
  await second.app.stop();
});

test('the trigger data match the filters declared in the manifest', async () => {
  const { readFile } = await import('node:fs/promises');
  const manifest = JSON.parse(
    await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
  );
  const trigger = manifest.scene_triggers.find((entry) => entry.key === WARNING_TRIGGER);
  const world = await createWorld();
  world.geosphere.answers.warnings = warningsAround(NOW, [
    { start: 1, end: 5, level: 3 },
    { start: 1, end: 5 },
    { start: 1, end: 5, level: 2 },
  ]);
  await world.refresh(10);
  assert.equal(world.gladys.fake.sceneEvents.length, 3);
  for (const { data } of world.gladys.fake.sceneEvents) {
    for (const field of trigger.fields) {
      const values = field.options.map((option) => option.value);
      assert.ok(values.includes(data[field.key]), `${field.key}=${data[field.key]}`);
    }
    for (const variable of trigger.variables) {
      assert.ok(variable.key in data, `variable ${variable.key} missing`);
      assert.equal(typeof data[variable.key], variable.type, variable.key);
    }
  }
  await world.app.stop();
});

test('a normal refresh cycle writes nothing at info level, and never the home coordinates', async () => {
  const world = await createWorld({ connect: false });
  world.geosphere.answers.warnings = warningsAround(NOW, [{ start: -1, end: 5 }]);
  await world.gladys.connect();
  await world.app.ready;
  await world.createAll();
  const start = world.logs.lines.length;
  for (let i = 0; i < 3; i += 1) {
    withTemperature(world, 8 + i);
    await world.refresh(10);
  }
  const cycle = world.logs.lines.slice(start);
  assert.ok(cycle.length > 0, 'the cycle logs at debug level');
  assert.deepEqual(
    cycle.filter((line) => line.level !== 'debug'),
    [],
  );
  const coordinates = [String(HOUSE.latitude), String(HOUSE.longitude), '47.07', '15.44'];
  for (const line of world.logs.lines) {
    for (const value of coordinates) {
      assert.ok(!line.text.includes(value), `"${line.text}" shows a coordinate`);
    }
  }
  await world.app.stop();
});

test('a GeoSphere outage is logged once, its recovery once, and shown in the status', async () => {
  const world = await createWorld();
  const outage = new TypeError('fetch failed');
  world.geosphere.answers.current = outage;
  world.geosphere.answers.forecast = outage;
  world.geosphere.answers.warnings = outage;
  world.clock.now += 3600 * 1000;
  await world.refresh(10);
  await world.refresh(10);
  await world.refresh(10);
  const warns = world.logs.at('warn');
  assert.equal(warns.length, 3, 'one line per source, not one per attempt');
  assert.ok(warns.every((line) => /unavailable \(.*fetch failed\)/.test(line.text)));
  assert.equal(world.gladys.fake.connectionStatus.connected, false);
  assert.match(world.gladys.fake.connectionStatus.message.en, /does not answer/);

  const healthy = await createWorld({ connect: false });
  world.geosphere.answers.current = healthy.geosphere.answers.current;
  world.geosphere.answers.forecast = healthy.geosphere.answers.forecast;
  world.geosphere.answers.warnings = healthy.geosphere.answers.warnings;
  await world.refresh(10);
  const infos = world.logs.at('info').filter((line) => /answers again/.test(line.text));
  assert.equal(infos.length, 3);
  assert.deepEqual(world.gladys.fake.connectionStatus, { connected: true });
  await world.app.stop();
  await healthy.app.stop();
});

test('GeoSphere down at startup: retried at the next cycle, then the devices appear', async () => {
  const world = await createWorld({ connect: false });
  const stations = world.geosphere.answers.stations;
  world.geosphere.answers.stations = { status: 503 };
  await world.gladys.connect();
  await world.app.ready;
  assert.equal(world.gladys.fake.discoveredDevices.length, 0);
  assert.equal(world.gladys.fake.connectionStatus.connected, false);
  world.geosphere.answers.stations = stations;
  await world.refresh(10);
  assert.equal(world.gladys.fake.discoveredDevices.length, 2);
  assert.deepEqual(world.gladys.fake.connectionStatus, { connected: true });
  await world.app.stop();
});

test('no house located and nothing configured: no device, the status says what to do', async () => {
  const world = await createWorld({ houses: [{ ...HOUSE, latitude: null, longitude: null }] });
  assert.equal(world.gladys.fake.discoveredDevices.length, 0);
  assert.equal(world.gladys.fake.connectionStatus.connected, false);
  assert.match(world.gladys.fake.connectionStatus.message.fr, /Aucun lieu/);
  assert.equal(world.geosphere.requests.length, 0, 'nothing to read');
  await world.app.stop();
});

test('typed coordinates take precedence over the house', async () => {
  const world = await createWorld({ config: { latitude: '48,2', longitude: '16,37' } });
  const [station, place] = world.gladys.fake.discoveredDevices;
  assert.equal(station.external_id, world.gladys.externalIds('station', '11034').device);
  assert.equal(place.external_id, world.gladys.externalIds('place', '4820_1637').device);
  assert.equal(place.name, 'GeoSphere 48.20, 16.37');
  await world.app.stop();
});

test('a station alone: the forecast and warnings are read at the station', async () => {
  const world = await createWorld({ houses: [], config: { station_id: '11035' } });
  const [station, place] = world.gladys.fake.discoveredDevices;
  assert.equal(station.name, 'GeoSphere Wien/Hohe Warte');
  assert.equal(place.name, 'GeoSphere Wien/Hohe Warte');
  assert.equal(place.external_id, world.gladys.externalIds('place', '4825_1636').device);
  await world.app.stop();
});

test('configuration problems are reported in the status', async () => {
  const cases = [
    [{ house: 'gone' }, /no longer exists/],
    [{ latitude: '40.4', longitude: '-3.7' }, /outside the GeoSphere Austria area/],
    [{ latitude: 'north', longitude: '15' }, /not readable/],
    [{ station_id: 'Wien' }, /station id is a number/],
    [{ station_id: '99999' }, /not among the active GeoSphere stations/],
  ];
  for (const [config, message] of cases) {
    const world = await createWorld({ config });
    assert.equal(world.gladys.fake.connectionStatus.connected, false, JSON.stringify(config));
    assert.match(world.gladys.fake.connectionStatus.message.en, message);
    await world.app.stop();
  }
  // An unknown station keeps the forecast and warnings of the house.
  const world = await createWorld({ config: { station_id: '99999' } });
  assert.deepEqual(
    world.gladys.fake.discoveredDevices.map((device) => device.external_id),
    [world.gladys.externalIds('place', PLACE).device],
  );
  await world.app.stop();
});

test('a configuration change re-reads everything for the new place', async () => {
  const world = await createWorld();
  await world.gladys.fake.configUpdated({ station_id: '11035' });
  assert.equal(
    world.gladys.fake.discoveredDevices[0].external_id,
    world.gladys.externalIds('station', '11035').device,
  );
  assert.equal(
    world.logs.at('info').filter((line) => /Configuration updated/.test(line.text)).length,
    1,
  );
  await world.app.stop();
});

test('a scan request publishes the devices again', async () => {
  const world = await createWorld();
  const before = world.gladys.fake.requests.filter((r) => r.path === '/discovered_device').length;
  await world.gladys.fake.scanRequest();
  const after = world.gladys.fake.requests.filter((r) => r.path === '/discovered_device').length;
  assert.equal(after, before + 1);
  await world.app.stop();
});

test('the "list the nearest stations" action, with distances', async () => {
  const world = await createWorld();
  const ack = await world.gladys.fake.action('list_stations', {});
  assert.equal(ack.success, true);
  const lines = ack.data.message.fr.split('\n');
  assert.match(lines[0], /maison « Maison »/);
  assert.match(lines[1], /^11290 Graz Universitaet \(Steiermark, 367 m\) — 1,1 km$/);
  assert.equal(lines.length, 10);
  assert.match(ack.data.message.de, /Kopiere eine ID/);
  await world.app.stop();
});

test('the "check the connection" action reads every source now', async () => {
  const world = await createWorld();
  const before = world.geosphere.count('forecast');
  const ack = await world.gladys.fake.action('check_connection', {});
  assert.equal(world.geosphere.count('forecast'), before + 1);
  assert.match(
    ack.data.message.en,
    /GeoSphere answers\. Graz Universitaet: 8\.6 °C at .*Forecast received\. 0 warning/,
  );
  assert.match(ack.data.message.fr, /8,6 °C/);

  world.geosphere.answers.warnings = { status: 500 };
  const failed = await world.gladys.fake.action('check_connection', {});
  assert.match(failed.data.message.en, /Warnings failed: .*HTTP 500/);
  const infos = world.logs.at('info').filter((line) => /Action: check/.test(line.text));
  assert.equal(infos.length, 2, 'one line per user action');
  await world.app.stop();
});

test('feature names follow the configured language', async () => {
  for (const [language, name] of [
    ['en', 'Temperature'],
    ['fr', 'Température'],
    ['de', 'Temperatur'],
    ['es', 'Temperatura'],
  ]) {
    const world = await createWorld({ config: { language } });
    assert.equal(world.gladys.fake.discoveredDevices[0].features[0].name, name);
    await world.app.stop();
  }
});
