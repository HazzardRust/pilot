/**
 * The deck's ticket queue: moving, taking, parking and merging tickets, the lane switches,
 * needing and pivoting (audit-f1-f7 S14, L9). Moved whole from `deck/store.mjs`, which
 * re-exports every public name. The co-pilot helpers that items and tickets both need
 * (`storedCoPilot`, `releaseIn`, `isLiveCoPilot`) live in `store-core.mjs`.
 */

import { parseVerdictMessage } from '../scripts/verdicts.mjs';
import { CREW_WAIT_MS, crewWaitOf } from './crew-handoff.mjs';
import {
  KIND_CREW_HANDOFF,
  KIND_GATE2,
  KIND_QUESTION,
  KIND_TICKET,
  KIND_WALKTHROUGH,
  SIGN_OFF,
  chosenOf,
  inHandOf,
  isOpen,
  laneOfState,
  messagesOf,
  liveTicketOf,
  nextTicketOf,
  openQuestionsOf,
  pausedOn,
  stateOf,
  switchOf,
  ticketQueueOf,
} from './items.mjs';
import { CREW_IDLE_MS, YIELD_MS, idleYellowOf, yieldsDue } from './lanes.mjs';
import { SHA } from './recut.mjs';
import { nextRecord, repoKey, sameRepo } from './runs.mjs';
import {
  DeckRefusal,
  bylineOf,
  isLiveCoPilot,
  readDeck,
  releaseIn,
  requireRepoPath,
  requireText,
  seqOf,
  storedCoPilot,
  switchesOf,
  touchRuns,
  writeDeck,
} from './store-core.mjs';
import { resolveItem } from './store-items.mjs';
import { deckLine, enterStage } from './store-stage.mjs';

/**
 * The parked green ticket whose walkthrough a reply is on, by id, or undefined (ticket-states spec
 * 19, L5, L6): the pilot resumes QA from its record's qa refs.
 */
export function parkedTicketOf(items, reply) {
  const walk = items.find((item) => item.id === reply?.itemId && item.kind === KIND_WALKTHROUGH);
  const ticket = walk && items.find((item) => item.id === walk.ticket && item.kind === KIND_TICKET);
  return ticket && ticket.live !== true && stateOf(ticket) === 'green' && sameRepo(ticket.repo, walk.repo) ? ticket.id : undefined;
}

function openTicketOf(deck, id) {
  const item = deck.items.find((candidate) => candidate.id === id);
  if (!item) throw new DeckRefusal(`no item ${id} on the deck`);
  if (item.kind !== KIND_TICKET || !isOpen(item)) throw new DeckRefusal(`item ${id} is not an open ticket, so it is in no queue`);
  return item;
}

/** The two ways a ticket moves, one place each (ticket-making spec 7). */
const MOVES = { up: -1, down: 1 };

/**
 * Move an open ticket one place in its repository's queue: swap it in `deck.items`
 * with its nearest queued neighbour, so the chain, the tab and its badge, which all
 * read deck order, agree without a sort (L2). The one write a move has (L3); the
 * page's route and the pilot's tool both come here. Returns the queue after it.
 */
export function moveTicket(id, direction) {
  if (!Object.hasOwn(MOVES, direction)) throw new DeckRefusal(`a ticket moves up or down, not ${direction}`);
  const deck = readDeck();
  const item = openTicketOf(deck, id);
  // A yellow arrow is no part of either lock (L17): the co-pilot lane's queue is not the main deck's.
  if (stateOf(item) !== 'yellow') refuseLaneSwitch(deck, item.repo, switchLaneOf(item));
  // Its own state's queue only (ticket-states spec 3): a red ticket never passes a yellow one.
  const queue = ticketQueueOf(deck.items, item.repo, stateOf(item));
  const neighbour = queue[queue.indexOf(item) + MOVES[direction]];
  if (!neighbour) throw new DeckRefusal(`item ${id} is already the ${direction === 'up' ? 'head' : 'tail'} of its queue`);
  const from = deck.items.indexOf(item);
  const to = deck.items.indexOf(neighbour);
  [deck.items[from], deck.items[to]] = [neighbour, item];
  writeDeck(deck);
  return ticketQueueOf(deck.items, item.repo, stateOf(item));
}

