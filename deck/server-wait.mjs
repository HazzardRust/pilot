/**
 * The deck server's waiting half (feature audit-f1-f7, spec 13, ADR 0113): the HTTP
 * plumbing every route shares (the body readers, `send`, the Origin and Host guards,
 * the static-asset allowlist) and the long poll (the `changes` emitter, the hand-off
 * timers, `waitForReplies` and the fallback). Moved out of `deck/server.mjs` whole and
 * in order; `deck/server.mjs` imports what it uses from here and re-exports
 * `browserCount` and `waiterCount`, so no import of the old path changed.
 */

import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { quietAt, watchAgents } from './agents.mjs';
import { HANDOFF_ACK_MS, KIND_GATE2, KIND_HANDOFF, KIND_QUESTION, KIND_WALKTHROUGH, NOTE_SEPARATOR, PASS_KINDS, SIGN_OFF, isOpen } from './items.mjs';
import { yieldsDue } from './lanes.mjs';
import { PICKED_UP_MS, WORKING_MS } from './pilot-state.mjs';
import { addWrapper } from './session.mjs';
import {
  DeckRefusal, MAX_TEXT_BYTES, MAX_WAIT_REPLIES, deckLanes, fallBack, fallbackDue, listItems, listRuns, markDelivered, postItem,
  repliesSince, yieldTicket,
} from './store.mjs';
import { CONFLICT_TURN_MS } from './store-items.mjs';
import { cookieName, deckDir, ensureSecret, secretFile } from '../hooks/lib/deck-secret.js';
import { DECK_HOST } from './tools.mjs';
import { capRefusal } from './ui/render.mjs';

/**
 * The transport bound on an API request body. Larger than `MAX_TEXT_BYTES` on purpose:
 * the store's limit is per field, so an item whose body is exactly at the limit has to
 * fit through here with its title, its JSON quoting and its envelope around it. The
 * store, not the transport, is what decides whether the content is acceptable.
 */
const MAX_REQUEST_BYTES = 4 * MAX_TEXT_BYTES;

/**
 * The page's static assets, served off `/ui/` from a fixed allowlist (ADR
 * 0030, L10). The list is keyed on the whole path a page asks for: a request
 * is answered only when its path *is* a key, so no part of it is ever joined
 * onto a directory, and a `..`, an encoded one, a subdirectory or a file that
 * is not on the list is a 404 like any other page the deck does not have. An
 * asset added later is served after a restart, which is also when the daemon
 * would pick up any other change to its own code.
 *
 * The script modules in `deck/ui/js/` make up most of the list, each read off
 * disk at startup. `favicon.svg` (S8, L16) is named on the list beside them
 * rather than found by scanning `deck/ui/` for it, because that directory
 * also holds `render.mjs` and the `.html` templates, and a scan would need
 * its own filter to keep those off a route that already promises none of its
 * own source is servable.
 */
const UI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ui');
const UI_JS = path.join(UI_DIR, 'js');
const UI_ASSETS = new Map([
  ...fs
    .readdirSync(UI_JS)
    .filter((name) => name.endsWith('.mjs'))
    .map((name) => [`/ui/${name}`, { file: path.join(UI_JS, name), contentType: 'text/javascript; charset=utf-8' }]),
  ['/ui/favicon.svg', { file: path.join(UI_DIR, 'favicon.svg'), contentType: 'image/svg+xml' }],
]);

/** One thread has one page, and `Yours` in slice 4's table links to it (L4). */
const THREAD_PATH = '/thread/';

/**
 * The id in `/thread/<id>`, or null when there is not one. A stray `%` in the
 * address bar is a URL that names no thread rather than a request the deck
 * failed to handle, so it reads as the 404 it is instead of a 500.
 */
function threadIdIn(pathname) {
  try {
    return decodeURIComponent(pathname.slice(THREAD_PATH.length)) || null;
  } catch {
    return null;
  }
}

