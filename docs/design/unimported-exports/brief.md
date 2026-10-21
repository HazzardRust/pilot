# Brief: unimported-exports

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

The repository is `C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Its default branch is `main` and its
pilot branch is `pilot`. Never work in that checkout, or in another session's worktree. Create your own beside it,
named `pilot-unimported-exports-s<n>`. In a deep directory, `git -c core.longpaths=true worktree add`. Run `npm ci` in the
new worktree before the first test run.

## Base and PR target

The base is `feat/unimported-exports`, cut at Gate 1 from the design branch (read the integration tip, not an older
checkout: `pilot integrate` takes `origin/pilot` first, so the tip moves as other runs land). Every slice PR is a
**draft** against `feat/unimported-exports` and is never marked ready, because the pilot merges it.

- Branch name: `slice/unimported-exports-s<n>`.
- PR body: write it with `gh pr create --body-file <file>`.

## Remote

Remote: origin

## PR titles

- A slice: `feat(unimported-exports): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(unimported-exports): <what>`
- The feature PR: `feat(unimported-exports): Unimported exports become module-private`

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

The artefact is `docs/design/unimported-exports/architecture.md`, and the slice file is `slices/S1.md`. Its terms (§4)
are fixed; the locked decisions are in §5 (L1–L3) and no slice moves one: all 15 names are unexported, none deleted
(L1), and the diff touches only the 15 `export` lines (L2). No test is added (A2).

## Tests

Nothing reaches GitHub, the live deck on 4321, or a real remote from a test. The red step is the export census in §4
(15 lines at the base, none after); the existing suite proves the callers still work, at the base's own `ℹ pass` count.

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

There is no user surface. The PR pastes the census before and after, `git diff --stat <base> -- deck scripts`
(15 insertions, 15 deletions) and the gate's pass line beside the base's.

## Diff limit

300 changed lines per slice. Past that, stop and ask `main`.
