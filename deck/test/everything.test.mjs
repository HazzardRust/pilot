/**
 * The walkthrough of 2026-09-19, on "everything on the deck":
 *
 *   "when i press 'everything on the deck', instead of showing a new log of all
 *   past and present threads, it instead shows the same categorical logs
 *   ('overview' 'QA-ALPHA' 'QA-BRAVO'), just it will include all of the
 *   previous threads. also, since it is a toggle behavior, i would rather just
 *   put it off to one of the sides as a tab that becomes highlighted when it is
 *   turned on rather than expanded or something. put it at the top right in
 *   place of the 'status' tab, move the 'status' tab to the same group as the
 *   'tree' tab."
 *
 * So it is a tab at the right edge rather than a link in the header, and what it
 * turns on is the settled threads of whichever scope the page is already
 * showing — the overview's, or one run's — rather than a page of its own.
 *
 * It lives in the URL (`?all=1`) and not in the browser, for the reason the run
 * selection does (D1 of run-tabs): the in-place swap re-fetches the address the
 * page is at, so a view that is in the address needs nothing carried across it
 * and nothing remembered. It also cannot be anywhere else: the home page does
 * not ship a settled thread to the browser at all until it is asked to, which
 * is the property spec 2 rests on and the next test but one checks.
 *
 * Pure: these are claims about which bytes are in the string the renderer
 * returns, so there is no store and no port.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { renderHomePage } = await import('../ui/render.mjs');

const UI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui');
const uiFile = (name) => fs.readFileSync(path.join(UI, name), 'utf8');

const AT = '2026-09-19T09:14:00.000Z';
const MINE = path.join('D:', 'work', 'pilot');
const THEIRS = path.join('D:', 'work', 'kettle');

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
  aRun({ id: 'run_000000000002', repo: THEIRS, name: 'kettle', ...over });

const anItem = (over = {}) => ({
  id: 'itm_open_mine',
  kind: 'question',
  title: 'Which port?',
  body: 'waiting on you',
  repo: MINE,
  postedAt: AT,
  replies: [],
  ...over,
});

const settled = (over = {}) =>
  anItem({
    id: 'itm_done_mine',
    title: 'Which name?',
    body: 'settled long ago',
    resolvedAt: AT,
    resolution: 'we went with pilot',
    ...over,
  });

/** Every run and item these tests draw a page from. */
const RUNS = [aRun(), theirRun()];
const ITEMS = [
  anItem(),
  settled(),
  anItem({ id: 'itm_open_theirs', repo: THEIRS, body: 'their open one' }),
  settled({ id: 'itm_done_theirs', repo: THEIRS, body: 'their settled one' }),
];

const cardsOn = (page) => (page.match(/<article[ >]/g) ?? []).length;
const has = (page, id) => page.includes(id);

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

/** The toggle itself, wherever on the page it ended up. */
const toggleOn = (page) => /<a class="everything[^"]*"[^>]*>/.exec(page)?.[0] ?? null;

// --- where it is, and what it is -------------------------------------------

test('the toggle is a tab at the right edge, and no longer a link in the header', () => {
  const page = renderHomePage(ITEMS, RUNS, MINE);

  assert.ok(!page.includes('everything on the deck'), 'the line of words in the header is gone');
  assert.match(
    page,
    /<aside class="strip right"><a class="everything"/,
    'and it stands where the status bookmark stood, at the right edge',
  );
});

test('the status bookmark has joined the tree in the left group', () => {
  const strips = uiFile('strips.html');
  const left = /<aside class="strip left">[\s\S]*?<\/aside>/.exec(strips)?.[0] ?? '';

  assert.ok(left.includes('id="status"'), 'the status table, its tree inside it since three-lanes S5, is in the left group');
  assert.ok(!strips.includes('class="strip right"'), 'nothing is left at the right edge for it');
});

test('off, it points at the same page with it on; on, it points back', () => {
  const off = renderHomePage(ITEMS, RUNS, MINE);
  const on = renderHomePage(ITEMS, RUNS, MINE, true);
  const here = `/?run=${encodeURIComponent(MINE)}`;

  assert.ok(toggleOn(off).includes(`href="${here}&amp;all=1"`), 'off, it turns itself on');
  assert.ok(!toggleOn(off).includes('everything on'), 'and is drawn quiet');
  assert.ok(toggleOn(on).includes(`href="${here}"`), 'on, it turns itself off again');
  assert.match(toggleOn(on), /class="everything on"/, 'and is highlighted while it is');
});

