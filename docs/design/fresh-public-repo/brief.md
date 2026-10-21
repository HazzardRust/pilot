# Brief: fresh-public-repo

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Artefact: `docs/design/fresh-public-repo/architecture.md`; slices in `docs/design/fresh-public-repo/slices/`.

## Base and PR target

Base `feat/fresh-public-repo`, cut from `pilot`. Slice PRs target `feat/fresh-public-repo`; the feature PR targets `main`.

## Remote

Remote: origin

## Gate command

`npm test && node scripts/check-references.mjs && node scripts/check-provenance.mjs agents/ skills/ rules/`

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

- Slice: `feat(fresh-public-repo): S<n> <title>`, the title lower-case first
- Fix round: `fix(fresh-public-repo): <what>`
- Feature: `feat(fresh-public-repo): fresh public repository`

## Never

No agent runs a command from the runbook's "On GitHub" subsection: no rename, create, push to a new repo, secret or ruleset change (L1).
