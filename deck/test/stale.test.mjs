/**
 * Slice S10 of deck-usability: runs age out, and can be dismissed (spec 7).
 *
 * Three claims, and they are tested at the three levels they live at.
 *
 * Whether a run is served is a claim about the store, so it runs against a real
 * store file with a run back-dated in it — 47 hours and 49 hours either side of
 * the 48 the glossary calls stale — and against a run written before this slice
 * existed, which carries no `lastSeenAt` at all and is timed from its
 * `startedAt` instead (D12). Nothing is ever deleted to do it: a dismissed run
 * keeps its record and its items, which is what "until it posts again" rests on
 * (D13, L14).
 *
 * Where a dismiss lands is a claim about a `Location` header, so it runs against
 * a real HTTP server on an ephemeral port, including the cross-origin post the
 * trusted-origin check exists for.
 *
 * "3 min" is a claim about the browser, and half of it is a claim about the
 * *server*: no relative time is rendered there (D11), so every stamp a page
 * carries is a `<time datetime>` holding the ISO the store holds, and `time.mjs`
 * is what reads it as "3 min". That half is installed through `loadPage` the way
 * `deck/test/live.test.mjs` and `deck/test/resize.test.mjs` run it.
 *
 * Every test takes its own store directory and its own port. Nothing here may
 * touch the real store or port 4321: this machine runs a real deck.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { deckOnAPort, loadPage, tempDeck } from '../testUtils.mjs';

const { STALE_AFTER_MS } = await import('../runs.mjs');
const {
  addPilotMessage,
  addReply,
  dismissRun,
  listItems,
  listRuns,
  listStoredRuns,
  postItem,
  registerRun,
  resolveItem,
  setSlices,
} = await import('../store.mjs');
const { renderDeckPage, renderHomePage, renderThreadPage } = await import('../ui/render.mjs');

/** Two repositories, spelled the way the platform running the test spells them. */
const REPO = path.join('D:', 'work', 'pilot');
const OTHER = path.join('D:', 'work', 'kettle');

/** A pid that has certainly exited: the child is gone before `spawnSync` returns. */
const exitedPid = () => spawnSync(process.execPath, ['-e', '0']).pid;

/**
 * A second live session's pid — a child that sleeps until the test kills it. Two
 * sessions on one repository are two runs and one tab (D3), which is the case a
 * dismissal has to be careful about.
 */
const sleepingPid = (t) => {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore' });
  t.after(() => child.kill('SIGKILL'));
  return child.pid;
};

const HOUR_MS = 60 * 60 * 1000;
const hoursAgo = (hours) => new Date(Date.now() - hours * HOUR_MS).toISOString();

const aQuestion = (over = {}) => ({
  kind: 'question',
  title: 'Which port?',
  body: 'The deck wants one fixed port.',
  options: ['4321', '4317'],
  recommended: '4321',
  repo: REPO,
  ...over,
});

// --- the store, with a run back-dated in it --------------------------------

const storeIn = (dir) => path.join(dir, 'deck.json');
const readStore = (dir) => JSON.parse(fs.readFileSync(storeIn(dir), 'utf8'));
const writeStore = (dir, deck) =>
  fs.writeFileSync(storeIn(dir), `${JSON.stringify(deck, null, 2)}\n`);

/**
 * Every run in the store file, last heard from this many hours ago — the slice's
 * own verification, which is a run back-dated in the file rather than a clock the
 * test moves. `stamped: false` is a run registered before this slice existed: no
 * `lastSeenAt` at all, and its `startedAt` is the only thing there is to time it
 * from.
 */
function quietFor(dir, hours, { stamped = true } = {}) {
  const deck = readStore(dir);
  for (const run of deck.runs) {
    if (stamped) {
      run.lastSeenAt = hoursAgo(hours);
    } else {
      delete run.lastSeenAt;
      run.startedAt = hoursAgo(hours);
    }
  }
  writeStore(dir, deck);
}

const ids = (runs) => runs.map((run) => run.id);
const seenAt = (dir) => readStore(dir).runs.map((run) => run.lastSeenAt);
const justNow = (when) => Date.now() - Date.parse(when) < 60_000;

