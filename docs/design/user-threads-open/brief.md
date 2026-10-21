# Brief: user-threads-open

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree: create your own, named `pilot-user-threads-open-s<n>`,
beside it. Run `npm ci` in the new worktree before the first test run.

## Base and PR target

Base: `feat/user-threads-open`, cut from `origin/pilot` (178c7e5 at design time). Every slice PR is a **draft**
against `feat/user-threads-open`, never marked ready; the pilot merges it. Branch: `slice/user-threads-open-s<n>`.
PR title: `feat(user-threads-open): S<n> <title as the artefact words it>`. Write PR bodies with
`gh pr create --body-file <file>`.

## Artefact

`docs/design/user-threads-open/architecture.md`; slice files `docs/design/user-threads-open/slices/S<n>.md`. Locked
decisions §5 (L1 to L9) move in no slice. New ADR: 0109 in S1, in the format of 0106 beside it, then
`node scripts/adr-index.mjs` to regenerate `docs/adr/README.md`. S1 and S2 run in parallel and share no file.

## Gate command

```
npm ci
npm test
node scripts/adr-index.mjs --check
```

No typecheck, lint or build step. One file: `node --test <file>`; on Windows use the glob form,
`node --test deck/test/*.test.mjs`, not a directory. Known flake: `deck/test/usage.test.mjs` "in 2 hrs".

## Constraints

- `scripts/test/measure-prompt.test.mjs`: the budget pins are the user's and never move; pay for added prompt
  text by removing redundant text.
- `agents/pilot.md` is also edited by the yellow run co-pilot-successor (`feat/co-pilot-successor`): S2 edits only
  lines 50-55 of it.
- Live verification: a scratch deck daemon on a port of its own (never 4321 or 4399) with its own
  `PILOT_DECK_DIR`, driven through the DOM. Never the user's live deck.
- Small-diff limit: 300 changed lines per slice; past it, stop and ask `main`.

## Report

A table: slice, branch, PR, head SHA, tests added (failed before, pass after), gate output line, live evidence.
