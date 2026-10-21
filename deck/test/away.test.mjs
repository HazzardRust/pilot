/**
 * In yellow the user is away (thread-types-phase spec 6, L7, L12): a question posted while
 * its directory is implementing must carry `recommended`, is stamped `away` and left open,
 * and the post's answer tells the agent to go with that default. Gate items never are.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

import { tempDeck, withTicket } from '../testUtils.mjs';

const { awaitsPilot } = createRequire(import.meta.url)('../../hooks/lib/deck.js');
const { isOpen } = await import('../items.mjs');
const { addReply, listItems, postItem, resolveItem } = await import('../store.mjs');
const { callTool } = await import('../server.mjs');
const { renderHomePage, renderThreadPage } = await import('../ui/render.mjs');

const MINE = path.join('D:', 'work', 'pilot');

const aQuestion = (over = {}) => ({
  kind: 'question',
  title: 'Which?',
  body: 'b',
  options: ['Yes', 'No'],
  repo: MINE,
  ...over,
});

const EVIDENCE = { 1: { artefact: 'docs/design/x/architecture.md', sha: '0305827', locked: 3, slices: '| S1 |' }, 2: { pr: '#1', sha: '0305827' } };
// A gate1 names a red ticket and a gate2 a yellow one (ticket-states spec 2), put here first.
const evidence = (gate) => withTicket(EVIDENCE[gate], MINE, gate === '1' ? 'red' : 'yellow');

/** A deck of this test's own whose directory has passed the gates named. */
function deckIn(t, ...gates) {
  tempDeck(t);
  for (const gate of gates) {
    const { id } = postItem({ kind: `gate${gate}`, title: `Gate ${gate}`, body: 'b', repo: MINE, ...evidence(gate) });
    // Only a Sign off reply turns a gate1's ticket yellow (ticket-states L11).
    addReply(id, 'Sign off');
    resolveItem(id, 'Sign off');
  }
}

const stored = (id) => listItems().find((item) => item.id === id);
const textOf = (answer) => answer.content[0].text;

test('a question in planning or concluding is not away', (t) => {
  deckIn(t);
  const planning = postItem(aQuestion());
  assert.equal(stored(planning.id).away, undefined, 'planning');
  resolveItem(planning.id, 'Yes');
  for (const gate of ['1', '2']) {
    const { id } = postItem({ kind: `gate${gate}`, title: `Gate ${gate}`, body: 'b', repo: MINE, ...evidence(gate) });
    addReply(id, 'Sign off'); // a gate closes only on its press (merge-first L12)
    resolveItem(id, 'Sign off');
  }
  const concluding = postItem(aQuestion());
  assert.equal(stored(concluding.id).away, undefined, 'concluding');
  assert.match(textOf(callTool('deck_post', aQuestion())), /^Posted itm_/, 'answered as today');
});

test('a walkthrough or gate2 posted while implementing is not away', (t) => {
  deckIn(t, '1');
  const walkthrough = postItem({ kind: 'walkthrough', title: 'Walk it', body: 'b', repo: MINE });
  const signoff = postItem({ kind: 'gate2', title: 'Gate 2', body: 'b', repo: MINE, ...evidence('2') });
  assert.equal(stored(walkthrough.id).away, undefined);
  assert.equal(stored(signoff.id).away, undefined);
});

test('away is refused as a posted field', (t) => {
  deckIn(t);
  assert.throws(() => postItem(aQuestion({ away: true })), /a question item takes no away/);
});

test('a later user reply on an away question still wakes pilot wait', (t) => {
  deckIn(t, '1');
  const { id } = postItem(aQuestion({ recommended: 'Yes' }));
  assert.equal(awaitsPilot(stored(id), 0), false, 'nothing said yet');
  addReply(id, 'No, the other one');
  assert.equal(awaitsPilot(stored(id), 0), true, 'the user answered after all');
});
