# Brief: land-batching

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/jrylk/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`. Never work in that shared
checkout (it is far behind) or in another session's worktree. Create your own beside it,
`pilot-land-batching-s<n>`, and run `npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/land-batching`, cut at Gate 1 from `design/land-batching` (itself from `origin/main` at
`ffc8384`). Branches: `slice/land-batching-s<n>`, pushed for the pilot to integrate; no slice PR. The feature PR's
target is `main`, as `pilot base` prints. S3 and S5 merge `origin/main` first once prune-worktrees has landed (A4).

## PR titles

- A slice: `feat(land-batching): S<n> <title>`, the title lower-case first, e.g. `feat(land-batching): S1 one landing runs on one view and spawns fewer git (walking skeleton)`
- A fix round: `fix(land-batching): <what>`
- The feature PR: `feat(land-batching): Landing spawns far fewer git processes`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
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

`docs/design/land-batching/architecture.md`, slices in `slices/S1.md` to `slices/S7.md`. The run's ADR is
`docs/adr/NNNN-land-batching.md` (S1); the landing numbers it. The git census before is `spawns-before.txt`,
made by `census-probe.mjs`:
`PROBE_OUT=<file> NODE_OPTIONS=--import=file:///<abs path>/census-probe.mjs npm run test:cost`.

## Environment

Windows 11, Node 26. Spawn counts: `countGit` (S1) in-process for one command; the gate's `spawns …` line for the
suite. Seeded repos come from `scripts/test/lib/land-repos.mjs` (`repos(t, …)`) and `git-fixture.mjs`.

## Gate command

```
npm ci
npm test
```

`npm test` runs `node scripts/gate.mjs`. One file: `node --test <file>`. Before Gate 2 a slice runs
`npm run test:changed -- --since=origin/main`; the full suite runs once, at S7 and at the landing.

## Known flaky tests

None recorded. The live deck on 4321 stalls when two full suites run at once: run one `npm test` at a time, in the
background.

## Diff limit

400 changed lines per slice. Past that, stop and ask `main`.
