/**
 * Three-lanes S11, spec 15, L7: a landing that ends short wakes the pilot, whoever owns the gate2.
 * A short landing (refused, or `main gets pilot: unknown`) is stored on the gate2's
 * thread as `{ from: 'deck', seq, text }`: the pilot's wait hears it, QA's never does, and the
 * Stop hook holds on it until a later message. A clean landing stays a seq-less pilot-kind line.
 * The waits run the real daemon on a store and a port of the test's own, never 4321.
 */
import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { deckOnAPort, withTicket } from '../testUtils.mjs';

const { forgetAgents } = await import('../agents.mjs');
const { addPilotMessage, listItems, ownerFilter, postItem, repliesSince, settleLanding } = await import('../store.mjs');
const { KIND_GATE2, threadState } = await import('../items.mjs');
const { waiterCount } = await import('../server.mjs');
const { wait } = await import('../wait.mjs');
const hook = createRequire(import.meta.url)('../../hooks/lib/deck.js');
const inbox = createRequire(import.meta.url)('../../hooks/inbox-alert.js');

const REPO = 'D:/work/pilot-landing-wake';
const QA = 'pilot:pilot-qa';
const REFUSED = 'NOT landed: npm test failed';
const CLEAN = 'landed feat/x on pilot at 1a2b3c4\nmain gets pilot: #577';

const stored = (id) => listItems().find((item) => item.id === id);
/** What `kind`'s wait would be handed from the whole deck: `repliesSince` through its `ownerFilter`. */
const heard = (kind) => repliesSince(0).replies.filter(ownerFilter(kind)).map((reply) => reply.text);
const qaGate2 = () =>
  postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, author: QA, ...withTicket({ pr: '#576', sha: '0305827' }, REPO, 'green') });

async function deck(t) {
  const base = await deckOnAPort(t);
  const before = process.env.PILOT_DECK_PORT;
  process.env.PILOT_DECK_PORT = new URL(base).port;
  forgetAgents();
  t.after(() => {
    forgetAgents();
    if (before === undefined) delete process.env.PILOT_DECK_PORT;
    else process.env.PILOT_DECK_PORT = before;
  });
  return base;
}

const listen = (kind, said, timeoutMinutes = 0.01) =>
  wait({ env: {}, repo: REPO, kind, pollMs: 50, timeoutMinutes, say: (line) => said.push(line) });

test('a refused landing returns the parked pilot wait with the line', async (t) => {
  await deck(t);
  const gate = qaGate2();
  assert.equal(stored(gate.id).owner, 'qa', 'QA owns its gate2 (L6)');

  const said = [];
  const waiting = listen('pilot', said, 0.05);
  for (let i = 0; i < 200 && waiterCount() < 1; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  settleLanding(gate.id, { ok: false, line: REFUSED });

  assert.equal(await waiting, 0);
  assert.ok(said.includes(`REPLY ${gate.id} "Gate 2"\n${REFUSED}\n\n`), said.join(''));
  assert.deepEqual(heard('pilot'), [REFUSED], "the pilot's filter hears the line");
  assert.deepEqual(heard('qa'), [], "QA's does not, though QA owns the gate2 (L7)");
  const line = stored(gate.id).replies.at(-1);

  const qa = [];
  await listen('qa', qa);
  assert.doesNotMatch(qa.join(''), /NOT landed/, "QA's wait is not woken by the landing");
  const again = [];
  await listen('pilot', again);
  assert.doesNotMatch(again.join(''), /NOT landed/, 'handed to the pilot once');

  // The line waits on the pilot, which may answer it on QA's thread without taking it.
  assert.equal(threadState(stored(gate.id)), 'landing ended short');
  const told = inbox.notice([{ itemId: gate.id, title: 'Gate 2', owner: 'qa', kind: 'gate2', ...line }], null);
  assert.doesNotMatch(told.additionalContext + told.systemMessage, /the user (has answered|replied)/, 'never told as the user');
  assert.match(told.additionalContext, /landing ended short/);
  addPilotMessage(gate.id, 'Seen; fixing the suite and landing again.');
  assert.equal(stored(gate.id).owner, 'qa', 'the answer takes nothing from QA');
});

test('a clean landing wakes nobody', async (t) => {
  await deck(t);
  const gate = qaGate2();
  settleLanding(gate.id, { ok: true, sha: '1a2b3c4', line: CLEAN });
  assert.deepEqual([heard('pilot'), heard('qa')], [[], []], 'no filter hears a clean landing');
  const said = [];
  await listen('pilot', said);
  assert.doesNotMatch(said.join(''), /landed feat/);
});

test('the Stop hook holds while a landing line is unanswered', () => {
  const item = { id: 'itm_g2', kind: 'gate2', owner: 'qa', repo: REPO, replies: [{ from: 'deck', author: 'deck', seq: 9, text: REFUSED }] };
  assert.equal(hook.awaitsPilot(item, 0), true);
  assert.deepEqual(hook.unanswered([item], [], 0, REPO).map((held) => held.id), ['itm_g2'], 'held whoever owns the gate2');
  item.replies.push({ from: 'pilot', author: 'qa', text: 'Seen; the pilot is on it.' });
  assert.equal(hook.awaitsPilot(item, 0), false, 'a later message answers it');
  assert.equal(hook.awaitsPilot({ ...item, replies: item.replies.slice(0, 1), resolvedAt: '2026-10-15T00:00:00Z' }, 0), false, 'the close answers it');
});

test("a landing line the pilot's deck_read showed is not handed again by its wait", async (t) => {
  await deck(t);
  const client = await import('../client.mjs?landing-read');
  await client.registerSession();
  const here = process.cwd();
  const gate = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: here, author: QA, ...withTicket({ pr: '#576', sha: '0305827' }, here, 'green') });
  const waitAsPilot = async () => JSON.parse((await client.waitForReply({ timeout: 1_000, author: '' }, 300)).content[0].text).replies.map((reply) => reply.text);
  await client.callDeckTool('deck_read', { author: QA }); // on the deck before the line, so its cursor is behind it
  settleLanding(gate.id, { ok: false, line: REFUSED });

  await client.callDeckTool('deck_read', { author: '' });
  assert.deepEqual(await waitAsPilot(), [], 'read once, handed once');
});
