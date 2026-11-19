# Brief: recut-decision

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that shared checkout or in another session's worktree. Create your own beside it, `pilot-recut-decision-s<n>`,
and run `npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/recut-decision`, cut at Gate 1 from `origin/pilot` (35868866 at design time). Branches:
`slice/recut-decision-s<n>`, pushed for the pilot to integrate; no slice PR. The PR target is `pilot`.

## PR titles

- A slice: `feat(recut-decision): S<n> <title>`, the title lower-case first, e.g. `feat(recut-decision): S1 a landing over an owned file leaves the ticket yellow with one drift line`
- A fix round: `fix(recut-decision): <what>`
- The feature PR: `feat(recut-decision): A re-cut is the pilot's or co-pilot's decision`

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

`docs/design/recut-decision/architecture.md`, slices in `slices/S1.md` to `slices/S3.md`. The run's ADR is
`docs/adr/NNNN-recut-decision.md` (S3); the landing numbers it.

## Gate command

```
npm ci
npm test
```

`npm test` runs `node scripts/gate.mjs`, 6-8 minutes, 10 skipped is normal. One file: `node --test <file>`.
`deck/test/facades.test.mjs` caps source files at 800 lines.

## Known flaky tests

None recorded.

## Live verification

Deck tests run on a scratch store, never `~/.claude/pilot/deck.json`. After the gate, `pilot tickets` read once.

## Diff limit

150 changed lines per slice. Past that, stop and ask `main`.
