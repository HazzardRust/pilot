# Brief: yellow-lane

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

The repository is `C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Its default branch is `main` and its
pilot branch is `pilot`. Never work in that checkout, or in another session's worktree. Create your own beside it,
named `pilot-yellow-lane-s<n>`. In a deep directory, `git -c core.longpaths=true worktree add`. Run `npm ci` in the
new worktree before the first test run.

## Base and PR target

The base is `feat/yellow-lane`, cut at Gate 1 from `origin/pilot` (e1d6114e, after gate-no-stall landed). Every slice PR is a **draft** against
`feat/yellow-lane` and is never marked ready, because the pilot merges it.

- Branch name: `slice/yellow-lane-s<n>`.
- PR body: write it with `gh pr create --body-file <file>`.

## PR titles

- A slice: `feat(yellow-lane): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(yellow-lane): <what>`
- The feature PR: `feat(yellow-lane): The yellow lane never idles, a blocked step is a blocking item, and the install allows scratch decks`

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

The artefact is `docs/design/yellow-lane/architecture.md`, and the slice files are `slices/S<n>.md`. Its terms (§4) are
fixed; the locked decisions are in §5 (L1–L10), and no slice moves one. The seams S1–S4 state (`lanesFrom`'s yellow
refusal, `gate2Blockers`, the `proposal` flag, `deck/owed.mjs`) are read by name from the integration branch by later
slices. ADR numbers 0143–0147 are this run's; 0141–0142 belong to verdict-pass (yellow, feat/verdict-pass) and
0137–0140 to gate-no-stall (landed on pilot at e1d6114e). The swap (S15–S17) runs last and S15 also bumps the plugin
version 0.8.4 → 0.9.0 (spec 26).

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
sentence before the first full run. No test is known to flake. A slice that edits `agents/pilot.md` re-measures
the pilot pin in `scripts/test/measure-prompt.test.mjs` to the real number on the rebased integration tip and says so
in its PR; gate-no-stall is on `pilot`, so the pin starts from pilot's tip, and `deck/server-tools.mjs` keeps every gate check already there.

## Live verification

A slice with a deck refusal or a lane line runs the real daemon on a scratch deck (`pilot deck --scratch`, stopped in
teardown) with a planted store and pastes the refusal or line in the PR; S15 seeds the scratch deck with a copy of a
v1 store and screenshots the Tickets tab; S16 screenshots the rail. Hook slices run `node hooks/<hook>.js < payload.json`
against the scratch deck. Never use the live deck on 4321 and never post to it from a test.

## Diff limit

300 changed lines per slice. Past that, stop and ask `main`.
