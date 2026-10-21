/**
 * The store's reads and delivery, runs, co-pilot, budget, threads, slices and records
 * (audit-f1-f7 S15, L9). Moved whole from `deck/store.mjs`, which is now a facade;
 * the one deck.json is still read and written only inside the daemon (L3).
 */

import path from 'node:path';
import {
  DEFAULT_BUDGET,
  checkBudget,
} from './budget.mjs';
import {
  KIND_TICKET,
  KIND_USER,
  KIND_WALKTHROUGH,
  OWNER_ANSWER_MS,
  OWNER_PICK_UP_MS,
  SIGN_OFF,
  handsTo,
  isChainHandoff,
  isOpen,
  isQueued,
  isRecord,
  messagesOf,
  ownerOf,
  stateOf,
  switchOf,
} from './items.mjs';
import {
  MAX_RUNS,
  RunRefusal,
  featureName,
  freshRuns,
  isLive,
  liveRuns,
  newRun,
  nextRecord,
  recordFields,
  repoKey,
  sameRepo,
} from './runs.mjs';
import {
  SliceRefusal,
  mergeSliceTable,
} from './status.mjs';
import {
  DeckRefusal,
  MAX_WAIT_REPLIES,
  addChat,
  decksOf,
  findCredential,
  isLiveCoPilot,
  isMap,
  mintDeckNumber,
  newItemId,
  readDeck,
  refuseCredentials,
  releaseIn,
  requireText,
  runsOf,
  seqOf,
  storedCoPilot,
  stringsIn,
  switchesOf,
  touchRuns,
  writeDeck,
} from './store-core.mjs';
import {
  clearSwitch,
  parkedTicketOf,
  refuseCoPilotSwitch,
} from './store-tickets.mjs';

export function listItems() {
  return readDeck().items;
}

/** How far the deck has counted, which is where a session starting now begins. */
export function currentSeq() {
  return seqOf(readDeck());
}

/**
 * The replies the caller has not seen, oldest first — what `deck_wait` hands back, and
 * what slice 5's hook will inject. Bounded; and the cursor it returns is the last reply
 * actually handed over rather than the deck's own counter, so a caller that hit the
 * bound comes back for the rest instead of stepping over it.
 *
 * Only the user's messages are replies in this sense, and never on a record (report-record L3,
 * ADR 0148): the pilot's own push-backs carry no sequence number, and this says so a second
 * time; what wakes a session is a human having typed something where it may be answered, or
 * a landing that ended short, the `deck` line `ownerFilter` hands the pilot alone (three-lanes L7).
 * A record's own `deck` line, its report due (gate2-frees-lane spec 4), is that kind of line too.
 */
export function repliesSince(since = 0, limit = MAX_WAIT_REPLIES) {
  const deck = readDeck();
  const fresh = [];
  for (const item of deck.items) {
    for (const reply of messagesOf(item)) {
      if (!handsTo(reply, 'pilot') || (isRecord(item) && reply.from !== 'deck')) continue;
      const seq = Number.isInteger(reply.seq) ? reply.seq : 0;
      // The repository comes with it: a hook joins "this session's item" on it,
      // and asking the deck a second time for what it has just handed over would
      // be a second round trip after every tool call in the harness.
      // And the owner, so the inbox notice can tell QA's Sign off from the pilot's own thread;
      // and whether the thread is open, so an untaken wait needs no second read (crew-waits L3);
      // and its kind, so a hook can tell a gate, which passes only on the press (merge-first L7).
      if (seq > since) fresh.push({ itemId: item.id, title: item.title, repo: item.repo, owner: ownerOf(item), open: isOpen(item), kind: item.kind, ...reply, seq });
    }
  }
  fresh.sort((left, right) => left.seq - right.seq);

  const replies = fresh.slice(0, limit);
  return { replies, seq: fresh.length > limit ? replies.at(-1).seq : seqOf(deck) };
}

/**
 * Whether a reply is on a thread `kind` owns (ADR 0041): the predicate a wait
 * composes beside the repository join. It reads the deck when each reply is
 * asked about, so an owner that changes while a wait is parked is the one heard.
 * A reply whose item is gone is the pilot's, which is where an orphan goes.
 * One read serves a whole synchronous pass (a page of up to `MAX_WAIT_REPLIES`), and
 * is dropped at the next microtask so the next wake reads the store fresh.
 */
