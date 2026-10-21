# Brief: three-lanes

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

The repository is `C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Its default branch is `main` and its
pilot branch is `pilot`. Never work in that checkout, or in another session's worktree. Create your own beside it,
named `pilot-three-lanes-s<n>`. In a deep directory, `git -c core.longpaths=true worktree add`. Run `npm ci` in the
new worktree before the first test run.

## Base and PR target

The base is `feat/three-lanes`, cut at Gate 1 from the design branch and carrying `origin/pilot` at ac828fc1 (after
report-record and pilot-state-line landed and `main` was merged in; read the integration tip, not an older checkout).
Every slice PR is a **draft** against `feat/three-lanes` and is never marked ready, because the pilot merges it.

- Branch name: `slice/three-lanes-s<n>`.
- PR body: write it with `gh pr create --body-file <file>`.

## PR titles

- A slice: `feat(three-lanes): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(three-lanes): <what>`
- The feature PR: `feat(three-lanes): Three lanes: a planning and a concluding ticket live at once, carried by the architect and QA`

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

The artefact is `docs/design/three-lanes/architecture.md`, and the slice files are `slices/S<n>.md`. Its terms (§4)
are fixed; the locked decisions are in §5 (L1–L14), and no slice moves one. Red is planning and green is concluding
(ADR 0147): the prose says the stage, never the colour. `laneOf` in `deck/lanes.mjs` (S1) is the seam every later
lane slice reads by name from the integration branch. ADR 0151 is this run's (S10). S6 starts only after #670
(pilot-state-line) is on `pilot`.

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
sentence before the first full run. **Known flake**: `scripts/test/gate-census.test.mjs` "the leak fixture is red and
names it" can go red while another gate runs on this machine (pid reuse in `besideGate`); it is green alone, and a
red there is rerun once, never fixed in a slice. The pilot pin (`scripts/test/measure-prompt.test.mjs`) and the QA pin
(`scripts/test/qa-preview.test.mjs`) move by exactly what a slice's wording costs, with a history line naming the slice.

## Live verification

Every slice with a surface runs the real daemon on a scratch deck (`pilot deck --scratch`, stopped in teardown) with a
planted store holding one ticket per stage, opens the page in a browser, and pastes what it saw in the PR. A prose slice
pastes the pin diff. Never use the live deck on 4321 and never post to it from a test.

## Diff limit

300 changed lines per slice. Past that, stop and ask `main`.
