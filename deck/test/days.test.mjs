/**
 * Spec 35, added by the user at Gate 2 on 2026-09-23: with Everything on, the
 * page "is getting pretty lengthy", so the settled threads are put away behind
 * a day at a time.
 *
 * Option 1 of the two the pilot put to them, and the half that matters most is
 * what is *not* grouped: what is waiting on the user stays at the top,
 * ungrouped, whether Everything is on or off. A question from three days ago
 * that is still waiting would otherwise be folded away by the very toggle meant
 * to make the page easier to search.
 *
 * Pure: the grouping is a function of the items and a clock, so the boundaries
 * are pinned here directly and the browser is left to say whether a fold looks
 * like a fold. The clock is handed in for the same reason the renderer never
 * computes a relative reading (D11) — a test that read the real one would pass
 * today and fail on the 15th of next month.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { RECENT_DAYS, daySections, renderHomePage } = await import('../ui/render.mjs');

const UI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui');
const uiFile = (name) => fs.readFileSync(path.join(UI, name), 'utf8');

// --- a clock that does not move --------------------------------------------

/** Local noon on Tue 22 Sep 2026, which is when every test below is standing. */
const NOW = new Date(2026, 8, 22, 12, 0, 0).getTime();

/**
 * A stamp `n` local days before that noon. Built from local parts and not by
 * subtracting milliseconds, because the question every assertion here asks is
 * which calendar day a stamp falls on, and an hour of daylight saving is enough
 * to move a stamp built the other way onto the day next door.
 */
const daysBack = (n, hour = 9) => new Date(2026, 8, 22 - n, hour, 14).toISOString();

const MINE = path.join('D:', 'work', 'pilot');

const aRun = (over = {}) => ({
  id: 'run_000000000001',
  repo: MINE,
  name: 'pilot',
  pid: process.pid,
  startedAt: daysBack(30),
  slices: [{ slice: '1 strip', state: 'PR #24, draft' }],
  ...over,
});

let minted = 0;

const settled = (over = {}) => ({
  id: `itm_done_${(minted += 1)}`,
  kind: 'question',
  title: 'Which name?',
  body: 'settled',
  repo: MINE,
  postedAt: daysBack(0),
  replies: [],
  // Closed when it was posted, so the day a test posts it on is the day it is
  // filed under: a later close would move it (J4).
  resolvedAt: 'postedAt' in over ? over.postedAt : daysBack(0),
  resolution: 'we went with pilot',
  ...over,
});

const waiting = (over = {}) =>
  settled({ resolvedAt: undefined, resolution: undefined, body: 'waiting on you', ...over });

const keysOf = (sections) => sections.map((section) => section.key);

/**
 * The queue and nothing else. The page inlines `deck.css`, whose comments quote
 * `<summary>` and `<details>` in prose, and the header carries a `<time>` per
 * usage reading — so a pattern read against the whole page answers about the
 * stylesheet as readily as about the markup.
 */
const queueOn = (page) => /<main data-live="queue">([\s\S]*?)<\/main>/.exec(page)?.[1] ?? '';

const firstHeadingOn = (page) => /<summary>([\s\S]*?)<\/summary>/.exec(queueOn(page))?.[1] ?? '';

// --- which section a card falls in ------------------------------------------

test("today's settled cards are one section, open, named by its date and counted", () => {
  const sections = daySections([settled(), settled({ postedAt: daysBack(0, 18) })], NOW);

  assert.equal(sections.length, 1, 'one day, one section');
  assert.equal(sections[0].key, '2026-09-22', 'keyed on the local calendar day and not on "today"');
  assert.equal(sections[0].label, 'Tue 22 Sep', 'the absolute form is what the server writes (D11)');
  assert.equal(sections[0].calendar, true, 'and it is a day, so the browser may read it as Today');
  assert.equal(sections[0].open, true, 'today is the one served open');
  assert.equal(sections[0].items.length, 2, 'both of the day are in it');
});

test('yesterday is its own section and arrives shut', () => {
  const sections = daySections([settled({ postedAt: daysBack(1) })], NOW);

  assert.equal(sections[0].key, '2026-09-21');
  assert.equal(sections[0].label, 'Mon 21 Sep', 'the date, not the word — the word is the browser`s');
  assert.equal(sections[0].open, false, 'everything earlier than today is put away');
});