// --- 48 hours of silence (spec 7, D12) -------------------------------------

test('a run quiet for 47 h is still on the deck, and one quiet for 49 h is gone', (t) => {
  const dir = tempDeck(t);
  const run = registerRun({ repo: REPO, pid: process.pid });

  quietFor(dir, 47);
  assert.deepEqual(ids(listRuns()), [run.id], '47 h of silence is not two days');
  assert.deepEqual(ids(listStoredRuns()), [run.id], 'and the page reads the same answer');

  quietFor(dir, 49);
  assert.deepEqual(listRuns(), [], 'a run quiet for two days is not served');
  assert.deepEqual(listStoredRuns(), [], 'not to the API, and not to the page either');
  assert.equal(readStore(dir).runs.length, 1, 'and nothing was deleted to do it (L14)');
});

test('the bound is 48 hours, once, where the glossary says it is', () => {
  assert.equal(STALE_AFTER_MS, 48 * HOUR_MS);
});

test('a run stored before this slice has no lastSeenAt and is timed from startedAt', (t) => {
  const dir = tempDeck(t);
  const run = registerRun({ repo: REPO, pid: process.pid });

  quietFor(dir, 47, { stamped: false });
  assert.equal(readStore(dir).runs[0].lastSeenAt, undefined, 'the field is genuinely absent');
  assert.deepEqual(ids(listStoredRuns()), [run.id], 'so a 0.3.0 store still renders');

  quietFor(dir, 49, { stamped: false });
  assert.deepEqual(listStoredRuns(), [], 'and it ages out on the same 48 hours');
});

test('registering stamps the run as seen now, so a session that just started is never stale', (t) => {
  const dir = tempDeck(t);
  const run = registerRun({ repo: REPO, pid: process.pid });

  assert.match(run.lastSeenAt, /^\d{4}-\d\d-\d\dT/, 'the run carries the field it is judged on');
  assert.ok(justNow(run.lastSeenAt), 'stamped at registration (D12)');
  assert.deepEqual(seenAt(dir), [run.lastSeenAt], 'and it is what the file holds');
});

test('a post, a status table, a pilot message and a resolution each touch the run', (t) => {
  const dir = tempDeck(t);
  const run = registerRun({ repo: REPO, pid: process.pid });
  const item = postItem(aQuestion());

  const writes = {
    'deck_post': () => postItem(aQuestion({ title: 'And the port after that?' })),
    'deck_status': () => setSlices(run.id, [{ slice: '10 stale runs', state: 'doing' }]),
    'deck_reply': () => addPilotMessage(item.id, 'the daemon picks it'),
    'deck_resolve': () => resolveItem(item.id, 'we went with 4321'),
  };

  for (const [tool, write] of Object.entries(writes)) {
    quietFor(dir, 49);
    assert.deepEqual(listStoredRuns(), [], `the run has aged out before ${tool}`);

    write();

    assert.ok(justNow(seenAt(dir)[0]), `${tool} is a write from the repo, so it is activity (D12)`);
    assert.deepEqual(ids(listStoredRuns()), [run.id], `so ${tool} puts the run back on the deck`);
  }
});

test("the user's own reply is not a write from the repo and does not keep a run alive", (t) => {
  const dir = tempDeck(t);
  registerRun({ repo: REPO, pid: process.pid });
  const item = postItem(aQuestion());
  quietFor(dir, 49);

  addReply(item.id, '4321');

  assert.deepEqual(listStoredRuns(), [], 'answering is the human, not the session (D12)');
});

test('a write in one repository does not keep another repository\u2019s run alive', (t) => {
  const dir = tempDeck(t);
  const mine = registerRun({ repo: REPO, pid: process.pid });
  const theirs = registerRun({ repo: OTHER, pid: process.pid });
  quietFor(dir, 49);

  postItem(aQuestion({ repo: OTHER }));

  assert.deepEqual(ids(listStoredRuns()), [theirs.id], 'only the repository that spoke is back');
  assert.ok(!ids(listStoredRuns()).includes(mine.id), 'the quiet one stays off the deck');
});

