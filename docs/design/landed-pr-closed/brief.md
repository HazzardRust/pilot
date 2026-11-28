# landed-pr-closed brief

## Repository

C:/Users/jrylk/Projects/pilot (`HazzardRust/pilot`). The shared checkout is on `main` and far behind; never work in it.

## Base

`feat/landed-pr-closed`, cut from `origin/hazzardrust-pilot` at the design tip (A4). PR target: `hazzardrust-pilot`.

## Remote

Remote: origin

## Gate

`npm run test:quiet` (the full suite, quiet reporter), plus each slice's own verification line.

## Known flaky

None named. The test-ledger flake is S5's to fix (merged ticket itm_f9cbce1dd9ea): until S5 lands, a red on `test-ledger.test.mjs:132` is that flake, so re-run once.

## Host writes

Only against a fake `gh` or a scratch bare remote. Nothing in this run edits, closes or retargets a PR on HazzardRust/pilot.

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

- Slice: `feat(landed-pr-closed): S<n> <title>`, the title lower-case first.
- Fix round: `fix(landed-pr-closed): <what>`.
- Feature PR: `feat(landed-pr-closed): a landing leaves no draft PR behind`.
