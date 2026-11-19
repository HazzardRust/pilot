# Brief: coverage-cell

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that shared checkout or in another session's worktree. Create your own beside it, `pilot-coverage-cell-s1`,
and run `npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/coverage-cell`, cut at Gate 1 from `origin/pilot` (ffeb7306). Branches: `slice/coverage-cell-s<n>`,
pushed for the pilot to integrate; no slice PR. The PR target is `pilot`.

## PR titles

- A slice: `feat(coverage-cell): S<n> <title>`, the title lower-case first, e.g. `feat(coverage-cell): S1 one command prints a feature's diff coverage from Node's own coverage`
- A fix round: `fix(coverage-cell): <what>`
- The feature PR: `feat(coverage-cell): The evidence runner's coverage cell is not refused by auto mode`

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

`docs/design/coverage-cell/architecture.md`, slices in `slices/S1.md` and `slices/S2.md`. The run's ADR is
`docs/adr/NNNN-coverage-cell.md` (S2).

## Gate command

```
npm ci
npm test
```

`npm test` runs `node scripts/gate.mjs`, 6-8 minutes, 10 skipped is normal. One file: `node --test <file>`.
`deck/test/facades.test.mjs` caps source files at 800 lines.

## Known flaky tests

None recorded.

## crew-refusals

`feat/crew-refusals` landed on `pilot` at ffeb730 and removed the env segment from every runner cell, so S2
writes the cell env-less (architecture.md §6 A5). Its L1 binds this run (§5 L2).

## Diff limit

150 changed lines per slice. Past that, stop and ask `main`.
