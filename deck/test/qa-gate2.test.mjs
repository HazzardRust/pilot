/**
 * S8 of three-lanes (spec 8, L6): QA carries concluding to the Gate 2 press, so the gate2 it posts
 * on a live concluding ticket is accepted and owned by `qa`, whose wait hears the press.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_GATE2, KIND_TICKET } from '../items.mjs';
import { listItems, postItem } from '../store.mjs';
import { postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/pilot');

test("a QA gate2 on a live concluding ticket is accepted and QA's", (t) => {
  tempDeck(t);
  const ticket = postStored({ kind: KIND_TICKET, title: 'Concluding', body: shapedTicketBody('Concluding'), repo: REPO, sliceCount: 3, state: 'green' });
  takeLive(ticket.id);
  const gate2 = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'The run report.', repo: REPO, pr: '#250', sha: '0305827', ticket: ticket.id, author: 'pilot:pilot-qa' });
  const stored = listItems().find((item) => item.id === gate2.id);
  assert.equal(stored.owner, 'qa', "QA's gate2 is QA's thread, so its wait hears the press");
  assert.equal(listItems().find((item) => item.id === ticket.id).state, 'green', 'the ticket stays concluding');
});

test("the pilot's own gate2, on a hand-back with no walkthrough, stays the pilot's", (t) => {
  tempDeck(t);
  const ticket = postStored({ kind: KIND_TICKET, title: 'Handed back', body: shapedTicketBody('Handed back'), repo: REPO, sliceCount: 3, state: 'green' });
  takeLive(ticket.id);
  const gate2 = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'The run report.', repo: REPO, pr: '#250', sha: '0305827', ticket: ticket.id });
  assert.equal(listItems().find((item) => item.id === gate2.id).owner, 'pilot');
});
