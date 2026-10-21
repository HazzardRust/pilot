'use strict';

/**
 * S3 of report-record (spec 3; L2, L3, ADR 0148): a user reply stored on a closing report
 * before the store refused one holds no pilot. `unanswered` is the one definition the Stop
 * gate and the inbox line share, so a report it never names neither holds a turn nor is
 * repeated; a question in the same state still is.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { unanswered } = require('../lib/deck.js');

const REPO = path.resolve(__dirname, 'join-fixture', 'repo');
const withReply = (id, kind, seq) => ({ id, kind, title: id, body: 'x', repo: REPO, replies: [{ from: 'user', text: 'do this next', seq }] });

test("the Stop gate lets a turn end over a report's reply", () => {
  const report = withReply('r1', 'report', 5);
  assert.deepEqual(unanswered([report], ['r1'], 0, REPO), []);
});

test('the inbox line names no report', () => {
  const report = withReply('r1', 'report', 6);
  const question = withReply('q1', 'question', 7);
  assert.deepEqual(unanswered([report, question], [], 1, REPO).map((item) => item.id), ['q1']);
});
