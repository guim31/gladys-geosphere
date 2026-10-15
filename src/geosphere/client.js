// -----------------------------------------------------------------------------
// HTTP client of the GeoSphere Austria public APIs (no account, no key):
//   - Data Hub (dataset.api.hub.geosphere.at): TAWES station metadata and
//     current observations, hourly model forecast (2.5 km grid);
//   - weather warnings (warnungen.zamg.at): the warnings for one point.
// Read-only GET requests. The query strings carry the home coordinates, a
// sensitive personal data: they are never logged, only the path is.
// -----------------------------------------------------------------------------

const DATA_HUB = 'https://dataset.api.hub.geosphere.at/v1';
export const URLS = {
  stations: `${DATA_HUB}/station/current/tawes-v1-10min/metadata`,
  current: `${DATA_HUB}/station/current/tawes-v1-10min`,
  forecast: `${DATA_HUB}/timeseries/forecast/nwp-v1-1h-2500m`,
  warnings: 'https://warnungen.zamg.at/wsapp/api/getWarningsForCoords',
};

/** An answer that is not the expected JSON: `status` is the HTTP status, if any. */
export class GeoSphereError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'GeoSphereError';
    this.status = status;
  }
}

const coordinate = (value) => Number(value).toFixed(4);

/**
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch]
 * @param {number} [options.timeoutMs]
 * @param {string} [options.userAgent]
 * @param {{ debug: Function }} [options.logger]
 */
export function createGeoSphereClient({
  fetch = globalThis.fetch,
  timeoutMs = 15000,
  userAgent = 'gladys-geosphere (+https://github.com/guim31/gladys-geosphere)',
  logger,
} = {}) {
  async function getJson(base, query = {}) {
    const url = new URL(base);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
    const where = url.host + url.pathname;
    logger?.debug(`GET ${where}`);
    let response;
    try {
      response = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': userAgent },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const reason =
        err.name === 'TimeoutError' ? `no answer within ${timeoutMs / 1000} s` : err.message;
      throw new GeoSphereError(`${url.host} unreachable (${reason})`);
    }
    if (response.status === 429) {
      throw new GeoSphereError(`${url.host} rate limit reached (HTTP 429)`, 429);
    }
    if (!response.ok) {
      throw new GeoSphereError(`${where} answered HTTP ${response.status}`, response.status);
    }
    try {
      return await response.json();
    } catch {
      throw new GeoSphereError(`${where} answered something that is not JSON`, response.status);
    }
  }

  return {
    /** Metadata of the TAWES 10-minute dataset: stations and parameters. */
    stations: () => getJson(URLS.stations),

    /** Latest 10-minute observation of one station. */
    current: (stationId, parameterNames) =>
      getJson(URLS.current, {
        parameters: parameterNames.join(','),
        station_ids: stationId,
      }),

    /** Hourly forecast at one point. */
    forecast: (lat, lon, parameterNames) =>
      getJson(URLS.forecast, {
        parameters: parameterNames.join(','),
        lat_lon: `${coordinate(lat)},${coordinate(lon)}`,
      }),

    /** Warnings at one point; `lang` is 'de' or 'en' (the texts of the service). */
    warnings: (lat, lon, lang) =>
      getJson(URLS.warnings, { lon: coordinate(lon), lat: coordinate(lat), lang }),
  };
}
