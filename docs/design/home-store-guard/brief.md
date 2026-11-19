# home-store-guard: implementer brief

## Repository

`C:/Users/Hazzard/Projects/pilot` (never work in that checkout; each slice in its own worktree).

## Base

`feat/home-store-guard`, cut from `pilot` at the design tip. PR target of the feature: `pilot`.

## Remote

Remote: origin

## Gate command

`npm test` (6-8 minutes; 10 skipped is normal; sub-suites print their own pass/fail lines before the overall summary). `deck/test/facades.test.mjs` caps deck source files at 800 lines; `deck/store-core.mjs` is at 799.

## Known flaky tests

None known.

## Concurrent run

yellow-never-idle on `feat/yellow-never-idle` (deck/lanes.mjs, store-items.mjs, store-stage.mjs, server-tools.mjs, agents.mjs): no file overlap with this run.

## Commit trailer

```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSFppeY5pzVQLciH5swh
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSFppeY5pzVQLciH5swh
```

## PR titles

- Slice: `feat(home-store-guard): S<n> <title>`, the title lower-case first, e.g. `feat(home-store-guard): S1 the gate is red when the home store changed with no live deck`
- Fix round: `fix(home-store-guard): <what>`
- Feature: `feat(home-store-guard): the gate catches a write to the home deck store`
