/**
 * Thread-ownership S5, spec 5; L6, L7, A2, A7, A9.
 *
 * A user reply waits for its owner, and a busy owner keeps its thread. The pilot takes
 * the thread, and is handed the reply, when the reply has sat unclaimed for 30 s (L6),
 * or when the owner picked it up and has not answered on the thread in 5 min (L7), and
 * either way only once the owner kind has made no tool call and held no wait for
 * `LIVE_WINDOW_MS`. What fires it is a timer in the pilot's own parked wait, never a
 * daemon-wide sweep.
 *
 * The clock is each test's own (`mock.timers`, `setTimeout` and `Date`), and every
 * test takes its own store and port. Never port 4321: this machine runs a real deck.
 *
 * Tool calls go over `node:http` with no agent, not `fetch`: undici keeps timers of its
 * own, and once a test has ticked a mocked clock past a pooled connection, the next
 * test's request never answers.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { deckOnAPort, tempDeck } from '../testUtils.mjs';

const agents = await import('../agents.mjs');
const { LIVE_WINDOW_MS, forgetAgents, lastActive, noteActive, noteAgent } = agents;
const { addPilotMessage, addReply, currentSeq, fallbackDue, listItems, postItem, storeFile } = await import('../store.mjs');
const items = await import('../items.mjs');
const { SIGN_OFF, messagesOf, ownerOf, threadState } = items;
const { waiterCount } = await import('../server.mjs');
const { renderThreadPage } = await import('../ui/render.mjs');

const ALPHA = path.join(os.tmpdir(), 'work', 'alpha'); // a host path, so a worktree's gitdir names it on POSIX too (L8)
const QA = 'pilot:pilot-qa';
const SECOND = 1_000;
const MINUTE = 60_000;
const PICK_UP = 30 * SECOND; // L6
const ANSWER = 5 * MINUTE; // L7
const START = Date.parse('2026-09-27T10:00:00Z');

const stored = (id) => listItems().find((item) => item.id === id);
const walkthrough = () => postItem({ kind: 'walkthrough', title: 'Try it', body: 'Step one.', repo: ALPHA, author: QA });
/** QA last seen long enough ago that only the reply's own clock is left to run. */
const qaQuiet = () => noteActive({ cwd: ALPHA, kind: 'qa' }, Date.now() - 2 * LIVE_WINDOW_MS);

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
const payloadOf = (body) => JSON.parse(JSON.parse(body).content[0].text);
const saidIn = (payload) => payload.replies.map((reply) => reply.text);

