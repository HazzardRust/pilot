/**
 * A ticket's human steps (human-steps L2-L6, ADR NNNN): the steps thread's one writer, the report's close that
 * yields to it, the user's Done, and the ticket's one close they share. Beside `store-items.mjs`, which is at
 * its line bar; the closes here are pure on the deck in hand, so they run inside that file's writes.
 */

import { CLOSED_BY_USER, KIND_STEPS, KIND_TICKET, isOpen, sameRepo, stateOf } from './items.mjs';
import { DeckRefusal, newItemId, readDeck, refuseCredentials, requireText, touchRuns, writeDeck } from './store-core.mjs';

const MAX_STEPS = 20;
const MAX_STEP_CHARS = 300;

/** A ticket no longer held: neither live (L9) nor its walkthrough's to conclude (yellow-never-idle). */
function releaseTicket(ticket) {
  delete ticket.live;
  delete ticket.concludedBy;
}

/** A ticket's one close (human-steps §3 Seams): the report's, and a steps thread's Done. */
export function closeTicket(ticket, by, at) {
  releaseTicket(ticket);
  ticket.state = 'closed';
  ticket.resolution = `closed by ${by}`;
  ticket.resolvedAt = at;
}

/** The open steps thread naming a ticket, if any. */
const openStepsOn = (items, ticketId) => items.find((each) => each?.kind === KIND_STEPS && each.ticket === ticketId && isOpen(each));

/** A closing report's close of its ticket (L2): released and left green while an open steps thread names it, else closed. */
export function reportCloses(deck, ticket, report) {
  if (openStepsOn(deck.items, ticket.id)) releaseTicket(ticket);
  else closeTicket(ticket, report.id, report.postedAt);
}

/** Done (L4): the steps thread and its ticket in the caller's one write, with no reply and no `seq`, so no waiter is handed it. */
export function doneOn(deck, steps, at) {
  Object.assign(steps, { resolution: CLOSED_BY_USER, resolvedAt: at });
  const ticket = deck.items.find((each) => each?.kind === KIND_TICKET && each.id === steps.ticket);
  if (ticket && isOpen(ticket)) closeTicket(ticket, steps.id, at);
}

/**
 * Post a ticket's human steps (L2, L3, L5): the one writer of a steps thread, which `deck_post` refuses. The ticket
 * is an open green one in `repo` with no open steps thread; 1 to 20 steps, each one trimmed line of 1 to 300
 * characters, none carrying a credential. Stored as `{ text }` so a later tick is a field (L5).
 */
export function postSteps({ ticket: ticketId, repo, title, steps }) {
  requireText('title', title);
  requireText('repo', repo);
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > MAX_STEPS) {
    throw new DeckRefusal(`a steps thread carries 1 to ${MAX_STEPS} steps, not ${Array.isArray(steps) ? steps.length : 'none'}`);
  }
  const texts = steps.map((step, index) => {
    const text = typeof step?.text === 'string' ? step.text.trim() : '';
    if (text.length < 1 || text.length > MAX_STEP_CHARS) throw new DeckRefusal(`step ${index + 1} is 1 to ${MAX_STEP_CHARS} characters, not ${text.length}`);
    if (/[\r\n]/.test(text)) throw new DeckRefusal(`step ${index + 1} is one line`);
    return text;
  });
  refuseCredentials('these steps', `${title}\n${texts.join('\n')}`);
  const deck = readDeck();
  const ticket = deck.items.find((each) => each?.id === ticketId);
  if (ticket?.kind !== KIND_TICKET || stateOf(ticket) !== 'green') {
    throw new DeckRefusal(`a steps thread's ticket is an open green ticket, and ${ticketId} is ${ticket?.kind === KIND_TICKET ? stateOf(ticket) : 'not a ticket here'}`);
  }
  if (!sameRepo(ticket.repo, repo)) throw new DeckRefusal(`a steps thread's ticket is in its own directory, and ${ticket.id} is in another`);
  const twin = openStepsOn(deck.items, ticket.id);
  if (twin) throw new DeckRefusal(`${ticket.id} already has an open steps thread, ${twin.id}`);
  const item = {
    id: newItemId(),
    kind: KIND_STEPS,
    title,
    body: 'Do these by hand, then press Done.',
    steps: texts.map((text) => ({ text })),
    ticket: ticket.id,
    repo: ticket.repo,
    owner: 'pilot',
    postedAt: new Date().toISOString(),
    replies: [],
  };
  deck.items.push(item);
  touchRuns(deck, item.repo);
  writeDeck(deck);
  return item;
}
