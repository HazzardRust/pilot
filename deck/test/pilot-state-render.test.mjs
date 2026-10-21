/**
 * pilot-state-line S1: the state line on a repo tab (spec 1, 8; L7).
 *
 * Claims about bytes, so tests against the renderer: where the line sits on the page and
 * what it escapes. The run is this process, so its tab is live.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

const { renderHomePage, renderStateLine } = await import('../ui/render-pages.mjs');

const MINE = path.join(os.tmpdir(), 'pilot-state-mine');
const AT = '2026-10-15T09:00:00.000Z';
const NOW = Date.parse('2026-10-15T09:30:00.000Z');

const aRun = () => ({ id: 'run_000000000001', repo: MINE, name: 'pilot', pid: process.pid, startedAt: AT, lastSeenAt: AT, slices: [] });
const aHandoff = { id: 'itm_00000000000h', kind: 'handoff', title: 'Hand-off', body: 'b', repo: MINE, postedAt: AT, owner: 'pilot' };
const homeOf = (items) =>
  renderHomePage(items, [aRun()], MINE, false, {}, {}, NOW, [], null, {}, null, { weekly: true }, { coPilots: {}, switches: {} }, {});

test('the line sits under the last card', () => {
  const page = homeOf([aHandoff]);
  const line = page.indexOf('class="pilot-state"');
  assert.ok(line > 0, 'the tab carries a state line');
  assert.match(page, /data-pilot-state="handing off"/);
  assert.ok(page.lastIndexOf('</article>') < line, 'after the last card');
  assert.ok(line < page.indexOf('</main>'), 'inside the live queue');
});

test('an empty tab shows the line under Nothing is waiting on you', () => {
  const page = homeOf([]);
  const empty = page.indexOf('<p class="empty">Nothing is waiting on you.</p>');
  const line = page.indexOf('class="pilot-state"');
  assert.ok(empty > 0, 'the empty paragraph, untouched');
  assert.ok(line > empty, 'the line under it');
  assert.match(page, /data-pilot-state="quiet"/);
});

test('the line escapes the ticket title and carries a time', () => {
  const html = renderStateLine({ state: 'handing off', since: AT, ticket: '<b>x</b> & y' });
  assert.match(html, /^<p class="pilot-state" data-pilot-state="handing off">/);
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt; &amp; y/);
  assert.doesNotMatch(html, /<b>/);
  assert.match(html, new RegExp(`<time datetime="${AT}">`));
  assert.match(renderStateLine({ state: 'no session', since: null, ticket: null }), /no live ticket/);
  assert.doesNotMatch(renderStateLine({ state: 'no session', since: null, ticket: null }), /<time/);
});

test('a whole line reads name, state, ticket and time in that order', () => {
  assert.equal(
    renderStateLine({ state: 'working', since: AT, ticket: 'Ship it' }, 'pilot'),
    `<p class="pilot-state" data-pilot-state="working">pilot · working · Ship it · <time datetime="${AT}">${AT}</time></p>`,
  );
});
