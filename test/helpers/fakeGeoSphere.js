// -----------------------------------------------------------------------------
// A simulated GeoSphere Austria: a `fetch` that answers the four endpoints of
// the integration with the recorded fixtures of test/fixtures. No network.
//
// The recorded answers are dated (2022 to 2024): the observation is re-dated
// to the last 10-minute step before the test clock, and the warnings are
// placed around it by `warningsAround`.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));

export const FIXTURES = {
  stations: fixture('stations-metadata.json'),
  current: fixture('station-current.json'),
  forecast: fixture('forecast-graz.json'),
  warnings: fixture('warnings-salzburg.json'),
  noWarnings: fixture('warnings-none.json'),
};

/** Test clock: Wednesday 14 October 2026, 12:05 in Vienna (10:05 UTC). */
export const NOW = Date.parse('2026-10-14T10:05:00Z');
export const TIME_ZONE = 'Europe/Vienna';

const HOUR = 3600 * 1000;
const iso = (time) => `${new Date(time).toISOString().slice(0, 16)}+00:00`;

/**
 * The recorded warnings (heat, thunderstorm, black ice), re-dated.
 * @param {number} now
 * @param {Array<{ start: number, end: number, level?: number }>} layout offsets in hours from now
 */
export function warningsAround(now, layout) {
  const answer = structuredClone(FIXTURES.warnings);
  answer.properties.warnings = layout.map((slot, index) => {
    const warning = structuredClone(FIXTURES.warnings.properties.warnings[index]);
    const props = warning.properties;
    props.rawinfo.start = String(Math.round((now + slot.start * HOUR) / 1000));
    props.rawinfo.end = String(Math.round((now + slot.end * HOUR) / 1000));
    if (slot.level) {
      props.rawinfo.wlevel = slot.level;
      props.warnstufeid = slot.level;
    }
    return warning;
  });
  return answer;
}

/**
 * @param {object} [options]
 * @param {() => number} [options.now]
 */
export function createFakeGeoSphere({ now = () => NOW } = {}) {
  const requests = [];
  // Answers by endpoint: a JSON body, a function of the URL, or an Error.
  const answers = {
    stations: FIXTURES.stations,
    current: () => {
      const answer = structuredClone(FIXTURES.current);
      const step = Math.floor((now() - 5 * 60 * 1000) / (10 * 60 * 1000)) * 10 * 60 * 1000;
      answer.timestamps = [iso(step)];
      return answer;
    },
    forecast: FIXTURES.forecast,
    warnings: FIXTURES.noWarnings,
  };

  const endpointOf = (url) => {
    if (url.host === 'warnungen.zamg.at') return 'warnings';
    if (url.pathname.endsWith('/metadata')) return 'stations';
    if (url.pathname.includes('/timeseries/forecast/')) return 'forecast';
    if (url.pathname.endsWith('/tawes-v1-10min')) return 'current';
    return null;
  };

  async function fetch(input) {
    const url = new URL(String(input));
    const endpoint = endpointOf(url);
    requests.push({ endpoint, url });
    const answer = answers[endpoint];
    if (answer instanceof Error) {
      throw answer;
    }
    if (answer && typeof answer === 'object' && answer.status) {
      return new Response(answer.body ?? 'error', { status: answer.status });
    }
    const body = typeof answer === 'function' ? answer(url) : answer;
    if (body === undefined) {
      return new Response('not found', { status: 404 });
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  return {
    fetch,
    requests,
    answers,
    /** Requests per endpoint. */
    count: (endpoint) => requests.filter((request) => request.endpoint === endpoint).length,
  };
}
