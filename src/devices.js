// -----------------------------------------------------------------------------
// The two devices of the integration, and the states they publish.
//
//   - station: the 10-minute observations of one TAWES weather station
//     (external id from the GeoSphere station id, e.g. 11035);
//   - place: the forecast and the warnings at the house (external id from the
//     coordinates rounded to 0.01°, about 1 km: below the 2.5 km grid of the
//     model, so moving a house pin a few meters keeps the device).
//
// Feature keys are forever (Gladys keys history, scenes and dashboards on
// them). Everything is read-only: GeoSphere is a data source, nothing to drive.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { FEATURE_NAMES, TEXT, formatWhen, symbolName, warningLabel } from './i18n.js';
import {
  WARNING_TYPE_KEYS,
  stationLabel,
  summarizeForecast,
  warningLevels,
  warningsAhead,
} from './geosphere/model.js';

/** Device types (first part of the external ids): forever. */
export const DEVICE_TYPES = { STATION: 'station', PLACE: 'place' };

const sensor = (category, type, unit, min, max) => ({ category, type, unit, min, max });

/** Features of the station device, by key: forever. */
export const STATION_FEATURES = {
  temperature: sensor(C.TEMPERATURE_SENSOR, 'decimal', U.CELSIUS, -50, 50),
  dew_point: sensor(C.TEMPERATURE_SENSOR, 'decimal', U.CELSIUS, -50, 50),
  humidity: sensor(C.HUMIDITY_SENSOR, 'decimal', U.PERCENT, 0, 100),
  pressure: sensor(C.PRESSURE_SENSOR, 'decimal', U.HECTO_PASCAL, 900, 1100),
  wind_speed: sensor(C.SPEED_SENSOR, 'decimal', U.KILOMETER_PER_HOUR, 0, 250),
  wind_gust: sensor(C.SPEED_SENSOR, 'decimal', U.KILOMETER_PER_HOUR, 0, 250),
  wind_direction: sensor(C.ANGLE_SENSOR, 'integer', U.DEGREE, 0, 360),
  rain_rate: sensor(C.PRECIPITATION_SENSOR, 'decimal', U.MILLIMETER_PER_HOUR, 0, 200),
  sunshine: sensor(C.DURATION, 'decimal', U.MINUTES, 0, 10),
  snow_depth: sensor(C.DISTANCE_SENSOR, 'decimal', U.CM, 0, 1000),
};

const level = (min = 0, max = 3) => ({ category: C.RISK, type: 'integer', min, max });

/** Features of the place device, by key: forever. */
export const PLACE_FEATURES = {
  condition: { category: C.TEXT, type: 'text', min: 0, max: 0 },
  next24_min: sensor(C.TEMPERATURE_SENSOR, 'min', U.CELSIUS, -50, 50),
  next24_max: sensor(C.TEMPERATURE_SENSOR, 'max', U.CELSIUS, -50, 50),
  next24_precipitation: sensor(C.PRECIPITATION_SENSOR, 'decimal', U.MILLIMETER_PER_DAY, 0, 300),
  next24_gust: sensor(C.SPEED_SENSOR, 'decimal', U.KILOMETER_PER_HOUR, 0, 250),
  tomorrow_min: sensor(C.TEMPERATURE_SENSOR, 'min', U.CELSIUS, -50, 50),
  tomorrow_max: sensor(C.TEMPERATURE_SENSOR, 'max', U.CELSIUS, -50, 50),
  tomorrow_precipitation: sensor(C.PRECIPITATION_SENSOR, 'decimal', U.MILLIMETER_PER_DAY, 0, 300),
  warning_level: level(),
  ...Object.fromEntries(WARNING_TYPE_KEYS.map((type) => [`warning_${type}`, level()])),
  warnings: { category: C.TEXT, type: 'text', min: 0, max: 0 },
};

/** Platform id of the place device: the coordinates in hundredths of a degree. */
export const placePlatformId = (lat, lon) => `${Math.round(lat * 100)}_${Math.round(lon * 100)}`;

function buildFeatures(ids, definitions, language) {
  return Object.entries(definitions).map(([key, definition]) => ({
    name: FEATURE_NAMES[language][key],
    external_id: ids.feature(key),
    category: definition.category,
    type: definition.type,
    ...(definition.unit ? { unit: definition.unit } : {}),
    // Display bounds of the gauges; the core never clamps a state on them.
    min: definition.min,
    max: definition.max,
    read_only: true,
    has_feedback: false,
    keep_history: true,
  }));
}

