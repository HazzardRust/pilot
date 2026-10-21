/**
 * What a test here stands a deck up from, shared rather than copied per file.
 * Lives outside `deck/test/`: `node --test` treats every file in a directory
 * named `test` as a test file, and this one has no `test()` of its own.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';

import { ensureSecret } from '../hooks/lib/deck-secret.js';
import { isWindows } from '../hooks/lib/platform.js';
import { createDeckHttpServer } from './server.mjs';
import { liveTicketOf } from './items.mjs';
import { deckLanes, listItems, parkTicket, postItem, registerRun, storeFile } from './store.mjs';
import { install } from './ui/js/page.mjs';
import { renderHomePage } from './ui/render.mjs';

// Every test file is its own process, so the home is redirected once, here, and never restored per test:
// a chain test that leaves the default `pastMark` to read `~/.claude/context-usage-state.json` reads
// this empty home, not the user's snapshot (handoff-over-mark L3). Always, since a custom HOME can hold a snapshot too.
const suiteHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-home-'));
process.env.HOME = suiteHome;
process.env.USERPROFILE = suiteHome;
// The suite home's own deck secret, so a client under test pointed at a stub finds one to send (deck-token L5).
ensureSecret(path.join(suiteHome, '.claude', 'pilot'));
process.on('exit', () => {
  try {
    fs.rmSync(suiteHome, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch (err) {
    // A temp home a daemon this file spawned still holds is left for the OS to clear.
    if (err.code !== 'EPERM' && err.code !== 'EBUSY' && err.code !== 'ENOTEMPTY') throw err;
  }
});

/**
 * The same directory spelt another way the host still calls it one (L3, L8): another case on win32,
 * which folds it, and a trailing separator elsewhere, since POSIX case names a different directory.
 */
export const respelt = (dir) => (isWindows() ? dir.toUpperCase() : `${dir}${path.sep}`);

/** A port nothing listens on at the moment of the call: bind 0 on 127.0.0.1, read it, close. */
export async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

/**
 * A throwaway store directory for one test, proved to be the one the store will
 * actually write to before the test is let anywhere near it.
 *
 * The proof is not tidiness. On 2026-09-14 a run of the suite wrote into the
 * user's own `~/.claude/pilot`, because the environment variable was set after
 * the store had already worked out where it lived; the run that found it was a
 * mutation run, so the damage was a live deck's items rewritten by a test. The
 * assertion costs one `path` call and it is the only thing standing between a
 * test process and somebody's real deck.
 */