test('the pid check stays: a run seen a second ago whose session has gone is not live', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: REPO, pid: exitedPid() });

  assert.ok(justNow(run.lastSeenAt), 'it was seen at registration');
  assert.deepEqual(listRuns(), [], 'and its session is gone, which is the older rule');
  assert.deepEqual(ids(listStoredRuns()), [run.id], 'the record is still there for its tab (A2)');
});

// --- dismissing by hand (spec 7, D13) --------------------------------------

test('a dismissed run is off the deck, and nothing of it has been deleted', (t) => {
  const dir = tempDeck(t);
  const run = registerRun({ repo: REPO, pid: process.pid });
  const item = postItem(aQuestion());

  dismissRun(run.id);

  assert.deepEqual(listRuns(), [], 'the run is not served');
  assert.deepEqual(listStoredRuns(), [], 'to the page either');
  const stored = readStore(dir);
  assert.equal(stored.runs.length, 1, 'the record is still in the file (D13)');
  assert.match(stored.runs[0].dismissedAt, /^\d{4}-\d\d-\d\dT/, 'with the moment it was dismissed');
  assert.deepEqual(
    listItems().filter((held) => held.kind !== 'chat').map((held) => held.id),
    [item.id],
    'and its items are kept for ever (L14)',
  );
});

test('a dismissed run is back on the deck the moment it posts again', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: REPO, pid: process.pid });
  dismissRun(run.id);

  postItem(aQuestion({ title: 'Still here' }));

  assert.deepEqual(ids(listRuns()), [run.id], 'the run speaks, so it is back (D13)');
  assert.equal(listStoredRuns()[0].dismissedAt, undefined, 'and is no longer dismissed');
});

test('dismissing one of two sessions on one repository is not undone by the other', (t) => {
  tempDeck(t);
  const mine = registerRun({ repo: REPO, pid: process.pid });
  const theirs = registerRun({ repo: REPO, pid: sleepingPid(t) });

  dismissRun(mine.id);
  // The other session in the same repository goes on working: an item, a
  // push-back, a resolution, a table of its own. None of that is the dismissed
  // run speaking, and an item carries a repository and no run id (D3), so a
  // write that could have come from either leaves the dismissal standing.
  const item = postItem(aQuestion());
  addPilotMessage(item.id, 'still here');
  resolveItem(item.id, 'we went with 4321');
  setSlices(theirs.id, [{ slice: '10 stale runs', state: 'doing' }]);

  assert.deepEqual(ids(listRuns()), [theirs.id], 'the run the user dismissed is still off the deck');
});

test('a dismissed run comes back when its own session posts a status table', (t) => {
  tempDeck(t);
  const mine = registerRun({ repo: REPO, pid: process.pid });
  const theirs = registerRun({ repo: REPO, pid: sleepingPid(t) });
  dismissRun(mine.id);

  setSlices(mine.id, [{ slice: '10 stale runs', state: 'doing' }]);

  assert.deepEqual(
    ids(listRuns()),
    [mine.id, theirs.id],
    'a table names its own run, so the deck knows which session spoke',
  );
});

test('a lastSeenAt this deck cannot read leaves the run to the pid check', (t) => {
  const dir = tempDeck(t);
  const run = registerRun({ repo: REPO, pid: process.pid });

  // `1` is the one that needs the guard rather than NaN: `Date.parse` reads it as
  // the year 2001, so a number left in that field by hand would age a live run off
  // the deck on the strength of a stamp the deck never wrote.
  for (const unreadable of ['last Tuesday', null, 0, 1, { at: 'now' }]) {
    const deck = readStore(dir);
    deck.runs[0].lastSeenAt = unreadable;
    writeStore(dir, deck);

    assert.deepEqual(
      ids(listStoredRuns()),
      [run.id],
      `a ${JSON.stringify(unreadable)} stamp is not two days of silence`,
    );
  }
});

test('a dismissed run is back when its next session registers', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: REPO, pid: process.pid });
  dismissRun(run.id);

  const again = registerRun({ repo: REPO, pid: process.pid });

  assert.deepEqual(ids(listRuns()), [again.id], 'the new session is a run of its own');
  assert.notEqual(again.id, run.id);
});

