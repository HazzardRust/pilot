# Brief: coverage-install

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that shared checkout or in another session's worktree. Create your own beside it,
`pilot-coverage-install-s<n>`, and run `npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/coverage-install`, cut at Gate 1 from `origin/pilot`. Branches: `slice/coverage-install-s<n>`,
pushed for the pilot to integrate; no slice PR. The PR target is `pilot`.

## PR titles

- A slice: `feat(coverage-install): S<n> <title>`, the title lower-case first, e.g. `feat(coverage-install): S1 the runner installs before its first check and names a failed install`
- A fix round: `fix(coverage-install): <what>`
- The feature PR: `feat(coverage-install): coverage is never unmeasured for a missing node_modules`

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

`docs/design/coverage-install/architecture.md`, slice in `slices/S1.md`. The run's ADR is
`docs/adr/0203-coverage-install.md` (S1); the landing numbers it.

## Gate command

```
npm ci
npm test
```

`npm test` runs `node scripts/gate.mjs`. One file: `node --test <file>`. Run the full `npm test` once, on the slice's
final state. The repo has no typecheck, lint or build script. No `measure-prompt` pin covers the runner, the
fundamentalist or the co-pilot (`scripts/measure-prompt.mjs` `pinsOf`).

## Known flaky tests

- `deck/test/idle-wake.test.mjs` "a parked wait wakes": red after 10:20 UTC until ci-green lands.
- Windows-CI only: "sed -i on a tracked file is refused".

## Diff limit

150 changed lines per slice. Past that, stop and ask `main`.