export const tempDeck = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-deck-'));
  const previous = process.env.PILOT_DECK_DIR;
  process.env.PILOT_DECK_DIR = dir;
  assert.ok(
    storeFile().startsWith(dir + path.sep),
    `a test would have written to ${storeFile()}, which is not its own ${dir}`,
  );
  // The store's secret, as a deck that has run once leaves it, so a client under test has one to send.
  ensureSecret(dir);
  t.after(() => {
    if (previous === undefined) delete process.env.PILOT_DECK_DIR;
    else process.env.PILOT_DECK_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
};

/**
 * A real deck: a store of this test's own, a port the operating system has just
 * confirmed is free, and both taken down when the test ends however it ends.
 * Never port 4321 — this machine runs a deck the user is working on.
 *
 * `options` is what `createDeckHttpServer` takes, which is how a test hands the
 * daemon a stand-in for the browser opener. The address is what comes back,
 * because that is what a browser or a tool call needs; a test that wants the
 * number takes `new URL(base).port` off it.
 *
 * Unguarded unless the test gives a `secret` (deck-token L5): a test that means to prove the
 * guard passes a string, and every other request here goes in as it always has.
 */
export async function deckOnAPort(t, options = {}) {
  tempDeck(t);
  const server = createDeckHttpServer({ secret: null, ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  return `http://127.0.0.1:${server.address().port}`;
}

/**
 * A button on a card or a thread, clicked: the item is posted, a deck of this
 * test's own serves it, and the form goes in exactly as the browser sends one —
 * `choice` and no `text` at all, because `formnovalidate` is what lets the empty
 * required box through, and that is the half a hand-written request gets wrong.
 *
 * The item as the store holds it afterwards is what comes back, so each button's
 * own contract — the words it posts, and that the thread it was clicked on is
 * still open — is asserted where that button is the subject.
 */
export async function postsTheChoice(t, item, choice) {
  const origin = await deckOnAPort(t);
  const posted = postItem(item);

  const answer = await fetch(`${origin}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin },
    redirect: 'manual',
    body: new URLSearchParams({ id: posted.id, choice }),
  });

  assert.equal(answer.status, 303, 'the click is a reply, and the browser is sent back');
  return listItems().find((candidate) => candidate.id === posted.id);
}

/**
 * A ticket body in ticket-making's shape (crew-voice-rules spec 14), quoting `words` so a test
 * can still tell its tickets apart by body.
 */
export const shapedTicketBody = (words = 'fix the thing') =>
  `> ${words}\n\n1. It is done. *The test shows it.*\n\nThread itm_d2f9ed260436.`;

/**
 * A gate's evidence with the ticket it names (ticket-states spec 2), that ticket put in `repo` first:
 * posted red for a gate1, or stored in `state` (a gate2's is yellow) as if its gate1 were signed,
 * and taken live, as a gate's ticket must be (ticket-states L9). A gate1's evidence gains the plan's
 * `sliceCount` and `branch` unless it names its own (ticket-states L7).
 */
export const withTicket = (evidence, repo, state = 'red') => {
  const ticket = { kind: 'ticket', title: 'The ticket', body: shapedTicketBody(), repo, sliceCount: 60 };
  const { id } = state === 'red' ? postItem(ticket) : postStored({ ...ticket, state });
  const plan = 'artefact' in evidence ? { sliceCount: 3, branch: 'feat/x' } : {};
  return { ...plan, ...evidence, ticket: takeLive(id).id };
};

/**
 * Put a ticket in hand as a fixture, parking whichever ticket in its directory is live first (ticket-states L9).
 * It writes `live` straight into the store, as `postStored` does, so a test can hold a red ticket
 * with a green one waiting, which `takeTicket` refuses (ticket-state-accents spec 6).
 */
export const takeLive = (id) => {
  const { repo } = listItems().find((item) => item.id === id);
  const live = liveTicketOf(listItems(), repo);
  if (live && live.id !== id) parkTicket(live.id);
  if (live?.id === id) return live;
  const file = storeFile();
  const deck = JSON.parse(fs.readFileSync(file, 'utf8'));
  Object.assign(deck.items.find((item) => item.id === id), { live: true, takenAt: new Date().toISOString() });
  fs.writeFileSync(file, JSON.stringify(deck), 'utf8');
  return listItems().find((item) => item.id === id);
};

/**
 * An item as one stored before a rule it would now break reads (thread-types-phase L3,
 * ADR 0051): written straight into the store file, never posted, so it carries whatever
 * fields it is given and inherits no kind's rule. Returns the item as the store reads it.
 */
export function postStored(item) {
  const file = storeFile();
  const deck = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf8'))
    : { version: 2, items: [], runs: [], seq: 0 };
  const id = `itm_${crypto.randomBytes(6).toString('hex')}`;
  deck.items.push({ id, owner: 'pilot', postedAt: new Date().toISOString(), replies: [], ...item });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(deck), 'utf8');
  return listItems().find((stored) => stored.id === id);
}

/** The repository the switch and lane tests (ticket-state-accents) stand their tickets in. */
const LANE_REPO = path.resolve('D:/work/pilot');

/** A ticket stored in `state`, in `repo` (by default the lane tests' own). */
export const aTicket = (title, state, repo = LANE_REPO) => postStored({ kind: 'ticket', title, body: shapedTicketBody(title), repo, sliceCount: 3, state });

/** The home page with a live run in the lane tests' repository, its Tickets panel drawn from `deckLanes()`. */
export const page = () =>
  renderHomePage(listItems(), [{ ...registerRun({ repo: LANE_REPO, pid: process.pid }), feature: 'x' }], LANE_REPO, false, {}, {}, Date.now(), [], null, {}, null, { weekly: true }, deckLanes());

/** Each Tickets row's whole markup by its ticket id. */
export const rowsOf = (html) =>
  Object.fromEntries([...html.matchAll(/<li data-state="[a-z]+"[^>]*>(?:(?!<\/li>).)*?<a href="\/thread\/(itm_[0-9a-f]+)">.*?<\/li>/gs)].map(([row, id]) => [id, row]));

/**
 * The `env` every module under `deck/ui/js/` is installed against (L11): the
 * window the page's script expects, holding nothing any one test is about.
 *
 * The script reads all of this when it is installed — a URL, a parser, an event
 * source, both storages — so an `env` missing any of it throws before the test
 * reaches its subject, and every file that installs the script had written the
 * same dozen lines out again. `setInterval` returns a handle and starts nothing,
 * because a real interval outlives the test that asked for it; a test that wants
 * the tick records it instead (`deck/test/stale.test.mjs` fires one by hand).
 *
 * `overrides` is the test's own subject: the document it queries, the fetch or
 * the timer it records, the storage it preset. They are spread last, so what a
 * test names always wins over what is here for the script's sake.
 */
export const aSandbox = (overrides = {}) => ({
  location: { href: 'http://127.0.0.1/' },
  setTimeout: (run) => setTimeout(run, 0),
  setInterval: () => 0,
  fetch: () => new Promise(() => {}),
  DOMParser: function DOMParser() {
    this.parseFromString = () => ({ querySelectorAll: () => [], querySelector: () => null });
  },
  EventSource: function EventSource() {
    this.addEventListener = () => {};
  },
  // The window's own two: the script moves the address itself when the user
  // picks a tab, and listens for Back. A test that is about neither still runs
  // the line that registers them, so they stand here doing nothing.
  addEventListener: () => {},
  history: { pushState() {} },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  // A module reads its globals off `env` and nothing else (L11), so a browser
  // global the script uses is handed in even when Node's own is right there.
  URLSearchParams,
  ...overrides,
});

/**
 * The page's script installed against `env` through the same `page.mjs` that
 * `deck/ui/js/deck.mjs` installs against the window, bar the usage readout,
 * whose poll a test of anything else would only have to wait out
 * (`usage.test.mjs` installs it after this). It returns `env`, so a test can
 * build and load a page in one line.
 */
export const loadPage = (env) => {
  install(env);
  return env;
};

/** The context guard, whose own marks a test builds its readings from (handoff-over-mark L3). */
export const guard = createRequire(import.meta.url)('../hooks/context-size-guard.js');

/**
 * A home of this test's own whose status-line snapshot reads `tokens` for `repo`, so the
 * chain's default `pastMark` reads it rather than the user's real one.
 */
export const snapshotAt = (t, repo, tokens) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-mark-'));
  const before = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  t.after(() => {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    fs.rmSync(home, { recursive: true, force: true });
  });
  const ctx = (tokens / guard.PILOT_REFERENCE_WINDOW) * 100;
  fs.mkdirSync(path.join(home, '.claude'));
  fs.writeFileSync(path.join(home, '.claude', 'context-usage-state.json'), JSON.stringify({ decks: { [repo]: { ctx } } }));
};
