# Brief: research-first

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree: create your own, named `pilot-research-first-s<n>`, beside
it. Run `npm ci` in the new worktree before the first test run.

## Base and PR target

Base: `feat/research-first`, cut from `design/research-first` at Gate 1. Every slice PR is a **draft** against
`feat/research-first`, never marked ready; the pilot merges it. Branch: `slice/research-first-s<n>`. Write PR bodies
with `gh pr create --body-file <file>`. S2 comes after S1.

`agents/pilot.md` is also edited by handoff-closed-on-pickup S2 (#496) and red-lands-on-pilot S1 (#499): S1 rebases
onto `pilot` once they land and measures the pilot's pin then.

## PR titles

- Slice: `feat(research-first): S<n> <title as the artefact words it>`, the first word after `S<n>` lower-case.
- Fix round: `fix(research-first): <what>`
- Feature PR: `feat(research-first): a recommendation rests on research when the answer lives outside the repo`

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

`docs/design/research-first/architecture.md`; slice files `docs/design/research-first/slices/S<n>.md`. Locked
decisions §5 (L1 to L10) move in no slice. ADR 0119 records them.

## Gate command

```
npm ci
npm test
node scripts/adr-index.mjs --check
node scripts/check-references.mjs
```

No typecheck, lint or build step. One file: `node --test <file>`; on Windows use the glob form,
`node --test scripts/test/*.test.mjs`, not a directory. `npm run test:quiet` is the dot reporter.

## Known flaky tests

- `deck/test/usage.test.mjs` "in 2 hrs"
- `deck/test/run.test.mjs` "a session that ends while the wrapper waits for the marker stops the wait" (timing; passes alone)

## Constraints

- Prompt-budget pins (`scripts/test/measure-prompt.test.mjs`, `scripts/test/qa-preview.test.mjs`) move only by the
  measured cost of the clause the slice adds, with a history comment, and the PR body names the old and new numbers.
- The grilling skill is vendored: its `adapted:` provenance line and the row in `vendor/methodology.md` change with it.
- Live verification: a scratch deck daemon on `PILOT_DECK_PORT=4512` with a scratch repository and a session started
  with `claude --plugin-dir <worktree>`; never the deck on 4321, never `~/.claude/pilot`.
- Small-diff limit: 200 changed lines per slice (prose counts); past it, stop and ask `main`.

## Report

A table: slice, branch, PR, head SHA, tests added (failed before, pass after), gate output line, pin numbers before
and after, live evidence.
