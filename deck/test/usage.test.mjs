/**
 * Slice S11 of deck-usability: live usage on the page (spec 11, D16).
 *
 * The figures come out of `~/.claude/context-usage-state.json`, which the
 * status-line hook writes and nothing here ever does. That single fact decides
 * how this file is written: the reader is tested against a *scratch* copy of
 * that file, never the real one, and every one of its shapes is a shape the
 * deck did not choose and cannot prevent — absent, empty, half-written, a
 * number where an object should be, a reset time no calendar can hold. The
 * claim under all of them is the same: a reading the deck does not have is
 * "unknown", and never a throw and never a 500 (D16, the slice's prohibitions).
 *
 * Three levels, because the slice has three parts.
 *
 * `readUsage` is a claim about a file, so it runs against real files in a
 * temporary directory, pointed at by `PILOT_USAGE_FILE`.
 *
 * `GET /api/usage` is a claim about a status code and a body, so it runs
 * against a real HTTP server on an ephemeral port, including the one thing
 * D16 forbids outright — a reading cached across two requests.
 *
 * "the page shows them and polls every 30 s" is a claim about the browser, so
 * `deck/ui/js/usage.mjs` is imported and installed against the least DOM it
 * touches (L11), after the rest of the page — whose `time.mjs`
 * minute tick reads the reset stamps too — the way `deck/ui/js/deck.mjs`
 * installs the two on a real page.
 *
 * Nothing here may touch the real store, the real state file or port 4321:
 * this machine runs a real deck and a real status line.
 */

import './no-open.mjs';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { aSandbox, deckOnAPort, loadPage, tempDeck } from '../testUtils.mjs';
import { install as installUsage } from '../ui/js/usage.mjs';

const { readUsage, usageFile } = await import('../usage.mjs');
const { repoKey } = await import('../runs.mjs');
const { renderDeckPage, renderHomePage, renderThreadPage } = await import('../ui/render.mjs');

const HOUR_MS = 60 * 60 * 1000;

/**
 * A scratch state file for one test, and `PILOT_USAGE_FILE` pointing at it.
 * Returns the writer: `state(null)` is the file never written at all, which is
 * the ordinary case on a machine whose status line has not run yet.
 */