/**
 * Make an open ticket the live one of its stage in its directory (ticket-states spec 4, L4, L9; three-lanes spec 1):
 * `live` and a new `takenAt`, in one write. Refused while another ticket of its stage is live there, naming it and
 * its lane; a planning and a concluding ticket are live at once. Returns the ticket.
 * The pending switch's `to` on its lane is the exception (ticket-state-accents spec 13, L8, L14; three-lanes L4): its
 * take parks `from`, passes the red refusal and clears that lane's record, in the same write.
 */
export function takeTicket(id) {
  const deck = readDeck();
  const item = openTicketOf(deck, id);
  const lane = switchLaneOf(item);
  const pending = switchOf(deck.items, item.repo, switchesOf(deck, item.repo).lanes, lane);
  const switching = pending?.to === id;
  if (!switching) refuseLaneSwitch(deck, item.repo, lane);
  if (item.live === true) throw new DeckRefusal(`item ${id} is already live`);
  const live = liveTicketOf(deck.items, item.repo, stateOf(item));
  if (live && !(switching && live.id === pending.from)) {
    throw new DeckRefusal(`${live.id} is live in ${laneOfState(stateOf(live))}; deck_ticket park it before taking ${id}`);
  }
  // A red take never jumps its own queue (ticket-state-accents spec 6, L8; three-lanes spec 2): an asked red goes first.
  const next = nextTicketOf(deck.items, item.repo, 'red');
  if (!switching && stateOf(item) === 'red' && next && next !== item && openQuestionsOf(deck.items, next.id).length) {
    throw new DeckRefusal(`item ${id} is red; ${next.id} (${next.title}) waits first: deck_ticket take it`);
  }
  takeIn(deck, item, new Date().toISOString());
  if (switching) clearSwitch(deck, item.repo, lane);
  writeDeck(deck);
  return item;
}

/** Put the live ticket down (L9): `live` cleared, its state and its place in its queue kept. Returns the ticket. */
export function parkTicket(id) {
  const deck = readDeck();
  const item = openTicketOf(deck, id);
  refuseLaneSwitch(deck, item.repo, switchLaneOf(item));
  if (item.live !== true) throw new DeckRefusal(`item ${id} is not live, so there is nothing to park`);
  delete item.live;
  writeDeck(deck);
  return item;
}

/** The switch lane a ticket's stage names (three-lanes L4): planning or concluding, else `main`, either stage lane. */
const switchLaneOf = (ticket) => {
  const lane = laneOfState(stateOf(ticket));
  return lane && lane !== 'coPilot' ? lane : 'main';
};

/** A paused ticket waits on its question (blocked-yellow-yields L1): no take or Continue holds it until the user answers. */
function refusePaused(ticket) {
  const question = pausedOn(ticket);
  if (question) throw new DeckRefusal(`item ${ticket.id} is paused on ${question}; it resumes when the user answers it`);
}

/** Make `ticket` the live one of its stage as of `at`, whichever ticket of that stage was live there put down. Mutates `deck`. */
function takeIn(deck, ticket, at) {
  refusePaused(ticket);
  const live = liveTicketOf(deck.items, ticket.repo, stateOf(ticket));
  if (live) delete live.live;
  ticket.live = true;
  ticket.takenAt = at;
}

/**
 * A stage lane's lock (ticket-state-accents spec 14, L12; three-lanes spec 5, L4): while `repo`'s switch on `lane` is
 * pending, refuse naming it; `main` is either stage lane, and `deck` null reads the store. Its callers are whatever
 * would move what is in hand or reorder that lane's queue; the completing take, replies, Sign off, Close and Add never
 * call it, so a switch can always be completed or cancelled. A co-pilot switch locks none of its callers (L17).
 */
export function refuseLaneSwitch(deck, repo, lane) {
  deck ??= readDeck();
  const record = switchOf(deck.items, repo, switchesOf(deck, repo).lanes, lane);
  if (record) throw new DeckRefusal(`a switch to ${record.to} is pending in this directory; complete or cancel it first`);
}

