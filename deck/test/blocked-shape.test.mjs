/**
 * S5 of yellow-lane (spec 7, A1): a `Blocked:` question or walkthrough naming a ticket is posted
 * `blocking`, or the deck refuses it with the rule, so a gate2 cannot pass over a blocked step.
 * Every test takes its own store; nothing touches 4321.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { aTicket, takeLive, tempDeck } from '../testUtils.mjs';
import { blockedShapeGaps } from '../blocked-shape.mjs';

const { DeckRefusal, listItems } = await import('../store.mjs');
const { callTool } = await import('../server.mjs');

const RULE = 'a blocked step is a blocking item: post it with blocking: true';
const TITLE = 'Blocked: git push origin main';

/** A question in `blocked.js`'s own shape (gate-no-stall #620, `itemFor`), on `ticket` when one is given. */
const aBlockedQuestion = (ticket, extra = {}) => ({
  kind: 'question',
  title: TITLE,
  body: 'Auto mode denied a command; it is not retried and not routed around.\n\nCommand: git push origin main',
  options: ['I ran it', 'Skip it'],
  recommended: 'Skip it',
  repo: ticket.repo,
  ticket: ticket.id,
  ...extra,
});

test('an unflagged blocked step is refused', (t) => {
  for (const kind of ['question', 'walkthrough']) {
    assert.deepEqual(blockedShapeGaps({ kind, title: TITLE, ticket: 'itm_a', blocking: undefined }), [RULE], kind);
    assert.deepEqual(blockedShapeGaps({ kind, title: TITLE, ticket: 'itm_a', blocking: false }), [RULE], `${kind}, blocking false`);
  }

  tempDeck(t);
  const ticket = takeLive(aTicket('Ship it', 'yellow').id);
  const before = listItems().length;
  assert.throws(
    () => callTool('deck_post', aBlockedQuestion(ticket)),
    (error) => error instanceof DeckRefusal && error.message.includes(RULE),
    'deck_post refuses with the rule',
  );
  assert.equal(listItems().length, before, 'nothing is stored, and nothing is upgraded to blocking silently');
  // The title is the denied command, and the refusal runs before the credential check: it echoes neither.
  const secret = 'Blocked: curl -H "Authorization: Bearer ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"';
  assert.throws(
    () => callTool('deck_post', aBlockedQuestion(ticket, { title: secret })),
    (error) => error instanceof DeckRefusal && error.message.includes(RULE) && !error.message.includes('ghp_'),
    'the refusal does not echo the title',
  );
});

test("#620's item passes", (t) => {
  assert.deepEqual(blockedShapeGaps({ kind: 'question', title: TITLE, ticket: 'itm_a', blocking: true }), []);

  tempDeck(t);
  const ticket = takeLive(aTicket('Ship it', 'yellow').id);
  callTool('deck_post', aBlockedQuestion(ticket, { blocking: true }));
  assert.equal(listItems().find((item) => item.title === TITLE)?.blocking, true, 'posted blocking, as blocked.js sends it');
});

test('an unticketed one passes', () => {
  for (const kind of ['question', 'walkthrough']) {
    assert.deepEqual(blockedShapeGaps({ kind, title: TITLE, ticket: undefined, blocking: undefined }), [], kind);
  }
  assert.deepEqual(blockedShapeGaps({ kind: 'question', title: 'Which schema?', ticket: 'itm_a' }), [], 'not a blocked step');
  assert.deepEqual(blockedShapeGaps({ kind: 'note', title: TITLE, ticket: 'itm_a' }), [], 'another kind holds no gate');
});
