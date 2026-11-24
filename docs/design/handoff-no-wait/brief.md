# handoff-no-wait brief

## Repository

C:/Users/jrylk/Projects/pilot (`HazzardRust/pilot`). The shared checkout is far behind; never work in it.

## Base

`feat/handoff-no-wait`, cut from `main` at the design tip. PR target: `pilot`.

## Remote

Remote: origin

## Gate

`npm run test:quiet` (the full suite through `scripts/gate.mjs` with the quiet reporter), plus each slice's own verification line.

## Known flaky

- Full `npm test` takes over 3 minutes: 13 on a quiet machine, over 30 under load. Its default reporter has died with no summary, so use `test:quiet`.
- The suite writes the live `~/.claude/pilot/deck.json`.
- Every child process must pass `windowsHide: true` (`hidden-spawns.test.mjs`, full suite only).
- `pilot checks --wait` returns pending on windows-latest and needs re-arming.
- `deck/items.mjs` and `deck/server-wait.mjs` sit at the 800-line facade bar.

## Commit trailer

```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSForDWcHA67cB28cNrm
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSForDWcHA67cB28cNrm
```

## Live root

C:\Users\jrylk\.claude\pilot\live untrusted

## PR titles

- Slice: `feat(handoff-no-wait): S<n> <title>`, the title lower-case first.
- Fix round: `fix(handoff-no-wait): <what>`
- Feature: `feat(handoff-no-wait): a pilot hand-off never waits on the co-pilot`
