/**
 * The store's core (audit-f1-f7 S13, ADR 0113): the constants, DeckRefusal, the credential
 * scan, reading and writing deck.json, the validators, and the added-deck and tab helpers.
 * Moved whole from `deck/store.mjs`, which re-exports the public names; the private helpers
 * the other store modules need are exported at the foot. Imported only by store modules (L3).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { atomicWriteFileSync, privateDir } from '../hooks/lib/atomic-write.js';
import { storeDir } from './store-dir.mjs';
import { isDeck, keepBackup, localDay, noteParsed, recoverStore } from './store-recovery.mjs';

import {
  ASSUME_DEFAULT,
  GATED_KINDS,
  KIND_CHAT,
  KIND_GATE1,
  KIND_GATE2,
  KIND_QUESTION,
  KIND_TICKET,
  KIND_USER,
  MAX_OPTIONS,
  authorKind,
  buttonsFor,
  extraFieldsFor,
  gate2Blockers,
  holdsGates,
  isOpen,
  mergeDecisionOf,
  specFor,
  stateOf,
  ticketQueueOf,
} from './items.mjs';
import {
  freshRuns,
  liveRuns,
  repoKey,
  sameRepo,
} from './runs.mjs';
import { tabFor, tabsOf } from './tabs.mjs';
import { andList } from './tools.mjs';

const STORE_FILENAME = 'deck.json';
const STORE_VERSION = 3;

/**
 * The most text the deck will take in one field, wherever it came from. It lives here
 * rather than in the server because the store is the thing both paths share: the HTTP
 * form stops reading at this many bytes, and `deck_post` over MCP is held to the same
 * number. Without it a pilot pasting a whole log file could put a megabyte on the deck
 * that the browser then has to render.
 */
export const MAX_TEXT_BYTES = 64 * 1024;

/**
 * The most replies one `deck_wait` hands back. A pilot that was away while the user
 * answered six threads should hear about all six, but a deck with a hundred replies on
 * it must not arrive in an agent's context in one go.
 */
export const MAX_WAIT_REPLIES = 20;

/**
 * Refusal of something the caller asked for: bad input, or a credential. `status` says
 * which refusal, where a caller tells them apart (Start and End: 403, 400, 404, 409).
 */
export class DeckRefusal extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'DeckRefusal';
    this.status = status;
  }
}

/** The one refusal a gate2's post and its Sign off share (yellow-lane L3): what holds it, and the way past. */
export function gate2Refusal(gate, ticket, blocking) {
  return new DeckRefusal(
    `${gate} waits on ${blocking.length} open blocking item(s) on ticket ${ticket}: ${blocking.join(', ')}; answer them or press ${ASSUME_DEFAULT} first`,
  );
}

/**
 * Shapes that mean "this is a credential, not prose". Each is deliberately anchored
 * so that talking *about* tokens ("the token field is nullable", "secret rotation is
 * slice 9", `process.env.PILOT_API_KEY`) stays postable — a deck that refused every
 * mention of the word would be worked around within a day, which is the failure mode
 * that matters.
 */
