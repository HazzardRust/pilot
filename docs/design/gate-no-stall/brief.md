# Brief: gate-no-stall

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

The repository is `C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Its default branch is `main` and its
pilot branch is `pilot`. Never work in that checkout, or in another session's worktree. Create your own beside it,
named `pilot-gate-no-stall-s<n>`. In a deep directory, `git -c core.longpaths=true worktree add`. Run `npm ci` in the
new worktree before the first test run.

## Base and PR target

The base is `feat/gate-no-stall`, cut at Gate 1 from `origin/pilot` (c8fa923a, which holds `feat/pilot-fork`). Every
slice PR is a **draft** against `feat/gate-no-stall` and is never marked ready, because the pilot merges it.

- Branch name: `slice/gate-no-stall-s<n>`.
- PR body: write it with `gh pr create --body-file <file>`.

## PR titles

- A slice: `feat(gate-no-stall): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(gate-no-stall): <what>`
- The feature PR: `feat(gate-no-stall): A signed gate never stalls`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CPS1rQrySEYtu99gvEd1Uw
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01CPS1rQrySEYtu99gvEd1Uw
```

## Artefact

The artefact is `docs/design/gate-no-stall/architecture.md`, and the slice files are `slices/S<n>.md`. Its terms (§4)
are fixed: **pilot lane**, **blocked step**, **blocked item**, **live run**, **the ready press**, **holds the default
branch**. The locked decisions are in §5 (L1–L11), and no slice moves one. S1 states the blocked-item seam
(`postBlocked` in `hooks/lib/blocked.js`, `liveTicket` in `hooks/lib/deck.js`); S2 and S3 read it by name from the
integration branch. ADRs 0137–0140 record L1–L4/L9, L10, L6 and L7–L8.

## Tests

Nothing reaches GitHub, the live deck on 4321, or a real remote from a test. A hook test feeds a fake payload on stdin
and a fake deck (an `http` server on a free port, or an injected `deck`); a test that needs a repository makes a scratch
clone with bare remotes (copy `scratchRepos` from `scripts/test/base.test.mjs`). `gh` is always injected as
`(args) => string`. Every test that starts a process or server stops it in teardown.

## Gate command

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
```

There is no typecheck, lint or build step. To run one file, use `node --test <file>`. On Windows, use the glob form
for a directory. Pins on one rule are spread across `deck/test/`, `scripts/test/` and `hooks/test/`, so grep for the
sentence before the first full run. No test is known to flake. A slice that edits `agents/pilot.md` (S3, S6)
re-measures the pilot pin in `scripts/test/measure-prompt.test.mjs` to the real number and says so in its PR.

## Live verification

S1 and S2 run the real hook process (`node hooks/<hook>.js < payload.json`) against a scratch deck
(`pilot deck --scratch`, stopped in teardown) with a planted live run, and paste the resulting item in the PR. S3 and S6
run `node bin/pilot.mjs <command>` in a scratch clone with an injected or stubbed `gh` and paste the output. `pilot land`
and `pilot integrate --default` are never run for real against HazzardRust/pilot from a slice. Never use the live deck
on 4321.

## Diff limit

300 changed lines per slice. Past that, stop and ask `main`.
