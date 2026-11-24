/**
 * A paused co-pilot's crew-handoff, as its ticket's successor grant (crew-handoff-trace S5, spec 5) and the deck's
 * settle (handoff-self-close spec 2, 6) read it.
 */

import { HANDOFF_FAILED, KIND_CREW_HANDOFF, KIND_TICKET, chosenOf, isOpen, messagesOf, sameRepo, stateOf } from './items.mjs';

/**
 * The user pressed Handoff failed and the pilot has not written since (handoff-self-close spec 6, A1): the press is
 * still the pilot's, so the deck closes nothing over it.
 */
export function pressUnanswered(item) {
  if (chosenOf(item) !== HANDOFF_FAILED) return false;
  const messages = messagesOf(item);
  const press = messages.findLastIndex((message) => message?.from === 'user');
  return !messages.slice(press + 1).some((message) => message?.from === 'pilot');
}

/** The open crew-handoffs naming `ticketId`, but a pressed one the pilot has not answered; none for a missing id. */
export function openCrewHandoffsOf(items, ticketId) {
  if (typeof ticketId !== 'string') return [];
  return items.filter((item) => item.kind === KIND_CREW_HANDOFF && isOpen(item) && item.ticket === ticketId && !pressUnanswered(item));
}

/** The move each non-yellow state names in the deck's close (spec 2): concluding, planning, or closed. */
const MOVES = Object.freeze({ green: 'moved to concluding', red: 'sent back to planning', closed: 'closed' });

/**
 * The open ticketed crew-handoffs whose ticket is no longer yellow, each `{ item, why }` (handoff-self-close spec 2,
 * 3, L1): a ticket gone from the store reads `closed`; a pressed item the pilot has not answered is not named.
 */
export function settledCrewHandoffsOf(items) {
  return items.flatMap((item) => {
    if (item?.kind !== KIND_CREW_HANDOFF || !isOpen(item) || typeof item.ticket !== 'string' || pressUnanswered(item)) return [];
    const ticket = items.find((candidate) => candidate?.id === item.ticket && candidate.kind === KIND_TICKET);
    const why = ticket === undefined ? MOVES.closed : MOVES[stateOf(ticket)];
    return why === undefined ? [] : [{ item, why }];
  });
}

/**
 * `repo`'s open crew-handoffs owed a successor (spec 4, §3.1 C3): each names an open yellow ticket of `repo` that
 * `coPilot` (`coPilotFor`'s `{ ticket, live }` or null) does not hold live.
 */
export function successorOwedOf(items, repo, coPilot) {
  const held = coPilot?.live === true ? coPilot.ticket : undefined;
  return items.filter((item) => item?.kind === KIND_CREW_HANDOFF && isOpen(item) && sameRepo(item.repo, repo) &&
    typeof item.ticket === 'string' && item.ticket !== held &&
    items.some((ticket) => ticket?.id === item.ticket && ticket.kind === KIND_TICKET && stateOf(ticket) === 'yellow' && sameRepo(ticket.repo, repo)));
}

/** How long a crew-handoff stays owed a successor before the deck wakes the pilot (crew-handoff-trace spec 6, A3). */
export const CREW_WAIT_MS = 10 * 60_000;

/**
 * `successorOwedOf`'s crew-handoffs due by `now`, at `postedAt + CREW_WAIT_MS`, each `{ item, ticket, at }`; none the
 * deck has already noted (`crewWaitNoted`), so each wakes the pilot once.
 */
export function crewWaitOf(items, repo, coPilot, now) {
  return successorOwedOf(items, repo, coPilot)
    .map((item) => ({ item, ticket: item.ticket, at: Date.parse(item.postedAt) + CREW_WAIT_MS }))
    .filter(({ item, at }) => item.crewWaitNoted === undefined && at <= now);
}