/**
 * The co-pilot lane's lock (spec 16, 19, L17): while `repo`'s co-pilot switch is pending, refuse a second `switch`,
 * `co-pilot` on any ticket but its `to` (switching keeps `from` held), and `release` or `need` on its `from` or `to`,
 * except `release from`, naming it. It reads the co-pilot record only, so a main switch locks none of its callers.
 */
function refuseCoPilotSwitch(deck, repo, action, ticketId) {
  const record = switchOf(deck.items, repo, switchesOf(deck, repo).lanes, 'coPilot');
  if (!record) return;
  const named = ticketId === record.from || ticketId === record.to;
  const locked = action === 'switch' || (action === 'co-pilot' ? ticketId !== record.to : named && !(action === 'release' && ticketId === record.from));
  if (locked) throw new DeckRefusal(`a co-pilot switch to ${record.to} is pending in this directory; complete or cancel it first`);
}

/**
 * Drop `repo`'s switch record on `lane`, the other lanes' kept; a stored `main` record that reads as `lane` (L4) goes
 * with it. Mutates `deck`; the caller writes it.
 */
function clearSwitch(deck, repo, lane) {
  const { switches, lanes } = switchesOf(deck, repo);
  const { [lane]: cleared, ...rest } = lanes;
  if (lanes.main !== undefined && switchOf(deck.items, repo, lanes, lane) === lanes.main) delete rest.main;
  deck.switches = { ...switches, [repoKey(repo)]: rest };
}

/** A user reply on `ticket` carrying `switch` when `marker` is given: the pilot's wake through `repliesSince` (L13). Mutates `deck`. */
function pushSwitchReply(deck, ticket, text, at, marker) {
  deck.seq = seqOf(deck) + 1;
  if (!Array.isArray(ticket.replies)) ticket.replies = [];
  ticket.replies.push({ from: 'user', text, repliedAt: at, seq: deck.seq, ...(marker && { switch: marker }) });
}

/**
 * Continue's Confirm (ticket-state-accents spec 12, L13, L15, L20; three-lanes spec 5, L4): ask to switch the lane of
 * the open red or green ticket `to` (planning or concluding) to it, in one write: the record
 * `switches[repoKey][lane] = { from, to, at }`, `from` that lane's live ticket or null, and a user reply on `to`
 * carrying `switch`, which is the pilot's wake through `repliesSince`. Completion is the pilot's take, or, with
 * `complete` (no live session to stash), this same write: `from` parked, `to` taken and no record left. Refused for
 * a `to` closed, in hand or another directory's, and while that lane's switch is pending; the other lane's is no
 * bar. Returns the record, or null once completed. A yellow `to` is the co-pilot lane's (spec 17, L17),
 * which never completes here.
 */
export function requestSwitch(repo, to, { complete = false } = {}) {
  requireRepoPath(repo, 'that switches');
  const deck = readDeck();
  const ticket = openTicketOf(deck, to);
  if (!sameRepo(ticket.repo, repo)) throw new DeckRefusal(`item ${to} is in another directory`);
  if (stateOf(ticket) === 'yellow') return requestCoPilotSwitch(deck, repo, ticket);
  if (!['red', 'green'].includes(stateOf(ticket))) throw new DeckRefusal(`item ${to} is ${stateOf(ticket)}; Continue switches to a red or green ticket`);
  refusePaused(ticket);
  // In hand is the row the rail marks (render-rail.mjs `marked`): every live stage ticket, else each stage's next; a
  // next beside a live ticket keeps its Continue. The two stay one rule.
  const stageLive = ['red', 'green'].some((state) => liveTicketOf(deck.items, repo, state));
  if (ticket.live === true || (!stageLive && inHandOf(deck.items, repo, stateOf(ticket)) === ticket)) throw new DeckRefusal(`item ${to} is already in hand`);
  // One lane switches (three-lanes spec 5, L4): `to`'s stage names it, and a switch pending on the other is no bar.
  const lane = switchLaneOf(ticket);
  refuseLaneSwitch(deck, repo, lane);
  const { switches, lanes } = switchesOf(deck, repo);

  // `from` is `to`'s stage's live ticket (three-lanes S1), so the completing take parks the ticket it replaces.
  const live = liveTicketOf(deck.items, repo, stateOf(ticket));
  const record = { from: live?.id ?? null, to, at: new Date().toISOString() };
  // A completed request's reply carries no `switch`, so a later wait prints no take that would be refused.
  pushSwitchReply(deck, ticket, 'Continue this ticket', record.at, complete ? undefined : { from: record.from, to });
  if (complete) {
    takeIn(deck, ticket, record.at);
  } else {
    deck.switches = { ...switches, [repoKey(repo)]: { ...lanes, [lane]: record } };
  }
  writeDeck(deck);
  return complete ? null : record;
}

