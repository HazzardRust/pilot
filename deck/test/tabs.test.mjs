/**
 * Slice 1 of deck-run-tabs: a strip of tabs, and one run on screen at a time.
 *
 * The deck serves every run on the machine on one page, so an old session's
 * questions sat beside the current run's status table with nothing to tell them
 * apart. A tab is a repository (D3) and the selection lives in the URL (D1),
 * which is what makes the whole slice provable without a browser: the grouping
 * is a pure function over runs and items, and "one run on screen" is a claim
 * about which bytes are in the string the renderer returns.
 *
 * The test this slice is judged on is "one run's page carries nothing of the
 * other": the other run's item id, body and slice name are *absent* from the
 * page, not merely hidden by a stylesheet. That is why D1 rejected `:target`.
 *
 * Every test here takes its own store directory and its own port. Nothing may
 * touch the real store or port 4321: this machine runs a real deck.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { aSandbox, deckOnAPort, freePort, tempDeck } from '../testUtils.mjs';
import { install as installEscape } from '../ui/js/escape.mjs';

// A port of this file's own, never one a scratch deck might hold.
const PORT = await freePort();

const { landingFor, tabFor, tabsOf } = await import('../tabs.mjs');
const { MAX_FEATURE_CHARS, repoKey } = await import('../runs.mjs');
const { renderDeckPage, renderHomePage, renderThreadPage, OVERVIEW_HREF } = await import(
  '../ui/render.mjs'
);
const { postItem, registerRun, resolveItem, setSlices } = await import('../store.mjs');
const { TOOLS } = await import('../tools.mjs');

const deckStatus = TOOLS.find((tool) => tool.name === 'deck_status');

const AT = '2026-09-16T09:14:00.000Z';

/** Two repositories, spelled the way the platform running the test spells them. */
const MINE = path.join('D:', 'work', 'pilot');
const THEIRS = path.join('D:', 'work', 'kettle');

/** A pid that has certainly exited: the child is gone before `spawnSync` returns. */
const exitedPid = () => spawnSync(process.execPath, ['-e', '0']).pid;

/** A run as `registerRun` stores one, with a table on it. */
const aRun = (over = {}) => ({
  id: 'run_000000000001',
  repo: MINE,
  name: 'pilot',
  pid: process.pid,
  startedAt: AT,
  slices: [{ slice: '1 strip', state: 'PR #24, draft' }],
  ...over,
});

const theirRun = (over = {}) =>
  aRun({
    id: 'run_000000000002',
    repo: THEIRS,
    name: 'kettle',
    slices: [{ slice: '7 kettle boils', state: 'planned' }],
    ...over,
  });

/** An item as the store writes one, without having to write one. */
const anItem = (over = {}) => ({
  id: 'itm_000000000001',
  kind: 'signoff',
  title: 'Merge it',
  body: 'the pilot body',
  slice: '1 strip',
  repo: MINE,
  postedAt: AT,
  replies: [],
  ...over,
});

const theirItem = (over = {}) =>
  anItem({
    id: 'itm_000000000002',
    repo: THEIRS,
    slice: '7 kettle boils',
    title: 'Which element?',
    body: 'the kettle body',
    ...over,
  });

// --- what a tab is ---------------------------------------------------------

test('a tab is a repository: two sessions on one are one tab, in registration order (D3)', () => {
  const second = aRun({ id: 'run_000000000003', slices: [{ slice: '2 overview', state: 'planned' }] });
  const closed = anItem({ id: 'itm_closed', resolvedAt: AT, resolution: 'merged' });

  const tabs = tabsOf([aRun(), theirRun(), second], [anItem(), theirItem(), closed]);

  assert.deepEqual(
    tabs.map((tab) => ({
      repo: tab.repo,
      name: tab.name,
      runs: tab.runs.map((run) => run.id),
      open: tab.open.map((item) => item.id),
    })),
    [
      {
        repo: MINE,
        name: 'pilot',
        runs: ['run_000000000001', 'run_000000000003'],
        open: ['itm_000000000001'],
      },
      { repo: THEIRS, name: 'kettle', runs: ['run_000000000002'], open: ['itm_000000000002'] },
    ],
    'one tab per repository, in registration order, holding its own sessions and its own open items',
  );
});

test('a tab is named by its directory, and an item with no repository belongs to no tab', () => {
  const orphan = anItem({ id: 'itm_orphan', repo: undefined });

  const tabs = tabsOf([aRun()], [anItem(), orphan]);

  assert.deepEqual(tabs.map((tab) => tab.name), ['pilot']);
  assert.deepEqual(tabs[0].open.map((item) => item.id), ['itm_000000000001']);
});

test('tabFor matches a path however it is spelled, and holds nothing it was not given', () => {
  const tabs = tabsOf([aRun(), theirRun()], []);

  assert.equal(tabFor(tabs, path.join(MINE, 'docs', '..'))?.name, 'pilot');
  assert.equal(tabFor(tabs, THEIRS)?.name, 'kettle');
  assert.equal(tabFor(tabs, path.join('D:', 'work', 'nowhere')), null);
  assert.equal(tabFor(tabs, null), null);
});

test('a blank path names no tab, and never the directory the deck happens to be in', () => {
  // `path.resolve('')` is the *current* directory, so a blank `run` handed straight
  // to `sameRepo` matches whichever tab the deck process was started in — the home
  // directory, for the daemon a session starts (`deck/client.mjs:18`), which is
  // exactly the tab this feature exists to stop appearing by accident. A run the
  // deck would refuse to register (`newRun` refuses a blank repo) cannot name one.
  const here = aRun({ repo: process.cwd() });
  const tabs = tabsOf([here, theirRun()], []);

  assert.equal(tabFor(tabs, ''), null, 'the empty path is not "where the deck is running"');
  assert.equal(tabFor(tabs, '   '), null);
  assert.equal(tabFor(tabs, process.cwd())?.repo, process.cwd(), 'the path itself still resolves');
});

test('the deck lands on the sole live run, and on the overview when none or two are (D11)', () => {
  const ended = theirRun({ pid: exitedPid() });

  assert.equal(landingFor(tabsOf([aRun(), ended], []))?.name, 'pilot', 'exactly one tab is live');
  assert.equal(landingFor(tabsOf([aRun(), theirRun()], [])), null, 'two live: the overview');
  assert.equal(landingFor(tabsOf([ended], [])), null, 'none live: the overview');
  assert.equal(landingFor(tabsOf([], [])), null, 'an empty deck: the overview');
});

// --- one run on screen -----------------------------------------------------

