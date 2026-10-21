# yellow-agent: QA pass 1 and run notes (2026-10-06)

Written by the pilot for the next session and the next QA agent. QA pass 1 was read-only at `e2747f30`; it ran out
of context before the walkthrough. Its scratch files are in the session scratchpad
`%TEMP%/claude/C--Users-Hazzard-Projects-pilot/bc8648c6-5fd6-46b3-8b34-8784b83a7173/scratchpad`
(`seed.mjs`, `drive.mjs`, `watch.mjs`, `session.log`, `gate.txt`, `repo`, `remote.git`, `.deck`).

## Spec lines at e2747f30

| Spec | How | Result | Evidence |
| --- | --- | --- | --- |
| 1 | live CLI and page | pass | no `--sub` in help; `pilot run --sub` exit 1; one tab per repository, no Pause |
| 2 | live scratch session | pass | first turn spawned `pilot:pilot-co-pilot` in the background; the Agents section not checked (`/api/agents` is no page) |
| 3 | live | pass | the co-pilot wrote every row of two one-slice tickets with the main session idle |
| 4 | live page | pass (render) | the blocking question card shows on Overview; the co-pilot asked main two questions it could have decided (budget, live QA) |
| 5 | live | pass | first ticket red with its blocking question open; second ticket's co-pilot spawned 12 s later. The co-pilot worked past the open question; the walkthrough triggered the hand-back |
| 6 | live `/clear`, not a hand-off | not proven | the co-pilot SURVIVED the `/clear` (no exit 137, rows kept moving); the fresh session messaged the existing co-pilot, spawned none. Re-spawn proven by the hook test only. Unproven: a hand-off-delivered `/clear` (`yellowLane(..., always=true)`, `hooks/session-handoff.js:329`) with a live co-pilot: does the fresh session spawn a second one? |
| 7 | live CLI | pass | `budget main 3 yellow 5`; floor 2; over 8 warns. The installed `~/.claude/rules/orchestration.md` (sha256 36b20f79…) is in the ledger: an upgrade replaces it |
| 8 | live | pass | `/api/record` has no `role`; a stored `mode` is dropped on write; a copy of the 46-item pre-feature store (`C:/Users/Hazzard/qa-pb`) loads |
| 9 | not run | after merge | needs the real deck after merge and restart |
| A1 hook | live | not exercised | the user's settings run auto mode; the classifier allowed every call, no prompt reached the hook |
| Gate | once | pass | 2455 tests, the one failure the known `usage.test.mjs` flake (43/43 alone) |

Earlier evidence on `/clear`: on 2026-10-05 a background QA agent's in-flight Bash call was killed by it (exit 137;
`~/.claude/pilot/wrapper.log:55`, agent `adf111043f1343893` under sessions `d5a91f8c…` and `574c5b89…`). So both
outcomes have been seen once. Question `itm_2a18cf6abdc0` holds this for the user; assumed: ship as built.

## Left by QA pass 1

- Worktree `C:/Users/Hazzard/Projects/pilot-feat-yellow-agent-qa`, branch `qa/yellow-agent`, clean, at `e2747f30`.
- Scratch deck on port 4520 (pid 1488 when last seen), store `scratchpad/.deck`. The scratch session tree is stopped.
- Scratch-environment traps: write Windows paths in a seed with forward slashes (a `\b` or `\r` escape corrupted
  repo keys); a bare remote's HEAD must name `main` or `pilot integrate` refuses; the workspace-trust dialog needs
  arrow keys through the pty; `CLAUDE_CODE_CHILD_SESSION` leaks into a scratch session and turns its transcript off.

## Assumed by the pilot, the user's to overturn

- S8 went in at 484 changed lines and S10 at 540 (limit 400), both mostly deletion; no re-cut.
- S8 deleted the `sub` cases of three test files S9 owned; S10 took two sittings.
- QA accepted Claude Code's workspace-trust dialog for its own scratch folder.
- `itm_2a18cf6abdc0`: ship as built.

## Friction, for the closing report

| Agent | What | Evidence |
| --- | --- | --- |
| implementers (S5, S6, S10) | `npm test` prints the spec reporter; a `not ok` grep finds nothing | one wasted full run each |
| S5, S6 | no CLI prints `measure()`'s pinned prompt figure | each wrote a scratch script |
| S7, S9, S10 | pins on removed behaviour sit in test files outside the slice's list and surface only in the full run | S10: 18 failures over 8 files; S9 and S7 a second full run each |
| S10, QA | one agent's context cannot hold a store-wide removal, or a live pass plus a walkthrough | S10 two sittings; QA handed off before the walkthrough |
| S5 | a slice file's Payment line named text that did not exist | `git grep` empty at 94d2b85b |
| S8 | a combined `node --test` of three `subdeck-*` files hung past 300 s | cause unverified; the files are deleted |
| S11 | seeding a ticket needs ticket-making's body shape | used `testUtils.mjs` `postStored` and `shapedTicketBody` |
| fundamentalist | coverage covers `deck/**` only; no mutation tool in the repo | hooks needed Stryker on a `git archive` copy with 88 MB of `node_modules` |
| fundamentalist | the artefact's tables are single lines over 900 characters | every read had to be cut |
| pilot | `deck_read` returns 114 KB for the open list | parsed from a saved file |
| pilot | an agent's hand-back channel takes one report; an interim note used it up (S5) | the real report came as a message |
| pilot | the S6 probe's result lived in no file | now here |
