# Brief: user-pilot-branch

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/jrylk/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`. Never work in that shared
checkout (it is far behind) or in another session's worktree. Create your own beside it,
`pilot-user-pilot-branch-s<n>`, and run `npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/user-pilot-branch`, cut at Gate 1 from `design/user-pilot-branch` (itself from
`origin/feat/reply-markdown` at `109f613`, the concluding feature `pilot base` chained on). Branches:
`slice/user-pilot-branch-s<n>`, pushed for the pilot to integrate; no slice PR. The feature PR targets
`feat/reply-markdown` while that PR (#137) is unmerged, then `main` (ADR 0200's computed base).

## PR titles

- A slice: `feat(user-pilot-branch): S<n> <title>`, the title lower-case first, e.g. `feat(user-pilot-branch): S1 \`pilot base\` names and creates your pilot branch (walking skeleton)`
- A fix round: `fix(user-pilot-branch): <what>`
- The feature PR: `feat(user-pilot-branch): The pilot branch is named for its user`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSFrR7Ee9f1oe7sWUsEs
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSFrR7Ee9f1oe7sWUsEs
```

## Live root

C:\Users\jrylk\.claude\pilot\live untrusted

## Artefact

`docs/design/user-pilot-branch/architecture.md`, slices in `slices/S1.md` to `slices/S8.md`. The run's ADR is
`docs/adr/0218-user-pilot-branch.md` (S1); the landing numbers it.

## Environment

Windows 11, Node 26. The suite runs with `PILOT_BRANCH=pilot` pinned by `gateEnv` once S1 lands (L7): a new test
that exercises the derivation deletes `PILOT_BRANCH` from its own env and its children's, and uses a name other
than `pilot`. A bare `node --test <file>` outside the gate has no pin; set `PILOT_BRANCH=pilot` for an old fixture.
Host calls go through a fake `Host` (see `deck/host.mjs`'s typedef); no test reaches GitHub.

## Gate command

```
npm ci
npm test
```

`npm test` runs `node scripts/gate.mjs` (about 10 minutes). One file: `node --test <file>`. Before Gate 2 a slice
runs `npm run test:changed -- --since=origin/main`; the full suite runs once per slice at its end.

## Known flaky tests

None recorded. The live deck on 4321 stalls when two full suites run at once: run one `npm test` at a time, in the
background. A new worktree needs `npm ci` before the Rust deck tests pass. The vocabulary guard
(`scripts/vocabulary.mjs`) rejects its retired words even in test strings.

## Diff limit

400 changed lines per slice. Past that, stop and ask `main`.