/**
 * The page without its Notifications panel. That panel is the one deliberate
 * exception to "a tab is one scope" (D3 of run-tabs): spec 26 lists the open
 * threads of *every* deck on it, on every page the deck serves, so that a
 * question posted on another repository reaches the user where they are. Every
 * other part of a run's page is still that run's alone, and that is what the
 * assertions below are asking about.
 */
const withoutNotifications = (page) =>
  page.replace(/<div class="panel" data-live="notifications"[^>]*>[\s\S]*?<\/div>\s*<\/details>/, '');

test("one run's page carries nothing of the other run (spec 1)", () => {
  const page = withoutNotifications(
    renderHomePage([anItem(), theirItem()], [aRun(), theirRun()], MINE),
  );

  assert.doesNotMatch(page, /itm_000000000002/, "the other run's thread is not on this page");
  assert.doesNotMatch(page, /7 kettle boils/, 'nor its slice, in its table or in its tree');
  assert.doesNotMatch(page, /the kettle body/, 'nor its card');
  assert.doesNotMatch(
    page.replace(/<nav class="runs-strip"[^>]*>[\s\S]*?<\/nav>/, ''),
    /kettle/,
    'and the other run is named in the strip and on the Notifications panel, which are the two ways to it, and nowhere else',
  );

  assert.match(page, /the pilot body/, 'this run keeps its queue');
  assert.match(page, /1 strip/, 'its table and its tree');
  assert.match(
    page,
    /<td class="yours"><a href="\/thread\/itm_000000000001"/,
    "and its Yours, which means yoursIndex was built from this tab's own items",
  );
});

test('a run with no table of its own contributes nothing to the panels (D7)', () => {
  const quiet = aRun({ id: 'run_000000000003', slices: undefined });
  const cleared = aRun({ id: 'run_000000000004', slices: [] });

  const page = renderHomePage([anItem()], [aRun(), quiet, cleared], MINE);

  assert.equal((page.match(/<section class="run-status">/g) ?? []).length, 1);
  assert.equal((page.match(/<section class="tree">/g) ?? []).length, 1);
});

test('a run that resolves to nothing is the overview, and is never echoed into it (D2)', () => {
  const nasty = '"><img onerror=alert(1) src=x>';

  const page = renderHomePage([anItem(), theirItem()], [aRun(), theirRun()], nasty);

  assert.doesNotMatch(page, /img onerror/, 'not escaped, not encoded: not in the page at all');
  assert.doesNotMatch(page, /alert\(1\)/);
  assert.match(page, /the pilot body/, 'the overview is every run, as it is today');
  assert.match(page, /the kettle body/);
  assert.doesNotMatch(
    columnOf(page),
    /7 kettle boils/,
    'every open thread in the column, and no table stacked in it (slice 2)',
  );
});

// --- the strip -------------------------------------------------------------

const stripOf = (page) => page.split(/<nav class="runs-strip"[^>]*>/)[1].split('</nav>')[0];

const COUNT = /<span class="count">(\d+)<\/span>/;

const linksIn = (strip) =>
  [...strip.matchAll(/<a href="([^"]*)"([^>]*)>(.*?)<\/a>/g)].map((link) => ({
    href: link[1],
    text: link[3].replace(COUNT, ''),
    count: link[3].match(COUNT)?.[1] ?? null,
    current: link[2].includes('aria-current="page"'),
  }));

/** The cards in the main column, which is what a tab's number counts (D8). */
const cardsIn = (page) =>
  page.split(/<main[^>]*>/)[1].split('</main>')[0].split(/<article[^>]*>/).slice(1);