function aStateFile(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-usage-'));
  const file = path.join(dir, 'context-usage-state.json');
  const previous = process.env.PILOT_USAGE_FILE;
  process.env.PILOT_USAGE_FILE = file;
  t.after(() => {
    if (previous === undefined) delete process.env.PILOT_USAGE_FILE;
    else process.env.PILOT_USAGE_FILE = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return (contents) => {
    if (contents === null) fs.rmSync(file, { force: true });
    else fs.writeFileSync(file, typeof contents === 'string' ? contents : JSON.stringify(contents));
    return file;
  };
}

/** Whole seconds, because that is the unit the hook writes `resetsAt` in. */
const epoch = (ms) => Math.floor(ms / 1000);

/**
 * Two decks on one machine, which is what spec 31 is about: the file's top
 * level is whichever status line refreshed last — here the *other* deck's — and
 * each deck's own reading is in the `decks` map beside it (L31).
 */
const THE_DECK = path.join(os.tmpdir(), 'pilot-usage-deck');
const ANOTHER_DECK = path.join(os.tmpdir(), 'pilot-usage-neighbour');

/** One entry of that map: a session's reading, and when its status line wrote it. */
const anEntry = (ctx, agoMs = 0) => ({ ctx, at: new Date(Date.now() - agoMs).toISOString() });

/** A `decks` map, keyed the way the deck keys a directory everywhere else. */
const decksOf = (entries) =>
  Object.fromEntries(Object.entries(entries).map(([dir, entry]) => [repoKey(dir), entry]));

/** A snapshot shaped exactly as `hooks/context-usage-statusline.js` writes one. */
const aSnapshot = (resetsIn = 2 * HOUR_MS) => ({
  ctx: 74,
  session: { pct: 47, resetsAt: epoch(Date.now() + resetsIn) },
  weekly: { pct: 7, resetsAt: epoch(Date.now() + 7 * 24 * HOUR_MS) },
  session_id: '52c1095e-8427-40c9-8aa5-228f09bd8e81',
  decks: decksOf({ [THE_DECK]: anEntry(19), [ANOTHER_DECK]: anEntry(74) }),
});

// --- the reader -------------------------------------------------------------

test('the three readings the status line wrote, with their reset times as a browser reads them', (t) => {
  const write = aStateFile(t);
  const snapshot = aSnapshot();
  write(snapshot);

  assert.deepEqual(readUsage(THE_DECK), {
    ctx: { pct: 19 },
    session: { pct: 47, resetsAt: new Date(snapshot.session.resetsAt * 1000).toISOString() },
    weekly: { pct: 7, resetsAt: new Date(snapshot.weekly.resetsAt * 1000).toISOString() },
  });
});

test('the session id that names the writer never leaves the reader', (t) => {
  const write = aStateFile(t);
  write(aSnapshot());

  assert.deepEqual(
    Object.keys(readUsage(THE_DECK)),
    ['ctx', 'session', 'weekly'],
    'the file also says which session wrote it, which is no business of the page (A6)',
  );
});

test('a percentage is rounded the way the status line rounds it', (t) => {
  const write = aStateFile(t);
  write({
    ctx: null,
    session: { pct: 47.5, resetsAt: null },
    weekly: null,
    decks: decksOf({ [THE_DECK]: anEntry(19.4) }),
  });

  const usage = readUsage(THE_DECK);
  assert.equal(usage.ctx.pct, 19, 'the figure on the page has to be the figure on the line');
  assert.equal(usage.session.pct, 48);
  assert.equal(usage.session.resetsAt, null);
});

test('a state file that is not there is unknown, not a throw', (t) => {
  const write = aStateFile(t);
  write(null);

  assert.deepEqual(readUsage(THE_DECK), { ctx: null, session: null, weekly: null });
});

test('an empty state file is unknown', (t) => {
  const write = aStateFile(t);
  write('');

  assert.deepEqual(readUsage(THE_DECK), { ctx: null, session: null, weekly: null });
});

test('a malformed state file is unknown', (t) => {
  const write = aStateFile(t);
  // Caught mid-write, or written by a build that held something else there.
  write('{"ctx":19,"sess');

  assert.deepEqual(readUsage(THE_DECK), { ctx: null, session: null, weekly: null });
});

test('a state file holding something that is not an object at all is unknown', (t) => {
  const write = aStateFile(t);
  write('19');

  assert.deepEqual(readUsage(THE_DECK), { ctx: null, session: null, weekly: null });
});

test('a reading the file does not carry is unknown, and the ones it carries still answer', (t) => {
  const write = aStateFile(t);
  // The shape the hook writes before any API response, and on the auth modes
  // that carry no rate limits at all.
  write({ ctx: null, session: null, weekly: null, decks: decksOf({ [THE_DECK]: anEntry(62) }) });

  assert.deepEqual(readUsage(THE_DECK), { ctx: { pct: 62 }, session: null, weekly: null });
});

test('a percentage that is not a number is unknown rather than read as zero', (t) => {
  const write = aStateFile(t);
  write({
    ctx: null,
    session: { pct: null, resetsAt: epoch(Date.now()) },
    weekly: {},
    decks: decksOf({ [THE_DECK]: anEntry('19') }),
  });

  assert.deepEqual(readUsage(THE_DECK), { ctx: null, session: null, weekly: null });
});

test('a reset time the deck cannot read leaves its percentage readable', (t) => {
  const write = aStateFile(t);
  write({
    ctx: null,
    // Two ways a stamp goes wrong: absent, and a number no calendar can hold —
    // the second being the one that throws if the conversion is written
    // without a guard.
    session: { pct: 47 },
    weekly: { pct: 7, resetsAt: 1e20 },
  });

  assert.deepEqual(readUsage(THE_DECK), {
    ctx: null,
    session: { pct: 47, resetsAt: null },
    weekly: { pct: 7, resetsAt: null },
  });
});

// --- whose `ctx` it is (spec 31, L31, L33, A11) ------------------------------

test('a deck is answered its own session’s reading and never the last writer’s', (t) => {
  const write = aStateFile(t);
  write(aSnapshot());

  assert.deepEqual(readUsage(THE_DECK).ctx, { pct: 19 }, 'this deck’s own session');
  assert.deepEqual(readUsage(ANOTHER_DECK).ctx, { pct: 74 }, 'and the neighbour’s is its own');
});

test('a deck the map says nothing about has no reading at all, not the file’s top-level one', (t) => {
  const write = aStateFile(t);
  write(aSnapshot());

  const usage = readUsage(path.join(os.tmpdir(), 'pilot-usage-never-run'));
  assert.equal(usage.ctx, null, 'a deck whose session has never reported shows nothing');
  assert.equal(usage.session.pct, 47, 'and the account-wide readings still answer it (spec 31)');
  assert.equal(usage.weekly.pct, 7);
});

test('a page that names no deck gets no context reading, and keeps the two that are the account’s', (t) => {
  const write = aStateFile(t);
  write(aSnapshot());

  // The overview, which has no one session and so no context window to show.
  for (const nothing of [undefined, null, '', '   ']) {
    const usage = readUsage(nothing);
    assert.equal(usage.ctx, null, `\`${String(nothing)}\` names no deck`);
    assert.equal(usage.session.pct, 47, 'session and weekly stay account-wide on every page');
    assert.equal(usage.weekly.pct, 7);
  }
});

test('a snapshot written before the map existed answers nothing, rather than one deck’s number for all of them', (t) => {
  const write = aStateFile(t);
  // Exactly what the status line wrote until this slice, and what is on disk on
  // a machine whose status line has not refreshed since the upgrade.
  write({ ctx: 19, session: null, weekly: null, session_id: 'sess-a' });

  assert.equal(readUsage(THE_DECK).ctx, null, 'that figure was some session’s, and not this deck’s');
});

test('an entry past the staleness window is no reading, and one inside it still is', (t) => {
  const write = aStateFile(t);
  const stale = path.join(os.tmpdir(), 'pilot-usage-yesterday');
  const parked = path.join(os.tmpdir(), 'pilot-usage-lunch');
  write({
    ctx: null,
    session: null,
    weekly: null,
    decks: decksOf({
      [stale]: anEntry(88, 13 * HOUR_MS),
      [parked]: anEntry(33, 11 * HOUR_MS),
    }),
  });

  assert.equal(readUsage(stale).ctx, null, 'twelve hours is the window (A11), and this is past it');
  assert.deepEqual(
    readUsage(parked).ctx,
    { pct: 33 },
    'a session parked over a meeting still shows what it last read',
  );
});

test('an entry with no time on it, or a time that is not one, is no reading', (t) => {
  const write = aStateFile(t);
  write({
    ctx: null,
    session: null,
    weekly: null,
    decks: decksOf({ [THE_DECK]: { ctx: 42 }, [ANOTHER_DECK]: { ctx: 42, at: 'whenever' } }),
  });

  assert.equal(readUsage(THE_DECK).ctx, null, 'liveness is what the entry is for (L33)');
  assert.equal(readUsage(ANOTHER_DECK).ctx, null);
});

test('a map that is not a map, and an entry that is not an entry, are no reading and no throw', (t) => {
  const write = aStateFile(t);
  for (const decks of [null, 'nonsense', 7, { [repoKey(THE_DECK)]: 42 }]) {
    write({ ctx: 19, session: null, weekly: null, decks });
    assert.equal(readUsage(THE_DECK).ctx, null, `\`${JSON.stringify(decks)}\` is not evidence`);
  }
});

test('the deck is found however the path that asks for it is spelled', (t) => {
  const write = aStateFile(t);
  write(aSnapshot());

  // The three processes that write a directory — the session, the hook and the
  // user's address bar — agree on the characters and not always on the
  // separators, or on Windows the case. `repoKey` is the one spelling, and the
  // reader looks up through it rather than on the string it was handed.
  for (const spelling of [
    THE_DECK + path.sep,
    path.join(THE_DECK, 'x', '..'),
    process.platform === 'win32' ? THE_DECK.toUpperCase() : THE_DECK,
  ]) {
    assert.deepEqual(readUsage(spelling).ctx, { pct: 19 }, `\`${spelling}\` is the same deck`);
  }
});

test('with PILOT_USAGE_FILE unset, the file is the one the status line writes', (t) => {
  const previous = process.env.PILOT_USAGE_FILE;
  delete process.env.PILOT_USAGE_FILE;
  t.after(() => {
    if (previous === undefined) delete process.env.PILOT_USAGE_FILE;
    else process.env.PILOT_USAGE_FILE = previous;
  });

  assert.equal(usageFile(), path.join(os.homedir(), '.claude', 'context-usage-state.json'));
});

// --- the route --------------------------------------------------------------

/** The route as the page asks it: `?run=` is the deck the page is showing (L32). */
const usageOf = (base, deck) =>
  `${base}/api/usage${deck === undefined ? '' : `?run=${encodeURIComponent(deck)}`}`;

test('GET /api/usage answers the reading the status line last wrote', async (t) => {
  const write = aStateFile(t);
  const snapshot = aSnapshot();
  write(snapshot);
  const base = await deckOnAPort(t);

  const answer = await fetch(usageOf(base, THE_DECK));

  assert.equal(answer.status, 200);
  assert.equal(answer.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.deepEqual(await answer.json(), {
    ctx: { pct: 19 },
    session: { pct: 47, resetsAt: new Date(snapshot.session.resetsAt * 1000).toISOString() },
    weekly: { pct: 7, resetsAt: new Date(snapshot.weekly.resetsAt * 1000).toISOString() },
  });
});

test('the route answers each deck its own figure, and the overview none', async (t) => {
  const write = aStateFile(t);
  write(aSnapshot());
  const base = await deckOnAPort(t);

  const here = await (await fetch(usageOf(base, THE_DECK))).json();
  const there = await (await fetch(usageOf(base, ANOTHER_DECK))).json();
  const overview = await (await fetch(usageOf(base))).json();

  assert.deepEqual(here.ctx, { pct: 19 });
  assert.deepEqual(there.ctx, { pct: 74 }, 'two decks, two figures, one machine (spec 31)');
  assert.equal(overview.ctx, null, 'the overview has no one session to have a window');
  assert.deepEqual(
    [overview.session.pct, overview.weekly.pct],
    [47, 7],
    'and the allowance is the account’s, so it is the same on every page',
  );
  assert.equal(here.decks, undefined, 'a page that asked about one deck is told about one deck');
});

test('a state file that is not there leaves the route answering, so the page keeps working', async (t) => {
  const write = aStateFile(t);
  write(null);
  const base = await deckOnAPort(t);

  const answer = await fetch(usageOf(base, THE_DECK));

  assert.equal(
    answer.status,
    200,
    'a file the deck does not own being absent is not the deck failing',
  );
  assert.deepEqual(await answer.json(), { ctx: null, session: null, weekly: null });
});

test('the file is read again on every request and never cached across two of them', async (t) => {
  const write = aStateFile(t);
  write({ ctx: null, session: null, weekly: null, decks: decksOf({ [THE_DECK]: anEntry(19) }) });
  const base = await deckOnAPort(t);

  const first = await (await fetch(usageOf(base, THE_DECK))).json();
  write({ ctx: null, session: null, weekly: null, decks: decksOf({ [THE_DECK]: anEntry(83) }) });
  const second = await (await fetch(usageOf(base, THE_DECK))).json();

  assert.equal(first.ctx.pct, 19);
  assert.equal(
    second.ctx.pct,
    83,
    'a cached reading is a page that disagrees with the status line (D16)',
  );
});

// --- the readout on the page ------------------------------------------------

/**
 * The header, which is the part of a page no live region covers — and, usefully
 * here, the part that does not hold the page's script, so a claim
 * about the markup cannot accidentally be read off the script's own source.
 */
const headerOf = (html) => html.match(/<header>([\s\S]*?)<\/header>/)[1];

const readoutOf = (header) => (header.match(/<p class="usage"[^>]*>[\s\S]*?<\/p>/) ?? [''])[0];

/** The one live region a header holds: slice 4's strip of runs. */
const stripOf = (header) => (header.match(/<nav[^>]*data-live[^>]*>[\s\S]*?<\/nav>/) ?? [''])[0];

/** The deck token the server puts on the readout, or null where it put none (L32). */
const tokenOf = (readout) =>
  (readout.match(/<p class="usage" data-run="([^"]*)"/) ?? [null, null])[1];

const A_REPO = path.join('D:', 'work', 'pilot');

/** A live run on `A_REPO`, which is what makes that repository a tab. */
const aRun = () => ({
  id: 'run_000000000001',
  repo: A_REPO,
  name: 'pilot',
  pid: process.pid,
  startedAt: new Date().toISOString(),
});

const aThread = () => ({
  id: 'itm_1',
  kind: 'question',
  title: 'a question',
  body: 'a body',
  repo: A_REPO,
  postedAt: new Date().toISOString(),
});

for (const [name, page] of [
  ['the home screen', () => renderHomePage([], [aRun()], A_REPO)],
  ['every item the deck has held', () => renderDeckPage([], [aRun()])],
  ['a thread', () => renderThreadPage(aThread(), [], [aRun()])],
]) {
  test(`${name} carries the readout, in the header and outside every region a change replaces`, () => {
    const header = headerOf(page());
    const readout = readoutOf(header);
    // `session` and not `5 h` since walkthrough #2: the user reads the status
    // line and the page together and asked for one name for the same limit.
    const labels = { ctx: 'ctx', session: 'session', weekly: 'weekly' };
    const resets = { ctx: false, session: true, weekly: true };

    for (const key of ['ctx', 'session', 'weekly']) {
      assert.ok(readout.includes(`data-usage="${key}"`), `${key} is not in the header's readout`);
      assert.ok(
        !stripOf(header).includes(`data-usage="${key}"`),
        `${key} sits inside the header's one live region, so a change would replace it (D1)`,
      );
      assert.ok(
        readout.includes(`${labels[key]} <b data-usage="${key}"`),
        `${key}'s label is not "${labels[key]}"`,
      );
      assert.equal(
        readout.includes(`data-resets="${key}"`),
        resets[key],
        `${key}'s reset line should ${resets[key] ? 'be present' : 'be absent'}`,
      );
    }
    assert.ok(
      !readout.includes('data-live'),
      'the readout is not itself a live region: the swap must not be able to reach it (D1)',
    );
    assert.ok(
      readout.includes('unknown'),
      'a page whose script has not run says it does not know, rather than a figure it never read',
    );
    assert.equal(
      tokenOf(readout),
      A_REPO,
      'and it carries the deck it is a page of, which is the one the script polls for (L32)',
    );
  });
}

// --- whose readout it is (L32) ----------------------------------------------

test('the overview carries no deck token and no context reading at all', () => {
  // Two live runs, so the deck opens on the overview rather than landing on the
  // sole one (D11 of run-tabs). The overview is every deck at once and has no
  // one session, so there is no context window it could honestly show.
  const theirs = { ...aRun(), id: 'run_000000000002', repo: path.join('D:', 'work', 'kettle') };
  const readout = readoutOf(headerOf(renderHomePage([], [aRun(), theirs], null)));

  assert.equal(tokenOf(readout), null, 'no deck, so no token');
  assert.ok(!readout.includes('data-usage="ctx"'), 'and the span goes, rather than saying unknown');
  assert.ok(readout.includes('data-usage="session"'), 'the account-wide two are still there');
  assert.ok(readout.includes('data-usage="weekly"'), 'on the overview as on every other page');
});

test('a thread whose repository no run has registered shows no context reading either', () => {
  // The same answer `tabFor` gives everywhere else: no tab, so no deck, so no
  // figure — never the machine's last one (spec 31).
  const orphan = { ...aThread(), repo: path.join('D:', 'work', 'long-gone') };
  const readout = readoutOf(headerOf(renderThreadPage(orphan, [], [aRun()])));

  assert.equal(tokenOf(readout), null);
  assert.ok(!readout.includes('data-usage="ctx"'));
});

test('a thread page carries its own deck, which its address does not name', () => {
  // L32's whole point: a thread's URL has no `?run=`, but the server has already
  // worked out which tab the thread belongs to, so the figure is not lost.
  const readout = readoutOf(headerOf(renderThreadPage(aThread(), [], [aRun()])));

  assert.equal(tokenOf(readout), A_REPO);
});

// --- the browser ------------------------------------------------------------

/**
 * One figure, in the `<span>` that holds it and its label. The span is what goes
 * away when a deck has no context reading to show (spec 31), so the harness has
 * to hold that relationship the same way `aReset` holds the `<time>`'s.
 */
const aValue = (key) => {
  const figure = { dataset: { usage: key }, textContent: 'unknown' };
  figure.parentNode = { hidden: false };
  return figure;
};

/** The readout block, carrying the deck this page is of (L32). */
const aBlock = (repo) => ({ dataset: { run: repo } });

const aTime = () => {
  const attributes = {};
  return {
    textContent: '',
    getAttribute: (name) => attributes[name] ?? null,
    setAttribute: (name, value) => {
      attributes[name] = value;
    },
  };
};

const aReset = (key) => {
  const time = aTime();
  const line = { dataset: { resets: key }, hidden: false, time, querySelector: () => time };
  // The clause is the `<time>`'s parent on a real page, and S10's minute tick
  // reads every stamp on the page, this one included — so the harness has to
  // hold that relationship or the tick cannot be tested at all.
  time.parentNode = line;
  return line;
};

/**
 * A page with the script running on it: the readout it fills, the answer the
 * deck gives it, and the timers it asks for — fired by hand here rather than
 * waited thirty seconds for.
 */
function aPage(shown = {}) {
  let { values = [], resets = [], run } = shown;
  const timers = [];
  const waiting = [];

  const document = {
    activeElement: null,
    querySelectorAll(selector) {
      if (selector === '[data-usage]') return [...values];
      if (selector === '[data-resets]') return [...resets];
      // The deck this page is of, which the server put on the readout. A page
      // with no tab — the overview — carries none, and matches nothing here.
      if (selector === '.usage[data-run]') return run === undefined ? [] : [aBlock(run)];
      // S10's tick walks every stamp on the page; the reset clauses are the
      // deck's only ones that point forwards, so they are the only ones here.
      if (selector === 'time[datetime]') return resets.map((line) => line.time);
      return [];
    },
    addEventListener() {},
  };

  const sandbox = aSandbox({
    document,
    // The timer this file is about: the poll is a `setInterval` the test fires by
    // hand rather than waiting thirty seconds for.
    setInterval: (run, ms) => {
      timers.push({ run, ms });
      return timers.length;
    },
    asked: [],
    fetch: (...args) => {
      sandbox.asked.push(args[0]);
      return new Promise((resolve, reject) => {
        waiting.push({ resolve, reject });
      });
    },
  });

  loadPage(sandbox);
  installUsage(sandbox);

  const settled = async () => {
    for (let turn = 0; turn < 3; turn += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  };

  return {
    timers,
    asked: sandbox.asked,
    /** The timer the usage poll runs on. */
    poll: () => timers.find((timer) => timer.ms === 30_000),
    /** S10's once-a-minute tick, which every page has and which reads every stamp. */
    tick: () => timers.find((timer) => timer.ms === 60_000),
    /** The deck answers the request in flight with this reading. */
    async answer(usage) {
      waiting.at(-1).resolve({ ok: true, json: () => Promise.resolve(usage) });
      await settled();
    },
    /** A page-kind swap (handoff-failed-confirm S6) put a new header, and its readout, on the page. */
    swap(next) {
      ({ values = [], resets = [], run } = next);
    },
    /** The daemon went away mid-request. */
    async refuse() {
      waiting.at(-1).reject(new Error('the deck went away'));
      await settled();
    },
  };
}

const aReading = (pct, resetsIn) => ({
  pct,
  resetsAt: new Date(Date.now() + resetsIn).toISOString(),
});

/**
 * The reading and the page each read `Date.now()`, and a reset exactly on an
 * hour boundary floors to the hour below once one millisecond falls between
 * them: so both read one pinned clock, and only wall time passes.
 */
const pinTheClock = (t) => t.mock.timers.enable({ apis: ['Date'], now: Date.now() });

/** Wall time passing between building a reading and the page rendering it, as a loaded suite makes it. */
const aBeat = () => new Promise((resolve) => setTimeout(resolve, 5));

test('the readout is filled from the API the moment the page opens, and again every 30 s', async () => {
  const ctx = aValue('ctx');
  const session = aValue('session');
  const weekly = aValue('weekly');
  const page = aPage({ values: [ctx, session, weekly] });

  assert.deepEqual(page.asked, ['/api/usage'], 'the page asks once on arrival, and asks the API (D16)');
  await page.answer({ ctx: { pct: 19 }, session: aReading(47, 2 * HOUR_MS), weekly: aReading(7, 0) });

  assert.deepEqual(
    [ctx.textContent, session.textContent, weekly.textContent],
    ['19%', '47%', '7%'],
    'the three numbers spec 11 asks for',
  );

  assert.equal(page.poll().ms, 30_000, 'polled, and not pushed: no `changed` event carries usage (D16)');
  page.poll().run();
  await page.answer({ ctx: { pct: 91 }, session: null, weekly: null });
  assert.equal(ctx.textContent, '91%', 'and the next poll patches the number');
  assert.equal(session.textContent, 'unknown', 'a reading that has gone unknown says so again');
});

test('a reset time reads as how long there is until it, and carries its stamp for the tick', async () => {
  const session = aReset('session');
  const weekly = aReset('weekly');
  const page = aPage({ values: [aValue('session')], resets: [session, weekly] });

  const usage = {
    ctx: null,
    session: aReading(47, 2 * HOUR_MS + 90_000),
    weekly: aReading(7, 3 * 24 * HOUR_MS + 90_000),
  };
  await page.answer(usage);

  assert.equal(session.hidden, false);
  assert.equal(session.time.textContent, 'in 2 hrs', 'floored, like every other reading on the page');
  assert.equal(weekly.time.textContent, 'in 3 days');
  assert.ok(
    session.time.getAttribute('datetime'),
    'the stamp is on the element, so the minute tick reads it again like any other (D11)',
  );
});

test('a reading with no reset time shows no reset line at all', async () => {
  const session = aReset('session');
  const page = aPage({ values: [aValue('session')], resets: [session] });

  await page.answer({ ctx: null, session: { pct: 47, resetsAt: null }, weekly: null });

  assert.equal(session.hidden, true, 'the word "resets" with nothing after it is worse than nothing');
});

test('a reset time already behind us shows no reset line either, and comes back when one is ahead', async (t) => {
  pinTheClock(t);
  const figure = aValue('session');
  const session = aReset('session');
  const page = aPage({ values: [figure], resets: [session] });

  await page.answer({ ctx: null, session: aReading(89, -5 * HOUR_MS), weekly: null });

  assert.equal(figure.textContent, '89%', 'the figure is still the figure: only the clause under it goes');
  assert.equal(
    session.hidden,
    true,
    '"session 89% resets 5 hrs ago" is a stale file talking, not a reading of an allowance (walkthrough #2)',
  );

  page.poll().run();
  const ahead = { ctx: null, session: aReading(89, 2 * HOUR_MS), weekly: null };
  await aBeat();
  await page.answer(ahead);

  assert.equal(session.hidden, false, 'and a stamp ahead of now brings the line back');
  assert.equal(session.time.textContent, 'in 2 hrs');
});

/**
 * The poll is not the only thing that writes these lines: S10's once-a-minute
 * tick reads every stamp on the page, and a reset stamp is the only kind that
 * can lapse while the page sits there. If the deck goes away — which leaves the
 * readings where they are on purpose — the tick is the only loop still running,
 * so the rule has to hold in it too or "resets 3 hrs ago" comes back by itself.
 */
test('the minute tick takes a lapsed reset clause away itself, without waiting for a poll', async () => {
  const session = aReset('session');
  const page = aPage({ values: [aValue('session')], resets: [session] });

  await page.answer({ ctx: null, session: aReading(89, 2 * HOUR_MS), weekly: null });
  assert.equal(session.hidden, false, 'ahead of now, so it is on the page');

  // Time passing, as the page sees it: the stamp it is holding is now behind us.
  session.time.setAttribute('datetime', new Date(Date.now() - 3 * HOUR_MS).toISOString());
  page.tick().run();

  assert.equal(session.hidden, true, 'the tick hides the clause rather than reading it out as "3 hrs ago"');
  assert.doesNotMatch(session.time.textContent, /ago/, 'and never writes the past tense into it');
});

test('a page with no readout on it asks the API for nothing', () => {
  const page = aPage();

  assert.deepEqual(page.asked, [], 'nothing to fill is nothing to ask for');
  assert.equal(page.poll(), undefined, 'and no timer to ask on');
  assert.deepEqual(
    page.timers.map((timer) => timer.ms),
    [60_000],
    "only S10's once-a-minute tick, which every page has",
  );
});

test('an answer the deck could not give leaves the last readings where they were', async () => {
  const ctx = aValue('ctx');
  ctx.textContent = '19%';
  const page = aPage({ values: [ctx] });

  await page.refuse();

  assert.equal(
    ctx.textContent,
    '19%',
    'a page that blanked itself on every failed request would say less than it knows',
  );
  assert.ok(page.poll(), 'and it keeps polling, so the next answer corrects it');
});

// --- the bands, which are the status line's own ----------------------------

/**
 * The user asked at the walkthrough of 2026-09-19 for the figures to say what
 * the status line in their terminal says: "I was more talking about the CTX and
 * WEEKLY, the same way it turns to red in my console if it reaches past 95%".
 * That reverses S11's "no colour banding on the page" — the argument there was
 * that a terminal line has no room to say the number and the page does, and the
 * user has now said they want the same signal in both.
 *
 * The thresholds are the hook's (`hooks/context-usage-statusline.js:144-147`),
 * walked here one either side of each of them.
 */
test('each figure takes its own band, on the status line\'s own thresholds', async () => {
  const ctx = aValue('ctx');
  const session = aValue('session');
  const weekly = aValue('weekly');
  const page = aPage({ values: [ctx, session, weekly] });

  // One answer per request: the poll is fired by hand between them, the way
  // every other test in this file asks for a second reading.
  let first = true;
  for (const [pct, band] of [
    [0, 'usage-fine'],
    [79, 'usage-fine'],
    [80, 'usage-warm'],
    [89, 'usage-warm'],
    [90, 'usage-high'],
    [94, 'usage-high'],
    [95, 'usage-critical'],
    [100, 'usage-critical'],
  ]) {
    if (!first) page.poll().run();
    first = false;
    await page.answer({ ctx: { pct } });
    assert.equal(ctx.className, band, `${pct}% is ${band}`);
  }
});

test('one figure over the line does not band the two beside it', async () => {
  const ctx = aValue('ctx');
  const session = aValue('session');
  const weekly = aValue('weekly');
  const page = aPage({ values: [ctx, session, weekly] });

  await page.answer({ ctx: { pct: 96 }, session: { pct: 12 }, weekly: { pct: 85 } });

  assert.equal(ctx.className, 'usage-critical', 'the context window is nearly full');
  assert.equal(session.className, 'usage-fine', 'the five-hour limit is barely touched');
  assert.equal(weekly.className, 'usage-warm', 'and the week is two thirds gone');
});

test('a reading the deck could not get carries no band at all', async () => {
  const ctx = aValue('ctx');
  const page = aPage({ values: [ctx] });

  await page.answer({ ctx: { pct: 96 } });
  page.poll().run();
  await page.answer({});

  assert.equal(ctx.textContent, 'unknown');
  assert.equal(ctx.className, '', 'an unknown reading is not a green one');
});

// --- which deck the browser asks about (spec 31, L32) ------------------------

test('the page asks for the deck the server told it it is of, and keeps asking for that one', async () => {
  const page = aPage({ values: [aValue('ctx')], run: path.join('D:', 'work', 'pilot') });
  const mine = `/api/usage?run=${encodeURIComponent(path.join('D:', 'work', 'pilot'))}`;

  assert.deepEqual(page.asked, [mine], 'the token off the block, and not the address bar (L32)');

  page.poll().run();
  await page.answer({ ctx: { pct: 19 } });
  assert.deepEqual(page.asked, [mine, mine], 'and every poll after it asks about the same deck');
});

test('a page with no deck on its readout asks the plain route, for the two account-wide readings', () => {
  const page = aPage({ values: [aValue('session'), aValue('weekly')] });

  assert.deepEqual(page.asked, ['/api/usage'], 'the overview has no deck to name');
});

test('a deck with no reading loses the figure altogether, rather than saying it is unknown', async () => {
  const ctx = aValue('ctx');
  const session = aValue('session');
  const page = aPage({ values: [ctx, session], run: path.join('D:', 'work', 'pilot') });

  await page.answer({ ctx: null, session: null, weekly: null });

  assert.equal(ctx.parentNode.hidden, true, 'a deck that has not reported shows nothing (spec 31)');
  assert.equal(
    session.parentNode.hidden,
    false,
    'the allowance is the account’s and is unknown, not absent — the two are different things',
  );
  assert.equal(session.textContent, 'unknown');
});

test('the figure comes back the moment its deck reports, and goes again if it stops', async () => {
  const ctx = aValue('ctx');
  const page = aPage({ values: [ctx], run: path.join('D:', 'work', 'pilot') });

  await page.answer({ ctx: null });
  assert.equal(ctx.parentNode.hidden, true);

  page.poll().run();
  await page.answer({ ctx: { pct: 27 } });
  assert.equal(ctx.parentNode.hidden, false, 'the session reported, so the figure is there');
  assert.equal(ctx.textContent, '27%');

  page.poll().run();
  await page.answer({ ctx: null });
  assert.equal(ctx.parentNode.hidden, true, 'and it goes away again rather than going stale');
});

test('the readout a page-kind swap puts in the header is the one the next poll fills, asked for its own deck', async () => {
  const page = aPage({ values: [aValue('session')] });
  await page.answer({ session: aReading(40, HOUR_MS) });

  const ctx = aValue('ctx');
  const session = aValue('session');
  const resets = aReset('session');
  page.swap({ values: [ctx, session], resets: [resets], run: A_REPO });
  page.poll().run();

  assert.equal(page.asked.at(-1), `/api/usage?run=${encodeURIComponent(A_REPO)}`, 'the deck the new page is of');
  await page.answer({ ctx: { pct: 12 }, session: aReading(41, HOUR_MS), weekly: null });
  assert.deepEqual([ctx.textContent, session.textContent], ['12%', '41%'], 'the figures on the page, not the ones swapped out');
  assert.equal(resets.hidden, false);
});
