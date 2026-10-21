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

import { SETTLE_MS, pasted, submitPrompt } from '../run-prompt.mjs';

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
