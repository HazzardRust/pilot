# Brief: gate2-lands

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree: create your own, named `pilot-gate2-lands-s<n>`,
beside it. Run `npm ci` in the new worktree before the first test run.

## Base and PR target

Base: `feat/gate2-lands`, cut from `design/gate2-lands` at Gate 1 (itself from `origin/pilot` 178c7e5e).
Every slice PR is a **draft** against `feat/gate2-lands`, never marked ready; the pilot merges it.
Branch: `slice/gate2-lands-s<n>`. Write PR bodies with `gh pr create --body-file <file>`.
S2 and S3 come after S1: branch them from S1's tip (pipeline) and rebase onto `feat/gate2-lands` once S1 is integrated.

## PR titles

- Slice: `feat(gate2-lands): S<n> <title as the artefact words it>`, the first word after `S<n>` lower-case.
- Fix round: `fix(gate2-lands): <what>`
- Feature PR: `feat(gate2-lands): a signed gate2 lands the feature from the deck`

## Commit trailer

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018AhBBtoZQLm8YkRkinesmx
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_018AhBBtoZQLm8YkRkinesmx
```

## Artefact

`docs/design/gate2-lands/architecture.md`; slice files `docs/design/gate2-lands/slices/S<n>.md`.
Locked decisions §5 (L1 to L14) move in no slice. New ADR: 0111 (0107 to 0110 are taken by other live features),
in the format of its neighbours, then `node scripts/adr-index.mjs` to regenerate `docs/adr/README.md`.

## Gate command

```
npm ci
npm test
node scripts/adr-index.mjs --check
```

No typecheck, lint or build step. One file: `node --test <file>`; on Windows use the glob form,
`node --test deck/test/*.test.mjs`, not a directory.

## Known flaky tests

- `deck/test/usage.test.mjs` "in 2 hrs"
- `deck/test/run.test.mjs` "a session that ends while the wrapper waits for the marker stops the wait" (timing; passes alone)
- A fake deck in a test that leaves one route unanswered hangs `node --test` with no timeout: answer every route the code reads.

## Constraints

- The daemon runs one fixed command: node + its own `bin/pilot.mjs` `land`, no shell, no argument from the request or the
  store, cwd = the run record's worktree after the L3 checks. Never the user's live deck on 4321 or 4399.
- `scripts/test/measure-prompt.test.mjs`: the prompt budget pins are the user's and never move; S3's edit to
  `agents/pilot.md` step 9 pays for added text by removing redundant text, and moves the pin in
  `scripts/test/pilot-branch-rules.test.mjs:26`.
- `agents/pilot.md` is also edited by feat/co-pilot-successor (#445) and feat/user-threads-open (#451): S3 edits only step 9.
- Live verification: a scratch deck daemon on a port of its own with its own `PILOT_DECK_DIR`, started from your worktree;
  a scratch clone whose `origin` is a local bare repository with `main` and `pilot` and a `feat/x` worktree; the Sign off
  press made in a real browser (chrome-devtools). The `merge first` line reads `unknown` there (no GitHub origin).
- Small-diff limit: 300 changed lines per slice; past it, stop and ask `main`.

## Report

A table: slice, branch, PR, head SHA, tests added (failed before, pass after), gate output line, live evidence.
