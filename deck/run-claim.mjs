/**
 * The hand-off mod's claims and stamps (handoff-mod L1, A6): the exclusive-create claim that makes the `/clear`
 * happen once, the lane's marker, and the one spelling of the session stamps, `posted-<pid>` and `mod-<pid>`,
 * that the look (`deck/run-look.mjs`), `pilot handoff` and the deck client all read or write. A leaf: it imports
 * nothing of the deck's, so the client can use it without the store entering its graph.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { privateDir } from '../hooks/lib/atomic-write.js';

// --- the claim's spelling ---------------------------------------------------

/** Where the hooks keep their claims. Read when asked, so a test's home works. */
export const claimDir = (home = os.homedir()) => path.join(home, '.claude', 'pilot-inbox', 'claims');

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
 * across processes, so exactly one of two lookers wins it. Nothing deletes it
 * on the happy path, so there is no lock to be left held.
 */
export function takeClaim(name) {
  try {
    privateDir(path.dirname(claimDir())); // pilot-inbox itself, then its claims (L6)
    privateDir(claimDir());
    fs.closeSync(fs.openSync(path.join(claimDir(), `${name}.claim`), 'wx'));
    return true;
  } catch (err) {
    // EEXIST means it has been typed. Anything else — an unwritable home, a
    // full disk — errs towards not clearing the user's session at all,
    // which is the opposite of the hooks' bias and the right one here: the
    // worst a silent mod costs is the user typing `/clear` themselves.
    // Nothing else creates the file, so the next look retries.
    return false;
  }
}

/**
 * Whether S20's lane has handed this hand-off to a session: its claim,
 * `claimFor` in `hooks/session-handoff.js`, spelled here for this section's
 * reason.
 */
export const laneMarked = (itemId) => fs.existsSync(path.join(claimDir(), `handoff-${safeName(itemId)}.claim`));

// --- the session stamps -----------------------------------------------------

/** The Claude Code process: `CLAUDE_PID` when it is a positive integer, else the caller's parent. */
export function sessionPid(env, ppid) {
  const pid = /^\d+$/.test(env?.CLAUDE_PID ?? '') ? Number(env.CLAUDE_PID) : 0;
  return pid > 0 ? pid : ppid;
}

/** Posted: the id of the hand-off this session posted, so its mod, and no other session's, clears for it (A6). */
export const postedFile = (pid, home) => path.join(claimDir(home), `posted-${pid}.stamp`);

/** Reported in: the mod ran the look's `start` in this session (`pilot handoff` reads it). */
export const reportedFile = (pid) => path.join(claimDir(), `mod-${pid}.stamp`);

/**
 * Write the posted stamp for session `pid`. A stamp that cannot be written leaves the hand-off posted and the
 * session uncleared, as with no mod, and says so on stderr. Answers whether it was written.
 */
export function notePosted(pid, id, home) {
  const claims = claimDir(home);
  try {
    privateDir(path.dirname(claims));
    privateDir(claims);
    fs.writeFileSync(postedFile(pid, home), id);
    return true;
  } catch (err) {
    console.error('[pilot] the posted stamp was not written:', err.message);
    return false;
  }
}
