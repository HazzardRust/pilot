# Brief: start-end-session

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`. Never work in that checkout
or in another session's worktree: create your own, named `pilot-start-end-session-s<n>`, beside it.

On Windows a worktree in a deep directory needs `git -c core.longpaths=true worktree add`: 21 tracked fixture paths
are 127 characters long. Run `npm ci` in the new worktree before the first test run; without it about twenty
unrelated tests fail.

## Base and PR target

Base: `feat/start-end-session` (cut from `main` at 06fd469, which includes deck polish, PR #206). Every slice PR is
a **draft** against `feat/start-end-session` and is never marked ready; the pilot merges it. Branch name:
`slice/start-end-session-s<n>`. Write PR bodies with `gh pr create --body-file <file>`; a heredoc body fails in Git
Bash.

## Artefact

`docs/design/start-end-session/architecture.md`, approved at Gate 1 on 2026-09-30 (itm_2795e34fe98b). Slice files
are `docs/design/start-end-session/slices/S<n>.md`. The locked decisions are §5 (L1–L8); a slice moves none of
them. A1, A3 and A8 in §6 are decided; A2, A4, A5, A6 and A7 are assumed and stand.

## Gate command

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
```

`check-provenance.mjs` run without directories prints its usage and exits 2: it has checked nothing.

There is no typecheck, lint or build step. One file alone: `node --test <file>`.

For every slice the live gate is the deck started from your worktree on its own port and store, opened in a
browser and looked at, and — for S1, S3 and S4 — a real Start or End pressed on it, with the terminal window that
opens or closes looked at:

```
PILOT_DECK_DIR=<scratch>/.deck PILOT_DECK_PORT=<free port> PILOT_DECK_NO_OPEN=1 node bin/pilot.mjs deck --foreground
```

A Windows recipe that seeds such a deck is in `C:/Users/Hazzard/Projects/pilot-qa-seed/deck-polish/`. Never the
user's deck on port 4321, and never its store at `~/.claude/pilot/deck.json`. Never press End on a tab whose
session you did not start. The test suite must never open a window: `PILOT_DECK_NO_START` (L7) is set beside
`PILOT_DECK_NO_OPEN` in `deck/test/no-open.mjs`, and unit tests inject `spawn`.

## Known flaky tests

`deck/test/usage.test.mjs`'s reset-time test and `deck/test/daemon.test.mjs`'s progress-token test have failed
under load and never alone; rerun the one file before you call it a regression. Otherwise none: the suite ran
1942 of 1942 on 2026-09-30, about 30 s.

## Shared constraints

- `agents/pilot.md` and the deck tool schemas are pinned together by `scripts/test/measure-prompt.test.mjs`; no
  slice of this run edits `agents/` or `skills/`.
- Small-diff limit: 300 changed lines a slice. Past it, stop and ask `main`.
- `deck/ui/render.mjs`, `store.mjs` and `server.mjs` are each over a thousand lines: read the ranges your slice
  file anchors, not the whole file, and one file per turn.
- The security reviewer (`pilot:security-reviewer`) reviews every slice of this run beside the TypeScript
  reviewer: each one spawns, ends, or handles the Start/End request.
- The next free ADR number is 0050 (S1 writes it).

## Commit trailer

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