test('an open bookmark changes colour and nothing about its size either', () => {
  // "oh sorry they dont both expand, but rather the top one just gains more
  // width (grows larger on the y-axis because i am talking relative to the edge
  // of the screen), which just looks silly. maybe we just leave the size and
  // just change the color scheme" — the user, on walkthrough #2. The bookmark
  // reads down the edge, so it was a `padding-inline` that lengthened it.
  const css = uiFile('deck.css');
  const rules = css.match(/^[^{\n]*\.tab\[open\] > summary[^{]*\{[^}]*\}/gm) ?? [];

  assert.ok(rules.length, 'the open state is drawn at all');
  for (const rule of rules) {
    assert.doesNotMatch(rule, /padding|margin|border|font|letter-spacing|writing-mode/, rule);
    assert.match(rule, /background|color/, 'and it is drawn in colour, or the state cannot be seen');
  }
});

test('lit changes the colour of the toggle and nothing about its size', () => {
  // "pressing the 'everything' button shouldn't enlarge the button, just
  // highlight it" — the user, on walkthrough #2. It first borrowed the open
  // bookmark's rule, which lengthens the tab the way a marker sticks out of a
  // book; this one opens nothing, so it is the same tab in another state.
  const css = uiFile('deck.css');
  const rules = css.match(/^[^{\n]*\.everything\.on[^{]*\{[^}]*\}/gm) ?? [];

  assert.ok(rules.length, 'the lit state is drawn at all');
  for (const rule of rules) {
    assert.doesNotMatch(rule, /padding|margin|border|font|letter-spacing|writing-mode/, rule);
  }
});

test('the overview has one too, pointing at the overview', () => {
  const off = renderHomePage(ITEMS, RUNS, null);

  assert.ok(toggleOn(off).includes('href="/?run=&amp;all=1"'), 'the overview is a scope like any other');
});

// --- what it turns on -------------------------------------------------------

test('off, a settled thread does not reach the browser at all', () => {
  const page = renderHomePage(ITEMS, RUNS, MINE);

  assert.ok(has(page, 'itm_open_mine'), 'what is waiting is on the page');
  assert.ok(!has(page, 'itm_done_mine'), 'and what is settled is not shipped to be hidden');
  assert.ok(!page.includes('settled long ago'), 'nor is a word of its body');
});

test('on, a run\'s tab lists that run\'s settled threads after what is waiting', () => {
  const page = renderHomePage(ITEMS, RUNS, MINE, true);

  assert.ok(has(page, 'itm_open_mine'), 'what is waiting is still first');
  assert.ok(has(page, 'itm_done_mine'), 'and what is settled is behind it');
  assert.ok(
    page.indexOf('itm_open_mine') < page.indexOf('itm_done_mine'),
    'in that order: the queue is what the page is for',
  );
  assert.ok(
    !has(withoutNotifications(page), 'itm_open_theirs'),
    'and the other run stays on its own tab, everywhere but the panel spec 26 makes deck-wide',
  );
  assert.ok(!has(page, 'itm_done_theirs'), 'settled or not — a tab is one scope (D3 of run-tabs)');
  assert.equal(cardsOn(page), 2);
});

test('on, the overview lists every thread the deck holds', () => {
  const page = renderHomePage(ITEMS, RUNS, null, true);

  for (const id of ['itm_open_mine', 'itm_open_theirs', 'itm_done_mine', 'itm_done_theirs']) {
    assert.ok(has(page, id), `${id} is on the overview`);
  }
  assert.equal(cardsOn(page), 4);
  assert.ok(
    page.indexOf('itm_open_theirs') < page.indexOf('itm_done_mine'),
    'everything waiting comes before anything settled, whichever run it is from',
  );
});

test('a settled card says so on its bar, is drawn back a step, and offers nothing to press', () => {
  const page = renderHomePage([settled()], [aRun()], MINE, true);

  assert.match(page, /<span class="state" data-state="resolved">resolved<\/span>/, 'the bar reads resolved (spec 4)');
  assert.match(page, /<article class="settled" data-accent="plain">/, 'and it is marked, so which is which is a glance');
  assert.match(
    uiFile('deck.css'),
    /article\.settled \{/,
    'the mark is drawn, or it is a class that says nothing',
  );
  assert.ok(!page.includes('action="/reply"'), 'a closed thread takes no reply');
});

// --- and it travels ---------------------------------------------------------

test('every link on the page carries the toggle, so moving does not turn it off', () => {
  const page = renderHomePage(ITEMS, RUNS, MINE, true);
  const strip = /<nav class="runs-strip"[^>]*>[\s\S]*?<\/nav>/.exec(page)?.[0] ?? '';
  const links = [...strip.matchAll(/href="([^"]*)"/g)].map(([, href]) => href);

  assert.deepEqual(
    links,
    ['/?run=&amp;all=1', `/?run=${encodeURIComponent(MINE)}&amp;all=1`, `/?run=${encodeURIComponent(THEIRS)}&amp;all=1`],
    'the overview and both tabs keep the view the user chose',
  );
});

test('a card answered without a script comes back to the page it was on, toggle and all', () => {
  const page = renderHomePage(ITEMS, RUNS, MINE, true);

  assert.ok(
    page.includes(`name="back" value="/?run=${encodeURIComponent(MINE)}&amp;all=1"`),
    'the back field is this page, which is the tab and the toggle together (D7)',
  );
});

test('the counts on the strip stay the queue\'s, whichever way the toggle is', () => {
  const off = renderHomePage(ITEMS, RUNS, MINE);
  const on = renderHomePage(ITEMS, RUNS, MINE, true);
  const counts = (page) => [...page.matchAll(/<span class="count">(\d+)<\/span>/g)].map(([, n]) => n);

  assert.deepEqual(counts(off), ['2', '1', '1'], 'two waiting on the deck, one on each tab');
  assert.deepEqual(
    counts(on),
    counts(off),
    'a number that changed with the toggle would be two different numbers in one place',
  );
});
