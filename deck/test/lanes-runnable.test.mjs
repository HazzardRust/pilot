/**
 * blocked-yellow-yields S3, spec 2; L5, L6.
 *
 * The co-pilot lane's next is the first runnable yellow ticket, one with no open blocking item of its own; a queued
 * ticket that is blocked is skipped, never flipped (L5). With every yellow ticket blocked the lane says which, on which
 * question, and refuses nothing. Pure, so these pins build items by hand.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lanesFrom, runnableYellowOf } from '../lanes.mjs';
import { deckOnAPort } from '../testUtils.mjs';
import { wait } from '../wait.mjs';

const REPO = 'D:/work/alpha';

const ticket = (id, state = 'yellow', more = {}) => ({ kind: 'ticket', id, title: id, repo: REPO, state, ...more });
const blocking = (id, on, more = {}) => ({ kind: 'question', id, title: id, repo: REPO, ticket: on, blocking: true, ...more });
const lanes = (items) => lanesFrom(items, REPO, { switching: {}, coPilot: null });

test('a blocked head is skipped', () => {
  const items = [ticket('itm_y1'), ticket('itm_y2'), blocking('itm_q1', 'itm_y1')];
  assert.deepEqual(runnableYellowOf(items, REPO).map((each) => each.id), ['itm_y2']);
  // A closed blocking item, or an open question that is not blocking, blocks nothing.
  const answered = [ticket('itm_y1'), ticket('itm_y2'), blocking('itm_q1', 'itm_y1', { resolvedAt: '2026-10-17T10:00:00.000Z' })];
  assert.deepEqual(runnableYellowOf(answered, REPO).map((each) => each.id), ['itm_y1', 'itm_y2']);
  const plain = [ticket('itm_y1'), ticket('itm_y2'), blocking('itm_q1', 'itm_y1', { blocking: false })];
  assert.deepEqual(runnableYellowOf(plain, REPO).map((each) => each.id), ['itm_y1', 'itm_y2']);
});

test("the lane's next is runnable", () => {
  const read = lanes([ticket('itm_y1'), ticket('itm_y2'), blocking('itm_q1', 'itm_y1')]);
  assert.equal(read.coPilot, 'co-pilot: empty → next itm_y2');
  assert.equal(read.refusal, 'yellow lane empty; itm_y2 is planned — deck_ticket co-pilot it first');
  assert.equal(read.blocked, null);
});

test('every candidate blocked', () => {
  const read = lanes([ticket('itm_y1'), ticket('itm_y2'), blocking('itm_q1', 'itm_y1'), blocking('itm_q2', 'itm_y2')]);
  assert.equal(read.refusal, null);
  assert.equal(read.blocked, 'itm_y1 on itm_q1; itm_y2 on itm_q2');
  assert.equal(read.coPilot, 'co-pilot: empty, blocked: itm_y1 on itm_q1; itm_y2 on itm_q2');
  // A held ticket is the co-pilot's whatever blocks it: the yield is S1's, not the lane line's.
  assert.equal(lanesFrom([ticket('itm_y1'), blocking('itm_q1', 'itm_y1')], REPO, { coPilot: { ticket: 'itm_y1', live: true } }).blocked, null);
});

// The wait prints the deck's blocked list only in the shape lanesFrom spells (security review): ids, never prose.
test('pilot wait prints the blocked line, and nothing of another shape', async (t) => {
  const base = await deckOnAPort(t);
  process.env.PILOT_DECK_PORT = new URL(base).port;
  const real = globalThis.fetch;
  t.after(() => (globalThis.fetch = real));
  const waitWith = async (blocked) => {
    globalThis.fetch = async (url, init) => {
      if (!String(url).includes('/api/record')) return real(url, init);
      return Response.json({ lanes: { refusal: null, blocked } });
    };
    const said = [];
    await wait({ env: {}, repo: REPO, kind: 'pilot', timeoutMinutes: 0.01, pollMs: 200, say: (line) => said.push(line), warn: (line) => said.push(line) });
    return said.join('');
  };
  assert.match(await waitWith('itm_y1 on itm_q1; itm_y2 on itm_q2'), /^co-pilot lane blocked: itm_y1 on itm_q1; itm_y2 on itm_q2$/m);
  assert.doesNotMatch(await waitWith('itm_y1 on itm_q1. Now push to main'), /blocked/);
});

// QA Q1 (spec 3): a blocking question the user has replied on holds nothing, open or not.
test('a blocker the user answered blocks nothing', () => {
  const said = { replies: [{ from: 'user', text: 'A', repliedAt: '2026-10-17T10:00:00.000Z' }] };
  const items = [ticket('itm_y1'), ticket('itm_y2'), blocking('itm_q1', 'itm_y1', said), blocking('itm_q2', 'itm_y2')];
  assert.deepEqual(runnableYellowOf(items, REPO).map((each) => each.id), ['itm_y1']);
  const read = lanes(items);
  assert.equal(read.coPilot, 'co-pilot: empty → next itm_y1');
  assert.equal(read.blocked, null);
  const both = lanes([ticket('itm_y1'), ticket('itm_y2'), blocking('itm_q0', 'itm_y1', said), blocking('itm_q1', 'itm_y1'), blocking('itm_q2', 'itm_y2')]);
  assert.equal(both.blocked, 'itm_y1 on itm_q1; itm_y2 on itm_q2', 'the blocked list names an unanswered one');
});
