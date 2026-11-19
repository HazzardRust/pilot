/**
 * A directory's three lanes as every surface prints them (idle-main-lane L2; ADR 0123; three-lanes spec 1, 3): the
 * planning lane's red ticket, the concluding lane's green one, and the co-pilot's. The rule that an idle lane is refused
 * lives here once, on `laneOf`, with every spelling of it; the hooks are CommonJS and cannot import this, so they
 * print the strings the daemon hands them on `GET /api/record`.
 */

import {
  KIND_HANDOFF, KIND_TICKET, LANE_STATES, coPilotStateOf, isAnswered, isBlocking, isOpen, isShortPath, liveTicketOf, nextTicketOf,
  sameRepo, stateOf, switchOf, ticketQueueOf, unansweredBlockers,
} from './items.mjs';
import { crewSeenAt } from './agents.mjs';
import { isLiveCoPilot, readDeck, storedCoPilot, switchesOf } from './store-core.mjs';

/** How long the co-pilot's held ticket waits on an unanswered blocking question before the deck pauses it (blocked-yellow-yields spec 5, L4). */
export const YIELD_MS = 20 * 60_000;

/**
 * The yields due in `repo` by `now` (blocked-yellow-yields spec 1; L2, L5, A1), pure: only `coPilotTicket`, the live
 * co-pilot's open yellow ticket, and only on an open blocking question or walkthrough (never-stuck spec 8) naming it with no message from the user on it,
 * `YIELD_MS` past its `postedAt`. Each is `{ ticket, question, at }`; the timer passes `Infinity` to arm every one ahead.
 * A ticket already `yielding` is draining (never-stuck L6) and yields nothing more.
 */
export function yieldsDue(items, repo, coPilotTicket, now) {
  const ticket = items.find((item) => item?.id === coPilotTicket && item.kind === KIND_TICKET);
  if (!ticket || ticket.yielding || !isOpen(ticket) || stateOf(ticket) !== 'yellow' || !sameRepo(ticket.repo, repo)) return [];
  return items
    .filter((item) => isBlocking(item) && item.ticket === ticket.id && sameRepo(item.repo, repo))
    .filter((item) => !isAnswered(item))
    .map((item) => ({ ticket: ticket.id, question: item.id, at: Date.parse(item.postedAt) + YIELD_MS }))
    .filter(({ at }) => at <= now);
}

/** How long a held yellow ticket's crew may make no tool call before the ticket reads idle (yellow-never-idle spec 5, A2). */
export const IDLE_MS = 20 * 60_000;

/**
 * The idle rule (yellow-never-idle spec 5, 8; L4, L5), pure, for the refusal and the wake timer alike: `held`, the live
 * co-pilot's ticket, open and yellow in `repo`, not draining and with no unanswered blocking item, goes idle at
 * `seenAt + IDLE_MS`, `seenAt` being `crewSeenAt(repo)`. `at` is returned even while it is ahead of `now`, so a timer
 * can arm on it; else null.
 */
export function idleYellowOf(items, repo, held, seenAt, now) {
  const ticket = items.find((item) => item?.id === held && item.kind === KIND_TICKET);
  if (!ticket || ticket.yielding || !isOpen(ticket) || stateOf(ticket) !== 'yellow' || !sameRepo(ticket.repo, repo)) return null;
  if (unansweredBlockers(items, ticket.id).length) return null;
  return { ticket: ticket.id, at: seenAt + IDLE_MS };
}

/** The idle yellow ticket's refusal line, or null; a caller that passes no crew-seen moment never reads idle (red team, A-8 callers). */
function idleRefusal(items, repo, held, seenAt, now) {
  if (typeof seenAt !== 'number') return null;
  const idle = idleYellowOf(items, repo, held, seenAt, now);
  return idle && idle.at <= now
    ? `yellow lane idle; ${idle.ticket} has had no crew for ${IDLE_MS / 60_000} min — deck_ticket need it if its walkthrough or gate2 is up, else release it and spawn its successor`
    : null;
}

/** The most skipped yellow tickets the co-pilot lane names, the bound `hooks/session-handoff.js` echoes (spec 2; never-stuck spec 9). */
const MAX_BLOCKED = 5;
const BLOCKED_PAIR = String.raw`itm_\w{1,40} on itm_\w{1,40}`;
/** The blocked list's shape, one to `MAX_BLOCKED` `itm_ on itm_` pairs, which `pilot wait` prints only when it holds (spec 2). */
export const BLOCKED_LIST = new RegExp(`^${BLOCKED_PAIR}(; ${BLOCKED_PAIR}){0,${MAX_BLOCKED - 1}}$`);