export function ownerFilter(kind) {
  let items = null;
  return (reply) => {
    if (items === null) {
      items = readDeck().items;
      queueMicrotask(() => (items = null));
    }
    const item = items.find((candidate) => candidate.id === reply?.itemId);
    // A parked green ticket's walkthrough: its QA agent has ended, so the reply is the live pilot's.
    const parked = parkedTicketOf(items, reply) !== undefined;
    if (parked && kind !== 'pilot') return false;
    // A short landing's line is the pilot's whoever owns the gate2 (three-lanes L7).
    if (reply?.from === 'deck') return kind === 'pilot';
    // The Sign off is the pilot's Gate 2 too, whoever owns the thread, and handing it to
    // one of the two hides it from neither (L2).
    if (isGateReply(item, reply)) return kind === 'pilot' || ownerOf(item) === kind;
    // A reply already handed to another kind is that kind's, whoever owns the thread now (A9);
    // one taken back under L7 was handed to both, so it is the pilot's as well.
    if (reply?.deliveredTo !== undefined && ![reply.deliveredTo].flat().includes(kind)) return false;
    return parked || ownerOf(item) === kind;
  };
}

/** The walkthrough's Sign off, exactly: the one reply with two recipients (L2, A9). */
function isGateReply(item, reply) {
  return item?.kind === KIND_WALKTHROUGH && reply?.from === 'user' && reply?.text === SIGN_OFF;
}

/**
 * Record that these replies have just been handed to a session — the hand-off, which is
 * the only fact about the pilot's attention the deck can honestly know (D4, ADR 0017).
 * It says the text reached a session, never that a model read it or agreed with it.
 *
 * Written once and never rewritten: a reply handed to a second session has not become
 * newer, and the moment the user's answer first left the deck is the moment the bar is
 * about. The reply is named by the sequence number the deck gave it, which is unique
 * across the deck; the pilot's own messages carry none and are not handed to anybody,
 * and neither is a reply from a deck written before sequence numbers existed.
 *
 * `to` is the owner kind it was handed to, written beside `deliveredAt` and just as once
 * (A9): a reply is handed to at most one kind, and the bar names that kind. The Sign off
 * is the one exception (L2): handed to its second kind, it records both, `['qa', 'pilot']`,
 * and keeps the `deliveredAt` of the first.
 *
 * Returns whether the store was written, which is what the caller announces a change on:
 * `deck_read` hands the same replies over on every call, so writing and waking every open
 * page per poll would make the deck noisy all day for no news at all (D5).
 */
export function markDelivered(handedOver, to) {
  const fresh = new Set();
  for (const reply of handedOver) {
    // Off the caller's own copies, so a poll that has nothing new to say does not even
    // read the file. What is actually written is decided against the stored deck below.
    const unseen = !reply.deliveredAt || (reply.text === SIGN_OFF && ![reply.deliveredTo].flat().includes(to));
    if (handsTo(reply, to) && Number.isInteger(reply.seq) && unseen) {
      fresh.add(reply.seq);
    }
  }
  if (fresh.size === 0) return false;

  const deck = readDeck();
  const deliveredAt = new Date().toISOString();
  let marked = 0;
  for (const item of deck.items) {
    for (const reply of messagesOf(item)) {
      if (!handsTo(reply, to) || !fresh.has(reply.seq)) continue;
      // A closed thread's reply is not handed over for the first time; the Sign off's second
      // recipient still is, because QA closes its walkthrough on the press (A6).
      if (!reply.deliveredAt && isOpen(item)) {
        reply.deliveredAt = deliveredAt;
        reply.deliveredTo = to;
      } else if (isGateReply(item, reply) && typeof reply.deliveredTo === 'string' && reply.deliveredTo !== to) {
        reply.deliveredTo = ['qa', 'pilot'];
      } else continue;
      marked += 1;
    }
  }
  // Nothing moved — another session marked these between the read and here — so D5 holds
  // for that race too rather than only for the ordinary poll.
  if (marked === 0) return false;

  writeDeck(deck);
  return true;
}

/**
 * When the owner's time on this user reply runs out, or null when it never will (L6, L7):
 * unclaimed, `OWNER_PICK_UP_MS` after it arrived; handed to the owner and not answered on
 * the thread since, `OWNER_ANSWER_MS` after the hand-off. A Sign off reaches the pilot
 * anyway (L2), so it is never taken back once its owner has it.
 */
function ownersTimeUp(item, index, owner) {
  const reply = messagesOf(item)[index];
  if (reply.from !== 'user' || !Number.isInteger(reply.seq)) return null;
  if (!reply.deliveredAt) return (Date.parse(reply.repliedAt) || 0) + OWNER_PICK_UP_MS;
  if (reply.deliveredTo !== owner || isGateReply(item, reply)) return null;
  const answered = messagesOf(item).slice(index + 1).some((message) => message.from === 'pilot');
  return answered ? null : (Date.parse(reply.deliveredAt) || 0) + OWNER_ANSWER_MS;
}

