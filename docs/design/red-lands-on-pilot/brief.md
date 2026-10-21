# Brief: red-lands-on-pilot

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree: create your own, named `pilot-red-lands-on-pilot-s<n>`,
beside it. Run `npm ci` in the new worktree before the first test run.

## Base and PR target

Base: `feat/red-lands-on-pilot`, cut from `design/red-lands-on-pilot` at Gate 1 (itm_47f438567579, 16f64a1f,
itself on `origin/pilot` 26547862). Every slice PR is a **draft** against `feat/red-lands-on-pilot`, never marked
ready; the pilot merges it. Branch: `slice/red-lands-on-pilot-s<n>`. Write PR bodies with
`gh pr create --body-file <file>`. Order: S1, S2, S7 stand alone; S4 → S5 → S6 → S3 is a chain, each cut from the
tip once its predecessor is integrated.

## PR titles

- Slice: `feat(red-lands-on-pilot): S<n> <title as the artefact words it>`, the first word after `S<n>` lower-case.
- Fix round: `fix(red-lands-on-pilot): <what>`
- Feature PR: `feat(red-lands-on-pilot): a red ticket lands on pilot before its Gate 2`

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

`docs/design/red-lands-on-pilot/architecture.md`; slice files `docs/design/red-lands-on-pilot/slices/S<n>.md`.
Locked decisions §5 (L1 to L12) move in no slice. New ADR, written by S1: `docs/adr/0114-…` in the format of its
neighbours (0113 is taken by audit-f1-f7 on its own branch), then `node scripts/adr-index.mjs` to regenerate
`docs/adr/README.md`.

## Gate command

```
npm ci
npm test
node scripts/adr-index.mjs --check
node scripts/check-references.mjs
```

No typecheck, lint or build step. One file: `node --test <file>`; on Windows use the glob form,
`node --test scripts/test/*.test.mjs`, not a directory.

## Known flaky tests

- `deck/test/usage.test.mjs` "in 2 hrs"
- `deck/test/run.test.mjs` "a session that ends while the wrapper waits for the marker stops the wait" (timing; passes alone)

## Constraints

- Prompt budget pins (`scripts/test/measure-prompt.test.mjs`, `qa-preview.test.mjs`) are the user's and never move.
  The pilot's share has **0.25 tokens** of headroom at 26547862 and QA's has 0: S1 pays for every byte it adds to
  `agents/pilot.md` as the artefact says, and `agents/pilot-qa.md` is not edited.
- A test never pushes to this repository's `origin`: land, sync and integrate tests run on a scratch bare origin
  under `os.tmpdir()`, as the existing `land.test.mjs` does. `pilot` is never force-pushed, in code or in a test.
- Live verification (S4–S7, and QA): a scratch bare origin with its own `pilot`, and for QA a scratch deck on a free
  port with a temporary store; never the deck on 4321, never `~/.claude/pilot`.
- Small-diff limit: 200 changed lines per slice; past it, stop and ask `main`.

## Report

A table: slice, branch, PR, head SHA, tests added (failed before, pass after), gate output line, live evidence.