/**
 * The devices to publish. Polling: the container refreshes the data itself
 * (src/poller.js); the core's onPoll, once a minute, is only a fallback.
 * @param {object} gladys
 * @param {{ station: object | null, place: { lat: number, lon: number, name: string } | null, language: string }} target
 */
export function buildDevices(gladys, { station, place, language }) {
  const devices = [];
  if (station) {
    const ids = gladys.externalIds(DEVICE_TYPES.STATION, station.id);
    devices.push({
      name: `GeoSphere ${stationLabel(station.name)}`,
      external_id: ids.device,
      model: 'TAWES',
      should_poll: true,
      poll_frequency: 60000,
      features: buildFeatures(ids, STATION_FEATURES, language),
      params: [
        { name: 'station_id', value: station.id },
        { name: 'altitude', value: String(station.altitude ?? '') },
      ],
    });
  }
  if (place) {
    const ids = gladys.externalIds(DEVICE_TYPES.PLACE, placePlatformId(place.lat, place.lon));
    devices.push({
      name: `GeoSphere ${place.name}`,
      external_id: ids.device,
      model: 'Forecast & warnings',
      should_poll: true,
      poll_frequency: 60000,
      features: buildFeatures(ids, PLACE_FEATURES, language),
    });
  }
  return devices;
}

const state = (ids, key, value) =>
  value === null || value === undefined
    ? null
    : { device_feature_external_id: ids.feature(key), state: value };

const text = (ids, key, value) =>
  typeof value === 'string' && value.trim() !== ''
    ? { device_feature_external_id: ids.feature(key), text: value.slice(0, 250) }
    : null;

/** States of the station device from an observation (values already converted). */
export function stationStates(gladys, station, observation) {
  const ids = gladys.externalIds(DEVICE_TYPES.STATION, station.id);
  return Object.keys(STATION_FEATURES)
    .map((key) => state(ids, key, observation.values[key]))
    .filter(Boolean);
}

/** One line per warning not over yet, the ones in force first. */
export function warningsSummary(warnings, now, language, timeZone) {
  const ahead = warningsAhead(warnings, now);
  if (ahead.length === 0) {
    return null;
  }
  return ahead
    .map((warning) => {
      const inForce = warning.start <= now;
      const when = inForce
        ? `→ ${formatWhen(warning.end, language, timeZone, now)}`
        : `${formatWhen(warning.start, language, timeZone, now)} → ${formatWhen(warning.end, language, timeZone, now)}`;
      return `${warningLabel(warning, language)} ${when}`;
    })
    .join(' | ');
}

/**
 * States of the place device.
 * @param {object} data `{ forecast?, warnings? }`, each the last parsed answer
 */
export function placeStates(gladys, place, { forecast, warnings }, { now, language, timeZone }) {
  const ids = gladys.externalIds(DEVICE_TYPES.PLACE, placePlatformId(place.lat, place.lon));
  const states = [];
  if (forecast) {
    const summary = summarizeForecast(forecast, now, timeZone);
    states.push(
      text(ids, 'condition', symbolName(summary.symbol, language)),
      state(ids, 'next24_min', summary.next24.min),
      state(ids, 'next24_max', summary.next24.max),
      state(ids, 'next24_precipitation', summary.next24.precipitation),
      state(ids, 'next24_gust', summary.next24.gust),
      state(ids, 'tomorrow_min', summary.tomorrow.min),
      state(ids, 'tomorrow_max', summary.tomorrow.max),
      state(ids, 'tomorrow_precipitation', summary.tomorrow.precipitation),
    );
  }
  if (warnings) {
    const levels = warningLevels(warnings.warnings, now);
    states.push(state(ids, 'warning_level', levels.overall));
    for (const type of WARNING_TYPE_KEYS) {
      states.push(state(ids, `warning_${type}`, levels.byType[type]));
    }
    states.push(
      text(
        ids,
        'warnings',
        warningsSummary(warnings.warnings, now, language, timeZone) ?? TEXT.noWarning[language],
      ),
    );
  }
  return states.filter(Boolean);
}
