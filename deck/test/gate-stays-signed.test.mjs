/**
 * A signed gate stays signed (gate-stays-signed spec 1, 2, 3, 5; L1-L3, A1, ADR 0114): on a gate the
 * choice is the newest press, so a typed reply after Sign off leaves it signed and a Not yet withdraws
 * it; a gate2 whose own landing is running or landed refuses every press and stores nothing, and still
 * closes on the press it holds. Every other kind keeps reading the newest user message.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_GATE1, KIND_GATE2, KIND_QUESTION, KIND_TICKET, NOT_YET, SIGN_OFF, chosenOf } from '../items.mjs';
import { DeckRefusal, addReply, beginLanding, listItems, postItem, resolveItem, settleLanding } from '../store.mjs';
import { postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.join('D:', 'work', 'pilot');
const GATE1 = { artefact: 'docs/design/x/architecture.md', sha: '0305827', locked: 3, slices: '| S1 |', sliceCount: 3, branch: 'feat/x' };
const SHA = '97b4833c0ffee0000000000000000000000000000';
const reread = (id) => listItems().find((item) => item.id === id);

function aGate1() {
  const ticket = takeLive(postItem({ kind: KIND_TICKET, sliceCount: 60, title: 'Apple', body: shapedTicketBody(), repo: REPO }).id);
  return { ticket, gate: postItem({ kind: KIND_GATE1, title: 'Gate 1', body: 'The design.', repo: REPO, ...GATE1, ticket: ticket.id }) };
}

function aGate2() {
  const { id } = postStored({ kind: KIND_TICKET, title: 'Pear', body: shapedTicketBody(), repo: REPO, state: 'yellow' });
  takeLive(id);
  return postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, pr: '#250', sha: '0305827', ticket: id });
}

/** The incident of itm_0a0c97923957: Sign off, landed at 97b4833, then a typed reply. */
function aLandedGate2() {
  const gate = aGate2();
  addReply(gate.id, SIGN_OFF);
  beginLanding(gate.id, { worktree: 'D:/work/pilot-wt' });
  settleLanding(gate.id, { ok: true, sha: SHA, line: 'landed at 97b4833' });
  addReply(gate.id, 'added the rule');
  return gate;
}

test('a typed reply after Sign off leaves a gate1 signed', (t) => {
  tempDeck(t);
  const { ticket, gate } = aGate1();
  addReply(gate.id, SIGN_OFF);
  addReply(gate.id, 'one more thought on the plan');
  resolveItem(gate.id, 'Signed off.');
  assert.ok(reread(gate.id).resolvedAt, 'the gate1 closes');
  assert.equal(reread(ticket.id).state, 'yellow');
  assert.ok(reread(ticket.id).plan, 'with its plan');
});

test('a typed reply after Sign off leaves a gate2 signed', (t) => {
  tempDeck(t);
  const gate = aGate2();
  addReply(gate.id, SIGN_OFF);
  addReply(gate.id, 'added the rule');
  assert.equal(chosenOf(reread(gate.id)), SIGN_OFF);
});

test('Not yet after Sign off withdraws it', (t) => {
  tempDeck(t);
  const { gate } = aGate1();
  addReply(gate.id, SIGN_OFF);
  addReply(gate.id, NOT_YET);
  addReply(gate.id, 'typed text withdraws nothing, and restores nothing');
  assert.throws(() => resolveItem(gate.id, 'Signed off.'), (error) => error instanceof DeckRefusal && /has not signed/.test(error.message));
});

test('every press on a landed gate2 is refused and stores nothing', (t) => {
  tempDeck(t);
  const gate = aLandedGate2();
  const replies = reread(gate.id).replies.length;
  for (const press of [SIGN_OFF, NOT_YET, `${NOT_YET}\n\nwait`]) {
    assert.throws(() => addReply(gate.id, press), (error) => error instanceof DeckRefusal && error.message === `gate2 ${gate.id} is landed at 97b4833; nothing run`);
  }
  assert.equal(reread(gate.id).replies.length, replies, 'nothing stored');
});

test('a Not yet on a gate2 whose own landing is running is refused; one landing elsewhere in the repo refuses no press', (t) => {
  tempDeck(t);
  const running = aGate2();
  addReply(running.id, SIGN_OFF);
  beginLanding(running.id, { worktree: 'D:/work/pilot-wt' });
  const replies = reread(running.id).replies.length;
  assert.throws(() => addReply(running.id, NOT_YET), (error) => error instanceof DeckRefusal && /is landing since/.test(error.message));
  assert.equal(reread(running.id).replies.length, replies, 'nothing stored');
  const other = aGate2();
  addReply(other.id, NOT_YET);
  assert.equal(chosenOf(reread(other.id)), NOT_YET, 'Not yet on another gate2 is stored');
  addReply(other.id, SIGN_OFF);
  assert.equal(chosenOf(reread(other.id)), SIGN_OFF, 'a Sign off on another gate2 is stored: its landing queues (gate2-frees-lane spec 7)');
});

test('a landed gate2 with a typed reply after its press closes, and the report posts', (t) => {
  tempDeck(t);
  const gate = aLandedGate2();
  resolveItem(gate.id, 'Signed off and landed.');
  assert.ok(reread(gate.id).resolvedAt, 'the gate2 closes');
  const report = postItem({ kind: 'report', title: 'Report', body: 'Done.', repo: REPO, ticket: gate.ticket });
  assert.equal(report.ticket, gate.ticket);
});

test("a question's typed reply after a press still chooses nothing", (t) => {
  tempDeck(t);
  const question = postItem({ kind: KIND_QUESTION, title: 'Which?', body: 'which?', repo: REPO, options: ['A', 'B'], recommended: 'A' });
  addReply(question.id, 'A');
  addReply(question.id, 'and one more thing');
  assert.equal(chosenOf(reread(question.id)), null);
});

test('a gate2 landing in the repository does not refuse a Sign off on a gate1 there', (t) => {
  tempDeck(t);
  const running = aGate2();
  addReply(running.id, SIGN_OFF);
  beginLanding(running.id, { worktree: 'D:/work/pilot-wt' });
  const { gate } = aGate1();
  addReply(gate.id, SIGN_OFF);
  assert.equal(chosenOf(reread(gate.id)), SIGN_OFF, 'the gate1 Sign off is stored');
});