test('dismissing names a run the deck holds, and says so when it does not', (t) => {
  tempDeck(t);
  registerRun({ repo: REPO, pid: process.pid });

  assert.throws(() => dismissRun('run_nothere'), /no run run_nothere/);
  assert.throws(() => dismissRun(''), /dismiss/);
  assert.throws(() => dismissRun(undefined), /dismiss/);
  assert.equal(listRuns().length, 1, 'and none of that took the run off the deck');
});

// --- A2 wins: an ended run keeps its tab while it has open items -----------

test('an ended run with an open item keeps its tab even once it has aged out', (t) => {
  const dir = tempDeck(t);
  const run = registerRun({ repo: REPO, pid: exitedPid() });
  setSlices(run.id, [{ slice: '10 stale runs', state: 'doing' }], 'deck-usability');
  postItem(aQuestion());
  quietFor(dir, 49);

  const page = renderHomePage(listItems(), listStoredRuns(), REPO);

  assert.ok(page.includes(`/?run=${encodeURIComponent(REPO)}`), 'the tab is still on the strip');
  assert.ok(page.includes('Which port?'), 'and the question on it is still answerable');
  assert.ok(page.includes('ended'), 'marked ended, which is what A2 asks for');
});

test('an ended run that is not stale keeps its name and its table as well (A2)', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: REPO, pid: exitedPid() });
  setSlices(run.id, [{ slice: '10 stale runs', state: 'doing' }], 'deck-usability');
  postItem(aQuestion());

  const page = renderHomePage(listItems(), listStoredRuns(), REPO);

  assert.ok(page.includes('deck-usability'), 'the name the pilot gave the run');
  assert.ok(page.includes('10 stale runs'), 'and the table it posted');
});

// --- the dismiss control, and the route behind it --------------------------

test('the list of runs on /items carries the dismiss form, and no status panel does', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: REPO, pid: process.pid });
  setSlices(run.id, [{ slice: '10 stale runs', state: 'doing' }]);
  postItem(aQuestion());

  const home = renderHomePage(listItems(), listStoredRuns(), REPO);
  const items = renderDeckPage(listItems(), listRuns());

  // The row is `renderRuns`'s own output — isolated to that <section>, not the
  // page as a whole, so a blanked row template cannot pass on the status
  // panel's dismiss form instead (render.mjs:358-369 vs :421-442).
  const runsSection = items.match(/<section class="runs">[\s\S]*?<\/section>/)?.[0];
  assert.ok(runsSection, '/items lists the runs');
  const row = runsSection.match(/<li[^>]*>[\s\S]*?<\/li>/)?.[0];
  assert.ok(row, 'the run has its own row');
  assert.ok(row.includes('class="who"'), "the row carries the run's own since-marker");
  assert.ok(row.includes('action="/dismiss"'), 'the row itself offers the control');
  assert.ok(row.includes(`name="id" value="${run.id}"`), 'the row names the run');

  // And the panel the rows are read in carries none of it, on either page that
  // draws one: spec 8, "Wiping a run's data is not a button in the Status
  // panel". The row above is the whole of where it does live (L10).
  const panels = {
    'the home page': home.match(/<section class="run-status">[\s\S]*?<\/section>/)?.[0],
    '/items': items.match(/<section class="run-status">[\s\S]*?<\/section>/)?.[0],
  };
  for (const [where, panel] of Object.entries(panels)) {
    assert.ok(panel, `${where} draws the status panel`);
    assert.ok(panel.includes('10 stale runs'), `${where}'s status panel draws the run's rows`);
    assert.ok(!panel.includes('action="/dismiss"'), `${where}'s status panel offers no dismissal`);
  }
});

const postDismiss = (base, body, headers = {}) =>
  fetch(`${base}/dismiss`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body,
    redirect: 'manual',
  });

test('dismissing from the page answers 303 to the deck, and the run is gone from it', async (t) => {
  const base = await deckOnAPort(t);
  const run = registerRun({ repo: REPO, pid: process.pid });

  const response = await postDismiss(base, new URLSearchParams({ id: run.id }), { origin: base });

  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/', 'back to the deck, which no longer has it');
  assert.deepEqual(listRuns(), [], 'and the run is off the deck');
});

