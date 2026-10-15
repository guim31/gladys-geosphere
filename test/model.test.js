// The parsers, on the recorded answers of test/fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nearestStations,
  parseForecast,
  parseObservation,
  parseStations,
  parseWarnings,
  pickParameters,
  stationLabel,
  summarizeForecast,
  warningLevels,
  warningsAhead,
} from '../src/geosphere/model.js';
import { FIXTURES, NOW, TIME_ZONE, warningsAround } from './helpers/fakeGeoSphere.js';

test('the station list keeps the active stations and their parameters', () => {
  const { stations, parameters } = parseStations(FIXTURES.stations);
  assert.equal(stations.length, 228);
  const wien = stations.find((station) => station.id === '11035');
  assert.deepEqual(
    { name: wien.name, state: wien.state, altitude: wien.altitude },
    { name: 'WIEN/HOHE WARTE', state: 'Wien', altitude: 198 },
  );
  assert.ok(parameters.has('TL') && parameters.has('RFAM'));
  const inactive = structuredClone(FIXTURES.stations);
  inactive.stations[0].is_active = false;
  assert.equal(parseStations(inactive).stations.length, 227);
  assert.throws(() => parseStations({}), /station list/);
});

test('the parameter names follow what the dataset offers (RF was renamed RFAM)', () => {
  const picked = pickParameters(parseStations(FIXTURES.stations).parameters);
  assert.equal(picked.humidity, 'RFAM');
  assert.equal(picked.wind_speed, 'FFAM');
  assert.equal(picked.snow_depth, 'SCHNEE');
  assert.equal(pickParameters(new Set(['TL', 'RF'])).humidity, 'RF');
  assert.equal(pickParameters(new Set(['TL'])).humidity, undefined);
  assert.equal(pickParameters(new Set()).humidity, 'RFAM');
});

test('the nearest stations, with their distance', () => {
  const { stations } = parseStations(FIXTURES.stations);
  const [first, second] = nearestStations(stations, 48.21, 16.37, 2);
  assert.equal(first.id, '11034'); // Wien-Innere Stadt
  assert.ok(first.distance < 2);
  assert.ok(second.distance >= first.distance);
});

test('station names are shown in title case', () => {
  assert.equal(stationLabel('GRAZ-THALERHOF-FLUGHAFEN'), 'Graz-Thalerhof-Flughafen');
  assert.equal(stationLabel('WIEN/HOHE WARTE'), 'Wien/Hohe Warte');
});

test('an observation: units converted, missing readings left out', () => {
  const picked = pickParameters(parseStations(FIXTURES.stations).parameters);
  const { time, values } = parseObservation(FIXTURES.current, picked);
  assert.equal(time, Date.parse('2022-11-13T10:20Z'));
  assert.deepEqual(values, {
    temperature: 8.6,
    dew_point: 6.5,
    pressure: 1031.4,
    wind_gust: 11.2, // 3.1 m/s
    wind_direction: 160,
    rain_rate: 0,
    sunshine: 10, // 599 s of the last 10 minutes
    snow_depth: 0,
  });
  assert.equal(values.humidity, undefined); // null in the answer
  assert.throws(() => parseObservation({ features: [] }, picked), /without parameters/);
});

test('a forecast: hours, gusts in km/h, and the summary at the test clock', () => {
  const forecast = parseForecast(FIXTURES.forecast);
  assert.equal(forecast.hours.length, 61);
  assert.equal(forecast.referenceTime, Date.parse('2026-10-14T06:00Z'));
  assert.equal(forecast.hours[0].gust, 21.6); // hypot(4.8, 3.6) m/s
  const summary = summarizeForecast(forecast, NOW, TIME_ZONE);
  assert.equal(summary.symbol, 2);
  assert.deepEqual(summary.next24, { min: 3.5, max: 14.5, precipitation: 0.3, gust: 50.4 });
  assert.deepEqual(summary.tomorrow, { min: 3.5, max: 13.8, precipitation: 4.2 });
  assert.equal(summary.temperatures.length, 24);
  assert.throws(() => parseForecast({}), /without timestamps/);
});

test('a forecast too old to cover tomorrow gives no tomorrow values', () => {
  const forecast = parseForecast(FIXTURES.forecast);
  const later = NOW + 30 * 3600 * 1000;
  assert.deepEqual(summarizeForecast(forecast, later, TIME_ZONE).tomorrow, {
    min: null,
    max: null,
    precipitation: null,
  });
});

test('the warnings: type, level, dates and texts of the recorded answer', () => {
  const { municipality, warnings } = parseWarnings(FIXTURES.warnings);
  assert.equal(municipality, 'Salzburg');
  assert.deepEqual(
    warnings.map((warning) => [warning.id, warning.type, warning.level]),
    [
      ['4266', 'black_ice', 3],
      ['4265', 'thunderstorm', 1],
      ['10', 'heat', 1],
    ],
  );
  assert.equal(warnings[1].start, 1695049200 * 1000);
  assert.match(warnings[1].text, /Gelbe Gewitterwarnung/);
  assert.deepEqual(parseWarnings(FIXTURES.noWarnings).warnings, []);
  assert.throws(() => parseWarnings({}), /without properties/);
});

test('the levels in force: overall and per type; announced ones do not count yet', () => {
  const { warnings } = parseWarnings(
    warningsAround(NOW, [
      { start: -2, end: 6 }, // heat, yellow, in force
      { start: 3, end: 8, level: 2 }, // thunderstorm, orange, later
      { start: -5, end: -1 }, // black ice, over
    ]),
  );
  const levels = warningLevels(warnings, NOW);
  assert.equal(levels.overall, 1);
  assert.equal(levels.byType.heat, 1);
  assert.equal(levels.byType.thunderstorm, 0);
  assert.equal(levels.byType.black_ice, 0);
  assert.equal(warningsAhead(warnings, NOW).length, 2);
  assert.equal(warningLevels(warnings, NOW + 4 * 3600 * 1000).overall, 2);
});

test('the forecast area of the service is the bbox of the real model metadata', async () => {
  const { readFile } = await import('node:fs/promises');
  const { FORECAST_AREA } = await import('../src/service.js');
  const metadata = JSON.parse(
    await readFile(new URL('./fixtures/forecast-metadata.json', import.meta.url), 'utf8'),
  );
  const [south, west, north, east] = metadata.bbox;
  assert.ok(Math.abs(FORECAST_AREA.south - south) < 0.01);
  assert.ok(Math.abs(FORECAST_AREA.west - west) < 0.01);
  assert.ok(Math.abs(FORECAST_AREA.north - north) < 0.01);
  assert.ok(Math.abs(FORECAST_AREA.east - east) < 0.01);
  for (const parameter of ['t2m', 'rr_acc', 'ugust', 'vgust', 'sy']) {
    assert.ok(
      metadata.parameters.some((entry) => entry.name === parameter),
      `${parameter} is a parameter of the model`,
    );
  }
});