/**
 * What the user actually said. An option button posts `choice` and the box
 * posts `text`; someone who clicked an option *and* typed something meant both,
 * and dropping either half would be the deck putting words in their mouth.
 *
 * The carriage returns are the browser's, not theirs: HTML form submission
 * normalises every newline in a textarea to CRLF before it is sent. A
 * walkthrough is answered in dot points and those dot points are quoted back
 * into an agent's context, so the line breaks that reach it are the ones the
 * user pressed Enter for and not the wire's idea of them.
 *
 * The walkthrough's `Sign off` is the one exception, and it is one because of
 * what it means. It is the user's verdict on a whole procedure (`items.mjs`),
 * so pressing it with a finding typed beside it would be a signature under work
 * they have just said is wrong. Their words are what count there, and the
 * sign-off is dropped; the thread stays open either way, as every reply leaves
 * it.
 *
 * It takes the item's `kind` and not the words alone. A question's and a
 * sign-off's options are the pilot's own free text, so a pilot that labels one
 * of them "Sign off" — which reads perfectly naturally on a `signoff` — would
 * otherwise have that press quietly dropped from a reply the user typed beside
 * it, and half a reply lost without a word is the one thing this function must
 * not do. Only the walkthrough's own button means what the rule is about.
 */
function replyFrom(form, kind) {
  const choice = form.get('choice');
  const typed = form.get('text');
  const said = (part) => typeof part === 'string' && part.trim() !== '';
  const signingOff = kind === KIND_WALKTHROUGH && choice === SIGN_OFF;
  const parts = signingOff && said(typed) ? [typed] : [choice, typed];
  return parts
    .filter(said)
    .map((part) => part.replace(/\r\n/g, '\n'))
    .join(NOTE_SEPARATOR);
}

/**
 * Printable ASCII, which is the whole of what a deck-local path is made of:
 * every `back` the deck writes has been through `encodeURIComponent`, so even a
 * repository path in Cyrillic arrives here percent-encoded like any other.
 *
 * Written as a code-point comparison rather than as a character class, because
 * the `\u` escapes that class would need are what an editor writing this file
 * resolves into literal control characters — and a JavaScript file with a NUL
 * in it is a file git reads as a binary blob.
 */
const isPrintableAscii = (character) => {
  const code = character.codePointAt(0);
  return code >= 0x20 && code < 0x7f;
};

/**
 * Where the browser goes after a reply, when the form said — a card's quick
 * answer posts the page it was clicked on so that answering from the home
 * screen leaves the user on the home screen (D7). Anything else is null and the
 * caller falls back to the thread.
 *
 * This is the only value a page anywhere else in the browser can put into a
 * `Location` header of ours, so it is checked rather than trusted. Deck-local
 * means it starts with `/`, which is also what rules a scheme out — `https://…`
 * and `javascript:…` do not — and that the next character is neither `/` nor
 * `\`, either of which makes it protocol-relative and so somebody else's
 * origin. Those two characters are the whole of the decision, not a sample of
 * it: the URL parser only looks for an authority when the second character is
 * one of them, and a value that reaches path state can never get back out of it.
 *
 * Everything outside printable ASCII is refused as well. A CR or an LF in a
 * `Location` is a second header; the rest is refused because `writeHead` throws
 * on it, and the throw would land on a request that has already stored the
 * user's reply — they answered, and the deck told them it fell over.
 */
function backPath(value) {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('/') || /^\/[/\\]/.test(value)) return null;
  if (![...value].every(isPrintableAscii)) return null;
  return value;
}

/**
 * A form post, bounded. `what` is what the refusal calls it, because two routes
 * read a form now and a dismissal told it was too long a *reply* is the deck
 * describing something the user did not do.
 */
function readFormBody(request, what) {
  return new Promise((resolve, reject) => {
    let body = '';
    let refused = false;
    request.on('data', (chunk) => {
      // Stop accumulating, but do not destroy the request: the 400 the rejection
      // produces still has to reach the browser, and a destroyed socket is a
      // connection reset the human reads as "the deck crashed" instead. What now
      // bounds a client that keeps sending is Node's own `server.requestTimeout`
      // (300s by default), not us — acceptable on a loopback, single-user port (A4).
      if (refused) return;
      body += chunk;
      if (body.length > MAX_TEXT_BYTES) {
        refused = true;
        body = '';
        reject(new DeckRefusal(`${what} is longer than the deck accepts`));
      }
    });
    request.on('end', () => resolve(new URLSearchParams(body)));
    request.on('error', reject);
  });
}

/**
 * The same shape for the API, with the bound that belongs to the transport rather than
 * to the content. A content type is required as well: a cross-site form can only send
 * three of them, and `application/json` is not among them, so this is one more wall
 * between a drive-by page and a deck that has no authentication (A4, A6).
 */
