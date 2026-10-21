'use strict';

/**
 * In yellow the user is away (thread-types-phase spec 6, L7, L12): the deck stamps a question
 * posted while implementing `away`, and the Stop gate reads that one field — it never works
 * out the phase itself — so a turn ending with it open is not held.
 */

const test = require('node:test');
const assert = require('node:assert');

const { awaitsUser } = require('../stop-gate.js');

const anItem = (id, over) => Object.assign({ id, kind: 'question', title: id, body: 'x', replies: [] }, over);

test('the Stop hook does not hold a turn on an away item, and still holds on a planning question', () => {
  const posted = ['away', 'planning'];
  assert.equal(awaitsUser(anItem('away', { away: true, recommended: 'Yes' }), posted), false, 'away');
  assert.equal(awaitsUser(anItem('planning'), posted), true, 'a question with no stamp still holds');
});

/**
 * Red-phase grilling (ticket-states spec 17, L21): the gate reads only the newest open items, so a
 * ticket this session's open question names and the read left out is asked for by id; one the deck
 * will not hand back reads as not live.
 */
test('the Stop gate asks for a ticket its question names that the read left out', async (t) => {
  const deck = require('../lib/deck.js');
  const { namedTickets } = require('../stop-gate.js');
  const asked = [];
  t.mock.method(deck, 'record', async (repo, ticket) => {
    asked.push(ticket);
    if (ticket === 'itm_gone') throw new Error('no ticket itm_gone');
    return { record: null, ticket: { id: ticket, kind: 'ticket', live: true } };
  });
  const items = [
    anItem('q1', { ticket: 'itm_old' }),
    anItem('q2', { ticket: 'itm_old' }),
    anItem('q3', { ticket: 'itm_here' }),
    anItem('q4', { ticket: 'itm_gone' }),
    anItem('theirs', { ticket: 'itm_other' }),
    { id: 'itm_here', kind: 'ticket', live: true },
  ];
  const found = await namedTickets(items, ['q1', 'q2', 'q3', 'q4'], 'D:/work/pilot');
  assert.deepEqual(asked, ['itm_old', 'itm_gone'], 'once each, only what the read left out, only this session\'s');
  assert.deepEqual(found.map((ticket) => ticket.id), ['itm_old']);
  assert.equal(awaitsUser(items[0], ['q1'], items.concat(found)), true, 'a question on the live ticket still holds');
  assert.equal(awaitsUser(items[3], ['q4'], items.concat(found)), false, 'a ticket the deck would not hand back is not live');
});

/**
 * A run can park its ticket and stop with its gate2 open (ticket-states spec 16 d, e): the
 * gate asks for the gate2's ticket like a question's, and holds no turn on it once it is parked.
 */
test('the Stop gate holds a gate2 on the live ticket and not on a parked one', async (t) => {
  const deck = require('../lib/deck.js');
  const { namedTickets } = require('../stop-gate.js');
  t.mock.method(deck, 'record', async (repo, ticket) => ({ record: null, ticket: { id: ticket, kind: 'ticket', live: ticket === 'itm_live' } }));
  const items = [anItem('g1', { kind: 'gate2', ticket: 'itm_live' }), anItem('g2', { kind: 'gate2', ticket: 'itm_parked' })];
  const found = await namedTickets(items, ['g1', 'g2'], 'D:/work/pilot');
  assert.deepEqual(found.map((ticket) => ticket.id), ['itm_live', 'itm_parked'], "a gate2's ticket is asked for by id");
  assert.equal(awaitsUser(items[0], ['g1'], items.concat(found)), true, 'the live run waits on its gate2');
  assert.equal(awaitsUser(items[1], ['g2'], items.concat(found)), false, 'a parked ticket\'s gate2 holds no turn');
});
