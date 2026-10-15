// -----------------------------------------------------------------------------
// The GeoSphere service: where the data is read (location, station), when it
// is read (each source at its own pace), and what Gladys receives (devices,
// states, "new warning" scene events, the connection status).
//
// Pace of the sources, all public and without key (see docs, "Limits"):
//   - station metadata: at setup, then once a day;
//   - observation and warnings: every cycle (10 minutes by default);
//   - forecast: once an hour (the model runs every 3 hours).
// About 13 requests an hour at the default pace.
// -----------------------------------------------------------------------------

import { buildDevices, placeStates, stationStates } from './devices.js';
import {
  FORECAST_PARAMETERS,
  WARNING_LEVELS,
  nearestStations,
  parseForecast,
  parseObservation,
  parseStations,
  parseWarnings,
  pickParameters,
  stationLabel,
} from './geosphere/model.js';
import { TEXT, WARNING_LEVEL_NAMES, WARNING_TYPE_NAMES, formatWhen } from './i18n.js';
import { createIssueLog } from './issues.js';

/** Scene trigger key: forever. */
export const WARNING_TRIGGER = 'warning_issued';

const HOUR = 3600 * 1000;
export const METADATA_MAX_AGE = 24 * HOUR;
export const FORECAST_MAX_AGE = 55 * 60 * 1000;
// A station silent for this long is down: its last values are not re-sent.
export const OBSERVATION_MAX_AGE = 3 * HOUR;
// An unchanged value is re-sent this often, so Gladys never shows it as stale.
export const HEARTBEAT = 6 * HOUR;
// Warnings remembered after their end, so a late echo does not fire again.
const SEEN_RETENTION = 48 * HOUR;

// The area of the forecast model (nwp-v1-1h-2500m metadata, `bbox`).
export const FORECAST_AREA = { south: 42.98, north: 51.82, west: 5.5, east: 22.1 };
const inForecastArea = (lat, lon) =>
  lat >= FORECAST_AREA.south &&
  lat <= FORECAST_AREA.north &&
  lon >= FORECAST_AREA.west &&
  lon <= FORECAST_AREA.east;

const formatCoordinates = (lat, lon) => `${lat.toFixed(2)}, ${lon.toFixed(2)}`;

/**
 * @param {object} options
 * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
 * @param {ReturnType<import('./geosphere/client.js').createGeoSphereClient>} options.client
 * @param {{ load: Function, save: Function }} options.store
 * @param {object} options.logger
 * @param {() => object} options.getConfig the current normalized config
 * @param {() => number} options.now
 * @param {string} [options.timeZone] IANA zone of Gladys (TZ), system zone if unset
 */
