/**
 * A signed gate's reply box says the press stands (gate-stays-signed spec 4, S2, A2): once
 * `chosenOf` reads Sign off, the box is labelled as a comment for the pilot, under the
 * Sign off drawn pressed. An unsigned gate, or one withdrawn with Not yet, keeps Your verdict.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_GATE1, KIND_GATE2, NOT_YET, SIGN_OFF } from '../items.mjs';
import { addReply, beginLanding, listItems, postItem, settleLanding } from '../store.mjs';
import { renderThreadPage } from '../ui/render.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

const REPO = path.join('D:', 'work', 'pilot');
const SIGNED = 'Signed off. The press stands; what you type is a comment for the pilot.';
const GATE1 = { artefact: 'docs/design/x/architecture.md', sha: '0305827', locked: 3, slices: '| S1 |' };
const GATE2 = { pr: '#250', sha: '0305827' };

const post = (kind, fields) =>
  postItem({ kind, title: `A ${kind}`, body: 'The evidence.', repo: REPO, ...withTicket(fields, REPO, kind === KIND_GATE1 ? 'red' : 'yellow') });
const pageOf = (id) => renderThreadPage(listItems().find((item) => item.id === id), listItems(), []);
const labelOf = (page) => page.match(/<label for="reply-text">([^<]*)<\/label>/)?.[1];

test('a signed gate2 with a later typed reply shows the signed label', (t) => {
  tempDeck(t);
  const gate = post(KIND_GATE2, GATE2);
  addReply(gate.id, SIGN_OFF);
  addReply(gate.id, 'and tidy the branch after');
  const page = pageOf(gate.id);
  assert.equal(labelOf(page), SIGNED);
  assert.match(page, /<button type="submit" name="choice" value="Sign off" class="sent"/, 'Sign off drawn pressed');
  assert.match(page, /<textarea id="reply-text"/, 'the box is still there (A2)');
});

test('an unsigned gate1 keeps Your verdict', (t) => {
  tempDeck(t);
  const gate = post(KIND_GATE1, GATE1);
  addReply(gate.id, 'i sign off');
  const page = pageOf(gate.id);
  assert.equal(labelOf(page), 'Your verdict');
  assert.ok(!page.includes(SIGNED));
});

test('a gate withdrawn with Not yet keeps Your verdict', (t) => {
  tempDeck(t);
  const gate = post(KIND_GATE1, GATE1);
  addReply(gate.id, SIGN_OFF);
  addReply(gate.id, NOT_YET);
  addReply(gate.id, 'one more thing');
  assert.equal(labelOf(pageOf(gate.id)), 'Your verdict');
});

const buttonOf = (page, option) => page.match(new RegExp(`<button type="submit" name="choice" value="${option}"[^>]*>`))?.[0];

test('a signed gate1 keeps Not yet pressable and Sign off pressed and disabled (L5)', (t) => {
  tempDeck(t);
  const gate = post(KIND_GATE1, GATE1);
  addReply(gate.id, SIGN_OFF);
  const page = pageOf(gate.id);
  assert.match(buttonOf(page, 'Sign off'), /class="sent" disabled/);
  assert.ok(!/disabled/.test(buttonOf(page, 'Not yet')), 'Not yet is enabled');
  assert.ok(!/sent/.test(buttonOf(page, 'Not yet')));
});

test('a signed gate2 whose landing landed keeps its row disabled', (t) => {
  tempDeck(t);
  const gate = post(KIND_GATE2, GATE2);
  addReply(gate.id, SIGN_OFF);
  beginLanding(gate.id, { worktree: 'D:/work/pilot-wt' });
  settleLanding(gate.id, { ok: true, sha: '97b4833', line: 'landed at 97b4833' });
  assert.match(buttonOf(pageOf(gate.id), 'Not yet'), /disabled/);
});

test('a signed gate shows a comment placeholder in the box', (t) => {
  tempDeck(t);
  const gate = post(KIND_GATE1, GATE1);
  assert.ok(!pageOf(gate.id).includes('A comment for the pilot.'));
  addReply(gate.id, SIGN_OFF);
  assert.match(pageOf(gate.id), /<textarea[^>]*placeholder="A comment for the pilot\."/);
});

test('a gate1 withdrawn with Not yet and then typed on keeps Sign off pressable', (t) => {
  tempDeck(t);
  const gate = post(KIND_GATE1, GATE1);
  addReply(gate.id, SIGN_OFF);
  addReply(gate.id, NOT_YET);
  addReply(gate.id, 'one more thing');
  const page = pageOf(gate.id);
  assert.ok(!/disabled/.test(buttonOf(page, 'Sign off')), 'Sign off is enabled');
  assert.ok(!/sent/.test(buttonOf(page, 'Sign off')));
});