/**
 * The user replies in `repo` still waiting on an owner other than the pilot, each with
 * the moment it becomes overdue (L6, L7, A7): its owner's time up, and the owner kind
 * quiet (`quietAt`, the roster's live window after its last activity). Pure over the
 * deck, and blind to any cursor, because the pilot's has already moved past a reply it
 * did not own.
 */
function waitingOnForeign(repo, quietAt) {
  const waiting = [];
  for (const item of readDeck().items) {
    const owner = ownerOf(item);
    if (owner === 'pilot' || isRecord(item) || !isOpen(item) || (typeof item.repo === 'string' && !sameRepo(item.repo, repo))) continue;
    messagesOf(item).forEach((reply, index) => {
      const timeUp = ownersTimeUp(item, index, owner);
      if (timeUp === null) return;
      const dueAt = Math.max(timeUp, quietAt(owner));
      waiting.push({ reply: { itemId: item.id, title: item.title, repo: item.repo, owner, ...reply }, dueAt });
    });
  }
  return waiting;
}

/**
 * One read for the fallback: the replies the pilot is to be handed now, oldest first,
 * and the earliest moment one of the rest becomes overdue, or null while none waits.
 * `quietAt(kind)` is when that kind counts as quiet in `repo`.
 */
export function fallbackDue(repo, now, quietAt) {
  const waiting = waitingOnForeign(repo, quietAt);
  const overdue = waiting.filter(({ dueAt }) => dueAt <= now).map(({ reply }) => reply);
  const later = waiting.filter(({ dueAt }) => dueAt > now).map(({ dueAt }) => dueAt);
  return { overdue: overdue.sort((left, right) => left.seq - right.seq), nextAt: later.length ? Math.min(...later) : null };
}

/**
 * The fallback, as one write (spec 5): the thread becomes the pilot's, and the named
 * replies are marked handed to the pilot, after the owner that had one already (L7), so
 * such a reply is handed to each kind once, like the Sign off. The deck's own write, not
 * an agent's, so no author and no `mayWrite`; and no message, so the user's reply stays
 * the thread's last and every "whose turn is it" reading still sees it waiting on the
 * pilot. Null when there is nothing left to hand over: another wait got there first.
 */
export function fallBack(id, replySeqs) {
  const deck = readDeck();
  const item = deck.items.find((candidate) => candidate.id === id);
  const owner = ownerOf(item);
  if (item === undefined || !isOpen(item) || owner === 'pilot') return null;
  const claimed = messagesOf(item).filter(
    (reply) => reply.from === 'user' && replySeqs.includes(reply.seq) && (!reply.deliveredAt || reply.deliveredTo === owner),
  );
  if (claimed.length === 0) return null;
  const at = new Date().toISOString();
  for (const reply of claimed) {
    reply.deliveredTo = reply.deliveredAt ? [owner, 'pilot'] : 'pilot';
    reply.deliveredAt ??= at;
  }
  item.owner = 'pilot';
  writeDeck(deck);
  return item;
}

/** The runs whose sessions are still up. Dead ones leave the file on the next write. */
export function listRuns() {
  return liveRuns(listStoredRuns());
}

/**
 * Every run the deck serves, ended ones included — which is what the home page reads,
 * because a run whose session has gone keeps its tab while it has an open thread
 * (spec 6). `listRuns` is the other question, "who is here now", and it still answers
 * it for `/api/runs` and for the list of runs on `/items`.
 *
 * Whether a session is still up is not stored and never will be: it is `isRunning`
 * asked at the moment the question is put, which is what `tabsOf` does when it decides
 * whether a tab has ended. No heartbeat, no timer, nothing to expire.
 *
 * What a *stale* run is, on the other hand, is stored — two days of silence or a
 * dismissal (D12, D13) — and this is the one place it is filtered, so the page and
 * the API cannot come to disagree about which runs the deck has. A stale record is
 * not deleted and its items never are (L14): a repository with an open thread still
 * gets its tab out of that thread, the way one whose record `MAX_RUNS` evicted
 * always has (`deck/tabs.mjs`), and the run itself is back on the page the moment it
 * writes anything.
 */
export function listStoredRuns() {
  return freshRuns(runsOf(readDeck()));
}

