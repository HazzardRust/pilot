/**
 * The deck's items: posting one, replies, the gates and resolving, reopening, dismissing
 * and closing (audit-f1-f7 S14, L9). Moved whole from `deck/store.mjs`, which re-exports
 * every public name; `mayWrite` is exported for the siblings that still need it.
 */

import {
  CLOSABLE_KINDS,
  CLOSED,
  CLOSED_BY_USER,
  ASSUME_DEFAULT,
  CLOSED_WITH,
  DISMISSED_BY_USER,
  HELPER_KINDS,
  KIND_CHAT,
  KIND_GATE1,
  KIND_GATE2,
  KIND_HANDOFF,
  HANDOFF_FAILED,
  KIND_QUESTION,
  KIND_REPORT,
  KIND_TICKET,
  KIND_USER,
  KIND_WALKTHROUGH,
  PASS_KINDS,
  SIGN_OFF,
  SILENT_KINDS,
  authorKind,
  chosenOf,
  gate2Blockers,
  isKnownKind,
  isAnswered,
  isBlocking,
  isGate,
  isOpen,
  isRecord,
  lastSaid,
  messagesOf,
  ownerOf,
  isPaused,
  pausedOn,
  isShortPath,
  stateOf,
  waiterKind,
} from './items.mjs';
import { LANDER_LINE } from '../scripts/merge-generated.mjs';
import { sameRepo } from './runs.mjs';
import { keptWorktree, landerDue, landingReply } from './landing-replies.mjs';
import { blockedShapeGaps, isMoot } from './blocked-shape.mjs';
import { questionShapeGaps } from './question-shape.mjs';
import { reportAskGaps } from './report-shape.mjs';
import { ticketShapeGaps } from './ticket-shape.mjs';
import { walkthroughShapeGaps } from './walkthrough-shape.mjs';
import { enterStage } from './store-stage.mjs';
import { shortGate2Gaps } from './short-path-shape.mjs';
import { MAX_QUESTION_CHARS, POSTABLE_KINDS, andList } from './tools.mjs';
import {
  DeckRefusal,
  KIND_SHAPE,
  bylineOf,
  detailOf,
  gate2Refusal,
  newItemId,
  readDeck,
  refuseCredentials,
  refuseOverOpenQuestions,
  refuseUnmerged,
  releaseIn,
  requireText,
  seqOf,
  touchRuns,
  wordsOf,
  writeDeck,
} from './store-core.mjs';
import { archivedItem } from './store-archive.mjs';

/** Who may post a gate, by stamped kind (three-lanes spec 14, L14): the pilot or the architect posts planning's (architect-runs-red L4), and the pilot or QA concluding's. A kind absent here is anyone's; an unstamped call is the pilot's. */
const POSTERS = Object.freeze({ [KIND_GATE1]: Object.freeze(['pilot', 'architect']), [KIND_GATE2]: Object.freeze(['pilot', 'qa']) });

/** Refuses a gate whose stamped author is not among its posters; the tool calls it before a gate1's lineage runs git. */
export function refusePoster(kind, author) {
  const posters = Object.hasOwn(POSTERS, kind) ? POSTERS[kind] : null;
  if (posters && !posters.includes(writerKind(author))) throw new DeckRefusal(`a ${kind} is posted by ${andList(posters)}, not ${author}`);
}