function readJsonBody(request) {
  const type = String(request.headers['content-type'] ?? '');
  if (!type.startsWith('application/json')) {
    throw new UnsupportedMediaType('the deck API takes application/json');
  }
  return new Promise((resolve, reject) => {
    let body = '';
    let refused = false;
    request.on('data', (chunk) => {
      if (refused) return;
      body += chunk;
      if (body.length > MAX_REQUEST_BYTES) {
        refused = true;
        body = '';
        reject(new DeckRefusal('that request is longer than the deck accepts'));
      }
    });
    request.on('end', () => {
      if (refused) return;
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (err) {
        reject(new DeckRefusal(`the deck could not read that request as JSON (${err.message})`));
      }
    });
    request.on('error', reject);
  });
}

/** A request whose body the deck will not even try to read. */
class UnsupportedMediaType extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsupportedMediaType';
  }
}

function send(response, status, contentType, body) {
  response.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store' });
  response.end(body);
}

const sendJson = (response, status, payload) =>
  send(response, status, 'application/json; charset=utf-8', JSON.stringify(payload));

/**
 * A browser sends `Origin` on every POST, same-origin or not; a non-browser client (curl,
 * the tests, the stdio client's API calls) sends none. So a present-but-different Origin
 * is the one shape that only a cross-site page in the user's own browser can produce, and
 * that is exactly the drive-by-localhost request this guards against: some other open tab
 * silently posting a reply to this unauthenticated port on the user's behalf.
 */
function isTrustedOrigin(request) {
  const origin = request.headers.origin;
  return origin === undefined || origin === `http://${request.headers.host}`;
}

/** Every name that means "the deck itself". `DECK_HOST` is the loopback literal. */
const LOOPBACK_NAMES = [DECK_HOST, 'localhost', '[::1]'];

/**
 * Fails closed on DNS rebinding, which `isTrustedOrigin` alone cannot catch. A page on
 * `evil.example` whose DNS answers 127.0.0.1 arrives here with `Host: evil.example:4321`
 * *and* a matching `Origin`, so the two agree with each other and the request looks
 * same-origin — the attacker controls both. What that page cannot do is make `Host` say
 * a loopback name, because the browser fills `Host` from the name it was asked to visit.
 * So `Host` is the check that holds, and it guards every route: a rebound page reading
 * `GET /` walks off with the whole deck without ever posting anything.
 *
 * The port comes from the socket the request actually arrived on rather than `DECK_PORT`,
 * so a deck started on another port is held to this rule too instead of being exempt.
 */
function isOwnHost(request) {
  const host = request.headers.host;
  if (!host) return false;
  const port = request.socket.localPort;
  return LOOPBACK_NAMES.some((name) => host === `${name}:${port}`);
}

const digest = (value) => crypto.createHash('sha256').update(value, 'utf8').digest();

/**
 * Whether `offered` is `secret`, the one compare of a secret in the deck. Both sides are hashed first, so
 * `timingSafeEqual` compares equal lengths and a wrong length, or a value that is not a string, is a plain false.
 */
export function sameSecret(offered, secret) {
  return typeof offered === 'string' && typeof secret === 'string' && crypto.timingSafeEqual(digest(offered), digest(secret));
}

/** The value of the cookie `name` in a `Cookie` header, or undefined. */
function cookieValue(header, name) {
  if (typeof header !== 'string') return undefined;
  for (const pair of header.split(';')) {
    const at = pair.indexOf('=');
    if (at > 0 && pair.slice(0, at).trim() === name) return pair.slice(at + 1).trim();
  }
  return undefined;
}

/**
 * The guard's test (deck-token L2, L3, A3): the store's secret as `Authorization: Bearer`, or as
 * the page credential, the cookie named for the port this request arrived on, so another deck's
 * cookie riding to this port is not taken. A null secret is the unguarded test deck (L5) and
 * lets everything through.
 */
function isAuthorized(request, secret) {
  if (secret === null) return true;
  const header = request.headers.authorization;
  const offered =
    typeof header === 'string' && header.startsWith('Bearer ')
      ? header.slice('Bearer '.length)
      : cookieValue(request.headers.cookie, cookieName(request.socket.localPort));
  return sameSecret(offered, secret);
}