/**
 * Co-pilot Continue's Confirm (ticket-state-accents spec 17, L17, L19, L20): the record `switches[repoKey].coPilot =
 * { from, to, at }`, `from` the live co-pilot's ticket or null, and a user reply on `to` carrying `switch` with lane
 * `co-pilot`, in one write. Never through the main lane's lock (L17), and never `live` on a yellow ticket: completion
 * is `deck_ticket co-pilot <to>` (S11). Refused for a `to` the co-pilot holds, and while one is pending.
 */
function requestCoPilotSwitch(deck, repo, ticket) {
  const entry = storedCoPilot(deck, repo);
  const from = entry && isLiveCoPilot(deck, entry) ? entry.ticket : null;
  if (from === ticket.id) throw new DeckRefusal(`item ${ticket.id} is already the co-pilot's`);
  refuseCoPilotSwitch(deck, repo, 'switch', ticket.id);
  const { switches, lanes } = switchesOf(deck, repo);

  const record = { from, to: ticket.id, at: new Date().toISOString() };
  pushSwitchReply(deck, ticket, 'Continue this ticket', record.at, { lane: 'coPilot', from, to: ticket.id });
  deck.switches = { ...switches, [repoKey(repo)]: { ...lanes, coPilot: record } };
  writeDeck(deck);
  return record;
}

/**
 * Cancel on the lit button (ticket-state-accents spec 13, 18, L15): clear `repo`'s pending switch to `to`, on the lane
 * `to`'s state names (yellow is the co-pilot's), and tell the pilot with a user reply on `to` reading `switch cancelled`,
 * in one write. Refused when no switch to `to` is pending there.
 */
export function cancelSwitch(repo, to) {
  requireRepoPath(repo, 'that cancels a switch');
  const deck = readDeck();
  const ticket = deck.items.find((item) => item.kind === KIND_TICKET && item.id === to);
  const lane = !ticket ? 'main' : stateOf(ticket) === 'yellow' ? 'coPilot' : switchLaneOf(ticket);
  const record = switchOf(deck.items, repo, switchesOf(deck, repo).lanes, lane);
  if (!record || record.to !== to) throw new DeckRefusal(`no switch to ${to} is pending in this directory`);
  clearSwitch(deck, repo, lane);
  const marker = { from: record.from, to: record.to, cancelled: true };
  pushSwitchReply(deck, ticket, 'switch cancelled', new Date().toISOString(), lane === 'coPilot' ? { lane, ...marker } : marker);
  writeDeck(deck);
}

/**
 * Fold an open red ticket into its directory's live planning one (ticket-states spec 11, L15, A2),
 * in one write: the host gains one pilot reply carrying the absorbed title, body and comments,
 * and the sum of the two slice counts (slice-estimates L5); its body is never edited. The absorbed ticket closes as
 * merged into the host. A yellow ticket was signed on its own plan and never merges, either way
 * round. Returns both.
 */