/** Post one item to the deck. Returns the stored item. */
export function postItem({ kind, title, body, author, longer, ...given }) {
  requireText('kind', kind);
  if (!KIND_SHAPE.test(kind)) {
    throw new DeckRefusal(`kind must be a short name like question or walkthrough, not ${JSON.stringify(kind)}`);
  }
  // One chat per repository holds only if the registration is its one writer (L4).
  if (kind === KIND_CHAT) throw new DeckRefusal("kind chat is refused: the deck makes a repository's chat itself");
  if (kind === KIND_USER) throw new DeckRefusal('kind user is refused: only the user opens one, with Create');
  // Retired (thread-kinds spec 25, L15, ADR 0057); one stored before draws as an unknown kind.
  if (kind === 'spec') throw new DeckRefusal('kind spec is retired: the spec lives in the artefact §2 and is read at Gate 1');
  // The thread types are a closed list at post, never at read (L1, L3, ADR 0051).
  if (!POSTABLE_KINDS.includes(kind)) {
    throw new DeckRefusal(`kind must be one of ${andList(POSTABLE_KINDS)}, not ${JSON.stringify(kind)}`);
  }
  // A gate is posted by its stage's carrier only, read from the hook's stamp before the store is (three-lanes spec 14, L14).
  refusePoster(kind, author);
  requireText('title', title);
  requireText('body', body);
  // A question is read and answered on one screen (L7); the rest belongs in a file.
  if (kind === KIND_QUESTION && body.length > MAX_QUESTION_CHARS) {
    throw new DeckRefusal(
      `a question's body is at most ${MAX_QUESTION_CHARS} characters, one screen; ` +
        'put the rest in a file and name its path',
    );
  }
  // A ticket is posted in ticket-making's shape (crew-voice-rules spec 14, L12), refused before the store is read.
  const gaps = kind === KIND_TICKET ? ticketShapeGaps(body) : [];
  if (gaps.length > 0) throw new DeckRefusal(`a ticket's body is not in ticket-making's shape; missing: ${gaps.join(', ')}`);
  // A crew question's default says what research it rests on (bigger-jobs spec 8, A1, A7).
  const unresearched = kind === KIND_QUESTION ? questionShapeGaps(body, { recommended: given.recommended, author }) : [];
  if (unresearched.length > 0) {
    throw new DeckRefusal(
      `a question with a recommended default carries a Research: line (grilling, ADR 0119); missing: ${unresearched.join(', ')}`,
    );
  }
  // A ticketed blocked step holds its gate2 only as a blocking item (yellow-lane spec 7, A1); never upgraded silently.
  // Its title is the denied command and this runs before the credential check, so the refusal echoes no field.
  const unflagged = blockedShapeGaps({ kind, title, ticket: given.ticket, blocking: given.blocking });
  if (unflagged.length > 0) throw new DeckRefusal(unflagged.join(', '));
  // A ticket given a `dir` is filed under that worktree's deck, not the poster's (S6).
  // A blank `longer` is no reason, so it counts as absent; a non-string is left for detailOf to refuse.
  const { dir, ...rest } = detailOf(kind, { ...given, longer: typeof longer === 'string' ? longer.trim() || undefined : longer });
  const detail = dir === undefined ? rest : kind === KIND_TICKET ? { ...rest, repo: dir } : { ...rest, dir };
  // A short-path plan says whether it changes a screen (short-path A2): read off the raw argument, since a false flag is not stored.
  if (kind === KIND_GATE1 && isShortPath({ plan: detail }) && given.surface === undefined) {
    throw new DeckRefusal(`a gate1 of ${detail.sliceCount} slices names surface: true or false`);
  }
  refuseCredentials('this item', `${title}\n${body}\n${wordsOf(detail)}`);
  // QA's walkthrough is a look, not a script (walkthrough-taste L3, L5): after the credential
  // check, so a secret is refused as one before a gap could name it. The pilot's wizard is not checked.
  const scripted = kind === KIND_WALKTHROUGH && authorKind(author) === 'qa' ? walkthroughShapeGaps(detail.screens ?? [], body, detail.longer) : [];
  // The body-length gap, alone, is the body's own refusal, not a script's.
  if (scripted.length > 0) throw new DeckRefusal(scripted[0].startsWith('step ') ? `a QA walkthrough is a look, not a script; ${scripted.join('; ')}` : scripted[0]);
  // A closing report is a record and asks the user nothing (ADR 0148, L4); after the credential check, like the walkthrough's.
  if (isRecord({ kind })) refuseAsks([...reportAskGaps(title, [], 'title'), ...reportAskGaps(body, detail.screens)]);

  const item = {
    id: newItemId(),
    kind,
    title,
    body,
    ...detail,
    ...bylineOf(author),
    // Whose replies these are (ADRs 0041, 0053): QA's and the teacher's own posts are theirs, the rest the pilot's (A1).
    owner: waiterKind(author) ?? 'pilot',
    postedAt: new Date().toISOString(),
    replies: [],
    // Posting a ticket makes it red (ticket-states spec 1, L3).
    ...(kind === KIND_TICKET ? { state: 'red' } : {}),
  };

  const deck = readDeck();
  refuseOverOpenQuestions(deck, item);
  const ticket = ticketNamedBy(deck, item);
  if (kind === KIND_GATE1 && ticket) refuseUnmerged(deck.items, ticket);
  const unproven = kind === KIND_GATE2 ? shortGate2Gaps(ticket, item) : [];
  if (unproven.length > 0) throw new DeckRefusal(unproven[0]);
  // Posting a gate2 turns its ticket green, and posting the closing report closes and resolves
  // it, in this same write (ticket-states spec 1, L3, A1); signing the gate2 moves nothing.
  if (kind === KIND_GATE2) {
    enterStage(deck, ticket, 'green');
    // A hand-back like `needTicket`'s, so it releases the ticket's co-pilot in the same write (clear-waits-co-pilot L8).
    releaseIn(deck, ticket.repo, ticket.id);
  }
  if (kind === KIND_REPORT && ticket) {
    // Closing ends its liveness too (L9).
    delete ticket.live;
    ticket.state = 'closed';
    ticket.resolution = `closed by ${item.id}`;
    ticket.resolvedAt = item.postedAt;
  }
  deck.items.push(item);
  touchRuns(deck, item.repo);
  writeDeck(deck);
  return item;
}

/** The states a ticket may be in for each kind that names one (ticket-states spec 2, L6). */
const TICKET_STATES_FOR = {
  [KIND_GATE1]: ['red'],
  [KIND_GATE2]: ['yellow', 'green'],
  [KIND_REPORT]: ['green'],
  // A question names any open ticket, live or parked (spec 17, B4).
  [KIND_QUESTION]: ['red', 'yellow', 'green'],
};

