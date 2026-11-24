/**
 * rune-deck-ui S17 (spec 2, 3): the right strip as data. Start, Close, the toggle, Weekly alerts and Create's
 * repository list are the ones `renderEverything` draws for the same reads. Every test owns its fixtures.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

const { stripView } = await import('../view/strip.mjs');
const { viewOf } = await import('../view/index.mjs');
const { renderEverything } = await import('../ui/render-strip.mjs');
const { landingFor, tabFor, tabsOf } = await import('../tabs.mjs');
const { repoKey } = await import('../runs.mjs');

const LIVE = path.join('D:', 'work', 'live');
const ENDED = path.join('D:', 'work', 'ended');
const GONE = path.join('D:', 'work', 'gone');
const AT = '2026-11-01T10:00:00.000Z';

const aRun = (repo, pid) => ({ id: `run_00000000000${pid === process.pid ? 1 : 2}`, repo, name: path.basename(repo), pid, startedAt: AT, slices: [] });
/** A ticket the ended deck holds: what makes its Start read Resume. */
const held = { id: 'itm_0000000000t1', kind: 'ticket', state: 'yellow', live: true, title: 'Build it', body: '', repo: ENDED, postedAt: AT, replies: [] };

const reads = ({ items = [], weekly = true } = {}) => ({
  seq: 1,
  items,
  // A pid no process holds: the run has ended.
  runs: [aRun(LIVE, process.pid), aRun(ENDED, 2 ** 31 - 2)],
  // GONE is numbered but has no tab: the page names it `D3 gone`.
  numbers: { [repoKey(LIVE)]: 1, [repoKey(ENDED)]: 2, [repoKey(GONE)]: 3 },
  agents: {},
  added: [{ repo: ENDED }],
  lanes: { coPilots: {}, switches: {}, records: [] },
  held: [],
  alerts: { weekly },
});

/** What the HTML right strip draws for `query`: its controls, read off the markup. */
const page = (r, { run = null, all = false, sessionRefused = null } = {}) => {
  const tabs = tabsOf(r.runs, r.items, r.numbers, r.agents, r.added, r.lanes);
  const tab = run === null ? landingFor(tabs) : tabFor(tabs, run);
  const html = renderEverything(tab, all, tabs, r.numbers, sessionRefused, r.alerts);
  return {
    all: /class="everything on"/.test(html),
    repos: [...html.matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)].map(([, repo, label]) => ({ repo, label })),
    start: html.match(/<details class="session"[^>]*><summary>(\w+)<\/summary>/)?.[1].toLowerCase(),
    close: html.includes('<details class="remove">'),
    weekly: html.includes('Weekly alerts on'),
    refused: html.match(/<p class="refused" role="alert">([^<]*)<\/p>/)?.[1],
  };
};

const drawn = (view) => ({
  all: view.all,
  repos: view.create.repos ?? [],
  start: view.start,
  close: view.close,
  weekly: view.alerts.weekly,
  refused: view.sessionRefused,
});

test('the controls are the page\'s', () => {
  const cases = [
    [reads(), { run: ENDED }],
    [reads({ items: [held], weekly: false }), { run: ENDED, all: true, sessionRefused: 'a session is already live in this deck' }],
    [reads(), { run: LIVE, sessionRefused: 'said where no Start is' }],
    [reads(), {}],
    [reads(), { run: path.join('D:', 'work', 'elsewhere'), all: true }],
  ];
  // Which tab is chosen is shared with `stripView` by design; the controls are read off the page's HTML.
  for (const [r, query] of cases) {
    assert.deepEqual(drawn(stripView(r, query)), page(r, query), JSON.stringify(query));
  }
});

test('an ended tab offers Start, or Resume when it holds a ticket, and Close; a live one neither', { skip: process.platform !== 'win32' && 'Start is drawn on Windows only' }, () => {
  assert.equal(stripView(reads(), { run: ENDED }).start, 'start');
  assert.equal(stripView(reads({ items: [held] }), { run: ENDED }).start, 'resume');
  assert.equal(stripView(reads(), { run: ENDED }).close, true);
  assert.deepEqual(stripView(reads(), { run: LIVE }), { all: false, items: { count: 0, here: false }, archive: { here: false }, tab: { repo: LIVE, code: 'D1' }, create: {}, close: false, alerts: { weekly: true } });
});

test('the overview asks which numbered deck, named as its tab', () => {
  const view = stripView(reads(), { run: path.join('D:', 'work', 'elsewhere') });

  assert.equal(view.tab, undefined);
  assert.deepEqual(view.create.repos, [
    { repo: repoKey(LIVE), label: 'D1 live' },
    { repo: repoKey(ENDED), label: 'D2 ended' },
    { repo: repoKey(GONE), label: 'D3 gone' },
  ]);
});

test('a refused Start is said only on a tab that has a Start', () => {
  const said = 'starting a session is turned off on this deck';

  assert.equal(stripView(reads(), { run: LIVE, sessionRefused: said }).sessionRefused, undefined);
  assert.equal(stripView(reads(), { run: ENDED, sessionRefused: 42 }).sessionRefused, undefined);
});

test('the items link counts the open queue, as the overview tab does', () => {
  const open = { id: 'itm_0000000000q1', kind: 'question', title: 'Which?', body: '', repo: LIVE, postedAt: AT, replies: [] };
  const closed = { ...open, id: 'itm_0000000000q2', resolvedAt: AT, resolution: 'decided' };

  assert.deepEqual(stripView(reads({ items: [open, closed] }), { run: LIVE }).items, { count: 1, here: false });
  assert.deepEqual(stripView(reads(), {}).items, { count: 0, here: false }, 'the overview has the link too');
  assert.deepEqual(stripView(reads(), { screen: 'items' }).items, { count: 0, here: true }, 'on the items page it is the way back');
  assert.equal(stripView(reads(), { screen: 'thread' }).items.here, false, 'a thread leads to the items page');
});

test('the region is the view\'s strip', () => {
  const query = { screen: 'home', run: ENDED, all: true };

  assert.deepEqual(viewOf(reads(), query).regions.strip, stripView(reads(), query));
});