/**
 * The pid-alive runs, with no staleness or dismissal filter at all — `liveRuns`
 * asked of the deck's raw run list, before `freshRuns` narrows it (D12, D13).
 *
 * `listRuns` is what a *page* shows and is right to hide a dismissed run; this
 * is what a *hook* asks to tell a pilot session from an ordinary one
 * (`hooks/lib/deck.js`'s `isOnDeck`), and that identity does not change because
 * the run was dismissed from the page a moment ago. Without this, dismissing a
 * live run would silently turn off its session's Stop gate and reply injection
 * until it wrote to the deck again.
 */
export function listLiveRuns() {
  return liveRuns(runsOf(readDeck()));
}

/**
 * The agent split of the deck in `dir` (pilot-branch L27): `deck.budgets[repoKey]`. A deck with none, or an entry that
 * no longer passes `checkBudget`, has the default: stored entries are only ever written checked. An entry
 * stored before yellow-agent names its second half `sub`: that is read as `yellow` (spec 7).
 */
function storedBudget(deck, dir) {
  const budgets = deck.budgets !== null && typeof deck.budgets === 'object' && !Array.isArray(deck.budgets) ? deck.budgets : {};
  const key = repoKey(dir);
  try {
    const { main, yellow, sub } = budgets[key] ?? DEFAULT_BUDGET;
    return { key, budgets, budget: checkBudget({ main, yellow: yellow ?? sub }).budget };
  } catch {
    return { key, budgets, budget: { ...DEFAULT_BUDGET } };
  }
}

/** `dir`'s co-pilot (L4): live only while the entry says so and its ticket is still open and yellow, or null for none. */
export function coPilotFor(dir) {
  requireText('repo', dir);
  const deck = readDeck();
  const entry = storedCoPilot(deck, dir);
  return entry ? { ticket: entry.ticket, live: isLiveCoPilot(deck, entry), at: entry.at } : null;
}

/**
 * Both lanes of every repository (ticket-state-accents L3, L19; ADR 0106), one store read: `co-pilots` by `coPilotFor`'s
 * rule, `{ [repoKey]: ticketId }`; `switches` as stored, judged where read; `records` the stored `{ repo, record }` (S5 A-f6).
 */
export function deckLanes() {
  const deck = readDeck();
  const coPilots = {};
  for (const [key, entry] of Object.entries(deck.coPilots ?? {})) {
    if (typeof entry?.ticket === 'string' && typeof entry.at === 'string' && isLiveCoPilot(deck, entry)) coPilots[key] = entry.ticket;
  }
  return { coPilots, switches: isMap(deck.switches) ? deck.switches : {}, records: recordsOf(deck) };
}

/**
 * `deck_ticket co-pilot` / `release` (spec 2, L8) on the open yellow ticket `ticketId`; another ticket's release changes nothing.
 * `co-pilot` on the pending co-pilot switch's `to` completes it (spec 18, L18): the record cleared in the same write.
 */
export function setCoPilot(ticketId, live) {
  const deck = readDeck();
  const ticket = deck.items.find((item) => item.id === ticketId && item.kind === KIND_TICKET && typeof item.repo === 'string');
  if (!ticket) throw new DeckRefusal(`no ticket ${ticketId} on the deck`);
  refuseCoPilotSwitch(deck, ticket.repo, live ? 'co-pilot' : 'release', ticketId);
  if (live) {
    if (!isOpen(ticket) || stateOf(ticket) !== 'yellow') throw new DeckRefusal(`item ${ticketId} is ${isOpen(ticket) ? stateOf(ticket) : 'closed'}; a co-pilot builds an open yellow ticket`);
    // While a chain hand-off is open here, the session after its /clear spawns the next co-pilot (A1).
    const chain = deck.items.find((item) => isChainHandoff(item, ticket.repo) && isOpen(item));
    if (chain) throw new DeckRefusal(`a /clear is due for ${chain.id}; spawn no co-pilot, the session after it will`);
    if (switchOf(deck.items, ticket.repo, switchesOf(deck, ticket.repo).lanes, 'coPilot')?.to === ticketId) clearSwitch(deck, ticket.repo, 'coPilot');
    const coPilots = deck.coPilots !== null && typeof deck.coPilots === 'object' && !Array.isArray(deck.coPilots) ? deck.coPilots : {};
    deck.coPilots = { ...coPilots, [repoKey(ticket.repo)]: { ticket: ticketId, live: true, at: new Date().toISOString() } };
  } else if (!releaseIn(deck, ticket.repo, ticketId)) {
    return storedCoPilot(deck, ticket.repo);
  }
  writeDeck(deck);
  return storedCoPilot(deck, ticket.repo);
}

/** `pilot run` starting in `dir` (spec 5): whatever co-pilot the deck holds there is released. */
export function releaseCoPilot(dir) {
  const deck = readDeck();
  if (releaseIn(deck, dir)) writeDeck(deck);
}

