# Brief: debug-workflow

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

The repository is `C:/Users/Hazzard/projects/pilot` (GitHub `HazzardRust/pilot`, public). Its default branch is `main` and its
pilot branch is `pilot`. Never work in that checkout or in another session's worktree. Create your own beside it, named
`pilot-debug-workflow-s<n>`. Run `npm ci` in the new worktree before the first test run.

## Base and PR target

The base is `feat/debug-workflow`, cut at Gate 1 from `origin/pilot` (18a5d2f0). Every slice PR is a **draft** against
`feat/debug-workflow` and is never marked ready, because the pilot merges it. The feature PR targets `pilot`.

- Branch name: `slice/debug-workflow-s<n>`.
- PR body: write it with `gh pr create --body-file <file>`.

## Remote

Remote: origin

## PR titles

- A slice: `feat(debug-workflow): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(debug-workflow): <what>`
- The feature PR: `feat(debug-workflow): A failing run has a debugging workflow`

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

The artefact is `docs/design/debug-workflow/architecture.md`, and the slice files are `slices/S<n>.md`. Its terms (§4) are
fixed. The locked decisions are in §5 (L1–L8), and no slice moves one. Later slices read the seams by name from the
integration branch: S1's `pollCi` and `RedRun`, and S2's `ciSummary` and `cleanField`. The ADR is `docs/adr/NNNN-debug-workflow.md`.
The landing numbers it, so never pick a number.

## Tests

Nothing reaches GitHub, the live deck on 4321, or a real remote from a test. `gh` is always injected as `(args) => string`.
A CI log in a test is S2's fixture, `scripts/test/fixtures/ci/run-39530951687.log`. A deck test uses an injected `note`, or a
scratch store as in `deck/test/` today. Every test that starts a process or a server stops it in teardown. The raw log is
untrusted text (L1): never put it in a shell, an argv, the store or an agent's context.

## Gate command

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
```

There is no typecheck, lint or build step. To run one file, use `node --test <file>`. While GitHub Actions results are not
evidence, the local referee is `npm test` once on Windows in your worktree.

## Known flaky tests

None known.

## Live verification

- S1 and S3: a scratch deck (`pilot deck --scratch`, stopped in teardown), polled against the real `gh` on this repository with an
  injected `now` that puts run 39530951687 inside the window. Paste the line in the PR.
- S2: run `pilot ci 39530951687` for real, and paste its output and line count in the PR.
- S4: run `check-references` and paste the measured pilot prompt size in the PR.
