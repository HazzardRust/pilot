# Brief: audit-f1

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that checkout (it is the stale one this feature is about) or another session's worktree. Create your own
beside it, `pilot-audit-f1-s<n>`. Run `npm ci` in the new worktree before the first test run; `node bin/pilot.mjs`
needs it too.

## Remote

Remote: origin

## Base and PR target

The base is `feat/audit-f1`, cut at Gate 1 from `origin/pilot` (9dab4167 at design time). Every slice PR is a
**draft** against `feat/audit-f1`, never marked ready; the pilot merges it. Branch: `slice/audit-f1-s<n>`. Write
the body with `gh pr create --body-file <file>`.

## PR titles

- A slice: `feat(audit-f1): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(audit-f1): <what>`
- The feature PR: `feat(audit-f1): The audit and a session start read the run's pilot, not a stale HEAD`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0131nxNBjfjGFLyrfajro9Wk
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_0131nxNBjfjGFLyrfajro9Wk
```

## Artefact

`docs/design/audit-f1/architecture.md`, slices in `slices/S<n>.md`. Terms (§4) are fixed; locked decisions §5
(L1-L6) are not moved by a slice. S2 reads S1's `pilotTip` from the integration branch by name. No ADR this run.

## Tests

Nothing reaches GitHub, the live deck on 4321, or a real remote from a test. A test needing a repository makes a
real temp git repository with a bare remote (pattern `deck/test/gate1-lineage.test.mjs`), and removes it in teardown.
An unreachable remote is a remote URL pointing at a missing directory.

## Gate command

```
npm ci
npm test
```

On Windows: `npm test` once in your own worktree. Before a landing: `node scripts/gate.mjs` five times in a row on a
fresh Linux clone (WSL, node 26 at `~/node26`) at the exact commit; all five green. GitHub Actions does not run on
this account: a red or unstarted check is not evidence. One file: `node --test <file>`.

## Known flaky tests

- The Windows worktrees test has failed `MODULE_NOT_FOUND` mid-run with no summary (twice, 2026-10-19).
- The nested fixture gate once reported "powershell.exe not found" while three gates ran at once.

## Live verification

S1: `node scripts/pilot-tip.mjs --fetch` in the shared checkout, its line against `git rev-parse origin/pilot`.
S2: a SessionStart payload piped into `node scripts/pilot-tip.mjs --session-start` in the shared checkout, its JSON
pasted in the PR. Neither moves the shared checkout.

## Diff limit

40 changed lines per slice outside tests. Past that, stop and ask `main`.
