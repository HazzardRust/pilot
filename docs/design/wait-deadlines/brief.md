# Brief: wait-deadlines

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that shared checkout (it is on `main`) or in another session's worktree. Create your own beside it,
`pilot-wait-deadlines-s<n>`, and run `npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/wait-deadlines`, cut from `design/wait-deadlines`, itself on `origin/pilot` (dc5f7be, after
human-steps landed). A slice is a pushed branch `slice/wait-deadlines-s<n>`, integrated by the co-pilot into
`feat/wait-deadlines`; the feature PR targets `pilot`.

## PR titles

- A slice: `feat(wait-deadlines): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(wait-deadlines): <what>`
- The feature PR: `feat(wait-deadlines): No agent outlives a wait that can never end`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSFppeY5pzVQLciH5swh
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSFppeY5pzVQLciH5swh
```

## Artefact

`docs/design/wait-deadlines/architecture.md`, slices in `slices/S<n>.md`. Terms (§4) are fixed; locked decisions
(§5) and answered A‹n› (§6) are not moved by a slice. S3 reads S2's `unboundedWaits` and S4 reads S3's
`reapStalled` from the integration branch by name. The run's ADR is `docs/adr/NNNN-wait-deadlines.md` (S5); the
landing numbers it. The 50-minute figure (A4) is one constant per module: `MAX_WAIT_MINUTES`, `STALL_AGE_S`.

## Tests

Nothing reaches GitHub, the live deck on 4321, a real remote or a real process outside the test from a test. A deck
test takes its own store (`deck/testUtils.mjs`); process tables and kills are injected (pattern `deck/test/gc.test.mjs`,
`deck/test/procs.test.mjs`). A hook test calls `decide` directly (pattern `hooks/test/shell-write-guard.test.js`).
A timer test uses `t.mock.timers`. No test pins a phrase of prose (ADR 0180).

## Gate command

```
npm ci
npm test
```

`npm test` runs `node scripts/gate.mjs`. One file: `node --test <file>`. Run the suite with `run_in_background` and
end your turn, or with a `timeout` of 600000 ms; never poll its log with an `until` loop (this feature's own cause).

## Known flaky tests

None open. ci-green fixed idle-wake "a parked wait wakes" and Windows "sed -i on a tracked file is refused" on pilot.

## Live verification

A scratch deck only: `pilot deck --scratch`, then `pilot deck --stop <pid>`, with a temp git repository. Never stop,
plant or scan a process under the live deck. S3's run plants a real `until` loop under a session registered on the
scratch deck, with the stall age injected short.

## Diff limit

400 changed lines per slice. Past that, stop and ask `main`.