/**
 * What `createDeckHttpServer` guards with, failing closed (deck-token L5): with no `secret` given,
 * the store's file, made now, before the port answers, so a client that sees the deck up can read
 * it, and read again on every request so a replaced or deleted file is taken at once (A1). Only an
 * explicit null is unguarded, and any other given value must be a non-empty string. The dir is
 * fixed here, at construction, as the daemon's environment is.
 */
function deckGuard(secret) {
  if (secret !== undefined && secret !== null && (typeof secret !== 'string' || secret === '')) {
    throw new TypeError('a deck secret is a non-empty string, or null for an unguarded test deck');
  }
  const dir = deckDir();
  if (secret === undefined) ensureSecret(dir);
  return { file: secretFile(dir), secret: secret === undefined ? () => ensureSecret(dir) : () => secret };
}

/** The guard's 401 (L7): it names the file and never a value; a page is told to open the deck with `pilot deck`. */
const refuseWithoutSecret = (response, pathname, file) =>
  pathname.startsWith('/api/')
    ? sendJson(response, 401, { error: `the deck wants its secret, from ${file}` })
    : send(response, 401, 'text/plain; charset=utf-8', 'the deck wants its secret: open the deck with `pilot deck`\n');

// --- the long poll ---------------------------------------------------------

// Two events for one fact, because two different things subscribe to it and the daemon
// has to be able to tell them apart (D15). One counter answered "something is
// subscribed", which is not the question `POST /api/runs` asks: an agent parked in
// `deck_wait` is nobody looking at anything, and counting it as a watcher keeps the tab
// shut for exactly the session that wanted one.
const CHANGED_FOR_BROWSER = 'deck-changed-browser';
const CHANGED_FOR_WAITER = 'deck-changed-waiter';
// A third, for `pilot run` wrappers (start-end-session L5): a wrapper is nobody looking at
// the deck either, and counting it as a page kept the tab shut when a session registered (F6).
const CHANGED_FOR_WRAPPER = 'deck-changed-wrapper';
const changes = new EventEmitter();
// One listener per parked `deck_wait`, and a machine may have several sessions waiting.
changes.setMaxListeners(0);

/**
 * How many pages are reading `/events` right now, and how many sessions are parked in
 * `deck_wait`. Each count is the event's own listener count rather than a number kept by
 * hand, so neither can drift from what is actually subscribed. Both are exported because
 * `setMaxListeners(0)` above turns off the only warning Node would otherwise give about
 * a subscription that is never removed, so a test is what is left to notice.
 */
export const browserCount = () => changes.listenerCount(CHANGED_FOR_BROWSER);
export const waiterCount = () => changes.listenerCount(CHANGED_FOR_WAITER);

/**
 * Called after every write: the named writing tools below call it after every one of
 * theirs, `handOff` calls it for `deck_read`, and every `deck_wait`'s `take` calls it
 * from inside `waitForReplies`, each only on the call that actually marked a reply
 * delivered. Being called is the only thing a waiter can be waiting for.
 */
function announceChange() {
  changes.emit(CHANGED_FOR_BROWSER);
  changes.emit(CHANGED_FOR_WAITER);
  changes.emit(CHANGED_FOR_WRAPPER);
  armHandoffs();
}

/** Each open hand-off's one timer, by item id, at the moment it would read `unacknowledged`. */
const handoffTimers = new Map();

/**
 * One one-shot timer per open hand-off, at its `postedAt + HANDOFF_ACK_MS` (thread-kinds
 * spec 19, L7), so the pages repaint the moment it crosses: the state itself is
 * `isUnacknowledged`, read off the clock at render, never stored or swept. Set again on
 * every change, the way a parked wait's due timer is; one already past is not set, and one
 * that fires early finds its moment still ahead and is set again by the change it announces.
 */
function armHandoffs() {
  let items;
  let runs;
  try {
    items = listItems();
    runs = listRuns();
  } catch (err) {
    console.error('[deck] the hand-off timers could not read the store:', err.message);
    return;
  }
  const now = Date.now();
  for (const item of items) {
    if (item?.kind !== KIND_HANDOFF || !isOpen(item) || handoffTimers.has(item.id)) continue;
    const at = Date.parse(item.postedAt) + HANDOFF_ACK_MS;
    if (!(at > now)) continue;
    const fire = () => {
      handoffTimers.delete(item.id);
      announceChange();
    };
    handoffTimers.set(item.id, setTimeout(fire, at - now).unref());
  }
  armStateTimers(items, runs);
  armYields();
  armConflicts();
}

