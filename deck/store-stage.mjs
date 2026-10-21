/**
 * A ticket entering a stage (stage-queue-tail, L2-L4, A1, A2): its state and its place in its repository's queue of
 * that stage, which is deck order, in the caller's one write, on the deck in hand.
 */

import { stateOf, ticketQueueOf } from './items.mjs';

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
  const landsAfter = (item) => item.greenAt === undefined || (ticket.greenAt !== undefined && item.greenAt > ticket.greenAt);
  const before = place === 'head' ? queue[0] : place === 'landed' ? queue.find(landsAfter) : undefined;
  const from = deck.items.indexOf(ticket);
  deck.items.splice(from, 1);
  const tail = deck.items.indexOf(queue.at(-1));
  deck.items.splice(before ? deck.items.indexOf(before) : Math.max(from, tail + 1), 0, ticket);
}
