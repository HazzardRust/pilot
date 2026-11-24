/**
 * Slice S2 of handoff-self-close (spec 5, L4, L5): a crew-handoff nobody closed in `CREW_WAIT_MS` reads `waiting <age>`
 * on its card and page, derived off the clock and never stored, and the deck repaints at the mark. The clock is each
 * test's own (`mock.timers`); every test takes its own store.
 */

import './no-open.mjs';

import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { CREW_WAIT_MS } from '../crew-handoff.mjs';
import { crewWaitingOf } from '../crew-wait.mjs';
import { settleCrew } from '../crew-settle.mjs';
import { HANDOFF_FAILED, KIND_CREW_HANDOFF, threadState } from '../items.mjs';
import { addPilotMessage, addReply, listItems, postItem } from '../store.mjs';
import { renderHomePage, renderThreadPage } from '../ui/render.mjs';
import { tempDeck } from '../testUtils.mjs';

const MIN = 60_000;
const START = Date.parse('2026-11-20T10:00:00Z');
const REPO = path.join('D:', 'work', 'pilot');

const crewHandoff = (over = {}) => ({
  id: 'itm_c', kind: KIND_CREW_HANDOFF, title: 'Handoff: paused itself', body: 'b', repo: REPO, ticket: 'itm_t',
  postedAt: new Date(START).toISOString(), replies: [], ...over,
});
const reread = (id) => listItems().find((item) => item.id === id);
const stateSpan = (html) => /<span class="state" data-state="([a-z]+)">([^<]*)<\/span>/.exec(html);

test('an 11-minute item reads waiting', () => {
  assert.equal(CREW_WAIT_MS, 10 * MIN);
  assert.equal(crewWaitingOf(crewHandoff(), START + 11 * MIN), 'waiting 11m');
  assert.equal(crewWaitingOf(crewHandoff(), START + 9 * MIN), null);
  assert.equal(crewWaitingOf(crewHandoff(), START + 10 * MIN - 1), null, 'one millisecond short');
  assert.equal(crewWaitingOf(crewHandoff(), START + 65 * MIN), 'waiting 1h05m');
});

test('only an open crew-handoff with a readable postedAt waits', () => {
  assert.equal(crewWaitingOf(crewHandoff({ kind: 'handoff' }), START + 60 * MIN), null);
  assert.equal(crewWaitingOf(crewHandoff({ resolvedAt: new Date(START + MIN).toISOString() }), START + 60 * MIN), null);
  assert.equal(crewWaitingOf(crewHandoff({ postedAt: undefined }), START + 60 * MIN), null);
});

test('a ticketless item waits too', () => {
  assert.equal(crewWaitingOf(crewHandoff({ ticket: undefined }), START + 11 * MIN), 'waiting 11m');
});

test('card and page say it', (t) => {
  tempDeck(t);
  t.mock.timers.enable({ apis: ['Date'], now: START });
  const item = postItem({ kind: KIND_CREW_HANDOFF, title: 'Handoff: paused itself', body: 'b', repo: REPO });

  t.mock.timers.tick(9 * MIN);
  assert.equal(threadState(reread(item.id)), 'posted');
  t.mock.timers.tick(2 * MIN);
  assert.equal(threadState(reread(item.id)), 'waiting 11m');
  const thread = stateSpan(renderThreadPage(reread(item.id)));
  assert.deepEqual([thread?.[1], thread?.[2]], ['waiting', 'waiting 11m']);
  const card = stateSpan(renderHomePage(listItems(), [], null));
  assert.deepEqual([card?.[1], card?.[2]], ['waiting', 'waiting 11m']);
});

test('a pressed item keeps its press state', (t) => {
  tempDeck(t);
  t.mock.timers.enable({ apis: ['Date'], now: START });
  const item = postItem({ kind: KIND_CREW_HANDOFF, title: 'Handoff: paused itself', body: 'b', repo: REPO });
  t.mock.timers.tick(11 * MIN);
  addReply(item.id, HANDOFF_FAILED);

  assert.equal(crewWaitingOf(reread(item.id), Date.now()), null);
  assert.equal(threadState(reread(item.id)), 'not picked up yet');
  addPilotMessage(item.id, 'Looking.', '');
  assert.equal(crewWaitingOf(reread(item.id), Date.now()), 'waiting 11m', 'the pilot answered, so the press is not holding it');
});

test('the deck repaints at the mark', (t) => {
  tempDeck(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START });
  postItem({ kind: KIND_CREW_HANDOFF, title: 'Handoff: paused itself', body: 'b', repo: REPO });
  let announced = 0;
  const announce = () => { announced += 1; };

  settleCrew(announce);
  settleCrew(announce);
  t.mock.timers.tick(CREW_WAIT_MS - 1);
  assert.equal(announced, 0, 'none before the mark');
  t.mock.timers.tick(1);
  assert.equal(announced, 1, 'one at 10 minutes, however often it was armed');
});
