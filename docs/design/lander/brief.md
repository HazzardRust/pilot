# Lander: the brief every implementer shares

Ticket `itm_439d37064018` · feature `lander` · artefact `docs/design/lander/architecture.md`

## Repository

C:/Users/Hazzard/Projects/pilot (GitHub HazzardRust/pilot)

## Base

`feat/lander`, cut from `pilot` at `bc4eb8ea`. Slice PRs target `feat/lander`; the feature PR targets `main`.

Runs after landing-keeps-worktrees (#785) and held-handoff (`itm_8a85a7dbe884`); S8 needs held-handoff's `holdFor` on `pilot`, S10 needs landing-keeps-worktrees' prune step.

## Remote

Remote: origin

## Gate command

`npm test` (runs `node scripts/gate.mjs`), plus each slice's own verification command, and `npm run adr-index` leaving `git status` clean for any slice touching `docs/adr/`.

## Known flaky tests

- `deck/test/daemon-lifecycle.test.mjs` "a 500 writes the same one line, then its stack, and the deck serves on"

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

- Slice: `feat(lander): S<n> <title>`, the title lower-case first, e.g. `feat(lander): S1 a lander answers a conflicted press and the deck lands it`
- Fix round: `fix(lander): <what>`
- Feature: `feat(lander): A landing agent owns every merge and the clean tail; one Gate 2 press lands`
