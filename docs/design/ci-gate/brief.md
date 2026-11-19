# Brief: ci-gate

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that shared checkout or in another session's worktree. Create your own beside it, `pilot-ci-gate-s<n>`,
and run `npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/ci-gate`, cut at Gate 1 from `origin/pilot` (ebe5233c). Branches: `slice/ci-gate-s<n>`, pushed for
the pilot to integrate; no slice PR. The PR target is `pilot`. ci-green must land on `pilot` before this run lands
(architecture.md §6 A7, §5 L11).

## PR titles

- A slice: `feat(ci-gate): S<n> <title>`, the title lower-case first, e.g. `feat(ci-gate): S1 the checks on one commit read as one line`
- A fix round: `fix(ci-gate): <what>`
- The feature PR: `feat(ci-gate): CI is a gate at every step`

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

`docs/design/ci-gate/architecture.md`, slices in `slices/S1.md` to `slices/S8.md`. The run's ADR is
`docs/adr/NNNN-ci-gate.md` (S1); the landing numbers it. S1 also adds the §4 terms to `CONTEXT.md`.

## Gate command

```
npm ci
npm test
```

`npm test` runs `node scripts/gate.mjs`: 5.5 to 20 minutes on 2026-11-20. One file: `node --test <file>`. Run the full
`npm test` once, on the slice's final state: slice-only gates missed repo-wide pins twice on 2026-11-20. The repo has
no typecheck, lint or build script.

- `SPAWN_CEILING` is 13300 on `pilot` (`scripts/gate.mjs:46`), raised only by the rule in that file's comment; print
  the gate's spawn count in your report.
- `scripts/test/platform-reads.test.mjs` allows `process.platform` only in `hooks/lib/platform.js`.
- `deck/test/facades.test.mjs` caps source files at 800 lines; `deck/store-items.mjs` is at 798, so add nothing there.

## Known flaky tests

- `deck/test/idle-wake.test.mjs` "a parked wait wakes": red after 10:20 UTC until ci-green lands.
- Windows-CI only: "sed -i on a tracked file is refused".

## Diff limit

150 changed lines per slice, or the higher number a slice file writes for itself. Past that, stop and ask `main`.