test('the strip is an Overview link and one link per run, the selected one marked (D10)', () => {
  const page = renderHomePage([], [aRun(), theirRun()], MINE);

  assert.deepEqual(linksIn(stripOf(page)), [
    { href: '/?run=', text: 'Overview', count: '0', current: false },
    { href: `/?run=${encodeURIComponent(MINE)}`, text: 'pilot', count: '0', current: true },
    { href: `/?run=${encodeURIComponent(THEIRS)}`, text: 'kettle', count: '0', current: false },
  ]);
  assert.doesNotMatch(page, /class="tab"[^>]*id="run/, 'D10: the bookmarks keep .tab and .strip');
});

// --- no sub tab (yellow-agent S11, L15) ----------------------------------------

// A run as 0.7.19's sub-deck registered one: its own worktree, a `parent`, live or paused.
const SUB = path.join('D:', 'work', 'pilot-subdeck');
const subRun = (over = {}) => aRun({ id: 'run_000000000009', repo: SUB, name: 'pilot-subdeck', parent: MINE, ...over });

test('a repository with a 0.7.19 sub run draws one tab and no Pause', () => {
  for (const sub of [subRun(), subRun({ pid: exitedPid(), paused: true }), subRun({ pausing: true })]) {
    assert.deepEqual(tabsOf([sub, aRun()], []).map((tab) => tab.repo), [MINE], 'one tab per main run');
    for (const selected of [MINE, SUB, undefined]) {
      const page = renderHomePage([], [aRun(), sub], selected);
      assert.deepEqual(linksIn(stripOf(page)).map((link) => link.href).slice(1), [`/?run=${encodeURIComponent(MINE)}`]);
      assert.doesNotMatch(page, />Paus(e|ing)</, 'no Pause control');
      assert.doesNotMatch(page, /sub-deck|--sub|data-parent|deck-group/i, 'nothing on the page says sub-deck');
    }
  }
});

test('the page has no /subdeck/pause form', () => {
  const page = renderHomePage([], [aRun({ wrapped: true }), subRun()], SUB);
  assert.doesNotMatch(page, /\/subdeck\/pause|class="subdeck"/);
});

test('the overview is the marked tab when nothing resolves, and the strip is still the whole deck', () => {
  const unselected = linksIn(stripOf(renderHomePage([], [aRun(), theirRun()])));
  const unresolvable = linksIn(stripOf(renderHomePage([], [aRun(), theirRun()], 'D:\\work\\gone')));

  assert.deepEqual(unselected.map((link) => link.current), [true, false, false]);
  assert.deepEqual(unresolvable.map((link) => link.current), [true, false, false]);
});

test('`/?run=` with nothing after it is the overview, not the directory the deck is in (D2)', () => {
  const here = aRun({ repo: process.cwd() });
  const mine = anItem({ repo: process.cwd() });

  const page = renderHomePage([mine, theirItem()], [here, theirRun()], '');

  assert.deepEqual(linksIn(stripOf(page)).map((link) => link.current), [true, false, false]);
  assert.match(page, /the kettle body/, 'the overview is every run, as an unresolvable run must be');
  assert.match(page, /the pilot body/);
});

test('a run name and a repository path are escaped into the strip, never rendered as HTML', () => {
  const nasty = aRun({ repo: path.join('D:', 'work', '<img onerror=alert(1)>') });

  const strip = stripOf(renderHomePage([], [nasty], nasty.repo));

  assert.doesNotMatch(strip, /<img onerror/);
  assert.match(strip, /&lt;img onerror=alert\(1\)&gt;/, 'the name is the text the directory is');
});

// --- the overview, which is an overview and not a stack (slice 2) ----------

/** The main column: the queue, without the bookmarks standing either side of it. */
const columnOf = (page) => /<main[^>]*>([\s\S]*?)<\/main>/.exec(page)?.[1] ?? '';

/** One panel's markup, by the live region it is. */
const panelOf = (page, live) =>
  new RegExp(`<div class="panel" data-live="${live}"[^>]*>([\\s\\S]*?)</div>\\s*</details>`).exec(page)?.[1] ??
  null;

test('the overview is the open queue, with every run behind a shut section (spec 1)', () => {
  const page = renderHomePage([anItem(), theirItem()], [aRun(), theirRun()]);

  const column = columnOf(page);
  assert.doesNotMatch(column, /<table class="slices">/, 'the stack of tables the user complained of');
  assert.doesNotMatch(column, /class="tree"/, 'nor the trees that were stacked beside them');
  assert.match(column, /the pilot body/, 'every open thread on the deck is still here');
  assert.match(column, /the kettle body/);

  // The walkthrough of 2026-09-19 widened this: the bookmarks used to go with
  // the tab, so dismissing a run took the tree and the table off the page — "i
  // pressed dismiss ... the 'tree' and 'status' tabs disappeared. They should
  // always be visible." They are drawn on every page state now, and what they
  // hold on the overview is one section per tab, in the strip's own order, each
  // one shut: opened, a dozen runs' rows at once would be the stack this
  // feature removed.
  assert.match(page, /<aside class="strip left"/, 'so both bookmarks are here as well');
  const status = panelOf(page, 'status');
  assert.deepEqual(
    [...status.matchAll(/<details class="run-section" data-section="([^"]*)"><summary>/g)].map(([, n]) => n),
    ['pilot', 'kettle'],
    'one section per tab, keyed by its name, in the order the strip lists them',
  );
  assert.doesNotMatch(status, /<details class="run-section"[^>]*open>/, 'and every one of them shut');
});

test('a run whose sections the overview holds still carries its rows inside them', () => {
  const page = renderHomePage([anItem(), theirItem()], [aRun(), theirRun()]);

  assert.match(panelOf(page, 'status'), /1 strip/, "the run's rows are in its section");
  assert.match(panelOf(page, 'status'), /7 kettle boils/, 'and the other run has its own');
  assert.doesNotMatch(columnOf(page), /1 strip/, 'never back in the column they came out of');
});

test('a second session in one directory replaces the table on its tab, it does not stack one', () => {
  // Two run rows for one directory is the ordinary case: the deck retains the row of
  // the session that ended and the next one registers beside it. A tab is a deck, not
  // a session, so it draws one table and one tree — the newest row's, which is how the
  // tab already takes its name (`featureOf`'s `findLast`). Drawing both is the stack
  // that tabs exist to end, with the older, staler copy on top.
  const earlier = aRun({ id: 'run_00000000000e', pid: exitedPid() });
  const now = aRun({ id: 'run_00000000000n', slices: [{ slice: '2 panels', state: 'merged' }] });

  const page = renderHomePage([anItem()], [earlier, now], MINE);

  assert.equal((page.match(/<table class="slices">/g) ?? []).length, 1, 'one table on the tab');
  assert.equal((page.match(/<section class="tree">/g) ?? []).length, 1, 'and one tree beside it');
  assert.match(panelOf(page, 'status'), /2 panels/, "the newest row's table is the one drawn");
  assert.doesNotMatch(panelOf(page, 'status'), /1 strip/, 'and the row it replaced is not drawn under it');
});

test("a run's own page draws its rows straight, with no section to open first", () => {
  const page = renderHomePage([anItem()], [aRun(), theirRun()], MINE);

  assert.match(page, /<aside class="strip left">/, 'both bookmarks, on the one edge now');
  assert.match(page, /<details class="tab" id="status" open>/, 'one Status bookmark, out (three-lanes S5)');
  assert.match(page, /<table class="slices">/);
  assert.doesNotMatch(
    page,
    /class="run-section"/,
    'a page of one run has nothing to choose between: the sections are the overview\'s',
  );
  assert.doesNotMatch(page, /7 kettle boils/, "and the other run's rows are on its own tab");
});

test('there is no Graph bookmark', async () => {
  const { renderStrips } = await import('../ui/render-rail.mjs');
  const tabs = tabsOf([aRun(), theirRun()], [anItem()]);
  for (const strips of [renderStrips(tabFor(tabs, MINE), tabs, [anItem()]), renderStrips(null, tabs, [anItem()])]) {
    assert.doesNotMatch(strips, /<summary>Graph<\/summary>/, 'the graph is inside Status, not a bookmark of its own');
    assert.equal((strips.match(/data-live="status"/g) ?? []).length, 1, 'one Status region');
  }
});

test('every tab link carries its count, and the count is the queue beneath it (D8, spec 2)', () => {
  const second = anItem({ id: 'itm_000000000003', title: 'And this one', body: 'the second body' });
  const closed = anItem({ id: 'itm_closed', resolvedAt: AT, resolution: 'merged' });
  const items = [anItem(), second, closed, theirItem()];
  const runs = [aRun(), theirRun()];

  assert.deepEqual(
    linksIn(stripOf(renderHomePage(items, runs))).map((link) => [link.text, link.count]),
    [['Overview', '3'], ['pilot', '2'], ['kettle', '1']],
    'open items only, whichever kind they are, and the Overview is the whole queue',
  );

  assert.equal(cardsIn(renderHomePage(items, runs)).length, 3, 'the overview renders its 3');
  assert.equal(cardsIn(renderHomePage(items, runs, MINE)).length, 2, "and a tab renders its own");
  assert.equal(cardsIn(renderHomePage(items, runs, THEIRS)).length, 1);
});

test("an overview card names its run and links to that run's tab (spec 2)", () => {
  const orphan = anItem({ id: 'itm_orphan', repo: undefined });

  const cards = cardsIn(renderHomePage([anItem(), theirItem(), orphan], [aRun(), theirRun()]));
  const labelIn = (card) => card.match(/<a class="run" href="([^"]*)">([^<]*)<\/a>/)?.slice(1, 3);

  assert.deepEqual(
    cards.map(labelIn),
    [
      [`/?run=${encodeURIComponent(MINE)}`, 'pilot'],
      [`/?run=${encodeURIComponent(THEIRS)}`, 'kettle'],
      undefined,
    ],
    'the label is the tab it came from, so an item that names no repository carries none',
  );
});

