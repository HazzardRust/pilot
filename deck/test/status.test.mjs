/**
 * Slice 4: the deck's home screen is the status table the user sketched.
 *
 * Three shapes of test again, for the three things the slice claims. What a
 * slice row is and where `Yours` comes from are unit tests against
 * `deck/status.mjs`, which touches no disk and no socket: the derivation is the
 * whole point of the slice, and it has to be provable without a browser. The
 * page is a test against the renderer, because "one row per slice" is a claim
 * about bytes. And the round trip — the pilot calls `deck_status`, the user's
 * home screen shows it, clicking `Yours` reaches the thread — runs over a real
 * HTTP server, because that is where the user actually is.
 *
 * Every test takes its own store directory and its own port. Nothing here may
 * touch the real store or port 4321: this machine runs a real deck.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { deckOnAPort, tempDeck } from '../testUtils.mjs';

const {
  MAX_SLICES,
  MAX_SLICE_CHARS,
  MAX_STATE_CHARS,
  SliceRefusal,
  newSliceTable,
  phaseOf,
  queueOf,
  yoursFor,
  yoursIndex,
} = await import('../status.mjs');

const {
  DeckRefusal,
  listItems,
  listRuns,
  postItem,
  registerRun,
  resolveItem,
  setSlices,
} = await import('../store.mjs');

const { MAX_FEATURE_CHARS } = await import('../runs.mjs');

const { renderDeckPage, renderHomePage, renderTemplate, renderThreadPage } = await import(
  '../ui/render.mjs'
);

const sleep = (ms, value = undefined, options) =>
  new Promise((resolve) => setTimeout(resolve, ms, value).unref?.() ?? options);

/** The next server-sent event, or a failure that says what nobody announced. */
async function nextEvent(reader, what) {
  const read = reader.read().then(({ value }) => new TextDecoder().decode(value));
  const event = await Promise.race([read, sleep(5000, null)]);
  assert.ok(event !== null, `no event arrived within 5s after ${what}`);
  return event;
}

const AT = '2026-09-14T10:00:00.000Z';

/**
 * Two repositories on one deck, which is the ordinary case: L3 says several runs
 * share one machine's deck, and "4 status table" is the same four words in every
 * one of them.
 */
const MINE = path.join('D:', 'work', 'pilot');
const THEIRS = path.join('D:', 'work', 'kettle');

/** An item as the store writes one, without having to write one. */
const anItem = (over = {}) => ({
  id: 'itm_000000000001',
  kind: 'signoff',
  title: 'Merge it',
  body: 'The walkthrough passed. Merge?',
  slice: '4 status table',
  repo: MINE,
  postedAt: AT,
  replies: [],
  ...over,
});

/** A run as `registerRun` stores one, with a table on it. */
const aRun = (over = {}) => ({
  id: 'run_000000000001',
  repo: MINE,
  name: 'pilot',
  pid: process.pid,
  startedAt: AT,
  slices: [{ slice: '4 status table', state: 'PR #7 at 91cbb89, draft' }],
  ...over,
});

/** `yoursFor` over a one-off index, which is how the page asks the question. */
const yoursOn = (run, slice, items) => yoursFor(run, { slice }, yoursIndex(items));

// --- a template's slots are filled in a fixed order (render.mjs:51-64) -----

/**
 * `renderTemplate`'s own docblock states that CSS and JS are filled before a
 * caller's slots for exactly this reason: a slot name that turned up in text
 * the user typed would otherwise be read as an instruction to expand on a
 * second pass. Nothing before this pinned it — a caller's value is filled in
 * with the same `split`/`join` `renderTemplate` uses for CSS and JS, and nothing
 * stops it from being scanned a second time unless the fill order itself does.
 */
test("a caller's slot value is never re-scanned for the CSS or JS slot it happens to spell (render.mjs:58-64)", () => {
  const page = renderTemplate('thread.html', {
    TITLE: 'plain',
    ID: 'itm_1',
    KIND: 'a user typed this: <!--JS-->',
    THREAD: '',
    REPLY: '',
  });

  assert.match(
    page,
    /a user typed this: <!--JS-->/,
    "text spelling the JS slot's own marker is left as text, not expanded a second time",
  );
});

// --- what a slice table is -------------------------------------------------

test('a slice row is the slice and the state the pilot typed, and nothing more', () => {
  const table = newSliceTable([
    { slice: '3 threads', state: 'merged' },
    { slice: '4 status table', state: 'PR #7 at 91cbb89, draft' },
  ]);

  assert.deepEqual(table, [
    { slice: '3 threads', state: 'merged' },
    { slice: '4 status table', state: 'PR #7 at 91cbb89, draft' },
  ]);
});

test('a row with no state at all is a slice nobody has started, not a refusal', () => {
  assert.deepEqual(newSliceTable([{ slice: '5 the hook' }]), [{ slice: '5 the hook', state: '' }]);
});

test('an empty table is how a run clears its own rows', () => {
  assert.deepEqual(newSliceTable([]), []);
});

test('a Yours the pilot tried to type is refused: that column is rendered', () => {
  assert.throws(
    () => newSliceTable([{ slice: '4 status table', state: 'draft', yours: 'Verdict' }]),
    (err) => err instanceof SliceRefusal && /renders that column/.test(err.message),
  );
});

test('a row without a slice is refused, because a row is a slice', () => {
  assert.throws(() => newSliceTable([{ state: 'draft' }]), SliceRefusal);
  assert.throws(() => newSliceTable([{ slice: '   ', state: 'draft' }]), SliceRefusal);
});

test('the same slice named twice is refused rather than rendered twice', () => {
  assert.throws(
    () => newSliceTable([{ slice: '4 status table' }, { slice: '4 Status Table' }]),
    (err) => err instanceof SliceRefusal && /twice/.test(err.message),
  );
});