/** Each waiting conflict's one timer, by gate2 id, with the conflict's moment it was armed for. */
const conflictTimers = new Map();

const conflictTitle = (dir) => `Resolve the landing conflict in ${dir}`;

/**
 * A gate2 whose stored conflict waits on the pilot (spec 5): not marked `resolving` by the pilot's `Resolving` (L7)
 * and no question on it yet. Read from the store, so a restart finds what the last daemon armed.
 */
function conflictWaits(gate, items) {
  const conflict = gate?.kind === KIND_GATE2 && isOpen(gate) ? gate.landing?.conflict : undefined;
  if (!conflict || conflict.resolving) return false;
  const asked = (item) => item.kind === KIND_QUESTION && item.ticket === gate.ticket && item.title === conflictTitle(conflict.dir) && String(item.postedAt) >= conflict.at;
  return !items.some(asked);
}

/**
 * One unref'd one-shot timer per waiting conflict, at its `at + CONFLICT_TURN_MS` (A1); one already past fires at once,
 * so a restart hands over an overdue conflict. Armed again on every change through `armHandoffs`; a timer whose
 * conflict stopped waiting is cleared. On fire the rule is read again, and the conflict goes to the user as one
 * blocked question on the signed ticket.
 */
export function armConflicts() {
  let items;
  try {
    items = listItems();
  } catch (err) {
    console.error('[deck] the conflict timers could not read the store:', err.message);
    return;
  }
  const due = new Map(items.filter((item) => conflictWaits(item, items)).map((gate) => [gate.id, gate.landing.conflict.at]));
  for (const [id, armed] of conflictTimers) {
    if (due.get(id) === armed.conflictAt) continue;
    clearTimeout(armed.timer);
    conflictTimers.delete(id);
  }
  const ask = (id) => {
    const now = listItems();
    const gate = now.find((item) => item.id === id);
    if (!conflictWaits(gate, now)) return;
    const { dir } = gate.landing.conflict;
    const minutes = CONFLICT_TURN_MS / 60_000;
    postItem({
      kind: KIND_QUESTION, blocking: true, ticket: gate.ticket, repo: gate.repo, title: conflictTitle(dir),
      body: `The landing of ${gate.id} stopped on a merge conflict, and the pilot has not taken it in ${minutes} min. Resolve it in ${dir}, commit, run pilot land, then answer Done.`,
      options: ['Done', 'Leave it unlanded'], recommended: 'Done',
    });
  };
  const arm = (id, conflictAt) => {
    const at = Date.parse(conflictAt) + CONFLICT_TURN_MS;
    const fire = () => {
      // A timer may wake a millisecond short of `at`: that conflict is still the pilot's.
      if (Date.now() < at) return arm(id, conflictAt);
      conflictTimers.delete(id);
      try {
        ask(id);
      } catch (err) {
        console.error(`[deck] the conflict on ${id} could not be handed over:`, err.message);
        return;
      }
      announceChange();
    };
    conflictTimers.set(id, { conflictAt, timer: setTimeout(fire, Math.max(0, at - Date.now())).unref() });
  };
  for (const [id, conflictAt] of due) if (!conflictTimers.has(id)) arm(id, conflictAt);
}

/** Each due yield's one timer, by question id, with the ticket and moment it was armed for. */
const yieldTimers = new Map();

/**
 * One unref'd one-shot timer per yield `yieldsDue` names, at its `at` (blocked-yellow-yields L2): the deck's second
 * timer that writes, after the landing's timeout. One already past fires at once, so a restart pauses an overdue
 * ticket; armed again on every change through `armHandoffs`, and a timer whose yield is no longer named is cleared.
 * On fire `yieldTicket` checks the rule again and refuses a yield that stopped being due.
 */
