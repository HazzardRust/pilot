/**
 * A `node --import` preload for the crash pins (daemon-lifecycle L2): the daemon gains no
 * fault switch, so the fault is planted from outside. It throws from a timer once the
 * daemon has had 500 ms to start; if the daemon is slower than that, it waits on in 100 ms
 * steps until something listens for `uncaughtException`, and throws anyway at 10 s, so a
 * daemon with no handler still crashes and the pin fails on what it pins rather than a timeout.
 *
 * It plants only under `THROW_IN_TIMER`: `throw` throws, `reject` leaves a rejection unhandled.
 * Unset, it does nothing, which is what the gate's glob needs when it runs every file under
 * `test/` as a test of its own.
 */

const MESSAGE = 'planted by throw-in-timer';
const startedAt = Date.now();

const plant = () => {
  if (process.listenerCount('uncaughtException') === 0 && Date.now() - startedAt < 10_000) {
    setTimeout(plant, 100);
    return;
  }
  if (process.env.THROW_IN_TIMER === 'reject') {
    Promise.reject(new Error(`${MESSAGE} (rejection)`));
    return;
  }
  throw new Error(`${MESSAGE} (throw)`);
};

if (process.env.THROW_IN_TIMER) setTimeout(plant, 500);
