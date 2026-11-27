# Brief: test-body-git

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/jrylk/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`. Never work in that shared
checkout or in another session's worktree. Create your own beside it, `pilot-test-body-git-s<n>`, and run `npm ci`
there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/test-body-git`, cut at Gate 1 from `design/test-body-git` (itself from `origin/main` at
`6701cc7`). Branches: `slice/test-body-git-s<n>`, pushed for the pilot to integrate; no slice PR. The feature PR's
target is `main`, as `pilot base` prints. S10 to S13 start only once land-batching (`itm_7a100ab43411`) is in the
base: `feat/test-body-git` merges `origin/main` after it lands (A1). `feat/land-batching` is read only.

## PR titles

- A slice: `feat(test-body-git): S<n> <title>`, the title lower-case first, e.g. `feat(test-body-git): S1 one builder seeds its history in one spawn (walking skeleton)`
- A fix round: `fix(test-body-git): <what>`
- The feature PR: `feat(test-body-git): Test bodies spawn far fewer git`

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

`docs/design/test-body-git/architecture.md`, slices in `slices/S1.md` to `slices/S13.md`. The run's ADR is
`docs/adr/0223-test-body-git.md` (S1); the landing numbers it. S1 adds `census.mjs` (fixture git per test file,
split builder / body / lib) and `assert-count.mjs` (tests and asserts per file, a ref against the worktree); every
fold slice reports both, base against tip, for its files owned.

## Environment

Windows 11, Node 26, git 2.56. QA runs here: the repo's own suite and gate, no surface a user looks at. Spawn counts:
`countGit` (`scripts/test/lib/count-git.mjs`) in-process; `census.mjs` per file; the gate's `spawns …` line for the
suite. Repositories come from `gitFixture` (`scripts/test/lib/git-fixture.mjs`), S1's `seed`, and `land-repos.mjs`.

## Gate command

```
npm ci
npm test
```

`npm test` runs `node scripts/gate.mjs`. One file: `node --test <file>`. A slice runs its files and
`npm run test:changed -- --since=origin/main`; the full suite runs once, at S13 (`npm run test:cost`) and at the landing.

## Known flaky tests

- `deck/test/gate1-lineage.test.mjs`: 7 tests failed (6 to 18 s each, slow git) under a 110-file parallel run on
  2026-11-26. Owned by the queued ticket `itm_ad02d595d1c2` ("Gate1 lineage tests survive a slow git"); no slice owns
  this file. A failure there alone is not your slice's.
- The live deck on 4321 stalls when two full suites run at once: run one `npm test` at a time, in the background.

## Diff limit

400 changed lines of test churn per slice. Past that, stop and ask `main`.
