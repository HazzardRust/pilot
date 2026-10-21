/** S3 of thread-types-phase, spec 2 (L2, L5, A6): sign-off and audit buttons come from the deck (the spec kind is retired, thread-kinds spec 25), and gates are kinds (thread-kinds spec 12: the gate tag is retired). */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KIND_AUDIT, KIND_GATE1, KIND_GATE2, KIND_SIGNOFF, KIND_WALKTHROUGH, NOT_YET, SIGN_OFF, TEACH_ME, noteFor } from '../items.mjs';
import { DeckRefusal, listItems, postItem } from '../store.mjs';
import { renderHomePage, renderThreadPage } from '../ui/render.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

const REPO = 'D:/work/alpha';

const post = (kind, over = {}) => postItem({ kind, title: `A ${kind}`, body: 'The body.', repo: REPO, ...over });
const pageOf = (item) => renderThreadPage(item, [item], []);
const cardOf = (item) => renderHomePage(listItems().filter((candidate) => candidate.id === item.id));
const buttonsIn = (html) => [...html.matchAll(/name="choice" value="([^"]*)"(?![^>]*>Confirm<)/g)].map((match) => match[1]);

test('a signoff is stored with Sign off / Not yet, and its row confirms before it sends', (t) => {
  tempDeck(t);
  const signoff = post(KIND_SIGNOFF);
  assert.deepEqual(signoff.options, [SIGN_OFF, NOT_YET]);
  const page = pageOf(signoff);
  assert.deepEqual(buttonsIn(page), [SIGN_OFF, NOT_YET, TEACH_ME]);
  assert.match(page, new RegExp(`value="${SIGN_OFF}" data-confirm`), 'a verdict confirms before it sends');
});

test('an audit is stored with none and no Teach me', (t) => {
  tempDeck(t);
  const audit = post(KIND_AUDIT);
  assert.deepEqual(audit.options, ['none']);
  assert.deepEqual(buttonsIn(pageOf(audit)), ['none']);
});

test("options on a signoff or audit are refused, and a question's own options are kept", (t) => {
  tempDeck(t);
  for (const kind of [KIND_SIGNOFF, KIND_AUDIT]) {
    assert.throws(
      () => post(kind, { options: ['yes', 'no'] }),
      (error) => error instanceof DeckRefusal && new RegExp(`^an? ${kind}'s buttons are the deck's: .+; post it without options$`).test(error.message),
      kind,
    );
  }
  assert.throws(() => post(KIND_SIGNOFF, { recommended: SIGN_OFF }), DeckRefusal, 'recommended on a buttoned kind is refused');
  assert.deepEqual(post('question', { options: ['a', 'b'] }).options, ['a', 'b']);
});

test('gate is refused on every kind: a gate is a gate kind', (t) => {
  tempDeck(t);
  assert.equal(post(KIND_SIGNOFF).gate, undefined, "a wizard's sign-off carries none");
  for (const [kind, gate] of [[KIND_SIGNOFF, '1'], [KIND_SIGNOFF, '2'], [KIND_SIGNOFF, '3'], [KIND_SIGNOFF, 1], [KIND_WALKTHROUGH, '1'], [KIND_WALKTHROUGH, '2'], ['question', '2']]) {
    assert.throws(() => post(kind, { gate }), DeckRefusal, `${kind} gate ${JSON.stringify(gate)}`);
  }
});

test("a gate1's page carries the gate-1 note, and a wizard's sign-off without gate carries none", (t) => {
  tempDeck(t);
  const gate1 = post(KIND_GATE1, withTicket({ artefact: 'docs/design/x/architecture.md', sha: '0305827', locked: 3, slices: '| S1 |' }, REPO));
  const gate2 = post(KIND_GATE2, withTicket({ pr: '#7', sha: '0305827' }, REPO, 'yellow'));
  assert.match(noteFor(gate1), /Gate 1/);
  assert.match(noteFor(gate2), /Gate 2/);
  assert.doesNotMatch(noteFor(gate2), new RegExp(NOT_YET), 'the gate-2 note asks for a reply, not a button');
  const page = pageOf(gate1);
  assert.ok(page.includes(noteFor(gate1)), "the page draws gate 1's note");
  assert.ok(page.indexOf('class="type-note"') < page.indexOf('class="body md"'), 'above the body, as on the card');
  assert.ok(cardOf(gate1).includes(noteFor(gate1)), "and the card");
  const wizard = post(KIND_SIGNOFF);
  assert.doesNotMatch(pageOf(wizard) + cardOf(wizard), /class="type-note"/);
});
