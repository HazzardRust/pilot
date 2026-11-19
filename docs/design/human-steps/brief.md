# Brief: human-steps

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that shared checkout or in another session's worktree. Create your own beside it, `pilot-human-steps-s<n>`,
and run `npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/human-steps`, cut at Gate 1 from `origin/pilot` (fa28b73b at design time). Branches:
`slice/human-steps-s<n>`, pushed for the pilot to integrate; no slice PR. The feature PR's target is `pilot`.

## PR titles

- A slice: `feat(human-steps): S<n> <title>`, the title lower-case first, e.g. `feat(human-steps): S1 walking skeleton: done on a steps thread closes its green ticket and wakes nobody`
- A fix round: `fix(human-steps): <what>`
- The feature PR: `feat(human-steps): Human steps are a green thread`

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

`docs/design/human-steps/architecture.md`, slices in `slices/S1.md` to `slices/S4.md`. The run's ADR is
`docs/adr/NNNN-human-steps.md` (S1, L8).

## Gate command

```
npm ci
npm test
```

`npm test` runs `node scripts/gate.mjs`, 6-8 minutes, 10 skipped is normal. One file: `node --test <file>`.

## Known flaky tests

None recorded.

## Overlaps

crew-refusals S3 (#121) owns `deck/closing-report.mjs` and `deck/test/closing-report.test.mjs`: S2 rebases on `pilot`
after it lands. yellow-never-idle (#114) edits `deck/store-items.mjs` and `deck/server-tools.mjs`: S1 and S3 rebase on
`pilot` before their gate. Never edit around another run's hunks.

## Diff limit

300 changed lines per slice. Past that, stop and ask `main`.