export function armYields() {
  let items;
  let coPilots;
  try {
    items = listItems();
    ({ coPilots } = deckLanes());
  } catch (err) {
    console.error('[deck] the yield timers could not read the store:', err.message);
    return;
  }
  const due = new Map();
  for (const held of Object.values(coPilots)) {
    const ticket = items.find((item) => item.id === held);
    for (const entry of yieldsDue(items, ticket?.repo, held, Infinity)) due.set(entry.question, entry);
  }
  for (const [question, armed] of yieldTimers) {
    if (due.get(question)?.ticket === armed.ticket) continue;
    clearTimeout(armed.timer);
    yieldTimers.delete(question);
  }
  const arm = (question, ticket, at) => {
    const fire = () => {
      // A timer may wake a millisecond short of `at`: that yield is still ahead, not refused.
      if (Date.now() < at) return arm(question, ticket, at);
      yieldTimers.delete(question);
      try {
        yieldTicket(ticket, question);
      } catch (err) {
        if (!(err instanceof DeckRefusal)) console.error(`[deck] the yield of ${ticket} could not be written:`, err.message);
        return;
      }
      announceChange();
    };
    yieldTimers.set(question, { ticket, timer: setTimeout(fire, Math.max(0, at - Date.now())).unref() });
  };
  for (const [question, { ticket, at }] of due) if (!yieldTimers.has(question)) arm(question, ticket, at);
}

/** Each pending state lapse's one timer, by what lapses: a handoff's id or a run's id. */
const stateTimers = new Map();

/**
 * One unref'd one-shot timer per pending lapse (pilot-state-line spec 10, L6, A4): `picked up`
 * ends `PICKED_UP_MS` after a handoff's `resolvedAt`, `working` `WORKING_MS` after a run's
 * `lastSeenAt`. Nothing is written when a window ends, so the open page is told by the daemon,
 * never by a client timer. Armed again on every change; a lapse already armed for the same moment
 * adds none, a run seen again moves its timer, and one already past is not set.
 */
export function armStateTimers(items, runs) {
  const now = Date.now();
  const arm = (key, stampText, windowMs) => {
    const at = Date.parse(stampText) + windowMs;
    const held = stateTimers.get(key);
    if (held?.at === at) return;
    if (held) clearTimeout(held.timer);
    if (!(at > now)) {
      stateTimers.delete(key);
      return;
    }
    const timer = setTimeout(() => {
      stateTimers.delete(key);
      announceChange();
    }, at - now).unref();
    stateTimers.set(key, { at, timer });
  };
  for (const item of items) if (item?.kind === KIND_HANDOFF && item.resolvedAt) arm(`pickup:${item.id}`, item.resolvedAt, PICKED_UP_MS);
  for (const run of runs) if (run?.lastSeenAt) arm(`write:${run.id}`, run.lastSeenAt, WORKING_MS);
}

// The roster is the one thing that changes without a write, so it announces
// itself: an agent arriving, and the clock finding one that has stopped calling
// tools (L9). The heartbeats in between change nothing and say nothing.
watchAgents(announceChange);

/**
 * The hand-off: the replies a tool call has just given to a session are marked as
 * delivered, and the pages are told — but only when that actually wrote something (D4,
 * D5). It belongs here rather than in the store because this is where the deck hands text
 * over: the store knows what to write down, not what has been handed to anybody.
 */
function handOff(replies, kind) {
  if (markDelivered(replies, kind)) announceChange();
}

/**
 * The browser's half of the same event. An open thread is an argument in
 * progress: the pilot's push-back has to appear without the user hunting for a
 * refresh link, and a change is already announced here for the long poll, so
 * the page listens to it rather than asking again every few seconds. The page
 * never reloads to show it — `deck/ui/js/live.mjs` swaps the affected
 * `[data-live]` regions in place, so whatever is half-typed in the reply box
 * is never disturbed.
 */
function watchForChanges(response) {
  const onChange = () => response.write('event: changed\ndata: 1\n\n');
  changes.on(CHANGED_FOR_BROWSER, onChange);
  response.on('close', () => changes.off(CHANGED_FOR_BROWSER, onChange));
  openStream(response);
}

/**
 * When a closed wrapper's stream is announced again (spec 7). The close itself comes first,
 * and on a window closed by hand its session's MCP client (the registered pid, F2) outlives
 * it: seen dead within about 15 s on the live gate. So once soon, for a tree that dies fast,
 * and once past that, for one that does not. Two one-shot timers per close, never a poll.
 */
const WRAPPER_GONE_MS = Object.freeze([3_000, 20_000]);