test('a dismissed run with a live pid is absent from /api/runs and present in ?live=1', async (t) => {
  const base = await deckOnAPort(t);
  const run = registerRun({ repo: REPO, pid: process.pid });
  dismissRun(run.id);

  const plain = await (await fetch(`${base}/api/runs`)).json();
  const live = await (await fetch(`${base}/api/runs?live=1`)).json();

  assert.deepEqual(ids(plain.runs), [], 'the page stops showing a dismissed run');
  assert.deepEqual(
    ids(live.runs),
    [run.id],
    "a hook still finds the session's repo on the deck, because dismissing it did not end it",
  );
});

test('a dismiss posted from another page in the browser is refused', async (t) => {
  const base = await deckOnAPort(t);
  const run = registerRun({ repo: REPO, pid: process.pid });

  const response = await postDismiss(base, new URLSearchParams({ id: run.id }), {
    origin: 'http://evil.example',
  });

  assert.equal(response.status, 403, 'the same guard /reply is behind (D13)');
  assert.deepEqual(ids(listRuns()), [run.id], 'and the run is still on the deck');
});

test('a dismiss naming no run is a refusal and not a 500', async (t) => {
  const base = await deckOnAPort(t);
  const run = registerRun({ repo: REPO, pid: process.pid });

  for (const body of [new URLSearchParams(), new URLSearchParams({ id: 'run_nothere' })]) {
    const response = await postDismiss(base, body);
    assert.equal(response.status, 400, `"${body}" is a refusal`);
  }
  assert.deepEqual(ids(listRuns()), [run.id], 'and the run is untouched');
});

// --- every time on the page is a stamp, not a reading (D11) ----------------

/** The page with every `<time>` taken out of it: what is left must carry no stamp. */
const withoutTimes = (page) => page.replace(/<time datetime="[^"]*">[^<]*<\/time>/g, '');
const ISO_SHAPE = /\d{4}-\d\d-\d\dT\d\d:\d\d/;

test('every time the deck renders is a <time> carrying the ISO stamp, on every page', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: REPO, pid: process.pid });
  setSlices(run.id, [{ slice: '10 stale runs', state: 'doing' }]);
  const item = postItem(aQuestion());
  addReply(item.id, '4321');
  const answered = resolveItem(item.id, 'we went with 4321');

  const pages = {
    home: renderHomePage(listItems(), listStoredRuns(), REPO),
    items: renderDeckPage(listItems(), listRuns()),
    thread: renderThreadPage(answered, listItems(), listRuns()),
  };

  for (const [where, page] of Object.entries(pages)) {
    assert.doesNotMatch(
      withoutTimes(page),
      ISO_SHAPE,
      `${where} renders no stamp outside a <time> element`,
    );
    assert.doesNotMatch(page, />\s*\d+ (?:min|hr|days?|yr)\s*</, `${where} computes no reading`);
  }

  assert.ok(
    pages.home.includes(`<time datetime="${run.startedAt}">${run.startedAt}</time>`),
    'a run carries its stamp as the datetime and as the text a page with no script shows',
  );
  // The card is on `/items` rather than on the home page, because this thread is
  // closed and the home page is the open queue. It reads the newest message (L13),
  // or the closing when that came later (J4).
  const lastSaid = [answered.replies.at(-1).repliedAt, answered.resolvedAt].sort().at(-1);
  assert.ok(pages.items.includes(`<time datetime="${lastSaid}">`), 'and so does a card');
  assert.ok(
    pages.thread.includes(`<time datetime="${lastSaid}">`),
    'and the thread page that holds it',
  );
  assert.ok(
    pages.thread.includes(`<time datetime="${answered.resolvedAt}">`),
    'and the resolution of a closed thread',
  );
  assert.ok(
    pages.thread.includes(`<time datetime="${answered.replies[0].repliedAt}">`),
    'and every message in the argument',
  );
});

