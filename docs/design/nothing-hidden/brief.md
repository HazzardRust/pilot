# Brief: nothing-hidden

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that shared checkout or in another session's worktree. Create your own beside it, `pilot-nothing-hidden-s<n>`,
and run `npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/nothing-hidden`, cut at Gate 1 from the run's base as `pilot base` names it then (`feat/ci-gate`
at planning, 203bcfb6, taking `origin/pilot` 6213050). Branches: `slice/nothing-hidden-s<n>`, pushed for the pilot to
integrate; no slice PR. The PR target is the run's base: `feat/ci-gate`, or `pilot` once ci-gate has landed.

## PR titles

- A slice: `feat(nothing-hidden): S<n> <title>`, the title lower-case first, e.g. `feat(nothing-hidden): S1 every waiting thread is on home, in hand first`
- A fix round: `fix(nothing-hidden): <what>`
- The feature PR: `feat(nothing-hidden): Nothing waiting on you is hidden from the deck`

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

`docs/design/nothing-hidden/architecture.md`, slices in `slices/S1.md` and `slices/S2.md`. The run's ADR is
`docs/adr/NNNN-nothing-hidden.md` (S1); the landing numbers it. `docs/adr/README.md` is regenerated with
`node scripts/adr-index.mjs`, never by hand.

## Gate command

```
npm ci
npm test
```

`npm test` runs `node scripts/gate.mjs`: 5.5 to 20 minutes on 2026-11-20. One file: `node --test <file>`. Run the full
`npm test` once, on the slice's final state. The repo has no typecheck, lint or build script.

- `SPAWN_CEILING` is 13300 on `pilot` (`scripts/gate.mjs:46`); print the gate's spawn count in your report.
- `deck/test/facades.test.mjs` caps source files at 800 lines; check `wc -l` on every deck file you grow.

## Known flaky tests

None known: `deck/test/idle-wake.test.mjs` "a parked wait wakes" and the Windows-CI "sed -i on a tracked file is
refused" were fixed on `pilot` at 6213050, which the base takes. A red there is a real failure; name it.

## Live check (short path, no QA agent)

Each slice's `look` behaviour is run by the implementer: serve a scratch deck locally and look at the home page.

## Diff limit

300 changed lines per slice. Past that, stop and ask `main`.