/**
 * The shapes of `lanesFrom`'s three lane lines and no others, keyed by its field, which `pilot wait` echoes only when
 * they hold and `hooks/session-handoff.js` repeats (it is CommonJS and cannot import them): ids and fixed words.
 */
const ID = String.raw`itm_\w{1,40}`;
const SKIPPED = `${ID} (blocked on ${ID}|orphaned|draining)`;
const NEXT = `next ${ID}( \\(short path\\))?`;
export const LANE_LINES = [
  ['planning', new RegExp(`^planning: (empty( → next ${ID}( \\(re-cut\\))?)?|${ID})$`)],
  ['concluding', new RegExp(`^concluding: (empty( → next ${ID})?|${ID})$`)],
  ['coPilot', new RegExp(`^co-pilot: (none|empty → (successor ${ID}(; ${NEXT})?|${NEXT})|none runnable: ${SKIPPED}(; ${SKIPPED}){0,${MAX_BLOCKED - 1}}|${ID}( draining)?)$`)],
];

/**
 * Why the co-pilot lane skips a queued yellow ticket (never-stuck spec 9, 19), or null for a runnable one: `draining`
 * while it yields, `orphaned` once a co-pilot was granted on its plan and none holds it (a `'legacy'` stamp cannot say
 * so), else `blocked on` its first unanswered blocking item. Ids and fixed words only: the hook echoes this verbatim.
 */
function skipReasonOf(items, ticket) {
  if (ticket.yielding) return 'draining';
  const grantedAt = ticket.plan?.grantedAt;
  if (typeof grantedAt === 'string' && grantedAt !== 'legacy') return 'orphaned';
  const [blocker] = unansweredBlockers(items, ticket.id);
  return blocker ? `blocked on ${blocker}` : null;
}

/**
 * The yellow tickets of `repo` the co-pilot lane may take (blocked-yellow-yields spec 2; L5, L6; never-stuck spec 19),
 * pure: open, in deck order, none draining, orphaned, or with an open blocking item the user has not answered (spec 3).
 * A skipped one is never flipped. Read only while no live co-pilot holds a ticket, so a granted plan here is an orphan.
 */
export function runnableYellowOf(items, repo) {
  return ticketQueueOf(items, repo, 'yellow').filter((ticket) => skipReasonOf(items, ticket) === null);
}

/**
 * One stage lane of `repo` (three-lanes spec 1, 2; L2, L4), pure: `switching` while its switch record is sound (`pending`
 * its `to`), else `held` by its live ticket, `queued` with its stage's next, or `empty`. The one composition the lane
 * lines, the rail and the chain read by name.
 */
export function laneOf(items, repo, lane, { switching } = {}) {
  const [state] = LANE_STATES[lane];
  const ticket = liveTicketOf(items, repo, state);
  const pending = switchOf(items, repo, switching, lane)?.to;
  if (pending) return { state: 'switching', ticket, pending };
  if (ticket) return { state: 'held', ticket };
  const next = nextTicketOf(items, repo, state);
  return next ? { state: 'queued', next } : { state: 'empty' };
}

/**
 * The lanes of `repo` (spec 1, 3, 4, 5; yellow-lane spec 2, 3; three-lanes spec 3), pure. `switching` is the
 * directory's stored switch record; `co-pilot` is `coPilotFor`'s `{ ticket, live }` or null. `refusal` is an idle stage
 * lane's line, concluding first (A4), else the idle yellow lane's (`coPilotStateOf` 'queued': a yellow ticket open, no
 * live co-pilot holds it; yellow-lane L2), and null while the directory has an open hand-off (L7): the session told
 * to stop for its `/clear` must stop. Each lane is spelled alike: its ticket, else its next. The yellow next is the
 * first runnable ticket; with yellow queued and none runnable, the co-pilot line names each skipped one with its reason
 * (never-stuck spec 9, 19) and `blocked` the blocked ones on their question for `pilot wait` (blocked-yellow-yields
 * spec 2), else it is null. A held ticket that yields reads `draining`; a re-cut planning pick reads `(re-cut)`.
 * Last, a held ticket `idleYellowOf` finds idle by `now` is refused (yellow-never-idle spec 5); `crewSeenAt` is
 * optional, and a caller without it never reads idle.
 */
