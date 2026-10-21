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
import { lastToolRan, pause, waitFor } from './run-claim.mjs';
import { log as logLine } from '../hooks/lib/wrapper-log.js';

/** The pause between the paste and its Enter (L2). */
export const SETTLE_MS = 300;

/**
 * How long the fresh session has to make a tool call before Enter is typed once more,
 * and again after it (A1, locked by the user): pick-ups took 10-25 s, one 65 s.
 */
export const TAKEN_WAIT_MS = 60_000;

/** How often the tool-call stamp is read. */
const TAKEN_POLL_MS = 1000;

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

/**
 * Whether the fresh session took the prompt (handoff-prompt L3, L4): a tool call of its
 * own, stamped by `post-tool.js`, at or after `since`, which is read before the paste so
 * the old session's calls never count. None within `takenWaitMs` types one lone `\r`
 * more, safe because an Enter on an empty input line does nothing; none within the
 * bound again is `'not started'`, which the caller says aloud. A second retype would
 * repeat what failed, so there is none. A stop types nothing more: `'stopped'`.
 */
export async function promptTaken({ since, type, signal, pollMs = TAKEN_POLL_MS, takenWaitMs = TAKEN_WAIT_MS }) {
  const taken = () => waitFor(() => lastToolRan() >= since, { signal, pollMs, waitMs: takenWaitMs });
  const stopped = () => {
    logLine('run: stopped before the prompt was taken');
    return 'stopped';
  };
  if (await taken()) {
    logLine('run: prompt taken');
    return 'taken';
  }
  if (signal.aborted) return stopped();
  type('\r');
  logLine('run: retyped Enter');
  if (await taken()) {
    logLine('run: prompt taken');
    return 'retyped';
  }
  if (signal.aborted) return stopped();
  logLine('run: hand-off not started');
  return 'not started';
}
