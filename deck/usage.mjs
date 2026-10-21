/**
 * How much of the user's allowance is gone: the context window, the five-hour
 * limit and the weekly one, read out of the file the status line writes.
 *
 * Two of the three are the account's and the same wherever they are read; the
 * context window is one *deck's*, which is why every reading here is asked for
 * a directory (spec 31). The file holds one entry per directory beside its
 * account-wide figures, and this asks it about one.
 *
 * The deck does not measure any of this and cannot. Live usage reaches a Claude
 * Code session on exactly one surface — the status line's stdin — so
 * `hooks/context-usage-statusline.js` renders it and drops a snapshot in
 * `~/.claude/context-usage-state.json` for anything else that wants it. This
 * module is a reader of that file and never a writer of it (spec 11, D16): the
 * hook is its single writer, and a second one would only be a new way for the
 * status line and the page to disagree.
 *
 * The path is re-declared here rather than imported from the hook, which is the
 * same trade `deck/runs.mjs` makes and `hooks/context-usage-statusline.js` makes
 * for the deck's own store: the hooks are dependency-free CommonJS that has to
 * keep working as a bare `node <path>` with no package around it, and the deck
 * is ESM. D16 records the choice.
 *
 * Everything below is written for a file this program did not write and cannot
 * fix. It is absent on a machine whose status line has never run, empty or half
 * a JSON object when a reader catches it mid-write, and missing whole readings
 * on the auth modes that carry no rate limits — so every field is checked, and
 * a reading the file does not give is `null`, which the page says as "unknown".
 * Nothing here throws, because the page has to keep working when it cannot say
 * a number.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { repoKey } from './runs.mjs';

/**
 * Resolved per call rather than at load, so a process that sets
 * `PILOT_USAGE_FILE` after importing this still reads the file it named — the
 * rule `deckFile()` in the status-line hook already follows. The variable moves
 * the file for the suite, which reads a scratch copy instead of the real one.
 */
export function usageFile() {
  return (
    process.env.PILOT_USAGE_FILE ||
    path.join(os.homedir(), '.claude', 'context-usage-state.json')
  );
}

/**
 * A percentage, as the status line shows it. Rounded, because the figure on the
 * page has to be the figure on the line and the line is `toFixed(0)`; anything
 * that is not a finite number is no reading at all.
 */
const percent = (pct) => (Number.isFinite(pct) ? Math.round(pct) : null);

/**
 * A reset time as the browser's `<time datetime>` wants it. The hook writes
 * unix epoch *seconds*, per the Claude Code payload it reads them from; the
 * page needs an ISO stamp, and this is the one place that knows both.
 *
 * `toISOString` throws on a date outside the range one can hold, so the number
 * is converted and then checked rather than trusted: a stamp the deck cannot
 * read is no stamp, and must not cost the reading it was attached to.
 */
function stampOf(seconds) {
  if (!Number.isFinite(seconds)) return null;
  const at = new Date(seconds * 1000);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/** A rate limit: its percentage, and when it goes back to nothing. */
function limitOf(block) {
  const pct = percent(block?.pct);
  return pct === null ? null : { pct, resetsAt: stampOf(block.resetsAt) };
}

/**
 * How long an entry in the `decks` map is a reading (A11). Twelve hours is long
 * enough that a session parked over a lunch or a meeting still shows its figure
 * and short enough that yesterday's run does not. The hook prunes on the same
 * number as it writes (`DECK_WINDOW_MS` there), written out here for the reason
 * the path above is: there is no module boundary between the two to import
 * across. This comment is the join — change one and change the other.
 */
const DECK_WINDOW_MS = 12 * 60 * 60 * 1000;

/**
 * One deck's context reading: the entry the status line of the session in that
 * directory last wrote, or `null` (spec 31, L31).
 *
 * Null covers four cases the page reads the same way, and deliberately so: a
 * directory the map says nothing about, a session that finished long enough ago
 * that its figure has stopped being true (L33), a snapshot written before the
 * map existed, and a deck nobody asked about. A percentage would be a claim in
 * every one of them, and the one the deck must never make is another deck's.
 *
 * A blank path names no deck, for the reason `namesATab` refuses one
 * (`deck/tabs.mjs`): `path.resolve('')` is the *current* directory, so a blank
 * would quietly answer with whatever directory the daemon happens to have been
 * started in.
 */
function ctxFor(state, deck) {
  if (typeof deck !== 'string' || deck.trim() === '') return null;
  const decks = state?.decks;
  // Absence and nothing else: a `decks` that is not a map — this file is half a
  // JSON object as often as a whole one — indexes to `undefined` and falls out
  // at the `Date.parse` below, where every other kind of nonsense falls out.
  if (!decks) return null;
  const entry = decks[repoKey(deck)];
  const at = Date.parse(entry?.at);
  if (!Number.isFinite(at) || Date.now() - at > DECK_WINDOW_MS) return null;
  return percent(entry.ctx);
}

/**
 * The three readings for one deck, or `null` for each one the file does not
 * give. `deck` is the working directory of the deck the page is showing; the
 * overview is a page of no deck and passes none.
 *
 * Only `ctx` is that deck's. The two rate limits are the account's — one
 * allowance, spent by every session on the machine — so they read the same on
 * every tab and on the overview, which is what spec 31 asks for.
 *
 * Read fresh on every call and never held: the whole point of the figure is
 * that it is the one the status line last wrote, and a copy kept here would go
 * stale between polls with nothing to correct it (D16).
 *
 * Only the three are returned — never the `decks` map itself, which is every
 * directory on the machine and no business of a page that asked about one, and
 * never the `session_id` of whichever session wrote the file last.
 *
 * `ctx` is wrapped as `{ pct }` although the file holds a bare number, so that
 * the browser reads one shape for all three and branches on nothing. It carries
 * no `resetsAt`: a context window is compacted, not reset on a clock.
 */
export function readUsage(deck = null) {
  let state;
  try {
    state = JSON.parse(fs.readFileSync(usageFile(), 'utf8'));
  } catch {
    state = null;
  }
  const ctx = ctxFor(state, deck);
  return {
    ctx: ctx === null ? null : { pct: ctx },
    session: limitOf(state?.session),
    weekly: limitOf(state?.weekly),
  };
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * The whole snapshot, for the usage log (ADR 0043): the two limits, every deck's
 * context reading still inside `DECK_WINDOW_MS`, and the file's mtime as `at`,
 * because the hook stamps nothing of its own and carries the limits forward, so
 * a limit is only as fresh as the last write. Never the `session_id`. A file
 * that is not there is `absent`; one that does not read as a JSON object, which
 * is how a reader catches it mid-write, is `malformed`. Read, never written.
 */
export function readSnapshot() {
  let at;
  let state;
  try {
    const file = usageFile();
    at = fs.statSync(file).mtime.toISOString();
    state = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return { snapshot: null, snapshotError: err?.code === 'ENOENT' ? 'absent' : 'malformed' };
  }
  if (!isObject(state)) return { snapshot: null, snapshotError: 'malformed' };
  const decks = Object.entries(isObject(state.decks) ? state.decks : {})
    .filter(([, entry]) => Date.now() - Date.parse(entry?.at) <= DECK_WINDOW_MS && percent(entry.ctx) !== null)
    .map(([dir, entry]) => [dir, percent(entry.ctx)]);
  return { snapshot: { at, session: limitOf(state.session), weekly: limitOf(state.weekly), decks: Object.fromEntries(decks) } };
}
