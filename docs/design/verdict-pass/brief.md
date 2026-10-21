# Brief: verdict-pass

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

The repository is `C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Its default branch is `main` and its
pilot branch is `pilot`. Never work in that checkout, or in another session's worktree. Create your own beside it,
named `pilot-verdict-pass-s<n>`. In a deep directory, `git -c core.longpaths=true worktree add`. Run `npm ci` in the
new worktree before the first test run.

## Base and PR target

The base is `feat/verdict-pass`, cut at Gate 1 from `origin/pilot` (2bbbc8fe). Every slice PR is a **draft** against
`feat/verdict-pass` and is never marked ready, because the pilot merges it.

- Branch name: `slice/verdict-pass-s<n>`.
- PR body: write it with `gh pr create --body-file <file>`.

## PR titles

- A slice: `feat(verdict-pass): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(verdict-pass): <what>`
- The feature PR: `feat(verdict-pass): The pilot gives a verdict on every assumed decision before Gate 1`

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

The artefact is `docs/design/verdict-pass/architecture.md`, and the slice files are `slices/S<n>.md`. Its terms (§4)
are fixed: **assumed decision (A‹n›)**, **verdict**, **verdict pass**, **overturn**, **mechanism**, **re-derived
behaviour**. The locked decisions are in §5 (L1–L10), and no slice moves one. S1 states the seam (`scripts/verdicts.mjs`:
`assumedIds`, `unverdicted`; `deck/lineage.mjs`: `assertVerdicts`); S3 reads it by name. ADR numbers 0141 and 0142 are
this run's (S2); 0137–0140 belong to gate-no-stall.

## Tests

Nothing reaches GitHub, the live deck on 4321, or a real remote from a test. A deck test posts against an `http`
server on a free port or an injected `deck`; a test that needs a repository makes a real temp git repository (copy the
pattern in `deck/test/gate1-lineage.test.mjs`). `gh` is always injected as `(args) => string`. Every test that starts a
process or server stops it in teardown.

## Gate command

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
```

There is no typecheck, lint or build step. To run one file, use `node --test <file>`. On Windows, use the glob form
for a directory. Pins on one rule are spread across `deck/test/`, `scripts/test/` and `hooks/test/`, so grep for the
sentence before the first full run. No test is known to flake. A slice that edits `agents/pilot.md` (S3) re-measures
the pilot pin in `scripts/test/measure-prompt.test.mjs` to the real number on the rebased integration tip and says so
in its PR; if gate-no-stall has landed on `pilot`, the pin starts from 10494.75 and `deck/server-tools.mjs` keeps both
gate lines (gate1 checks, then gate2).

## Live verification

S1 posts one real `gate1` against a scratch deck (`pilot deck --scratch`, stopped in teardown) on a temp repository:
refused naming the unverdicted A‹n›, then accepted after the commit that adds the line; paste both answers in the PR.
S5 runs a scratch audit over this deck's run records and pastes the `rederived` row. Never use the live deck on 4321.

## Diff limit

300 changed lines per slice. Past that, stop and ask `main`.
