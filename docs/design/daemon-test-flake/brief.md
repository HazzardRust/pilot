# Brief: daemon-test-flake

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree: create your own, named `pilot-daemon-test-flake-s<n>`,
beside it. Run `npm ci` in the new worktree before the first test run.

## Base and PR target

Base: `feat/daemon-test-flake`, cut from `design/daemon-test-flake` at Gate 1. Every slice PR is a **draft** against
`feat/daemon-test-flake`, never marked ready; the pilot merges it. Branch: `slice/daemon-test-flake-s<n>`. Write PR
bodies with `gh pr create --body-file <file>`. S2 and S4 come after S1; S3 runs beside S1 (disjoint files).

## PR titles

- Slice: `feat(daemon-test-flake): S<n> <title as the artefact words it>`, the first word after `S<n>` lower-case.
- Fix round: `fix(daemon-test-flake): <what>`
- Feature PR: `feat(daemon-test-flake): four timing tests hold under load`

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

`docs/design/daemon-test-flake/architecture.md`; slice files `docs/design/daemon-test-flake/slices/S<n>.md`. Locked
decisions §5 (L1 to L10) move in no slice. ADR 0121 (test waits) and ADR 0120 (the join retry) record them.

## Gate command

```
npm ci
npm test
node scripts/adr-index.mjs --check
node scripts/check-references.mjs
```

No typecheck, lint or build step. One file: `node --test <file>`; on Windows use the glob form,
`node --test deck/test/*.test.mjs`, not a directory. `npm run test:quiet` is the dot reporter, same concurrency and
timeout as `npm test`.

## Known flaky tests

- `deck/test/usage.test.mjs` "in 2 hrs"
- `deck/test/run.test.mjs` "a session that ends while the wrapper waits for the marker stops the wait" (timing; passes alone)
- The four this feature fixes, until its slices land: `daemon.test.mjs` two-sessions (:966), :1410, :1482; `run.test.mjs:676`.

## Constraints

- No fix is a bigger literal alone (the user's rule, ADR 0121). The PR body carries the diagnosis paragraph naming what raced.
- Live verification per slice: the slice's test file run 10 times in a row with the full suite under `npm run test:quiet`
  on this machine while other agents are live; read each run's failure list, every other failure named in the PR.
- Small-diff limit: 100 changed lines per slice; past it, stop and ask `main`.

## Report

A table: slice, branch, PR, head SHA, tests added (failed before, pass after), gate output line, the 10-run tally,
other failures seen by name.
