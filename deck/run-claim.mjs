/**
 * The wrapper's claim (feature audit-f1-f7, spec 13, ADR 0113): the exclusive-create
 * claim that makes the `/clear` happen once, the lane's marker and the turn stamp it
 * reads, and the two waits (`waitFor`, `pause`). Moved out of `deck/run.mjs` whole and
 * in order; `deck/run.mjs` imports what it uses from here and re-exports
 * `claimNameFor` and `takeClaim`, so no import of the old path changed.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { privateDir } from '../hooks/lib/atomic-write.js';

// --- the claim's spelling ---------------------------------------------------

/** Where the hooks keep their claims. Read when asked, so a test's home works. */
const claimDir = () => path.join(os.homedir(), '.claude', 'pilot-inbox', 'claims');

/** An id made safe to put in a file name, `sessionKey`'s rule spelled again. */
const safeName = (id) => (typeof id === 'string' ? id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'x' : 'x');

/**
 * One claim per hand-off, under a name that is not S20's.
 *
 * Both halves act on the same item and both must act: this one types the
 * `/clear`, the lane hands the body to the session the `/clear` creates. One
 * shared claim would mean whichever ran first silenced the other, so the names
 * differ by design and the test pins that they do. Keyed on the item rather
 * than the session for the lane's reason: whether `/clear` mints a fresh
 * session id is the harness's business, and "once per hand-off" is what was
 * actually asked for.
 */
export const claimNameFor = (itemId) => `clear-typed-${safeName(itemId)}`;

/**
 * The exclusive-create claim idiom, as the hooks use it: the file's existence
 * is the record that this has been done, and an exclusive create is atomic
 * across processes, so exactly one of two wrappers watching one directory wins
 * it. Nothing deletes it on the happy path, so there is no lock to be left
 * held.
 */
export function takeClaim(name) {
  try {
    privateDir(path.dirname(claimDir())); // pilot-inbox itself, then its claims (L6)
    privateDir(claimDir());
    fs.closeSync(fs.openSync(path.join(claimDir(), `${name}.claim`), 'wx'));
    return true;
  } catch (err) {
    // EEXIST means it has been typed. Anything else — an unwritable home, a
    // full disk — errs towards not typing into the user's terminal at all,
    // which is the opposite of the hooks' bias and the right one here: the
    // worst a silent wrapper costs is the user typing `/clear` themselves.
    // Nothing else creates the file, so the next change event retries.
    return false;
  }
}

/**
 * Give a claim back. The file's name is a claim that the `/clear` *was typed*,
 * so a claim taken for a write that then failed is a lie that would stop every
 * later attempt — including a fresh `pilot run` — from typing it. `unclaim` in
 * `hooks/lib/deck.js` is the same idiom, spelled here for the same reason as
 * the rest of this section.
 */
function releaseClaim(name) {
  try {
    fs.unlinkSync(path.join(claimDir(), `${name}.claim`));
  } catch (err) {
    /* there was nothing to give back */
  }
}

/**
 * Whether S20's lane has handed this hand-off to a session: its claim,
 * `claimFor` in `hooks/session-handoff.js`, spelled here for this section's
 * reason. `deck/test/run.test.mjs` writes it with the lane's own half.
 */
const laneMarked = (itemId) => fs.existsSync(path.join(claimDir(), `handoff-${safeName(itemId)}.claim`));

/**
 * When the session this wrapper started last wrote the stamp `name`, as
 * `stampRun` in `hooks/lib/deck.js` writes it, in ms, or 0 for never.
 */
function stampAt(name) {
  try {
    return Number(fs.readFileSync(path.join(claimDir(), `${name}-${safeName(String(process.pid))}.stamp`), 'utf8')) || 0;
  } catch (err) {
    return 0;
  }
}

/** When that session last ended a turn, as the Stop gate stamps it (`markTurnEnded`). */
const lastTurnEnded = () => stampAt('turn-ended');

/** When that session last ran a tool itself, as `post-tool.js` stamps it (`markToolRan`). */
const lastToolRan = () => stampAt('tool-ran');

/**
 * Wait until `done()` holds, or stop waiting. Answers whether it held: the
 * session ending, or the wait running out, is keys nobody types.
 */
async function waitFor(done, { signal, pollMs, waitMs }) {
  const until = Date.now() + waitMs;
  while (!signal.aborted) {
    if (done()) return true;
    if (Date.now() >= until) return false;
    await pause(pollMs, signal);
  }
  return false;
}

/**
 * Wait, or stop waiting. The listener is taken off again when the timer wins,
 * because this runs once every couple of seconds for as long as a session
 * lasts and `{ once: true }` only removes a listener that actually fired.
 */
const pause = (ms, signal) => new Promise((resolve) => {
  const stop = () => { clearTimeout(timer); resolve(); };
  const timer = setTimeout(() => { signal.removeEventListener('abort', stop); resolve(); }, ms);
  signal.addEventListener('abort', stop, { once: true });
});

export { releaseClaim, laneMarked, lastTurnEnded, lastToolRan, waitFor, pause, safeName };
