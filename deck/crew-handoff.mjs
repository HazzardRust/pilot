/**
 * A paused co-pilot's crew-handoff, as its ticket's successor grant reads it (crew-handoff-trace S5, spec 5).
 */

import { KIND_CREW_HANDOFF, KIND_TICKET, isOpen, sameRepo, stateOf } from './items.mjs';

/** The open crew-handoffs naming `ticketId`; none for a missing id. */
export function openCrewHandoffsOf(items, ticketId) {
  if (typeof ticketId !== 'string') return [];
  return items.filter((item) => item.kind === KIND_CREW_HANDOFF && isOpen(item) && item.ticket === ticketId);
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