/** The ticket an item names, when its kind names one; an item naming a ticket in another state is refused naming it. */
function ticketNamedBy(deck, item) {
  const states = TICKET_STATES_FOR[item.kind];
  if (!states || item.ticket === undefined) return undefined;
  const wanted = `a ${item.kind}'s ticket is an open ${states.join(' or ')} ticket, and ${item.ticket}`;
  const ticket = deck.items.find((candidate) => candidate.id === item.ticket);
  if (!ticket) throw new DeckRefusal(`${wanted} is on no item here`);
  if (ticket.kind !== KIND_TICKET) throw new DeckRefusal(`${wanted} is not a ticket: it is a ${ticket.kind}`);
  const state = stateOf(ticket);
  if (!states.includes(state)) throw new DeckRefusal(`${wanted} is ${state}`);
  if (item.kind === KIND_QUESTION) {
    // Another directory's ticket would hold back that directory's Sign off (security review, S14).
    if (!sameRepo(ticket.repo, item.repo)) throw new DeckRefusal(`${wanted} is in another directory`);
    return ticket;
  }
  // A gate is posted on the ticket in hand (ticket-states L9): the live one, never a parked one. A gate2 on a
  // yellow ticket is the exception: that ticket is the co-pilot's, never in the main slot (ADR 0087), and the post turns it green.
  const coPilots = item.kind === KIND_GATE2 && state === 'yellow';
  if (item.kind !== KIND_REPORT && !coPilots && ticket.live !== true) {
    throw new DeckRefusal(`a ${item.kind}'s ticket is the live ticket, and ${item.ticket} is not live; deck_ticket take it first`);
  }
  // A report closes a ticket only once its newest gate2 is resolved: a ticket is not done while its Gate 2 is open (slice-estimates L7).
  if (item.kind === KIND_REPORT) {
    const gate2 = deck.items.findLast((other) => other.kind === KIND_GATE2 && other.ticket === ticket.id);
    if (gate2 && isOpen(gate2)) throw new DeckRefusal(`a report closes ${item.ticket} once its gate2 is resolved, and ${gate2.id} is open`);
    // The user's Dismiss closes a gate2 unsigned (merge-first L8): read off its resolution, no stored field.
    if (gate2?.resolution === DISMISSED_BY_USER) {
      throw new DeckRefusal(`a report closes ${item.ticket} once a gate2 is signed, and ${gate2.id} was dismissed unsigned; post a gate2 the user signs`);
    }
    return ticket;
  }
  // One open gate of a kind per ticket: a second is the same card twice.
  const twin = deck.items.find((other) => other.kind === item.kind && other.ticket === ticket.id && isOpen(other));
  if (twin) throw new DeckRefusal(`${item.ticket} already has an open ${item.kind}, ${twin.id}; resolve it before posting another`);
  return ticket;
}

/** What `resolveItem` and `dismissItem` say to a chat (L7): it is answered, never ended. */
const NEVER_CLOSED = 'a chat is never closed; answer it with deck_reply';
/** Only the user closes a thread they opened, with Close on its page (ADR 0109). */
const USER_CLOSES = 'a thread the user opened: the user closes it from its page; answer it with deck_reply';

/** How close together two identical replies are one reply said twice (`addReply`). */
const REPEAT_MS = 10_000;

/**
 * The thread named, or the refusal — with its messages array in place, so a caller may push into it whether or not the deck that held
 * it had one. It is separate from the rule below because reopening is the one write that starts from a *closed* thread, and that is the
 * only line the two do not share.
 */
function threadIn(deck, id) {
  const item = deck.items.find((candidate) => candidate.id === id);
  if (!item) {
    // An archived thread takes nothing and never moves back live (store-durability spec 8, A2).
    const archived = archivedItem(id);
    if (archived) throw new DeckRefusal(`item ${id} is archived (closed ${String(archived.resolvedAt).slice(0, 10)}); post a new thread`);
    throw new DeckRefusal(`no item ${id} on the deck`);
  }
  if (!Array.isArray(item.replies)) item.replies = [];
  return item;
}

/**
 * Read the deck, change the one thread named, write it back. Every message in a thread goes through here, so "a closed thread takes
 * nothing more" is one rule in one place rather than three copies that drift.
 */
function writeToThread(id, change) {
  const deck = readDeck();
  const item = threadIn(deck, id);
  if (!isOpen(item)) {
    throw new DeckRefusal(`item ${id} is closed: ${item.resolution}. Post a new item to reopen the argument.`);
  }

  change(deck, item);
  writeDeck(deck);
  return item;
}

/**
 * Attach the human's reply to an item. Returns the item as it now stands.
 *
 * A thread the pilot closed while the user was typing takes their reply rather than throwing it away: it reopens exactly as the Reopen
 * control does, and the reply then lands in a thread that is open. Found at Gate 2 on 2026-09-22, when a resolution arrived under an
 * open thread page and the words already in the box were refused and lost — "i dont want that to happen again". Refusing the post and
 * re-filling the box was the alternative, and it still costs the user a second send. The two checks above run first, so an empty reply,
 * or one carrying a credential, is still refused and reopens nothing.
 *
 * Reopening is its own write, so a store that fails to write *between* the two leaves the thread open with the reopening in it and the
 * reply not yet said. That is the accepted shape rather than an oversight: folding both into one write would mean a second way into
 * `writeToThread`, whose whole point is that "a closed thread takes nothing more" is one rule in one place. It is also the benign
 * direction to fail in — the thread is open afterwards, so the user pressing the button again gets their words in, which is exactly
 * what the closed thread would not let them do.
 */
