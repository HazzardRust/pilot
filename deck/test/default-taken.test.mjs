/**
 * never-stuck S10 (spec 10, A2): a plain question the user has not answered in `DEFAULT_MS` goes ahead on its
 * `recommended` option. `defaultsDue` is the rule, `takeDefault` the one write, `armDefaults` the timer that makes
 * it with no pilot turn. Every test takes its own store; the clock is mocked, never waited on; nothing touches 4321.
 *
 * Tool calls go over `node:http` with no agent, as in `architect-owner.test.mjs`.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { KIND_QUESTION, messagesOf } from '../items.mjs';
import { armDefaults } from '../server-wait.mjs';
import { DeckRefusal, addReply, listItems, registerRun, reopenItem, resolveItem } from '../store.mjs';
import { DEFAULT_MS, defaultsDue, takeDefault } from '../store-defaults.mjs';
import { deckOnAPort, postStored, tempDeck } from '../testUtils.mjs';

const REPO = 'D:/work/alpha';
const MINUTE = 60_000;
const START = Date.parse('2026-11-18T10:00:00Z');

const stored = (id) => listItems().find((item) => item.id === id);
const asked = (minutesAgo, extra = {}) =>
  postStored({
    kind: KIND_QUESTION,
    title: 'Which store?',
    body: 'A or B\n\nResearch: read deck/store.mjs',
    repo: REPO,
    options: ['A', 'B'],
    recommended: 'B',
    postedAt: new Date(Date.now() - minutesAgo * MINUTE).toISOString(),
    ...extra,
  });

const callApi = (base, name, args = {}) =>
  new Promise((resolve, reject) => {
    const request = http.request(`${base}/api/tool`, { method: 'POST', agent: false, headers: { 'content-type': 'application/json' } }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => (body += chunk));
      response.on('end', () => resolve(body));
    });
    request.on('error', reject);
    request.end(JSON.stringify({ name, arguments: args }));
  });
const saidTo = async (base, args) => JSON.parse(JSON.parse(await callApi(base, 'deck_wait', { since: 0, timeout: 50, repo: REPO, ...args })).content[0].text).replies.map((reply) => reply.text);

test('a plain question is answered with its default at 20 minutes', async (t) => {
  const base = await deckOnAPort(t);
  registerRun({ repo: REPO, pid: process.pid });
  assert.equal(DEFAULT_MS, 20 * MINUTE);
  const pilots = asked(21);
  const architects = asked(21, { owner: 'architect' });

  for (const question of [pilots, architects]) {
    const closed = takeDefault(question.id);
    assert.equal(closed.resolution, 'Assumed: B (no answer 20 min)');
    const line = messagesOf(stored(question.id)).at(-1);
    assert.deepEqual([line.from, line.text], ['deck', 'B'], 'the deck says the default, never as the user');
  }

  assert.deepEqual(await saidTo(base, { author: '' }), ['B'], "the pilot's wait gets its own question's default");
  assert.deepEqual(await saidTo(base, { author: 'architect', item: architects.id, untaken: true }), ['B'], "and the architect's untaken wait its own");
  assert.equal(messagesOf(stored(architects.id)).at(-1).deliveredTo, 'architect');
});

test('19 minutes is not due; a user reply cancels it', (t) => {
  tempDeck(t);
  const question = asked(0);
  const posted = Date.parse(question.postedAt);

  assert.deepEqual(defaultsDue(listItems(), posted + 19 * MINUTE), []);
  assert.deepEqual(defaultsDue(listItems(), posted + 20 * MINUTE), [{ id: question.id, dueAt: posted + 20 * MINUTE }]);
  addReply(question.id, 'A');
  assert.deepEqual(defaultsDue(listItems(), posted + 60 * MINUTE), []);
});

test('proposals, merge questions and blocking items never are', (t) => {
  tempDeck(t);
  asked(0, { proposal: true });
  asked(0, { title: 'Merging tickets' });
  asked(0, { blocking: true, ticket: 'itm_000000000001' });
  asked(0, { recommended: undefined });
  for (const kind of ['gate1', 'gate2', 'walkthrough', 'signoff']) {
    postStored({ kind, title: 'Sign off', body: 'plan', repo: REPO, options: ['Sign off'], recommended: 'Sign off' });
  }
  const plain = asked(0);

  assert.deepEqual(defaultsDue(listItems(), Date.now() + 60 * MINUTE).map(({ id }) => id), [plain.id], 'only the plain question');
});

test('a reopened question is never defaulted again', (t) => {
  tempDeck(t);
  const taken = asked(21);
  takeDefault(taken.id);
  reopenItem(taken.id);
  const closedByPilot = asked(21);
  resolveItem(closedByPilot.id, 'No longer needed: the plan changed');
  reopenItem(closedByPilot.id);

  assert.deepEqual(defaultsDue(listItems(), Date.now() + 60 * MINUTE), []);
  assert.throws(() => takeDefault(taken.id), DeckRefusal);
  assert.equal(messagesOf(stored(taken.id)).filter((message) => message.default === true).length, 1, 'one default per question');
});

test('a restart fires an overdue default at once', (t) => {
  tempDeck(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START });
  const overdue = asked(25);
  const later = asked(10);

  armDefaults();
  t.mock.timers.tick(0);
  assert.match(stored(overdue.id).resolution, /^Assumed: B/, 'a default 25 minutes old is taken on arm');
  assert.equal(stored(later.id).resolution, undefined);

  t.mock.timers.tick(10 * MINUTE - 1);
  assert.equal(stored(later.id).resolution, undefined, 'not before its 20 minutes');
  t.mock.timers.tick(1);
  assert.match(stored(later.id).resolution, /^Assumed: B/);
});
