---
status: proposed
date: 2026-10-21
tags: [run, handoff, pty, wrapper]
supersedes: []
superseded_by: []
paths: [deck/run.mjs, deck/run-prompt.mjs, hooks/post-tool.js, hooks/lib/deck.js, deck/run-claim.mjs, docs/design/handoff-prompt/architecture.md]
---
# The hand-off's first prompt is pasted, then Enter alone, and checked

We decided that `pilot run` types a hand-off's first prompt as one bracketed paste and submits it with a lone Enter in a write of its own after a 300 ms settle, and that it then checks the fresh session took the prompt by a tool call of the run's main session, retyping Enter once before it says the hand-off did not start.

## Context

After `/clear`, the wrapper typed the first prompt and its Enter as one chunk, `text\r`. At least twice the `/clear` ran but the prompt sat unsent in the input line and the user had to press Enter by hand (itm_e6a914cb63f9 waited 19 minutes). The TUI reads a chunk that arrives at once as a paste, and a `\r` inside a paste is a newline, not a keypress. Timing alone did not tell the failures apart: marker to prompt was 0.3 to 0.4 s on every hand-off, failed or not.

## Decision

- **L1 Bracketed paste, then a lone Enter.** The prompt goes in as `ESC[200~text ESC[201~`, so the TUI reads it as one paste whatever chunking ConPTY applies, and Enter follows as a pty write of exactly `\r`, a keypress. Claude Code's own pty driver types into its REPL the same way.
- **L2 Settle 300 ms** between the paste and the Enter. The CLI's driver uses 10 ms against a settled REPL; ours lands just after `/clear`'s redraw and the SessionStart hooks.
- **L3 Taken is a main-session tool call**, stamped by the PostToolUse hook as `tool-ran-<wrapper pid>.stamp` beside the turn-ended stamp, for the run's main session only, in its own directory.
- **L4 One retype, then say it.** With no tool call within the bound, the wrapper types one lone Enter again; with none within the bound again it logs and replies that the hand-off did not start, on the hand-off's thread or this directory's chat. A second retype would repeat what failed.

## Rejected

- *Key-by-key typing* (L1): each character runs the slash and autocomplete paths, and it is slow.
- *Text then `\r` without markers* (L1): kept only as the fallback should ConPTY show the markers as text.
- *Waiting for output silence on the pty* (L2): a new reader of the TUI's bytes for a bound a constant already sets.
- *The hand-off item's reply or close as the pick-up signal* (L3): a chain hand-off is closed by the lane at delivery, a false "taken" every time.
- *A `UserPromptSubmit` hook* (L3): a new hook entry and a process on every prompt the user types.

## Consequences

- Every hand-off takes 300 ms longer to submit its prompt, and `/clear` stays one write.
- A wrapper stopped between the paste and the Enter types nothing more, leaving the pasted text unsent in an input line that is going away.