export function addReply(id, said) {
  requireText('reply', said);
  refuseCredentials('this reply', said);

  const read = readDeck();
  const thread = threadIn(read, id);
  // Before the repeat check and any reopen (report-record L1, L6): a record takes no reply, whoever sends it.
  if (isRecord(thread)) refuseRecordReply(read.items, thread);
  // Assume the default on a blocking question is the user's answer with its recommended
  // option, anything typed beside it kept, and makes it plain (ticket-states spec 17, S18).
  const pressed = thread.kind === KIND_QUESTION && typeof thread.recommended === 'string' &&
    chosenOf({ options: [ASSUME_DEFAULT], replies: [{ from: 'user', text: said }] }) === ASSUME_DEFAULT;
  const answer = pressed ? thread.recommended + said.slice(ASSUME_DEFAULT.length) : said;
  const assumed = pressed && isBlocking(thread);
  const text = assumed ? answer : said;
  // A double-clicked option arrived twice on 2026-09-25 (independence spec 22.3): the
  // same words as the thread's last message, from the user, inside ten seconds, are
  // that one reply again and are not stored a second time; a second Assume the default
  // finds the question already plain, and its first press's answer last.
  const last = thread.replies.at(-1);
  const choice = chosenOf({ options: thread.options, replies: [{ from: 'user', text }] });
  const signing = choice === SIGN_OFF;
  // Before the repeat check: a double-clicked Sign off on a gate2 is refused, not a second landing,
  // and any press on a landed, landing or queued gate2 is refused, so it cannot withdraw that Sign off (gate-stays-signed spec 3).
  if (choice !== null && thread.kind === KIND_GATE2) refuseLanding(thread);
  if (last?.from === 'user' && (last.text === text || last.text === answer) && Date.now() - Date.parse(last.repliedAt) < REPEAT_MS) {
    return thread;
  }

  if (signing) refuseSignOffBlocked(read.items, thread);

  if (!isOpen(thread)) reopenItem(id);

  return writeToThread(id, (deck, item) => {
    deck.seq = seqOf(deck) + 1;
    const reply = { from: 'user', text, repliedAt: new Date().toISOString(), seq: deck.seq };
    item.replies.push(reply);
    if (assumed) delete item.blocking;
    // The user's answer resumes a ticket it paused, in this same write (blocked-yellow-yields spec 3, A3).
    resumeIn(deck, item);
    if (item.kind !== KIND_HANDOFF || chosenOf(item) !== HANDOFF_FAILED) return;
    // A held press re-arms the `/clear`, co-pilot live or not (held-handoff L3); one the pilot acknowledged did not fail (L8).
    const ack = item.replies.find((message) => message.from === 'pilot');
    if (item.hold && !ack) { item.hold.rearmedAt = reply.repliedAt; return; }
    // A chain hand-off that failed would otherwise lose the ticket it was meant to
    // start (QA F2): `chainNext` took the ticket when it posted this hand-off
    // (`deck/chain.mjs`), so Handoff failed hands it back to Tickets. It takes it live
    // (ticket-states spec 13), so that is put down; a hand-off from before that resolved it.
    // A chain that filled both stage lanes took `also` with it (three-lanes A4), so that is put down too.
    if (typeof item.next === 'string') {
      for (const id of [item.next, ...(item.also ?? [])]) {
        const ticket = deck.items.find((candidate) => candidate.id === id);
        if (ticket) {
          delete ticket.live;
          delete ticket.resolution;
          delete ticket.resolvedAt;
        }
      }
      return;
    }
    if (ack) reply.pickedUpAt = ack.repliedAt;
  });
}

const HOLD_TICKET = /^itm_[0-9a-f]{1,64}$/;

/**
 * `pilot run` held this hand-off's `/clear` for the directory's live co-pilot (held-handoff L2): item state,
 * never a message, so no pick-up reader takes it for one. Written once, the first `at` kept; a closed item or one that is not a hand-off takes none. Answers whether it wrote.
 */
export function markHold(id, ticket) {
  if (typeof ticket !== 'string' || !HOLD_TICKET.test(ticket)) throw new DeckRefusal('a hold names its ticket, an item id');
  const deck = readDeck();
  const item = threadIn(deck, id);
  if (item.kind !== KIND_HANDOFF || !isOpen(item) || item.hold) return false;
  item.hold = { ticket, at: new Date().toISOString() };
  writeDeck(deck);
  return true;
}

/**
 * The pilot's own message in a thread it posted — the push-back that makes an item an argument rather than a form. It carries no
 * sequence number, and that is the mechanism rather than an omission: a sequence number is what wakes a waiting session, and no session
 * may be woken by its own words. A pass does wake one — the new owner, with the user's words it carries. `promise: true` is stored on
 * the message: the thread is owed until the pilot's next reply (yellow-lane A2, `deck/owed.mjs`).
 */
export function addPilotMessage(id, text, author, to, promise) {
  requireText('message', text);
  refuseCredentials('this message', text);
  if (promise !== undefined && promise !== true) throw new DeckRefusal('promise is true or left out');
  if (to !== undefined && !PASS_KINDS.includes(to)) {
    throw new DeckRefusal(`item ${id} cannot pass to ${JSON.stringify(to)}: a thread passes to one of ${PASS_KINDS.join(', ')}`);
  }

  return writeToThread(id, (deck, item) => {
    if (to !== undefined && (item.kind === KIND_CHAT || item.kind === KIND_USER)) {
      throw new DeckRefusal(`item ${id} is a ${item.kind} thread, and one is always the pilot's`);
    }
    const repliedAt = new Date().toISOString();
    // The pilot's Resolving and Land again on a landing conflict are its whoever owns the gate2 (L7).
    const landingWord = to === undefined && landingReply(item, text, writerKind(author), repliedAt);
    if (!landingWord && !mayWrite(item, writerKind(author), to)) throw notTheOwner(item);
    // The pilot's one reply on a record, its worktrees reply, asks nothing either (ADR 0148, A3).
    if (isRecord(item)) refuseAsks(reportAskGaps(text, [], 'reply'));
    // The pilot's findings on its report go into the report itself (gate2-frees-lane spec 4); the user's reply is still refused.
    if (isRecord(item) && writerKind(author) === 'pilot' && text.startsWith('Findings:')) {
      const body = `${item.body}\n\n${text.trim()}`;
      requireText('report', body); // the body stays within what the deck accepts of any one field
      item.body = body;
    }
    touchRuns(deck, item.repo);
    const message = { from: 'pilot', ...bylineOf(author), text, repliedAt, ...(promise && { promise }) };
    // The pass and the message that says it are one write (A3): neither lands alone.
    if (to !== undefined) {
      item.owner = to;
      // A user reply nobody has been handed goes with the thread (spec 5): fresh sequence
      // numbers put it past every cursor, so the new owner's next wait or read hands it
      // over, and the pass names what it carries so the state reads through to it.
      const inFlight = item.replies.filter((reply) => reply.from === 'user' && Number.isInteger(reply.seq) && !reply.deliveredAt);
      for (const reply of inFlight) reply.seq = deck.seq = seqOf(deck) + 1;
      if (inFlight.length) message.carries = inFlight.map((reply) => reply.seq);
    }
    item.replies.push(message);
  });
}