test("a run's own page labels no card: every card there is that run's (D6)", () => {
  const cards = cardsIn(renderHomePage([anItem(), theirItem()], [aRun(), theirRun()], MINE));

  assert.equal(cards.length, 1);
  assert.doesNotMatch(cards[0], /class="run"/, 'the strip already says which run this is');
});

// --- over HTTP, which is where the user actually is ------------------------

/** A tool call as the HTTP surface takes one: `run` is sent, not injected. */
const callApi = (base, name, args) =>
  fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, arguments: args }),
  });

test('the home page reads ?run= and serves that run alone (D1, spec 5)', async (t) => {
  const base = await deckOnAPort(t);
  const mine = registerRun({ repo: MINE, pid: process.pid });
  const theirs = registerRun({ repo: THEIRS, pid: process.pid });
  setSlices(mine.id, [{ slice: '1 strip', state: 'PR #24, draft' }]);
  setSlices(theirs.id, [{ slice: '7 kettle boils', state: 'planned' }]);

  const selected = await (await fetch(`${base}/?run=${encodeURIComponent(THEIRS)}`)).text();
  const landing = await (await fetch(base)).text();

  assert.match(selected, /7 kettle boils/, 'the run the URL names');
  assert.doesNotMatch(selected, /1 strip/, 'and no other run, anywhere in the page');

  assert.deepEqual(
    linksIn(stripOf(landing)).map((link) => [link.text, link.current]),
    [['Overview', true], ['D1 pilot', false], ['D2 kettle', false]],
    'two runs are live, so the bare URL is the overview, with both of them one click away',
  );
  assert.doesNotMatch(columnOf(landing), /1 strip/, 'which stacks neither table in its column');
  assert.doesNotMatch(columnOf(landing), /7 kettle boils/);
});

test('with one run live, the bare URL is that run and its tab says so (spec 3, D11)', async (t) => {
  const base = await deckOnAPort(t);
  const only = registerRun({ repo: MINE, pid: process.pid });
  setSlices(only.id, [{ slice: '1 strip', state: 'PR #24, draft' }]);

  const page = await (await fetch(base)).text();

  assert.match(page, /1 strip/, 'the sole live run is the page, not one click away from it');
  assert.match(page, /<table class="slices">/, 'with its table');
  assert.deepEqual(
    linksIn(stripOf(page)).map((link) => [link.text, link.current]),
    [
      ['Overview', false],
      ['D1 pilot', true],
    ],
    'and the strip says which run the user is looking at',
  );
});

test('with one run live, the Overview link still reaches the overview (spec 2, D11)', async (t) => {
  // D11 sends the bare URL to the sole live run, which is what the previous test
  // proves. The Overview link must not point at that same bare URL, or the one
  // page the strip promises is always reachable becomes the one page that is not.
  const base = await deckOnAPort(t);
  const only = registerRun({ repo: MINE, pid: process.pid });
  setSlices(only.id, [{ slice: '1 strip', state: 'PR #24, draft' }]);

  const page = await (await fetch(`${base}/?run=`)).text();

  assert.deepEqual(
    linksIn(stripOf(page)).map((link) => [link.text, link.current]),
    [
      ['Overview', true],
      ['D1 pilot', false],
    ],
    'a blank run selects no tab, so the overview is what the Overview link reaches',
  );
});

// --- spec 32: a thread page names the deck it belongs to (S24) -------------

/**
 * The header's one line of provenance — what this item is, when it arrived, and
 * whose deck it came from. Read off the served page rather than out of the
 * renderer, because the half that used to be missing was the route's: the thread
 * page is the one page that resolved its tabs with no numbers to hand.
 */
const kindOf = (page) => /<span class="kind"[^>]*>([\s\S]*?)<\/span>/.exec(page)?.[1] ?? '';

/**
 * The deck the header's centre names since spec 15 (L20): the code between the
 * arrows, which the arrows themselves are not.
 */
const deckOf = (page) =>
  linksIn(/<nav class="threads"[^>]*>([\s\S]*?)<\/nav>/.exec(page)?.[1] ?? '').filter(
    (link) => link.text !== '‹' && link.text !== '›',
  );

/** A thread page as the user reaches one: over HTTP, from the deck holding it. */
const threadOn = async (base, id) => (await fetch(`${base}/thread/${id}`)).text();

test("a thread's header names its deck, linking to that deck's own tab (spec 32, L36, spec 15)", async (t) => {
  const base = await deckOnAPort(t);
  registerRun({ repo: MINE, pid: process.pid });
  registerRun({ repo: THEIRS, pid: process.pid });
  const mine = postItem({ kind: 'signoff', title: 'Merge it', body: 'the pilot body', repo: MINE });
  const theirs = postItem({
    kind: 'signoff',
    title: 'Which element?',
    body: 'the kettle body',
    repo: THEIRS,
  });

  const first = deckOf(await threadOn(base, mine.id));
  const second = deckOf(await threadOn(base, theirs.id));
  const strip = linksIn(stripOf(await (await fetch(base)).text()));

  assert.deepEqual(
    first.map((link) => link.text),
    ['D1'],
    "the number reaches this page too, and the code is the tab's own",
  );
  assert.deepEqual(
    second.map((link) => link.text),
    ['D2'],
    "and it is the item's own deck, not the first one the deck holds",
  );
  // Against the strip's own link rather than a literal spelled twice: the
  // address the header offers and the address the tab offers are one answer.
  for (const [label, link] of [
    ['D1 pilot', first[0]],
    ['D2 kettle', second[0]],
  ]) {
    assert.equal(
      link.href,
      strip.find((tab) => tab.text === label).href,
      `${link.text} in the header goes exactly where ${label} on the strip goes`,
    );
  }
});

test('a thread with no deck to name ends its kind line at the time (spec 32)', async (t) => {
  const base = await deckOnAPort(t);
  // A deck with a tab of its own, so what follows is "this thread has none" and
  // not "the page had nothing to name".
  registerRun({ repo: MINE, pid: process.pid });
  const orphan = postItem({ kind: 'signoff', title: 'Merge it', body: 'the pilot body' });
  const evicted = postItem({
    kind: 'signoff',
    title: 'Which element?',
    body: 'the kettle body',
    repo: THEIRS,
  });
  // Settled, because an *open* item whose repository has no record still mints a
  // tab of its own (D4) — so the repository that names no tab is this one.
  resolveItem(evicted.id, 'merged');

  for (const [what, id] of [
    ['a thread posted with no repository', orphan.id],
    ['a settled thread whose repository no run registered', evicted.id],
  ]) {
    const kind = kindOf(await threadOn(base, id));
    assert.deepEqual(linksIn(kind), [], `${what} names no deck`);
    assert.doesNotMatch(kind, /<\/time>\s*·/, `and ${what} carries no separator after the time`);
    assert.doesNotMatch(kind, /unknown/i, `and nothing stands in for the deck on ${what}`);
  }
});

