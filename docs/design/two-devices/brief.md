# Brief: two-devices

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that shared checkout or in another session's worktree. Create your own beside it, `pilot-two-devices-s<n>`,
and run `npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/two-devices`, cut at Gate 1 from `origin/pilot` (dc5f7beb at planning). Branches:
`slice/two-devices-s<n>`, pushed for the pilot to integrate; no slice PR. The feature PR's target is `pilot`.

## PR titles

- A slice: `feat(two-devices): S<n> <title>`, the title lower-case first, e.g. `feat(two-devices): S1 walking skeleton: pilot doctor slug <slug> names a clash on origin`
- A fix round: `fix(two-devices): <what>`
- The feature PR: `feat(two-devices): Two devices, one repo`

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

`docs/design/two-devices/architecture.md`, slices in `slices/S1.md` to `slices/S3.md`. The run's ADR is
`docs/adr/NNNN-two-devices.md` (S3); the landing numbers it. `docs/adr/README.md` is regenerated with
`node scripts/adr-index.mjs`, never by hand.

## Gate command

```
npm ci
npm test
```

`npm test` runs `node scripts/gate.mjs`: 5.5 to 20 minutes on 2026-11-20. One file: `node --test <file>`. Run the full
`npm test` once, on the slice's final state. The repo has no typecheck, lint or build script.

- `SPAWN_CEILING` is 15195 on `pilot` (`scripts/gate.mjs:50`); print the gate's spawn count in your report.
- `deck/test/facades.test.mjs` caps source files at 800 lines; check `wc -l` on every deck file you grow
  (`deck/doctor.mjs` is 490 at planning).

## Known flaky tests

None known: `deck/test/idle-wake.test.mjs` "a parked wait wakes" and the Windows-CI "sed -i on a tracked file is
refused" were fixed on `pilot` at 6213050, which the base takes. A red there is a real failure; name it.

## Live check

S1 and S2 run their `run` behaviours in this repository (`pilot doctor slug …`, `pilot doctor`). S3's scratch clone
goes in the scratch directory, never beside the shared checkout. Spec 3 on the user's second device is the user's
walkthrough; no agent reaches it.

## Diff limit

400 changed lines per slice. Past that, stop and ask `main`.
