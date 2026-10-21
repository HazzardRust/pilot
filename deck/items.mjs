/**
 * What an item is, kind by kind: which extra fields it carries, what its reply
 * box asks for, whether it is still open, and whether it is the user's next
 * action. This module is the deck's item vocabulary and nothing else — it reads
 * no file, opens no socket and emits no HTML, so both the store (which decides
 * what may be written down) and the renderer (which decides what a browser
 * sees) can depend on it without depending on each other.
 *
 * A stored kind is an open string (A11); a posted one is one of `POSTABLE_KINDS`
 * (thread-types-phase L1, L3, ADR 0051). So an unrecognised kind already stored is
 * still a perfectly good item: it carries a title and a body, it renders
 * generically, and `appearsInYours` says no — `Yours` is the user's next action
 * for a slice, and an item the pilot posted to itself is not one.
 *
 * The three kinds that are known differ only in what the pilot may attach and
 * what the deck asks the user back for. That is deliberately a small,
 * data-shaped difference: a table of specs, read by the store for validation
 * and by `ui/render.mjs` for layout, rather than a branch in each of them.
 */

import { pathKey as repoKey } from '../hooks/lib/platform.js';

import {
  DISMISSED_BY_USER, REPORT_DUE, SIGN_OFF, NOT_YET, SHA_FIELD, URL_FIELD, LOGIN_FIELD, SCREENS_FIELD, SLICE_FIELD, REPO_FIELD, NEXT_FIELD, DIR_FIELD, WORKDIR_FIELD,
} from './items-bounds.mjs';

export {
  MAX_OPTIONS, MAX_SCREENS, SIGN_OFF, TEACH_ME, ASSUME_DEFAULT, CLOSED_WITH, REOPENED,
  DISMISSED_BY_USER, CLOSED_BY_USER, CLOSED, NOT_YET, stepParts, MAX_SLICE_CHARS,
} from './items-bounds.mjs';

export const KIND_QUESTION = 'question';
export const KIND_WALKTHROUGH = 'walkthrough';
export const KIND_SIGNOFF = 'signoff';

/**
 * The two human gates as kinds of their own (thread-kinds L5, ADR 0057): the pilot's
 * Gate 1 and Gate 2 threads, their evidence carried as fields the store checks by name.
 * A `signoff` stays for every sign-off that is not a gate.
 */
export const KIND_GATE1 = 'gate1';
export const KIND_GATE2 = 'gate2';

/** Whether a kind is one of the two human gates (`hooks/lib/deck.js` keeps its CommonJS copy). */
export const isGate = (kind) => kind === KIND_GATE1 || kind === KIND_GATE2;

/**
 * A repository's chat (spec 4-7 of deferred-ledger, L4, ADR 0031): one per
 * `repoKey`, made by the daemon at registration, never ended and never waiting.
 * A known kind, so no Dismiss is drawn or accepted for it, and deliberately not
 * in `POSTABLE_KINDS`, which is what `deck_post` advertises and accepts.
 */
export const KIND_CHAT = 'chat';

/**
 * A thread the user opened with Create (the user's decision of 2026-09-28: "shouldnt
 * be a persistent chat. should just be user generated"). The pilot's, like the chat,
 * but closable by the pilot or the user, and queued while open below everything that
 * waits on the user's answer. Not in `KINDS`: only Create makes one.
 */
export const KIND_USER = 'user';

/**
 * Run chaining (L2-L4): a ticket is agreed work stored for a later run, its title
 * its name and its body its spec; a hand-off is what a pilot leaves for the
 * session after it. The daemon posts a *chain* hand-off, one carrying `next`,
 * when a run finishes cleanly with a ticket open (`deck/chain.mjs`). A ticket is in
 * `KINDS` (S3); a hand-off is known but not in `KINDS` (thread-types-phase L4).
 */
export const KIND_TICKET = 'ticket';

/** A ticket's state (ticket-states spec 1, L3, L8): stored on the ticket, written only by the store's transitions in `postItem` and `resolveItem`, in the same write as the event. */
export const TICKET_STATES = Object.freeze(['red', 'yellow', 'green', 'closed']);

/** A ticket's state. A resolved ticket is closed whatever it stores, so one resolved by hand never reads live; one stored before states existed reads red while open (L12). */
export function stateOf(ticket) {
  if (!isOpen(ticket)) return 'closed';
  return TICKET_STATES.includes(ticket?.state) ? ticket.state : 'red';
}

export const KIND_HANDOFF = 'handoff';
/** A crew agent's handoff, posted by `hooks/context-size-guard.js` (L17 there): never the pilot's `handoff`. */
export const KIND_CREW_HANDOFF = 'crew-handoff';

/** The one button a handoff of either kind carries (thread-types-phase spec 3). */
export const HANDOFF_FAILED = 'Handoff failed';

/** A run's closing report (spec 6, L6): shaped as a walkthrough, and its own kind so it can stand open. */
export const KIND_REPORT = 'report';

/**
 * An audit report (housekeeping-audit L12, L16): a known kind so it waits in
 * Yours with `none` beside the typed pick and no Dismiss. Not a question, which
 * would hold back a spec, and not standing, because it waits for the pick.
 */
export const KIND_AUDIT = 'audit';

/**
 * A teaching (ADR 0053): the thread a `Teach me` press has the teacher post, owned by the
 * teacher and closed by it. A question's options come with it as a trial, so a press here is
 * taught on and decides nothing. Not in `KINDS`.
 */
