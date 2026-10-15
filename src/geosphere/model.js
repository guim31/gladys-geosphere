// -----------------------------------------------------------------------------
// GeoSphere Austria payloads → plain values. Pure functions, no I/O: the
// formats are pinned by the fixtures of test/fixtures (real answers published
// by python-zamg and ioBroker.weather-warnings, see the README credits).
// -----------------------------------------------------------------------------

/**
 * What the station device shows, with the TAWES parameter names that carry it.
 * The first name the station metadata lists wins: GeoSphere renamed some
 * parameters over the years (RF → RFAM), the aliases keep both working.
 */
export const OBSERVATION_PARAMETERS = {
  temperature: ['TL'],
  dew_point: ['TP'],
  humidity: ['RFAM', 'RF'],
  pressure: ['PRED'],
  wind_speed: ['FFAM', 'FF'],
  wind_gust: ['FFX'],
  wind_direction: ['DD'],
  rain_rate: ['RR'],
  sunshine: ['SO'],
  snow_depth: ['SCHNEE', 'SH'],
};

const round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

// TAWES units → the units the features publish.
const CONVERT = {
  // m/s → km/h, the unit of the Austrian and French forecasts.
  wind_speed: (value) => round(value * 3.6),
  wind_gust: (value) => round(value * 3.6),
  wind_direction: (value) => Math.round(value) % 360,
  // Rain of the last 10 minutes → an intensity in mm/h, the unit Gladys knows.
  rain_rate: (value) => round(value * 6),
  // Seconds of sunshine in the last 10 minutes → minutes (0 to 10).
  sunshine: (value) => round(value / 60),
};

/** The forecast parameters the integration reads (nwp-v1-1h-2500m). */
export const FORECAST_PARAMETERS = ['t2m', 'rr_acc', 'ugust', 'vgust', 'sy'];

/** Warning types of the warnings API (`warntypid`), with stable English keys. */
export const WARNING_TYPES = {
  1: 'wind',
  2: 'rain',
  3: 'snow',
  4: 'black_ice',
  5: 'thunderstorm',
  6: 'heat',
  7: 'cold',
};
export const WARNING_TYPE_KEYS = Object.values(WARNING_TYPES);

/** Warning levels (`warnstufeid`): 1 yellow, 2 orange, 3 red. */
export const WARNING_LEVELS = { 1: 'yellow', 2: 'orange', 3: 'red' };
export const WARNING_LEVEL_KEYS = Object.values(WARNING_LEVELS);

const finite = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** "2022-11-13T10:20+00:00" → epoch ms (null if unreadable). */
export function parseTime(text) {
  const time = typeof text === 'string' ? Date.parse(text) : NaN;
  return Number.isFinite(time) ? time : null;
}

/**
 * The station metadata of tawes-v1-10min: the active stations and the
 * parameter names the dataset offers.
 * @returns {{ stations: Array<{ id: string, name: string, state: string, lat: number, lon: number, altitude: number | null }>, parameters: Set<string> }}
 */
export function parseStations(metadata) {
  if (!metadata || !Array.isArray(metadata.stations)) {
    throw new Error('station metadata without a station list');
  }
  const stations = metadata.stations
    .filter((station) => station.is_active !== false)
    .map((station) => ({
      id: String(station.id),
      name: String(station.name ?? station.id),
      state: String(station.state ?? ''),
      lat: Number(station.lat),
      lon: Number(station.lon),
      altitude: finite(station.altitude),
    }))
    .filter((station) => Number.isFinite(station.lat) && Number.isFinite(station.lon));
  const parameters = new Set((metadata.parameters ?? []).map((parameter) => parameter.name));
  return { stations, parameters };
}

/**
 * The TAWES parameter name of every observation key, among those offered.
 * @param {Set<string>} available empty when unknown: the first alias is used
 * @returns {Record<string, string>}
 */
export function pickParameters(available) {
  const picked = {};
  for (const [key, aliases] of Object.entries(OBSERVATION_PARAMETERS)) {
    const name = available.size === 0 ? aliases[0] : aliases.find((alias) => available.has(alias));
    if (name) {
      picked[key] = name;
    }
  }
  return picked;
}

