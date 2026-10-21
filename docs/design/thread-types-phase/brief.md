# Brief: thread-types-phase

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`. Never work in that checkout
or in another session's worktree: create your own, named `pilot-thread-types-phase-s<n>`, beside it.

On Windows a worktree in a deep directory needs `git -c core.longpaths=true worktree add`: 21 tracked fixture paths
are 127 characters long. Run `npm ci` in the new worktree before the first test run; without it about twenty
unrelated tests fail.

## Base and PR target

Base: `feat/thread-types-phase`, cut from `main` at bd68ee5 (0.7.12, which includes start-end-session, PR #215 —
the artefact's F9 was written before that merge; `tab.wrapped`, `renderSession` and `storedTabFor` are in the base
now). Every slice PR is a **draft** against `feat/thread-types-phase` and is never marked ready; the pilot merges
it. Branch name: `slice/thread-types-phase-s<n>`. Write PR bodies with `gh pr create --body-file <file>`; a heredoc
body fails in Git Bash.

## Artefact

`docs/design/thread-types-phase/architecture.md`, approved at Gate 1 on 2026-10-01 (itm_566207e8833b). Slice files
are `docs/design/thread-types-phase/slices/S<n>.md`. The locked decisions are §5 (L1–L12); a slice moves none of
them. A2 and A3 in §6 are decided (L12, L11); A1 and A4–A9 are assumed and stand.

## Gate command

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
```

`check-provenance.mjs` run without directories prints its usage and exits 2: it has checked nothing.

There is no typecheck, lint or build step. One file alone: `node --test <file>`.

For every slice with a visible surface (S1, S3, S4, S5) the live gate is the deck started from your worktree on its
own port and store, opened in a browser and looked at:

```
PILOT_DECK_DIR=<scratch>/.deck PILOT_DECK_PORT=<free port> PILOT_DECK_NO_OPEN=1 node bin/pilot.mjs deck --foreground
```

A Windows recipe that seeds such a deck is in `C:/Users/Hazzard/Projects/pilot-qa-seed/deck-polish/`. Never the
user's deck on port 4321, and never its store at `~/.claude/pilot/deck.json`. Never press Start or End on a tab.
The test suite must never open a window or a browser: `deck/test/no-open.mjs` sets `PILOT_DECK_NO_OPEN` and
`PILOT_DECK_NO_START`.

## Known flaky tests

`deck/test/usage.test.mjs`'s reset-time test and `deck/test/daemon.test.mjs`'s progress-token test have failed
under load and never alone; rerun the one file before you call it a regression. Otherwise none: the suite ran
1975 of 1975 on 2026-10-01, about 35 s.

## Shared constraints

- Several tests read the real `agents/pilot.md` and pin its wording: `deck/test/skeleton.test.mjs`,
  `deck/test/audit-offer.test.mjs`, `deck/test/parallel.test.mjs`, `deck/test/record-report.test.mjs`,
  `hooks/test/session-handoff.test.js`, `scripts/test/handoff-wording.test.mjs`, `scripts/test/pilot-rules.test.mjs`,
  `scripts/test/pilot-agents.test.mjs`, `scripts/test/general-purpose.test.mjs`. S1, S3 and S5 edit `pilot.md`
  (S3 also `pilot-qa.md` and `skills/audit/SKILL.md`). When a pin fails after your edit, read what rule it pins:
  change the pin only when your slice changed that rule on purpose, and say so in the PR; never loosen a pin to
  pass.
- `deck/tools.mjs` is the tool schema the deck advertises; `scripts/measure-prompt.mjs` measures it against a
  fixture, not the real file, so a schema edit needs no re-pin.
- Small-diff limit: the one in your slice file (150 or 300 changed lines). Past it, stop and ask `main`.
- `deck/ui/render.mjs`, `deck/store.mjs` and `deck/server.mjs` are each over a thousand lines: read the ranges your
  slice file anchors, not the whole file, and one file per turn.
- The reviewer is `pilot:typescript-reviewer` for every slice; S2 and S5 also get `pilot:security-reviewer`
  (each handles agent input at the post route or the Stop hook).
- The next free ADR number is 0051 (S2 writes it; S4 writes 0052).

## Commit trailer

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
