# Brief: pilot-state-line

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

The repository is `C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Its default branch is `main` and its
pilot branch is `pilot`. Never work in that checkout, or in another session's worktree. Create your own beside it,
named `pilot-pilot-state-line-s<n>`. In a deep directory, `git -c core.longpaths=true worktree add`. Run `npm ci` in
the new worktree before the first test run.

## Base and PR target

The base is `feat/pilot-state-line`, cut at Gate 1 from the design branch and carrying `origin/pilot` at 592b7691
(after yellow-lane landed: the lanes, the red → yellow → green swap and `deck/items.mjs` changed there; read the
integration tip, not an older checkout). Every slice PR is a **draft** against `feat/pilot-state-line` and is never
marked ready, because the pilot merges it.

- Branch name: `slice/pilot-state-line-s<n>`.
- PR body: write it with `gh pr create --body-file <file>`.

## PR titles

- A slice: `feat(pilot-state-line): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(pilot-state-line): <what>`
- The feature PR: `feat(pilot-state-line): The threads page shows the pilot's state, inferred by the deck`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MhHUvzfch1SDF1mSRfjgR1
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01MhHUvzfch1SDF1mSRfjgR1
```

## Artefact

The artefact is `docs/design/pilot-state-line/architecture.md`, and the slice files are `slices/S<n>.md`. Its terms
(§4) are fixed; the locked decisions are in §5 (L1–L11), and no slice moves one. `pilotStateOf` in
`deck/pilot-state.mjs` (S1) is the seam every later slice reads by name from the integration branch. ADR 0149 is this
run's; 0148 belongs to report-record and 0150 to cheaper-crew, both on unlanded feature branches.

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
sentence before the first full run. No test is known to flake. The three tests that pin the empty queue's paragraph
text (L7) must stay green untouched.

## Live verification

Every slice runs the real daemon on a scratch deck (`pilot deck --scratch`, stopped in teardown) with a planted store,
opens the home queue in a browser, and pastes the rendered state line (and for S3/S4 the SSE `changed` event seen) in
the PR. Never use the live deck on 4321 and never post to it from a test.

## Diff limit

300 changed lines per slice. Past that, stop and ask `main`.
