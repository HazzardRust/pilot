/**
 * S9 of three-lanes (spec 9, L5): the architect carries the planning relay. Its stashed question,
 * posted with the live planning ticket's id, is accepted and the architect's own thread; the pilot's
 * pushback takes it by the existing pass (`to: "pilot"`), so `PASS_KINDS` stays pilot and qa.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_QUESTION, KIND_TICKET, PASS_KINDS, messagesOf } from '../items.mjs';
import { addPilotMessage, listItems, postItem } from '../store.mjs';
import { postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/pilot');
const ARCHITECT = 'pilot:pilot-architect';
const stored = (id) => listItems().find((item) => item.id === id);

test("an architect question on a live planning ticket is accepted and the pilot's pass on it too", (t) => {
  tempDeck(t);
  const ticket = postStored({ kind: KIND_TICKET, title: 'Planning', body: shapedTicketBody('Planning'), repo: REPO, sliceCount: 3, state: 'red' });
  takeLive(ticket.id);
  const question = postItem({ kind: KIND_QUESTION, title: 'Keep the old export?', body: 'Default: keep it, at the cost of two code paths.', repo: REPO, ticket: ticket.id, author: ARCHITECT });
  assert.equal(stored(question.id).owner, 'architect', "the architect's question is its own thread, so its wait hears the answer");
  assert.equal(stored(question.id).ticket, ticket.id);

  addPilotMessage(question.id, 'That closes the migration path; still drop it?', 'pilot', 'pilot');
  const after = stored(question.id);
  assert.equal(after.owner, 'pilot', "the pilot's pushback takes the thread by the pass");
  assert.equal(messagesOf(after).at(-1).text, 'That closes the migration path; still drop it?', 'the pass and its message are one write');
  assert.equal(stored(ticket.id).state, 'red', 'the ticket stays planning');
  assert.deepEqual([...PASS_KINDS], ['pilot', 'qa'], 'L5: the architect cannot be passed to');
});