/**
 * A `pilot run` wrapper's stream, `GET /events?wrapper=<cwd>` (L5). Refused with any
 * Origin at all, the deck's own included: a wrapper sends none, and a cross-site
 * `EventSource` always does. Registered under its repository for as long as it is open,
 * and its close is announced, because a wrapper whose stream drops is a window that has
 * closed: the pages re-render and find its session's pids gone (spec 7, F1).
 */
function watchAsWrapper(request, response, repo, goneMs) {
  // `Sec-Fetch-Site` as well: a page's no-cors GET (`<img src>`) sends no Origin, but every
  // browser request carries it and no script can set it. Node's `fetch` sends
  // `Sec-Fetch-Mode` but never this one, which is why it is this one.
  if (request.headers.origin !== undefined || request.headers['sec-fetch-site'] !== undefined) {
    return send(response, 403, 'text/plain; charset=utf-8', 'a wrapper stream is not for a page\n');
  }
  if (!repo) return send(response, 400, 'text/plain; charset=utf-8', 'a wrapper stream names its directory\n');

  const stream = { send: (event) => response.write(`event: ${event}\ndata: 1\n\n`) };
  const onChange = () => stream.send('changed');
  changes.on(CHANGED_FOR_WRAPPER, onChange);
  const remove = addWrapper(repo, stream);
  // The open tells the pages only: its session registered before this stream opened, so its
  // tab was drawn with no End on it (L6). The close and its two timers are `announceChange`,
  // which wakes every page, wrapper and parked waiter, because a closed window is a change.
  changes.emit(CHANGED_FOR_BROWSER);
  response.on('close', () => {
    changes.off(CHANGED_FOR_WRAPPER, onChange);
    remove();
    announceChange();
    for (const ms of goneMs) setTimeout(announceChange, ms).unref();
  });
  return openStream(response);
}

/**
 * A Start or End refusal lands back on the tab it was pressed on, its reason drawn in that
 * control (L6), the way an Add's lands beside the + box; no tab at all is the overview.
 */
function landRefusal(request, response, tab, err) {
  // A page's fetch (handoff-failed-confirm S5) reads a 303 as taken, so it gets the 400 and posts for real.
  if (!(err instanceof DeckRefusal) || request.headers['sec-fetch-dest'] === 'empty') throw err;
  const location = `/?run=${encodeURIComponent(tab?.repo ?? '')}&sessionRefused=${encodeURIComponent(err.message)}`;
  response.writeHead(303, { location, 'cache-control': 'no-store' });
  return response.end();
}

/**
 * A press refused on a thread lands on that thread with its reason (deck-press-feedback L1-L3,
 * ADR 0096), when the browser navigated: anything else (an agent, curl, a page's fetch) and an
 * item the deck does not hold rethrow, to the 400 they always got. The Location is built from
 * the stored item's id alone, never from `back` or another form field.
 */
function landRefusedPress(request, response, item, err) {
  if (!(err instanceof DeckRefusal) || !item || request.headers['sec-fetch-mode'] !== 'navigate') throw err;
  const location = `${THREAD_PATH}${encodeURIComponent(item.id)}?refused=${encodeURIComponent(capRefusal(err.message))}#reply`;
  response.writeHead(303, { location, 'cache-control': 'no-store' });
  return response.end();
}

/** The headers of a change stream, sent at once. */
function openStream(response) {
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
  });
  // Nothing is written until something changes, so the headers go out by hand:
  // until they arrive the browser does not consider itself connected at all.
  response.flushHeaders();
}

/**
 * Park until a reply newer than `since` that the caller hears exists, or until the
 * timeout. No interval and no re-read on a schedule: the store is consulted once up
 * front, then only when a write has actually announced itself. A spurious wake, or a
 * reply the caller does not hear (another repository, a thread another kind owns), finds
 * nothing and goes back to waiting rather than returning empty, so the promise means
 * what it says. The seq still counts the whole deck, so a reply read past is not
 * waited on again.
 */