/** `{ main, yellow }` for the deck in `dir`; the default for a directory with no setting. */
export const budgetFor = (dir) => storedBudget(readDeck(), requireText('repo', dir)).budget;

/**
 * `POST /api/budget` (L27): set the fields given for the deck in `dir`, keeping the other, and answer
 * `{ budget, warning? }`; with
 * neither, the split as stored, refused where no session runs, so a session learns its number from
 * `pilot budget` (A23: `curl` is outside its allowlist). A refusal names the field and its floor.
 */
export function setBudget(dir, { main, yellow } = {}) {
  requireText('repo', dir);
  const deck = readDeck();
  const reading = main === undefined && yellow === undefined;
  if (reading && !runsOf(deck).some((run) => sameRepo(run.repo, dir))) {
    throw new DeckRefusal(`${dir} has no session on this deck; run pilot budget where a pilot session runs`);
  }
  const { key, budgets, budget: stored } = storedBudget(deck, dir);
  let checked;
  try {
    // Only an absent field keeps the stored one: `null` is a value, and refused as one.
    checked = checkBudget({ main: main === undefined ? stored.main : main, yellow: yellow === undefined ? stored.yellow : yellow });
  } catch (err) {
    throw new DeckRefusal(err.message);
  }
  if (!reading) {
    deck.budgets = { ...budgets, [key]: checked.budget };
    writeDeck(deck);
  }
  return checked;
}

/**
 * Record that a session in this repository is on the deck. Registering is also when the
 * deck tidies up: runs whose sessions have gone are dropped, a session registering
 * twice replaces its own row rather than doubling it, and the list is bounded so a
 * machine that leaks sessions cannot grow the store without end.
 *
 * "Dropped" is narrower than it was: a dead record whose repository still has an open
 * thread is kept (D4 of run-tabs). Without that, a session starting anywhere on the machine wiped
 * the record behind a question the user had not answered yet, and the tab that question
 * hangs on lost the name the pilot gave it and the last table it posted. The bound is
 * unmoved — wanting a record is not a licence to grow the store — and no item was ever
 * dropped by any of this (L14).
 */
export function registerRun({ repo, pid, session }) {
  requireText('repo', repo);
  refuseCredentials('this run', repo);

  let run;
  try {
    run = newRun({ repo, pid, session });
  } catch (err) {
    // A malformed run is the caller's mistake, not the deck's, so it comes back as the
    // same refusal every other bad input does and one path answers the client.
    if (err instanceof RunRefusal) throw new DeckRefusal(err.message);
    throw err;
  }

  const deck = readDeck();
  // The repositories with a thread still open on them, read once: a record that is not
  // live is kept only while its repository is one of them.
  const waiting = deck.items.filter(isQueued).map((item) => item.repo);
  // A run is a repository plus a session, so that pair is what makes two registrations
  // the same run. A session that registers twice replaces itself; two sessions in two
  // repositories are two rows even though one machine numbered them both.
  //
  // Replacing is narrowed by the session key (session-row L1): a register that carries
  // the key its row already holds is the same session retrying (a client timeout after
  // the store had written), so the row stays, id, name and table with it, and only
  // `lastSeenAt` moves. A different key on the same pid is a new session the OS handed a
  // dead one's pid, and no key at all is an older client: both replace as before (L2).
  const same = runsOf(deck).find(
    (existing) =>
      run.session !== undefined &&
      existing.session === run.session &&
      existing.pid === run.pid &&
      existing.repo === run.repo,
  );
  if (same) {
    same.lastSeenAt = run.lastSeenAt;
    run = same;
  }
  const kept = runsOf(deck).filter(
    (existing) =>
      (existing.pid !== run.pid || existing.repo !== run.repo) &&
      (isLive(existing) ||
        waiting.some((repo) => sameRepo(repo, existing.repo))),
  );
  deck.runs = [...kept, run].slice(-MAX_RUNS);
  // Registering is where a directory is first seen, so it is where it is numbered
  // (L2). The number is not written onto the row: the row is fresh at every new
  // session and the number must not be, which is the whole of ADR 0023.
  mintDeckNumber(deck, run.repo);
  addChat(deck, run.repo);
  writeDeck(deck);
  return run;
}

/** A created thread's name (L2): it may one day reach a process list, so it is plain words. */
const THREAD_NAME = /^[A-Za-z0-9 _-]{1,60}$/;

/**
 * A thread the user opened with Create (independence spec 3, L1): a user thread
 * with a name, never classified, on a repository the deck already numbers. It is
 * queued until the pilot or the user closes it (2026-09-28), and a message in it
 * wakes every parked `deck_wait` of the repository like any reply (ADR 0039).
 */
