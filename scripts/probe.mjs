#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Probe of the real GeoSphere Austria APIs, read-only, with the client and the
// parsers of the integration: what Gladys would show for a point.
//
//   node scripts/probe.mjs <latitude> <longitude> [--station <id>] [--save <dir>]
//
// --save writes the raw answers (metadata, observation, forecast, warnings) to
// <dir>, to refresh the fixtures of test/fixtures. No account, no key: nothing
// sensitive is printed. Exit code 1 if a source fails.
// -----------------------------------------------------------------------------

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createGeoSphereClient } from '../src/geosphere/client.js';
import {
  FORECAST_PARAMETERS,
  nearestStations,
  parseForecast,
  parseObservation,
  parseStations,
  parseWarnings,
  pickParameters,
  stationLabel,
  summarizeForecast,
  warningLevels,
} from '../src/geosphere/model.js';
import { parseCoordinate } from '../src/config.js';

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const lat = parseCoordinate(args[0], 90);
const lon = parseCoordinate(args[1], 180);
if (lat === null || lon === null) {
  console.error(
    'Usage: node scripts/probe.mjs <latitude> <longitude> [--station <id>] [--save <dir>]',
  );
  process.exit(2);
}
const saveDir = option('--save');
const client = createGeoSphereClient();
let failed = false;

async function step(label, run) {
  try {
    return await run();
  } catch (err) {
    failed = true;
    console.log(`✗ ${label}: ${err.message}`);
    return null;
  }
}

async function save(name, raw) {
  if (saveDir && raw) {
    await mkdir(saveDir, { recursive: true });
    await writeFile(join(saveDir, name), `${JSON.stringify(raw, null, 2)}\n`);
  }
}

const metadataRaw = await step('station metadata', () => client.stations());
await save('stations-metadata.json', metadataRaw);
let station = null;
let picked = null;
if (metadataRaw) {
  const { stations, parameters } = parseStations(metadataRaw);
  picked = pickParameters(parameters);
  console.log(`✓ ${stations.length} active stations; parameters used: ${JSON.stringify(picked)}`);
  if (Object.keys(picked).length < 10) {
    console.log('  ✗ some readings have no parameter in the metadata: see OBSERVATION_PARAMETERS');
    failed = true;
  }
  const nearest = nearestStations(stations, lat, lon, 5);
  for (const s of nearest) {
    console.log(
      `  ${s.id} ${stationLabel(s.name)} (${s.state}, ${s.altitude} m) — ${s.distance.toFixed(1)} km`,
    );
  }
  const wanted = option('--station');
  station = wanted ? stations.find((s) => s.id === wanted) : nearest[0];
  if (!station) {
    console.log(`✗ station ${wanted} is not an active station`);
    failed = true;
  }
}

if (station && picked) {
  const raw = await step(`observation of ${station.id}`, () =>
    client.current(station.id, Object.values(picked)),
  );
  await save('station-current.json', raw);
  if (raw) {
    const observation = parseObservation(raw, picked);
    const age = Math.round((Date.now() - observation.time) / 60000);
    console.log(`✓ observation of ${station.id} ${stationLabel(station.name)}, ${age} min old:`);
    console.log(`  ${JSON.stringify(observation.values)}`);
  }
}

const forecastRaw = await step('forecast', () => client.forecast(lat, lon, FORECAST_PARAMETERS));
await save('forecast.json', forecastRaw);
if (forecastRaw) {
  const forecast = parseForecast(forecastRaw);
  const summary = summarizeForecast(forecast, Date.now(), process.env.TZ || 'Europe/Vienna');
  console.log(
    `✓ forecast: ${forecast.hours.length} hours from ${new Date(forecast.referenceTime).toISOString()}`,
  );
  console.log(`  symbol ${summary.symbol}, next 24 h ${JSON.stringify(summary.next24)}`);
  console.log(`  tomorrow ${JSON.stringify(summary.tomorrow)}`);
}

for (const lang of ['de', 'en']) {
  const raw = await step(`warnings (${lang})`, () => client.warnings(lat, lon, lang));
  await save(`warnings-${lang}.json`, raw);
  if (raw) {
    const { municipality, warnings } = parseWarnings(raw);
    const entries = raw.properties?.warnings?.length ?? 0;
    console.log(
      `✓ warnings (${lang}) for ${municipality ?? '?'}: ${warnings.length} parsed of ${entries}`,
    );
    for (const w of warnings) {
      console.log(
        `  ${w.id} ${w.type} level ${w.level} ${new Date(w.start).toISOString()} → ${new Date(w.end).toISOString()}: ${w.text}`,
      );
    }
    console.log(`  levels in force: ${JSON.stringify(warningLevels(warnings, Date.now()))}`);
  }
}

process.exit(failed ? 1 : 0);
