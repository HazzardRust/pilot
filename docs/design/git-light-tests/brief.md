# Brief: git-light-tests

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

The repository is `C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Its default branch is `main` and its
pilot branch is `pilot`. Never work in that checkout, or in another session's worktree. Create your own beside it,
named `pilot-git-light-tests-s<n>`. In a deep directory, `git -c core.longpaths=true worktree add`. Run `npm ci` in the
new worktree before the first test run.

## Base and PR target

The base is `feat/git-light-tests`, cut at Gate 1 from the design branch (read the integration tip, not an older
checkout: `pilot integrate` takes `origin/pilot` first, so the tip moves as other runs land). Every slice PR is a
**draft** against `feat/git-light-tests` and is never marked ready, because the pilot merges it.

- Branch name: `slice/git-light-tests-s<n>`.
- PR body: write it with `gh pr create --body-file <file>`.

## Remote

Remote: origin

## PR titles

- A slice: `feat(git-light-tests): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(git-light-tests): <what>`
- The feature PR: `feat(git-light-tests): Git-light land, sync and merge tests`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018PZ3dU1BcLCgmFPwfDNfmV
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_018PZ3dU1BcLCgmFPwfDNfmV
```

## Artefact

The artefact is `docs/design/git-light-tests/architecture.md`, and the slice files are `slices/S<n>.md`. Its terms (§4)
are fixed; the locked decisions are in §5 (L1–L2) and no slice moves one. The seam is `scripts/test/lib/git-fixture.mjs`
with `gitFixture(t, key, build)` (S1): every later slice reads it by name from the integration branch and adds nothing
to its surface. Only `*/test/**` files change, plus the `SPAWN_CEILING` lines of `scripts/gate.mjs` in S6 (spec 4, 5);
no assert is removed. A file whose builder is a lone `git init` keeps it and only drops its `git config` calls (A6):
name each such file in the slice report.

## Tests

Nothing reaches GitHub, the live deck on 4321, or a real remote from a test. A test that needs a repository builds a
real temp git repository through the seam. `gh` is always injected as `(args) => string`. Every test that starts a
process or server stops it in teardown. Each slice records the per-file wall time and git count before and after its
conversion in its PR (the attributed census is not checked in: measure your own "before").

## Gate command

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
```

There is no typecheck, lint or build step. To run one file, use `node --test <file>`. On Windows, use the glob form
for a directory. **Known flake**: `scripts/test/gate-census.test.mjs` "the leak fixture is red and names it" can go
red while another gate runs on this machine (pid reuse in `besideGate`); it is green alone, and a red there is rerun
once, never fixed in a slice.

## Live verification

There is no user surface. A slice's verification is the gate.mjs `spawns` line and the per-file wall time of the
files it converted, pasted in the PR; S6 pastes the two timed full runs.

## Diff limit

300 changed lines per slice. Past that, stop and ask `main`.
