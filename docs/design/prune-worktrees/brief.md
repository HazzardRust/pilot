# prune-worktrees brief

## Repository

C:/Users/jrylk/Projects/pilot (`HazzardRust/pilot`). The shared checkout is hundreds of commits behind; never work in it.

## Base

`feat/prune-worktrees`, cut from `main` at the design tip. PR target: `pilot`.

## Remote

Remote: origin

## Gate

`npm run test:quiet` (the full suite with the quiet reporter), plus each slice's own verification line.

## Known flaky

- `npm test`'s default reporter has died with no summary: use `npm run test:quiet`.
- The suite writes the live `~/.claude/pilot/deck.json`.
- Every child process must pass `windowsHide: true` (`hidden-spawns.test.mjs`, full suite only).
- `hooks/test/inbox.test.js` can go red on "deck is not answering" on a loaded machine (66/66 alone).
- Full-suite gates stall under load on this shared machine.

## Commit trailer

```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSFrR7Ee9f1oe7sWUsEs
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSFrR7Ee9f1oe7sWUsEs
```

## Live root

C:\Users\jrylk\.claude\pilot\live untrusted

## PR titles

- Slice: `feat(prune-worktrees): S<n> <title>`, the title lower-case first.
- Fix round: `fix(prune-worktrees): <what>`
- Feature: `feat(prune-worktrees): every worktree is pruned when its job ends`
