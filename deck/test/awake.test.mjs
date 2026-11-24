/**
 * stay-awake S1 (spec 1, 5, 6; L5, A1, A2): the in-flight rule and the hold's transitions. The clock is
 * node:test's mock, never waited on, and the holder is a fake spawn: no process starts here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { LINGER_MS, awakeState, holdAwake, inFlight } from '../awake.mjs';
import { forgetAgents, lastHeardAt, noteAgent } from '../agents.mjs';
import { healthOf } from '../health.mjs';
import { KIND_QUESTION } from '../items.mjs';
import { listItems } from '../store.mjs';
import { defaultsDue } from '../store-defaults.mjs';
import { postStored, tempDeck } from '../testUtils.mjs';

const MINUTE = 60_000;
const START = Date.parse('2026-11-25T10:00:00Z');
const NOTHING = { lastHeardAt: null, landings: 0, armedDefaults: 0 };

/** A spawn that records each call and hands back a child the test drives. */
function fakeSpawn() {
  const children = [];
  const spawn = (cmd, args, options) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.call = { cmd, args, options };
    child.kills = 0;
    child.kill = () => {
      child.kills += 1;
      return true;
    };
    children.push(child);
    return child;
  };
  return { spawn, children };
}

/** A hold on the mock clock, its log lines kept; stopped when the test ends. */
function aHold(t, facts) {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: START });
  const { spawn, children } = fakeSpawn();
  const logs = [];
  const hold = holdAwake({ facts, spawn, platform: 'win32', pid: 4242, log: (line) => logs.push(line) });
  t.after(() => hold.stop());
  return { hold, children, logs, advance: (ms) => t.mock.timers.tick(ms) };
}

test('a heartbeat holds and the linger releases', (t) => {
  forgetAgents();
  t.after(forgetAgents);
  const { children, logs, advance } = aHold(t, () => ({ ...NOTHING, lastHeardAt: lastHeardAt() }));
  noteAgent({ agentId: 'a1', agentType: 'pilot:pilot-implementer', cwd: 'D:/work/alpha' }, START);

  advance(MINUTE);
  assert.equal(children.length, 1, 'one holder by t+60 s');
  children[0].stdout.emit('data', 'held\r\n');
  assert.equal(awakeState().held, true);

  advance(13 * MINUTE);
  assert.equal(awakeState().held, true, 'still held at t+14 min');
  assert.equal(children[0].kills, 0);

  advance(2 * MINUTE);
  assert.equal(children[0].kills, 1, 'released by t+16 min');
  assert.equal(children.length, 1, 'one spawn in all');
  children[0].emit('exit', null, 'SIGTERM'); // the released holder's own exit, late
  assert.deepEqual([awakeState().held, logs.length], [false, 0], 'a release is not a failure');
});

test('an armed default holds with no agent', async (t) => {
  const question = { kind: KIND_QUESTION, title: 'Which store?', body: 'A or B', repo: 'D:/work/alpha', options: ['A', 'B'], recommended: 'B' };
  /** What the daemon passes as `armedDefaults`: the default timer's own count. */
  const armed = () => defaultsDue(listItems(), Infinity).length;

  await t.test('a defaultable question holds', (t) => {
    tempDeck(t);
    postStored(question);
    assert.equal(inFlight({ ...NOTHING, armedDefaults: armed() }, START), true);
  });
  await t.test('a blocking question and a gate hold nothing', (t) => {
    tempDeck(t);
    postStored({ ...question, blocking: true });
    postStored({ kind: 'gate1', title: 'Sign off', body: 'plan', repo: 'D:/work/alpha', options: ['Sign off'], recommended: 'Sign off' });
    assert.equal(armed(), 0);
    assert.equal(inFlight({ ...NOTHING, armedDefaults: armed() }, START), false);
  });
});

test('a landing holds', () => {
  assert.equal(inFlight({ ...NOTHING, landings: 1 }, START), true);
  assert.equal(inFlight(NOTHING, START), false, 'nothing in flight holds nothing');
  assert.equal(inFlight({ ...NOTHING, lastHeardAt: START - LINGER_MS }, START), false, 'the linger is exclusive at its end');
});

test('a holder that fails is logged once and retried', (t) => {
  const { children, logs, advance } = aHold(t, () => ({ ...NOTHING, landings: 1 }));

  advance(MINUTE);
  assert.equal(children.length, 1);
  children[0].emit('exit', 1, null);
  assert.equal(logs.length, 1, 'one log line');
  assert.match(logs[0], /exit 1/);
  assert.equal(awakeState().held, false);

  advance(MINUTE);
  assert.equal(children.length, 2, 'one retry on the next tick');
  children[1].emit('exit', 1, null);
  assert.equal(logs.length, 1, 'a repeat failure is not logged again');
});

test('health says whether it holds', (t) => {
  const { hold, children, advance } = aHold(t, () => ({ ...NOTHING, landings: 1 }));
  advance(MINUTE);
  children[0].stdout.emit('data', 'held\n');

  assert.deepEqual(awakeState(), { held: true, since: new Date(START + MINUTE).toISOString() });
  assert.deepEqual(healthOf().awake, awakeState(), '/api/health carries it');

  hold.stop();
  assert.equal(children[0].kills, 1);
  assert.deepEqual(awakeState(), { held: false, since: null });
  assert.deepEqual(healthOf().awake, { held: false, since: null });
});