test('the sections run newest day first', () => {
  const sections = daySections(
    [settled({ postedAt: daysBack(2) }), settled({ postedAt: daysBack(0) }), settled({ postedAt: daysBack(1) })],
    NOW,
  );

  assert.deepEqual(keysOf(sections), ['2026-09-22', '2026-09-21', '2026-09-20']);
});

test(`a day ${RECENT_DAYS} days back is still its own day; one older is its month`, () => {
  const inside = daySections([settled({ postedAt: daysBack(RECENT_DAYS) })], NOW);
  const outside = daySections([settled({ postedAt: daysBack(RECENT_DAYS + 1) })], NOW);

  assert.equal(inside[0].key, '2026-09-08', 'the edge itself is a day');
  assert.equal(inside[0].calendar, true);
  assert.equal(outside[0].key, '2026-09', 'a day past it is gathered into its month');
  assert.equal(outside[0].calendar, false, 'a month has no relative reading to make');
});

test('a month section is named and shut, and sorts under every day of it', () => {
  const sections = daySections(
    [
      settled({ postedAt: daysBack(0) }),
      settled({ postedAt: daysBack(RECENT_DAYS + 1) }),
      settled({ postedAt: daysBack(40) }),
      settled({ postedAt: daysBack(45) }),
    ],
    NOW,
  );

  assert.deepEqual(keysOf(sections), ['2026-09-22', '2026-09', '2026-08']);
  assert.equal(sections[1].label, 'Sep 2026', 'the month the user reads it as');
  assert.equal(sections[2].label, 'Aug 2026');
  assert.equal(sections[2].items.length, 2, 'a month gathers every day of itself');
  for (const section of sections.slice(1)) assert.equal(section.open, false, 'and stays shut');
});

test('a stamp the deck cannot read is gathered, last, and never dropped', () => {
  const sections = daySections(
    [settled({ postedAt: 'not a date' }), settled({ postedAt: undefined }), settled({ postedAt: daysBack(0) })],
    NOW,
  );

  assert.deepEqual(keysOf(sections), ['2026-09-22', 'undated'], 'the readable day first, the rest behind it');
  assert.equal(sections[1].label, 'Undated');
  assert.equal(sections[1].calendar, false, 'there is no day to call today');
  assert.equal(sections[1].items.length, 2, 'and both cards are still on the page');
});

test('the count on a section is how many cards are behind its fold', () => {
  const sections = daySections([settled(), settled(), settled({ postedAt: daysBack(1) })], NOW);

  assert.deepEqual(
    sections.map((section) => section.items.length),
    [2, 1],
  );
});

// --- what the page is made of -----------------------------------------------

test('with Everything off nothing is grouped, because nothing settled is shipped', () => {
  const page = renderHomePage([waiting(), settled()], [aRun()], MINE, false, {}, {}, NOW);

  assert.ok(!page.includes('<details class="day"'), 'no section, and so no fold to open');
  assert.match(page, /<main data-live="queue">\s*<article data-accent="[a-z]+">/, 'the queue still opens on its first card');
});

test('with Everything on, what is waiting stays at the top and outside every fold', () => {
  const page = renderHomePage(
    [waiting({ id: 'itm_old_waiting', postedAt: daysBack(3) }), settled({ id: 'itm_settled_today' })],
    [aRun()],
    MINE,
    true,
    {},
    {},
    NOW,
  );
  const beforeTheFirstFold = page.split('<details class="day"')[0];

  assert.ok(
    beforeTheFirstFold.includes('itm_old_waiting'),
    'three days old and still waiting: it is the next thing to do, not history',
  );
  assert.ok(!beforeTheFirstFold.includes('itm_settled_today'), 'and what is settled is behind a heading');
  assert.match(page, /<main data-live="queue">\s*<article data-accent="[a-z]+">/, 'the waiting cards are still flat and first');
});

test("today's section is served open and an earlier one shut", () => {
  const page = renderHomePage(
    [settled({ postedAt: daysBack(0) }), settled({ postedAt: daysBack(2) })],
    [aRun()],
    MINE,
    true,
    {},
    {},
    NOW,
  );
  const opens = [...page.matchAll(/<details class="day" data-day="([^"]+)"( open)?>/g)].map(
    ([, key, open]) => [key, Boolean(open)],
  );

  assert.equal(opens.length, 2, 'one section per day');
  assert.equal(opens[0][1], true, 'today is open: it is the day the user is in');
  assert.equal(opens[1][1], false, 'and the day before it is put away');
});

