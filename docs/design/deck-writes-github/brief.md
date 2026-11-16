# Brief: deck-writes-github

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Never work in that checkout or another session's worktree.
`C:/Users/Hazzard/Projects/pilot-design-deck-writes-github` is a stale `pilot-archive` worktree, not this run's: leave it.

## Base and PR target

Base `feat/deck-writes-github`, cut from `origin/pilot` b38de846 (re-cut 2026-11-16). Slice PRs target
`feat/deck-writes-github`; the feature PR (#4, draft) targets `pilot`.

## Remote

Remote: origin

## Gate

`npm test` (`node scripts/gate.mjs`), run in the background, once on the final state.
Red/green loop: `npm run test:changed -- --since=<base sha>`.
GitHub Actions is refused for billing on this account: a red or unstarted check is no evidence. The referee is
`npm test` once on Windows in your worktree, and `node scripts/gate.mjs` five times in WSL on a fresh clone at the commit.
A live `gh` probe runs under `eval "$(pilot gh-stub)"` (ADR 0173); only QA's acceptance run touches real GitHub (L9).

## Known flaky tests

- `deck/test/daemon-lifecycle.test.mjs:110` "a 500 writes the same one line"; a rerun passes.
- Friction, not a flake: `deck/test/run.test.mjs` carries literal 0x08 bytes where `\b` was meant; grep it with care.

## Overlaps

- one-integration-line and crew-tests-behaviour are on `pilot`; no rebase waits on them.
- The deck that runs `pilot pr` is the installed plugin's; QA updates the plugin before checking it live.

## Commit trailer

```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSFodNbTKqoJ71EpWMS5
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSFodNbTKqoJ71EpWMS5
```

## PR titles

- Slice: `feat(deck-writes-github): S<n> <title>`, the title lower-case first.
- Fix round: `fix(deck-writes-github): <what>`.
- Feature: `feat(deck-writes-github): the deck writes to GitHub, the crew never does`.