// --- the name the pilot gives its run (slice 3, spec 4) --------------------

test('a tab takes the name the pilot gave it, from the newest session that gave one (D9)', () => {
  const named = aRun({ feature: 'deck-tree' });
  const older = aRun({ id: 'run_000000000003', feature: 'the name it had before' });
  const quiet = aRun({ id: 'run_000000000004' });

  const nameOf = (runs) => tabsOf(runs, []).map((tab) => tab.name);

  assert.deepEqual(nameOf([quiet]), ['pilot'], 'the directory name, while no session has named it');
  assert.deepEqual(nameOf([named]), ['deck-tree'], "and the pilot's name once one has");
  assert.deepEqual(
    nameOf([older, named]),
    ['deck-tree'],
    'two sessions on one repository are one tab, named by the newest that named it (D3)',
  );
  assert.deepEqual(
    nameOf([named, quiet]),
    ['deck-tree'],
    'and a session that never named the run does not unname it',
  );
  assert.deepEqual(nameOf([named, theirRun()]), ['deck-tree', 'kettle'], 'one name per tab');
});

test("the panels are headed by the tab's name, so the strip and the panels cannot disagree", () => {
  // Without this the strip reads "deck-tree" while the headings under it still
  // read "Hazzard": the same run called two things on one page.
  const named = aRun({ feature: 'deck-tree' });

  const page = renderHomePage([anItem()], [named], MINE);
  const headings = [...page.matchAll(/<span class="run" title="[^"]*">([^<]*)<\/span>/g)].map(
    (heading) => heading[1],
  );

  assert.deepEqual(headings, ['deck-tree', 'deck-tree'], 'the tree panel and the status panel');
  assert.deepEqual(
    linksIn(stripOf(page)).map((link) => link.text),
    ['Overview', 'deck-tree'],
    'which is the name the strip above them carries',
  );
  assert.equal(named.name, 'pilot', 'and the run keeps the one name it has ever had');
});

test("deck_status's schema and description carry feature (spec 4)", () => {
  const { feature } = deckStatus.inputSchema.properties;

  assert.equal(feature.type, 'string', 'the whole call is named, so it sits beside slices');
  assert.equal(feature.maxLength, MAX_FEATURE_CHARS, 'bounded where runs.mjs bounds it (D9)');
  assert.match(feature.description, /tab/, 'and it says what the user sees');
  assert.deepEqual(
    deckStatus.inputSchema.required,
    ['slices', 'slug'],
    'feature is optional: a name is sent once (A2); the slug keys the record (L7)',
  );
  assert.equal(deckStatus.inputSchema.additionalProperties, false, 'nothing else is');
  assert.match(deckStatus.description, /feature/, 'the description tells the pilot to send it');
});

test('one deck_status renames the tab, and the next one without a name keeps it (spec 4, A2)', async (t) => {
  const base = await deckOnAPort(t);
  const run = registerRun({ repo: MINE, pid: process.pid });

  await callApi(base, 'deck_status', {
    slug: 'a-run',
    run: run.id,
    feature: 'deck-tree',
    slices: [{ slice: '1 strip', state: 'PR #24, draft' }],
  });
  const renamed = await (await fetch(`${base}/?run=${encodeURIComponent(MINE)}`)).text();
  await callApi(base, 'deck_status', {
    slug: 'a-run',
    run: run.id,
    slices: [{ slice: '2 overview', state: 'planned' }],
  });
  const kept = await (await fetch(`${base}/?run=${encodeURIComponent(MINE)}`)).text();

  assert.deepEqual(
    linksIn(stripOf(renamed)).map((link) => link.text),
    ['Overview', 'D1 deck-tree'],
    'the tab reads what the pilot called the run, not the directory it was started in',
  );
  assert.deepEqual(
    linksIn(stripOf(kept)).map((link) => link.text),
    ['Overview', 'D1 deck-tree'],
    'and the table that followed it did not take the name away again (A2)',
  );
  assert.match(kept, /2 overview/, 'though it did replace the table');
});

// --- an ended run keeps its tab while it has open items (slice A2, spec 6) --

test('a tab whose sessions have all gone is ended, and one with a live session is not', () => {
  const ended = aRun({ pid: exitedPid() });

  const tabs = tabsOf([ended, theirRun()], [anItem(), theirItem()]);

  assert.deepEqual(
    tabs.map((tab) => [tab.name, tab.ended]),
    [['pilot', true], ['kettle', false]],
    'ended is a question about the tab, which is every session on one repository (D3)',
  );
});

test('two sessions on one repository: the tab ends when the last of them does (D3)', () => {
  const gone = aRun({ pid: exitedPid() });
  const here = aRun({ id: 'run_000000000003' });

  assert.equal(tabsOf([gone, here], [anItem()])[0].ended, false, 'one session is still up');
  assert.equal(tabsOf([gone], [anItem()])[0].ended, true, 'and now none is');
});

test('an ended tab goes once nothing of its is open, and a live one stays either way (spec 6)', () => {
  const ended = aRun({ pid: exitedPid() });
  const closed = anItem({ id: 'itm_closed', resolvedAt: AT, resolution: 'merged' });

  assert.deepEqual(
    tabsOf([ended, theirRun()], [anItem()]).map((tab) => tab.name),
    ['pilot', 'kettle'],
    'the ended run keeps its tab while a thread of its is open',
  );
  assert.deepEqual(
    tabsOf([ended, theirRun()], [closed]).map((tab) => tab.name),
    ['kettle'],
    'and drops off once the last one is resolved',
  );
  assert.deepEqual(
    tabsOf([theirRun()], []).map((tab) => tab.name),
    ['kettle'],
    'a live run is on the strip whether or not anything is waiting on it',
  );
});

test('a repository with an open item and no run record at all still has a tab (D4)', () => {
  // The floor under D4: `MAX_RUNS` can evict the record of an ended run, and the
  // thread it was holding must not leave the strip with it.
  const tabs = tabsOf([aRun()], [anItem(), theirItem()]);

  assert.deepEqual(
    tabs.map((tab) => [tab.name, tab.ended, tab.runs.length, tab.open.length]),
    [['pilot', false, 1, 1], ['kettle', true, 0, 1]],
    'named by its directory, ended because no session of its is up, holding its own queue',
  );
});