export function createThread({ name, repo }) {
  const title = typeof name === 'string' ? name.trim() : '';
  if (!THREAD_NAME.test(title)) {
    throw new DeckRefusal('a thread name is 1 to 60 letters, digits, spaces, _ or -');
  }
  const deck = readDeck();
  if (typeof repo !== 'string' || !Number.isInteger(decksOf(deck)[repoKey(repo)])) {
    throw new DeckRefusal('Create opens a thread on a repository the deck knows; start a pilot there once first');
  }
  const item = {
    id: newItemId(),
    kind: KIND_USER,
    title,
    body: 'Say what you want; the pilot of this repository answers here.',
    repo,
    postedAt: new Date().toISOString(),
    replies: [],
  };
  deck.items.push(item);
  writeDeck(deck);
  return item;
}

/**
 * Update one run's slice table — the rows the home screen renders. The call's rows are
 * merged over the stored table (`mergeSliceTable`, independence spec 22.2): wholesale
 * replacement made the pilot resend every row on every call, and a row nobody meant
 * to keep now leaves only by `drop: true`, said out loud.
 *
 * The table hangs off the run row rather than living in a store of its own (§4 L4's
 * "no third store"), so it shares the run's lifetime: when a session goes, its table
 * goes with it on the next registration, exactly as its row on the page does. Items
 * are not runs and are never discarded (L14).
 *
 * `feature` is what the run is called on the deck, and it is the one part of the call
 * that is *not* replaced wholesale: a call that omits it keeps the name the run already
 * had (A2). The pilot names its run once and posts tables many times, and clearing the
 * name on every table would flicker the tab back to the directory it was started in —
 * which is the whole complaint this feature answers.
 *
 * What comes back is the table and the number of the deck it was posted to, because
 * that is what the tool's answer tells the agent it is working in (spec 10). The
 * number is minted here as well as at registration, from the one counter: a session
 * that registered before this slice existed still has its run row, so this is where
 * its directory is first seen and there is nothing to fall back to.
 */
export function setSlices(runId, slices, feature, given = {}) {
  if (typeof runId !== 'string' || runId.trim() === '') {
    throw new DeckRefusal('run must be the id the deck gave this session when it registered');
  }

  const deck = readDeck();
  const run = runsOf(deck).find((candidate) => candidate.id === runId);
  if (!run) {
    throw new DeckRefusal(`no run ${runId} on the deck; this session is not registered on it`);
  }

  let table;
  let name;
  let fields;
  try {
    if (feature !== undefined) name = featureName(feature);
    fields = recordFields(given);
    // With a slug, the rows are laid over that slug's record table, because the record
    // outlives the session: a fresh session's first partial call must not empty it. A
    // slug with no record starts from nothing, never from another slug's rows still on
    // the run, so the tab holds one run (thread-kinds L9).
    const previous = fields === null ? undefined : recordsOf(deck).find(recordOf(run, fields.slug))?.record;
    const under = fields === null ? run.slices : (previous?.slices ?? []);
    table = mergeSliceTable(under, slices);
  } catch (err) {
    // Same shape as a malformed run: the caller's mistake comes back as the refusal
    // every other bad input does, so one path answers the client.
    if (err instanceof SliceRefusal || err instanceof RunRefusal) {
      throw new DeckRefusal(err.message);
    }
    throw err;
  }
  // Every string the call carries, walked rather than listed: the name, every
  // cell of every row, every record field and finding line, so a field added
  // later is read without anyone remembering to add it. `after` is read too,
  // though it must match another row: it matches through `sliceKey`, which
  // lower-cases, and these patterns do not. A6 is only true if it reads every cell.
  refuseCredentials('this status', stringsIn({ name, table, fields }).join('\n'));

  // The closing call empties the tab and its tree; the record below keeps the table.
  const finished = fields?.finished !== undefined;
  run.slices = finished ? [] : table;
  if (name !== undefined) run.feature = name;
  // A table is the session saying where it has got to, which is the plainest
  // activity there is, and the one write that names its own run — so it is the
  // one that can lift a dismissal with two sessions on the repository. The run is
  // found above in the stored list rather than the served one, so a run that has
  // gone stale or been dismissed can still post one and come back (D12).
  touchRuns(deck, run.repo, run.id);
  const number = mintDeckNumber(deck, run.repo);
  const record = fields === null ? null : upsertRecord(deck, run, table, fields, name);
  writeDeck(deck);
  return { deckNumber: number, slices: table, record };
}