/**
 * A landing that ends short (three-lanes spec 15, L7): refused, or its main PR unknown (`mainLine`'s
 * `main gets pilot: unknown (<why>)`, one-integration-line spec 3). Its line is the pilot's to act on,
 * whoever owns the gate2.
 */
export function isShortLanding({ ok, line }) {
  return !ok || /^main gets pilot: unknown \(.*\)$/m.test(String(line ?? ''));
}

/** A landing's state and its thread line, set on the item in hand. A short landing's line is `from: 'deck'` with a `seq`, which wakes the pilot and never reads as the user (L7). */
function landOn(deck, item, text, landing, short = false) {
  const at = new Date().toISOString();
  item.landing = landing(item.landing, at, item);
  if (!short) item.replies.push({ from: 'pilot', author: 'deck', text, repliedAt: at });
  else item.replies.push({ from: 'deck', author: 'deck', text, repliedAt: at, seq: (deck.seq = seqOf(deck) + 1) });
}

/**
 * A landing's state and the thread line that says it, in one write (gate2-lands L4, ADR 0111).
 * Any other line is pilot-kind with the deck's byline and no `seq`, so it wakes no session. A closed
 * gate2 still takes it: a landing that settles after a Dismiss must not stay running for ever.
 */
function writeLanding(gate2Id, text, landing, short) {
  const deck = readDeck();
  const item = threadIn(deck, gate2Id);
  landOn(deck, item, text, landing, short);
  writeDeck(deck);
  return item;
}

/** A landing started: `running`, and the worktree it runs in on the thread (gate2-frees-lane spec 2). */
export function beginLanding(gate2Id, { worktree }) {
  return writeLanding(gate2Id, `landing started in ${worktree}`, (_, at) => ({ state: 'running', startedAt: at }));
}

/**
 * What the press took live (gate2-frees-lane spec 1): one `from: 'deck'` line with a `seq` on the gate2, naming each
 * ticket `fillLanes` took, which wakes the pilot once, and the lander the press made due (lander spec 5, A1): the
 * pilot spawns `landerDue`'s head, or, with an open hand-off in the directory, it queues for the fresh session's first
 * prompt (`firstPrompt` in `deck/run.mjs`). An empty fill with no lander due writes nothing.
 */
export function noteLaneFilled(gate2Id, taken) {
  const { items } = readDeck();
  const repo = items.find((item) => item.id === gate2Id)?.repo;
  const [lander] = landerDue(items, repo);
  const handingOff = items.some((item) => item.kind === KIND_HANDOFF && isOpen(item) && sameRepo(item.repo, repo));
  const parts = [
    ...(taken.length === 0 ? [] : [`lane freed: ${taken.join(', ')} taken live at the press`]),
    ...(lander === undefined ? [] : [handingOff ? 'lander queued for the next session' : `lander due: spawn pilot-lander ${lander}`]),
  ];
  return parts.length === 0 ? undefined : noteDeck(gate2Id, parts.join(' · '));
}

/** One `from: 'deck'` line with a `seq` on an item: it wakes the pilot once and never reads as the user (L7). */
export function noteDeck(id, text) {
  const deck = readDeck();
  const item = threadIn(deck, id);
  item.replies.push({ from: 'deck', author: 'deck', text, repliedAt: new Date().toISOString(), seq: (deck.seq = seqOf(deck) + 1) });
  writeDeck(deck);
  return item;
}

/** How long a conflict waits for the pilot's `Resolving` before it is the user's (gate2-frees-lane A1). */
export const CONFLICT_TURN_MS = 15 * 60_000;

/** The worktree land's exit 3 kept (spec 5): the dir its line names, stored only when it is an absolute, linked worktree of the gate2's repository, never the checkout itself, because it is handed to an agent as its worktree. */
function conflictOf({ code, line }, gate2) {
  // Land's last line alone (no `m`), and its last lander tail, so neither an earlier line nor a conflicting file's name moves the dir.
  const dir = code === 3 ? LANDER_LINE.exec(String(line ?? ''))?.[1] : undefined;
  return keptWorktree(dir, gate2);
}

/** A settled landing: `landed` with its SHA, or `refused`, with an exit 3's kept worktree; `line` is land's own words, or the deck's refusal. */
const settled = (outcome) => (previous, at, gate2) => {
  const { ok, sha, line } = outcome;
  const dir = ok ? undefined : conflictOf(outcome, gate2);
  return { state: ok ? 'landed' : 'refused', startedAt: previous?.startedAt ?? at, at, ...(ok && sha ? { sha } : {}), ...(dir ? { conflict: { dir, at } } : {}), line };
};

export function settleLanding(gate2Id, outcome) {
  return writeLanding(gate2Id, outcome.line, settled(outcome), isShortLanding(outcome));
}

