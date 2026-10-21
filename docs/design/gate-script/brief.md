# Brief: gate-script

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

The repository is `C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Its default branch is `main` and its
pilot branch is `pilot`. Never work in that checkout, or in another session's worktree. Create your own beside it,
named `pilot-gate-script-s<n>`. In a deep directory, `git -c core.longpaths=true worktree add`. Run `npm ci` in the
new worktree before the first test run.

## Base and PR target

The base is `feat/gate-script`, cut at Gate 1 from the design branch (read the integration tip, not an older
checkout: `pilot integrate` takes `origin/pilot` first, so the tip moves as other runs land). Every slice PR is a
**draft** against `feat/gate-script` and is never marked ready, because the pilot merges it.

- Branch name: `slice/gate-script-s<n>`.
- PR body: write it with `gh pr create --body-file <file>`.

## Remote

Remote: origin

## PR titles

- A slice: `feat(gate-script): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(gate-script): <what>`
- The feature PR: `feat(gate-script): Gate script: an npm ci hint and a short hang test`

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

The artefact is `docs/design/gate-script/architecture.md`, and the slice files are `slices/S<n>.md`. Its terms (§4)
are fixed; the locked decisions are in §5 (L1–L4) and no slice moves one. L4: `scripts/gate.mjs` lines 23-38 (the
`SPAWN_CEILING` block) are git-light-tests S6's and stay untouched. S1 and S2 share no file and run at once.

## Tests

Nothing reaches GitHub, the live deck on 4321, or a real remote from a test. S1's end-to-end test copies `scripts/` and
`deck/` without their `test/` directories plus `package.json` into a temp dir with no `node_modules` (L3) and runs the
real gate there. Every test that starts a process stops it in teardown.

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

The surface is the CLI on this machine: S1 pastes a timed `node scripts/gate.mjs` from a fresh worktree without
`npm ci` (the line, exit 1, under 2 s); S2 pastes `node --test scripts/test/test-timeout.test.mjs` with its
`exited 1 in <t> s` line.

## Diff limit

300 changed lines per slice. Past that, stop and ask `main`.
