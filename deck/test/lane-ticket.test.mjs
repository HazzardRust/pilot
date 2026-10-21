/**
 * blocked-yellow-yields S6, spec 7 (A2): a Blocked item is filed under the ticket of the lane that was denied.
 *
 * `laneTicketOf` is the role -> lane -> ticket rule, once, deck-side: the co-pilot's crew under the live co-pilot's
 * ticket (else the live concluding one), QA under the live concluding ticket, everyone else under the live planning
 * ticket. `GET /api/tickets?repo=&agent=` answers it as `filed`, the agent held to the roster's plain-name shape.
 * Never port 4321: this machine runs a real deck.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KIND_TICKET } from '../items.mjs';
import { laneTicketOf } from '../lane-ticket.mjs';
import { deckOnAPort, postStored, shapedTicketBody } from '../testUtils.mjs';

const { setCoPilot } = await import('../store.mjs');

const REPO = 'D:/work/lane';

const ticketOf = (id, state, live = true) => ({ id, kind: KIND_TICKET, title: id, repo: REPO, state, live });
const ITEMS = [ticketOf('R', 'red'), ticketOf('Y', 'yellow', false), ticketOf('G', 'green')];
const HELD = { ticket: 'Y', live: true };

test('crew files under the co-pilot\'s ticket', () => {
  for (const agent of ['pilot:pilot-implementer', 'pilot:pilot-co-pilot', 'pilot:pilot-fact-sheet', 'pilot:typescript-reviewer', 'pilot:security-reviewer']) {
    assert.equal(laneTicketOf(ITEMS, REPO, agent, HELD)?.id, 'Y', agent);
  }
  assert.equal(laneTicketOf(ITEMS, REPO, 'pilot:pilot-implementer', { ticket: 'Y', live: false })?.id, 'G', 'no live co-pilot: the live concluding ticket');
  assert.equal(laneTicketOf(ITEMS, REPO, 'pilot:pilot-implementer', null)?.id, 'G');
  assert.equal(laneTicketOf(ITEMS.slice(0, 2), REPO, 'pilot:pilot-implementer', null), undefined, 'neither: no lane ticket');
});

test('QA files under the concluding ticket', () => {
  assert.equal(laneTicketOf(ITEMS, REPO, 'pilot:pilot-qa', HELD)?.id, 'G', 'even with a live co-pilot');
  assert.equal(laneTicketOf(ITEMS.slice(0, 2), REPO, 'pilot:pilot-qa', HELD), undefined);
});

test('planning roles keep the red ticket', () => {
  for (const agent of ['pilot:pilot-architect', 'pilot:pilot-explorer', 'pilot:pilot-teacher', 'pilot:pilot', 'pilot']) {
    assert.equal(laneTicketOf(ITEMS, REPO, agent, HELD)?.id, 'R', agent);
  }
  assert.equal(laneTicketOf(ITEMS, 'D:/work/elsewhere', 'pilot:pilot', HELD), undefined, 'another repository\'s ticket is never filed under');
});

test('a malformed agent is refused', async (t) => {
  const base = await deckOnAPort(t);
  const yellow = postStored({ kind: KIND_TICKET, title: 'built', body: shapedTicketBody('built'), repo: REPO, sliceCount: 30, state: 'yellow' });
  setCoPilot(yellow.id, true);
  const ask = (agent) => fetch(`${base}/api/tickets?repo=${encodeURIComponent(REPO)}&agent=${encodeURIComponent(agent)}`);

  for (const agent of ['', 'x'.repeat(61), 'pilot:<script>', 'a:b:c', ' pilot:pilot-implementer', '../pilot']) {
    const answer = await ask(agent);
    assert.equal(answer.status, 400, JSON.stringify(agent));
    assert.match((await answer.json()).error, /agent/);
  }

  const crew = await (await ask('pilot:pilot-implementer')).json();
  assert.deepEqual(crew.filed, { id: yellow.id }, 'a well-formed crew agent is filed under the held ticket');
  assert.equal(crew.live, null, '`live` is still the red queue\'s, untouched');
  assert.equal((await (await ask('pilot:pilot-architect')).json()).filed, null, 'no live red ticket: nothing filed');
  const plain = await (await fetch(`${base}/api/tickets?repo=${encodeURIComponent(REPO)}`)).json();
  assert.equal('filed' in plain, false, 'no agent asked: the answer is the queue view as it was');
});