/** What a landing the last daemon left running reads once this one starts (spec 7, A3). */
export const LANDING_INTERRUPTED = 'landing interrupted: the deck restarted; check origin/pilot';

/**
 * The daemon's start-up sweep (spec 7, A3): a landing still `running` belonged to a daemon that
 * is gone, and its child with it (ADR 0035: a pid is never killed), so each reads interrupted, in
 * one write, before this daemon takes a press. Answers how many it settled.
 */
export function interruptLandings() {
  const deck = readDeck();
  const running = deck.items.filter((item) => item.kind === KIND_GATE2 && item.landing?.state === 'running');
  for (const item of running) landOn(deck, item, LANDING_INTERRUPTED, settled({ ok: false, line: LANDING_INTERRUPTED }), true);
  if (running.length) writeDeck(deck);
  return running.length;
}

/** A press held behind `behindId`'s landing in its repository (gate2-frees-lane spec 7): a settle there starts it. */
export const queueLanding = (gate2Id, behindId) => writeLanding(gate2Id, `landing queued behind ${behindId}`, (_, at) => ({ state: 'queued', pressedAt: at }));

/**
 * A gate2 lands at most once (spec 3, 6): any press is refused, from the stored state, while this gate2 is
 * landed, landing, queued or refused (lander L7: the lander lands a refusal again, not a second press). Another landing in its repository refuses nothing; the press queues (spec 7).
 */
function refuseLanding(gate2) {
  const { landing } = gate2;
  if (landing?.state === 'landed') {
    throw new DeckRefusal(`gate2 ${gate2.id} is landed at ${landing.sha?.slice(0, 7) ?? 'an unknown SHA'}; nothing run`);
  }
  const since = (iso) => new Date(iso).toTimeString().slice(0, 5);
  if (landing?.state === 'running') throw new DeckRefusal(`gate2 ${gate2.id} is landing since ${since(landing.startedAt)}; nothing run`);
  if (landing?.state === 'queued') throw new DeckRefusal(`gate2 ${gate2.id} is queued to land; nothing run`);
  if (landing?.state === 'refused') throw new DeckRefusal(`gate2 ${gate2.id} did not land; the lander lands it again, not a second press; nothing run`);
}

/** Who is writing: the stamped kind, and an unstamped call is the pilot's, as for a wait (A8). */
const writerKind = (author) => (author === undefined ? 'pilot' : authorKind(author));

/** The refusal names the owner, so the agent refused knows where its point goes (spec 4). */
const notTheOwner = (item) =>
  new DeckRefusal(`item ${item.id} is owned by ${ownerOf(item)}; send your point to ${ownerOf(item)}, which says it here`);

/**
 * Only a thread's owner writes on it (ADR 0041), with two ways past: the pilot may pass
 * any thread to take it back (A4), which a pass to the owner it already has is not; and a
 * helper may reply, never pass, on a thread the pilot owns (A5). A short landing's line is the
 * pilot's whoever owns the gate2, so the pilot answers it there without taking the thread (L7).
 */
function mayWrite(item, kind, to) {
  const owner = ownerOf(item);
  if (kind === owner) return true;
  if (to !== undefined) return kind === 'pilot' && to !== owner;
  if (kind === 'pilot' && lastSaid(item)?.from === 'deck') return true;
  return owner === 'pilot' && HELPER_KINDS.includes(kind);
}

/**
 * Close a thread. Only its owner does this (A6), and never as a side effect of the
 * user replying (§3 Thread): the user answering is what starts the argument,
 * not what ends it.
 */
export function resolveItem(id, resolution, author) {
  requireText('resolution', resolution);
  refuseCredentials('this resolution', resolution);

  return writeToThread(id, (deck, item) => {
    if (item.kind === KIND_CHAT) throw new DeckRefusal(`item ${id} is the chat: ${NEVER_CLOSED}`);
    if (item.kind === KIND_USER) throw new DeckRefusal(`item ${id} is ${USER_CLOSES}`);
    if (writerKind(author) !== ownerOf(item)) throw notTheOwner(item);
    // A blocking item is never answered for the user (S18): closing it unanswered would lift its gate2 refusal.
    // The pilot's Moot of a Blocked item is the one close past it (blocked-yellow-yields spec 6, A4).
    if (isBlocking(item) && !messagesOf(item).some((message) => message?.from === 'user') && !isMoot(item, resolution, author)) {
      throw new DeckRefusal(`item ${id} is a blocking ${item.kind} the user has not answered; it waits for their reply${item.kind === KIND_QUESTION ? ` or ${ASSUME_DEFAULT}` : ''}`);
    }
    // Read before the close: a closed thread chooses nothing. Only a Sign off moves a ticket (L11).
    const signed = chosenOf(item) === SIGN_OFF;
    // A gate passes only on its Sign off press (merge-first spec 6, L12): typed approval closes nothing,
    // and the user's Dismiss is a stale gate's exit (L8).
    if (isGate(item.kind) && !signed) {
      throw new DeckRefusal(
        `${item.id} is a ${item.kind} the user has not signed: ask them to press Sign off on it, or to Dismiss it there; typed approval does not pass a gate`,
      );
    }
    // A Sign off pressed before a question was posted still waits for it (QA F1).
    if (signed) refuseSignOffBlocked(deck.items, item);
    touchRuns(deck, item.repo);
    item.resolution = resolution;
    item.resolvedAt = new Date().toISOString();
    if (author !== undefined) item.resolvedBy = authorKind(author);
    // An agent's close the user did not sign leaves them a notice, in this same write (L6, A4).
    // A reopened thread's earlier notice does not outlive this close.
    if (!SILENT_KINDS.includes(item.kind) && !signed) item.notice = true;
    else delete item.notice;
    // A ticket closed outright is no longer live (L9).
    if (item.kind === KIND_TICKET) delete item.live;
    const ticket = item.ticket === undefined ? undefined : deck.items.find((candidate) => candidate.id === item.ticket);
    // Signing a gate1 turns its ticket yellow, in this same write (ticket-states spec 1, L3).
    // and writes its plan by reference (spec 7, L5, L7).
    if (item.kind === KIND_GATE1 && signed && ticket?.kind === KIND_TICKET && stateOf(ticket) === 'red') {
      enterStage(deck, ticket, 'yellow');
      ticket.plan = planOf(item);
      delete ticket.live;
    }
    // The pilot's Moot of the Blocked item that paused a ticket resumes it, in this same write (blocked-yellow-yields spec 11, A3).
    if (isMoot(item, resolution, author)) resumeIn(deck, item);
  });
}