test('a table longer than the deck shows, or a cell longer than a cell, is refused', () => {
  const many = Array.from({ length: MAX_SLICES + 1 }, (_, index) => ({ slice: `slice ${index}` }));
  assert.throws(() => newSliceTable(many), SliceRefusal);
  assert.throws(() => newSliceTable([{ slice: 'x'.repeat(MAX_SLICE_CHARS + 1) }]), SliceRefusal);
  assert.throws(
    () => newSliceTable([{ slice: '4', state: 'x'.repeat(MAX_STATE_CHARS + 1) }]),
    SliceRefusal,
  );
});

test('exactly at each bound is a table, not a refusal', () => {
  // The refusals above prove one past each bound. A bound nobody tests from
  // below is a bound that could be off by one and nothing would say so.
  const most = Array.from({ length: MAX_SLICES }, (_, index) => ({ slice: `slice ${index}` }));

  assert.equal(newSliceTable(most).length, MAX_SLICES);
  assert.deepEqual(newSliceTable([{ slice: 'x'.repeat(MAX_SLICE_CHARS) }]), [
    { slice: 'x'.repeat(MAX_SLICE_CHARS), state: '' },
  ]);
  assert.deepEqual(newSliceTable([{ slice: '4', state: 'x'.repeat(MAX_STATE_CHARS) }]), [
    { slice: '4', state: 'x'.repeat(MAX_STATE_CHARS) },
  ]);
});

test('a table that is not a list of rows is refused', () => {
  assert.throws(() => newSliceTable('4 status table'), SliceRefusal);
  assert.throws(() => newSliceTable([['4 status table']]), SliceRefusal);
  assert.throws(() => newSliceTable(undefined), SliceRefusal);
});

// --- where Yours comes from ------------------------------------------------

test("Yours is the slice's open item, and nothing once the pilot closes it", () => {
  const item = anItem();

  assert.equal(yoursOn(aRun(), '4 status table', [item])?.id, item.id);
  assert.equal(
    yoursOn(aRun(), '4 status table', [{ ...item, resolvedAt: AT, resolution: 'merged' }]),
    null,
    "a closed thread is nobody's next action",
  );
});

test('an item of a kind the deck does not know is never Yours, whatever slice it names (A11)', () => {
  const unknown = anItem({ kind: 'note', title: 'the implementer stashed at 40%' });

  assert.equal(yoursOn(aRun(), '4 status table', [unknown]), null);
});

test('an item attached to no slice belongs to no row', () => {
  const loose = anItem({ slice: undefined, title: 'Which port?', kind: 'question' });

  assert.equal(yoursOn(aRun(), '4 status table', [loose]), null);
});

test('a slice is matched however the pilot spaced or capitalised it', () => {
  const item = anItem({ slice: '  4 Status Table  ' });

  assert.equal(yoursOn(aRun(), '4 status table', [item])?.id, item.id);
});

test('the newest open item on a slice is the one Yours names', () => {
  const older = anItem({ id: 'itm_older', title: 'Which port?', kind: 'question' });
  const newer = anItem({ id: 'itm_newer', title: 'Merge it' });

  assert.equal(yoursOn(aRun(), '4 status table', [older, newer])?.id, 'itm_newer');
});

test("the page's Yours is the newest posting too, whatever order the queue draws them in", () => {
  // The queue is newest message first (L13), so it lists `newer` above `older`;
  // the Yours join reads the store's order, where the last one posted wins.
  const older = anItem({ id: 'itm_older', title: 'Which port?', kind: 'question' });
  const newer = anItem({ id: 'itm_newer', title: 'Merge it', postedAt: '2026-09-14T11:00:00.000Z' });

  assert.match(renderHomePage([older, newer], [aRun()]), /<td class="yours"><a href="\/thread\/itm_newer"/);
});

test("one repository's open item is never another repository's Yours", () => {
  // A slice name is the same words wherever it is used: two features cut into
  // "4 status table" are two different pieces of work, and a sign-off posted
  // from one repository must not appear as the user's next action on the other.
  const mine = anItem();
  const theirs = aRun({ id: 'run_000000000002', repo: THEIRS, name: 'kettle' });

  assert.equal(yoursOn(aRun(), '4 status table', [mine])?.id, mine.id);
  assert.equal(yoursOn(theirs, '4 status table', [mine]), null);
});

test('two sessions in one repository share the column, because items outlive runs (L14)', () => {
  // The join is on the repository and not on the run id for exactly this: a
  // second session opened on the same feature sees the same Yours, and neither
  // session going takes the item's column away from the other.
  const mine = anItem();
  const second = aRun({ id: 'run_000000000002', pid: process.pid + 1 });

  assert.equal(yoursOn(second, '4 status table', [mine])?.id, mine.id);
});

test("an item that names no repository is nobody's Yours, rather than everybody's", () => {
  const nowhere = anItem({ repo: undefined });

  assert.equal(yoursOn(aRun(), '4 status table', [nowhere]), null);
  assert.equal(yoursOn(aRun({ repo: undefined }), '4 status table', [anItem()]), null);
});

test('the queue is every open item, including one attached to no slice (L14)', () => {
  const attached = anItem();
  const loose = anItem({ id: 'itm_loose', slice: undefined, kind: 'question', title: 'Which port?' });
  const closed = anItem({ id: 'itm_closed', resolvedAt: AT, resolution: 'merged' });

  assert.deepEqual(
    queueOf([attached, loose, closed]).map((item) => item.id),
    [attached.id, loose.id],
  );
});

// --- the page --------------------------------------------------------------

