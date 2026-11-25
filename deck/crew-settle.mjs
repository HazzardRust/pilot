/**
 * The deck's closes of a crew-handoff (handoff-self-close S1, ADR 0214): a ticket's `co-pilot` grant closes its open
 * ones (ADR 0208 L3), and `settleCrew`, run after every deck change, closes each one whose ticket has left yellow
 * (L1), each through `resolveItem` with its `resolved` trace row (L2), never over an unanswered press (A1).
 */

import { CREW_WAIT_MS, openCrewHandoffsOf, settledCrewHandoffsOf } from './crew-handoff.mjs';
import { KIND_CREW_HANDOFF, isOpen } from './items.mjs';
import { DeckRefusal, listItems, resolveItem } from './store.mjs';
import { step } from '../hooks/lib/wrapper-log.js';

/** A grant closes its ticket's open crew-handoffs, each with its `resolved` row; `; closed <id>` per close (crew-handoff-trace spec 5). */
export function closeCrewHandoffs(ticketId) {
  return openCrewHandoffsOf(listItems(), ticketId).map((item) => {
    // The grant has already taken: a refused close is named in its answer, never thrown over it.
    try {
      resolveItem(item.id, 'successor granted');
    } catch (err) {
      if (!(err instanceof DeckRefusal)) throw err;
      return `; ${item.id} left open: ${err.message}`;
    }
    step({ step: 'resolved', kind: item.kind, item: item.id, ticket: ticketId });
    return `; closed ${item.id}`;
  }).join('');
}

/** Each open crew-handoff's one repaint timer, by item id, at the moment it would read `waiting <age>`. */
const waitTimers = new Map();

/** One unref'd one-shot per open crew-handoff at `postedAt + CREW_WAIT_MS` (spec 5, L5), so the pages repaint as it crosses; never one already past. */
function armWaitRepaints(items, announce) {
  const now = Date.now();
  for (const item of items) {
    if (item?.kind !== KIND_CREW_HANDOFF || !isOpen(item) || waitTimers.has(item.id)) continue;
    const at = Date.parse(item.postedAt) + CREW_WAIT_MS;
    if (!(at > now)) continue;
    waitTimers.set(item.id, setTimeout(() => {
      waitTimers.delete(item.id);
      announce();
    }, at - now).unref());
  }
}

/** The items whose close the deck has already logged as refused, so each is logged once and never retried (L6). */
const refused = new Set();

/**
 * Closes every crew-handoff `settledCrewHandoffsOf` names, as `closed by the deck: <ticket> <move>`, each with one
 * `resolved` row (spec 2, 4). A refused close is logged once and skipped, never thrown into the change that ran it
 * (L6). Calls `announce` once when it closed any, so the re-announcement settles nothing and stops. Returns the count.
 */
export function settleCrew(announce) {
  let items;
  let settled;
  try {
    items = listItems();
    settled = settledCrewHandoffsOf(items);
  } catch {
    // An unreadable store is `armHandoffs`'s to log, in the read it makes next; the settle closes nothing.
    return 0;
  }
  armWaitRepaints(items, announce);
  let closed = 0;
  for (const { item, why } of settled) {
    if (refused.has(item.id)) continue;
    try {
      resolveItem(item.id, `closed by the deck: ${item.ticket} ${why}`);
    } catch (err) {
      // A refusal stands until the item changes hands, so it is never retried; a failed write is, on the next change.
      if (err instanceof DeckRefusal) refused.add(item.id);
      console.error(`[deck] crew-handoff ${item.id} left open: ${err.message}`);
      continue;
    }
    // `agent=deck` is the trace's mark that no successor follows: the hand-off ends here.
    step({ step: 'resolved', kind: item.kind, item: item.id, ticket: item.ticket, agent: 'deck' });
    closed += 1;
  }
  if (closed > 0) announce();
  return closed;
}
