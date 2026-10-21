# Brief: deck-writes-github

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Never work in that checkout or another session's worktree.

## Base and PR target

Base `feat/deck-writes-github`, cut from `origin/pilot` 4c6448b8. Slice PRs target `feat/deck-writes-github`; the feature PR targets `pilot`.

## Remote

Remote: origin

## Gate

`npm test` (`node scripts/gate.mjs`), 4–6 min, run in the background, once on the final state.
Red/green loop: `npm run test:changed -- --since=<base sha>`.
GitHub Actions is billing-blocked on this account: a red or unstarted check is no evidence; the local gate is the referee.

## Known flaky tests

- `deck/test/daemon-lifecycle.test.mjs:110` "a 500 writes the same one line"; a rerun passes.

## Overlaps

- `one-integration-line` (PR #884): rebase on it; it owns `--default`'s removal, `landing.mjs`, `server-tools.mjs` (S4), `integrate.mjs` `main` (S5), the crew prose (S9).
- `crew-tests-behaviour` (PR #906): rewrites prose pins across ~70 files; S6 here goes after it.
- The deck that runs `pilot pr` is the installed plugin's; QA updates the plugin before checking it live.

## Commit trailer

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Cmu6QXexHes1EiTfHDYBgB
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01Cmu6QXexHes1EiTfHDYBgB
```

## PR titles

- Slice: `feat(deck-writes-github): S<n> <title>`, the title lower-case first.
- Fix round: `fix(deck-writes-github): <what>`.
- Feature: `feat(deck-writes-github): the deck writes to GitHub, the crew never does`.