test('the deck still lands on the sole live run when an ended tab is beside it (D11)', () => {
  const ended = theirRun({ pid: exitedPid() });

  assert.equal(
    landingFor(tabsOf([aRun(), ended], [anItem(), theirItem()]))?.name,
    'pilot',
    'an ended tab is on the strip but is not somewhere to land',
  );
  assert.equal(landingFor(tabsOf([ended], [theirItem()])), null, 'nothing live: the overview');
});

test("an ended run's tab says so, and its page says so above the queue (spec 6)", () => {
  const ended = aRun({ pid: exitedPid(), feature: 'deck-run-tabs' });

  const page = renderHomePage([anItem()], [ended], MINE);
  const strip = stripOf(page);

  assert.deepEqual(
    linksIn(strip).map((link) => [link.text, link.count]),
    [['Overview', '1'], ['deck-run-tabs<span class="ended">ended</span>', '1']],
    'the name the pilot gave it, and a quiet ended inside the same link',
  );
  assert.match(
    page.split('<main')[1].split(/<article[^>]*>/)[0],
    /class="ended-note">This session has ended\. Its tab stays while these threads are open, and the next session in this repository picks them up\./,
    'and the page it selects says so once, above the queue, with the closing sentence intact',
  );
  assert.match(page, /<table class="slices">/, 'its last table stays');
  assert.match(page, /<section class="tree">/, 'and its tree');
  assert.match(page, /the pilot body/, 'and the thread that is keeping it here');
});

test('a live run says nothing about having ended, on the strip or on its page', () => {
  const page = renderHomePage([anItem()], [aRun()], MINE);

  assert.doesNotMatch(page, /class="ended/, 'no marker, no note: ended is the exception');
  assert.match(
    page,
    /<main data-live="queue">\s*<article data-accent="[a-z]+">/,
    'nothing sits between the queue and its first card, not even an empty note',
  );
});

test('tabs with no record keep store order when a reply lands on the later one (L13)', () => {
  const replied = theirItem({ replies: [{ from: 'user', seq: 1, text: 'yes', repliedAt: '2026-09-17T10:00:00.000Z' }] });

  assert.deepEqual(
    tabsOf([], [anItem(), replied]).map((tab) => tab.repo),
    [MINE, THEIRS],
    'the strip does not reorder itself as the queue does',
  );
});

test('a tab with no table anywhere in it still has its bookmarks, holding nothing', () => {
  // An item-only tab has no run record and so no rows. The bookmarks are drawn
  // anyway since the walkthrough of 2026-09-19 — "they should always be
  // visible" — and what they hold is what the deck has for this tab, which is
  // nothing. An empty panel says that; a missing one says the deck has stopped
  // drawing them, which is what the user was complaining about.
  const page = renderHomePage([theirItem()], [aRun()], THEIRS);

  assert.match(page, /<aside class="strip left"/, 'the bookmarks do not come and go');
  assert.equal(panelOf(page, 'status'), '', 'and this tab has no table or tree to put in one');
  assert.match(page, /the kettle body/, 'the queue the tab exists for is still the page');
  assert.match(page, /class="ended-note"/, 'and it says the session behind it has gone');
  assert.doesNotMatch(page, /1 strip/, "and no other run's rows leak into it");
});

// --- S1 of deck-workspace: the bookmarks, and the column beside them --------

/**
 * The group grew a third bookmark, and with it the mechanism the rest of this
 * feature stands on: a panel is taken out of the flow and hung from the top of
 * the group (L3), so opening one moves no bookmark and a lone one keeps its
 * bottom on the screen. What an overlay costs is a gutter wide enough for a
 * panel at its default width — which is why that width and that gutter are one
 * number and not two (L16), the drift between two being invisible until a panel
 * hangs over a paragraph.
 *
 * Where a box lands is a browser's answer and is measured in one: S1's live
 * gate reads the bookmarks' positions at two widths. What is provable here is
 * what the deck *serves* — every bookmark on every page it has, a heading that
 * leads back to the overview, one panel width in the stylesheet rather than
 * two, and the key that leaves a thread.
 */

const UI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui');
const uiFile = (name) => fs.readFileSync(path.join(UI, name), 'utf8');

/** The three pages the deck serves, each with the same run and item behind it. */
const everyPage = () => {
  const items = [anItem()];
  const runs = [aRun()];
  return [
    ['home', renderHomePage(items, runs, MINE)],
    ['items', renderDeckPage(items, runs)],
    ['thread', renderThreadPage(items[0], items, runs)],
  ];
};

/** Each bookmark in the group, as the pair of what it is and what it says. */
const bookmarksIn = (page) =>
  [...page.matchAll(/<details class="tab" id="([\w-]+)"[^>]*>\s*<summary>([^<]*)<\/summary>/g)].map(
    (tab) => [tab[1], tab[2]],
  );

test('every page carries the six bookmarks of the group (spec 3, 26; three-lanes S5)', () => {
  for (const [name, page] of everyPage()) {
    assert.deepEqual(
      bookmarksIn(page),
      [
        // Notifications is the top of the rail: it says something arrived,
        // and it is the only one that is not this deck's (S16, L25). The user
        // put it back above Chat at deferred-ledger's Gate 2.
        ['notifications', 'Notifications'],
        // Chat is under it (S2 of deferred-ledger, L9), drawn on every page
        // and hidden by the stylesheet where its panel is empty.
        ['chat', 'Chat'],
        ['status', 'Status'],
        ['agents', 'Agents'],
        // Tickets and Closing reports (run-chaining L13): a repository tab's own,
        // drawn last, hidden by the stylesheet the same way Chat's is when the
        // page names no repository.
        ['tickets', 'Tickets'],
        ['reports', 'Closing reports'],
      ],
      `the ${name} page draws all six, in the strip's own order`,
    );
    assert.match(
      panelOf(page, 'agents'),
      /no agents live/,
      `and the ${name} page's Agents panel says so in words with nobody live in this deck`,
    );
  }
});

// --- spec 33: an open panel carries its name (the user at Gate 2) ----------

/**
 * The word is the bookmark's own, written once per panel: the bookmark says
 * `Tree` on its edge and the panel repeats it where the eye lands first.
 *
 * It is an attribute on the panel and a `::before` in the stylesheet rather
 * than markup inside it, for a reason the panel cannot avoid: `.panel` is a
 * live region, and a change replaces its `innerHTML` wholesale (`live.mjs`:
 * `region.innerHTML = replacement.innerHTML`), so a label rendered into the
 * content would have to be drawn by all four of the functions that fill a
 * panel and would still be a label a swap could lose. An attribute survives
 * the swap untouched, and a pseudo-element is not content a screen reader
 * reads a second time over the `<summary>` that already names the panel.
 */
test("every panel carries its bookmark's own word as its name (spec 33)", () => {
  const named = (page) =>
    [...page.matchAll(/<div class="panel" data-live="([\w-]+)" data-name="([^"]*)"/g)].map((p) => [p[1], p[2]]);

  for (const [name, page] of everyPage()) {
    assert.deepEqual(
      named(page),
      [
        ['notifications', 'Notifications'],
        ['chat', 'Chat'],
        ['status', 'Status'],
        ['agents', 'Agents'],
        ['tickets', 'Tickets'],
        ['reports', 'Closing reports'],
      ],
      `the ${name} page names all seven panels, with the word on the bookmark that opens each`,
    );
    assert.deepEqual(
      named(page).map((pair) => pair[1]),
      bookmarksIn(page).map((pair) => pair[1]),
      `and on the ${name} page those are the bookmarks' own five words, never a second name for a panel`,
    );
  }
});

test('the name is drawn by the stylesheet from that attribute, so a swap cannot lose it (spec 33)', () => {
  const css = uiFile('deck.css');
  const label = css.match(/\n\.panel::before \{[^}]*\}/);

  assert.ok(label, 'without a rule the attribute is invisible');
  assert.match(label[0], /content:\s*attr\(data-name\)/, 'the word comes from the attribute, not from a copy in here');
  assert.match(label[0], /display:\s*block/, 'an inline label would stand on the first row rather than above it');
});