export function createService({ gladys, client, store, logger, getConfig, now, timeZone }) {
  const issues = createIssueLog(logger);
  let metadata = null; // { stations, parameters, picked, at }
  let target = null; // { station, place, problem }
  let observation = null; // { data, at }
  let forecast = null; // { data, at }
  let warnings = null; // { data, at }
  let seen; // { [warnid]: { level, end } }, undefined until loaded
  let lastStatus = null;
  // The last error of each failing source, for the check action.
  const lastErrors = new Map();

  async function loadMetadata() {
    if (metadata && now() - metadata.at < METADATA_MAX_AGE) {
      return metadata;
    }
    try {
      const parsed = parseStations(await client.stations());
      metadata = { ...parsed, picked: pickParameters(parsed.parameters), at: now() };
      issues.ok('metadata', 'Station list: GeoSphere answers again');
    } catch (err) {
      issues.fail('metadata', `Station list unavailable (${err.message})`);
      // A stale list stays better than none.
      if (!metadata) {
        throw err;
      }
    }
    return metadata;
  }

  /** The location of the forecast and warnings, or a configuration problem. */
  async function resolveLocation(config) {
    if (config.coordinatesInvalid) {
      return { problem: 'coordinatesInvalid' };
    }
    if (config.latitude !== null) {
      return {
        place: {
          lat: config.latitude,
          lon: config.longitude,
          name: formatCoordinates(config.latitude, config.longitude),
          source: 'coordinates',
        },
      };
    }
    const houses = await gladys.getHouses();
    const located = houses.filter((house) => house.latitude !== null && house.longitude !== null);
    if (config.house) {
      const house = located.find((candidate) => candidate.selector === config.house);
      if (!house) {
        return { problem: 'houseNotFound' };
      }
      return {
        place: { lat: house.latitude, lon: house.longitude, name: house.name, source: 'house' },
      };
    }
    const house = located[0];
    return house
      ? { place: { lat: house.latitude, lon: house.longitude, name: house.name, source: 'house' } }
      : { place: null };
  }

  /**
   * Work out the station and the place from the config, then publish the
   * devices. Throws when GeoSphere or Gladys does not answer (retried at the
   * next cycle); a configuration problem is reported in `target.problem`.
   */
  async function setup() {
    const config = getConfig();
    if (config.stationIdInvalid) {
      target = { station: null, place: null, problem: 'stationIdInvalid' };
      return target;
    }
    const location = await resolveLocation(config);
    if (location.problem) {
      target = { station: null, place: null, problem: location.problem };
      return target;
    }
    let place = location.place;
    if (!place && !config.stationId) {
      target = { station: null, place: null, problem: 'notConfigured' };
      return target;
    }
    const { stations } = await loadMetadata();
    let station;
    let problem = null;
    if (config.stationId) {
      station = stations.find((candidate) => candidate.id === config.stationId) ?? null;
      if (!station) {
        problem = 'stationUnknown';
      }
    } else {
      [station] = nearestStations(stations, place.lat, place.lon, 1);
    }
    if (!place && station) {
      // No house located, no coordinates: the forecast is the station's.
      place = {
        lat: station.lat,
        lon: station.lon,
        name: stationLabel(station.name),
        source: 'station',
      };
    }
    if (place && !inForecastArea(place.lat, place.lon)) {
      problem = 'outsideArea';
      place = null;
      if (!config.stationId) {
        station = null;
      }
    }
    target = { station, place, problem };
    logger.info(
      `Ready: ${station ? `station ${station.id} ${stationLabel(station.name)}` : 'no station'}, ` +
        `${place ? `forecast and warnings for ${place.source === 'house' ? `house "${place.name}"` : `the ${place.source}`}` : 'no forecast'}` +
        `${problem ? ` (${problem})` : ''}`,
    );
    await gladys.publishDiscoveredDevices(
      buildDevices(gladys, { ...target, language: config.language }),
    );
    return target;
  }

  async function readObservation() {
    const { station } = target;
    const { picked } = metadata;
    const data = parseObservation(await client.current(station.id, Object.values(picked)), picked);
    observation = { data, at: now() };
    return data;
  }

  async function readForecast() {
    const { place } = target;
    const data = parseForecast(await client.forecast(place.lat, place.lon, FORECAST_PARAMETERS));
    forecast = { data, at: now() };
    return data;
  }

  async function readWarnings() {
    const { place } = target;
    const lang = getConfig().language === 'de' ? 'de' : 'en';
    const data = parseWarnings(await client.warnings(place.lat, place.lon, lang));
    warnings = { data, at: now() };
    return data;
  }

  /** Run one source, logging a lasting failure once; resolves true on success. */
  async function attempt(key, label, read) {
    try {
      await read();
      lastErrors.delete(key);
      issues.ok(key, `${label}: GeoSphere answers again`);
      return true;
    } catch (err) {
      lastErrors.set(key, err.message);
      issues.fail(key, `${label} unavailable (${err.message})`);
      return false;
    }
  }

  async function reportStatus(connected, message) {
    const next = JSON.stringify({ connected, message });
    if (next === lastStatus) {
      return;
    }
    lastStatus = next;
    await gladys.setConnectionStatus(connected, message);
  }

  /** The states of the devices the user added to Gladys. */
  function currentStates() {
    if (!target) {
      return [];
    }
    const config = getConfig();
    const created = new Set((gladys.devices ?? []).map((device) => device.external_id));
    const states = [];
    const { station, place } = target;
    if (
      station &&
      observation &&
      created.has(gladys.externalIds('station', station.id).device) &&
      observation.data.time !== null &&
      now() - observation.data.time < OBSERVATION_MAX_AGE
    ) {
      states.push(...stationStates(gladys, station, observation.data));
    }
    if (place) {
      const ids = buildDevices(gladys, { station: null, place, language: config.language })[0];
      if (created.has(ids.external_id)) {
        states.push(
          ...placeStates(
            gladys,
            place,
            { forecast: forecast?.data, warnings: warnings?.data },
            { now: now(), language: config.language, timeZone },
          ),
        );
      }
    }
    return states;
  }

  async function publishStates() {
    const states = currentStates();
    if (states.length === 0) {
      return;
    }
    const result = await gladys.publishChangedStates(states, { heartbeat: HEARTBEAT });
    logger.debug(`${result.count} state(s) published`);
  }

  /**
   * Fire the scene trigger for every warning not announced yet, or whose
   * level rose. The very first run only takes note of the warnings: a fresh
   * install does not fire for warnings issued before it.
   */
  async function announceWarnings() {
    if (!warnings) {
      return;
    }
    if (seen === undefined) {
      const saved = await store.load();
      seen = saved?.seen ?? null;
    }
    const baseline = seen === null;
    const next = { ...(seen ?? {}) };
    const fresh = [];
    for (const warning of warnings.data.warnings) {
      if (warning.end <= now()) {
        continue;
      }
      const previous = next[warning.id];
      if (!previous || warning.level > previous.level) {
        fresh.push({ warning, update: Boolean(previous) });
      }
      next[warning.id] = { level: Math.max(warning.level, previous?.level ?? 0), end: warning.end };
    }
    for (const [id, entry] of Object.entries(next)) {
      if (entry.end < now() - SEEN_RETENTION) {
        delete next[id];
      }
    }
    const changed = JSON.stringify(next) !== JSON.stringify(seen);
    seen = next;
    if (changed) {
      await store
        .save({ seen })
        .catch((err) => issues.fail('store', `Cannot write /data (${err.message})`));
    }
    if (baseline) {
      logger.debug(`${fresh.length} warning(s) noted, first run: no scene event`);
      return;
    }
    const language = getConfig().language;
    for (const { warning, update } of fresh) {
      const levelKey = WARNING_LEVELS[warning.level];
      logger.info(`New warning: ${levelKey} ${warning.type}${update ? ' (level raised)' : ''}`);
      await gladys
        .publishSceneEvent(WARNING_TRIGGER, {
          warning_type: warning.type,
          level: levelKey,
          level_number: warning.level,
          type_label:
            WARNING_TYPE_NAMES[language][warning.type] ?? WARNING_TYPE_NAMES[language].other,
          level_label: WARNING_LEVEL_NAMES[language][levelKey],
          starts_at: formatWhen(warning.start, language, timeZone, now()),
          ends_at: formatWhen(warning.end, language, timeZone, now()),
          in_force: warning.start <= now(),
          is_update: update,
          description: warning.text.slice(0, 1000),
          place: warnings.data.municipality ?? target.place?.name ?? null,
        })
        .catch((err) => logger.error(`Scene event refused (${err.message})`));
    }
  }

  return {
    /** Forget everything read: the config changed. */
    reset() {
      target = null;
      observation = null;
      forecast = null;
      warnings = null;
      lastStatus = null;
    },

    /**
     * One refresh: setup if needed, read the sources that are due, publish
     * the states, announce the new warnings, report the status.
     * @returns {Promise<boolean>} whether something new was read
     */
    async cycle({ forceForecast = false } = {}) {
      if (!target) {
        try {
          await setup();
        } catch (err) {
          lastErrors.set('setup', err.message);
          issues.fail('setup', `Setup failed (${err.message})`);
          await reportStatus(false, TEXT.unreachable);
          return false;
        }
        lastErrors.delete('setup');
        issues.ok('setup', 'Setup done: GeoSphere answers again');
      } else if (metadata && now() - metadata.at >= METADATA_MAX_AGE) {
        await loadMetadata().catch(() => {});
      }
      const { station, place, problem } = target;
      if (!station && !place) {
        await reportStatus(false, TEXT[problem ?? 'notConfigured']);
        return false;
      }
      const results = [];
      if (station) {
        results.push(await attempt('observation', `Station ${station.id}`, readObservation));
      }
      if (place) {
        if (forceForecast || !forecast || now() - forecast.at >= FORECAST_MAX_AGE) {
          results.push(await attempt('forecast', 'Forecast', readForecast));
        }
        results.push(await attempt('warnings', 'Warnings', readWarnings));
      }
      await publishStates();
      await announceWarnings();
      const anyOk = results.some(Boolean);
      if (problem) {
        await reportStatus(false, TEXT[problem]);
      } else {
        await reportStatus(anyOk, anyOk ? undefined : TEXT.unreachable);
      }
      return anyOk;
    },

    publishStates,

    /** Publish the devices again (a scan request). */
    async publishDevices() {
      if (target) {
        await gladys.publishDiscoveredDevices(
          buildDevices(gladys, { ...target, language: getConfig().language }),
        );
      }
    },

    /** Whether a device belongs to the current target. */
    owns(externalId) {
      if (!target) {
        return false;
      }
      return buildDevices(gladys, { ...target, language: getConfig().language }).some(
        (device) => device.external_id === externalId,
      );
    },

    /** Everything the widget shows. */
    snapshot() {
      return {
        target,
        observation: observation?.data ?? null,
        forecast: forecast?.data ?? null,
        warnings: warnings?.data ?? null,
      };
    },

    /** The `count` nearest active stations to the location. */
    async nearest(count) {
      const config = getConfig();
      const location = await resolveLocation(config);
      if (location.problem || !location.place) {
        return { problem: location.problem ?? 'notConfigured' };
      }
      const { stations } = await loadMetadata();
      return {
        place: location.place,
        stations: nearestStations(stations, location.place.lat, location.place.lon, count).map(
          (station) => ({
            ...station,
            label: stationLabel(station.name),
            distance: Math.round(station.distance * 10) / 10,
            altitude: station.altitude === null ? '?' : Math.round(station.altitude),
          }),
        ),
      };
    },

    /** Read every source now (configuration action). */
    async check() {
      target = null;
      forecast = null;
      lastStatus = null;
      lastErrors.clear();
      await this.cycle({ forceForecast: true });
      return {
        target,
        observation: observation?.data ?? null,
        forecast: forecast?.data ?? null,
        warnings: warnings?.data ?? null,
        errors: Object.fromEntries(lastErrors),
      };
    },
  };
}
