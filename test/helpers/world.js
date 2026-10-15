// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a simulated GeoSphere, a
// controllable clock, an in-memory /data and a recording logger, with the
// integration wired on top through registerHandlers.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { MemoryStore } from '../../src/store.js';
import { NOW, TIME_ZONE, createFakeGeoSphere } from './fakeGeoSphere.js';

/** A house in the center of Graz (public coordinates of the main square). */
export const HOUSE = {
  id: 'house-1',
  name: 'Maison',
  selector: 'maison',
  latitude: 47.0707,
  longitude: 15.4382,
};

/** A logger that records every line, by level. */
export function createRecordingLogger() {
  const lines = [];
  const make = (name) => {
    const log =
      (level) =>
      (...args) =>
        lines.push({ level, name, text: args.map(String).join(' ') });
    return {
      debug: log('debug'),
      info: log('info'),
      warn: log('warn'),
      error: log('error'),
      child: (child) => make(`${name}:${child}`),
    };
  };
  return {
    logger: make('geosphere'),
    lines,
    at: (level) => lines.filter((l) => l.level === level),
  };
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.houses]
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {boolean} [options.connect]
 * @param {boolean} [options.timers]
 * @param {object} [options.store]
 * @param {number} [options.start] initial clock
 */
export async function createWorld({
  config = {},
  houses = [HOUSE],
  devices = [],
  connect = true,
  timers = false,
  store = new MemoryStore(),
  start = NOW,
} = {}) {
  const clock = { now: start };
  const now = () => clock.now;
  const geosphere = createFakeGeoSphere({ now });
  const gladys = createFakeGladys({ config, houses, devices });
  const recording = createRecordingLogger();
  const app = registerHandlers(gladys, {
    fetch: geosphere.fetch,
    store,
    now,
    timers,
    logger: recording.logger,
    timeZone: TIME_ZONE,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return {
    gladys,
    geosphere,
    app,
    clock,
    store,
    logs: recording,
    /** Add every discovered device to Gladys, as the user would. */
    async createAll() {
      for (const device of gladys.fake.discoveredDevices) {
        await gladys.fake.deviceCreated(device);
      }
    },
    /** Move the clock and run one refresh cycle, as the timer would. */
    async refresh(minutes = 10) {
      clock.now += minutes * 60 * 1000;
      await app.service.cycle();
    },
  };
}

export const featureId = (gladys, type, platformId, key) =>
  gladys.externalIds(type, platformId).feature(key);
