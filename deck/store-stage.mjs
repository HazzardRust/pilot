/**
 * A ticket entering a stage (stage-queue-tail, L2-L4, A1, A2): its state and its place in its repository's queue of
 * that stage, which is deck order, in the caller's one write, on the deck in hand.
 */

import { stateOf, ticketQueueOf } from './items.mjs';
import { releaseIn, seqOf } from './store-core.mjs';

/** One `from: 'deck'` line with the next `seq`, for the caller to store: it wakes the pilot once and never reads as the user (L7). */
export function deckLine(deck, text, at) {
  return { from: 'deck', author: 'deck', text, repliedAt: at, seq: (deck.seq = seqOf(deck) + 1) };
}

/**
 * `ticket` turns `state`; already in it, nothing changes (L4). Its place: 'tail' after the queue's last ticket, or where
 * it stands when it is already past it; 'head' before the first (the resume); 'landed' before the first ticket with no
 * `greenAt` or a later one, else the tail (A2). A first green entry stamps `greenAt`, never rewritten or cleared.
 */
export function enterStage(deck, ticket, state, place = 'tail') {
  if (stateOf(ticket) === state) return;
  const queue = ticketQueueOf(deck.items, ticket.repo, state);
  ticket.state = state;
  if (state === 'green') ticket.greenAt ??= new Date().toISOString();
  else delete ticket.concludedBy;
  const landsAfter = (item) => item.greenAt === undefined || (ticket.greenAt !== undefined && item.greenAt > ticket.greenAt);
  const before = place === 'head' ? queue[0] : place === 'landed' ? queue.find(landsAfter) : undefined;
  const from = deck.items.indexOf(ticket);
  deck.items.splice(from, 1);
  const tail = deck.items.indexOf(queue.at(-1));
  deck.items.splice(before ? deck.items.indexOf(before) : Math.max(from, tail + 1), 0, ticket);
}

/**
 * The concluding move (yellow-never-idle L2), a gate2's and a concluding walkthrough's one path: the ticket turns green
 * and, a hand-back like `needTicket`'s, releases its co-pilot in the caller's write (clear-waits-co-pilot L8). `by` is the
 * concluding walkthrough's id, kept as `concludedBy` while the ticket stays green (a gate2 passes none).
 */
export function concludeOn(deck, ticket, by) {
  enterStage(deck, ticket, 'green');
  if (by !== undefined) ticket.concludedBy = by;
  releaseIn(deck, ticket.repo, ticket.id);
}