function waitForReplies({ since, timeoutMs, signal, heard, take, untaken = false, fallback = null }) {
  const heardSince = () => {
    // Overdue first (A7): claimed off the cursor, so the page below may hold them too.
    const overdue = fallback?.claim() ?? [];
    const claimed = new Set(overdue.map((reply) => reply.seq));
    // An untaken wait reads every reply and pages after the filter, so no cursor and no
    // page of other replies hides one it has not been handed (crew-waits L3).
    const page = untaken ? repliesSince(0, Infinity) : repliesSince(since, MAX_WAIT_REPLIES);
    const fresh = page.replies.filter((reply) => heard(reply) && !claimed.has(reply.seq)).slice(0, MAX_WAIT_REPLIES);
    const found = { ...page, replies: [...overdue, ...fresh].sort((left, right) => left.seq - right.seq) };
    // Taken in the same synchronous pass that found them, so a second wait woken by the
    // same change finds them taken (ADR 0061).
    take(found.replies);
    return found;
  };
  const ready = heardSince();
  if (ready.replies.length) return Promise.resolve(ready);

  return new Promise((resolve) => {
    let timer;
    let due;
    const settle = (value) => {
      clearTimeout(timer);
      clearTimeout(due);
      changes.off(CHANGED_FOR_WAITER, onChange);
      signal?.removeEventListener('abort', onAbort);
      resolve(value);
    };
    const look = () => {
      try {
        return heardSince();
      } catch (err) {
        // The store went unreadable while this request was parked. The first read
        // succeeded, so this is news: say so on the daemon's stderr and keep waiting
        // rather than taking the whole daemon down from a timer callback.
        console.error('[deck] a parked wait could not read the store:', err.message);
        return null;
      }
    };
    // One timer, at the earliest moment a reply could fall back to this pilot, set again on
    // every wake (A7). Only ever in the future: a reply due now was claimed by the look
    // just before, so a timer at or behind the clock could only spin.
    const arm = () => {
      clearTimeout(due);
      const at = fallback?.next();
      if (typeof at === 'number' && at > Date.now()) due = setTimeout(onChange, at - Date.now());
    };
    const onChange = () => {
      const now = look();
      if (now && now.replies.length) settle(now);
      else if (now) arm();
    };
    const onAbort = () => settle({ replies: [], seq: since });

    timer = setTimeout(() => settle(look() ?? { replies: [], seq: since }), timeoutMs);
    changes.on(CHANGED_FOR_WAITER, onChange);
    signal?.addEventListener('abort', onAbort, { once: true });
    arm();
  });
}

/**
 * What a reply handed over by the fallback says beside its text (ADR 0045), so the pilot
 * knows it holds another kind's thread: every path that hands it one prints this as given.
 * It names the owner kind, and offers a pass back only to a kind a thread can be passed to
 * (`PASS_KINDS`): a teacher's or an auditor's thread stays the pilot's (ADR 0058).
 */
const fellBackNote = (owner) =>
  `This was ${owner}'s thread, and ${owner} did not pick this reply up in time, so the deck has ` +
  (PASS_KINDS.includes(owner)
    ? `handed the thread to you: answer it, or pass it back to your ${owner} agent with deck_reply and to: "${owner}".`
    : `handed the thread to you: answer it; a thread cannot be passed back to ${owner}.`);

/**
 * The pilot's half of a thread falling back (spec 5, L6, L7, A7): the replies in `repo`
 * whose quiet owner kind has let them sit, handed to the pilot through `fallBack` and returned as the
 * wait's own. The pages and the other waits are told after this wait has settled, so a
 * wait never wakes itself half-way through claiming.
 */
function fallbackFor(repo) {
  let nextAt = null;
  const claim = () => {
    const due = fallbackDue(repo, Date.now(), (kind) => quietAt(repo, kind));
    nextAt = due.nextAt;
    const taken = new Set();
    for (const id of new Set(due.overdue.map((reply) => reply.itemId))) {
      const seqs = due.overdue.filter((reply) => reply.itemId === id).map((reply) => reply.seq);
      if (fallBack(id, seqs) !== null) taken.add(id);
    }
    if (taken.size) queueMicrotask(announceChange);
    return due.overdue
      .filter((reply) => taken.has(reply.itemId))
      .map((reply) => ({ ...reply, fallback: fellBackNote(reply.owner) }));
  };
  return { claim, next: () => nextAt };
}

export {
  UI_ASSETS, THREAD_PATH, threadIdIn, replyFrom, backPath, readFormBody, readJsonBody, UnsupportedMediaType, send,
  sendJson, isTrustedOrigin, isOwnHost, isAuthorized, deckGuard, refuseWithoutSecret, changes, announceChange, armHandoffs, handOff, watchForChanges,
  WRAPPER_GONE_MS, watchAsWrapper, landRefusal, landRefusedPress, waitForReplies, fallbackFor,
};
