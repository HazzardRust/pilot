/**
 * Thread-ownership S6, spec 6; L2, A6, A9.
 *
 * Pressing Sign off on a walkthrough is the one reply handed to two kinds: its owner,
 * and the pilot as Gate 2. Nothing else on a QA thread reaches the pilot, the exact
 * `SIGN_OFF` is the only text that counts, and the pilot still cannot write there.
 *
 * Every test takes its own store directory and its own ephemeral port. Nothing
 * here may touch the real store or port 4321: this machine runs a real deck.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deckOnAPort } from '../testUtils.mjs';

const { addReply, fallbackDue, listItems, postItem, registerRun } = await import('../store.mjs');
const { SIGN_OFF, messagesOf } = await import('../items.mjs');
const { callTool } = await import('../server.mjs');

const ALPHA = 'D:/work/alpha';
const PILOT = '';
const QA = 'pilot:pilot-qa';

const stored = (id) => listItems().find((item) => item.id === id);
const saidIn = (payload) => payload.replies.map((reply) => reply.text);

const walkthrough = () => postItem({ kind: 'walkthrough', title: 'Try it', body: 'Step one.', repo: ALPHA, author: QA });

const waitAs = async (base, author, since, timeout) => {
  const response = await fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'deck_wait', arguments: { since, timeout, repo: ALPHA, author } }),
  });
  return JSON.parse((await response.json()).content[0].text);
};

/** Through the page, as the user presses it: the only write a parked wait wakes on. */
const press = (base, id, choice, text = '') =>
  fetch(`${base}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ id, text, choice }),
    redirect: 'manual',
  });

const start = async (t) => {
  const base = await deckOnAPort(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  return { base, walk: walkthrough() };
};

test('sign off on a qa walkthrough wakes both the qa wait and the pilot wait', async (t) => {
  const { base, walk } = await start(t);

  const qa = waitAs(base, QA, 0, 30_000);
  const pilot = waitAs(base, PILOT, 0, 30_000);
  assert.equal((await press(base, walk.id, SIGN_OFF)).status, 303);

  const [toQa, toPilot] = await Promise.all([qa, pilot]);
  assert.deepEqual(saidIn(toQa), [SIGN_OFF]);
  assert.deepEqual(saidIn(toPilot), [SIGN_OFF]);
  assert.equal(toPilot.replies[0].owner, 'qa', "the pilot's hook can tell it is QA's thread to close");
  assert.deepEqual(messagesOf(stored(walk.id)).at(-1).deliveredTo, ['qa', 'pilot'], 'both recipients recorded');
  assert.equal(messagesOf(stored(walk.id)).length, 1, 'one answer in the thread');
});

for (const [first, second] of [[PILOT, QA], [QA, PILOT]]) {
  test(`handed to ${first === QA ? 'qa' : 'the pilot'} first, the sign off still reaches the other, and neither twice`, async (t) => {
    const { base, walk } = await start(t);
    addReply(walk.id, SIGN_OFF);

    const early = await waitAs(base, first, 0, 50);
    const late = await waitAs(base, second, 0, 50);

    assert.deepEqual(saidIn(early), [SIGN_OFF]);
    assert.deepEqual(saidIn(late), [SIGN_OFF], 'the first delivery does not hide it from the other kind');
    assert.deepEqual(saidIn(await waitAs(base, first, early.seq, 50)), [], 'not handed twice');
    assert.deepEqual(saidIn(await waitAs(base, second, late.seq, 50)), [], 'not handed twice');
    assert.deepEqual(messagesOf(stored(walk.id)).at(-1).deliveredTo, ['qa', 'pilot']);
  });
}

test('qa closing its walkthrough after the sign off still records the pilot as its second recipient', async (t) => {
  const { base, walk } = await start(t);
  addReply(walk.id, SIGN_OFF);

  assert.deepEqual(saidIn(await waitAs(base, QA, 0, 50)), [SIGN_OFF]);
  const first = messagesOf(stored(walk.id)).at(-1).deliveredAt;
  callTool('deck_resolve', { id: walk.id, resolution: 'signed off', author: QA });

  assert.deepEqual(saidIn(await waitAs(base, PILOT, 0, 50)), [SIGN_OFF]);
  assert.deepEqual(messagesOf(stored(walk.id)).at(-1).deliveredTo, ['qa', 'pilot']);
  assert.equal(messagesOf(stored(walk.id)).at(-1).deliveredAt, first, 'the first hand-off keeps its moment');
});

test('a sign off handed to the pilot is never taken for an unclaimed reply', async (t) => {
  const { base, walk } = await start(t);
  addReply(walk.id, SIGN_OFF);

  assert.deepEqual(saidIn(await waitAs(base, PILOT, 0, 50)), [SIGN_OFF]);

  const never = () => 0;
  assert.deepEqual(fallbackDue(ALPHA, Date.now() + 24 * 3_600_000, never), { overdue: [], nextAt: null }, 'no fallback of the thread');
  assert.equal(stored(walk.id).owner, 'qa', "the thread stays qa's");
});

test('any other reply on a qa walkthrough still wakes qa only', async (t) => {
  const { base, walk } = await start(t);

  const qa = waitAs(base, QA, 0, 30_000);
  const pilot = waitAs(base, PILOT, 0, 300);
  assert.equal((await press(base, walk.id, '', 'step two is wrong')).status, 303);

  assert.deepEqual(saidIn(await qa), ['step two is wrong']);
  assert.deepEqual(saidIn(await pilot), []);
});

test('a typed finding beside Sign off is not a gate reply', async (t) => {
  const { base, walk } = await start(t);

  const qa = waitAs(base, QA, 0, 30_000);
  const pilot = waitAs(base, PILOT, 0, 300);
  assert.equal((await press(base, walk.id, SIGN_OFF, 'step two is wrong')).status, 303);

  assert.deepEqual(saidIn(await qa), ['step two is wrong'], 'replyFrom drops the press: the text is the finding');
  assert.deepEqual(saidIn(await pilot), []);
});

test('the pilot still cannot reply on the qa walkthrough after sign off', async (t) => {
  const { walk } = await start(t);
  addReply(walk.id, SIGN_OFF);

  const refused = { name: 'DeckRefusal', message: /owned by qa/ };
  assert.throws(() => callTool('deck_reply', { id: walk.id, text: 'Gate 2 passed', author: PILOT }), refused);
  assert.throws(() => callTool('deck_resolve', { id: walk.id, resolution: 'signed off', author: PILOT }), refused);
  assert.equal(messagesOf(stored(walk.id)).length, 1);
});