export function mergeTicket(id, author) {
  const deck = readDeck();
  const merged = openTicketOf(deck, id);
  refuseLaneSwitch(deck, merged.repo, 'planning');
  // The host is the live planning ticket (three-lanes spec 1): a live concluding ticket never takes a merge.
  const host = liveTicketOf(deck.items, merged.repo, 'red');
  if (!host) throw new DeckRefusal(`no ticket is live in planning in this directory; deck_ticket take the one ${id} merges into first`);
  if (host === merged) throw new DeckRefusal(`item ${id} is the live ticket; merge another ticket into it`);
  if (stateOf(merged) !== 'red') throw new DeckRefusal(`item ${id} is ${stateOf(merged)}; only a red ticket merges`);

  const now = new Date().toISOString();
  const comments = messagesOf(merged).map((message) => `- ${message.from}: ${message.text}`);
  const text = [`Merged ${id}: ${merged.title}`, merged.body, ...(comments.length ? ['Comments:', comments.join('\n')] : [])].join('\n\n');
  // The joined reply meets the bound every other message meets; its parts met the credential check when stored.
  requireText('merged reply', text);
  if (!Array.isArray(host.replies)) host.replies = [];
  host.replies.push({ from: 'pilot', ...bylineOf(author), text, repliedAt: now });
  // Two tickets with no count (stored minutes, dropped on read, L11) stay with none rather than "0 slices".
  const counts = [host.sliceCount, merged.sliceCount].filter(Number.isInteger);
  if (counts.length > 0) host.sliceCount = counts.reduce((sum, count) => sum + count, 0);
  merged.state = 'closed';
  merged.mergedInto = host.id;
  merged.resolution = `merged into ${host.id}`;
  merged.resolvedAt = now;
  touchRuns(deck, host.repo);
  writeDeck(deck);
  return { host, merged };
}

/**
 * Store the pilot's verdict record on a red ticket (architect-runs-red spec 4; L2, A1), in one write:
 * `ticket.verdicts` is the verdict message `text` as `parseVerdictMessage` reads it, replacing any
 * record before it. A gate1 on the ticket must match it. Returns the ticket.
 */
export function recordVerdicts(id, text) {
  requireText('verdicts', text);
  const deck = readDeck();
  const ticket = openTicketOf(deck, id);
  if (stateOf(ticket) !== 'red') throw new DeckRefusal(`item ${id} is ${stateOf(ticket)}; only a red ticket records verdicts`);
  try {
    ticket.verdicts = parseVerdictMessage(text);
  } catch (err) {
    throw new DeckRefusal(`verdicts: ${err.message}; send one "A<n> Verdict: stands[ — why]" or "A<n> Verdict: overturned: <why>" per line`);
  }
  writeDeck(deck);
  return ticket;
}

/** The kinds whose open thread says the user is needed on a ticket (overview-one-ticket L7). */
const NEEDING_KINDS = [KIND_QUESTION, KIND_WALKTHROUGH, KIND_GATE2];

/**
 * Say the user is needed (overview-one-ticket spec 15, L7, ADR 0066): an open yellow ticket turns
 * green, in one write, only while an open question, walkthrough or gate2 in its directory names
 * it, so a green ticket always has something for the user to do. Returns the ticket.
 */
export function needTicket(id) {
  const deck = readDeck();
  const ticket = openTicketOf(deck, id);
  // A yellow ticket's hand-back is the co-pilot lane's (L17): a planning or concluding switch never holds it up.
  refuseCoPilotSwitch(deck, ticket.repo, 'need', id);
  if (stateOf(ticket) !== 'yellow') throw new DeckRefusal(`item ${id} is ${stateOf(ticket)}; only a yellow ticket is needed`);
  const naming = deck.items.some(
    (item) => NEEDING_KINDS.includes(item?.kind) && isOpen(item) && item.ticket === id && sameRepo(item.repo, ticket.repo),
  );
  if (!naming) throw new DeckRefusal(`no open question, walkthrough or gate2 names ${id}; post the one the user is needed for first`);
  enterStage(deck, ticket, 'green');
  // The co-pilot's hand-back is this write, so it releases the co-pilot too (clear-waits-co-pilot L8).
  releaseIn(deck, ticket.repo, id);
  touchRuns(deck, ticket.repo);
  writeDeck(deck);
  return ticket;
}

