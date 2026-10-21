# Brief: thread-kinds

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`. Never work in that checkout
or in another session's worktree: create your own, named `pilot-thread-kinds-s<n>`, beside it.

On Windows a worktree in a deep directory needs `git -c core.longpaths=true worktree add`: 21 tracked fixture paths
are 127 characters long. Run `npm ci` in the new worktree before the first test run; without it about twenty
unrelated tests fail.

## Base and PR target

Base: `feat/thread-kinds`, cut from `main` at 778c98b (0.7.14). Every slice PR is a **draft** against
`feat/thread-kinds` and is never marked ready; the pilot merges it. Branch name: `slice/thread-kinds-s<n>`. Write PR
bodies with `gh pr create --body-file <file>`; a heredoc body fails in Git Bash.

## Artefact

`docs/design/thread-kinds/architecture.md`, approved at Gate 1 on 2026-10-01 (itm_fb8a5def67eb, at 31efcb0). Slice
files are `docs/design/thread-kinds/slices/S<n>.md`. The locked decisions are §5 (L1–L19); a slice moves none of
them. A2, A8 and A9 in §6 are assumed and stand. ADRs 0057, 0058 and 0059 are already written on this branch; a slice
that names one amends it rather than creating it. The next free ADR number is 0060.

## Gate command

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
```

`check-provenance.mjs` run without directories prints its usage and exits 2: it has checked nothing.

There is no typecheck, lint or build step. One file alone: `node --test <file>`. A directory does not work on
Windows (`node --test scripts/test` fails as one opaque result): use the glob form, `node --test scripts/test/*.test.mjs`.

For every slice with a visible surface (S1, S2, S4, S6, S7, S9, S10, S12) the live gate is the deck started from
your worktree on its own port and store, opened in a browser and looked at:

```
PILOT_DECK_DIR=<scratch>/.deck PILOT_DECK_PORT=<free port> PILOT_DECK_NO_OPEN=1 node bin/pilot.mjs deck --foreground
```

A Windows recipe that seeds such a deck is in `C:/Users/Hazzard/Projects/pilot-qa-seed/deck-polish/`. Never the
user's deck on port 4321, and never its store at `~/.claude/pilot/deck.json`. Never press Start or End on a tab.
The test suite must never open a window or a browser: `deck/test/no-open.mjs` sets `PILOT_DECK_NO_OPEN` and
`PILOT_DECK_NO_START`. S8 and S11 exercise the SessionStart lane: run `hooks/session-handoff.js` against the scratch
deck with `PILOT_DECK_PORT` set, never against the live one.

## Known flaky tests

`deck/test/usage.test.mjs`'s reset-time test and `deck/test/daemon.test.mjs`'s progress-token test have failed
under load and never alone; rerun the one file before you call it a regression. Otherwise none known: the suite was
green on `main` at 778c98b, about 35 s.

## Shared constraints

- Several tests read the real `agents/pilot.md` and pin its wording: `deck/test/skeleton.test.mjs`,
  `deck/test/audit-offer.test.mjs`, `deck/test/parallel.test.mjs`, `deck/test/record-report.test.mjs`,
  `hooks/test/session-handoff.test.js`, `scripts/test/handoff-wording.test.mjs`, `scripts/test/pilot-rules.test.mjs`,
  `scripts/test/pilot-agents.test.mjs`, `scripts/test/general-purpose.test.mjs`. S5, S6, S8, S11 and S12 edit
  `pilot.md` (S5 also `pilot-qa.md`; S10 `pilot-auditor.md` and `skills/audit/SKILL.md`). When a pin fails after
  your edit, read what rule it pins: change the pin only when your slice changed that rule on purpose, and say so
  in the PR; never loosen a pin to pass.
- `deck/tools.mjs` is the tool schema the deck advertises, and `scripts/measure-prompt.mjs` imports the real file
  (`:84`), so a `deck_post` schema edit counts against two prompt-budget pins: the pilot's (10400, 10314.75 used
  at the base) and pilot-qa's (`scripts/test/qa-preview.test.mjs:111`, re-pinned to 5740 by S1 for the gate
  fields, lowered to 5720 by S2; S5 held it there). A slice that adds to the schema says so in its PR with both measured figures; a slice that removes from
  it (S2 deletes `gate`, S12 deletes the spec kind) lowers the pin back by what it freed rather than leaving the
  headroom to be spent.
- Small-diff limit: the one in your slice file. Past it, stop and ask `main`.
- `deck/ui/render.mjs`, `deck/store.mjs` and `deck/server.mjs` are each over a thousand lines: read the ranges your
  slice file anchors, not the whole file, and one file per turn.
- The reviewer is `pilot:typescript-reviewer` for every slice; S1, S8 and S11 also get `pilot:security-reviewer`
  (each handles agent or hook input at a post route or the SessionStart lane).
- The pilot's own tool schemas come from the installed plugin cache, not this repo: nothing a slice changes in
  `deck/tools.mjs` reaches the live pilot until a release is installed. Test against the scratch deck with curl.

## Commit trailer

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gnsv4HNp2A1imhTaEyfwcW
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01Gnsv4HNp2A1imhTaEyfwcW
```
