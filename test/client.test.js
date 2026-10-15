// The HTTP client: URLs and queries of the four endpoints, error messages,
// and no home coordinates in the logs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeoSphereError, URLS, createGeoSphereClient } from '../src/geosphere/client.js';
import { createRecordingLogger } from './helpers/world.js';

function recordingFetch(answer) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: new URL(String(url)), init });
    return typeof answer === 'function' ? answer() : answer;
  };
  return { fetch, calls };
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('the four endpoints and their queries', async () => {
  const { fetch, calls } = recordingFetch(() => json({ ok: true }));
  const client = createGeoSphereClient({ fetch });
  await client.stations();
  await client.current('11035', ['TL', 'RFAM']);
  await client.forecast(47.070712, 15.43821, ['t2m', 'sy']);
  await client.warnings(47.070712, 15.43821, 'de');
  assert.equal(calls[0].url.href, URLS.stations);
  assert.equal(calls[1].url.origin + calls[1].url.pathname, URLS.current);
  assert.equal(calls[1].url.searchParams.get('parameters'), 'TL,RFAM');
  assert.equal(calls[1].url.searchParams.get('station_ids'), '11035');
  assert.equal(calls[2].url.searchParams.get('lat_lon'), '47.0707,15.4382');
  assert.equal(calls[2].url.searchParams.get('parameters'), 't2m,sy');
  assert.equal(calls[3].url.host, 'warnungen.zamg.at');
  assert.deepEqual(Object.fromEntries(calls[3].url.searchParams), {
    lon: '15.4382',
    lat: '47.0707',
    lang: 'de',
  });
  for (const call of calls) {
    assert.match(call.init.headers['user-agent'], /gladys-geosphere/);
    assert.ok(call.init.signal instanceof AbortSignal);
  }
});

test('HTTP errors, rate limit, non-JSON and network failures become clear errors', async () => {
  const cases = [
    [() => json({}, 500), /answered HTTP 500/],
    [() => json({}, 429), /rate limit reached/],
    [() => new Response('<html>', { status: 200 }), /not JSON/],
    [
      () => {
        throw new TypeError('fetch failed');
      },
      /unreachable \(fetch failed\)/,
    ],
    [
      () => {
        throw Object.assign(new Error('aborted'), { name: 'TimeoutError' });
      },
      /no answer within 15 s/,
    ],
  ];
  for (const [answer, message] of cases) {
    const client = createGeoSphereClient({ fetch: recordingFetch(answer).fetch });
    await assert.rejects(
      client.stations(),
      (err) => err instanceof GeoSphereError && message.test(err.message),
    );
  }
});

test('the coordinates of the house never reach the logs', async () => {
  const { logger, lines } = createRecordingLogger();
  const client = createGeoSphereClient({
    fetch: recordingFetch(() => json({}, 503)).fetch,
    logger,
  });
  await client.forecast(47.0707, 15.4382, ['t2m']).catch(() => {});
  await assert.rejects(client.warnings(47.0707, 15.4382, 'en'), (err) => {
    assert.doesNotMatch(err.message, /47\.07|15\.43/);
    return true;
  });
  assert.ok(lines.length > 0);
  for (const line of lines) {
    assert.doesNotMatch(line.text, /47\.07|15\.43/);
  }
});