/**
 * The deck's yield (blocked-yellow-yields spec 1; L1, L2, L3; never-stuck L6), one write: the co-pilot's held ticket
 * stays yellow and held, marked `yielding: { question, at }`, with a `from: 'deck'` line with a `seq` on the question,
 * which wakes the pilot's parked wait to send the co-pilot the pause. The co-pilot drains its live slices, and its
 * release, `setCoPilot(id, false)`, hands it back paused. Refused unless `yieldsDue` still names this ticket and question now. Returns the ticket.
 */
export function yieldTicket(id, questionId) {
  const deck = readDeck();
  const ticket = openTicketOf(deck, id);
  const entry = storedCoPilot(deck, ticket.repo);
  const holder = entry && isLiveCoPilot(deck, entry) ? entry.ticket : undefined;
  const now = Date.now();
  if (!yieldsDue(deck.items, ticket.repo, holder, now).some((due) => due.ticket === id && due.question === questionId)) {
    throw new DeckRefusal(`no yield of ${id} on ${questionId} is due: the co-pilot holds ${holder ?? 'nothing'} here, and the question must block it unanswered ${YIELD_MS / 60_000} min`);
  }
  const at = new Date(now).toISOString();
  ticket.yielding = { question: questionId, at };
  const question = deck.items.find((item) => item.id === questionId);
  const text = `Yielding ${id}: ${questionId} unanswered ${YIELD_MS / 60_000} min; send the co-pilot the pause: it drains every live slice, then hands back paused`;
  question.replies = [...messagesOf(question), deckLine(deck, text, at)];
  touchRuns(deck, ticket.repo);
  writeDeck(deck);
  return ticket;
}

/**
 * The deck's idle wake (yellow-never-idle spec 7, 8; L7), one write: the co-pilot's held ticket, which `idleYellowOf`
 * finds idle now with the crew last seen at `crewSeenAt`, is stamped `idleNoted: crewSeenAt` and given one `from: 'deck'`
 * line with a `seq`, which wakes the pilot's parked wait. Refused unless it is due now and not yet noted for this
 * `crewSeenAt`, so an idle episode is noted once; it releases nothing (A1). Returns the ticket.
 */
export function noteIdle(ticketId, crewSeenAt) {
  const deck = readDeck();
  const ticket = openTicketOf(deck, ticketId);
  const entry = storedCoPilot(deck, ticket.repo);
  const holder = entry && isLiveCoPilot(deck, entry) ? entry.ticket : undefined;
  const now = Date.now();
  const idle = idleYellowOf(deck.items, ticket.repo, holder, crewSeenAt);
  if (idle?.ticket !== ticketId || idle.at > now || ticket.idleNoted === crewSeenAt) {
    throw new DeckRefusal(`${ticketId} is not newly idle: the co-pilot holds ${holder ?? 'nothing'} here, and its crew must be quiet ${CREW_IDLE_MS / 60_000} min since a moment not yet noted`);
  }
  ticket.idleNoted = crewSeenAt;
  const text = `Idle ${ticketId}: no crew tool call for ${CREW_IDLE_MS / 60_000} min and nothing blocks it — need it, or release it and spawn its successor`;
  ticket.replies = [...messagesOf(ticket), deckLine(deck, text, new Date(now).toISOString())];
  writeDeck(deck);
  return ticket;
}

/** `repo`'s co-pilot on the deck in hand as `coPilotFor` gives it, `{ ticket, live }`, or null. */
function coPilotIn(deck, repo) {
  const entry = storedCoPilot(deck, repo);
  return entry ? { ticket: entry.ticket, live: isLiveCoPilot(deck, entry) } : null;
}

/**
 * The deck's crew wait (crew-handoff-trace spec 6, A3), one write: a crew-handoff `crewWaitOf` finds due now is stamped
 * `crewWaitNoted` and given one `from: 'deck'` line with a `seq`, which wakes the pilot's parked wait. Refused unless it
 * is due and not yet noted; it grants and releases nothing. Returns the item.
 */