test('the home screen is one row per slice, with the state the pilot typed and a way into Yours', () => {
  const page = renderHomePage([anItem()], [aRun()]);

  assert.match(page, /4 status table/, 'the Slice column');
  assert.match(page, /PR #7 at 91cbb89, draft/, "the State column, in the pilot's own words");
  assert.match(
    page,
    /<td class="yours"><a href="\/thread\/itm_000000000001"[^>]*>Merge it<\/a><\/td>/,
    "the Yours cell itself, not the queue card below it, is the way into the slice's thread",
  );
});

test('two runs from two repositories name one slice, and only one row has a Yours', () => {
  const mine = anItem({ id: 'itm_mine' });
  const theirs = aRun({ id: 'run_000000000002', repo: THEIRS, name: 'kettle' });

  // Since deck-run-tabs the two runs are two pages, so the claim is read one
  // page at a time: each table is its own run's, and the `Yours` join is repo
  // and slice, so the same four words mean this item on one page and nothing
  // on the other. The overview holds both tables in shut sections since the
  // walkthrough of 2026-09-19, so the same claim is read there as two cells in
  // the strip's order rather than as none.
  const cellsOn = (selected) =>
    [
      ...renderHomePage([mine], [aRun(), theirs], selected).matchAll(
        /<td class="yours">(.*?)<\/td>/g,
      ),
    ].map((cell) => cell[1]);

  assert.equal(cellsOn(MINE).length, 1, "one row on this run's table");
  assert.match(cellsOn(MINE)[0], /^<a href="\/thread\/itm_mine"[^>]*>Merge it<\/a>$/);
  assert.deepEqual(cellsOn(THEIRS), [''], "the other repository is not told to do this one's work");
  assert.equal(cellsOn(null).length, 2, 'the overview holds both runs, each behind its own name');
  assert.match(cellsOn(null)[0], /Merge it/, 'this run keeps its cell there too');
  assert.equal(cellsOn(null)[1], '', 'and the other one is still empty, on the same join');
});

test('a live URL in the state is a link the user can click; a javascript: one never is', () => {
  const walkthrough = aRun({
    slices: [{ slice: '4 status table', state: 'walkthrough on http://localhost:3260/jobs' }],
  });
  const nasty = aRun({
    slices: [{ slice: '4 status table', state: 'javascript:alert(1) is not a place' }],
  });

  assert.ok(
    renderHomePage([], [walkthrough]).includes('href="http://localhost:3260/jobs"'),
    'the URL in State is where the user goes to look',
  );
  assert.doesNotMatch(renderHomePage([], [nasty]), /href="javascript:/);

  // A URL pasted out of a document is still a URL whatever case it is in; the
  // link says what the pilot typed and goes where the browser reads it as.
  const shouted = aRun({ slices: [{ slice: '4', state: 'look at HTTP://LOCALHOST:3260/JOBS' }] });
  const page = renderHomePage([], [shouted]);
  assert.ok(page.includes('href="http://localhost:3260/JOBS"'));
  assert.match(page, /HTTP:\/\/LOCALHOST:3260\/JOBS<\/a>/);
});

test('a slice, a state and a run name are escaped, never rendered as HTML', () => {
  const run = aRun({
    name: '<img onerror=alert(1)>',
    slices: [{ slice: '<script>alert(2)</script>', state: '<script>alert(3)</script>' }],
  });

  const page = renderHomePage([], [run]);

  assert.doesNotMatch(page, /<img onerror/);
  assert.doesNotMatch(page, /<script>alert\(2\)<\/script>/);
  assert.doesNotMatch(page, /<script>alert\(3\)<\/script>/);
  assert.match(page, /&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
});

test('a row whose item the pilot has closed keeps its row and loses its Yours', () => {
  const closed = anItem({ resolvedAt: AT, resolution: 'merged' });

  const page = renderHomePage([closed], [aRun()]);

  assert.match(page, /4 status table/, 'the slice is still on the table');
  assert.match(page, /<td class="yours"><\/td>/, 'and its Yours is an empty cell, not a stale one');
});

test('the home screen shows what is open and links to everything the deck has ever held (L14)', () => {
  const open = anItem({ id: 'itm_open', title: 'Merge it', body: 'the open body' });
  const closed = anItem({
    id: 'itm_closed',
    title: 'Which port?',
    body: 'the closed body',
    resolvedAt: AT,
    resolution: '4321',
  });

  const page = renderHomePage([open, closed], [aRun()]);

  assert.match(page, /the open body/, 'the queue is the open items');
  assert.doesNotMatch(page, /the closed body/, 'a closed item is history, not a queue');
  // One press away rather than one click away since the walkthrough of
  // 2026-09-19: the history is the same page with the Everything toggle on,
  // not a page of its own (`everything.test.mjs`). Nothing is discarded either
  // way — that is the half of L14 this test is about.
  assert.match(
    page,
    /<a class="everything" href="[^"]*all=1"/,
    'and the history is one press away, never discarded',
  );
  assert.match(
    renderHomePage([open, closed], [aRun()], null, true),
    /the closed body/,
    'which is what pressing it shows',
  );
});

test('a deck with nothing on it says so rather than rendering an empty table', () => {
  const page = renderHomePage([], []);

  assert.match(page, /Nothing is waiting on you/);
  assert.doesNotMatch(page, /<table/);
});

// --- the two tabs and the tree in one of them ------------------------------

/**
 * What one tab's panel holds, so the tree can be read apart from the table that
 * is open beside it. The page is two `<details>` and the queue between them.
 */
const panelOf = (page, id) => page.split(`id="${id}"`)[1].split('</details>')[0];

test('a phase is the first word of the state, and a word the deck does not know is no phase', () => {
  assert.equal(phaseOf('planned'), 'planned');
  assert.equal(phaseOf('implementing'), 'doing');
  assert.equal(phaseOf('draft, walkthrough on http://localhost:3260/jobs'), 'doing');
  assert.equal(phaseOf('in review'), 'doing');
  assert.equal(phaseOf('fixing the review'), 'doing');
  assert.equal(phaseOf('Integrated'), 'done', 'the pilot capitalises what it likes');
  assert.equal(phaseOf('ready'), 'done');
  assert.equal(phaseOf('merged into feat/deck-tree'), 'done');

  assert.equal(phaseOf('blocked on CI'), null, 'the deck says nothing rather than guessing wrong');
  assert.equal(phaseOf('#21 draft'), null, 'a state that does not start with a word has no phase');
  assert.equal(phaseOf(''), null);
  assert.equal(phaseOf(undefined), null);
});

test('the page opens with the Status tab out, its table and its tree in one bookmark', () => {
  const page = renderHomePage([anItem()], [aRun()]);
  const tabs = [...page.matchAll(/<details class="tab" id="(\w+)"([^>]*)>/g)];

  assert.deepEqual(
    Object.fromEntries(tabs.map((tab) => [tab[1], tab[2].includes('open')])),
    { notifications: false, chat: true, status: true, agents: false, tickets: false, reports: false },
    'A1: the page opens on what the user called vital (three-lanes S5: the tree is in it)',
  );
  assert.match(page, /<summary>Status<\/summary>/, 'the one bookmark');
});

/**
 * Spec 5 said "the home page", and that is what was built — so clicking a
 * `Yours` link, which is the one thing the table is *for*, took the user to a
 * thread with both panels gone. They widened the line at Gate 2: "I want to
 * take this stuff with me." Every page the deck serves now carries the strip.
 */
test('the bookmarks travel onto every page the deck serves, not just the home one (spec 5)', () => {
  const run = aRun();
  const items = [anItem()];
  const bookmarksOn = (page) => [...page.matchAll(/<details class="tab" id="(\w+)"/g)].map((m) => m[1]);

  const GROUP = ['notifications', 'chat', 'status', 'agents', 'tickets', 'reports'];

  assert.deepEqual(bookmarksOn(renderHomePage(items, [run])), GROUP);
  assert.deepEqual(
    bookmarksOn(renderThreadPage(items[0], items, [run])),
    GROUP,
    'a thread is where a Yours link lands, so it is the page the panels must not vanish from',
  );
  assert.deepEqual(bookmarksOn(renderDeckPage(items, [run])), GROUP);
});

// --- the one Status tab (three-lanes S5, spec 12) ---------------------------

const { renderStrips } = await import('../ui/render-rail.mjs');
const { tabFor, tabsOf } = await import('../tabs.mjs');
const { repoKey } = await import('../runs.mjs');

/** A ticket as the store writes one, in `state`. */
const aTicket = (id, state, over = {}) => ({ id, kind: 'ticket', state, title: `ticket ${id}`, body: '', repo: MINE, postedAt: AT, replies: [], ...over });

/** MINE's tab over `runs` and `items`, its co-pilot holding `co-pilot` and `records` its stored run records (S5 A-f6). */
const tabOf = (runs, items, coPilot = null, records = []) =>
  tabFor(
    tabsOf(runs, items, {}, {}, [], {}, { coPilots: coPilot ? { [repoKey(MINE)]: coPilot } : {}, switches: {}, records: records.map((record) => ({ repo: repoKey(MINE), record })) }),
    MINE,
  );

test("the Status tab draws the implementing ticket's record", () => {
  const yellow = aTicket('itm_0000000000a1', 'yellow');
  const red = aTicket('itm_0000000000a2', 'red', { live: true });
  const items = [red, yellow];
  // One run in the directory, its table the last one posted (the red ticket's); the records are by ticket.
  const run = aRun({ id: 'run_0000000000a1', slices: [{ slice: 'S1 the red slice', state: 'planned' }] });
  const records = [
    { slug: 'yellow-run', ticket: yellow.id, slices: [{ slice: 'S1 the yellow slice', state: 'implementing' }] },
    { slug: 'red-run', ticket: red.id, slices: [{ slice: 'S1 the red slice', state: 'planned' }] },
  ];
  const tab = tabOf([run], items, yellow.id, records);

  const panel = panelOf(renderStrips(tab, [tab], items), 'status');
  assert.match(panel, /S1 the yellow slice/, "its record's slices");
  assert.doesNotMatch(panel, /S1 the red slice/, "and not the run's newer table of another ticket");
  assert.ok(panel.indexOf('<table class="slices">') > -1, 'the table');
  assert.ok(panel.indexOf('<section class="tree">') > panel.indexOf('<table class="slices">'), 'and the graph under it');
});

test('no held lane falls back to the newest run with a table', () => {
  const items = [aTicket('itm_0000000000b1', 'red'), aTicket('itm_0000000000b2', 'yellow')];
  const older = aRun({ id: 'run_0000000000b1', slices: [{ slice: 'S1 older', state: 'merged' }] });
  const newest = aRun({ id: 'run_0000000000b2', slices: [{ slice: 'S2 newest', state: 'implementing' }] });
  const tab = tabOf([older, newest], items, null, [{ slug: 'queued', ticket: 'itm_0000000000b2', slices: [{ slice: 'Q1 queued', state: 'planned' }] }]);

  assert.doesNotMatch(panelOf(renderStrips(tab, [tab], items), 'status'), /Q1 queued/, "a queued ticket is no held lane, so its record is not drawn");
  const panel = panelOf(renderStrips(tab, [tab], items), 'status');
  assert.match(panel, /S2 newest/);
  assert.doesNotMatch(panel, /S1 older/);
  assert.ok(panel.indexOf('<section class="tree">') > panel.indexOf('<table class="slices">'), 'table, then graph');
});

/**
 * S16 of deck-workspace, spec 26. The fourth bookmark is the one panel that is
 * not a scope's: the tree, the table and the agents are the deck the page is
 * showing, and this is every deck there is (L25). A question posted on another
 * repository has to reach the user while they sit inside a walkthrough thread,
 * so the list cannot be narrowed to the tab — which is why it is built from
 * `queueOf(items)`, the deck-wide queue that already exists, and not from the
 * tab's own `open`.
 *
 * Newest first, because the count over it is about what has just arrived (A10),
 * and each line says which deck it came from or the user clicks to find out.
 */
const noticesPanel = (page) =>
  /<div class="panel" data-live="notifications"[^>]*>([\s\S]*?)<\/div>\s*<\/details>/.exec(page)?.[1] ??
  null;

const noticesIn = (page) =>
  [...noticesPanel(page).matchAll(/data-thread="([^"]+)"/g)].map((m) => m[1]);

test('the Notifications panel lists the open threads of every deck, newest first (spec 26, L25)', () => {
  const mine = anItem();
  const theirs = anItem({ id: 'itm_000000000002', repo: THEIRS, title: 'Ship the kettle' });
  const items = [mine, theirs];
  const runs = [aRun(), aRun({ id: 'run_000000000002', repo: THEIRS, name: 'kettle' })];

  for (const [name, page] of [
    ['home', renderHomePage(items, runs, MINE)],
    ['items', renderDeckPage(items, runs)],
    ['thread', renderThreadPage(mine, items, runs)],
  ]) {
    assert.deepEqual(
      noticesIn(page),
      [theirs.id, mine.id],
      `the ${name} page lists both decks' threads, newest first`,
    );
    const panel = noticesPanel(page);
    assert.match(
      panel,
      new RegExp(`<a href="/thread/${theirs.id}">Ship the kettle</a>`),
      `and on ${name} each title is the link into its own thread`,
    );
    assert.match(
      panel,
      /<span class="who"> · kettle<\/span>/,
      `with the deck it came from beside it, on ${name}`,
    );
    assert.match(panel, /<button type="button" class="drop"/, `and an x to drop it, on ${name}`);
  }
});

/**
 * The count is the client's (L24), so what the server renders is a bookmark
 * with no number on it at all — not a zero, which would be the deck claiming
 * to know what this browser has looked at.
 */
test('the server renders no count on the Notifications bookmark (L24)', () => {
  const page = renderHomePage([anItem()], [aRun()]);
  // The rail as it is served, without the script and the stylesheet the page
  // inlines around it: `notifications.mjs` is what writes the count and it names the
  // attribute, so the question is what the *markup* carries.
  const rail = page.split('<aside class="strip left">')[1].split('</aside>')[0];
  const summary = /<details class="tab" id="notifications">\s*<summary>([^<]*)<\/summary>/.exec(rail);

  assert.ok(summary, 'the bookmark is a plain summary the count is written onto');
  assert.equal(summary[1], 'Notifications');
  assert.doesNotMatch(rail, /data-highlight/, 'nothing server-side knows what this browser has seen');
});

/** A panel with nothing in it is the deck saying no thread is open anywhere. */
test('the Notifications panel is empty when no thread is open on any deck', () => {
  const settled = anItem({ resolvedAt: AT, resolution: 'done' });

  assert.equal(noticesPanel(renderHomePage([settled], [aRun()])), '');
});

test('a strip carried onto another page holds the run, not an empty shell', () => {
  const items = [anItem()];
  const page = renderThreadPage(items[0], items, [aRun()]);

  assert.match(page, /<section class="tree"><span class="run"/, 'the tree came too');
  assert.match(page, /<table class="slices">/, 'and so did the table');
});

/**
 * `landingFor` picks the sole live tab and `tabFor` picks the item's own —
 * the same tab with one run live, so a fixture with only `aRun()` cannot tell
 * them apart. With two live runs `landingFor` answers null (D11) while
 * `tabFor` still finds the thread's own repository, which is the run a thread
 * page must show whatever else is live beside it.
 */
test("a thread's strip is its own item's tab, even while a second run is live too", () => {
  const mine = anItem();
  const theirs = aRun({ id: 'run_000000000002', repo: THEIRS, name: 'kettle' });

  const page = renderThreadPage(mine, [mine], [aRun(), theirs]);

  assert.match(
    page,
    /<span class="run" title="[^"]*">pilot<\/span>/,
    "the item's own run names the tree, not the overview a second live run would force",
  );
  assert.match(page, /<section class="tree"><span class="run"/, "and its own tree, not nothing");
  assert.doesNotMatch(page, />kettle</, "not the other live run's tab");
});

test('the table keeps its own markup in its tab, and the queue keeps the main column', () => {
  const page = renderHomePage([anItem()], [aRun()]);
  const main = page.split(/<main[^>]*>/)[1].split('</main>')[0];

  assert.match(main, /Merge it/, 'the queue has not moved out of the middle of the page');
  assert.doesNotMatch(main, /<table/, 'and the table has moved into its tab');
  assert.match(panelOf(page, 'status'), /<table class="slices">/);
  assert.match(panelOf(page, 'status'), /<td class="yours">/, "with every column it has today");
});

/**
 * D5's lock is on the *disclosure*: opening and closing a bookmark is the
 * `<details>` element's own doing, with no handler wired to it. Script that
 * only remembers which one was open — the strip's, since the user asked at
 * Gate 2 for that state to travel with them — is not the tabs opening
 * themselves, and D5 records it.
 */
test('opening and closing a tab is the browser\'s, not a script\'s (D5)', () => {
  const page = renderHomePage([anItem()], [aRun()]);
  const bookmarks = page.match(/<details class="tab"[^>]*>\s*<summary[^>]*>/g) ?? [];

  assert.equal(bookmarks.length, 6, 'all six bookmarks are on the page, Chat among them (S2)');
  for (const bookmark of bookmarks) {
    assert.doesNotMatch(bookmark, /\son[a-z]+=/i, 'no handler is wired to the bookmark itself');
  }
  assert.doesNotMatch(page, /onclick/i);
  assert.doesNotMatch(page, /\.open\s*=\s*!/, 'nothing toggles a tab in script');
});

// --- over HTTP, which is where the user actually is ------------------------

const callApi = (base, name, args) =>
  fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, arguments: args }),
  });

