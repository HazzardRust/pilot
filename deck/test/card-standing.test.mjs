/**
 * S2 of nothing-hidden: a card names its ticket and where that ticket stands (spec 5, A3, A4),
 * through `renderCard`, with the one helper the thread page's header already uses.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { repoKey } from '../items.mjs';
import { renderCard } from '../ui/render-cards.mjs';
import { renderThreadPage } from '../ui/render-pages.mjs';

const REPO = 'D:/work/alpha';
const NOW = '2026-10-17T10:00:00.000Z';
const ticket = (id, state, extra = {}) => ({ id, kind: 'ticket', title: `Ticket ${id}`, body: 'b', repo: REPO, state, replies: [], postedAt: NOW, ...extra });
const thread = (on) => ({ id: 'itm_t00000000001', kind: 'question', title: 'A thread', body: 'Why?', repo: REPO, ticket: on, replies: [], postedAt: NOW });
const standingIn = (html) => /<span class="standing">([^<]*)<\/span>/.exec(html)?.[1];

test('a card says its ticket and standing', () => {
  const green = ticket('itm_a00000000001', 'green');
  const html = renderCard(thread(green.id), { items: [green, thread(green.id)] });
  assert.match(html, /<a class="ref ticket" href="\/thread\/itm_a00000000001">Ticket itm_a00000000001<\/a>/);
  assert.equal(standingIn(html), 'in hand');

  const yellow = ticket('itm_b00000000001', 'yellow');
  const lanes = { coPilots: { [repoKey(REPO)]: yellow.id }, switches: {} };
  assert.equal(standingIn(renderCard(thread(yellow.id), { items: [yellow], lanes })), 'co-pilot');

  const paused = ticket('itm_c00000000001', 'green', { paused: { question: 'itm_q1', at: NOW } });
  assert.match(standingIn(renderCard(thread(paused.id), { items: [paused] })), /^paused on /);
});

test('a merged-away or itemless card names nothing', () => {
  const host = ticket('itm_a00000000001', 'green');
  const merged = ticket('itm_b00000000001', 'green', { mergedInto: host.id });
  for (const html of [
    renderCard(thread(merged.id), { items: [host, merged] }),
    renderCard(thread('itm_000000000000'), { items: [host] }),
    renderCard(thread(host.id)),
  ]) {
    assert.ok(!html.includes('class="ref ticket"'), html);
    assert.ok(!html.includes('class="standing"'), html);
  }
});

test('the card and the thread page say the same word', () => {
  const lanes = { coPilots: {}, switches: {} };
  const green = ticket('itm_a00000000001', 'green');
  const paused = ticket('itm_c00000000001', 'green', { paused: { question: 'itm_q1', at: NOW } });
  const merged = ticket('itm_b00000000001', 'green', { mergedInto: green.id });
  for (const on of [green, paused, merged]) {
    const item = thread(on.id);
    const items = [green, paused, merged, item];
    const card = renderCard(item, { items, lanes });
    const page = renderThreadPage(item, items, [], {}, {}, false, [], null, lanes);
    assert.equal(standingIn(page), standingIn(card), on.id);
    assert.equal(page.includes('class="ref ticket"'), card.includes('class="ref ticket"'), on.id);
  }
});
