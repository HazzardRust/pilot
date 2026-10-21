# Brief: defender-dev-drive

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

The repository is `C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Its default branch is `main` and its
pilot branch is `pilot`. Never work in that checkout, or in another session's worktree. Create your own beside it,
named `pilot-defender-dev-drive-s<n>`. A fresh worktree needs `npm ci` before `npm test`.

## Base and PR target

The base is `feat/defender-dev-drive`, cut at Gate 1 from `origin/pilot` (fef95d6c at design time). Every slice PR
is a **draft** against `feat/defender-dev-drive` and is never marked ready, because the pilot merges it.

- Branch name: `slice/defender-dev-drive-s<n>`.

## Remote

Remote: origin

## Gate command

`npm test` (runs `node scripts/gate.mjs`), once, on the final state.

## Known flaky tests

- `deck/test/daemon-lifecycle.test.mjs:110` (a 500 log under suite load).

## Environment notes

- Git Bash rewrites `rev:path` arguments; prefix such commands with `MSYS_NO_PATHCONV=1`.
- Tests isolate the store with `PILOT_DECK_DIR`; never touch the real `~/.claude/pilot`.

## PR titles

- A slice: `feat(defender-dev-drive): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(defender-dev-drive): <what>`
- The feature PR: `feat(defender-dev-drive): A Windows host is told about Defender before it pays for it`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N5gq1NsTqzrTzohHn4TGwx
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01N5gq1NsTqzrTzohHn4TGwx
```

## Artefact

The artefact is `docs/design/defender-dev-drive/architecture.md`, and the slice files are `slices/S<n>.md`. Its terms
(§4) are fixed, and no slice moves a locked decision (§5, L1–L7). S1's `defenderRow` and `main({ args })`, and S2's
`defenderDue` and `markAdvised`, are read by name from the integration branch by later slices. This feature adds
no ADR (L6).
