# Brief: ci-green

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that shared checkout or in another session's worktree. Create your own beside it, `pilot-ci-green-s<n>`,
and run `npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/ci-green`, cut at Gate 1 from `origin/pilot` (35868866 at design time). Branches:
`slice/ci-green-s<n>`, pushed for the pilot to integrate; no slice PR. The PR target is `pilot`.

## PR titles

- A slice: `feat(ci-green): S<n> <title>`, the title lower-case first, e.g. `feat(ci-green): S1 walking skeleton: the Gate is green on all three OS`
- A fix round: `fix(ci-green): <what>`
- The feature PR: `feat(ci-green): Pilot's CI is green again`

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

`docs/design/ci-green/architecture.md`, slice in `slices/S1.md`. No ADR (L3).

## Gate command

```
npm ci
npm test
```

`npm test` runs `node scripts/gate.mjs`, 6-8 minutes, 10 skipped is normal. One file: `node --test <file>`.
`deck/test/facades.test.mjs` caps source files at 800 lines.

## Known flaky tests

None recorded. (The two CI reds this run fixes are diagnosed in the artefact §3; neither is a flake.)

## Live verification

The Gate workflow on the feature PR, three OS jobs (A3): the evidence for Linux and macOS, which this Windows machine
cannot run. Deck tests run on a scratch store, never `~/.claude/pilot/deck.json`.

## Diff limit

150 changed lines per slice. Past that, stop and ask `main`.
