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

import { TAKEN_WAIT_MS, SETTLE_MS, pasted, promptTaken, submitPrompt } from '../run-prompt.mjs';

const deck = createRequire(import.meta.url)('../../hooks/lib/deck.js');

const TEXT = 'Pick up the hand-off on the deck.';

function keyboard() {
  const typed = [];
  const at = [];
  return { typed, at, type: (s) => { typed.push(s); at.push(performance.now()); } };
}

test('the paste is the text between the bracketed-paste markers', () => {
  assert.equal(pasted(TEXT), `\x1b[200~${TEXT}\x1b[201~`);
  assert.equal(SETTLE_MS, 300);
});

test('the prompt and its Enter are two writes', async () => {
  const keys = keyboard();
  const sent = await submitPrompt(TEXT, { type: keys.type, signal: new AbortController().signal, settleMs: 0 });
  assert.equal(sent, true);
  assert.deepEqual(keys.typed, [pasted(TEXT), '\r'], 'the Enter is never inside the paste');
});

test('the Enter waits the settle', async () => {
  const keys = keyboard();
  await submitPrompt(TEXT, { type: keys.type, signal: new AbortController().signal, settleMs: 120 });
  assert.equal(keys.typed.length, 2);
  // A timer may fire up to a millisecond early on Windows; the settle is the gap, not a deadline.
  assert.ok(keys.at[1] - keys.at[0] >= 119, `the Enter came ${keys.at[1] - keys.at[0]} ms after the paste`);
});

test('a stop before the Enter types no Enter', async () => {
  const keys = keyboard();
  const stop = new AbortController();
  const sending = submitPrompt(TEXT, { type: keys.type, signal: stop.signal, settleMs: 10_000 });
  stop.abort();
  assert.equal(await sending, false);
  assert.deepEqual(keys.typed, [pasted(TEXT)]);
});

test('a stop before the paste types nothing', async () => {
  const keys = keyboard();
  const stop = new AbortController();
  stop.abort();
  assert.equal(await submitPrompt(TEXT, { type: keys.type, signal: stop.signal, settleMs: 0 }), false);
  assert.deepEqual(keys.typed, []);
});

// --- handoff-prompt S3: the prompt was taken, or Enter is typed once more, or it is said (spec 2, 5; L3, L4, A1) ---

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

const quick = { pollMs: 5, takenWaitMs: 60 };

test('a session that stamps at once is taken', async (t) => {
  const { toolRan, log } = session(t);
  const keys = keyboard();
  const since = Date.now();
  toolRan();

  assert.equal(await promptTaken({ since, type: keys.type, signal: new AbortController().signal, ...quick }), 'taken');
  assert.deepEqual(keys.typed, [], 'a prompt the session took gets no second Enter');
  assert.match(log(), /Z run: prompt taken$/m);
  assert.equal(TAKEN_WAIT_MS, 60_000, 'A1: 60 s, twice');
});

test('a session that stamps after the retype', async (t) => {
  const { toolRan, log } = session(t);
  const typed = [];
  const type = (s) => { typed.push(s); toolRan(); };

  assert.equal(await promptTaken({ since: Date.now(), type, signal: new AbortController().signal, ...quick }), 'retyped');
  assert.deepEqual(typed, ['\r'], 'one lone Enter, the second');
  const lines = log().split('\n').filter(Boolean).map((l) => l.replace(/^\S+ /, ''));
  assert.deepEqual(lines, ['run: retyped Enter', 'run: prompt taken']);
});

test('a session that never stamps', async (t) => {
  const { log } = session(t);
  const keys = keyboard();

  assert.equal(await promptTaken({ since: Date.now(), type: keys.type, signal: new AbortController().signal, ...quick }), 'not started');
  assert.deepEqual(keys.typed, ['\r'], 'at most one retype');
  const lines = log().split('\n').filter(Boolean).map((l) => l.replace(/^\S+ /, ''));
  assert.deepEqual(lines, ['run: retyped Enter', 'run: hand-off not started']);
});

test('a stamp from before the prompt is not taken', async (t) => {
  const { toolRan } = session(t);
  toolRan();
  const keys = keyboard();

  assert.equal(await promptTaken({ since: Date.now() + 1000, type: keys.type, signal: new AbortController().signal, ...quick }), 'not started');
});

test('a stop during the check types nothing', async (t) => {
  session(t);
  const keys = keyboard();
  const stop = new AbortController();
  const checking = promptTaken({ since: Date.now(), type: keys.type, signal: stop.signal, pollMs: 5, takenWaitMs: 10_000 });
  stop.abort();

  assert.equal(await checking, 'stopped');
  assert.deepEqual(keys.typed, [], 'no retype after the session has gone');
});

test('a stop during the second wait types nothing more', async (t) => {
  session(t);
  const stop = new AbortController();
  const typed = [];
  const type = (s) => { typed.push(s); stop.abort(); };

  assert.equal(await promptTaken({ since: Date.now(), type, signal: stop.signal, ...quick }), 'stopped');
  assert.deepEqual(typed, ['\r']);
});