const CREDENTIAL_SHAPES = [
  ['a private key block', /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/],
  ['an sk- API key', /\bsk-[A-Za-z0-9_-]{16,}/],
  ['a GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/],
  ['an AWS access key id', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['a Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['a bearer token', /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/],
  [
    'a secret assigned to a name',
    /\b(?:api[_-]?key|secret|token|password|passwd|pwd)\b\s*[:=]\s*["']?[A-Za-z0-9/+_-]{16,}/i,
  ],
];

/** The credential shape `text` matches, or null. */
export function findCredential(text) {
  for (const [what, pattern] of CREDENTIAL_SHAPES) {
    if (pattern.test(text)) return what;
  }
  return null;
}

/** Every string in `value`, however deep it sits in objects and lists. */
const stringsIn = (value) => {
  if (typeof value === 'string') return [value];
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(stringsIn);
  return [];
};

function refuseCredentials(where, text) {
  const found = findCredential(text);
  if (found) {
    throw new DeckRefusal(
      `the deck refuses to store ${where}: it contains what looks like ${found}. ` +
        'Post the name of the credential, never its value.',
    );
  }
}

export { defaultStoreDir, storeDir } from './store-dir.mjs';

export function storeFile() {
  return path.join(storeDir(), STORE_FILENAME);
}

function emptyDeck() {
  return { version: STORE_VERSION, items: [], runs: [], seq: 0, deckSeq: 0, decks: {} };
}

/**
 * The one way the deck says "I will not touch this file": what is wrong with it, and
 * the one thing the human can do about it. Parsing is only half of readable — a file
 * that parses but is not a deck of this version would otherwise be read as an empty
 * deck and then overwritten by the next post, which is the one outcome worth avoiding.
 */
function unreadableStore(file, what) {
  return new Error(
    `deck store ${file} ${what}. ` +
      'It has been left untouched; move it aside to start a fresh deck.',
  );
}

/**
 * A corrupt store, one that does not parse or is not a deck, is recovered from `deck.json.bak` once and read
 * again (store-durability A4); with no readable backup it keeps its refusal. A version this deck does not read
 * is not corrupt and is never recovered (L3). The stat of the bytes parsed is noted for the next write's backup.
 */
function readDeck(recovered = false) {
  const file = storeFile();
  let raw;
  let stat;
  try {
    const fd = fs.openSync(file, 'r');
    try {
      stat = fs.fstatSync(fd);
      raw = fs.readFileSync(fd, 'utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch (err) {
    if (err.code === 'ENOENT') return emptyDeck();
    throw err;
  }

  const corrupt = (what) => {
    if (!recovered && recoverStore(file, what) !== null) return readDeck(true);
    throw unreadableStore(file, what);
  };
  let deck;
  try {
    deck = JSON.parse(raw);
  } catch (err) {
    return corrupt(`is not readable JSON (${err.message})`);
  }

  // Only a newer version keeps the refusal (L3); anything else that is not a deck this reads is corrupt (spec 3).
  if (Number.isInteger(deck?.version) && deck.version > STORE_VERSION) {
    throw unreadableStore(file, `is version ${deck.version}, and this deck reads version ${STORE_VERSION}`);
  }
  if (!isDeck(deck) || ![1, 2, STORE_VERSION].includes(deck.version)) {
    return corrupt(`holds ${raw.slice(0, 80)}, which is not a deck`);
  }
  noteParsed(file, stat);

  if (deck.version !== STORE_VERSION) {
    backUp(file, raw, deck.version);
    writeDeck(upgradeStore(deck));
  }
  deck.items = deck.items.map((item) => notLiveYellow(withoutEstimate(asUserThread(item))));
  // The sub-deck is gone (yellow-agent L10): a run 0.7.19 stored under a `parent` is not this deck's, live or
  // not, so it reads absent and the next write drops it.
  if (Array.isArray(deck.runs)) deck.runs = deck.runs.filter((run) => typeof run?.parent !== 'string');
  // Implementation mode is gone (pilot-branch L8): a stored entry reads absent, and the next write drops it (L7).
  delete deck.mode;
  return deck;
}

/**
 * Red is planning and green is concluding from version 2 (yellow-lane L9, A4, ADR 0147): a version 1
 * deck has each ticket's `green` and `red` swapped, once, and becomes version 2, so every ticket keeps its
 * queue. Version 3 (co-pilot-tickets L6, L13) renames the stored spellings below, keeping every item's
 * id, state, order, body and author (A5). A version 3 deck comes back as it is. One way: an older plugin
 * refuses the newer file.
 */
export function upgradeStore(deck) {
  if (deck.version !== 1 && deck.version !== 2) return deck;
  fromV2Spelling(deck);
  if (deck.version === 1) {
    const swap = { green: 'red', red: 'green' };
    deck.items = deck.items.map((item) => (item?.kind === KIND_TICKET && Object.hasOwn(swap, item.state) ? { ...item, state: swap[item.state] } : item));
  }
  deck.version = STORE_VERSION;
  return deck;
}

/**
 * The v2 spelling to the v3 one, in place (spec 3, L13, a §7 exception by path): the kind and the item
 * field, the live co-pilot per repository and its key, each repository's co-pilot switch record, a
 * switch reply's lane, and each run record's ticket id. A key keeps its place in its object.
 */
function fromV2Spelling(deck) {
  const isMap = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const renamed = (object, from, to) => (isMap(object) && Object.hasOwn(object, from) ? Object.fromEntries(Object.entries(object).map(([key, value]) => [key === from ? to : key, value])) : object);
  const lane = (reply) => (reply?.switch?.lane === 'foreman' ? { ...reply, switch: { ...reply.switch, lane: 'coPilot' } } : reply);
  deck.items = deck.items.map((item) => {
    if (!isMap(item)) return item;
    const next = renamed(item.kind === 'task' ? { ...item, kind: 'ticket' } : item, 'task', 'ticket');
    return Array.isArray(next.replies) ? { ...next, replies: next.replies.map(lane) } : next;
  });
  if (Object.hasOwn(deck, 'foremen')) {
    deck.coPilots = isMap(deck.foremen) ? Object.fromEntries(Object.entries(deck.foremen).map(([key, entry]) => [key, renamed(entry, 'task', 'ticket')])) : deck.foremen;
    delete deck.foremen;
  }
  if (isMap(deck.switches)) deck.switches = Object.fromEntries(Object.entries(deck.switches).map(([key, lanes]) => [key, renamed(lanes, 'foreman', 'coPilot')]));
  if (Array.isArray(deck.records)) deck.records = deck.records.map((entry) => (isMap(entry) ? { ...entry, record: renamed(entry.record, 'task', 'ticket') } : entry));
}

/**
 * Before the first write of a newer version, the old file's bytes go to `deck.v<n>-<YYYY-MM-DD>.json` (the local
 * date) beside it, once (L10). A backup there with the same bytes is this store's, kept; one with other bytes (a
 * truncated copy, another store the same day) is kept too, and the copy goes to `-2`, `-3` and on. The copy is
 * written to a temporary file and linked into place, so a backup is whole or absent and never overwritten. Any
 * failure throws as an unreadable store naming the backup, before the store is written.
 */
function backUp(file, raw, version) {
  const day = localDay();
  const dir = path.dirname(file);
  const tmp = path.join(dir, `deck.v${version}-${day}.${process.pid}.tmp`);
  let backup = path.join(dir, `deck.v${version}-${day}.json`);
  try {
    fs.writeFileSync(tmp, raw, 'utf8');
    for (let n = 2; ; n += 1) {
      try {
        fs.linkSync(tmp, backup);
        return;
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
        if (fs.readFileSync(backup, 'utf8') === raw) return;
      }
      backup = path.join(dir, `deck.v${version}-${day}-${n}.json`);
    }
  } catch (err) {
    throw unreadableStore(file, `could not be backed up to ${backup} before its upgrade (${err.message}), so it was not upgraded`);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/**
 * The main slot is never yellow (ADR 0087): a write that turns a ticket yellow drops its `live`, and a
 * ticket stored before that, yellow and live, reads not live; the next write stores it so. A ticket a
 * 0.7.19 sub-deck held (`holder`, yellow-agent S10) was in that sub-deck's slot, never the main one:
 * it reads without either, queued in its state. A ticket with neither matches nothing: idempotent.
 */
function notLiveYellow(item) {
  if (item?.kind !== KIND_TICKET || !('holder' in item || (item.state === 'yellow' && item.live === true))) return item;
  const { live, holder, ...rest } = item;
  return rest;
}

/**
 * A thread Create made before 2026-09-28 was stored as a chat with `created: true`;
 * it reads as a user thread, and the next write stores it so. Nothing else about it
 * changes, replies included, and a user thread carries no `created`, so a second
 * read matches nothing: the migration is idempotent and needs no version bump.
 */
function asUserThread(item) {
  if (item?.kind !== KIND_CHAT || item.created !== true) return item;
  const { created, ...rest } = item;
  return { ...rest, kind: KIND_USER };
}

/**
 * A ticket posted before slice-estimates carried `estimate`, in minutes, and a signed one carried
 * one in its plan too; it reads without either, and the next write stores it so (L11). Nothing is
 * converted: the ticket shows no size until a slice count is given. A ticket without them matches
 * nothing, so the migration is idempotent.
 */
function withoutEstimate(item) {
  if (item?.kind !== KIND_TICKET) return item;
  const planned = item.plan !== null && typeof item.plan === 'object' && 'estimate' in item.plan;
  if (!('estimate' in item) && !planned) return item;
  const { estimate, ...rest } = item;
  if (planned) {
    const { estimate: _, ...plan } = item.plan;
    rest.plan = plan;
  }
  return rest;
}

function writeDeck(deck) {
  const file = storeFile();
  const dir = path.dirname(file);
  privateDir(dir, {
    onKept: (err) => console.error(`[deck] store dir ${dir} keeps the mode its owner set: ${err.message}`),
  });
  // A backup that cannot be taken never blocks the write: `.bak` keeps the older store it held, which parsed.
  try {
    keepBackup(file);
  } catch (err) {
    console.error(`[deck] deck store ${file} is written without a fresh backup: ${err.message}`);
  }
  atomicWriteFileSync(file, `${JSON.stringify(deck, null, 2)}\n`);
}

/**
 * How far the deck has counted. A deck written by slice 1 has no counter and no
 * sequence numbers on its replies, and must not be called unreadable for it: every
 * reply on it is "already seen", which is the right answer for a session starting now.
 */
function seqOf(deck) {
  return Number.isInteger(deck.seq) ? deck.seq : 0;
}

/** The runs on a deck, tolerating one written before runs existed. */
function runsOf(deck) {
  return Array.isArray(deck.runs) ? deck.runs : [];
}

/** The numbers a deck has handed out, tolerating one written before it handed any. */
function decksOf(deck) {
  const decks = deck.decks;
  return decks !== null && typeof decks === 'object' && !Array.isArray(decks) ? decks : {};
}

/**
 * The number this working directory is known by, minted if it has none (L2, ADR 0023).
 *
 * A number goes out once and the count only goes up, so a directory the user
 * dismissed cannot have its number handed to the next one that appears — which is the
 * single property the whole `D4` notation rests on. Nothing but that matters here, so
 * the floor to mint above is read off *both* the counter and the numbers already in
 * the map, and neither field can be trusted alone: this is a plain JSON file the
 * unreadable-store message invites a human to move aside and look at, and a counter
 * reset while the map survives would otherwise give D1 to a second directory. A map
 * lost while the counter survives is the other half, and costs only the stability —
 * which is the recoverable half.
 *
 * The caller holds the deck it read and writes it afterwards, so minting is part of
 * that one write rather than a second one, exactly as `touchRuns` is.
 */
function mintDeckNumber(deck, repo) {
  const decks = decksOf(deck);
  const key = repoKey(repo);
  const known = decks[key];
  if (Number.isInteger(known) && known > 0) return known;

  const highest = Object.values(decks).reduce(
    (most, number) => (Number.isInteger(number) && number > most ? number : most),
    Number.isInteger(deck.deckSeq) ? deck.deckSeq : 0,
  );
  const minted = highest + 1;
  deck.deckSeq = minted;
  deck.decks = { ...decks, [key]: minted };
  return minted;
}

/**
 * Every deck's number, keyed as `repoKey` keys a directory — what a page reads to
 * draw `D4` on a tab, in one read rather than one per tab.
 */
export function listDeckNumbers() {
  return { ...decksOf(readDeck()) };
}

function requireRepoPath(repo, doing) {
  if (typeof repo !== 'string' || repo.trim() === '') {
    throw new DeckRefusal(`repo must be the path of the directory ${doing}`);
  }
}

/**
 * Mark the runs in this repository as still working, which is what expiry
 * measures (D12): registering is one, and so is every write a session makes —
 * an item, a status table, a push-back in a thread, a resolution. What is not
 * one is the user's own reply: that is the human at the page, and a run that has
 * said nothing for two days has said nothing for two days however much the human
 * typed at it.
 *
 * Being seen is the repository's, as D12 says. Being *un-dismissed* is not: the
 * user took one run off the page, and only that run speaking puts it back (D13).
 * The two part company as soon as two sessions share a repository, which they
 * do — they are two runs and one tab (D3 of run-tabs) — because then one of them
 * writing would otherwise undo a dismissal the user aimed at the other, within
 * minutes and without the dismissed session having said anything.
 *
 * So `runId` is who wrote, when the deck knows: `deck_status` names its run. An
 * item, a push-back and a resolution carry a repository and no run id, on purpose
 * (D3 of run-tabs — an item belongs to a repository), so they revive a dismissed run only
 * when there is one record in that repository they could have come from. Where
 * the deck cannot tell, the user's click stands.
 *
 * Nothing else about the record is touched, and nothing is ever removed from the
 * file by any of this (L14). The caller holds the deck it read and writes it
 * afterwards, so a touch is part of that one write rather than a second one
 * behind it.
 */
function touchRuns(deck, repo, runId = null) {
  if (typeof repo !== 'string' || repo.trim() === '') return;
  const at = new Date().toISOString();
  const theirs = runsOf(deck).filter((run) => sameRepo(run.repo, repo));
  for (const run of theirs) {
    run.lastSeenAt = at;
    const wroteIt = runId === null ? theirs.length === 1 : run.id === runId;
    if (wroteIt) delete run.dismissedAt;
  }
}

function requireText(field, value, mostChars) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DeckRefusal(`${field} must be a non-empty string`);
  }
  if (Buffer.byteLength(value, 'utf8') > MAX_TEXT_BYTES) {
    throw new DeckRefusal(
      `that ${field} is longer than the deck accepts (${MAX_TEXT_BYTES} bytes). ` +
        'Post a summary and a path, not the whole file.',
    );
  }
  // A field the status table has to render in one cell is held to the table's
  // own bound as well, so a slice name that table would refuse cannot reach the
  // deck through an item and then sit there joining on nothing.
  if (mostChars !== undefined && value.trim().length > mostChars) {
    throw new DeckRefusal(
      `that ${field} is longer than a cell of the deck's table (${mostChars} characters). ` +
        'Name the slice the way your status table names it.',
    );
  }
  return value;
}

function requireList(field, value, most) {
  if (!Array.isArray(value)) throw new DeckRefusal(`${field} must be a list of strings`);
  if (value.length === 0) throw new DeckRefusal(`${field} must not be an empty list`);
  if (value.length > most) throw new DeckRefusal(`the deck shows at most ${most} ${field}`);
  return value.map((entry, index) => requireText(`${field}[${index}]`, entry));
}

/**
 * A kind is checked for being a name first and for being a thread type second
 * (ADR 0051), so the list's refusal never echoes a paragraph back. The bound is
 * what keeps a kind a label: it is rendered on the page and slice 4 groups by
 * it, and a kind carrying a paragraph would be a body put in the wrong field.
 */
const KIND_SHAPE = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;

/**
 * The fields this kind carries, validated. Anything the kind has no use for is
 * refused rather than dropped: a pilot that attaches screens to a question has
 * made a mistake, and a deck that silently stored them would render nothing and
 * say nothing, which is the one outcome that teaches the pilot nothing.
 */
function detailOf(kind, given) {
  const spec = specFor(kind);
  const takes = extraFieldsFor(kind);
  const detail = {};
  const buttons = buttonsFor(kind);
  if (buttons && given.options !== undefined) {
    const article = /^[aeiou]/.test(kind) ? 'an' : 'a';
    throw new DeckRefusal(`${article} ${kind}'s buttons are the deck's: ${buttons.join(' / ')}; post it without options`);
  }

  // The gate tag is retired: a gate is its own kind (thread-kinds spec 10, 12, L5, L6).
  if (given.gate !== undefined) {
    const named = given.gate === '1' || given.gate === '2' ? `gate${given.gate}` : 'gate1 or gate2';
    throw new DeckRefusal(`${/^[aeiou]/.test(kind) ? 'an' : 'a'} ${kind} carries no gate; post the gate as kind ${named}, with its evidence fields`);
  }

  for (const [name, value] of Object.entries(given)) {
    if (value === undefined) continue;
    if (!takes.includes(name)) {
      throw new DeckRefusal(
        `a ${kind} item takes no ${name}. It takes ${takes.length ? takes.join(', ') : 'only a title and a body'}.`,
      );
    }
  }

  // After the unknown names, so a typo such as `artifact` for `artefact` is named as one.
  const missing = spec.fields.filter((field) => field.required && given[field.name] === undefined).map((field) => field.name);
  if (missing.length > 0) throw new DeckRefusal(`a ${kind} needs ${andList(missing)}`);

  // A kind with deck buttons gets them as its options here (L2), so reply, `chosenOf`,
  // `pilot wait` and the Stop hook read them as they read any options; the chain's
  // handoff, which bypasses `deck_post`, gets them by the same path.
  if (buttons) detail.options = [...buttons];
  else if (spec.options && given.options !== undefined) {
    detail.options = requireList('options', given.options, MAX_OPTIONS);
  }
  if (given.recommended !== undefined) {
    requireText('recommended', given.recommended);
    if (!detail.options?.includes(given.recommended)) {
      throw new DeckRefusal('recommended must be one of the options this item offers');
    }
    detail.recommended = given.recommended;
  }
  // Checked here, not left to the schema or a prose rule: only `true` exempts a question from every gate (yellow-lane L4).
  if (given.proposal === true && (given.ticket !== undefined || given.blocking !== undefined)) {
    throw new DeckRefusal('a proposal names no ticket and takes no blocking; post it with neither');
  }
  for (const field of spec.fields) {
    const value = given[field.name];
    if (value === undefined) continue;
    if (field.count) {
      if (!Number.isSafeInteger(value) || value < 0) throw new DeckRefusal(`a ${kind}'s ${field.name} is a whole number of 0 or more`);
      detail[field.name] = value;
      continue;
    }
    if (field.flag) {
      // Stored only when true: false is the default, and an item without it reads the same (S18).
      if (typeof value !== 'boolean') throw new DeckRefusal(`a ${kind}'s ${field.name} is true or false`);
      if (value) detail[field.name] = true;
      continue;
    }
    detail[field.name] = field.list
      ? requireList(field.name, value, field.list)
      : requireText(field.name, value, field.most);
    if (field.shape) {
      // Stored as matched, and not echoed: the refusal runs before the credential check.
      if (!field.shape.test(value.trim())) throw new DeckRefusal(`a ${kind}'s ${field.name} must be ${field.means}`);
      detail[field.name] = value.trim();
    }
    if (field.only && !field.only.includes(value)) {
      throw new DeckRefusal(`a ${kind}'s ${field.name} is ${field.only.join(' or ')} or left out, not ${JSON.stringify(value)}`);
    }
  }
  if (detail.blocking && kind === KIND_QUESTION && (detail.recommended === undefined || detail.ticket === undefined)) {
    throw new DeckRefusal(`a blocking question needs ticket, the one it blocks, and recommended, which ${ASSUME_DEFAULT} answers with`);
  }
  if (detail.blocking && detail.ticket === undefined) throw new DeckRefusal(`a blocking ${kind} needs ticket, the one it blocks`);

  return detail;
}

/** Every string an item carries, which is what the credential check reads. */
const wordsOf = (detail) => Object.values(detail).flat().join('\n');

/**
 * Who wrote a message, as the kind `authorKind` names (spec 1; L3). Nothing at
 * all for a caller the hook did not stamp — a hook posting over HTTP, a test —
 * so that message reads `pilot` exactly as one stored before authors did (L4).
 */
const bylineOf = (author) => (author === undefined ? {} : { author: authorKind(author) });

/**
 * A sign-off and a gate wait for open questions (spec 11 of run-record,
 * L22, ADR 0029). Here, in the one place every writer's post goes through, so
 * it holds for a session without the plugin's hooks, a subagent and a hand
 * `curl` alike; the refusal names what to answer first. Only a question holds
 * one back: a walkthrough, a hand-off or another sign-off is not an open decision.
 */
function refuseOverOpenQuestions(deck, { kind, repo, ticket }) {
  if (!GATED_KINDS.includes(kind)) return;
  // A gate2 waits only for its own ticket's open blocking items, the rule its press reads too (yellow-lane L3).
  if (kind === KIND_GATE2) {
    const blocking = gate2Blockers(deck.items, ticket);
    if (blocking.length === 0) return;
    throw gate2Refusal('a gate2', ticket, blocking);
  }
  const open = deck.items
    .filter((item) => holdsGates(item) && sameRepo(item.repo, repo))
    // Another ticket's question never holds a gate1 (ticket-states spec 17); one naming no ticket still does.
    .filter((item) => kind !== KIND_GATE1 || item.ticket === undefined || item.ticket === ticket)
    .map((item) => item.id);
  if (open.length === 0) return;
  throw new DeckRefusal(
    `a ${kind} waits for ${kind === KIND_GATE1 ? "its ticket's and every unticketed" : 'every'} open question in its directory; ` +
      `answer and deck_resolve ${open.length === 1 ? 'this open question' : `these ${open.length} open questions`} ` +
      `first: ${open.join(', ')}`,
  );
}

/**
 * The merge step cannot be skipped silently (merge-first spec 5, L13): a gate1 waits while its
 * ticket's repository holds another open red ticket and no resolved architect item names its ticket.
 * Derived on read (L5), so there is no `merged` field to forget to write.
 */
function refuseUnmerged(items, ticket) {
  const queue = ticketQueueOf(items, ticket.repo).filter((item) => item !== ticket);
  if (queue.length === 0 || mergeDecisionOf(items, ticket.id)) return;
  throw new DeckRefusal(
    `the architect's merge step has not run for ${ticket.id}: no resolved merge thread names it ` +
      `(red queue: ${queue.map((item) => item.id).join(', ')}); resume the architect for its Merge first step; ` +
      'never deck_ticket merge it yourself',
  );
}


const newItemId = () => `itm_${crypto.randomBytes(6).toString('hex')}`;

/**
 * The repository's chat, made in the registration's own write when its `repoKey` has
 * none (L5, ADR 0031). Here, and not on a GET or a first message, so the panel's form
 * always has an item id to post to `/reply` and one chat per repository holds for
 * every writer, `postItem` refusing the kind for the rest.
 */
function addChat(deck, repo) {
  if (deck.items.some((item) => item.kind === KIND_CHAT && sameRepo(item.repo, repo))) return;
  deck.items.push({
    id: newItemId(),
    kind: KIND_CHAT,
    title: 'Chat',
    body: 'Say anything to the pilot of this repository. It answers here.',
    repo,
    postedAt: new Date().toISOString(),
    replies: [],
  });
}

/**
 * Remove an old deck's tab by hand (independence spec 18, A7). Nothing is
 * deleted: every open non-chat item of this repository is archived — what
 * `isQueued` answers for the strip's own open count, and its standing tickets and
 * reports besides (run-chaining L6), so no stale ticket chains later — and its
 * runs are dismissed, exactly as `dismissRun` marks one. Between them the tab
 * has nothing open and nothing live, which is the rule `tabsOf` already drops
 * an ended tab by (`deck/tabs.mjs`), so no third place has to learn what
 * "removed" means. `/items` and every thread still lists everything, because
 * an item is never the one thing this deck throws away (L14). The D-number
 * stays in the map and is never reused (ADR 0023): a repository that
 * registers again picks its old number back up.
 *
 * Refused while a live session is registered here (A7): the tab a live pilot
 * is writing to must not vanish out from under it. This is the one check
 * that makes the refusal real — a page that merely hid the control on a live
 * tab and trusted the click never to arrive would not be one.
 */
export function removeDeck(repo) {
  requireRepoPath(repo, 'whose tab you are removing');
  const deck = readDeck();

  if (liveRuns(runsOf(deck)).some((run) => sameRepo(run.repo, repo))) {
    throw new DeckRefusal('a live session is registered here: its tab cannot be removed while it is running');
  }

  const now = new Date().toISOString();
  for (const item of deck.items) {
    // A chat is never closed; every other open item goes, standing kinds and user threads included.
    if (sameRepo(item.repo, repo) && isOpen(item) && item.kind !== KIND_CHAT) {
      item.resolution = 'archived with its deck';
      item.resolvedAt = now;
      // A closed ticket is no longer live (ticket-states L9), so a reopen cannot revive a second one.
      delete item.live;
    }
  }
  for (const run of runsOf(deck)) {
    if (sameRepo(run.repo, repo)) run.dismissedAt = now;
  }
  // An added directory's tab is its entry (L3), so Close drops it and the tab goes.
  deck.added = addedOf(deck).filter((entry) => !sameRepo(entry.repo, repo));

  writeDeck(deck);
}

/** The directories added by path, tolerating a store written before any was (L3). */
function addedOf(deck) {
  return Array.isArray(deck.added) ? deck.added.filter((entry) => typeof entry?.repo === 'string') : [];
}

/** Every directory the user added by path, oldest first: what `tabsOf` reads beside runs and items. */
export function listAdded() {
  return addedOf(readDeck());
}

/** The tab `repo` names among those the store alone draws, in any spelling of it, or null. */
export function storedTabFor(repo, deck = readDeck()) {
  return tabFor(tabsOf(freshRuns(runsOf(deck)), deck.items, {}, {}, addedOf(deck), {}), repo);
}

/**
 * Add a directory as a deck by its path, from the strip's + (deck-polish spec 5, L3,
 * L4, ADR 0048). Checked here, on the server, because the page is not a trust
 * boundary: the path must be absolute, carry no credential, and be a directory by
 * `fs.stat`; it is stored as `fs.realpath` spells it, so a junction or a second
 * spelling of a directory already on the strip is that tab. The deck stores the path
 * and nothing more: it never reads, lists or runs anything inside it.
 *
 * Numbered and given its chat in the one write, exactly as `registerRun` does, so a
 * later run there picks up the same number and the same chat. A directory that is
 * already a tab writes nothing and comes back with `created: false`.
 */
export function addDeck(given) {
  if (typeof given !== 'string' || given.trim() === '') {
    throw new DeckRefusal('path must be the absolute path of a directory');
  }
  refuseCredentials('this path', given);
  if (!path.isAbsolute(given)) throw new DeckRefusal(`${given} is not an absolute path`);
  // Never stat'd: a UNC path makes the OS open an SMB connection, which can send
  // NTLM credentials to that host and stalls the daemon while it answers.
  if (/^[\\/]{2}/.test(given)) throw new DeckRefusal(`${given} is a network path; add a local directory`);
  let repo;
  try {
    if (!fs.statSync(given).isDirectory()) throw new DeckRefusal(`${given} is not a directory`);
    repo = fs.realpathSync.native(given);
  } catch (err) {
    if (err instanceof DeckRefusal) throw err;
    const missing = err.code === 'ENOENT' || err.code === 'ENOTDIR';
    throw new DeckRefusal(missing ? `${given} does not exist` : `${given} could not be checked (${err.code})`);
  }

  const deck = readDeck();
  if (storedTabFor(repo, deck)) return { repo, created: false };

  mintDeckNumber(deck, repo);
  addChat(deck, repo);
  deck.added = [...addedOf(deck), { repo, addedAt: new Date().toISOString() }];
  writeDeck(deck);
  return { repo, created: true };
}

/** `deck.coPilots[repoKey]` (clear-waits-co-pilot L3), `{ ticket, live, at }`, or null for none or a malformed entry. */
function storedCoPilot(deck, dir) {
  const entry = deck.coPilots?.[repoKey(dir)];
  return typeof entry?.ticket === 'string' && typeof entry.at === 'string' ? entry : null;
}

/** Release `dir`'s live co-pilot if it names `ticketId` (any, when none), stamping `at` for the wrapper's turn wait (L5). */
function releaseIn(deck, dir, ticketId) {
  const entry = storedCoPilot(deck, dir);
  if (!entry || entry.live !== true || (ticketId !== undefined && entry.ticket !== ticketId)) return false;
  deck.coPilots[repoKey(dir)] = { ticket: entry.ticket, live: false, at: new Date().toISOString() };
  return true;
}

/** `coPilotFor`'s rule on one stored entry: it says live, and its ticket is still open and yellow. */
function isLiveCoPilot(deck, entry) {
  const ticket = deck.items.find((item) => item.id === entry.ticket && item.kind === KIND_TICKET);
  return entry.live === true && Boolean(ticket) && isOpen(ticket) && stateOf(ticket) === 'yellow';
}

const isMap = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** The switch map and `repo`'s lanes in it, as stored (L21): a malformed map or entry reads as none. */
function switchesOf(deck, repo) {
  const switches = isMap(deck.switches) ? deck.switches : {};
  const lanes = isMap(switches[repoKey(repo)]) ? switches[repoKey(repo)] : {};
  return { switches, lanes };
}

/** The private helpers the other store modules share. */
export {
  KIND_SHAPE,
  addChat,
  bylineOf,
  decksOf,
  detailOf,
  isLiveCoPilot,
  isMap,
  mintDeckNumber,
  newItemId,
  readDeck,
  refuseCredentials,
  refuseOverOpenQuestions,
  refuseUnmerged,
  releaseIn,
  requireRepoPath,
  requireText,
  runsOf,
  seqOf,
  storedCoPilot,
  stringsIn,
  switchesOf,
  touchRuns,
  wordsOf,
  writeDeck,
};
