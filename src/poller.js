// -----------------------------------------------------------------------------
// The container's own refresh timer.
//
// The devices are published with `should_poll: true` and a poll frequency of
// one minute, but the core cannot be trusted to call onPoll: Gladys 5.2.x
// skips devices created without `should_poll`, and a device keeps the polling
// fields it was created with (GladysAssistant/Gladys#3198). So the container
// refreshes by itself at the configured pace (10 minutes by default), and the
// core's onPoll is a fallback that only acts when the timer has stalled.
//
// A cycle reads GeoSphere even when no device is added: the widget and the
// "new warning" trigger need the data too.
// -----------------------------------------------------------------------------

/**
 * @param {object} options
 * @param {object} options.gladys
 * @param {{ cycle: Function }} options.service
 * @param {() => object} options.getConfig the normalized config (refreshMs)
 * @param {object} options.logger
 * @param {() => number} options.now
 * @param {boolean} [options.timers] run the periodic timer (tests may turn it off)
 * @param {(changed: boolean) => void} [options.onCycle] called after each cycle
 */
export function createPoller({ gladys, service, getConfig, logger, now, timers = true, onCycle }) {
  let timer = null;
  let stopped = true;
  let inFlight = null;
  let lastCycleAt = null;

  /** One cycle at a time: a second caller shares the one in progress. */
  function runCycle(options) {
    if (inFlight) {
      return inFlight;
    }
    lastCycleAt = now();
    inFlight = (async () => {
      try {
        const changed = await service.cycle(options);
        onCycle?.(changed);
      } catch (err) {
        logger.error(`Refresh cycle failed (${err.message})`);
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (!timers || stopped) {
      return;
    }
    timer = setTimeout(async () => {
      timer = null;
      if (gladys.connected === false) {
        logger.debug('Gladys unreachable: refresh skipped');
      } else {
        await runCycle();
      }
      schedule();
    }, getConfig().refreshMs);
  }

  return {
    /** (Re)start: a new config, a (re)connection. Refreshes now, then on the timer. */
    async restart() {
      stopped = false;
      schedule();
      // A cycle in progress may predate the new config: wait for it first.
      await inFlight;
      await runCycle();
    },

    /**
     * The core's onPoll (fallback): refreshes only if the timer has not done
     * it for 90 % of a period.
     */
    async pollFromCore(device) {
      if (lastCycleAt !== null && now() - lastCycleAt < getConfig().refreshMs * 0.9) {
        logger.debug(`onPoll ${device.external_id}: refreshed recently, skipped`);
        return;
      }
      await runCycle();
    },

    /** The cycle in progress, if any (tests). */
    get idle() {
      return inFlight ?? Promise.resolve();
    },

    stop() {
      stopped = true;
      clearTimeout(timer);
      timer = null;
    },
  };
}
