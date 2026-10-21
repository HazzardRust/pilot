/**
 * The pty protocol for a hand-off's first prompt (handoff-prompt L1, L2).
 *
 * Typed as one chunk, `text\r`, the prompt sat unsent in the fresh session's input
 * line at least twice: the TUI read the chunk as a paste, and a `\r` inside a paste
 * is a newline, not a keypress. So the text goes in between the bracketed-paste
 * markers, which make it one paste whatever chunking ConPTY applies, and Enter
 * follows alone, in a write of its own, after a settle. Claude Code's own pty driver
 * types into its REPL the same way with a 10 ms settle; ours lands just after
 * `/clear`'s redraw and the SessionStart hooks, so it waits longer.
 */
import { pause } from './run-claim.mjs';

/** The pause between the paste and its Enter (L2). */
export const SETTLE_MS = 300;

/** `text` as one bracketed paste. */
export const pasted = (text) => `\x1b[200~${text}\x1b[201~`;

/**
 * Types `pasted(text)`, waits `settleMs`, then types a lone `\r`. Answers whether the
 * Enter went in: false, with nothing more typed, when `signal` aborts first, because
 * a wrapper whose session has gone has no input line left to submit.
 */
export async function submitPrompt(text, { type, signal, settleMs = SETTLE_MS }) {
  if (signal.aborted) return false;
  type(pasted(text));
  await pause(settleMs, signal);
  if (signal.aborted) return false;
  type('\r');
  return true;
}
