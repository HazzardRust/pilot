# tested-once brief

## Repository

C:/Users/jrylk/Projects/pilot (`HazzardRust/pilot`). Never work in the shared checkout.

## Base

`feat/tested-once`, cut from the design tip (`design/tested-once`, itself from `origin/main` at `ffc8384`). PR target: `pilot`.

## Remote

Remote: origin

## Gate

`npm run test:quiet` (the full suite with the quiet reporter; it skips 28 tests), plus each slice's own verification line.

## Known flaky

- `npm test`'s default reporter has died with no summary: use `npm run test:quiet`.
- The suite writes the live `~/.claude/pilot/deck.json`.
- Every child process must pass `windowsHide: true` (`hidden-spawns.test.mjs`, full suite only).
- `hooks/test/inbox.test.js` can go red on "deck is not answering" on a loaded machine (66/66 alone).
- Full-suite gates stall under load on this shared machine.

## Live check

Scratch repo and scratch home on this machine (`HOME`/`USERPROFILE` pointed at a temp dir), never the live deck
on 4321, the live `~/.claude/pilot/tests/ledger.jsonl` or a run in flight (L2). A host is stubbed with
`eval "$(pilot gh-stub)"`.

## Files at risk

PR #152 (prune-worktrees) plans edits to `scripts/integrate.mjs` (`pruneSlice`), `deck/closing-report.mjs`
(`stepsOf`), `agents/pilot-implementer.md`, `agents/pilot-qa.md`, `agents/pilot-lander.md`: edit only the lines
your slice file names.

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

- Slice: `feat(tested-once): S<n> <title>`, the title lower-case first.
- Fix round: `fix(tested-once): <what>`
- Feature: `feat(tested-once): a slice is tested once, not at every step`