/** Let the loop turn over: sockets and the daemon's handlers run on it, the mocked clock does not. */
const settleLoop = async (turns = 30) => {
  for (let i = 0; i < turns; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

/** A wait, parked: resolves to its payload, and `done()` says whether it has answered yet. */
async function park(base, args) {
  const before = waiterCount();
  let answered = false;
  const reply = callApi(base, 'deck_wait', args).then(payloadOf).finally(() => (answered = true));
  reply.catch(() => {}); // a wait still parked when the test's deck closes is not a failure of its own
  for (let i = 0; i < 200 && waiterCount() === before && !answered; i += 1) await settleLoop(1);
  return { reply, done: () => answered };
}

/** A wait's payload, which must already have been answered: a test never waits on a clock it froze. */
async function answer(wait) {
  await settleLoop();
  assert.equal(wait.done(), true, 'the wait has answered by now');
  return wait.reply;
}

/** A deck of the test's own on a clock of the test's own, started as a fresh daemon at START. */
async function deckAtStart(t) {
  const base = await deckOnAPort(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START });
  forgetAgents();
  t.after(() => forgetAgents());
  return base;
}

const pilotWait = (base, timeout = 120_000) => park(base, { since: currentSeq(), timeout, repo: ALPHA });
const qaWait = (base, since, timeout = 120_000) => park(base, { since, timeout, repo: ALPHA, author: QA });

/** One short poll, answered: parked, its 1 ms run out, its payload. */
async function poll(t, parked) {
  const wait = await parked;
  t.mock.timers.tick(1);
  return answer(wait);
}

/** Tick in steps, letting the loop turn between them, so a wait's own continuation runs on time. */
async function tickBy(t, ms, step = 10 * SECOND) {
  for (let left = ms; left > 0; left -= step) {
    t.mock.timers.tick(Math.min(step, left));
    await settleLoop(5);
  }
}

/** QA picks the reply up with a short wait of its own, which also counts as QA at work. */
async function qaPicksUp(t, base, since, id) {
  const picked = saidIn(await poll(t, qaWait(base, since, 1)));
  return { picked, at: Date.parse(messagesOf(stored(id)).at(-1).deliveredAt) };
}

test('the named periods are 30 s to pick up and 5 min to answer (L6, L7)', () => {
  assert.equal(items.OWNER_PICK_UP_MS, PICK_UP);
  assert.equal(items.OWNER_ANSWER_MS, ANSWER);
  assert.equal(items.OWNER_GRACE_MS, undefined, 'the one grace period is gone');
});

test('L6: an unclaimed reply with qa quiet goes to the pilot 30 s after it arrived', async (t) => {
  const base = await deckAtStart(t);
  qaQuiet();
  const walk = walkthrough();
  addReply(walk.id, 'step two fails');

  const wait = await pilotWait(base);
  t.mock.timers.tick(PICK_UP - 1);
  await settleLoop();
  assert.equal(wait.done(), false, 'one millisecond short of 30 s the pilot is still parked');
  assert.equal(ownerOf(stored(walk.id)), 'qa');

  t.mock.timers.tick(1);
  assert.deepEqual(saidIn(await answer(wait)), ['step two fails'], 'at 30 s the pilot is handed the reply');
  const item = stored(walk.id);
  assert.equal(ownerOf(item), 'pilot', "and the thread is the pilot's now");
  assert.equal('fellBack' in item, false, 'no fallback record is written');
  assert.equal(messagesOf(item).at(-1).deliveredTo, 'pilot');
  assert.equal(messagesOf(item).at(-1).text, 'step two fails', 'the fallback writes no message: the reply stays last');
  assert.equal(threadState(item), 'the pilot has it');
});

test('L6: a qa that made a tool call inside the window keeps its reply until it has been quiet 90 s', async (t) => {
  const base = await deckAtStart(t);
  qaQuiet();
  const walk = walkthrough();
  const before = currentSeq();
  addReply(walk.id, 'looks wrong');

  const wait = await pilotWait(base);
  await tickBy(t, 20 * SECOND);
  noteAgent({ agentId: 'qa1', agentType: QA, cwd: ALPHA });
  assert.equal(lastActive(ALPHA, 'qa'), START + 20 * SECOND, "a roster heartbeat is its kind's activity");
  await tickBy(t, LIVE_WINDOW_MS - 1);
  assert.equal(wait.done(), false, 'a busy owner keeps its thread past 30 s');
  assert.equal(ownerOf(stored(walk.id)), 'qa');

  t.mock.timers.tick(1);
  assert.deepEqual(saidIn(await answer(wait)), ['looks wrong'], 'quiet for 90 s, it goes to the pilot');
  assert.deepEqual(saidIn(await poll(t, qaWait(base, before, 1))), [], 'and not to qa as well');
});

test("a heartbeat from a worktree keeps its kind's thread", async (t) => {
  const base = await deckAtStart(t);
  const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-worktree-'));
  t.after(() => fs.rmSync(tree, { recursive: true, force: true }));
  fs.writeFileSync(path.join(tree, '.git'), `gitdir: ${ALPHA}/.git/worktrees/qa
`);
  qaQuiet();
  const walk = walkthrough();
  addReply(walk.id, 'looks wrong');

  noteAgent({ agentId: 'qa1', agentType: QA, cwd: tree });
  t.mock.timers.tick(LIVE_WINDOW_MS - 2);
  assert.deepEqual(saidIn(await poll(t, pilotWait(base, 1))), [], 'QA at work in a worktree of the repository is QA at work');
  assert.equal(ownerOf(stored(walk.id)), 'qa');
});

test('a qa holding a wait is at work for as long as it holds it', async (t) => {
  const base = await deckAtStart(t);
  const walk = walkthrough();
  addReply(walk.id, 'where is step three?');
  // QA's cursor sits past the reply, so nothing but its activity can keep the reply from the pilot.
  const qa = await qaWait(base, currentSeq(), 2 * MINUTE);
  const pilot = await pilotWait(base, 2 * MINUTE);

  await tickBy(t, 2 * MINUTE - 1);
  assert.equal(pilot.done(), false, 'two minutes into a wait QA still holds: no fallback');
  await tickBy(t, 1);
  assert.deepEqual(saidIn(await answer(qa)), []);
  assert.deepEqual(saidIn(await answer(pilot)), [], 'nor as the wait returns');

  const next = await pilotWait(base);
  await tickBy(t, LIVE_WINDOW_MS - 1);
  assert.equal(next.done(), false, 'the wait returned less than 90 s ago');
  t.mock.timers.tick(1);
  assert.deepEqual(saidIn(await answer(next)), ['where is step three?'], '90 s after its wait returned, QA is quiet');
});

test('L7: a reply qa picked up and left unanswered goes to the pilot 5 min after the pick-up', async (t) => {
  const base = await deckAtStart(t);
  const walk = walkthrough();
  const before = currentSeq();
  addReply(walk.id, 'the button does nothing');
  const { picked, at } = await qaPicksUp(t, base, before, walk.id);
  assert.deepEqual(picked, ['the button does nothing']);
  const pickedAt = new Date(at).toISOString();

  t.mock.timers.tick(at + ANSWER - 2 - Date.now());
  assert.deepEqual(saidIn(await poll(t, pilotWait(base, 1))), [], 'one millisecond short of 5 min it is still QA\'s');
  assert.equal(Date.now(), at + ANSWER - 1);
  const wait = await pilotWait(base);
  t.mock.timers.tick(1);
  assert.deepEqual(saidIn(await answer(wait)), ['the button does nothing'], 'at 5 min the pilot is handed it too');

  const item = stored(walk.id);
  assert.equal(ownerOf(item), 'pilot');
  assert.equal('fellBack' in item, false);
  const reply = messagesOf(item).at(-1);
  assert.deepEqual(reply.deliveredTo, ['qa', 'pilot'], 'handed to both, in the order they had it');
  assert.equal(reply.deliveredAt, pickedAt, 'the first hand-off keeps its moment');

  assert.deepEqual(saidIn(await poll(t, pilotWait(base, 1))), [], 'the pilot is handed it once');
  assert.deepEqual(saidIn(await poll(t, qaWait(base, before, 1))), [], 'and QA is not handed it again');
  const fromBefore = park(base, { since: before, timeout: 1, repo: ALPHA });
  assert.deepEqual(saidIn(await poll(t, fromBefore)), ['the button does nothing'], "a pilot cursor behind it still reads it as the pilot's");
  assert.deepEqual(fallbackDue(ALPHA, Date.now() + 60 * MINUTE, () => 0), { overdue: [], nextAt: null });
});

test('L7: a reply qa answered on the thread stays qa\'s', async (t) => {
  const base = await deckAtStart(t);
  const walk = walkthrough();
  const before = currentSeq();
  addReply(walk.id, 'why is this red?');
  await qaPicksUp(t, base, before, walk.id);
  addPilotMessage(walk.id, 'It marks a failed step; fixing it now.', QA);

  t.mock.timers.tick(30 * MINUTE);
  assert.deepEqual(saidIn(await poll(t, pilotWait(base, 1))), [], 'an answered reply is not overdue');
  assert.equal(ownerOf(stored(walk.id)), 'qa');
});

test('L7: an owner still working after 5 min keeps its thread until it has been quiet 90 s', async (t) => {
  const base = await deckAtStart(t);
  const walk = walkthrough();
  const before = currentSeq();
  addReply(walk.id, 'try again?');
  const { at } = await qaPicksUp(t, base, before, walk.id);

  t.mock.timers.tick(4 * MINUTE);
  noteAgent({ agentId: 'qa1', agentType: QA, cwd: ALPHA });
  const busyAt = Date.now();
  const wait = await pilotWait(base);
  await tickBy(t, at + ANSWER - Date.now() + 10 * SECOND);
  assert.equal(wait.done(), false, 'past 5 min, but QA made a tool call 70 s ago');

  await tickBy(t, busyAt + LIVE_WINDOW_MS - Date.now() - 1);
  assert.equal(wait.done(), false);
  t.mock.timers.tick(1);
  assert.deepEqual(saidIn(await answer(wait)), ['try again?'], 'quiet for 90 s, the pilot has it');
});

test('a sign off qa picked up is never taken back for the pilot', async (t) => {
  const base = await deckAtStart(t);
  const walk = walkthrough();
  const before = currentSeq();
  addReply(walk.id, SIGN_OFF);
  await qaPicksUp(t, base, before, walk.id);

  t.mock.timers.tick(60 * MINUTE);
  assert.deepEqual(fallbackDue(ALPHA, Date.now(), () => 0), { overdue: [], nextAt: null }, 'the pilot hears a sign off anyway (L2)');
  assert.equal(ownerOf(stored(walk.id)), 'qa');
});

test("an unclaimed reply is found although the pilot's cursor is past it", async (t) => {
  const base = await deckAtStart(t);
  const walk = walkthrough();
  addReply(walk.id, 'done');
  t.mock.timers.tick(2 * MINUTE);

  const payload = await answer(await pilotWait(base));
  assert.deepEqual(saidIn(payload), ['done'], 'returned at once, cursor or no cursor');
  assert.ok(payload.replies[0].seq <= payload.seq);
  assert.deepEqual(saidIn(await poll(t, pilotWait(base, 1))), [], 'and once: a claimed reply is not overdue any more');
});

test("the inbox hook's 1 ms wait receives an overdue reply", async (t) => {
  const base = await deckAtStart(t);
  const walk = walkthrough();
  addReply(walk.id, 'ready');
  t.mock.timers.tick(LIVE_WINDOW_MS);

  // As hooks/inbox-alert.js sends it: no author, a 1 ms timeout, its own cursor.
  const wait = park(base, { since: currentSeq(), timeout: 1, repo: ALPHA });
  assert.deepEqual(saidIn(await poll(t, wait)), ['ready']);
  assert.equal(ownerOf(stored(walk.id)), 'pilot');
});

test('a fallen-back reply is not handed to a qa that returns', async (t) => {
  const base = await deckAtStart(t);
  const walk = walkthrough();
  const before = currentSeq();
  addReply(walk.id, 'answer');
  t.mock.timers.tick(LIVE_WINDOW_MS);
  await poll(t, pilotWait(base, 1));

  assert.deepEqual(saidIn(await poll(t, qaWait(base, before, 1))), [], 'A9: handed to the pilot, so to nobody else');
});

test('an old walkthrough with author qa falls back', async (t) => {
  const base = await deckAtStart(t);
  const walk = walkthrough();
  // Written before this feature: no `owner`, so it reads as its author (A2).
  const file = storeFile();
  const deck = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete deck.items.find((item) => item.id === walk.id).owner;
  fs.writeFileSync(file, JSON.stringify(deck));
  assert.equal(ownerOf(stored(walk.id)), 'qa');

  addReply(walk.id, 'old but answered');
  t.mock.timers.tick(LIVE_WINDOW_MS);
  assert.deepEqual(saidIn(await poll(t, pilotWait(base, 1))), ['old but answered']);
  assert.equal(stored(walk.id).owner, 'pilot');
});

test('fallback writes once', async (t) => {
  const base = await deckAtStart(t);
  const walk = walkthrough();
  addReply(walk.id, 'once');
  t.mock.timers.tick(MINUTE);

  const first = await pilotWait(base);
  const second = await pilotWait(base);
  const at = stored(walk.id).replies.at(-1).seq;
  t.mock.timers.tick(LIVE_WINDOW_MS - MINUTE);
  assert.deepEqual(saidIn(await answer(first)), ['once']);
  t.mock.timers.tick(2 * MINUTE);
  assert.deepEqual(saidIn(await answer(second)), [], 'the second wait finds it claimed and times out as any wait does');

  const item = stored(walk.id);
  assert.equal(ownerOf(item), 'pilot', 'one hand-over');
  assert.equal(messagesOf(item).filter((message) => message.seq === at).length, 1, 'and no reply written twice');
  assert.equal(messagesOf(item).length, 1, 'no line added to the thread by either wait');
});

test('a restarted daemon counts an unseen kind from its own start', async (t) => {
  const base = await deckAtStart(t);
  const walk = walkthrough();
  addReply(walk.id, 'from before the restart');
  t.mock.timers.tick(60 * MINUTE);
  forgetAgents(); // the daemon restarts: `lastActive` is gone and counts from now

  assert.equal(lastActive(ALPHA, 'qa'), Date.now());
  const early = await pilotWait(base, MINUTE);
  t.mock.timers.tick(MINUTE);
  assert.deepEqual(saidIn(await answer(early)), [], 'an hour-old reply does not fall back the moment the daemon starts');

  const late = await pilotWait(base);
  t.mock.timers.tick(LIVE_WINDOW_MS - MINUTE);
  assert.deepEqual(saidIn(await answer(late)), ['from before the restart'], 'it falls back 90 s after the start');
});

test("the pure query takes now and the owner's quiet moment, and ignores pilot-owned, claimed and other repositories' replies", (t) => {
  tempDeck(t);
  const walk = walkthrough();
  addReply(walk.id, 'foreign');
  const asked = postItem({ kind: 'question', title: 'Which?', body: 'A or B', repo: ALPHA, author: '' });
  addReply(asked.id, 'the pilot\'s own');
  const elsewhere = postItem({ kind: 'walkthrough', title: 'There', body: 'x', repo: 'D:/work/beta', author: QA });
  addReply(elsewhere.id, 'not this repository');
  const repliedAt = Date.parse(stored(walk.id).replies[0].repliedAt);

  const quiet = () => repliedAt - MINUTE;
  const early = fallbackDue(ALPHA, repliedAt + PICK_UP - 1, quiet);
  assert.deepEqual(early, { overdue: [], nextAt: repliedAt + PICK_UP });
  const due = fallbackDue(ALPHA, repliedAt + PICK_UP, quiet);
  assert.deepEqual(due.overdue.map((reply) => reply.text), ['foreign']);
  assert.equal(due.nextAt, null, 'nothing is left to come due once it is overdue');
  const busy = () => repliedAt + 2 * MINUTE;
  assert.equal(fallbackDue(ALPHA, repliedAt, busy).nextAt, repliedAt + 2 * MINUTE, 'activity moves it later');

  noteActive({ cwd: ALPHA, kind: 'qa' }, 1234);
  assert.equal(lastActive(ALPHA, 'qa'), 1234);
  assert.equal(agents.quietAt(ALPHA, 'qa'), 1234 + LIVE_WINDOW_MS, 'quiet a window after its last activity');
  forgetAgents();
});

// The user, on itm_8dc56c0d58cd: "get rid of this "qa has ended; the pilot has
// this thread now" - bloat". The owner changing, in its colour, says it.
test('after a fallback the header shows the new owner, pilot, in its colour, live', async (t) => {
  const base = await deckAtStart(t);
  const walk = walkthrough();
  addReply(walk.id, 'anyone?');
  t.mock.timers.tick(LIVE_WINDOW_MS);
  await poll(t, pilotWait(base, 1));

  // In the live header region (S4), so the page shows it without a reload.
  const page = renderThreadPage(stored(walk.id));
  const header = page.slice(page.indexOf('data-live="kind"'), page.indexOf('data-live="kind"') + 600);
  assert.match(header, /<span class="owner"><span class="who by-pilot">pilot<\/span><\/span>/);
  assert.doesNotMatch(page, /has ended/, 'and no note beside it');
});