export const KIND_LESSON = 'lesson';

/** The kinds the deck renders specially; `POSTABLE_KINDS` below adds the lesson and the handoffs. */
export const KINDS = [
  KIND_QUESTION, KIND_WALKTHROUGH, KIND_SIGNOFF, KIND_REPORT, KIND_TICKET, KIND_AUDIT, KIND_GATE1, KIND_GATE2,
];

/**
 * The thread types (thread-types-phase L1, ADR 0051): the only kinds `deck_post`
 * accepts. `KINDS` plus the lesson and both handoffs, which are known but kept
 * out of `KINDS` (L4). A posting rule, not a storage rule (L3):
 * an item stored under any other kind still reads and renders.
 */
export const POSTABLE_KINDS = [...KINDS, KIND_LESSON, KIND_HANDOFF, KIND_CREW_HANDOFF];

/**
 * The standing kinds (L6): open, but never waiting on the user, never in Yours,
 * and never holding a turn at the Stop gate. The daemon's
 * one spelling; `hooks/lib/deck.js` is the hooks', and `join.test.js` pins both.
 */
export const STANDING_KINDS = [KIND_TICKET, KIND_REPORT];

export function isStanding(item) {
  return STANDING_KINDS.includes(item?.kind);
}

/**
 * The record kinds (report-record L2, ADR 0148): a record takes no reply from the user, so
 * `addReply` refuses one, its page draws no reply box and no pilot is handed a reply stored on
 * one. Only the closing report; a ticket still takes the comments ticket-making's Add acts on.
 */
export const RECORD_KINDS = [KIND_REPORT];

export function isRecord(item) {
  return RECORD_KINDS.includes(item?.kind);
}

/**
 * The kinds an agent closes without leaving the user a notice (deck-press-feedback spec 7, A3,
 * ADR 0097): a hand-off of either kind is plumbing, and a report has its own tab already.
 */
export const SILENT_KINDS = Object.freeze([KIND_HANDOFF, KIND_CREW_HANDOFF, KIND_REPORT]);

/** The closed threads still carrying a notice (L6), newest close first. */
export function noticesOf(items) {
  return items
    .filter((item) => item?.notice === true && !isOpen(item))
    .sort((a, b) => (Date.parse(b.resolvedAt) || 0) - (Date.parse(a.resolvedAt) || 0));
}

/**
 * The kinds that wait for every open question in their directory (L22): a verdict
 * agreed over an unanswered question is agreed to less than it says.
 */
export const GATED_KINDS = [KIND_SIGNOFF, KIND_GATE1, KIND_GATE2];

/**
 * What the deck asks for in return, which is the other half of what makes a
 * kind a kind. The walkthrough's is the one the user's brief named: dot points,
 * one per screen, typed as they go.
 */
const ANSWER_PROMPT = {
  label: 'Your answer',
  placeholder: 'Pick one above, or say what none of them covers.',
  rows: 3,
};

const VERDICT_PROMPT = {
  label: 'Your verdict',
  placeholder: 'Satisfied, or what is still wrong.',
  rows: 3,
};

const PROMPTS = {
  [KIND_QUESTION]: ANSWER_PROMPT,
  [KIND_SIGNOFF]: VERDICT_PROMPT,
  [KIND_GATE1]: VERDICT_PROMPT,
  [KIND_GATE2]: VERDICT_PROMPT,
  [KIND_WALKTHROUGH]: {
    label: 'What you saw — one dot point per step',
    placeholder: '- step 1 worked\n- step 2 did nothing\n- step 3 showed the wrong output',
    rows: 6,
  },
  [KIND_LESSON]: {
    label: 'Your answer',
    placeholder: 'Answer the teacher, or press an option to try it.',
    rows: 3,
  },
  [KIND_AUDIT]: {
    label: 'Your pick',
    placeholder: 'The ids to post as tickets, for example F1, F3.',
    rows: 2,
  },
};

const GENERIC_PROMPT = {
  label: 'Your reply',
  placeholder: 'Whatever you want the pilot to know.',
  rows: 3,
};

const WALKTHROUGH_FIELDS = [SLICE_FIELD, REPO_FIELD, WORKDIR_FIELD, URL_FIELD, LOGIN_FIELD, SCREENS_FIELD];

/**
 * A gate's evidence (thread-kinds spec 11, L5): `required` is refused by name when it is
 * left out; `count` is a whole number of zero or more, not a string; `shape` is what a
 * string must match, and `means` names it in the refusal. A gate2's `walkthrough` is
 * optional (L19): walkthroughs are not mandatory.
 */
