'use strict';

/**
 * S3 of run-chaining (spec 6, L6): a pilot's own open ticket or closing report
 * never holds its turn at the Stop gate. Both are standing kinds: open, and
 * still not waiting on the user. A question in the same state still holds.
 */

const test = require('node:test');
const assert = require('node:assert');

const { awaitsUser } = require('../stop-gate.js');

const posted = ['t1', 'r1', 'q1'];
const anItem = (id, kind) => ({ id, kind, title: id, body: 'x', replies: [] });

test('the Stop gate lets a turn end with its own report and tickets open', () => {
  assert.equal(awaitsUser(anItem('t1', 'ticket'), posted), false, 'a ticket');
  assert.equal(awaitsUser(anItem('r1', 'report'), posted), false, 'a report');
  assert.equal(awaitsUser(anItem('q1', 'question'), posted), true, 'a question still holds');
});
