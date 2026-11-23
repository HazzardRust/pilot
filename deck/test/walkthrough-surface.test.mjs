/**
 * S2 of walkthrough-surface (spec 1, 5, 6; L1–L3, L7): every gate1 names `surface`, the signed plan keeps it,
 * `false` included, and QA's walkthrough on a plan marked with no surface is refused naming the plan's artefact.
 * The pilot's wizard and a plan signed before `surface` existed are walked as before.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_GATE1, KIND_TICKET, KIND_WALKTHROUGH, SIGN_OFF } from '../items.mjs';
import { DeckRefusal, addReply, listItems, postItem, resolveItem } from '../store.mjs';
import { walkthroughPlanGaps } from '../gate2-evidence.mjs';
import { shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/surface');
const ARTEFACT = 'docs/design/x/architecture.md';
const QA = 'pilot:pilot-qa';
const refused = (pattern) => (error) => error instanceof DeckRefusal && pattern.test(error.message);

const redTicket = () => takeLive(postItem({ kind: KIND_TICKET, title: 'Wide', body: shapedTicketBody('wide'), repo: REPO, sliceCount: 3 }).id);

const gate1 = (ticket, extra = {}) =>
  postItem({
    kind: KIND_GATE1, title: 'Gate 1', body: 'The artefact.\nFonts: Inter\nColour means: red is blocked\nReference: VS Code', repo: REPO, artefact: ARTEFACT,
    sha: '31efcb0', locked: 1, slices: '| S1 |', sliceCount: 3, branch: 'feat/x', ticket: ticket.id, ...extra,
  });

/** The ticket, re-read, once a gate1 with `extra` is signed off. */
function signed(extra) {
  const ticket = redTicket();
  const gate = gate1(ticket, extra);
  addReply(gate.id, SIGN_OFF);
  resolveItem(gate.id, 'Signed off.');
  return listItems().find((item) => item.id === ticket.id);
}

test('a 3-slice gate1 without surface is refused', (t) => {
  tempDeck(t);
  assert.throws(() => gate1(redTicket()), refused(/^a gate1 of 3 slices names surface: true or false$/));
  assert.equal(listItems().filter((item) => item.kind === KIND_GATE1).length, 0, 'nothing stored');
});

test('a signed plan keeps surface false', (t) => {
  tempDeck(t);
  assert.equal(signed({ surface: false }).plan.surface, false);
  tempDeck(t);
  assert.equal(signed({ surface: true }).plan.surface, true);
});

test('QA cannot walk a plan with no surface', (t) => {
  tempDeck(t);
  const ticket = signed({ surface: false });
  const walk = () => postItem({ kind: KIND_WALKTHROUGH, title: 'Try it', body: 'Step one.', repo: REPO, author: QA, ticket: ticket.id });
  assert.throws(walk, refused(/docs\/design\/x\/architecture\.md/));
  assert.equal(listItems().filter((item) => item.kind === KIND_WALKTHROUGH).length, 0, 'nothing stored');
});

test("the pilot's wizard still walks it", (t) => {
  tempDeck(t);
  const ticket = signed({ surface: false });
  assert.equal(postItem({ kind: KIND_WALKTHROUGH, title: 'Do this', body: 'Step one.', repo: REPO, ticket: ticket.id }).kind, KIND_WALKTHROUGH);
});

test('a legacy plan is walked as before', () => {
  assert.deepEqual(walkthroughPlanGaps({ plan: { artefact: ARTEFACT, sliceCount: 3 } }, 'qa'), []);
  assert.deepEqual(walkthroughPlanGaps({}, 'qa'), [], 'no plan');
  assert.deepEqual(walkthroughPlanGaps(undefined, 'qa'), [], 'no ticket');
});