export function noteCrewWait(itemId) {
  const deck = readDeck();
  const item = deck.items.find((stored) => stored.id === itemId);
  const now = Date.now();
  if (!item || !crewWaitOf(deck.items, item.repo, coPilotIn(deck, item.repo), now).some((due) => due.item === item)) {
    throw new DeckRefusal(`no crew wait on ${itemId} is due: an open crew-handoff must be owed a successor ${CREW_WAIT_MS / 60_000} min, not yet noted`);
  }
  const at = new Date(now).toISOString();
  item.crewWaitNoted = at;
  const text = `Successor owed on ${item.ticket}: ${item.id} open ${CREW_WAIT_MS / 60_000} min with no co-pilot — deck_ticket co-pilot it and spawn its successor`;
  item.replies = [...messagesOf(item), deckLine(deck, text, at)];
  writeDeck(deck);
  return item;
}

/** Every crew-handoff `crewWaitOf` will name, item id → `{ key, at }`, for the deck's one-shot timers. */
export function crewWaitsDue() {
  const deck = readDeck();
  const due = new Map();
  for (const { repo } of deck.items.filter((item) => item?.kind === KIND_CREW_HANDOFF && isOpen(item))) {
    for (const { item, at } of crewWaitOf(deck.items, repo, coPilotIn(deck, repo), Infinity)) due.set(item.id, { key: item.postedAt, at });
  }
  return due;
}

/**
 * `setCoPilot`'s release of `ticket`'s live co-pilot on the deck in hand, and the drain's end (never-stuck L6): an open
 * yellow ticket that was `yielding` turns green with `paused` its `yielding`; a closed one only loses the yield.
 * False, and nothing written, unless its live co-pilot is released now.
 */
export function finishYieldIn(deck, ticket) {
  const { yielding } = ticket;
  if (!releaseIn(deck, ticket.repo, ticket.id)) return false;
  if (yielding && isOpen(ticket) && stateOf(ticket) === 'yellow') Object.assign(ticket, { state: 'green', paused: yielding });
  return true;
}

/**
 * Send a green ticket back to implementing (overview-one-ticket spec 18, L8, L15, ADR 0066): yellow,
 * and its open gate2 closed `superseded by pivot`, unsigned, in this same write; never through
 * `resolveItem`, which refuses an unsigned gate. A gate2 the user signed is theirs and is
 * refused. Returns the ticket and the gate2 it superseded, if any.
 */
export function pivotTicket(id) {
  const deck = readDeck();
  const ticket = openTicketOf(deck, id);
  refuseLaneSwitch(deck, ticket.repo, switchLaneOf(ticket));
  if (stateOf(ticket) !== 'green') throw new DeckRefusal(`item ${id} is ${stateOf(ticket)}; only a green ticket pivots`);
  const gate2 = deck.items.find((item) => item?.kind === KIND_GATE2 && item.ticket === id && isOpen(item));
  if (gate2 && chosenOf(gate2) === SIGN_OFF) throw new DeckRefusal(`gate2 ${gate2.id} is signed off; resolve it rather than pivot ${id}`);
  enterStage(deck, ticket, 'yellow', 'landed');
  for (const field of ['live', 'paused', 'yielding']) delete ticket[field];
  if (gate2) {
    gate2.resolution = 'superseded by pivot';
    gate2.resolvedAt = new Date().toISOString();
  }
  touchRuns(deck, ticket.repo);
  writeDeck(deck);
  return { ticket, gate2 };
}

/**
 * Send a signed ticket back to planning (never-stuck spec 6, L7): an open yellow ticket no live co-pilot holds and
 * no gate2 has named turns red at its red queue's head, not live, marked `recut: { from, why, files, at }`, `from`
 * its plan's sha, in one write. The plan stays until a gate1 Sign off replaces it (store-items.mjs). Returns the ticket.
 */
