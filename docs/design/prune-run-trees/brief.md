# prune-run-trees brief

## Repository

C:/Users/jrylk/Projects/pilot (`HazzardRust/pilot`). The shared checkout is behind; never work in it.

## Base

`feat/prune-run-trees`, cut from `main` at the design tip. PR target: `hazzardrust-pilot`.

## Remote

Remote: origin

## Gate

`npm run test:quiet` (the full suite with the quiet reporter), plus each slice's own verification line.

## Known flaky

- `npm test`'s default reporter has died with no summary: use `npm run test:quiet`.
- The suite writes the live `~/.claude/pilot/deck.json`.
- Every child process must pass `windowsHide: true` (`hidden-spawns.test.mjs`, full suite only).
- `hooks/test/inbox.test.js` can go red on "deck is not answering" on a loaded machine.
- Full-suite gates stall under load on this shared machine.

## Commit trailer

```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSFpqUdj1dNXfoGcHHUw
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSFpqUdj1dNXfoGcHHUw
```

## Live root

C:\Users\jrylk\.claude\pilot\live untrusted

## PR titles

- Slice: `feat(prune-run-trees): S<n> <title>`, the title lower-case first.
- Fix round: `fix(prune-run-trees): <what>`
- Feature: `feat(prune-run-trees): prune --run reaches every tree of a run`
