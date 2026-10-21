# handoff-prompt: the hand-off's first prompt is submitted, every time

Ticket `itm_04e5fe15f3f9` · design branch `design/handoff-prompt` from `origin/pilot` c8365943 · ADR NNNN.

## 1. Problem

When the pilot's context fills, `pilot run` (`deck/run.mjs`) types `/clear` and then the fresh session's first
prompt, with nobody at the keyboard. At least twice the `/clear` ran but the prompt ("Pick up the hand-off on the
deck. Spawn pilot-lander <id>.") sat in the input line unsent, and the user had to press Enter by hand
(itm_e6a914cb63f9 waited 19 min, 00:12 to 00:31 on 2026-10-21). The fix lives inside the automatic cycle, never as a
step the user remembers.

## 2. Spec

| # | Behaviour | Evidence | Bar |
|---|---|---|---|
| 1 | After `/clear`, the first prompt goes into the fresh session as one bracketed paste (`ESC[200~`…`ESC[201~`), then, after a settle, Enter as a lone `\r` in its own pty write, never in the prompt's chunk. | `deck/test/run.test.mjs` `HANDED_OFF` is `['/clear\r', paste, '\r']`; a `submitPrompt` test pins the gap; live: hand-offs under `pilot run` on a scratch deck start their first turn unattended. | 3 writes; gap >= 300 ms; 5 of 5 live hand-offs start with no key pressed |
| 2 | The wrapper checks the fresh session took the prompt: the run's main session makes a tool call after it within a bound (*assumed* A1: 60 s). If not, it types one lone `\r` again; if still nothing within the bound again, it says so. Never silent. | `~/.claude/pilot/wrapper.log` carries `prompt taken`, or `retyped Enter` then `prompt taken`, or `retyped Enter` then `hand-off not started`, per hand-off; tests with a fake session that stamps at once, after the retype, and never. | one outcome line per hand-off; at most 1 retype |
| 3 | A hand-off not started is surfaced as a reply on the hand-off's thread, or, when that thread is closed (a chain hand-off), on this directory's chat. | The never-stamping test ends with that deck reply; a chain hand-off variant ends with the chat reply. | 1 reply, within 2 bounds of the prompt |
| 4 | A tool call by the run's main session (not a subagent, only under `pilot run`, only in its directory) stamps `tool-ran-<wrapper pid>.stamp`, the turn-ended stamp's idiom. | `hooks/test` pins: a main call stamps; an `agent_id` call and a foreign directory do not. | 0 stamps from subagents |
| 5 | A wrapper stopping (the session exits) between the paste and the Enter, or during the check, types nothing more. | An aborted-signal test: no `\r` after the paste, no retype. | 0 writes after abort |

practitioner: Claude Code's own pty driver (`claude.exe`, its bg-pty reply path) types into a REPL exactly this way:
`pty.write("\x1B[200~" + text + "\x1B[201~")`, then `setTimeout(() => pty.write("\r"), 10)`. Spec 1 copies it with a
wider settle for the redraw after `/clear`. The instrument that confirms it is wrapper.log plus a live `pilot run`.

## 3. Findings

- `deck/run.mjs:80` `CLEAR = '/clear\r'`, one write, "proved live"; 82+ hand-offs cleared. Kept.
- `deck/run.mjs:368` types `${firstPrompt(items, cwd)}\r`: text and Enter in one chunk, the fault. `:369` logs
  `run: marker for <id>, typed the prompt`, pinned at `deck/test/run.test.mjs:1405`.
- `deck/run.mjs:358` waits for the lane's marker (`laneMarked`, polled 250 ms). wrapper.log:476-478: marker to prompt
  0.3-0.4 s on every hand-off, failed or not, so timing alone does not show which will fail.
- `deck/run.mjs:415` `sayNoMarker`: reply on the hand-off thread, then the directory's chat, each failure logged.
  Spec 3 reuses it, generalised as `sayAloud`.
- `hooks/session-handoff.js:500-506`: a chain hand-off (`item.next`) is resolved by the lane at delivery, so the item
  closes whether or not the prompt was taken, and the session has no open thread to reply on. A deck reply or close is
  therefore not a pick-up signal (L3).
- `hooks/lib/deck.js:706` `markTurnEnded` writes `claims/turn-ended-<PILOT_RUN_PID>.stamp`, only when the env names a
  run in this directory; `deck/run-claim.mjs` `lastTurnEnded` reads it. `deck/run.mjs:643` sets `PILOT_RUN_PID` and
  `PILOT_RUN_REPO`. `hooks/post-tool.js` runs after every tool call and already skips `agent_id` for its pickup module.
- deck.json pick-up latencies (prompt to the session's first reply or resolve): 10, 13, 15, 25, 65 s; one 1141 s (stuck).
- `deck/run.mjs` is 758 lines; `deck/test/facades.test.mjs:18` bars deck files at 800. New logic goes in a new file.
- `deck/test/run.test.mjs:214` `HANDED_OFF` and `:223` `keyboard()` serve ~26 tests; changing them is S1's test
  churn, and `keyboard()` stamping on a lone `\r` keeps every existing test fast under S3.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| `deck/run-prompt.mjs` (new) | `submitPrompt(text, { type, signal, settleMs })`, `promptTaken({ since, type, signal, pollMs, takenWaitMs })` | the pty protocol: paste markers, settle, lone Enter, the check, its one retype, the outcome log lines | in-process |
| run stamps | `hooks/lib/deck.js` `stampRun(env, cwd, name)` behind `markTurnEnded`, `markToolRan`; `deck/run-claim.mjs` `stampAt(name)` behind `lastTurnEnded`, `lastToolRan` | the two copies of "write or read `<name>-<pid>.stamp` for this run's directory" | local-substitutable (files under a test home) |
| `clearOnce` (`deck/run.mjs`) | unchanged, plus `settleMs`, `takenWaitMs`; `sayAloud(handoff, cwd, read, text, signal)` from `sayNoMarker` | the no-marker and not-started notices share one thread-then-chat path | in-process |

Deletion test: deleting `run-prompt.mjs` puts the protocol back inside `clearOnce` and over the 800 bar; deleting
`stampRun` duplicates the env and directory guard in two writers. `firstPrompt` stays (one caller, pinned by name).

## 4. Ubiquitous language

- **first prompt**: `firstPrompt(items, cwd)`'s text, typed after the lane marks the fresh session.
- **lone Enter**: a pty write of exactly `\r`.
- **settle**: the pause between the paste and the lone Enter (300 ms).
- **taken**: the run's main session stamped `tool-ran` at or after the moment the prompt was typed.
- **not started**: no tool call after the prompt and its one retype, each within the bound.

## 5. Locked decisions

- **L1 Bracketed paste, then a lone Enter.** Claude Code's own pty driver does this; the markers make the TUI read the
  text as one paste whatever chunking ConPTY applies, and the separate `\r` is a keypress, never a pasted newline.
  Rejected: key-by-key typing (each character runs the slash and autocomplete paths, and is slow); text then `\r`
  without markers (kept as the fallback if S1's live check shows ConPTY strips the markers, see §6 red team).
- **L2 Settle 300 ms.** The CLI uses 10 ms against a settled REPL; ours lands right after `/clear`'s redraw and the
  SessionStart hooks. Rejected: waiting for output silence on the pty (a new reader of the TUI's bytes for a bound a
  constant already sets).
- **L3 Taken = a main-session tool call, stamped by PostToolUse.** Works for chain and context hand-offs alike, local,
  no deck round trip, and reuses `post-tool.js` (no new `hooks.json` entry). Rejected: the hand-off item's reply or
  close (a false "taken" on every chain hand-off); a `UserPromptSubmit` hook (a new hook entry, a process on every
  prompt the user types).
- **L4 One retype, then say it.** An Enter on an empty input line does nothing, so the retype is safe after a slow
  pick-up; a second would repeat what failed. The notice takes the no-marker path (thread, then chat) and a log line.
- **L5 The check runs inside `clearOnce`, awaited**, like the lane wait before it; the watch's cooldown already keeps
  change events from typing anything meanwhile. `/clear` stays one write.
- **L6 ADR NNNN** records L1-L4; the landing numbers it.
- **L7 Grilling depth: forks** (itm_4aa3d7fcdbdc). Only decisions whose paths fork reached the user; A1 was the one.
- **L8 QA environment: this machine, a real `pilot run` session** on a scratch deck, a forced hand-off, wrapper.log and the
  fresh session's first tool call as the evidence (itm_74f2e8f884e7). Rejected: a pty stub only (cannot show a TUI timing race fixed).

## 6. Assumed decisions

- **A1 Bound 60 s, twice.** Default: 60 s for a tool call, one lone Enter, 60 s more, then not started. Trades a slower
  notice (up to 2 min) for no retype into a normal pick-up (10-25 s seen, one 65 s). Rejected: 30 s (retypes into the
  65 s case, harmless but noisy). Answered itm_3739c92b2d43: 60 s + 60 s, locked by the user.
  Verdict: stands.
- red team: S3's existing-test drag. Tests that pass their own `type` (run.test.mjs:569, :594) would wait the 60 s
  bound; S3 passes `takenWaitMs` small there or uses `keyboard()`. Written into S3's Prohibited.
- red team: ConPTY may strip or pass through `ESC[200~` literally. S1's live check reads the input line; if the
  markers show as text, S1 drops them, keeps the lone Enter (L1's fallback), and says so in its PR.
- red team: a stale `tool-ran` stamp from the old session would read as taken. `since` is taken before the paste,
  the old session is at rest (`lastTurnEnded >= posted`) before `/clear`, and subagents never stamp (spec 4).
- red team: S1 and S3 both edit `clearOnce` and `run-prompt.mjs`; the cut serialises them (S3 after S1). S2 and S1
  share no file; S3 reads S2's `lastToolRan` by name.

## 7. Out of scope

`/clear`'s own write; the lane's marker; a `UserPromptSubmit` hook; any `agents/*.md` or `rules/*.md` prose
(`agents/pilot.md:588` stays true); causes of a stuck hand-off other than the unsent prompt.

## 8. Slices

Width 2; longest stem 2 (S1 → S3).

| Slice | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | Walking skeleton: the prompt is pasted, then Enter alone | 1, 5 | `deck/run-prompt.mjs` (new), `deck/run.mjs`, `deck/test/run-prompt.test.mjs` (new), `deck/test/run.test.mjs`, `docs/adr/NNNN-handoff-prompt.md` (new), `docs/adr/README.md` | – | ts, security | [S1](slices/S1.md) |
| S2 | The run's main session stamps its tool calls | 4 | `hooks/lib/deck.js`, `hooks/post-tool.js`, `deck/run-claim.mjs`, `hooks/test/tool-ran.test.js` (new) | – | ts, security | [S2](slices/S2.md) |
| S3 | An unsent prompt is retyped once, then said aloud | 2, 3, 5 | `deck/run-prompt.mjs`, `deck/run.mjs`, `deck/test/run-prompt.test.mjs`, `deck/test/run.test.mjs` | S1 (run-prompt.mjs, run.mjs), S2 (`lastToolRan`, `markToolRan`) | ts, security | [S3](slices/S3.md) |

## 9. Acceptance evidence

1. A real `pilot run` on a scratch deck, a hand-off posted: `/clear`, the prompt appears and is submitted with no key
   pressed, the fresh session's first turn starts; 5 of 5 (spec 1).
2. wrapper.log for each: `typed /clear`, `typed the prompt`, `prompt taken` (spec 2).
3. A test session that never takes the prompt: one lone Enter retyped, `hand-off not started` in wrapper.log, a reply
   on the hand-off thread or the chat (spec 2, 3).
4. Hook pins: main tool calls stamp, subagent ones do not (spec 4); abort pins type nothing after the stop (spec 5).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 1, 5 |
| S2 | planned | | | | – | 4 |
| S3 | planned | | | | S1, S2 | 2, 3, 5 |
| feature | planned | feat/handoff-prompt | | | S1, S2, S3 | 1-5 |
