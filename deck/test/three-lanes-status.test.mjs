/**
 * three-lanes S6, spec 13 (L8, A6): the Status tab carries a selector over the held lanes' tickets, links that put
 * `ticket=<id>` in the address. Choosing one draws that ticket's record; one held lane draws no selector; an id that is
 * no held lane's ticket is ignored and never echoed; a chosen ticket with no record says so. Every test owns its store.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { aTicket as storedTicket, deckOnAPort } from '../testUtils.mjs';

const { renderStrips } = await import('../ui/render-rail.mjs');
const { tabFor, tabsOf } = await import('../tabs.mjs');
const { repoKey } = await import('../runs.mjs');
const { registerRun, takeTicket } = await import('../store.mjs');

const MINE = path.join('D:', 'work', 'pilot');
const AT = '2026-10-15T10:00:00.000Z';

/** A ticket as the store writes one, in `state`. */
const aTicket = (id, state, over = {}) => ({ id, kind: 'ticket', state, title: `ticket ${id}`, body: '', repo: MINE, postedAt: AT, replies: [], ...over });

const aRun = (over = {}) => ({ id: 'run_000000000001', repo: MINE, name: 'pilot', pid: process.pid, startedAt: AT, slices: [], ...over });

/** MINE's tab, its co-pilot holding `co-pilot` and `records` its stored run records (S5 A-f6). */
const tabOf = (items, coPilot = null, records = [], runs = [aRun()]) =>
  tabFor(
    tabsOf(runs, items, {}, {}, [], {}, { coPilots: coPilot ? { [repoKey(MINE)]: coPilot } : {}, switches: {}, records: records.map((record) => ({ repo: repoKey(MINE), record })) }),
    MINE,
  );

const panelOf = (html) => html.split('id="status"')[1].split('</details>')[0];
const linksOf = (html) => [...html.matchAll(/<a [^>]*>[^<]*<\/a>/g)].map(([link]) => link);
/** The Status panel's selector as the tab draws it, else ''. */
const selectorOf = (tab, items) => panelOf(renderStrips(tab, [tab], items)).match(/<nav class="status-select"[^]*?<\/nav>/)?.[0] ?? '';

/** Three held lanes: a live planning ticket, the co-pilot's implementing one, a live concluding one. */
const threeHeld = () => {
  const red = aTicket('itm_0000000000c1', 'red', { live: true, title: 'Plan the kettle' });
  const yellow = aTicket('itm_0000000000c2', 'yellow', { title: 'Build the kettle' });
  const green = aTicket('itm_0000000000c3', 'green', { live: true, title: 'Ship the kettle' });
  const records = [
    { slug: 'build', ticket: yellow.id, slices: [{ slice: 'S1 the yellow slice', state: 'implementing' }] },
    { slug: 'ship', ticket: green.id, slices: [{ slice: 'S1 the green slice', state: 'merged' }] },
  ];
  const items = [red, yellow, green];
  return { red, yellow, green, items, tab: tabOf(items, yellow.id, records) };
};

test('three held lanes show a three-entry selector, implementing chosen', () => {
  const { red, yellow, green, items, tab } = threeHeld();
  const links = linksOf(selectorOf(tab, items));
  assert.equal(links.length, 3, 'one link per held lane');
  for (const ticket of [red, yellow, green]) {
    assert.ok(links.some((link) => link.includes(`ticket=${ticket.id}"`) && link.includes(ticket.title)), `a link to ${ticket.id}, by its title`);
  }
  const current = links.filter((link) => link.includes('aria-current'));
  assert.equal(current.length, 1, 'one chosen');
  assert.match(current[0], new RegExp(`ticket=${yellow.id}"`), 'the implementing one');
  assert.match(current[0], /implementing/, 'labelled by its stage, implementing by default');
  const overview = panelOf(renderStrips(null, [tab], items, { ticket: yellow.id }));
  assert.doesNotMatch(overview, /status-select/, 'the overview draws no selector (A6)');
  assert.match(overview, /S1 the yellow slice/, "but the tab's default record");
});

test('choosing the concluding ticket draws its record', () => {
  const { green, items, tab } = threeHeld();
  const panel = panelOf(renderStrips(tab, [tab], items, { ticket: green.id }));
  assert.match(panel, /S1 the green slice/, "the concluding ticket's record");
  assert.doesNotMatch(panel, /S1 the yellow slice/, "and not the implementing ticket's");
  assert.ok(panel.indexOf('<section class="tree">') > panel.indexOf('<table class="slices">'), 'its table, then its graph');
  const current = linksOf(panel).filter((link) => link.includes('aria-current'));
  assert.deepEqual(current.length, 1);
  assert.match(current[0], new RegExp(`ticket=${green.id}"`), 'the selector marks the concluding one');
});

test("the chosen record's feature heads its table and graph, not the tab's name (QA F1)", () => {
  const yellow = aTicket('itm_0000000000e1', 'yellow');
  const green = aTicket('itm_0000000000e2', 'green', { live: true });
  const records = [
    { slug: 'build', feature: 'Build the kettle', ticket: yellow.id, slices: [{ slice: 'S1 build', state: 'implementing' }] },
    { slug: 'ship', feature: 'Ship the kettle', ticket: green.id, slices: [{ slice: 'S1 ship', state: 'merged' }] },
  ];
  const items = [yellow, green];
  const tab = tabOf(items, yellow.id, records);
  const panel = panelOf(renderStrips(tab, [tab], items, { ticket: green.id }));
  const heads = [...panel.matchAll(/<span class="run"[^>]*>([^<]*)<\/span>/g)].map(([, head]) => head);
  assert.deepEqual(heads, ['Ship the kettle', 'Ship the kettle'], 'the table, then the graph');
});

test('one held lane shows no selector', () => {
  const yellow = aTicket('itm_0000000000d1', 'yellow');
  const items = [yellow, aTicket('itm_0000000000d2', 'red')];
  const tab = tabOf(items, yellow.id);
  assert.equal(selectorOf(tab, items), '');
});

test("a ticket id that is no held lane's is ignored and never echoed", async (t) => {
  const origin = await deckOnAPort(t);
  const repo = path.resolve('D:/work/pilot');
  const planning = storedTicket('Plan it', 'red', repo);
  const concluding = storedTicket('Ship it', 'green', repo);
  const queued = storedTicket('Later', 'red', repo);
  takeTicket(planning.id);
  takeTicket(concluding.id);
  registerRun({ repo, pid: process.pid });

  for (const ticket of [queued.id, 'itm_bogus"><script>x</script>']) {
    const response = await fetch(`${origin}/?run=${encodeURIComponent(repo)}&ticket=${encodeURIComponent(ticket)}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(!html.includes('bogus'), 'the unvalidated id is nowhere on the page');
    const panel = panelOf(html);
    const current = linksOf(panel).filter((link) => link.includes('aria-current'));
    assert.equal(current.length, 1, 'the default selection');
    assert.match(current[0], new RegExp(`ticket=${concluding.id}"`), 'the concluding ticket, the first held after no co-pilot');
    assert.ok(!panel.includes(`ticket=${queued.id}`), 'a queued ticket is no entry');
  }
});

test('a planning ticket with no record says so', () => {
  const { red, items, tab } = threeHeld();
  const panel = panelOf(renderStrips(tab, [tab], items, { ticket: red.id }));
  assert.match(panel, /<p class="empty">no slice table yet<\/p>/);
  assert.doesNotMatch(panel, /<table class="slices">/, "and no other ticket's table in its place");
});