test('a record with no stamp on it at all still renders, because there is no migration', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: REPO, pid: process.pid });
  setSlices(run.id, [{ slice: '10 stale runs', state: 'doing' }]);
  const item = postItem(aQuestion());
  // A deck.json a hand or an older version left without the stamps this page
  // renders. Nothing rewrites the file to add them (there is no migration in
  // this feature), so a page that threw on one would be a page nobody could get
  // back to.
  const dir = process.env.PILOT_DECK_DIR;
  const deck = readStore(dir);
  delete deck.runs[0].startedAt;
  delete deck.items[0].postedAt;
  deck.runs[0].lastSeenAt = hoursAgo(1);
  writeStore(dir, deck);

  const page = renderHomePage(listItems(), listStoredRuns(), REPO);

  assert.ok(page.includes(item.title), 'the card is on the page');
  assert.ok(page.includes('<time datetime=""></time>'), 'and the stamp it has not got is empty');
  // The script is inlined into every page and has the word in it twice, so this
  // is the markup around it: a missing field must never reach the page as text.
  const markup = page.replace(/<script>[\s\S]*?<\/script>/g, '');
  assert.doesNotMatch(markup, /undefined/, 'never the word undefined');
});

// --- `time.mjs` reads them as "3 min" -------------------------------------

const aTime = (datetime) => ({
  datetime,
  textContent: datetime,
  getAttribute(name) {
    return name === 'datetime' ? this.datetime : null;
  },
});

/** An `<aside class="strip">` the way `strips.html` renders one: it can be hidden. */
const anAside = () => ({ hidden: false });

const aRegion = (live, { inside = null, html = `<p>${live} old</p>` } = {}) => ({
  dataset: { live },
  innerHTML: html,
  querySelectorAll: () => [],
  contains: () => false,
  closest: (selector) => (selector === 'aside.strip' ? inside : null),
});

/**
 * A page with its script running on it: the stamps it reads, the regions it
 * swaps, and the interval it ticks on — fired by hand here rather than waited a
 * minute for.
 */
