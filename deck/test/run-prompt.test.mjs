/**
 * handoff-prompt S1: the hand-off's first prompt goes in as one bracketed paste, and
 * Enter follows alone, after a settle, in a write of its own (L1, L2).
 *
 * Typed as one chunk, `text\r`, the prompt sat unsent in the fresh session's input
 * line at least twice (itm_e6a914cb63f9 waited 19 min): the `\r` landed inside what
 * the TUI read as one paste, a newline rather than a keypress. Claude Code's own pty
 * driver pastes and then writes `\r` on its own; these pin that shape.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import { TAKEN_WAIT_MS, SETTLE_MS, pasted, handPrompt } from '../run-prompt.mjs';

const deck = createRequire(import.meta.url)('../../hooks/lib/deck.js');

const TEXT = 'Pick up the hand-off on the deck.';

/** What `handPrompt` typed, and when; `onType` is the session behind it reacting to each write. */
function keyboard(onType = () => {}) {
  const typed = [];
  const at = [];
  return { typed, at, type: (s) => { typed.push(s); at.push(performance.now()); onType(s); } };
}

/** The hand-off every outcome line names: wrapper.log is machine-wide. */
const ID = 'itm_0123456789ab';
const quick = { id: ID, settleMs: 0, pollMs: 5, takenWaitMs: 60 };
const going = () => new AbortController().signal;

/**
 * A scratch home, and the fresh session behind the keyboard: `toolRan()` stamps a main-session tool
 * call with `post-tool.js`'s own writer, so the spelling is checked from both sides.
 */
function session(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-taken-'));
  const before = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  t.after(() => {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    fs.rmSync(home, { recursive: true, force: true });
  });
  const toolRan = () => deck.markToolRan({ PILOT_RUN_PID: String(process.pid), PILOT_RUN_REPO: home }, home);
  const log = () => {
    try {
      return fs.readFileSync(path.join(home, '.claude', 'pilot', 'wrapper.log'), 'utf8');
    } catch {
      return '';
    }
  };
  return { toolRan, log };
}

/** The log's lines without their timestamps. */
const lines = (log) => log.split('\n').filter(Boolean).map((l) => l.replace(/^\S+ /, ''));

test('the paste is the text between the bracketed-paste markers', () => {
  assert.equal(pasted(TEXT), `\x1b[200~${TEXT}\x1b[201~`);
  assert.equal(SETTLE_MS, 300);
  assert.equal(TAKEN_WAIT_MS, 60_000, 'A1: 60 s, twice');
});

test('the prompt and its Enter are two writes, and a session that stamps on it is taken', async (t) => {
  const { toolRan, log } = session(t);
  const keys = keyboard((s) => s === '\r' && toolRan());

  assert.equal(await handPrompt(TEXT, { type: keys.type, signal: going(), ...quick }), 'taken');
  assert.deepEqual(keys.typed, [pasted(TEXT), '\r'], 'the Enter is never inside the paste, and a prompt taken gets no second');
  assert.deepEqual(lines(log()), [`run: prompt taken for ${ID}`]);
});

test('the Enter waits the settle', async (t) => {
  const { toolRan } = session(t);
  const keys = keyboard((s) => s === '\r' && toolRan());
  await handPrompt(TEXT, { type: keys.type, signal: going(), ...quick, settleMs: 120 });
  assert.equal(keys.typed.length, 2);
  // A timer may fire up to a millisecond early on Windows; the settle is the gap, not a deadline.
  assert.ok(keys.at[1] - keys.at[0] >= 119, `the Enter came ${keys.at[1] - keys.at[0]} ms after the paste`);
});

test('a stop before the Enter types no Enter', async (t) => {
  const { log } = session(t);
  const keys = keyboard();
  const stop = new AbortController();
  const sending = handPrompt(TEXT, { type: keys.type, signal: stop.signal, ...quick, settleMs: 10_000 });
  stop.abort();
  assert.equal(await sending, 'stopped');
  assert.deepEqual(keys.typed, [pasted(TEXT)]);
  assert.deepEqual(lines(log()), [`run: stopped before the prompt was taken for ${ID}`], 'said once');
});

test('a stop before the paste types nothing', async (t) => {
  session(t);
  const keys = keyboard();
  const stop = new AbortController();
  stop.abort();
  assert.equal(await handPrompt(TEXT, { type: keys.type, signal: stop.signal, ...quick }), 'stopped');
  assert.deepEqual(keys.typed, []);
});

// --- handoff-prompt S3: the prompt was taken, or Enter is typed once more, or it is said (spec 2, 5; L3, L4, A1) ---

test('a session that stamps after the retype', async (t) => {
  const { toolRan, log } = session(t);
  let enters = 0;
  const keys = keyboard((s) => s === '\r' && ++enters === 2 && toolRan());

  assert.equal(await handPrompt(TEXT, { type: keys.type, signal: going(), ...quick }), 'retyped');
  assert.deepEqual(keys.typed, [pasted(TEXT), '\r', '\r'], 'one lone Enter more, the second');
  assert.deepEqual(lines(log()), [`run: retyped Enter for ${ID}`, `run: prompt taken for ${ID}`]);
});

test('a session that never stamps', async (t) => {
  const { log } = session(t);
  const keys = keyboard();

  assert.equal(await handPrompt(TEXT, { type: keys.type, signal: going(), ...quick }), 'not started');
  assert.deepEqual(keys.typed, [pasted(TEXT), '\r', '\r'], 'at most one retype');
  assert.deepEqual(lines(log()), [`run: retyped Enter for ${ID}`, `run: hand-off not started for ${ID}`]);
});

test('a stamp from before the prompt is not taken', async (t) => {
  const { toolRan } = session(t);
  toolRan();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const keys = keyboard();

  assert.equal(await handPrompt(TEXT, { type: keys.type, signal: going(), ...quick }), 'not started');
});

test('a stop during the check types nothing more', async (t) => {
  const { log } = session(t);
  const stop = new AbortController();
  const keys = keyboard((s) => s === '\r' && stop.abort());

  assert.equal(await handPrompt(TEXT, { type: keys.type, signal: stop.signal, ...quick, takenWaitMs: 10_000 }), 'stopped');
  assert.deepEqual(keys.typed, [pasted(TEXT), '\r'], 'no retype after the session has gone');
  assert.deepEqual(lines(log()), [`run: stopped before the prompt was taken for ${ID}`]);
});

test('a stop during the second wait types nothing more', async (t) => {
  session(t);
  const stop = new AbortController();
  let enters = 0;
  const keys = keyboard((s) => s === '\r' && ++enters === 2 && stop.abort());

  assert.equal(await handPrompt(TEXT, { type: keys.type, signal: stop.signal, ...quick }), 'stopped');
  assert.deepEqual(keys.typed, [pasted(TEXT), '\r', '\r']);
});
