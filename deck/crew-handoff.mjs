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
