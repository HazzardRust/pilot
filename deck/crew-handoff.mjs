/**
 * A paused co-pilot's crew-handoff, as its ticket's successor grant reads it (crew-handoff-trace S5, spec 5).
 */

import { KIND_CREW_HANDOFF, isOpen } from './items.mjs';

/** The open crew-handoffs naming `ticketId`; none for a missing id. */
export function openCrewHandoffsOf(items, ticketId) {
  if (typeof ticketId !== 'string') return [];
  return items.filter((item) => item.kind === KIND_CREW_HANDOFF && isOpen(item) && item.ticket === ticketId);
}
