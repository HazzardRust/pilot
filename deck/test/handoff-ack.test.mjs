/** S8 of thread-kinds, spec 18 and 20 (L8): a picked-up hand-off says so at once. */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { HANDOFF_FAILED, KIND_HANDOFF, messagesOf, threadState } from '../items.mjs';
import { createRequire } from 'node:module';
import { addPilotMessage, addReply, listItems, postItem, repliesSince, resolveItem } from '../store.mjs';
import { renderThreadPage } from '../ui/render.mjs';
import { shapedTicketBody, tempDeck } from '../testUtils.mjs';

const REPO = 'D:/work/alpha';
const PILOT_MD = new URL('../../agents/pilot.md', import.meta.url);

const aHandoff = () => postItem({ kind: KIND_HANDOFF, title: 'Handoff', body: 'Stash at run.json.', repo: REPO });
const stored = (id) => listItems().find((item) => item.id === id);

test("pilot.md's hand-off rule names the reply, then the resolve, as the first two acts", () => {
  const text = fs.readFileSync(PILOT_MD, 'utf8').replace(/\s+/g, ' ');
  assert.match(
    text,
    /that session's first two tool calls are a `deck_reply` on the thread saying it holds the run, then its `deck_resolve`/,
    'the resumed session acknowledges and closes the hand-off before it does anything else'
  );
});

test('Handoff failed on an acknowledged hand-off stores pickedUpAt on the press, from the reply\'s time', (t) => {
  tempDeck(t);
  const handoff = aHandoff();
  addPilotMessage(handoff.id, 'I hold the run.');
  const ackAt = messagesOf(stored(handoff.id)).at(-1).repliedAt;

  addReply(handoff.id, HANDOFF_FAILED);

  const messages = messagesOf(stored(handoff.id));
  assert.equal(messages.length, 2, 'the acknowledgement and the press; no note of the deck\'s own');
  assert.equal(messages[1].text, HANDOFF_FAILED);
  assert.equal(messages[1].pickedUpAt, ackAt);
});

test('Handoff failed on an unacknowledged hand-off carries no pickedUpAt', (t) => {
  tempDeck(t);
  const handoff = aHandoff();

  addReply(handoff.id, HANDOFF_FAILED);

  const messages = messagesOf(stored(handoff.id));
  assert.equal(messages.length, 1, 'the press alone');
  assert.equal(messages[0].pickedUpAt, undefined);
});

test("a chain hand-off's Handoff failed still un-resolves its ticket", (t) => {
  tempDeck(t);
  const ticket = postItem({ kind: 'ticket', sliceCount: 60, title: 'Run 2', body: shapedTicketBody(), repo: REPO });
  const chain = postItem({ kind: KIND_HANDOFF, title: 'Next run: Run 2', body: ticket.body, repo: REPO, next: ticket.id });
  resolveItem(ticket.id, `taken by ${chain.id}`);
  addPilotMessage(chain.id, 'I hold the run.');
  resolveItem(chain.id, 'delivered');

  addReply(chain.id, HANDOFF_FAILED);

  assert.equal(stored(ticket.id).resolvedAt, undefined, 'back to Tickets');
  assert.equal(messagesOf(stored(chain.id)).at(-1).pickedUpAt, undefined, 'and nothing says nothing failed while its ticket goes back');
});

test('a doubled Handoff failed on an acknowledged hand-off is one press', (t) => {
  tempDeck(t);
  const handoff = aHandoff();
  addPilotMessage(handoff.id, 'I hold the run.');

  addReply(handoff.id, HANDOFF_FAILED);
  addReply(handoff.id, HANDOFF_FAILED);

  assert.equal(messagesOf(stored(handoff.id)).length, 2);
});

test('the press with pickedUpAt still waits on the pilot, and the header does not say not picked up', (t) => {
  tempDeck(t);
  const handoff = aHandoff();
  addPilotMessage(handoff.id, 'I hold the run.');
  addReply(handoff.id, HANDOFF_FAILED);

  const item = stored(handoff.id);
  const gate = createRequire(import.meta.url)('../../hooks/lib/deck.js');
  assert.ok(gate.awaitsPilot(item, -1), 'the Stop gate reads the press as the last word');
  assert.equal(threadState(item), 'the pilot has it', 'QA 3: the header agrees with the line under it');
});

test('the thread page draws the press with a readable picked-up line', (t) => {
  tempDeck(t);
  const handoff = aHandoff();
  addPilotMessage(handoff.id, 'I hold the run.');
  const ackAt = messagesOf(stored(handoff.id)).at(-1).repliedAt;
  addReply(handoff.id, HANDOFF_FAILED);

  const page = renderThreadPage(stored(handoff.id));
  assert.ok(page.includes(`Picked up <time datetime="${ackAt}">${ackAt}</time> by the pilot; nothing failed.`));
});

test('the press reaches the pilot through repliesSince carrying pickedUpAt', (t) => {
  tempDeck(t);
  const handoff = aHandoff();
  addPilotMessage(handoff.id, 'I hold the run.');
  const ackAt = messagesOf(stored(handoff.id)).at(-1).repliedAt;
  addReply(handoff.id, HANDOFF_FAILED);

  const press = repliesSince(0).replies.find((reply) => reply.itemId === handoff.id);
  assert.equal(press.text, HANDOFF_FAILED);
  assert.equal(press.pickedUpAt, ackAt);
});
