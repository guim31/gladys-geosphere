import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, parseCoordinate } from '../src/config.js';

test('a coordinate accepts a point or a comma, and refuses anything else', () => {
  assert.equal(parseCoordinate('47.07', 90), 47.07);
  assert.equal(parseCoordinate(' 47,07 ', 90), 47.07);
  assert.equal(parseCoordinate('-15.5', 180), -15.5);
  assert.equal(parseCoordinate(15.44, 180), 15.44);
  assert.equal(parseCoordinate('', 90), null);
  assert.equal(parseCoordinate('47.07.1', 90), null);
  assert.equal(parseCoordinate('north', 90), null);
  assert.equal(parseCoordinate('91', 90), null);
});

test('the defaults: house position, nearest station, 10 minutes, French names', () => {
  const config = normalizeConfig();
  assert.equal(config.house, '');
  assert.equal(config.latitude, null);
  assert.equal(config.stationId, '');
  assert.equal(config.refreshMs, 10 * 60 * 1000);
  assert.equal(config.language, 'fr');
  assert.equal(config.coordinatesInvalid, false);
  assert.equal(DEFAULT_CONFIG.refresh_minutes, '10');
});

test('one coordinate alone, or an unreadable one, is no location and is flagged', () => {
  const half = normalizeConfig({ latitude: '47.07', longitude: '' });
  assert.equal(half.latitude, null);
  assert.equal(half.coordinatesInvalid, true);
  const both = normalizeConfig({ latitude: '47,07', longitude: '15,44' });
  assert.deepEqual([both.latitude, both.longitude, both.coordinatesInvalid], [47.07, 15.44, false]);
});

test('station id, refresh and language are checked', () => {
  assert.equal(normalizeConfig({ station_id: ' 11035 ' }).stationId, '11035');
  const bad = normalizeConfig({ station_id: 'Wien' });
  assert.deepEqual([bad.stationId, bad.stationIdInvalid], ['', true]);
  assert.equal(normalizeConfig({ refresh_minutes: '30' }).refreshMs, 30 * 60 * 1000);
  assert.equal(normalizeConfig({ refresh_minutes: '1' }).refreshMs, 10 * 60 * 1000);
  assert.equal(normalizeConfig({ language: 'de' }).language, 'de');
  assert.equal(normalizeConfig({ language: 'it' }).language, 'fr');
});