/**
 * The user has seen a closed thread (spec 8, L6): opening it or its × deletes its notice. Only
 * a notice that is there is written away, so a thread GET with none writes nothing.
 */
export function clearNotice(id) {
  const deck = readDeck();
  const item = threadIn(deck, id);
  if (item.notice !== undefined) {
    delete item.notice;
    writeDeck(deck);
  }
}

/**
 * Mark all seen (notifications-seen spec 4, L3): every notice on the deck goes in one write, and
 * a deck with none is not written at all.
 */
export function clearAllNotices() {
  const deck = readDeck();
  const noticed = deck.items.filter((item) => item.notice !== undefined);
  for (const item of noticed) delete item.notice;
  if (noticed.length > 0) writeDeck(deck);
}

/** A record that asks is refused naming each line (ADR 0148, spec 4, 5). */
function refuseAsks(gaps) {
  if (gaps.length > 0) throw new DeckRefusal(`a closing report asks nothing (ADR 0148); ${gaps.join('; ')}`);
}

/** A user's reply on a record is refused naming the repository's chat (ADR 0148, A2); with no chat yet, `/`. */
function refuseRecordReply(items, record) {
  const chat = items.find((item) => item.kind === KIND_CHAT && sameRepo(item.repo, record.repo));
  const where = chat ? `/thread/${chat.id}` : '/';
  throw new DeckRefusal(`a closing report is a record and takes no reply (ADR 0148); say it on the chat: ${where}`);
}

/** Sign off on a gate2 waits on its ticket's open blocking items, the rule its post reads too (yellow-lane L3). */
function refuseSignOffBlocked(items, gate2) {
  const blocking = gate2.kind === KIND_GATE2 && gate2.ticket !== undefined ? gate2Blockers(items, gate2.ticket) : [];
  if (blocking.length > 0) {
    throw gate2Refusal(`gate2 ${gate2.id}`, gate2.ticket, blocking);
  }
}

/** A signed gate1's plan: its references, the slug its artefact sits under (`docs/design/<slug>/`), the slice count, and `surface` when true. */
function planOf({ artefact, branch, sha, sliceCount, surface, id }) {
  return { artefact, branch, sha, slug: artefact.split(/[\\/]/).at(-2), sliceCount, gate1: id, ...(surface ? { surface } : {}) };
}

/**
 * Open a closed thread again — the user's doing and nobody else's (spec 21).
 * The pilot closes a thread and the user may disagree with how; before this
 * their only move was to post a new item, which loses the argument the old one
 * held. There is deliberately no tool for it: the pilot closes, the user
 * reopens, and only `resolveItem` closes it again.
 *
 * The closing words move into the thread as the pilot's own message, stamped
 * with the moment they were said, before the two fields are cleared; a Close's
 * are the user's own `Closed.`, already in the thread, and are not moved. That is
 * what keeps them — the item carries one `resolution` and a second closing
 * would write over the first, so a thread argued twice would lose half its
 * history if the field were left in place instead.
 *
 * The reopening itself is silent (L8, ADR 0049): no user message, no sequence
 * number. Pressing Reopen is the user making room to speak, not speaking, and a
 * stored "Reopened." with a seq woke a parked pilot with nothing to say. The
 * pilot hears about a reopened thread when the user types into it: `addReply`
 * reopens first and its own reply carries the seq that wakes. `REOPENED` stays
 * in `items.mjs` because older stores hold it and `chain.mjs` filters it.
 * `touchRuns` is not called for the same reason `addReply` does not call it —
 * this is the human at the page, not a session working.
 */
export function reopenItem(id) {
  const deck = readDeck();
  const item = threadIn(deck, id);
  if (isOpen(item)) {
    throw new DeckRefusal(`item ${id} is already open; only deck_resolve closes one`);
  }
  // Its words and slice count already live in the ticket it merged into; reopened, they would count twice (QA F2).
  if (item.mergedInto !== undefined) throw new DeckRefusal(`item ${id} is merged into ${item.mergedInto}; reopen that ticket instead`);

  // Pushed again, a Close's words would read as the pilot's (spec 1).
  if (item.resolution !== CLOSED_BY_USER) {
    item.replies.push({
      from: 'pilot',
      ...(item.resolvedBy === undefined ? {} : { author: item.resolvedBy }),
      text: `${CLOSED_WITH} ${item.resolution ?? ''}`.trim(),
      repliedAt: item.resolvedAt,
    });
  }
  delete item.resolution;
  delete item.resolvedAt;
  delete item.resolvedBy;
  // A ticket reopened after its report closed it is green again, the state it closed from (ticket-states spec 1).
  if (item.kind === KIND_TICKET && item.state === 'closed') enterStage(deck, item, 'green');

  writeDeck(deck);
  return item;
}

