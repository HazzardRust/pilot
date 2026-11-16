# Brief: ci-cross-os

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

The repository is `C:/Users/Hazzard/projects/pilot` (GitHub `HazzardRust/pilot`, public; Actions run). Its default
branch is `main` and its pilot branch is `pilot`. Never work in that checkout, or in another session's worktree.
Create your own beside it, named `pilot-ci-cross-os-s<n>`. Run `npm ci` in the new worktree before the first test run.

## Base and PR target

The base is `feat/ci-cross-os`, cut at Gate 1 from the design branch. Every slice PR is a **draft** against
`feat/ci-cross-os` and is never marked ready, because the pilot merges it.

- Branch name: `slice/ci-cross-os-s<n>`.
- PR body: write it with `gh pr create --body-file <file>`.

## Remote

Remote: origin

## PR titles

- A slice: `feat(ci-cross-os): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(ci-cross-os): <what>`
- The feature PR: `feat(ci-cross-os): The suite passes on macOS and Windows CI`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PLSy3oNjHdFSiMkkcniEyc
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01PLSy3oNjHdFSiMkkcniEyc
```

## Artefact

`docs/design/ci-cross-os/architecture.md`; slice files `slices/S<n>.md`. The one seam is
`scripts/test/lib/git-fixture.mjs` (`gitFixture`, its `tempDir` and the global gitconfig it writes on import). Only
that file and `scripts/test/git-fixture.test.mjs` change, plus `.github/workflows/gate.yml:8` and its pin in
`scripts/test/gate-workflow.test.mjs` in S2 (L6). No assertion in any other test is edited (L1). QA environment (L7): the
Gate runners by dispatch, the local Windows suite and the WSL Linux suite.

## Gate command

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
```

There is no typecheck, lint or build step. To run one file, use `node --test <file>`.

## Known flaky tests

None known.

## Cross-OS evidence

No macOS machine exists locally. The macOS and Windows runner evidence is a dispatched Gate run on the slice branch,
after the push: `gh workflow run gate.yml --ref slice/ci-cross-os-s<n>`, then `gh run list --workflow gate.yml
--branch slice/ci-cross-os-s<n>` and `gh run view <id> --json jobs`. A draft PR to `feat/**` skips the Gate
(`.github/workflows/gate.yml:25`), so dispatch is the only route. A job refused for billing ran no tests: read its
annotations before reading a red job as a result. Locally: the suite once on Windows in your worktree, and in WSL
(node 26 at `~/node26`) on a fresh clone at the pushed sha.

## Diff limit

300 changed lines per slice. Past that, stop and ask `main`.
