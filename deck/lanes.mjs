/**
 * A directory's three lanes as every surface prints them (idle-main-lane L2; ADR 0123; three-lanes spec 1, 3): the
 * planning lane's red ticket, the concluding lane's green one, and the co-pilot's. The rule that an idle lane is refused
 * lives here once, on `laneOf`, with every spelling of it; the hooks are CommonJS and cannot import this, so they
 * print the strings the daemon hands them on `GET /api/record`.
 */

import {
  KIND_HANDOFF, KIND_QUESTION, KIND_TICKET, LANE_STATES, coPilotStateOf, isAnswered, isBlocking, isOpen, isShortPath, liveTicketOf, nextTicketOf,
  sameRepo, stateOf, switchOf, ticketQueueOf, unansweredBlockers,
} from './items.mjs';
import { isLiveCoPilot, readDeck, storedCoPilot, switchesOf } from './store-core.mjs';

/** How long the co-pilot's held ticket waits on an unanswered blocking question before the deck pauses it (blocked-yellow-yields spec 5, L4). */
export const YIELD_MS = 20 * 60_000;

/**
 * The yields due in `repo` by `now` (blocked-yellow-yields spec 1; L2, L5, A1), pure: only `coPilotTicket`, the live
 * co-pilot's open yellow ticket, and only on an open blocking question naming it with no message from the user on it,
 * `YIELD_MS` past its `postedAt`. Each is `{ ticket, question, at }`; the timer passes `Infinity` to arm every one ahead.
 */
export function yieldsDue(items, repo, coPilotTicket, now) {
  const ticket = items.find((item) => item?.id === coPilotTicket && item.kind === KIND_TICKET);
  if (!ticket || !isOpen(ticket) || stateOf(ticket) !== 'yellow' || !sameRepo(ticket.repo, repo)) return [];
  return items
    .filter((item) => item.kind === KIND_QUESTION && isBlocking(item) && item.ticket === ticket.id && sameRepo(item.repo, repo))
    .filter((item) => !isAnswered(item))
    .map((item) => ({ ticket: ticket.id, question: item.id, at: Date.parse(item.postedAt) + YIELD_MS }))
    .filter(({ at }) => at <= now);
}

/** The most blocked yellow tickets the co-pilot lane names, the bound `hooks/session-handoff.js` echoes (spec 2). */
const MAX_BLOCKED = 5;
const BLOCKED_PAIR = String.raw`itm_\w{1,40} on itm_\w{1,40}`;
/** The blocked list's shape, one to `MAX_BLOCKED` `itm_ on itm_` pairs, which `pilot wait` prints only when it holds (spec 2). */
export const BLOCKED_LIST = new RegExp(`^${BLOCKED_PAIR}(; ${BLOCKED_PAIR}){0,${MAX_BLOCKED - 1}}$`);

/**
 * The yellow tickets of `repo` the co-pilot lane may take (blocked-yellow-yields spec 2; L5, L6), pure: open, in deck
 * order, none with an open blocking item of its own the user has not answered (spec 3). A blocked one is skipped, never flipped.
 */
export function runnableYellowOf(items, repo) {
  return ticketQueueOf(items, repo, 'yellow').filter((ticket) => unansweredBlockers(items, ticket.id).length === 0);
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
 * first runnable ticket; with yellow queued and none runnable, `blocked` names each on its question (blocked-yellow-yields
 * spec 2), else it is null.
 */
export function lanesFrom(items, repo, { switching, coPilot } = {}) {
  const planning = laneOf(items, repo, 'planning', { switching });
  const concluding = laneOf(items, repo, 'concluding', { switching });
  const handedOff = items.some((item) => item?.kind === KIND_HANDOFF && isOpen(item) && sameRepo(item.repo, repo));
  const held = coPilot?.live === true ? coPilot.ticket : undefined;
  const queued = coPilotStateOf(items, repo, held, switching) === 'queued';
  const planned = queued ? runnableYellowOf(items, repo)[0] : undefined;
  const short = planned ? isShortPath(planned) : false;
  // Every yellow ticket blocked (spec 2): each named with its first open blocking item, and nothing refused.
  const blocked = queued && !planned
    ? ticketQueueOf(items, repo, 'yellow').slice(0, MAX_BLOCKED).map((ticket) => `${ticket.id} on ${unansweredBlockers(items, ticket.id)[0]}`).join('; ')
    : null;
  const hand = (lane) => lane.ticket?.id ?? lane.pending;
  const line = (name, lane) => (lane.next ? `${name}: empty → next ${lane.next.id}` : hand(lane) ? `${name}: ${hand(lane)}` : `${name}: empty`);
  const clause = (name, lane) =>
    lane.next ? `${name}: empty, next ${lane.next.id}` : lane.ticket ? `${name}: ${lane.ticket.id} live` : lane.pending ? `${name}: ${lane.pending}` : `${name}: empty`;
  const idle = [['concluding', concluding], ['planning', planning]].find(([, lane]) => lane.next);
  const refusal = idle
    ? `${idle[0]} lane empty; ${idle[1].next.id} is queued — deck_ticket take it first`
    : planned
      ? `yellow lane empty; ${planned.id} is ${short ? 'short path — deck_ticket co-pilot it and spawn its implementer' : 'planned — deck_ticket co-pilot it first'}`
      : null;
  return {
    planning: line('planning', planning),
    concluding: line('concluding', concluding),
    coPilot: held ? `co-pilot: ${held}` : planned ? `co-pilot: empty → next ${planned.id}${short ? ' (short path)' : ''}` : blocked ? `co-pilot: empty, blocked: ${blocked}` : 'co-pilot: none',
    stageClause: `${clause('Planning', planning)}. ${clause('Concluding', concluding)}`,
    yellowClause: held ? `Yellow: ${held}` : planned ? `Yellow: empty, next ${planned.id}` : 'Yellow: empty',
    refusal: handedOff ? null : refusal,
    blocked,
  };
}

/** `lanesFrom` on the store as it stands, in one read: its items, `repo`'s switch record and its co-pilot. */
export function lanesOf(repo) {
  const deck = readDeck();
  const entry = storedCoPilot(deck, repo);
  const coPilot = entry ? { ticket: entry.ticket, live: isLiveCoPilot(deck, entry) } : null;
  return lanesFrom(deck.items, repo, { switching: switchesOf(deck, repo).lanes, coPilot });
}