/** The most of land's line a feature row keeps: its last this many characters (clean-landing S8). */
const MAX_LANDING_NOTE = 300;

/**
 * A landing's outcome on the ticket's feature row, the row named by its record's slug (clean-landing
 * spec 12): `landed: <line>` or `refused: <line>` (land's `NOT landed:` dropped), the line's tail, a credential withheld as the
 * gate2's thread withholds it. The record gains the row if it had none; every run in the directory
 * whose table holds it too, as the page draws that. A table the merge refuses keeps what it had; no record, no write.
 */
export function noteLanding(repo, ticketId, { ok, line }) {
  if (typeof repo !== 'string' || repo.trim() === '') return;
  const deck = readDeck();
  const record = recordsOf(deck).findLast((entry) => entry?.repo === repoKey(repo) && entry?.record?.ticket === ticketId)?.record;
  if (typeof record?.slug !== 'string') return;
  const said = String(line ?? '').replace(/\s+/g, ' ').trim().replace(/(^|\s)NOT landed: /, (_, space) => (space ? '; ' : ''));
  const credential = findCredential(said);
  const note = credential ? `its output was withheld: it looks like ${credential}` : said.slice(-MAX_LANDING_NOTE);
  // `ok` unset is the begin (gate2-frees-lane spec 2): the row reads the line as it is, `landing started in <worktree>`.
  const row = { slice: record.slug, state: ok == null ? note : `${ok ? 'landed' : 'refused'}: ${note}` };
  const noted = (table) => {
    try {
      return mergeSliceTable(table, [row]);
    } catch (err) {
      if (!(err instanceof SliceRefusal)) throw err;
      console.error(`[deck] the landing note could not reach a table: ${err.message}`);
      return table;
    }
  };
  record.slices = noted(record.slices);
  record.updatedAt = new Date().toISOString();
  for (const run of runsOf(deck)) {
    const holds = Array.isArray(run.slices) && run.slices.some((cells) => String(cells?.slice ?? '').trim().toLowerCase() === row.slice.trim().toLowerCase());
    if (holds && sameRepo(run.repo, repo)) run.slices = noted(run.slices);
  }
  writeDeck(deck);
}

/** The run records on a deck, tolerating one written before records existed. */
function recordsOf(deck) {
  return Array.isArray(deck.records) ? deck.records : [];
}

/**
 * Write this call's record into the deck the caller holds (L5, L19 of run-record).
 * One record per directory and slug, kept in `deck.records` rather than on the run,
 * so it outlives the session that wrote it. The entry written moves to the end,
 * which is what makes the last one for a directory its newest (`recordFor`). The
 * table is the whole table, as on the run; the feature is the name this slug was given.
 */
const recordOf = (run, slug) => {
  const key = repoKey(run.repo);
  return (entry) => entry?.repo === key && entry?.record?.slug === slug;
};

function upsertRecord(deck, run, table, fields, name) {
  const key = repoKey(run.repo);
  const records = recordsOf(deck);
  const mine = recordOf(run, fields.slug);
  const previous = records.find(mine)?.record ?? {};
  const record = nextRecord(previous, {
    ...fields,
    feature: name ?? previous.feature,
    slices: table,
    updatedAt: new Date().toISOString(),
  });
  // A 0.7.19 sub-deck stamped the record it wrote (A17); the sub-deck is gone (L10), so a write drops it.
  delete record.subdeck;
  deck.records = [...records.filter((entry) => !mine(entry)), { repo: key, record }];
  return record;
}

/**
 * The newest run record written in this directory, or null. What
 * `GET /api/record` serves the SessionStart hook: the record as stored, without
 * open threads, which the hook derives from its own read (L6, L7).
 */
export function recordFor(repo) {
  const deck = readDeck();
  const { key } = recordHomeOf(deck, repo);
  const mine = (entry) => entry?.repo === key;
  return recordsOf(deck).findLast(mine)?.record ?? null;
}

/**
 * `recordFor`, as a main session starting is handed it (yellow-agent L11, ADR 0087): null when the
 * newest record's `ticket` is an open yellow ticket, because the main slot is never yellow; never the
 * record before it, which could resurrect an older abandoned run. Read by `GET /api/record` without
 * `ticket` and by `chainNext` at a main start.
 */
export function resumableRecordFor(repo) {
  const record = recordFor(repo);
  if (record === null) return null;
  const deck = readDeck();
  const ticket = deck.items.find((item) => item?.id === record.ticket && item.kind === KIND_TICKET);
  return ticket && isOpen(ticket) && stateOf(ticket) === 'yellow' ? null : record;
}

