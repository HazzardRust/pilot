# remote-run-branches brief

## Repository

C:/Users/jrylk/Projects/pilot (`HazzardRust/pilot`). The shared checkout is behind; never work in it.

## Base

`feat/remote-run-branches`, cut from `main` at the design tip. PR target: `hazzardrust-pilot`.

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

## Deletes

Real deletes only against a scratch bare remote. On this repo's origin only `git ls-remote` and
`pilot branches prune --slug prune-worktrees --dry-run` (L11).

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

- Slice: `feat(remote-run-branches): S<n> <title>`, the title lower-case first.
- Fix round: `fix(remote-run-branches): <what>`
- Feature: `feat(remote-run-branches): a landing deletes every branch of its run on origin`
