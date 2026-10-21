/**
 * Gate threads are their own kinds (thread-kinds spec 10, 11; L5, L19, ADR 0057): a `gate1`
 * and a `gate2` are posted with their evidence as fields the store checks by name, and a
 * `signoff` carrying the old `gate` tag is refused, naming the kind to post instead.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_GATE1, KIND_GATE2, NOT_YET, SIGN_OFF, TEACH_ME } from '../items.mjs';
import { DeckRefusal, listItems, postItem, resolveItem } from '../store.mjs';
import { renderHomePage, renderThreadPage } from '../ui/render.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

const REPO = path.join('D:', 'work', 'pilot');

const GATE1 = {
  artefact: 'docs/design/thread-kinds/architecture.md',
  sha: '31efcb0',
  locked: 19,
  slices: '| S1 | gate kinds | 10, 11 |',
};
const GATE2 = { pr: 'https://github.com/HazzardRust/pilot/pull/250', sha: '0305827' };

// A gate1 names a red ticket and a gate2 a yellow one (ticket-states spec 2), put here first.
const TICKET_STATE = { [KIND_GATE1]: 'red', [KIND_GATE2]: 'yellow' };
// The architect's resolved merge thread naming `ticket`: a gate1 waits for one while another red
// ticket shares its repository (merge-first spec 5, L13), as a parked earlier ticket does here.
const ARCHITECT = 'pilot:pilot-architect';
const merged = (ticket) =>
  resolveItem(postItem({ kind: 'question', title: 'Merge?', body: 'Nothing shares its surface.', repo: REPO, ticket, author: ARCHITECT }).id, 'merged nothing', ARCHITECT);
const post = (kind, fields, over = {}) => {
  const evidence = TICKET_STATE[kind] ? withTicket(fields, REPO, TICKET_STATE[kind]) : fields;
  if (kind === KIND_GATE1) merged(evidence.ticket);
  return postItem({ kind, title: `A ${kind}`, body: 'The evidence.', repo: REPO, ...evidence, ...over });
};
const without = (fields, name) => Object.fromEntries(Object.entries(fields).filter(([key]) => key !== name));
const refusedNaming = (name) => (error) => error instanceof DeckRefusal && new RegExp(`\\b${name}\\b`).test(error.message);
const buttonsIn = (html) => [...html.matchAll(/name="choice" value="([^"]*)"(?![^>]*>Confirm<)/g)].map((match) => match[1]);

test('a gate1 missing each required field is refused naming that field', (t) => {
  tempDeck(t);
  for (const name of ['artefact', 'sha', 'locked', 'slices']) {
    assert.throws(() => post(KIND_GATE1, without(GATE1, name)), refusedNaming(name), name);
  }
  assert.equal(listItems().filter((item) => item.kind === KIND_GATE1).length, 0, 'no gate1 stored');
});

test('a gate2 missing each required field is refused naming that field', (t) => {
  tempDeck(t);
  for (const name of ['pr', 'sha']) {
    assert.throws(() => post(KIND_GATE2, without(GATE2, name)), refusedNaming(name), name);
  }
  assert.equal(listItems().filter((item) => item.kind === KIND_GATE2).length, 0, 'no gate2 stored');
});

test('a gate2 without walkthrough is stored', (t) => {
  tempDeck(t);
  assert.equal(post(KIND_GATE2, GATE2).walkthrough, undefined, 'walkthroughs are not mandatory (L19)');
  assert.equal(post(KIND_GATE2, GATE2, { walkthrough: 'itm_0123456789ab' }).walkthrough, 'itm_0123456789ab');
});

test('a gate field of the wrong shape is refused naming it', (t) => {
  tempDeck(t);
  for (const [kind, fields, name, value] of [
    [KIND_GATE1, GATE1, 'locked', -1],
    [KIND_GATE1, GATE1, 'locked', '19'],
    [KIND_GATE1, GATE1, 'locked', 1.5],
    [KIND_GATE1, GATE1, 'sha', 'not a sha'],
    [KIND_GATE2, GATE2, 'pr', 'the PR'],
    [KIND_GATE2, GATE2, 'walkthrough', 'the walkthrough'],
    [KIND_GATE1, GATE1, 'sha', 'abc1234\nfoo'],
    [KIND_GATE2, GATE2, 'sha', 'abc1234\nfoo'],
    [KIND_GATE2, GATE2, 'pr', '#abc'],
    [KIND_GATE2, GATE2, 'walkthrough', 'itm_0123456789ab\nfoo'],
    [KIND_GATE1, GATE1, 'options', ['Yes', 'No']],
    [KIND_GATE2, GATE2, 'options', ['Yes', 'No']],
  ]) {
    assert.throws(() => post(kind, fields, { [name]: value }), refusedNaming(name), `${kind} ${name} ${JSON.stringify(value)}`);
  }
  assert.equal(post(KIND_GATE2, GATE2, { pr: '#250' }).pr, '#250', 'a PR by number');
  assert.equal(post(KIND_GATE2, GATE2, { sha: ' 0305827\n' }).sha, '0305827', 'stored as it was matched');
  assert.equal(post(KIND_GATE1, GATE1, { locked: 0 }).locked, 0, 'nothing locked is a count');
});

test('a complete gate1 and gate2 are stored with options Sign off and Not yet', (t) => {
  tempDeck(t);
  const gate1 = post(KIND_GATE1, GATE1);
  const gate2 = post(KIND_GATE2, GATE2);
  for (const [item, fields] of [[gate1, GATE1], [gate2, GATE2]]) {
    for (const [name, value] of Object.entries(fields)) assert.equal(item[name], value, `${item.kind} ${name}`);
    assert.deepEqual(item.options, [SIGN_OFF, NOT_YET], item.kind);
    const page = renderThreadPage(item, [item], []);
    assert.deepEqual(buttonsIn(page), [SIGN_OFF, NOT_YET, TEACH_ME], `${item.kind}: the page's buttons`);
    assert.match(page, new RegExp(`value="${SIGN_OFF}" data-confirm`), `${item.kind}: a verdict confirms before it sends`);
    assert.match(page, new RegExp(`Gate ${item.kind.at(-1)}:`), `${item.kind}: its gate note`);
    const card = renderHomePage(listItems().filter((candidate) => candidate.id === item.id));
    assert.deepEqual(buttonsIn(card).slice(0, 2), [SIGN_OFF, NOT_YET], `${item.kind}: the card's buttons`);
  }
});

test('a signoff with gate "1" is refused naming gate1; with gate "2" naming gate2', (t) => {
  tempDeck(t);
  assert.throws(() => post('signoff', {}, { gate: '1' }), refusedNaming('gate1'));
  assert.throws(() => post('signoff', {}, { gate: '2' }), refusedNaming('gate2'));
  assert.equal(post('signoff', {}).gate, undefined, "a wizard's sign-off still posts");
});

test('a gate1 is refused while a question is open in its repo', (t) => {
  tempDeck(t);
  const question = postItem({ kind: 'question', title: 'Which?', body: 'b', repo: REPO });
  assert.throws(() => post(KIND_GATE1, GATE1), (error) => error instanceof DeckRefusal && error.message.includes(question.id));
  // A gate2 waits only for its own ticket's blocking questions (ticket-states L22 revised, S18; deck/test/blocking.test.mjs).
});