test('the heading is the way back to the overview, on every page (spec 1)', () => {
  const escaped = OVERVIEW_HREF.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const homeLink = new RegExp(`<h1><a href="${escaped}">Pilot deck</a></h1>`);
  for (const [name, page] of everyPage()) {
    assert.match(
      page,
      homeLink,
      `the ${name} page's heading is a link, and to the overview's own address (OVERVIEW_HREF) rather than a bare /`,
    );
  }
});

test('a panel is out of the flow, and the column starts past it (L3, L16, L17)', () => {
  const css = uiFile('deck.css');
  const panel = /\.panel \{[^}]*\}/.exec(css)[0];

  assert.match(panel, /position: absolute/, 'a panel is out of the flow, or opening one moves a bookmark');
  // Where a panel sits is the layout pass's arithmetic now (L17): the running
  // sum of the used heights of the open panels above it, which no stylesheet
  // can read off a sibling. What is left here is where a page running no
  // script puts one — the top of the group — and the viewport fraction that
  // stood in for that sum is gone, with both counters that computed it.
  assert.match(panel, /top: 0;/, 'with no script every panel sits at the top of the group');
  assert.doesNotMatch(panel, /top: calc\(/, "a panel's top is the pass's running sum, not a fraction of the window");
  assert.doesNotMatch(
    css,
    /--(open|above)\b/,
    'and the `--open`/`--above` counters with their `:has()` rules are gone rather than grown (L17)',
  );
  assert.match(panel, /width: var\(--panel\)/, 'its default width is the custom property, not a number here');

  const width = /--panel: ([\d.]+rem)/.exec(css)?.[1];
  assert.ok(width, 'the default width is declared once, as that property');

  // The *left* gutter, which is the one a panel opens into: everything before
  // the second `calc(`. A stylesheet that spent the panel's width on the right
  // gutter instead would put every panel over the column and still read as
  // deriving one from the other, which is the drift this pin is here to catch.
  const gutters = /padding-inline: ([^;]*);/.exec(/^body \{[^}]*\}/m.exec(css)[0])[1];
  assert.match(
    gutters.slice(0, gutters.lastIndexOf('calc(')),
    /var\(--panel\)/,
    'and the column starts at a gutter derived from it, so the two can never drift apart',
  );
  assert.equal(
    css.split(width).length - 1,
    1,
    `${width} is written once in the stylesheet: in the property, and nowhere else (L16)`,
  );
});

// --- spec 17: Esc leaves a thread the way the arrow does -------------------

/**
 * A thread page with `escape.mjs` installed on it: the arrow the key follows, both
 * ways off the page, and what the browser says about where the reader came
 * from. It is the only module this behaviour needs, so it is the only one installed — the least DOM
 * this behaviour touches.
 */
function aThreadPage({ referrer = '', typing = null, arrow: drawn = true, behind = 2, href = `http://127.0.0.1:${PORT}/` } = {}) {
  let arrow = drawn;
  const keys = [];
  const clicks = [];
  const went = { back: 0, assigned: [] };
  // The arrow itself, with the href the page rendered; its clicks are delegated to the document (back-arrow L3).
  const theArrow = { href, closest: (selector) => (selector === 'a.back' ? theArrow : null) };
  const document = {
    activeElement: typing,
    referrer,
    querySelectorAll: (selector) => (selector === 'a.back' && arrow ? [theArrow] : []),
    addEventListener(type, handler) {
      if (type === 'keydown') keys.push(handler);
      if (type === 'click') clicks.push(handler);
    },
  };

  const sandbox = aSandbox({
    document,
    location: {
      href: `http://127.0.0.1:${PORT}/thread/itm_000000000001`,
      origin: `http://127.0.0.1:${PORT}`,
      assign: (href) => went.assigned.push(href),
    },
    history: { pushState() {}, length: behind, back: () => (went.back += 1) },
  });

  installEscape(sandbox);

  return {
    went,
    /** A move in place (handoff-failed-confirm S6) drew the arrow, or took it away. */
    draw: (on) => (arrow = on),
    press: (key, over = {}) => keys.forEach((handler) => handler({ key, ...over })),
    // A click on the arrow as a browser dispatches one; answers whether the default was prevented.
    click: (over = {}) => {
      const target = arrow ? theArrow : { closest: () => null };
      const event = { target, button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, prevented: false, ...over };
      event.preventDefault = () => (event.prevented = true);
      clicks.forEach((handler) => handler(event));
      return event.prevented;
    },
  };
}

// --- back-arrow: the arrow and Esc are one way off a thread (ADR 0118, L3) ---

const DECK_PAGE = `http://127.0.0.1:${PORT}/?run=D%3A%5Cwork%5Cpilot`;
const THREAD_PAGE = `http://127.0.0.1:${PORT}/thread/itm_000000000002`;
const OWNER = `http://127.0.0.1:${PORT}/?run=D%3A%5Cwork%5Cother`;

test('a click on the arrow from a deck page goes back', () => {
  const page = aThreadPage({ referrer: DECK_PAGE, href: OWNER });

  const prevented = page.click();

  assert.equal(page.went.back, 1, "the browser's own Back, to the page the thread was opened from");
  assert.deepEqual(page.went.assigned, [], 'and not the owner, which may be another page than the one left');
  assert.equal(prevented, true, 'the link is not followed as well');
});

