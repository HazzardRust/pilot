/**
 * Spec 11 of run-record: a verdict waits for open questions.
 *
 * The pilot of this run posted the spec while three questions were still
 * open, and the user asked for that to be made impossible rather than
 * remembered (itm_4073564252ff, 2026-09-23). So the refusal is the daemon's,
 * in `postItem` (L22, ADR 0029): it holds for every writer, and it names what
 * to answer first. The `spec` kind is retired (thread-kinds spec 25, ADR 0057);
 * the refusal stays for `signoff`, `gate1` and `gate2`.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GATED_KINDS, KIND_GATE1, KIND_GATE2, KIND_SIGNOFF } from '../items.mjs';
import { DeckRefusal, postItem, resolveItem } from '../store.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

const REPO = 'D:/work/pilot';

const aQuestion = (over = {}) =>
  postItem({ kind: 'question', title: 'Which port?', body: 'Pick one.', options: ['a', 'b'], repo: REPO, ...over });

const aSignoff = (over = {}) => postItem({ kind: KIND_SIGNOFF, title: 'Done?', body: 'Satisfied?', repo: REPO, ...over });

// The architect's resolved merge thread naming `ticket`: a gate1 waits for one while another red
// ticket shares its repository (merge-first spec 5, L13), as a parked earlier ticket does here.
const ARCHITECT = 'pilot:pilot-architect';
const merged = (ticket) =>
  resolveItem(postItem({ kind: 'question', title: 'Merge?', body: 'Nothing shares its surface.', repo: REPO, ticket, author: ARCHITECT }).id, 'merged nothing', ARCHITECT);
const aGate1 = () => {
  const { ticket } = withTicket({}, REPO);
  merged(ticket);
  return postItem({
    kind: KIND_GATE1,
    title: 'Gate 1',
    body: 'The design.',
    repo: REPO,
    artefact: 'docs/design/x/architecture.md',
    sha: '0305827',
    locked: 3,
    slices: '| S1 |',
    sliceCount: 3,
    branch: 'feat/x',
    ticket,
  });
};

/** The refusal `post` throws, which must be a DeckRefusal and nothing else. */
function refusalOf(post) {
  try {
    post();
  } catch (err) {
    assert.ok(err instanceof DeckRefusal, `expected a DeckRefusal, got ${err}`);
    return err.message;
  }
  assert.fail('the post was accepted');
}

test('the kinds held for open questions are the sign-off and the gates', () => {
  assert.deepEqual(GATED_KINDS, [KIND_SIGNOFF, KIND_GATE1, KIND_GATE2]);
});

test('a signoff and a gate1 are still refused while a question is open', (t) => {
  tempDeck(t);
  const open = aQuestion();
  for (const post of [aSignoff, aGate1]) {
    const message = refusalOf(post);
    assert.match(message, new RegExp(open.id));
    assert.match(message, /open question/);
  }
  resolveItem(open.id, 'a');
  assert.equal(aSignoff().kind, KIND_SIGNOFF);
  assert.equal(aGate1().kind, KIND_GATE1);
});

test('the refusal names every open question, and none that is closed', (t) => {
  tempDeck(t);
  const first = aQuestion();
  const second = aQuestion({ title: 'Which colour?' });
  const closed = aQuestion({ title: 'Settled' });
  resolveItem(closed.id, 'a');
  const message = refusalOf(() => aSignoff());
  assert.match(message, new RegExp(first.id));
  assert.match(message, new RegExp(second.id));
  assert.doesNotMatch(message, new RegExp(closed.id));
});

test('a question in another directory does not hold a signoff', (t) => {
  tempDeck(t);
  aQuestion({ repo: 'D:/work/elsewhere' });
  assert.equal(aSignoff().kind, KIND_SIGNOFF);
});

test('an open signoff does not hold another; only a question does', (t) => {
  tempDeck(t);
  aSignoff();
  postItem({ kind: 'walkthrough', title: 'Try it', body: 'Steps.', repo: REPO });
  postItem({ kind: 'handoff', title: 'Handing off', body: 'Next.', repo: REPO });
  assert.equal(aSignoff({ title: 'Again' }).kind, KIND_SIGNOFF);
});

test('a walkthrough and both handoffs are never held', (t) => {
  tempDeck(t);
  aQuestion();
  assert.equal(postItem({ kind: 'walkthrough', title: 'Try it', body: 'Steps.', repo: REPO }).kind, 'walkthrough');
  assert.equal(postItem({ kind: 'handoff', title: 'Next', body: 'Go.', repo: REPO }).kind, 'handoff');
  assert.equal(postItem({ kind: 'crew-handoff', title: 'FYI', body: 'Hi.', repo: REPO }).kind, 'crew-handoff');
});
