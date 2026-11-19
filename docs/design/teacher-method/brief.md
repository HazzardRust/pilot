# teacher-method: the implementers' shared brief

## Repository

C:/Users/Hazzard/Projects/pilot

## Base and PR target

Base `feat/teacher-method`, cut from `origin/pilot` (3d1b86e9 at design). Slices integrate onto
`feat/teacher-method`; the feature PR targets `pilot`.

## Remote

Remote: origin

## Gate command

`npm test` (about 376 s full). A fresh worktree needs `npm ci` first, or the gate fails quietly on
missing node_modules. A new tree-reading test must be named in TREE_TESTS
(`scripts/test/select-tests.test.mjs:133`). A capped prompt (measure-prompt pin) needs the cut that
pays for any added text named in the slice. Check slice files with the repo's
`node scripts/check-slices.mjs`, not the plugin cache's copy.

## Known flaky tests

None recorded.

## Small-diff limit

400 changed lines per slice, tests included, moved lines counted once. Stop and ask `main` before passing it.

## Shell

Git Bash rewrites `origin/pilot:path`; prefix such commands with `MSYS_NO_PATHCONV=1`. Never force-push;
merge instead of rebasing a pushed branch.

## Commit trailer

```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSFpzgnD51HokpbABUPw
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSFpzgnD51HokpbABUPw
```

## PR titles

- Slice: `feat(teacher-method): S<n> <title>`, the title lower-case first, e.g.
  `feat(teacher-method): S1 a too-large lesson leaves as a shape-checked md report`
- Fix round: `fix(teacher-method): <what>`
- Feature: `feat(teacher-method): The teacher teaches by teach-me's method; a big lesson leaves as an md report`