/**
 * The human at a hand-off item's own page closing it without the pilot (S17,
 * spec 27). A hand-off is posted by a hook and A11 gives it no rendering of
 * its own, so nothing closed one until now — it sat on the home queue and in
 * the status line's waiting count until the pilot happened to read it, which
 * for a kind the pilot never replies to could be never.
 *
 * The resolution is fixed rather than typed, because there is no argument to
 * record: `DISMISSED_BY_USER` is `resolveItem`'s field with a mechanical
 * word for it, and that is the whole of what this does beyond `writeToThread`
 * already refusing a thread that is closed already, the same refusal any
 * other write to one gets.
 *
 * No `touchRuns`, no reply pushed, no `seq` bump — the same absence
 * `reopenItem`'s own comment explains: this is the human at the page, not a
 * session working, and nothing here is an argument for the thread to carry.
 * The undo is the Reopen button spec 21 already gives every closed thread, so
 * there is no confirmation here either.
 *
 * L27 says Dismiss is for a kind the deck does not know, not a way around the
 * pilot's own tools — the button is only ever drawn for one, but the button is
 * not what a POST has to come from, so this refuses a known kind itself
 * rather than trusting the page to have been the only way here. A gate1 or
 * gate2 is the exception (merge-first L8): `deck_resolve` refuses one the user
 * has not signed, so Dismiss is how a stale gate leaves.
 */
export function dismissItem(id) {
  return writeToThread(id, (deck, item) => {
    if (item.kind === KIND_CHAT) throw new DeckRefusal(`item ${id} is the chat: ${NEVER_CLOSED}`);
    // A gate the user has not signed is refused to deck_resolve, so Dismiss is its exit (merge-first L8);
    // it closes the gate unsigned and moves no ticket. A gate2 whose landing settled stays signed (three-lanes A8).
    if (isKnownKind(item.kind) && !isGate(item.kind)) {
      throw new DeckRefusal(
        `item ${id} is a ${item.kind}, a kind the deck already knows how to hand off; only deck_resolve closes it`,
      );
    }
    item.resolution = settledLanding(item.landing) ?? DISMISSED_BY_USER;
    item.resolvedAt = new Date().toISOString();
    // A queued landing goes with its gate2: no later settle starts what the user dismissed (gate2-frees-lane spec 7).
    const line = 'landing dismissed while queued; nothing run';
    if (item.landing?.state === 'queued') landOn(deck, item, line, settled({ ok: false, line }), true);
  });
}

/** A settled landing's word for its gate2 (three-lanes A8): a Dismiss after it unsigns nothing. */
function settledLanding(landing) {
  if (landing?.state === 'landed') return `landed ${landing.sha?.slice(0, 7) ?? 'at an unknown SHA'}`;
  if (landing?.state === 'refused') return 'landing refused';
  return undefined;
}

/**
 * The user closing an open question or user thread from its page (spec 7, L11, L12). The
 * resolution and the user's `CLOSED` line land in one write, and the line
 * carries a sequence number, so a session parked in `deck_wait` is woken by it
 * the way `reopenItem`'s line wakes one. A `signoff` or a `walkthrough` is
 * refused: a gate is passed by the user's explicit word, never by a button that
 * also means "go away". An unknown kind is Dismiss's. The undo is Reopen.
 */
export function closeItem(id) {
  return writeToThread(id, (deck, item) => {
    if (!CLOSABLE_KINDS.includes(item.kind)) {
      throw new DeckRefusal(`item ${id} is a ${item.kind}; only a question or a user thread can be closed from the page`);
    }
    const now = new Date().toISOString();
    deck.seq = seqOf(deck) + 1;
    item.replies.push({ from: 'user', text: CLOSED, repliedAt: now, seq: deck.seq });
    item.resolution = CLOSED_BY_USER;
    item.resolvedAt = now;
  });
}

/** The open ticket named, or the refusal a queue write gives for anything else. */

export { mayWrite };

/**
 * The user's answer resumes a paused ticket (blocked-yellow-yields spec 3; §2, A3), pure on the deck in hand, so it is
 * part of `addReply`'s one write: once the question naming the ticket, the question that paused it, open or closed, and
 * every other open blocking item naming it carry a message from the user (or, for a `Blocked:` item, the pilot's Moot close, spec 11), the ticket turns yellow, loses `paused`, and moves in `deck.items` before its
 * repository's first yellow ticket. Returns the ticket, or undefined when nothing resumed.
 */
export function resumeIn(deck, question) {
  const ticket = question?.kind === KIND_QUESTION && deck.items.find((item) => item?.id === question.ticket && item.kind === KIND_TICKET);
  if (!isPaused(ticket) || !sameRepo(ticket.repo, question.repo)) return undefined;
  const answered = (item) =>
    isAnswered(item) || (!isOpen(item) && isMoot(item, item.resolution, item.resolvedBy));
  const naming = (item) =>
    item === question || item?.id === pausedOn(ticket) || (isBlocking(item) && item.ticket === ticket.id && sameRepo(item.repo, ticket.repo));
  if (deck.items.some((item) => naming(item) && !answered(item))) return undefined;
  enterStage(deck, ticket, 'yellow', 'head');
  delete ticket.paused;
  return ticket;
}