/** The key a record asked for in `repo` is filed under (L6), refused when no directory is named. */
function recordHomeOf(deck, repo) {
  if (typeof repo !== 'string' || repo.trim() === '') {
    throw new DeckRefusal('repo must be the path of the directory whose record you want');
  }
  return { key: repoKey(repo) };
}

/**
 * `{ record, ticket }` from one read: the newest record in this directory that names
 * `ticketId`, or null, found by the record's `ticket`, never a copy on the ticket
 * (ticket-states L5); and the ticket, its plan included. A ticket id that is not a ticket in
 * this directory is refused by name.
 */
export function recordForTicket(repo, ticketId) {
  const deck = readDeck();
  const { key } = recordHomeOf(deck, repo);
  const ticket = deck.items.find((item) => item.id === ticketId && item.kind === KIND_TICKET && typeof item.repo === 'string' && repoKey(item.repo) === key);
  if (!ticket) throw new DeckRefusal(`no ticket ${ticketId} in ${repo}`);
  const record = recordsOf(deck).findLast((entry) => entry?.repo === key && entry?.record?.ticket === ticketId)?.record ?? null;
  return { record, ticket };
}

/**
 * The directory's first open yellow ticket that has a signed plan, in deck order, with that plan
 * and its newest record, or null (yellow-agent S6): what a fresh main session re-briefs its
 * co-pilot from. The plan comes from the ticket, never the record (L5).
 */
export function yellowHeadOf(dir) {
  const deck = readDeck();
  const { key } = recordHomeOf(deck, dir);
  const ticket = deck.items.find((item) => item?.kind === KIND_TICKET && typeof item.repo === 'string' && repoKey(item.repo) === key && isOpen(item) && stateOf(item) === 'yellow' && item.plan);
  if (!ticket) return null;
  const { artefact, branch, sha, sliceCount } = ticket.plan;
  const record = recordsOf(deck).findLast((entry) => entry?.repo === key && entry?.record?.ticket === ticket.id)?.record ?? null;
  return { ticket: { id: ticket.id, title: ticket.title }, plan: { artefact, branch, sha, sliceCount }, record };
}

/**
 * Every run record written in this directory, oldest first, or [] with no store.
 * Read-only: the audit's reader of closing reports (ADR 0044) imports this and
 * nothing else from here.
 */
export function recordsFor(repo) {
  if (typeof repo !== 'string' || repo.trim() === '') {
    throw new DeckRefusal('repo must be the path of the directory whose records you want');
  }
  const key = repoKey(repo);
  return recordsOf(readDeck()).filter((entry) => entry?.repo === key).map((entry) => entry.record);
}

/**
 * Every absolute worktree a run's table or a run record names, the feature's and each
 * slice's, with the repository it was named in: the runs' in registration order, then the
 * records', each after those written before it. Read-only: the usage log
 * asks it where a removed worktree belonged (L19 of usage-telemetry).
 */
export function namedWorktrees() {
  const deck = readDeck();
  const rows = [...runsOf(deck), ...recordsOf(deck).map((entry) => ({ ...entry?.record, repo: entry?.repo }))];
  return rows.flatMap((row) =>
    typeof row?.repo !== 'string'
      ? []
      : [row.worktree, ...(Array.isArray(row.slices) ? row.slices.map((slice) => slice?.worktree) : [])]
          .filter((worktree) => typeof worktree === 'string' && path.isAbsolute(worktree))
          .map((worktree) => ({ worktree, repo: row.repo })),
  );
}

/**
 * Take a run off the deck by hand (spec 7, D13). The user has decided this run is
 * not what they are working on, and the deck has no opinion to weigh against that:
 * a live session whose pid is up is still on the page until it is dismissed, and
 * nothing but the run itself puts it back.
 *
 * A dismissal is one stamp written on the record and nothing else. No row is
 * removed, no table is cleared and no item is touched — items are kept for ever
 * (L14), so the questions of a dismissed run are still answerable on their
 * threads and still hold the tab their repository has. The run is back on the
 * page the moment it registers again or writes anything (`touchRuns`), which is
 * the whole of "until it posts again".
 */
export function dismissRun(id) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new DeckRefusal('dismiss must name the run to take off the deck');
  }

  const deck = readDeck();
  // The stored list, not the served one: dismissing a run that has already aged
  // out is not an error, and neither is dismissing one twice.
  const run = runsOf(deck).find((candidate) => candidate.id === id);
  if (!run) throw new DeckRefusal(`no run ${id} on the deck`);

  run.dismissedAt = new Date().toISOString();
  writeDeck(deck);
  return run;
}