export function recutTicket(id, why, files) {
  requireText('why', why);
  if (files !== undefined && !(Array.isArray(files) && files.every((file) => typeof file === 'string'))) {
    throw new DeckRefusal('a re-cut names its files as a list of paths');
  }
  const deck = readDeck();
  const ticket = openTicketOf(deck, id);
  if (stateOf(ticket) !== 'yellow') throw new DeckRefusal(`item ${id} is ${stateOf(ticket)}; only a signed, yellow ticket is re-cut`);
  // It joins the planning queue's head, so a pending planning switch holds it up as an arrow would; it never goes live,
  // so the yellow lane's only lock is the co-pilot switch naming it.
  refuseLaneSwitch(deck, ticket.repo, laneOfState('red'));
  refuseCoPilotSwitch(deck, ticket.repo, 'recut', id);
  const entry = storedCoPilot(deck, ticket.repo);
  if (entry?.ticket === id && isLiveCoPilot(deck, entry)) throw new DeckRefusal(`a live co-pilot holds ${id}; release it before the re-cut`);
  const gate2 = deck.items.find((item) => item?.kind === KIND_GATE2 && item.ticket === id);
  if (gate2) throw new DeckRefusal(`gate2 ${gate2.id} was posted on ${id}; a part-built ticket is never re-cut`);
  enterStage(deck, ticket, 'red', 'head');
  delete ticket.live;
  ticket.recut = { from: ticket.plan?.sha ?? null, why, ...(files === undefined ? {} : { files }), at: new Date().toISOString() };
  touchRuns(deck, ticket.repo);
  writeDeck(deck);
  return ticket;
}

/**
 * Move a signed plan to `sha` (never-stuck spec 15, L5; recut-decision L4): the caller has proven its signed sections
 * unchanged since `recut.from`, else `plan.sha`. An open red ticket carrying the re-cut mark goes yellow, its plan at
 * `sha` and never yet granted, the mark and liveness gone, as a gate1 Sign off leaves it; an open yellow signed ticket
 * keeps its state, liveness and grant, its plan at `sha`. One write; never a ticket a gate2 names. Returns the ticket.
 */
export function replanTicket(id, sha) {
  if (typeof sha !== 'string' || !SHA.test(sha)) throw new DeckRefusal('a replan names the new plan commit as its sha');
  const deck = readDeck();
  const ticket = openTicketOf(deck, id);
  const signed = ticket.plan !== null && typeof ticket.plan === 'object';
  const recut = signed && stateOf(ticket) === 'red' && Boolean(ticket.recut);
  if (!recut && !(signed && stateOf(ticket) === 'yellow' && !ticket.recut && typeof ticket.plan.sha === 'string')) {
    throw new DeckRefusal(`item ${id} is neither re-cut nor a signed yellow ticket; only those are replanned, any other takes a gate1`);
  }
  const gate2 = deck.items.find((item) => item?.kind === KIND_GATE2 && item.ticket === id);
  if (gate2) throw new DeckRefusal(`gate2 ${gate2.id} was posted on ${id}; a part-built ticket is never replanned`);
  ticket.plan = { ...ticket.plan, sha };
  if (recut) {
    enterStage(deck, ticket, 'yellow');
    delete ticket.plan.grantedAt;
    for (const field of ['live', 'recut']) delete ticket[field];
  }
  touchRuns(deck, ticket.repo);
  writeDeck(deck);
  return ticket;
}

/**
 * QA's `comment` on the newest record of `ticketId`, in the ticket's own directory (deck-writes-github spec 3, L3):
 * the newest text replaces the last, the walkthrough's or the gate2's. Returns that directory when it wrote, null
 * when there is no such ticket or it has no record yet. Here and not beside `setSlices`: store-runs is at its bar.
 */
export function setQaComment(ticketId, comment) {
  const deck = readDeck();
  const ticket = deck.items.find((item) => item.id === ticketId && item.kind === KIND_TICKET && typeof item.repo === 'string');
  if (!ticket) return null;
  const records = Array.isArray(deck.records) ? deck.records : [];
  const entry = records.findLast((each) => each?.repo === repoKey(ticket.repo) && each?.record?.ticket === ticketId);
  if (!entry) return null;
  entry.record = nextRecord(entry.record, { qaComment: comment, updatedAt: new Date().toISOString() });
  writeDeck(deck);
  return ticket.repo;
}

/** Every item on the deck, oldest first, each with whatever replies it has. */

export { clearSwitch, refuseCoPilotSwitch };
