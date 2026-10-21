# Brief: process-gc

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

The repository is `C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Its default branch is `main` and its
pilot branch is `pilot`. Never work in that checkout, or in another session's worktree. Create your own beside it,
named `pilot-process-gc-s<n>`. In a deep directory, `git -c core.longpaths=true worktree add`. Run `npm ci` in the new
worktree before the first test run.

## Base and PR target

The base is `feat/process-gc`, cut at Gate 1 from `origin/pilot` (67bb0a1e). Every slice PR is a **draft** against
`feat/process-gc` and is never marked ready, because the pilot merges it.

- Branch name: `slice/process-gc-s<n>`.
- PR body: write it with `gh pr create --body-file <file>`.

## PR titles

- A slice: `feat(process-gc): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(process-gc): <what>`
- The feature PR: `feat(process-gc): Node process GC`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F7ZQ8xdfvuYyWLzTNwjNyh
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01F7ZQ8xdfvuYyWLzTNwjNyh
```

## Artefact

The artefact is `docs/design/process-gc/architecture.md`, and the slice files are `slices/S<n>.md`. Its terms (§4)
are fixed: **leash**, **orphan**, **gate slot**, **census**, **spawn count**. The locked decisions are in §5 (L1–L17),
and no slice moves one; a seam a later grilling added is at the foot of the slice file (S7 carries L16's retry).
S1 states the leash seam (`holdLeash`, `sessionPid`, the `--leash` argv) in `deck/leash.mjs`; S6 states `takeSlot`
in `scripts/gate-slots.mjs`. Every later slice reads them by name from the integration branch.

## Tests

Nothing reaches GitHub, the live deck on 4321, or a real remote from a test. A test that needs a deck starts a scratch
one (`pilot deck --scratch`) and stops it in teardown; a test that needs a repository makes a scratch clone with bare
remotes (copy `scratchRepos` from `scripts/test/base.test.mjs`). The process table is injected (L6): a test feeds a
fake table, and only the slice that owns an adapter runs the real PowerShell or `ps` once. Every test that starts a
process stops it in teardown — this feature's own spec 3 makes a leak red.

## Gate command

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
```

There is no typecheck, lint or build step. To run one file, use `node --test <file>`. On Windows, use the glob form
for a directory. Pins on one rule are spread across `deck/test/`, `scripts/test/` and `hooks/test/`, so grep for the
sentence before the first full run. No test is known to flake; the two-sessions daemon test was fixed in #509.
From S7 on, `npm test` is `node scripts/gate.mjs` (L7): a slice that edits the gate runs the old command once to
prove the new one.

## Live verification

Every CLI slice runs its command for real, `node bin/pilot.mjs <command>`, against a scratch deck or a planted process
and pastes the output in the PR. `pilot gc` is never run against the user's deck on 4321 or a live session's processes:
plant a sleeper and reap that. `pilot land` is never run for real from a slice; its gc lines are tested with an injected
runner.

## Diff limit

300 changed lines per slice. Past that, stop and ask `main`.