const aSession = () => registerRun({ repo: path.join('D:', 'work', 'pilot'), pid: process.pid });

test("the pilot posts a table and the user's home screen is that table", async (t) => {
  const base = await deckOnAPort(t);
  const run = aSession();

  const answer = await callApi(base, 'deck_status', {
    slug: 'a-run',
    run: run.id,
    slices: [{ slice: '4 status table', state: 'PR #7 at 91cbb89, draft' }],
  });
  const page = await (await fetch(base)).text();

  assert.equal(answer.status, 200);
  assert.match(page, /4 status table/);
  assert.match(page, /PR #7 at 91cbb89, draft/);
});

test("a second deck_status updates the rows it names and keeps the others (independence spec 22.2)", async (t) => {
  const base = await deckOnAPort(t);
  const run = aSession();

  await callApi(base, 'deck_status', { slug: 'a-run', run: run.id, slices: [{ slice: 'the old row' }] });
  await callApi(base, 'deck_status', { slug: 'a-run', run: run.id, slices: [{ slice: 'the new row' }] });
  await callApi(base, 'deck_status', { slug: 'a-run', run: run.id, slices: [{ slice: 'the old row', drop: true }] });
  const page = await (await fetch(base)).text();

  assert.doesNotMatch(page, /the old row/, 'a row leaves only when dropped');
  assert.match(page, /the new row/);
  assert.deepEqual(listRuns()[0].slices, [{ slice: 'the new row', state: '' }]);
});

test('a status for a run the deck has never heard of is refused, and nothing is written', async (t) => {
  const base = await deckOnAPort(t);
  aSession();

  const answer = await callApi(base, 'deck_status', {
    slug: 'a-run',
    run: 'run_000000000000',
    slices: [{ slice: '4 status table' }],
  });

  assert.equal(answer.status, 400);
  assert.match((await answer.json()).error, /run_000000000000/);
  assert.equal(listRuns()[0].slices, undefined, 'the run that does exist was not touched');
});

test('a table that is not one comes back as the deck\'s own 400, not a 500', async (t) => {
  // `newSliceTable` throws `SliceRefusal`; `setSlices` rewraps it as a
  // `DeckRefusal` so one path answers the client. Without the rewrap the daemon
  // would answer 500 and the pilot would read "the deck broke" rather than "you
  // sent me a column I render".
  const base = await deckOnAPort(t);
  const run = aSession();

  const typedYours = await callApi(base, 'deck_status', {
    slug: 'a-run',
    run: run.id,
    slices: [{ slice: '4', yours: 'Verdict' }],
  });
  const strangeField = await callApi(base, 'deck_status', {
    slug: 'a-run',
    run: run.id,
    slices: [{ slice: '4', owner: 'the pilot' }],
  });
  const notATable = await callApi(base, 'deck_status', { slug: 'a-run', run: run.id, slices: '4 status table' });

  assert.equal(typedYours.status, 400);
  assert.match((await typedYours.json()).error, /renders that column/);
  assert.equal(strangeField.status, 400);
  const strangeFieldError = (await strangeField.json()).error;
  assert.match(strangeFieldError, /takes no owner/);
  assert.match(strangeFieldError, /takes slice, state, after, branch, worktree and pr/);
  assert.equal(notATable.status, 400);
  assert.match((await notATable.json()).error, /list of rows/);
  assert.equal(listRuns()[0].slices, undefined, 'and none of the three wrote anything');
});

test('a state carrying a credential is refused, and nothing is stored', async (t) => {
  const base = await deckOnAPort(t);
  const run = aSession();

  const answer = await callApi(base, 'deck_status', {
    slug: 'a-run',
    run: run.id,
    slices: [
      { slice: '4 status table', state: 'deployed with sk-abcdefghijklmnopqrstuvwxyz012345' },
    ],
  });

  assert.equal(answer.status, 400);
  assert.match((await answer.json()).error, /looks like an sk- API key/);
  assert.equal(listRuns()[0].slices, undefined, 'a refused status leaves the table as it was');
  assert.ok(DeckRefusal, "and it is the deck's own refusal that carried it");
});

test('an item the pilot attached to a slice is what Yours on the home screen opens', async (t) => {
  const base = await deckOnAPort(t);
  const run = aSession();
  // `callApi` is the HTTP surface, which takes `repo` as it is sent; the stdio client
  // is what adds it for the agent (`deck/client.mjs:161`), so a fixture that posts
  // straight over HTTP has to add it itself or it posts an item belonging to no
  // repository — which is not what the pilot posts, and is not this test's subject.
  const posted = await callApi(base, 'deck_post', {
    kind: 'signoff',
    title: 'Merge it',
    body: 'The walkthrough passed. Merge?',
    slice: '4 status table',
    repo: run.repo,
  });
  await callApi(base, 'deck_status', {
    slug: 'a-run',
    run: run.id,
    slices: [{ slice: '4 status table', state: 'PR #7 at 91cbb89, draft' }],
  });

  const item = listItems().find((held) => held.kind !== 'chat');
  const page = await (await fetch(base)).text();
  const thread = await fetch(`${base}/thread/${item.id}`);

  assert.equal(posted.status, 200);
  assert.equal(item.slice, '4 status table', 'an item carries the slice it belongs to');
  assert.ok(page.includes(`/thread/${item.id}`), 'Yours is a way into the argument');
  assert.equal(thread.status, 200, 'and the thread is there when the user clicks it');

  // The route, not the renderer: `renderThreadPage`'s `items`/`runs` default to
  // empty, so a caller that forgot to pass them would serve empty panels rather
  // than fail — which is the "my panels vanished" bug all over again, one layer
  // down. This asserts the real request wires them through.
  const threadPage = await thread.text();
  assert.match(threadPage, /<section class="tree"><span class="run"/, 'the tree came with them');
  assert.match(threadPage, /<table class="slices">/, 'and so did the table');
});

test('every kind carries the slice it is about, not only the one that was asked for', async (t) => {
  // `slice` was added to all four specs at once. Only `signoff` was ever posted
  // through `deck_post` with one, so three of the four were taken on trust.
  const base = await deckOnAPort(t);

  const question = await callApi(base, 'deck_post', {
    kind: 'question',
    title: 'Which port?',
    body: '4321?',
    slice: '2 the deck daemon',
  });
  const unknown = await callApi(base, 'deck_post', {
    kind: 'handoff',
    title: 'Context is at 40%',
    body: 'Start a fresh pilot.',
    slice: '3 threads',
  });

  assert.equal(question.status, 200);
  assert.equal(unknown.status, 200);
  assert.deepEqual(
    listItems().map((item) => [item.kind, item.slice]),
    [
      ['question', '2 the deck daemon'],
      ['handoff', '3 threads'],
    ],
  );
});

test('a status table the pilot posts reloads the home screen the user is looking at', async (t) => {
  // `deck_status` is in `WRITING_TOOLS`, which is what turns a write into the
  // `changed` event the open page reloads on. Take it out of that set and the
  // table only appears on the user's next manual reload — which is the one
  // failure the user would report as "nothing happened".
  const base = await deckOnAPort(t);
  const run = aSession();

  const controller = new AbortController();
  t.after(() => controller.abort());
  const stream = await fetch(`${base}/events`, {
    headers: { accept: 'text/event-stream' },
    signal: controller.signal,
  });
  const reader = stream.body.getReader();

  const posted = await callApi(base, 'deck_status', {
    slug: 'a-run',
    run: run.id,
    slices: [{ slice: '4 status table', state: 'PR #7 at 91cbb89, draft' }],
  });

  assert.equal(posted.status, 200);
  assert.match(await nextEvent(reader, 'a deck_status over the API'), /event: changed/);
});

test('everything the deck has ever held is still one press from the home screen (L14)', async (t) => {
  const base = await deckOnAPort(t);
  const item = postItem({ kind: 'question', title: 'Which port?', body: 'the closed body' });
  resolveItem(item.id, '4321');

  const home = await (await fetch(base)).text();
  const everything = await (await fetch(`${base}/?run=&all=1`)).text();
  const history = await (await fetch(`${base}/items`)).text();

  assert.doesNotMatch(home, /the closed body/, 'the home screen is the queue');
  assert.match(home, /<a class="everything" href="[^"]*all=1"/, 'with the way to the rest on it');
  assert.match(everything, /the closed body/, 'which is the same page, showing what it settled');
  assert.match(history, /the closed body/, 'and /items is still there, holding all of it');
});

test('the stdio client tells the deck which run the table belongs to', async (t) => {
  // The agent never sees a run id: the session registered one at startup and
  // the client carries it, exactly as it carries the `since` cursor for
  // `deck_wait`. Without that, a status could only name a run the model made up.
  const base = await deckOnAPort(t);
  const previous = process.env.PILOT_DECK_PORT;
  process.env.PILOT_DECK_PORT = new URL(base).port;
  t.after(() => {
    if (previous === undefined) delete process.env.PILOT_DECK_PORT;
    else process.env.PILOT_DECK_PORT = previous;
  });
  // Through the door a tool call uses, not past it: a session that registered by hand
  // here would register again on its first tool call, and the run the call landed on
  // would not be the one this test had a handle to. The query string is what gives this
  // test a session of its own — the run, the cursor and the promise that puts a session
  // on the deck are all module state, and a module Node has already loaded is one
  // session no matter how many tests import it.
  const { callDeckTool, ensureOnTheDeck } = await import('../client.mjs?status=1');
  await ensureOnTheDeck();

  await callDeckTool('deck_status', { slug: 'a-run', slices: [{ slice: '4 status table', state: 'draft' }] });

  assert.deepEqual(listRuns()[0].slices, [{ slice: '4 status table', state: 'draft' }]);
});

test('the stdio client tells the deck which repository an item came from, and the agent cannot', async (t) => {
  // The repository is half of what Yours is joined on, and like the run id it is
  // the session's to know: the agent is never shown one and could only invent it.
  // The client spreads it last, so an invented one is overruled rather than stored.
  const base = await deckOnAPort(t);
  const previous = process.env.PILOT_DECK_PORT;
  process.env.PILOT_DECK_PORT = new URL(base).port;
  t.after(() => {
    if (previous === undefined) delete process.env.PILOT_DECK_PORT;
    else process.env.PILOT_DECK_PORT = previous;
  });
  const { callDeckTool, ensureOnTheDeck } = await import('../client.mjs?status=2');
  await ensureOnTheDeck();
  const [run] = listRuns();

  await callDeckTool('deck_post', {
    kind: 'signoff',
    title: 'Merge it',
    body: 'The walkthrough passed. Merge?',
    slice: '4 status table',
    repo: THEIRS,
  });

  const item = listItems().find((held) => held.kind !== 'chat');
  assert.equal(item.repo, run.repo, "the session's repository, not the one the agent typed");
  assert.notEqual(item.repo, THEIRS);
  assert.ok(
    renderHomePage(listItems(), listRuns()).includes(`/thread/${item.id}`),
    'and that is what makes it this run\'s Yours',
  );
});

test('a slice name longer than a cell of the table is refused on an item too', async (t) => {
  // Both sides of the join are held to one bound: a name the table would refuse
  // must not reach the deck through an item and sit there matching nothing.
  const base = await deckOnAPort(t);

  const tooLong = await callApi(base, 'deck_post', {
    kind: 'question',
    title: 'Which port?',
    body: '4321?',
    slice: 'x'.repeat(MAX_SLICE_CHARS + 1),
  });
  const atTheBound = await callApi(base, 'deck_post', {
    kind: 'question',
    title: 'Which port?',
    body: '4321?',
    slice: 'x'.repeat(MAX_SLICE_CHARS),
  });

  assert.equal(tooLong.status, 400);
  assert.match((await tooLong.json()).error, /longer than a cell/);
  assert.equal(atTheBound.status, 200, 'and exactly at the bound is a slice, not a refusal');
  assert.equal(listItems().length, 1);
});

test("setSlices is the one door slice state goes through, and it is the store's", (t) => {
  tempDeck(t);
  const run = aSession();

  setSlices(run.id, [{ slice: '4 status table', state: 'draft' }]);

  assert.deepEqual(listRuns()[0].slices, [{ slice: '4 status table', state: 'draft' }]);
  assert.throws(() => setSlices('run_000000000000', []), DeckRefusal);
});

// --- the name the pilot gives its run (slice 3, spec 4) --------------------

test('a deck_status names the run, and one that omits the name leaves it alone (A2)', (t) => {
  tempDeck(t);
  const run = aSession();

  setSlices(run.id, [{ slice: '1 strip', state: 'draft' }], '  deck-tree  ');
  const named = listRuns()[0].feature;
  setSlices(run.id, [{ slice: '2 overview', state: 'planned' }]);

  assert.equal(named, 'deck-tree', 'trimmed, as every other cell of the call is');
  assert.equal(
    listRuns()[0].feature,
    'deck-tree',
    'the pilot names the run once and posts tables many times (A2)',
  );
  assert.equal(listRuns()[0].name, 'pilot', 'and the directory name is still the one underneath');
});

test('a name that says nothing, or one too long for a tab, is refused and nothing is written', async (t) => {
  const base = await deckOnAPort(t);
  const run = aSession();

  const empty = await callApi(base, 'deck_status', {
    slug: 'a-run',
    run: run.id,
    feature: '   ',
    slices: [{ slice: '1 strip', state: 'draft' }],
  });
  const tooLong = await callApi(base, 'deck_status', {
    slug: 'a-run',
    run: run.id,
    feature: 'x'.repeat(MAX_FEATURE_CHARS + 1),
    slices: [{ slice: '1 strip', state: 'draft' }],
  });

  assert.equal(empty.status, 400);
  assert.equal(
    (await empty.json()).error,
    'feature must name what this run is building; it is what the tab reads. ' +
      'Leave it out to keep the name the run already has.',
    'said the way an empty after is refused: what it is for, and what leaving it out does',
  );
  assert.equal(tooLong.status, 400);
  assert.equal(
    (await tooLong.json()).error,
    `that feature name is longer than a tab (${MAX_FEATURE_CHARS} characters). ` +
      'The strip is read at a glance; name the feature, not what it does.',
    'refused, never truncated, and told what to do instead',
  );
  assert.equal(listRuns()[0].feature, undefined, 'a refused name leaves the run as it was');
  assert.equal(listRuns()[0].slices, undefined, 'and the table it came with is not written either');

  const atTheBound = await callApi(base, 'deck_status', {
    slug: 'a-run',
    run: run.id,
    feature: 'x'.repeat(MAX_FEATURE_CHARS),
    slices: [{ slice: '1 strip', state: 'draft' }],
  });

  assert.equal(atTheBound.status, 200, 'and exactly at the bound is a name, not a refusal');
  assert.equal(listRuns()[0].feature, 'x'.repeat(MAX_FEATURE_CHARS));
});

test('a name carrying a credential is refused with the rest of the call', async (t) => {
  const base = await deckOnAPort(t);
  const run = aSession();

  const answer = await callApi(base, 'deck_status', {
    slug: 'a-run',
    run: run.id,
    feature: 'sk-abcdefghijklmnopqrstuvwxyz012345',
    slices: [{ slice: '1 strip', state: 'draft' }],
  });

  assert.equal(answer.status, 400);
  assert.match((await answer.json()).error, /looks like an sk- API key/);
  assert.equal(listRuns()[0].feature, undefined, 'the name the deck refused is not on the run');
  assert.equal(listRuns()[0].slices, undefined, 'nor the table that came with it');
});

test('a feature that is not a string is refused, never coerced into one', async (t) => {
  // The `typeof` guard in `featureName` is the branch nothing else reaches: every
  // other test sends a string. Without this, a regression that read the field with
  // `String(feature)` would name a tab "123" or "[object Object]" and pass the suite.
  const base = await deckOnAPort(t);
  const run = aSession();
  const sent = (feature) =>
    callApi(base, 'deck_status', { slug: 'a-run', run: run.id, feature, slices: [{ slice: '1 strip' }] });

  const number = await sent(123);
  const object = await sent({ name: 'deck-tree' });
  const list = await sent(['deck-tree']);
  const nothing = await sent(null);

  for (const [what, answer] of [
    ['a number', number],
    ['an object', object],
    ['a list', list],
    ['null', nothing],
  ]) {
    assert.equal(answer.status, 400, `${what} is not a name`);
    assert.match((await answer.json()).error, /feature must be a string/);
  }
  assert.equal(listRuns()[0].feature, undefined, 'and none of the four was written');
  assert.equal(listRuns()[0].slices, undefined);
});
