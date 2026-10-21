/**
 * pilot-state-line S5: the Overview shows one state line per tab, named, in strip order (spec 11; A1).
 *
 * Claims about bytes, so tests against the renderer. Both runs are this process, so both tabs are live
 * and a bare URL lands on the Overview (no sole live run).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

const { renderHomePage } = await import('../ui/render-pages.mjs');

const ALPHA = path.join(os.tmpdir(), 'pilot-state-alpha');
const BRAVO = path.join(os.tmpdir(), 'pilot-state-bravo');
const AT = '2026-10-15T09:00:00.000Z';
const NOW = Date.parse('2026-10-15T09:30:00.000Z');

const aRun = (n, repo, name) => ({ id: `run_00000000000${n}`, repo, name, pid: process.pid, startedAt: AT, lastSeenAt: AT, slices: [] });
// Bravo's run first, so the strip (store order) is not alphabetical and an order the line drew for itself shows.
const RUNS = [aRun(1, BRAVO, 'bravo'), aRun(2, ALPHA, 'alpha')];
const STRIP = ['pilot-state-bravo', 'pilot-state-alpha'];
const aHandoff = { id: 'itm_00000000000h', kind: 'handoff', title: 'Hand-off', body: 'b', repo: BRAVO, postedAt: AT, owner: 'pilot' };
const homeOf = (items, selected = null) =>
  renderHomePage(items, RUNS, selected, false, {}, {}, NOW, [], null, {}, null, { weekly: true }, { coPilots: {}, switches: {} }, {});
const linesOf = (page) => [...page.matchAll(/<p class="pilot-state" data-pilot-state="([^"]+)">([^<]*)/g)];

test('the Overview shows a named line per tab', () => {
  const page = homeOf([aHandoff]);
  const lines = linesOf(page);
  assert.equal(lines.length, 2, 'one line per tab');
  const names = lines.map(([, , text]) => text.split(' · ')[0]);
  const [first, second] = STRIP.map((name) => page.indexOf(`>${name}<`));
  assert.ok(first > 0 && first < second, 'the strip draws bravo before alpha');
  assert.deepEqual(names, STRIP, 'each named, in strip order');
  const card = page.lastIndexOf('</article>');
  assert.ok(card > 0 && lines.every((match) => match.index > card), 'under the queue');
  const bravo = lines.find(([, , text]) => text.startsWith('pilot-state-bravo · '));
  assert.equal(bravo[1], 'handing off', 'each line is its own tab state');
  assert.equal(lines.find(([, , text]) => text.startsWith('pilot-state-alpha · '))[1], 'quiet');
});

test('an empty Overview still shows them', () => {
  const page = homeOf([]);
  const empty = page.indexOf('<p class="empty">Nothing is waiting on you.</p>');
  assert.ok(empty > 0, 'the empty paragraph, untouched');
  const lines = linesOf(page);
  assert.equal(lines.length, 2);
  assert.ok(lines.every((match) => match.index > empty), 'the lines under it');
  assert.ok(lines.every((match) => match.index < page.indexOf('</main>')), 'inside the live queue');
});

test('a tab shows its own line unnamed', () => {
  const page = homeOf([aHandoff], BRAVO);
  const lines = linesOf(page);
  assert.equal(lines.length, 1, 'one line');
  assert.match(lines[0][2], /^handing off · /, 'no name prefix');
});