function aPage({ times = [], regions = [] } = {}) {
  const ticks = [];
  const waiting = [];

  const document = {
    activeElement: null,
    querySelectorAll(selector) {
      if (selector === 'time[datetime]') return times;
      if (selector === '[data-live]') return regions;
      return [];
    },
    // The EVERYTHING toggle, synced from the page a swap fetched; no page here
    // carries one, and a page without one is left alone.
    querySelector: () => null,
    addEventListener() {},
  };

  const sandbox = {
    document,
    location: { href: 'http://127.0.0.1:4393/' },
    // The window's own: the script moves the address when a tab is picked, and
    // listens for Back. Neither is this file's subject.
    addEventListener: () => {},
    history: { pushState() {} },
    setTimeout: (run) => setTimeout(run, 0),
    setInterval: (run, ms) => {
      ticks.push({ run, ms });
      return ticks.length;
    },
    fetch: () =>
      new Promise((resolve) => {
        waiting.push((fresh) => resolve({ ok: true, text: () => Promise.resolve(fresh) }));
      }),
    DOMParser: function DOMParser() {
      this.parseFromString = (body) => ({
        querySelectorAll: (selector) =>
          selector === '[data-live]'
            ? JSON.parse(body).map((live) => aRegion(live, { html: `<p>${live} fresh</p>` }))
            : [],
        querySelector: () => null,
      });
    },
    EventSource: function EventSource() {
      this.addEventListener = (type, handler) => {
        sandbox.changed = handler;
      };
    },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    // A `vm` context is ECMAScript and nothing else, so a browser global the
    // script uses has to be handed in even when the real one is right there:
    // the script reads which deck the address names before it does anything
    // else (deck-workspace spec 5).
    URLSearchParams,
  };

  loadPage(sandbox);

  return {
    ticks,
    /** The daemon says something moved, and the deck answers with these regions. */
    async swap(live) {
      sandbox.changed({});
      waiting.at(-1)(JSON.stringify(live));
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

test('the script reads every stamp as a relative time, and keeps it moving', () => {
  const now = Date.now();
  const stamps = {
    seconds: aTime(new Date(now - 20_000).toISOString()),
    // Deliberately not a whole number of minutes: a reading is floored, never
    // rounded up, and nothing shows that on an exact multiple.
    minutes: aTime(new Date(now - 3 * 60_000 - 20_000).toISOString()),
    anHour: aTime(new Date(now - 61 * 60_000).toISOString()),
    aDay: aTime(new Date(now - 25 * HOUR_MS).toISOString()),
    days: aTime(new Date(now - 3 * 24 * HOUR_MS).toISOString()),
    years: aTime(new Date(now - 400 * 24 * HOUR_MS).toISOString()),
  };
  const page = aPage({ times: Object.values(stamps) });

  assert.deepEqual(
    Object.fromEntries(Object.entries(stamps).map(([name, stamp]) => [name, stamp.textContent])),
    {
      seconds: 'now',
      minutes: '3 mins ago',
      anHour: '1 hr ago',
      aDay: '1 day ago',
      days: '3 days ago',
      years: '1 yr ago',
    },
    // "ago", and the unit pluralised, at the user's asking on walkthrough #2:
    // a bare "6 mins" beside a title reads as easily as how long something took
    // as how long ago it was. "now" stays "now".
    'the words spec 7 asks for, computed in the browser and nowhere else (D11)',
  );

  assert.equal(page.ticks.length, 1, 'one interval for the page, not one per stamp');
  assert.equal(page.ticks[0].ms, 60_000, 'a minute, which is the smallest thing it says');

  stamps.minutes.datetime = new Date(now - 42 * 60_000).toISOString();
  page.ticks[0].run();
  assert.equal(stamps.minutes.textContent, '42 mins ago', 'and the tick reads them again');
});

test('a stamp this browser cannot read is left as the server wrote it', () => {
  const unreadable = aTime('one day last week');

  aPage({ times: [unreadable] });

  assert.equal(unreadable.textContent, 'one day last week');
});

test('a stamp swapped in by a change is read as a relative time too', async () => {
  const stamp = aTime(new Date(Date.now() - 5 * 60_000).toISOString());
  const page = aPage({ times: [stamp], regions: [aRegion('queue')] });
  // The swap puts the server's ISO text back inside the region, which is what
  // this stands in for: the reading has to be taken again after one.
  stamp.textContent = stamp.datetime;

  await page.swap(['queue']);

  assert.equal(stamp.textContent, '5 mins ago');
});

// --- the panels, which every page state now draws --------------------------

/**
 * The script used to hide a bookmark whose region a fresh page had stopped
 * drawing — dismissing the run you were on took the tree and the table off the
 * screen with it, which is exactly what the user objected to at the walkthrough
 * of 2026-09-19: "the 'tree' and 'status' tabs disappeared. They should always
 * be visible."
 *
 * Every page the deck serves draws both of them now (`render.mjs`'s
 * `renderStrips`, and `tabs.test.mjs` for what each page state puts in them),
 * so there is no such fresh page and the hiding went with the reason for it.
 * What is left is the rule that was always underneath: a region a page does not
 * carry is left exactly where it is, showing what the deck last said, because
 * showing less than the deck knows is worse than showing it late.
 */
test('a region a fresh page does not carry is left alone, never emptied or hidden', async () => {
  const strip = anAside();
  const queue = aRegion('queue');
  const table = aRegion('table', { inside: strip });
  const page = aPage({ regions: [queue, table] });

  await page.swap(['queue']);

  assert.equal(strip.hidden, false, 'the bookmarks do not come and go under the user');
  assert.equal(table.innerHTML, '<p>table old</p>', 'and the rows stay where they are');
  assert.equal(queue.innerHTML, '<p>queue fresh</p>', 'while the rest of the page swaps as usual');
});

test('an answer with no live region in it at all moves nothing', async () => {
  const strip = anAside();
  const table = aRegion('table', { inside: strip });
  const page = aPage({ regions: [table] });

  // A refusal, or the daemon's own error page: the deck has not stopped drawing
  // the table, it has failed to answer.
  await page.swap([]);

  assert.equal(strip.hidden, false, 'nothing about a non-page moves the page');
  assert.equal(table.innerHTML, '<p>table old</p>');
});
