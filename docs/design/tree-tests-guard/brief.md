# Brief: tree-tests-guard

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot`. Default branch `main`, pilot branch `pilot`. Never work in that shared checkout
(it is on `main`) or in another session's worktree. Create your own beside it, `pilot-tree-tests-guard-s1`, and run
`npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/tree-tests-guard`, cut at Gate 1 from `origin/pilot` (d27abc48 at design time). Slice branch:
`slice/tree-tests-guard-s1`, pushed to `origin`; the co-pilot integrates it into `feat/tree-tests-guard` as one commit.
The feature PR targets `pilot`; the deck opens it.

## PR titles

- A slice: `feat(tree-tests-guard): S1 a prose-only diff runs the vocabulary guard and the census in the narrow loop`
- A fix round: `fix(tree-tests-guard): <what>`
- The feature PR: `feat(tree-tests-guard): The narrow loop runs the vocabulary guard and the TREE_TESTS census`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSFpzgnD51HokpbABUPw
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSFpzgnD51HokpbABUPw
```

## Artefact

`docs/design/tree-tests-guard/architecture.md`, slice in `slices/S1.md`. Terms (§4) are fixed; locked decisions §5
are not moved by the slice. The run's ADR is `docs/adr/0189-tree-tests-guard.md`; the landing numbers it.

## Tests

A test needing a repository uses `gitFixture` with a `repoOf` builder (pattern `scripts/test/select-tests.test.mjs:82`).

## Gate command

```
npm ci
npm test
```

`npm test` runs `node scripts/gate.mjs`. One file: `node --test <file>`. Narrow loop: `npm run test:changed --
--since=<ref>`; this slice changes `scripts/select-tests.mjs`, a `FULL_TRIGGERS` entry, so its narrow loop runs the
full suite (460-762 s).

## Known flaky tests

None recorded.

## Live verification

A CLI run in the slice worktree, architecture.md §9 steps 1-4. No database.

## Git Bash

Git Bash rewrites `origin/pilot:path` into a Windows path: prefix such commands with `MSYS_NO_PATHCONV=1`.

## Diff limit

400 changed lines. Past that, stop and ask `main`.
