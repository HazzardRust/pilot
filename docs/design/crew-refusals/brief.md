# Brief: crew-refusals

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that shared checkout or in another session's worktree. Create your own beside it, `pilot-crew-refusals-s1`,
and run `npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/crew-refusals`, cut at Gate 1 from `origin/pilot` (fa28b73b at design time). Branches:
`slice/crew-refusals-s<n>`, pushed for the pilot to integrate; no slice PR. The feature PR's target is `pilot`.

## PR titles

- A slice: `feat(crew-refusals): S<n> <title>`, the title lower-case first, e.g. `feat(crew-refusals): S1 walking skeleton: the runner's table has no home redirect, and a test run cannot reach the real deck`
- A fix round: `fix(crew-refusals): <what>`
- The feature PR: `feat(crew-refusals): Crew commands auto mode refuses`

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

`docs/design/crew-refusals/architecture.md`, slices in `slices/S1.md` to `slices/S3.md`. The run's ADR is
`docs/adr/NNNN-crew-refusals.md` (S1, L6).

## Gate command

```
npm ci
npm test
```

`npm test` runs `node scripts/gate.mjs`, 6-8 minutes, 10 skipped is normal. One file: `node --test <file>`.

## Known flaky tests

None recorded.

## Hard constraints

No slice edits a permission setting, an allowlist, an auto-approving hook or `CLAUDE.md`, and none rewords, splits or
hides a command to get it past auto mode (L1). Never run the three refused commands of §1, or a variant, to test the
classifier.

## Diff limit

300 changed lines per slice. Past that, stop and ask `main`.
