/**
 * S3 of walkthrough-surface (spec 3, 4; L11): a full-run gate2 that names no walkthrough carries QA's checks table,
 * `| spec line | result | evidence |` with a row per check and no empty cell, and a plan with a surface that names
 * no walkthrough says why not on a `surface planned, no walkthrough:` line. A legacy plan and a short path are read
 * as before; the deck refuses at post, before anything is written.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_GATE1, KIND_GATE2, KIND_TICKET, KIND_WALKTHROUGH, SIGN_OFF } from '../items.mjs';
import { DeckRefusal, addReply, listItems, postItem, resolveItem } from '../store.mjs';
import { gate2EvidenceGaps } from '../gate2-evidence.mjs';
import { shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/checks');
const TABLE_GAP = 'a gate2 with no walkthrough carries the checks table: | spec line | result | evidence |';
const WALKTHROUGH_GAP = 'a gate2 on a plan with a surface names its walkthrough or says why not: surface planned, no walkthrough: <reason>';
const REASON = 'surface planned, no walkthrough: the screen QA planned to show did not change';
const TABLE = [
  '| Spec line | Result | Evidence |',
  '| --- | --- | --- |',
  '| 1 | pass | node --test deck/test/a.test.mjs: 4 pass |',
  '| 2 | pass | node scripts/check-references.mjs: exit 0 |',
].join('\n');
const refused = (message) => (error) => error instanceof DeckRefusal && error.message === message;

/** A yellow ticket whose signed plan has three slices and the `surface` given. */
function signedPlan(surface) {
  const ticket = takeLive(postItem({ kind: KIND_TICKET, title: 'Wide', body: shapedTicketBody('wide'), repo: REPO, sliceCount: 3 }).id);
  const gate = postItem({
    kind: KIND_GATE1, title: 'Gate 1', body: 'The artefact.\nFonts: Inter\nColour means: red is blocked\nReference: VS Code\nBase: pilot', repo: REPO, artefact: 'docs/design/x/architecture.md',
    sha: '31efcb0', locked: 1, slices: '| S1 |', sliceCount: 3, branch: 'feat/x', ticket: ticket.id, surface,
  });
  addReply(gate.id, SIGN_OFF);
  resolveItem(gate.id, 'Signed off.');
  return listItems().find((item) => item.id === ticket.id);
}

const gate2 = (ticket, body) => postItem({ kind: KIND_GATE2, title: 'Gate 2', body, repo: REPO, pr: '#250', sha: '0305827', ticket: ticket.id });
const gate2s = () => listItems().filter((item) => item.kind === KIND_GATE2);

test('a no-surface gate2 with the table is accepted', (t) => {
  tempDeck(t);
  const ticket = signedPlan(false);
  assert.deepEqual(gate2EvidenceGaps(ticket, { body: `QA passed.\n\n${TABLE}` }), []);
  assert.equal(gate2(ticket, `QA passed.\n\n${TABLE}`).body, `QA passed.\n\n${TABLE}`);
});

test('a gate2 with neither is refused', (t) => {
  tempDeck(t);
  const ticket = signedPlan(false);
  assert.deepEqual(gate2EvidenceGaps(ticket, { body: 'QA passed.' }), [TABLE_GAP]);
  assert.throws(() => gate2(ticket, 'QA passed.'), refused(TABLE_GAP));
  assert.equal(gate2s().length, 0, 'nothing stored');
  assert.equal(listItems().find((item) => item.id === ticket.id).state, 'yellow', 'the refused post moved nothing');
});

test('a row without evidence is refused', (t) => {
  tempDeck(t);
  const ticket = signedPlan(false);
  const body = TABLE.replace('| 2 | pass | node scripts/check-references.mjs: exit 0 |', '| 2 | pass | |');
  assert.deepEqual(gate2EvidenceGaps(ticket, { body }), ['checks table row 2 has an empty cell']);
  assert.throws(() => gate2(ticket, body), refused('checks table row 2 has an empty cell'));
});

test('a surface gate2 without its walkthrough or a reason is refused', (t) => {
  tempDeck(t);
  const ticket = signedPlan(true);
  assert.deepEqual(gate2EvidenceGaps(ticket, { body: TABLE }), [WALKTHROUGH_GAP]);
  assert.throws(() => gate2(ticket, TABLE), refused(WALKTHROUGH_GAP));
  assert.deepEqual(gate2EvidenceGaps(ticket, { body: `${REASON}\n\n${TABLE}` }), []);
  assert.deepEqual(gate2EvidenceGaps(ticket, { body: REASON }), [TABLE_GAP], 'the reason never stands in for the table');
  assert.deepEqual(gate2EvidenceGaps(ticket, { body: `surface planned, no walkthrough:  \n\n${TABLE}` }), [WALKTHROUGH_GAP], 'a bare reason line is no reason');
  assert.deepEqual(gate2EvidenceGaps(ticket, { body: 'QA walked it.', walkthrough: 'itm_0a1b2c3d4e5f' }), [], 'a named walkthrough needs no table');
  assert.equal(gate2(ticket, `${REASON}\n\n${TABLE}`).ticket, ticket.id);
});

test('a hostile wide table is answered fast', (t) => {
  tempDeck(t);
  const ticket = signedPlan(false);
  const body = [`|spec|result|evidence${'|'.repeat(30000)}`, '|-|', ...Array(7500).fill('|a|')].join('\n');
  const started = Date.now();
  assert.throws(() => gate2(ticket, body), refused('checks table row 1 has an empty cell'));
  assert.ok(Date.now() - started < 1000, `answered in ${Date.now() - started} ms`);
});

test('a gate2 names a real walkthrough on its own ticket', (t) => {
  tempDeck(t);
  const ticket = signedPlan(true);
  const named = (walkthrough) => postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'QA walked it.', repo: REPO, pr: '#250', sha: '0305827', ticket: ticket.id, walkthrough });
  const unwalked = (error) => error instanceof DeckRefusal && /names a walkthrough on its ticket/.test(error.message) && !/itm_/.test(error.message);
  assert.throws(() => named('itm_0a1b2c3d4e5f'), unwalked, 'a made-up id');
  const elsewhere = postItem({ kind: KIND_WALKTHROUGH, title: 'Try it', body: 'Step one.', repo: REPO });
  assert.throws(() => named(elsewhere.id), unwalked, 'a walkthrough on no ticket');
  assert.equal(gate2s().length, 0, 'nothing stored');
  const walk = postItem({ kind: KIND_WALKTHROUGH, title: 'Try it', body: 'Step one.', repo: REPO, ticket: ticket.id });
  assert.equal(named(walk.id).walkthrough, walk.id);
});

test('a legacy full run is unchanged', () => {
  assert.deepEqual(gate2EvidenceGaps({ plan: { sliceCount: 3 } }, { body: 'QA passed.' }), []);
});