test('a click on the arrow with nothing behind it follows the owner', () => {
  for (const [why, over] of [
    ['no referrer', { referrer: '' }],
    ['one entry of history', { referrer: DECK_PAGE, behind: 1 }],
  ]) {
    const page = aThreadPage({ ...over, href: OWNER });

    page.click();

    assert.equal(page.went.back, 0, `${why}: nothing to go back to`);
    assert.deepEqual(page.went.assigned, [OWNER], `${why}: so the arrow's own href, the owning deck`);
  }
});

test("a modified click on the arrow is the browser's", () => {
  for (const [why, over] of [
    ['ctrl-click', { ctrlKey: true }],
    ['cmd-click', { metaKey: true }],
    ['shift-click', { shiftKey: true }],
    ['alt-click', { altKey: true }],
    ['middle click', { button: 1 }],
  ]) {
    const page = aThreadPage({ referrer: DECK_PAGE, href: OWNER });

    const prevented = page.click(over);

    assert.equal(page.went.back, 0, `${why}: no Back`);
    assert.deepEqual(page.went.assigned, [], `${why}: no assign`);
    assert.equal(prevented, false, `${why}: the browser opens the href as it would any link`);
  }
});

test('a thread referrer is not a deck page to go back to (decision itm_498a61106fc8)', () => {
  const byKey = aThreadPage({ referrer: THREAD_PAGE, href: OWNER });
  const byClick = aThreadPage({ referrer: THREAD_PAGE, href: OWNER });

  byKey.press('Escape');
  byClick.click();

  for (const [trigger, page] of [['Esc', byKey], ['the arrow', byClick]]) {
    assert.equal(page.went.back, 0, `${trigger}: not Back, which would land on another thread`);
    assert.deepEqual(page.went.assigned, [OWNER], `${trigger}: the owner instead`);
  }
});

test('Esc and the arrow agree', () => {
  for (const [why, over] of [
    ['a deck referrer with history', { referrer: DECK_PAGE }],
    ['no referrer', { referrer: '' }],
    ['one entry of history', { referrer: DECK_PAGE, behind: 1 }],
  ]) {
    const byKey = aThreadPage({ ...over, href: OWNER });
    const byClick = aThreadPage({ ...over, href: OWNER });

    byKey.press('Escape');
    byClick.click();

    assert.deepEqual(byKey.went, byClick.went, `${why}: one way off, two triggers`);
    assert.equal(byKey.went.back + byKey.went.assigned.length, 1, `${why}: and each leaves exactly once`);
  }
});

test('Esc on a thread reached from a deck page goes back to that page (spec 17)', () => {
  const page = aThreadPage({ referrer: `http://127.0.0.1:${PORT}/?run=D%3A%5Cwork%5Cpilot` });

  page.press('Escape');

  assert.equal(page.went.back, 1, "the browser's own Back, so the tab comes back as it was left");
  assert.deepEqual(page.went.assigned, [], 'and not the arrow, which would land on another tab');
});

test('Esc in a tab a card was middle-clicked into follows the arrow, not a Back that cannot move', () => {
  // A new tab keeps the referrer of the page the link was on but has one entry
  // behind it, so `history.back()` there is a silent no-op and the key would do
  // nothing at all. Both halves are asked, or the answer is "nowhere".
  const page = aThreadPage({ referrer: `http://127.0.0.1:${PORT}/?run=D%3A%5Cwork%5Cpilot`, behind: 1 });

  page.press('Escape');

  assert.equal(page.went.back, 0, 'there is nothing behind this tab to go back to');
  assert.deepEqual(page.went.assigned, [`http://127.0.0.1:${PORT}/`], 'so the arrow answers instead');
});

test('Esc on a thread the deck opened on its own follows the arrow (spec 17, D14)', () => {
  const page = aThreadPage({ referrer: '' });

  page.press('Escape');

  assert.equal(page.went.back, 0, 'there is nothing behind a tab the deck opened itself');
  assert.deepEqual(page.went.assigned, [`http://127.0.0.1:${PORT}/`], 'so it goes where the arrow goes');
});

test('a referrer from somewhere else is not a page of the deck to go back to', () => {
  const page = aThreadPage({ referrer: `http://127.0.0.1:${PORT}1/?run=elsewhere` });

  page.press('Escape');

  assert.equal(page.went.back, 0, 'another origin that merely starts the same is not this deck');
  assert.deepEqual(page.went.assigned, [`http://127.0.0.1:${PORT}/`]);
});

test('Esc while a reply is being typed leaves the page, and the unsent text, alone', () => {
  const page = aThreadPage({
    referrer: `http://127.0.0.1:${PORT}/?run=D%3A%5Cwork%5Cpilot`,
    typing: { tagName: 'TEXTAREA' },
  });

  page.press('Escape');

  assert.equal(page.went.back, 0, 'the key that leaves a thread does not throw away a draft');
  assert.deepEqual(page.went.assigned, []);
});

test('any other key leaves the thread where it is', () => {
  const page = aThreadPage({ referrer: `http://127.0.0.1:${PORT}/` });

  page.press('Enter');
  page.press('Escape', { defaultPrevented: true });
  page.press('Escape', { repeat: true });

  assert.equal(
    page.went.back,
    0,
    'a press something else has handled is not ours, and a held key is one press, not a walk back through the history',
  );
});

test('a page with no way back — the overview, the items list — takes no Esc at all', () => {
  const page = aThreadPage({ referrer: `http://127.0.0.1:${PORT}/`, arrow: false });
  page.press('Escape');
  assert.deepEqual(page.went, { back: 0, assigned: [] }, 'the key belongs to the page with the arrow');
});

test('Esc follows the arrow a move in place drew, and not one it took away (handoff-failed-confirm S6)', () => {
  const page = aThreadPage({ arrow: false });
  page.draw(true);
  page.press('Escape');
  assert.deepEqual(page.went.assigned, [`http://127.0.0.1:${PORT}/`], 'the overview became a thread with no reload');

  const back = aThreadPage({ referrer: `http://127.0.0.1:${PORT}/` });
  back.draw(false);
  back.press('Escape');
  assert.deepEqual(back.went, { back: 0, assigned: [] }, 'and a thread that became the overview takes no Esc');

  const clicked = aThreadPage({ arrow: false, href: OWNER });
  clicked.draw(true);
  assert.equal(clicked.click(), true, 'and a click on the arrow it drew is one way off as well (ADR 0118)');
  assert.deepEqual(clicked.went.assigned, [OWNER]);
});
