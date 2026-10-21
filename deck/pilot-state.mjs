/**
 * The pilot's state for one repository, read at render time and never stored (pilot-state-line, ADR 0149).
 *
 * Pure over what the home page already holds: the tab, the items, the held-wait map and a clock. No
 * item field, no tool argument and no store write carries it (L1), so no agent sets or clears it.
 * Its own module rather than beside `accentOf` in `items.mjs`, which two adjacent runs own (L2).
 */

import { KIND_HANDOFF, isOpen, liveTicketOf, repoKey, sameRepo } from './items.mjs';

/** How long a resolved `handoff` reads `picked up`, and a deck write `working` (A3). S4 arms its lapses from these. */
export const PICKED_UP_MS = 5 * 60_000;
export const WORKING_MS = 10 * 60_000;

const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);

/** The newest of these stamps in ms, or null when none parses. */
function newestOf(stamps) {
  const times = stamps.map((stamp) => (typeof stamp === 'string' ? Date.parse(stamp) : NaN)).filter(Number.isFinite);
  return times.length ? Math.max(...times) : null;
}

const within = (ms, window, now) => ms !== null && now - ms < window;

/**
 * One state line: `state` (`handing off`, `listening`, `no session`, `picked up`, `working` or `quiet`,
 * checked in that order, L3), `since` the moment its signal began (ISO, or null), and `ticket` the
 * live ticket's title (or null).
 *
 * `handing off` is any open `handoff` in the repository, plain or chain; a `crew-handoff` is a crew
 * agent's and is not the pilot's (L4). `listening` is a held wait, keyed by `repoKey`. A tab with no
 * live run is `no session`. `picked up` is the repository's newest resolved `handoff`, for
 * `PICKED_UP_MS` after `resolvedAt`; `working` is a run's `lastSeenAt` within `WORKING_MS`, or any crew
 * agent on the roster, which was seen inside its 90 s window and so counts as a signal at `now`; any
 * other live tab is `quiet` since its last write (L11). `now` is the clock: nothing here reads another.
 */
export function pilotStateOf(tab, items, held, now) {
  const ticket = liveTicketOf(items, tab.repo)?.title ?? null;
  const line = (state, since) => ({ state, since: iso(since), ticket });
  const handoffs = items.filter((item) => item?.kind === KIND_HANDOFF && sameRepo(item.repo, tab.repo));
  const open = handoffs.filter(isOpen);
  if (open.length) return line('handing off', newestOf(open.map((item) => item.postedAt)));
  const key = repoKey(tab.repo);
  if (held && Object.hasOwn(held, key)) return line('listening', held[key]);
  if (tab.ended) return line('no session', null);
  const resolved = newestOf(handoffs.map((item) => item.resolvedAt));
  if (within(resolved, PICKED_UP_MS, now)) return line('picked up', resolved);
  const written = newestOf((tab.runs ?? []).map((run) => run.lastSeenAt));
  if (tab.agents?.length) return line('working', now);
  if (within(written, WORKING_MS, now)) return line('working', written);
  return line('quiet', written);
}