test("a day's heading is the absolute date in a <time>, with its own words beside it", () => {
  const page = renderHomePage([settled({ postedAt: daysBack(1) })], [aRun()], MINE, true, {}, {}, NOW);
  const summary = firstHeadingOn(page);

  assert.match(
    summary,
    /<time datetime="2026-09-21" data-calendar="Mon 21 Sep">Mon 21 Sep<\/time>/,
    'the date is the text, so a page with no script reads correctly, and the words are on the ' +
      'element too so the browser can put them back after midnight',
  );
  assert.match(summary, /<span class="tally">1<\/span>/, 'and the count is text, not generated content');
});

test('a month heading is no <time> at all', () => {
  const page = renderHomePage([settled({ postedAt: daysBack(40) })], [aRun()], MINE, true, {}, {}, NOW);
  const summary = firstHeadingOn(page);

  assert.ok(summary.includes('Aug 2026'), 'the month is the heading');
  assert.ok(!summary.includes('<time'), 'there is no Today to read it as, so there is nothing to mark');
});

test('the tally is its own class, because the strip`s counts are already `count`', () => {
  // `everything.test.mjs` reads every `<span class="count">` on the page and
  // asserts the strip's three numbers are all of them. A fourth number in that
  // class would make the toggle look as though it had changed a tab's count.
  const page = renderHomePage([waiting(), settled()], [aRun()], MINE, true, {}, {}, NOW);

  assert.deepEqual(
    [...page.matchAll(/<span class="count">(\d+)<\/span>/g)].map(([, n]) => n),
    ['1', '1'],
    'the deck`s queue and this tab`s, and nothing else',
  );
  assert.match(uiFile('deck.css'), /\.tally/, 'and the tally is drawn, or it is a class saying nothing');
});

test('a section is a real disclosure, so it folds with no script at all', () => {
  const page = renderHomePage([settled({ postedAt: daysBack(1) })], [aRun()], MINE, true, {}, {}, NOW);

  assert.match(page, /<details class="day"[^>]*><summary>/, 'a <details> and a <summary>, as the tree is');
  assert.match(uiFile('deck.css'), /\.day > summary \{/, 'and it is drawn as a heading that can be pressed');
});

test('nothing waiting and nothing settled still says so once', () => {
  const page = renderHomePage([], [aRun()], MINE, true, {}, {}, NOW);

  assert.match(page, /<p class="empty">Nothing is waiting on you\.<\/p>/);
  assert.ok(!page.includes('<details class="day"'), 'and no empty heading above it');
});

test('the page files a card by the clock it is handed, and not by the wall', () => {
  // The reviewer's finding on this change, and the reason every render above is
  // given `NOW`: the tests here built their cards around a fixed calendar and
  // read them through a renderer that asked the real clock, so they were green
  // on the day they were written and would have gone red the next morning — the
  // open/shut one on 2026-09-23 and the heading one a fortnight later, with
  // nothing changed. A clock the renderer is handed is the only version of this
  // that can be asserted at all.
  const card = settled({ postedAt: daysBack(1) });
  const at = (now) => renderHomePage([card], [aRun()], MINE, true, {}, {}, now);
  const keys = (page) => [...page.matchAll(/data-day="([^"]+)"/g)].map(([, key]) => key);

  assert.deepEqual(keys(at(NOW)), ['2026-09-21'], 'the day before the clock it was given');
  assert.deepEqual(
    keys(at(new Date(2026, 8, 23, 12).getTime())),
    ['2026-09-21'],
    'a day later it is still the 21st, and now two days back',
  );
  assert.deepEqual(
    keys(at(new Date(2026, 9, 8, 12).getTime())),
    ['2026-09'],
    'and past the fortnight the very same card is filed under its month',
  );
  assert.ok(
    at(new Date(2026, 8, 21, 12).getTime()).includes('data-day="2026-09-21" open'),
    'while on the day itself that section is the open one',
  );
});

test('the fourteen days are one constant, read by the renderer and by nothing else', () => {
  const source = uiFile('render-pages.mjs');

  assert.equal(RECENT_DAYS, 14, 'the number the user asked for');
  assert.equal(
    (source.match(/RECENT_DAYS/g) ?? []).length,
    2,
    'declared once and read once: a second copy is a second answer to "how old is old"',
  );
});