/** The ticket a gate, a question, a walkthrough or a closing report is about, by id (ticket-states spec 2, 17, L6); the store checks a gate's, a question's and a report's. */
const TICKET_ID_FIELD = { name: 'ticket', shape: /^itm_[0-9a-f]+$/, means: 'an item id' };
const GATE1_FIELDS = [
  { name: 'artefact', required: true },
  SHA_FIELD,
  { name: 'locked', required: true, count: true },
  { name: 'slices', required: true },
  // The plan's design branch and its slice count (L7); `slices` stays the table.
  { name: 'sliceCount', required: true, count: true },
  { name: 'branch', required: true },
  // Whether the plan changes a screen (short-path A2): named on a gate1 of `SHORT_PATH_MAX` slices or fewer.
  { name: 'surface', flag: true },
  // The ticket it plans: an open red ticket.
  { ...TICKET_ID_FIELD, required: true },
];
const GATE2_FIELDS = [
  { name: 'pr', required: true, shape: /^(#\d+|https?:\/\/\S+)$/, means: 'a PR url or #n' },
  SHA_FIELD,
  { name: 'walkthrough', shape: /^itm_[0-9a-f]+$/, means: 'an item id' },
  // The ticket it concludes: a green one after its walkthrough sign-off (overview-one-ticket L18); the post still turns a yellow one green.
  { ...TICKET_ID_FIELD, required: true },
];

/** The shape of each known kind. An unknown kind gets `GENERIC_SPEC`. */
const SPECS = {
  // `blocking` refuses its ticket's gate2 post until answered (ticket-states spec 17, L22).
  // `proposal`: a ticket-making proposal, which holds no gate (yellow-lane spec 6, L4); refused beside ticket or blocking.
  [KIND_QUESTION]: { options: true, fields: [SLICE_FIELD, REPO_FIELD, TICKET_ID_FIELD, { name: 'blocking', flag: true }, { name: 'proposal', flag: true }] },
  [KIND_LESSON]: { options: true, fields: [SLICE_FIELD, REPO_FIELD] },
  // Sign-off and audit take the deck's buttons, not the agent's options (A6, L2).
  // A gate is its own kind now; a `gate` field on any kind is refused naming it (thread-kinds spec 10, 12).
  [KIND_SIGNOFF]: { options: false, fields: [SLICE_FIELD, REPO_FIELD], buttons: [SIGN_OFF, NOT_YET] },
  // A gate's note says what its Sign off means (spec 2).
  [KIND_GATE1]: {
    options: false,
    fields: [SLICE_FIELD, REPO_FIELD, ...GATE1_FIELDS],
    buttons: [SIGN_OFF, NOT_YET],
    note: 'Gate 1: Sign off approves the design and its slices, and the crew builds with you away. Not yet keeps it open.',
  },
  [KIND_GATE2]: {
    options: false,
    fields: [SLICE_FIELD, REPO_FIELD, ...GATE2_FIELDS],
    buttons: [SIGN_OFF, NOT_YET],
    note: 'Gate 2: Sign off says the feature works as you walked it, and the run closes. Anything still wrong: say so in a reply and it stays open.',
  },
  // `longer`: one line on why a QA body needs more than its cap (short-by-default L3, overridden on itm_03d153719048).
  // `blocking` holds its ticket's gate2 until it closes (yellow-lane spec 4, L3).
  [KIND_WALKTHROUGH]: { options: false, fields: [...WALKTHROUGH_FIELDS, TICKET_ID_FIELD, { name: 'longer' }, { name: 'blocking', flag: true }] },
  // A report naming its green ticket is the closing report, and closes it (spec 1, A1).
  [KIND_REPORT]: { options: false, fields: [...WALKTHROUGH_FIELDS, TICKET_ID_FIELD] },
  // Its size in slices, the count a gate1 carries (slice-estimates L13); a merge sums it (L5).
  [KIND_TICKET]: { options: false, fields: [SLICE_FIELD, REPO_FIELD, DIR_FIELD, { name: 'sliceCount', required: true, count: true }] },
  [KIND_AUDIT]: { options: false, fields: [SLICE_FIELD, REPO_FIELD], buttons: ['none'] },
  // Here so the chat is a known kind; nothing posts one, so its fields are the store's own.
  [KIND_CHAT]: { options: false, fields: [REPO_FIELD] },
  // Known for the same reason: no Dismiss, and a card in Yours while open. Only Create makes one.
  [KIND_USER]: { options: false, fields: [REPO_FIELD] },
  // Both handoffs carry the deck's own button, stored as options at post (L2), and a note.
  [KIND_HANDOFF]: {
    options: false,
    // `also`: the other stage lane's ticket the same chain took (three-lanes A4), put down with `next` on Handoff failed.
    fields: [SLICE_FIELD, REPO_FIELD, NEXT_FIELD, { name: 'also', list: 1 }],
    buttons: [HANDOFF_FAILED],
    note: 'A fresh session picks this up. If it never did, press Handoff failed.',
    ask: 'Treat the session this went to as lost, and brief a fresh one from this hand-off?',
  },
  [KIND_CREW_HANDOFF]: {
    options: false,
    fields: [SLICE_FIELD, REPO_FIELD],
    buttons: [HANDOFF_FAILED],
    note: "The pilot closes this when the agent's own handoff arrives. Handoff failed has it brief a fresh agent from the agent's branch.",
    ask: 'Treat this agent as lost, and brief a fresh one from its branch?',
  },
};

const GENERIC_SPEC = { options: false, fields: [SLICE_FIELD, REPO_FIELD] };

/**
 * Whether the deck has a rendering of its own for this kind. Exported for the
 * renderer (S17): a kind it does not know is the one whose thread page offers
 * Dismiss, because the deck has no rendering to hand off through and the reply
 * box is the only thing on the page for it.
 */
export function isKnownKind(kind) {
  return Object.hasOwn(SPECS, kind);
}

/** What this kind may carry. Never throws and never returns undefined: a kind nobody has taught the deck about is a title and a body, which every item has. */
export function specFor(kind) {
  return isKnownKind(kind) ? SPECS[kind] : GENERIC_SPEC;
}

/** The deck's own options for a kind, stored at post (L2), or null: the agent's own, or none. */
export function buttonsFor(kind) {
  return specFor(kind).buttons ?? null;
}

/** The sentence a kind's Handoff failed confirms in place with (handoff-failed-confirm L3), or null; a held `item`'s re-arms (held-handoff L3). */
export function askFor(kind, item) {
  return isHeld(item) ? "Stop waiting for the co-pilot, and type /clear at this session's next turn end?" : specFor(kind).ask ?? null;
}

/**
 * The one line of the deck's own words drawn on a kind's card and page, never stored. A
 * handoff's names Handoff failed, so one stored before it had that button draws none; a
 * question posted while the user was away says what the pilot went with.
 */
export function noteFor(item) {
  if (item?.kind === KIND_QUESTION && item.away && item.recommended) {
    return `Posted while you were away: the pilot went with ${item.recommended}. Reply to revise.`;
  }
  // `pilot run` holds the `/clear` for a live co-pilot (held-handoff spec 1, L2): the card says so, not "picks this up".
  // Handoff failed re-arms it (spec 3, L3), and the card says that until the pick-up ends the hold.
  if (isHeld(item)) return item.hold.rearmedAt ? 're-armed: /clear at the next turn end' : `held: /clear waits on ${item.hold.ticket}'s co-pilot`;
  const { note, buttons } = specFor(item?.kind);
  if (!note) return null;
  return buttons?.includes(HANDOFF_FAILED) && !item.options?.includes(HANDOFF_FAILED) ? null : note;
}

/**
 * The names of everything a kind takes beyond its title and body. A kind with deck
 * buttons takes neither `options`, which are the deck's, nor `recommended`.
 */
export function extraFieldsFor(kind) {
  const spec = specFor(kind);
  const choices = spec.options ? ['options', 'recommended'] : [];
  return [...choices, ...spec.fields.map((field) => field.name)];
}

/** What the reply box on this kind's thread says and how big it is. */
export function replyPrompt(kind) {
  return PROMPTS[kind] ?? GENERIC_PROMPT;
}

/**
 * Who may be named as a message's author (spec 1; L3, ADR 0027): the crew, and
 * `other` for everything else. `pilot` first, because it is also what a message
 * with no author reads as (L4).
 */
export const AUTHOR_KINDS = [
  'pilot', 'architect', 'implementer', 'fundamentalist', 'qa', 'teacher', 'explorer', 'auditor', 'lander', 'other',
];

/**
 * The kind of agent a raw `agent_type` names, as `hooks/deck-author.js` stamped
 * it. The harness spells a plugin agent `pilot:pilot-qa`, so `pilot:` and then
 * `pilot-` come off. `""` is a main session with no `--agent` and `pilot:pilot`
 * one started with it (L16); both are the pilot. Anything else — the harness's
 * own `Explore`, a reviewer — is `other`. Never read from what a message says.
 * It only ever returns a member of `AUTHOR_KINDS`: `renderByline` writes the
 * result into a class and a byline unescaped on that promise.
 */
export function authorKind(type) {
  if (typeof type !== 'string') return 'other';
  const name = type.replace(/^pilot:/, '').replace(/^pilot-/, '');
  if (name === '') return 'pilot';
  return AUTHOR_KINDS.includes(name) ? name : 'other';
}

/**
 * The kinds a thread can belong to (ADR 0041, A1; ADR 0053; ADR 0058; ADR 0063): the five that wait
 * on the deck. A user reply is handed to its thread's owner kind and to no other.
 */
export const OWNER_KINDS = Object.freeze(['pilot', 'qa', 'teacher', 'auditor', 'architect']);

/** The kinds a thread may be passed to (A3): a teacher, an auditor or an architect owns only what it posts itself. */
export const PASS_KINDS = Object.freeze(['pilot', 'qa']);

/**
 * How long a user reply waits on its owner kind before the pilot takes the thread,
 * and only once that kind has also been quiet for the roster's live window: an
 * unclaimed reply 30 s after it arrived (L6), a reply picked up and not answered on
 * its thread 5 min after the pick-up (L7). No environment override of either.
 */
export const OWNER_PICK_UP_MS = 30 * 1000;
export const OWNER_ANSWER_MS = 5 * 60 * 1000;

/** The pilot's helpers (A5): they may reply on a thread the pilot owns, and on no other. */
export const HELPER_KINDS = Object.freeze(['teacher', 'explorer']);

const asOwner = (kind) => (OWNER_KINDS.includes(kind) ? kind : null);

/**
 * The owner kind a `deck_wait` or `deck_read` is asked as. No author at all is
 * the pilot (A8: the inbox and Stop hooks call over HTTP unstamped); a stamped
 * kind that owns nothing is null, never quietly the pilot.
 */
export function waiterKind(author) {
  return author === undefined ? 'pilot' : asOwner(authorKind(author));
}

/** A message a wait or a read hands `to` (three-lanes L7): the user's, and a short landing's `deck` line to the pilot alone. */
export const handsTo = (reply, to) => reply?.from === 'user' || (reply?.from === 'deck' && to === 'pilot');

/**
 * Whose thread this is. A chat and a user thread are the pilot's whoever
 * wrote in them, and so is a ticket whoever posted it: the chain and `deck_resolve`
 * close tickets as the pilot (ADR 0058), and a gate1 whoever posted it: its press is the
 * pilot's Gate 1 (architect-runs-red L4). Otherwise the stored `owner`, else the
 * author kind of an item stored before owners existed (A2), else the pilot.
 */
export function ownerOf(item) {
  if ([KIND_CHAT, KIND_USER, KIND_TICKET, KIND_GATE1].includes(item?.kind)) return 'pilot';
  return asOwner(item?.owner) ?? asOwner(item?.author) ?? 'pilot';
}

/**
 * The live ticket's merge decision (merge-first §4, L5): the newest resolved item the architect
 * posted naming `ticketId`. Derived on read, so nothing stores it and nothing can forget to.
 */
export function mergeDecisionOf(items, ticketId) {
  return items.findLast((item) => item?.author === 'architect' && item.ticket === ticketId && !isOpen(item));
}

/**
 * The thread: the messages under an item, oldest first. An item written before
 * threads existed has none, and that is not a corrupt item.
 */
export function messagesOf(item) {
  return Array.isArray(item?.replies) ? item.replies : [];
}

/** A thread's last message, or, when that is a pass carrying replies, the newest reply it carried. */
export function lastSaid(item) {
  const messages = messagesOf(item);
  const last = messages.at(-1);
  const carried = Array.isArray(last?.carries) ? messages.filter((message) => last.carries.includes(message.seq)) : [];
  return carried.at(-1) ?? last;
}

/**
 * When the thread last heard anything: `lastSaid`'s time, else the posting's
 * (L13), or its closing when that came later (J4) — a close stores no message
 * of its own.
 */
export function lastSaidAt(item) {
  const said = lastSaid(item)?.repliedAt ?? item?.postedAt;
  const closed = item?.resolvedAt;
  return closed && (Date.parse(closed) || 0) > (Date.parse(said) || 0) ? closed : said;
}

/** Newest message first (L13), by time and not by spelling; an unreadable stamp sorts last. */
export const newestSaidFirst = (a, b) => (Date.parse(lastSaidAt(b)) || 0) - (Date.parse(lastSaidAt(a)) || 0);

/** What `replyFrom` puts between a pressed option and what was typed beside it. */
export const NOTE_SEPARATOR = '\n\n';

/**
 * The option the user's newest reply chose (L2): read back from the reply, never
 * stored. `replyFrom` sends a press as the option alone, or the option, a blank
 * line and what was typed beside it. A typed reply after the press, and a closed
 * thread, choose nothing — except on a gate, whose choice is its newest press
 * (gate-stays-signed spec 1, 2, A1): typed text after a Sign off leaves it
 * signed, and only a later Not yet withdraws it.
 */
export function chosenOf(item) {
  if (!isOpen(item) || !Array.isArray(item?.options)) return null;
  const pressOf = (text) =>
    typeof text === 'string' ? item.options.find((option) => text === option || text.startsWith(option + NOTE_SEPARATOR)) ?? null : null;
  const users = messagesOf(item).filter((message) => message?.from === 'user');
  if (!isGate(item.kind)) return pressOf(users.at(-1)?.text);
  return users.map((message) => pressOf(message.text)).findLast((option) => option !== null) ?? null;
}

/**
 * How many times the pilot has written on this thread: the item itself, and
 * every message it has added since. One, for a thread nobody has replied to.
 *
 * This is the number a browser keeps its "seen" mark against (spec 26, amended
 * by the user at Gate 2, 2026-09-23): a notification is back the moment this
 * goes up, and a reply of the user's own never moves it, because a thread the
 * user has just written on is not news to them.
 *
 * It counts the pilot's messages rather than reading a sequence number off the
 * last one, because a pilot message deliberately carries none — "a sequence
 * number is what wakes a waiting session, and no session may be woken by its
 * own words" (`store.mjs`, `addPilotMessage`). A count of them is the one value
 * that moves when, and only when, the pilot says something.
 */
export function pilotWrites(item) {
  return 1 + messagesOf(item).filter((message) => message?.from === 'pilot').length;
}

/** An item the pilot has not closed. Only the pilot closes one (§3 Thread). */
export function isOpen(item) {
  return !item?.resolvedAt;
}

/** How long a hand-off may sit with no word from the pilot before it reads `unacknowledged` (thread-kinds spec 19, L7, A8): read off the clock and the thread, never stored or swept. */
export const HANDOFF_ACK_MS = 3 * 60 * 1000;

// A hand-off whose `/clear` `pilot run` holds for a live co-pilot (held-handoff L2), until the pick-up (the pilot's first word).
function isHeld(item) {
  if (item?.kind !== KIND_HANDOFF || !isOpen(item) || typeof item.hold?.ticket !== 'string') return false;
  return !messagesOf(item).some((message) => message?.from === 'pilot');
}

/**
 * A hand-off nobody has picked up (spec 19, 21): open, kind `handoff`, nothing from the
 * pilot on it, and `HANDOFF_ACK_MS` past its posting. A chain
 * hand-off the lane resolved is closed, so it never reads this way.
 */
export function isUnacknowledged(item, now = Date.now()) {
  if (item?.kind !== KIND_HANDOFF || !isOpen(item) || isHeld(item)) return false;
  if (messagesOf(item).some((message) => message?.from === 'pilot')) return false;
  const posted = timeOf(item.postedAt);
  return !Number.isNaN(posted) && now - posted >= HANDOFF_ACK_MS;
}

/**
 * Waiting on the user (L6): open, not a chat and not a standing kind. The chat is always open, so
 * reading "open" as "waiting" would count one item per repository and keep
 * every ended run's tab alive. The daemon's one spelling of it.
 *
 * A user thread (Create) is queued for as long as it is open, whoever spoke last
 * (2026-09-28); `queueOf` sorts it below everything that waits on an answer.
 */
export function isQueued(item) {
  if (!isOpen(item) || isStanding(item)) return false;
  return item?.kind !== KIND_CHAT;
}

/** The kinds the user may close from the thread page (spec 7; a user thread since 2026-09-28). */
export const CLOSABLE_KINDS = [KIND_QUESTION, KIND_USER];

/**
 * Whether two paths name one repository: the daemon's one spelling, and
 * `hooks/lib/deck.js` is the hooks' (L13, L35). `hooks/test/join.test.js` proves they agree.
 */
export function sameRepo(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  return repoKey(left) === repoKey(right);
}

/** A hand-off the daemon posted to start a ticket, as against a pilot's own stash. */
export const isChainHandoff = (item, repo) => item?.kind === KIND_HANDOFF && typeof item.next === 'string' && sameRepo(item.repo, repo);

/**
 * The live ticket in this directory (ticket-states spec 4, L4, L9; ADR 0060): the open ticket marked
 * `live: true` by `takeTicket`, of `state` when given (three-lanes spec 1, L2). One per stage, which
 * `takeTicket` holds; with no state, the first live. A closed ticket is never live, whatever it carries.
 */
export function liveTicketOf(items, dir, state) {
  return items.find(
    (item) =>
      item?.kind === KIND_TICKET && item.live === true && isOpen(item) && sameRepo(item.repo, dir) && (state === undefined || stateOf(item) === state) &&
      !isLanding(item, items),
  );
}

const SHORT_PATH_MAX = 2; // the most slices a short-path ticket's signed plan may have (short-path L2)
/** A short-path ticket (short-path L2, A3): its signed plan is `SHORT_PATH_MAX` slices or fewer; read from the plan alone, never stored. */
export function isShortPath(ticket) {
  return Number.isInteger(ticket?.plan?.sliceCount) && ticket.plan.sliceCount <= SHORT_PATH_MAX;
}

/**
 * A landing ticket (gate2-frees-lane spec 1, L1): open, green, and its newest gate2 holds the user's Sign off, read
 * from the stored press and never stored itself. Nothing un-presses (§4): a later Not yet or the gate2's close leaves
 * it landing, since the press already filled its lane; a Dismiss before any landing, or a pivot to yellow, ends it.
 * Held by no lane, whatever its stored `live`.
 */
export function isLanding(ticket, items) {
  if (ticket?.kind !== KIND_TICKET || !isOpen(ticket) || stateOf(ticket) !== 'green') return false;
  const gate2 = items.findLast((item) => item?.kind === KIND_GATE2 && item.ticket === ticket.id);
  if (!gate2 || gate2.resolution === DISMISSED_BY_USER) return false;
  return messagesOf(gate2).some((message) => message?.from === 'user' && chosenOf({ options: gate2.options, replies: [message] }) === SIGN_OFF);
}

/**
 * The phase of this directory (ticket-states spec 4, L4, L8; ADR 0060, amending 0057): its live
 * ticket's state, read from items alone, or null with no live ticket, so the tab draws no colour.
 */
export function livePhaseOf(items, repo) {
  const live = liveTicketOf(items, repo);
  return live ? stateOf(live) : null;
}

const timeOf = (stamp) => (typeof stamp === 'string' ? Date.parse(stamp) : NaN);

/**
 * A repository's ticket queue of one state: its open tickets in that state, in deck order, the head
 * first (ticket-making L2, L3; ticket-states spec 3). The one spelling the store's moves, the tab and
 * the chain share; `queueOf` is the overview's. Red by default: the chain takes the red head.
 */
export function ticketQueueOf(items, repo, state = 'red') {
  return items.filter((item) => item?.kind === KIND_TICKET && isOpen(item) && sameRepo(item.repo, repo) && stateOf(item) === state);
}

/**
 * A ticket the deck paused (blocked-yellow-yields spec 1, L1): open, green, with the question it yielded on. `yieldTicket`
 * writes `paused` and `resumeIn` and `pivotTicket` delete it; every read of it goes through this or `pausedOn`.
 */
export function isPaused(ticket) {
  return ticket?.kind === KIND_TICKET && isOpen(ticket) && stateOf(ticket) === 'green' && typeof ticket.paused?.question === 'string';
}

/** The question a paused ticket yielded on, or undefined. */
export const pausedOn = (ticket) => (isPaused(ticket) ? ticket.paused.question : undefined);

/** What a paused ticket waits on now (blocked-yellow-yields spec 3): its first unanswered blocking item, else the question it paused on. */
export const waitingOn = (ticket, items) => unansweredBlockers(items, ticket.id)[0] ?? pausedOn(ticket);

/**
 * The next ticket (ticket-states spec 13, L19): the one the chain takes live and the tab marks
 * `next`, so the two never disagree; never the live ticket (spec 18), never a landing one (gate2-frees-lane L1), and never a yellow one, which is
 * the co-pilot's (overview-one-ticket L20, yellow-agent L10). Each stage's own queue (three-lanes spec 2): the
 * first ticket of `state` named by an open question, else that stage's head.
 */
export function nextTicketOf(items, repo, state) {
  const asked = new Set(items.filter((item) => item?.kind === KIND_QUESTION && isOpen(item)).map((item) => item.ticket));
  const first = (pick = () => true) =>
    items.find((item) => item?.kind === KIND_TICKET && isOpen(item) && item.live !== true && sameRepo(item.repo, repo) && stateOf(item) === state && !isPaused(item) && !isLanding(item, items) && pick(item));
  return first((ticket) => asked.has(ticket.id)) ?? first();
}

/**
 * The ticket in hand (overview-one-ticket L2; ADR 0065): the live ticket, else the next one, of `state`'s
 * lane (three-lanes spec 4). The one answer the overview, the `next` marker and the chain share.
 */
export function inHandOf(items, repo, state) {
  return liveTicketOf(items, repo, state) ?? nextTicketOf(items, repo, state);
}

/** The stage each lane holds (three-lanes L2, L3; ADR 0147): red is planning, green concluding, yellow the co-pilot's. */
export const LANE_STATES = { planning: ['red'], concluding: ['green'], coPilot: ['yellow'] };

/** The lane a ticket state is held in (three-lanes L3): `LANE_STATES` read backwards; undefined for a closed state. */
export const laneOfState = (state) => Object.keys(LANE_STATES).find((lane) => LANE_STATES[lane].includes(state));

/**
 * A lane's switch record (L19, L21); a malformed one, or one naming a ticket no longer open in the lane, reads as none.
 * A stored `main` record reads as the lane of its `to` (three-lanes L4), its `from` either stage; `main` asks for either lane.
 */
export function switchOf(items, repo, switching, lane) {
  if (lane === 'main') return switchOf(items, repo, switching, 'planning') ?? switchOf(items, repo, switching, 'concluding');
  const inStates = (id, states) =>
    items.some((item) => item?.kind === KIND_TICKET && item.id === id && isOpen(item) && sameRepo(item.repo, repo) && states.includes(stateOf(item)));
  const sound = (record, fromStates) =>
    record !== null && typeof record === 'object' && typeof record.at === 'string' && inStates(record.to, LANE_STATES[lane]) && (record.from === null || inStates(record.from, fromStates))
      ? record
      : undefined;
  return sound(switching?.[lane], LANE_STATES[lane]) ?? (lane === 'coPilot' ? undefined : sound(switching?.main, ['red', 'green']));
}

/** The co-pilot lane's state (spec 16, L22; ADR 0106), never stored: `coPilotTicket` (`deckLanes`' entry) building, a yellow head waiting, or none. */
export function coPilotStateOf(items, repo, coPilotTicket, switching) {
  if (switchOf(items, repo, switching, 'coPilot')) return 'switching';
  const yellow = ticketQueueOf(items, repo, 'yellow');
  if (yellow.some((ticket) => ticket.id === coPilotTicket)) return 'held';
  return yellow.length ? 'queued' : 'empty';
}

/**
 * Whether a thread waits behind the ticket in hand (overview-one-ticket L3, L16): it names an open
 * ticket of its repository that is not in the main deck's hand. Read at render time, never stored;
 * an unticketed thread, or one naming a closed ticket, is never behind. A blocking question is no
 * exception (spec 24, L19): it hides and shows with its ticket. A yellow ticket's thread is never
 * behind either (yellow-agent spec 4, amending L20): the main deck never holds a yellow ticket, and
 * what its co-pilot passes up is the user's to answer while it builds.
 */
export function isBehind(item, items) {
  if (!item?.ticket) return false;
  const ticket = items.find((each) => each?.kind === KIND_TICKET && each.id === item.ticket);
  if (!ticket || !isOpen(ticket) || stateOf(ticket) === 'yellow' || isPaused(ticket)) return false;
  // Behind only its own stage's hand (three-lanes spec 4): a planning ticket never hides a concluding one's threads.
  return inHandOf(items, ticket.repo, stateOf(ticket))?.id !== ticket.id;
}

/**
 * The ticket a thread wears (ticket-state-accents L6): the ticket it names, or that ticket's host when it
 * was merged, one hop. A ticket wears itself. Undefined for a thread naming no ticket the deck holds.
 */
export function ticketWornBy(item, items) {
  if (item?.kind === KIND_TICKET) return item;
  const named = (id) => items.find((each) => each?.kind === KIND_TICKET && each.id === id);
  const ticket = item?.ticket ? named(item.ticket) : undefined;
  return ticket?.mergedInto === undefined ? ticket : named(ticket.mergedInto);
}

/**
 * A card's and a thread page's accent (ticket-state-accents spec 3, L4, A3), read per draw and
 * never stored: `plain` when the thread or its ticket is closed, `blue` for an open thread naming
 * no ticket, else its ticket's state.
 */
export function accentOf(item, items) {
  if (!isOpen(item)) return 'plain';
  const ticket = ticketWornBy(item, items);
  if (!ticket) return 'blue';
  const state = stateOf(ticket);
  return state === 'closed' ? 'plain' : state;
}

/**
 * Where a ticket stands (ticket-state-accents spec 8): `closed`, `co-pilot` when it is the ticket this
 * repository's live co-pilot builds, `landing` once its gate2 is pressed (gate2-frees-lane spec 1), `in hand` on the main slot (live or next, L21), else `parked`.
 */
export function standingOf(ticket, items, coPilotTicket) {
  if (!isOpen(ticket)) return 'closed';
  if (ticket.id === coPilotTicket) return 'co-pilot';
  if (isPaused(ticket)) return 'paused';
  if (isLanding(ticket, items)) return 'landing';
  // In hand on its own stage's lane (three-lanes spec 4); a yellow ticket off the co-pilot is never in hand.
  const state = stateOf(ticket);
  return state !== 'yellow' && inHandOf(items, ticket.repo, state)?.id === ticket.id ? 'in hand' : 'parked';
}

/** The open questions that name this ticket (ticket-states spec 17, L22): its green-phase grilling. */
export function openQuestionsOf(items, ticketId) {
  return items.filter((item) => item?.kind === KIND_QUESTION && isOpen(item) && item.ticket === ticketId);
}

/** An open question that holds a signoff or a gate1: any but a proposal (yellow-lane spec 6, L4). */
export function holdsGates(item) {
  return item?.kind === KIND_QUESTION && isOpen(item) && item.proposal !== true;
}

/** An open question or walkthrough marked blocking (yellow-lane spec 4, L3): the only items that hold a gate2. */
export function isBlocking(item) {
  return (item?.kind === KIND_QUESTION || item?.kind === KIND_WALKTHROUGH) && isOpen(item) && item.blocking === true;
}

/** The question the old ready step asked, in its two titles only: nothing is marked ready now (one-integration-line A1). */
const isLegacyReady = (item) => item.kind === KIND_QUESTION && /^Mark (?:#\d+|the feature PR) ready$/.test(String(item.title ?? ''));

/** The one gate2 rule, read by its post, its Sign-off press and its close alike (yellow-lane spec 5, L3): the ids of the ticket's open blocking items, a legacy ready question aside. */
export function gate2Blockers(items, ticketId) {
  return items.filter((item) => isBlocking(item) && item.ticket === ticketId && !isLegacyReady(item)).map((item) => item.id);
}

/** A message from the user on `item`: the answer the yield, the resume and the co-pilot lane read alike (blocked-yellow-yields A1). */
export const isAnswered = (item) => messagesOf(item).some((message) => message?.from === 'user');

/** The ids of `ticketId`'s open blocking items no user message answers yet (blocked-yellow-yields spec 2, 3): what still holds it. */
export function unansweredBlockers(items, ticketId) {
  return items.filter((item) => isBlocking(item) && item.ticket === ticketId && !isAnswered(item)).map((item) => item.id);
}

/**
 * The key two paths share exactly when they are one repository; a deck's number is stored against it (L2).
 * It is `pathKey` (mac-linux L3), so a key stored before S3 through a symlink is not migrated and stops matching.
 * Here and not in `runs.mjs`: status -> runs -> tools -> status is a cycle that reads `MAX_STATE_CHARS` in its TDZ.
 */
export { repoKey };

/**
 * Whether this item is the user's next action — what slice 4's `Yours` column
 * is rendered from. An item of a kind the deck does not know is never one
 * (A11), and neither is a thread that has been closed nor a chat, which is
 * open but never waiting (L6).
 */
export function appearsInYours(item) {
  return isKnownKind(item?.kind) && isQueued(item);
}

/**
 * The five states of a thread, worded as the spec words them (line 4, A7). They
 * are *derived*: no agent types one, nothing is stored on the item to hold one,
 * and the clock is consulted only for a hand-off's `unacknowledged` (spec 19) —
 * otherwise two facts the thread already carries decide it,
 * the last message in it and whether the hand-off of that message was recorded
 * (D4). So a state cannot drift from the thread it describes, and a deck nobody
 * has touched for a week still reads correctly.
 *
 * The last message is what the state is read off, because it is the only one
 * that can still be waiting on anybody: an older reply that was handed over
 * says nothing about the answer typed after it. A thread whose newest message
 * is an agent's reads "the pilot replied", or "qa replied" when QA wrote it (the teacher alike),
 * whether or not the user had answered first — an agent has said something they
 * have not acted on, which is what the bar is for. A pass that carried the user's
 * unread replies (spec 5) is read through to the newest of them, since that reply
 * now waits on the new owner.
 */
export function threadState(item, now = Date.now()) {
  if (!isOpen(item)) return 'resolved';
  if (isHeld(item)) return 'held';
  if (isUnacknowledged(item, now)) return 'unacknowledged';
  // A user's word on a record is never picked up (report-record spec 3), so the state reads past it.
  const last = lastSaid(isRecord(item) ? { replies: messagesOf(item).filter((message) => message.from !== 'user') } : item);
  if (last === undefined) return 'posted';
  if (last.from === 'deck') return item.kind === KIND_QUESTION ? 'paused' : last.text === REPORT_DUE ? 'awaiting findings' : 'landing ended short'; // the pilot's to answer (three-lanes L7)
  if (last.from !== 'user') return asOwner(last.author) && last.author !== 'pilot' ? `${last.author} replied` : 'the pilot replied';
  // A Handoff failed carrying `pickedUpAt` was picked up (L8, QA 3), whatever the press's own delivery.
  if (!last.deliveredAt && !last.pickedUpAt) return 'not picked up yet';
  const holder = ownerOf(item);
  return holder === 'pilot' ? 'the pilot has it' : `${holder} has it`;
}