export function lanesFrom(items, repo, { switching, coPilot, crewSeenAt, now = Date.now() } = {}) {
  const planning = laneOf(items, repo, 'planning', { switching });
  const concluding = laneOf(items, repo, 'concluding', { switching });
  const handedOff = items.some((item) => item?.kind === KIND_HANDOFF && isOpen(item) && sameRepo(item.repo, repo));
  const held = coPilot?.live === true ? coPilot.ticket : undefined;
  const queued = coPilotStateOf(items, repo, held, switching) === 'queued';
  const planned = queued ? runnableYellowOf(items, repo)[0] : undefined;
  const short = planned ? isShortPath(planned) : false;
  // A released co-pilot's ticket, still open and yellow, is owed a successor ahead of any other next (the re-brief names
  // it); one that is itself the next runnable reads `next` as before.
  const successor = queued && coPilot?.live === false && coPilot.ticket !== planned?.id
    ? items.find((item) => item?.id === coPilot.ticket && item.kind === KIND_TICKET && isOpen(item) && stateOf(item) === 'yellow' && sameRepo(item.repo, repo))
    : undefined;
  const plannedLine = planned ? `next ${planned.id}${short ? ' (short path)' : ''}` : '';
  // No yellow ticket runnable (spec 2; never-stuck spec 9): each skipped one named with why, and nothing refused.
  const skipped = queued && !planned
    ? ticketQueueOf(items, repo, 'yellow').filter((ticket) => ticket !== successor).slice(0, MAX_BLOCKED).map((ticket) => ({ id: ticket.id, why: skipReasonOf(items, ticket) }))
    : [];
  const pairs = skipped.filter(({ why }) => why?.startsWith('blocked on ')).map(({ id, why }) => `${id} ${why.slice('blocked '.length)}`);
  const blocked = pairs.length ? pairs.join('; ') : null;
  const reasons = skipped.map(({ id, why }) => `${id} ${why}`).join('; ');
  const draining = held !== undefined && items.some((item) => item?.id === held && item.kind === KIND_TICKET && item.yielding);
  const hand = (lane) => lane.ticket?.id ?? lane.pending;
  const recut = (lane) => (lane.next.recut ? ' (re-cut)' : '');
  const line = (name, lane) => (lane.next ? `${name}: empty → next ${lane.next.id}${name === 'planning' ? recut(lane) : ''}` : hand(lane) ? `${name}: ${hand(lane)}` : `${name}: empty`);
  const clause = (name, lane) =>
    lane.next ? `${name}: empty, next ${lane.next.id}` : lane.ticket ? `${name}: ${lane.ticket.id} live` : lane.pending ? `${name}: ${lane.pending}` : `${name}: empty`;
  const idle = [['concluding', concluding], ['planning', planning]].find(([, lane]) => lane.next);
  const refusal = idle
    ? `${idle[0]} lane empty; ${idle[1].next.id} is queued — deck_ticket take it first`
    : successor
      ? `yellow lane empty; ${successor.id} is released — deck_ticket co-pilot it and spawn its successor first`
      : planned
      ? `yellow lane empty; ${planned.id} is ${short ? 'short path — deck_ticket co-pilot it and spawn its implementer' : 'planned — deck_ticket co-pilot it first'}`
      : idleRefusal(items, repo, held, crewSeenAt, now);
  return {
    planning: line('planning', planning),
    concluding: line('concluding', concluding),
    coPilot: held
      ? `co-pilot: ${held}${draining ? ' draining' : ''}`
      : successor ? `co-pilot: empty → successor ${successor.id}${planned ? `; ${plannedLine}` : ''}`
        : planned ? `co-pilot: empty → ${plannedLine}` : reasons ? `co-pilot: none runnable: ${reasons}` : 'co-pilot: none',
    stageClause: `${clause('Planning', planning)}. ${clause('Concluding', concluding)}`,
    yellowClause: held ? `Yellow: held by ${held}` : successor ? `Yellow: empty, successor ${successor.id}` : planned ? `Yellow: empty, next ${planned.id}` : 'Yellow: empty',
    refusal: handedOff ? null : refusal,
    blocked,
  };
}

/** `lanesFrom` on the store as it stands, in one read: its items, `repo`'s switch record and its co-pilot. */
export function lanesOf(repo) {
  const deck = readDeck();
  const entry = storedCoPilot(deck, repo);
  const coPilot = entry ? { ticket: entry.ticket, live: isLiveCoPilot(deck, entry) } : null;
  return lanesFrom(deck.items, repo, { switching: switchesOf(deck, repo).lanes, coPilot, crewSeenAt: crewSeenAt(repo), now: Date.now() });
}