/** Great-circle distance in km. */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** The `count` stations nearest to a point, each with its `distance` in km. */
export function nearestStations(stations, lat, lon, count = 1) {
  return stations
    .map((station) => ({ ...station, distance: distanceKm(lat, lon, station.lat, station.lon) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count);
}

/** "GRAZ-THALERHOF-FLUGHAFEN" → "Graz-Thalerhof-Flughafen". */
export function stationLabel(name) {
  return String(name)
    .toLowerCase()
    .replace(/(^|[\s/\-(.])(\p{L})/gu, (_, sep, letter) => sep + letter.toUpperCase());
}

/**
 * The current observation of one station (tawes-v1-10min, current).
 * @param {object} payload
 * @param {Record<string, string>} parameterNames from pickParameters
 * @returns {{ time: number | null, values: Record<string, number> }} null readings left out
 */
export function parseObservation(payload, parameterNames) {
  const feature = payload?.features?.[0];
  const parameters = feature?.properties?.parameters;
  if (!parameters) {
    throw new Error('observation without parameters');
  }
  const values = {};
  for (const [key, name] of Object.entries(parameterNames)) {
    const data = parameters[name]?.data;
    const raw = finite(Array.isArray(data) ? data[data.length - 1] : data);
    if (raw !== null) {
      values[key] = CONVERT[key] ? CONVERT[key](raw) : round(raw);
    }
  }
  const timestamps = payload.timestamps ?? [];
  return { time: parseTime(timestamps[timestamps.length - 1]), values };
}

/**
 * An hourly forecast (timeseries/forecast/nwp-v1-1h-2500m) → hours.
 * `accumulated` is the precipitation since the model run (rr_acc), `gust` the
 * strongest gust of the hour in km/h.
 */
export function parseForecast(payload) {
  const parameters = payload?.features?.[0]?.properties?.parameters;
  const timestamps = payload?.timestamps;
  if (!parameters || !Array.isArray(timestamps)) {
    throw new Error('forecast without timestamps or parameters');
  }
  const series = (name) => parameters[name]?.data ?? [];
  const [t2m, rr, ugust, vgust, sy] = FORECAST_PARAMETERS.map(series);
  const hours = timestamps.map((text, index) => {
    const u = finite(ugust[index]);
    const v = finite(vgust[index]);
    return {
      time: parseTime(text),
      temperature: finite(t2m[index]),
      accumulated: finite(rr[index]),
      gust: u !== null && v !== null ? round(Math.hypot(u, v) * 3.6) : null,
      symbol: finite(sy[index]) === null ? null : Math.round(sy[index]),
    };
  });
  return {
    referenceTime: parseTime(payload.reference_time),
    hours: hours.filter((hour) => hour.time !== null),
  };
}

/** Local calendar day (YYYY-MM-DD) of an instant, in the Gladys time zone. */
export function localDay(time, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(time));
}

const minOf = (values) => (values.length === 0 ? null : round(Math.min(...values)));
const maxOf = (values) => (values.length === 0 ? null : round(Math.max(...values)));

/** Precipitation of the hours ending in `hours`: sum of the hourly increments. */
function precipitationOf(allHours, hours) {
  let total = 0;
  let known = false;
  for (const hour of hours) {
    const index = allHours.indexOf(hour);
    const previous = allHours[index - 1];
    if (!previous || hour.accumulated === null || previous.accumulated === null) {
      continue;
    }
    // rr_acc only grows; a drop would be a new accumulation (never seen).
    total += Math.max(0, hour.accumulated - previous.accumulated);
    known = true;
  }
  return known ? round(total) : null;
}

/**
 * What the place device and the widget show from a forecast, at `now`.
 * @param {{ hours: Array }} forecast from parseForecast
 * @param {number} now epoch ms
 * @param {string} [timeZone] IANA zone, the Gladys one (TZ) by default
 */
export function summarizeForecast(forecast, now, timeZone) {
  const hours = forecast.hours;
  const upcoming = hours.filter((hour) => hour.time > now);
  const next24 = upcoming.filter((hour) => hour.time <= now + 24 * 3600 * 1000);
  const tomorrow = localDay(now + 24 * 3600 * 1000, timeZone);
  // An instant belongs to its day; an hourly amount to the day it ends in.
  const tomorrowInstants = hours.filter((hour) => localDay(hour.time, timeZone) === tomorrow);
  const tomorrowAmounts = hours.filter((hour) => localDay(hour.time - 1, timeZone) === tomorrow);
  const temperatures = (list) => list.map((hour) => hour.temperature).filter((v) => v !== null);
  const gusts = next24.map((hour) => hour.gust).filter((v) => v !== null);
  // The weather of the coming hour: the first step not yet passed.
  const current = upcoming[0] ?? hours[hours.length - 1];
  return {
    symbol: current?.symbol ?? null,
    next24: {
      min: minOf(temperatures(next24)),
      max: maxOf(temperatures(next24)),
      precipitation: precipitationOf(hours, next24),
      gust: maxOf(gusts),
    },
    // The model runs 61 h ahead: tomorrow is complete unless the run is stale.
    tomorrow:
      tomorrowAmounts.length >= 23
        ? {
            min: minOf(temperatures(tomorrowInstants)),
            max: maxOf(temperatures(tomorrowInstants)),
            precipitation: precipitationOf(hours, tomorrowAmounts),
          }
        : { min: null, max: null, precipitation: null },
    temperatures: next24
      .filter((hour) => hour.temperature !== null)
      .map((hour) => ({ time: hour.time, value: hour.temperature })),
  };
}

/**
 * The warnings for one point (warnungen.zamg.at getWarningsForCoords).
 * @returns {{ municipality: string | null, warnings: Array<{ id: string, type: string, level: number, start: number, end: number, text: string, meteotext: string, impacts: string, advice: string }> }}
 */
export function parseWarnings(payload) {
  const properties = payload?.properties;
  if (!properties || typeof properties !== 'object') {
    throw new Error('warnings answer without properties');
  }
  const warnings = [];
  for (const entry of properties.warnings ?? []) {
    const warning = entry?.properties;
    if (!warning) {
      continue;
    }
    const raw = warning.rawinfo ?? {};
    const start = Number(raw.start) * 1000;
    const end = Number(raw.end) * 1000;
    const level = Number(raw.wlevel ?? warning.warnstufeid);
    const typeId = Number(raw.wtype ?? warning.warntypid);
    if (!Number.isFinite(start) || !Number.isFinite(end) || !WARNING_LEVELS[level]) {
      continue;
    }
    warnings.push({
      id: String(warning.warnid),
      type: WARNING_TYPES[typeId] ?? 'other',
      level,
      start,
      end,
      text: String(warning.text ?? ''),
      meteotext: String(warning.meteotext ?? ''),
      impacts: String(warning.auswirkungen ?? ''),
      advice: String(warning.empfehlungen ?? ''),
    });
  }
  warnings.sort((a, b) => a.start - b.start || b.level - a.level);
  const name = properties.location?.properties?.name;
  return { municipality: typeof name === 'string' && name !== '' ? name : null, warnings };
}

/** The warnings in force at `now`. */
export const warningsInForce = (warnings, now) =>
  warnings.filter((warning) => warning.start <= now && now < warning.end);

/** The warnings not over at `now` (in force or announced), soonest first. */
export const warningsAhead = (warnings, now) => warnings.filter((warning) => now < warning.end);

/** The highest level in force, overall and per type (0 = none). */
export function warningLevels(warnings, now) {
  const byType = Object.fromEntries(WARNING_TYPE_KEYS.map((type) => [type, 0]));
  let overall = 0;
  for (const warning of warningsInForce(warnings, now)) {
    overall = Math.max(overall, warning.level);
    if (warning.type in byType) {
      byType[warning.type] = Math.max(byType[warning.type], warning.level);
    }
  }
  return { overall, byType };
}
