# Brief: back-arrow

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree: create your own, named `pilot-back-arrow-s<n>`, beside it.
Run `npm ci` in the new worktree before the first test run.

## Base and PR target

Base: `feat/back-arrow`, cut from `design/back-arrow` at Gate 1. Every slice PR is a **draft** against
`feat/back-arrow`, never marked ready; the pilot merges it. Branch: `slice/back-arrow-s<n>`. Write PR bodies with
`gh pr create --body-file <file>`.

## PR titles

- Slice: `feat(back-arrow): S<n> <title as the artefact words it>`, the first word after `S<n>` lower-case.
- Fix round: `fix(back-arrow): <what>`
- Feature PR: `feat(back-arrow): a thread's back arrow returns to the deck that owns it`

## Commit trailer

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014NzGDsFAKbgZCKm3yKrMDh
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_014NzGDsFAKbgZCKm3yKrMDh
```

## Artefact

`docs/design/back-arrow/architecture.md`; slice file `docs/design/back-arrow/slices/S1.md`. Locked decisions §5
(L1 to L7) move in no slice. ADR 0118 records L1 to L3.

## Gate command

```
npm ci
npm test
node scripts/adr-index.mjs --check
node scripts/check-references.mjs
```

No typecheck, lint or build step. One file: `node --test <file>`; on Windows use the glob form,
`node --test deck/test/*.test.mjs`, not a directory. `npm run test:quiet` is the dot reporter.

## Known flaky tests

- `deck/test/usage.test.mjs` "in 2 hrs"
- `deck/test/run.test.mjs` "a session that ends while the wrapper waits for the marker stops the wait" (timing; passes alone)

## Constraints

- `deck/ui/js/*` is the browser allowlist: no new script there; the change lives in `escape.mjs`.
- Live verification: a scratch deck started with `pilot deck --scratch` on a free port, with runs from two repos
  registered so `/` is the overview, pressed in a real browser; never the deck on 4321, never `~/.claude/pilot`.
- Small-diff limit: 150 changed production lines; past it, stop and ask `main`.

## Report

A table: slice, branch, PR, head SHA, tests added (failed before, pass after), gate output line, live evidence.
