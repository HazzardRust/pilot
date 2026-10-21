# Notifications seen: the brief every implementer shares

Ticket `itm_99df897efcaa` · feature `notifications-seen` · artefact `docs/design/notifications-seen/architecture.md`

## Repository

C:/Users/Hazzard/Projects/pilot (GitHub HazzardRust/pilot)

## Base

`feat/notifications-seen`, cut from `pilot` at `2b7fdc2` (`base pilot 2b7fdc2`). Slice PRs target `feat/notifications-seen`; the feature PR targets `main`.

## Remote

Remote: origin

## Gate command

`npm test` (runs `node scripts/gate.mjs`), plus each slice's own verification command.

## Known flaky tests

- `deck/test/daemon-lifecycle.test.mjs` "a 500 writes the same one line, then its stack, and the deck serves on"
- `deck/test/daemon-lifecycle.test.mjs:110`

## Small-diff limit

300 changed lines per slice, tests included. Past that, stop and ask `main`.

## Commit trailer

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N5gq1NsTqzrTzohHn4TGwx
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01N5gq1NsTqzrTzohHn4TGwx
```

## PR titles

- Slice: `feat(notifications-seen): S<n> <title>`, the title lower-case first, e.g. `feat(notifications-seen): S1 one press on the Notifications panel marks every thread seen and clears every notice`
- Fix round: `fix(notifications-seen): <what>`
- Feature: `feat(notifications-seen): The Notifications bookmark gets a "mark all seen"`
