# lineage-slow-git: implementer brief

## Repository

`C:/Users/jrylk/Projects/pilot` (never work in that checkout; each slice in its own worktree).

## Base

`feat/lineage-slow-git`, cut from `feat/pr-overview` at the design tip. PR target of the feature: `feat/pr-overview`.

## Remote

Remote: origin

## Gate command

`npm test` (~9 minutes on Windows; it prints a nested `fail 0` early, read the final summary). QA: the repo's own `npm test` on Windows plus CI; no server, no migrations.

## Known flaky tests

- `deck/test/client-rejoin.test.mjs:176` (ubuntu, green on rerun)
- daemon-replace "a newer caller stops the daemon" (30 s timeout under parallel load)
- `classifier-log.test.mjs:262` (50 ms timing under load)

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

- Slice: `feat(lineage-slow-git): S<n> <title>`, the title lower-case first, e.g. `feat(lineage-slow-git): S1 gate1 lineage tests arm their own deadline`
- Fix round: `fix(lineage-slow-git): <what>`
- Feature: `feat(lineage-slow-git): gate1 lineage tests survive a slow git`
