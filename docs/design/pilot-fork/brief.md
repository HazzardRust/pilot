# Brief: pilot-fork

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

The repository is `C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Its default branch is `main` and its
pilot branch is `pilot`. Never work in that checkout, or in another session's worktree. Create your own beside it,
named `pilot-pilot-fork-s<n>`. In a deep directory, `git -c core.longpaths=true worktree add`. Run `npm ci` in the new
worktree before the first test run.

## Base and PR target

The base is `feat/pilot-fork`, which the pilot cuts at Gate 1 from `origin/pilot`. Every slice PR is a **draft**
against `feat/pilot-fork` and is never marked ready, because the pilot merges it.

- Branch name: `slice/pilot-fork-s<n>`.
- PR title: `feat(pilot-fork): S<n> <title as in the artefact>`.
- PR body: write it with `gh pr create --body-file <file>`.

This repository leaves `pilot.remote` unset, so this run's own branches go to `origin` as today (L14).

## Artefact

The artefact is `docs/design/pilot-fork/architecture.md`, and the slice files are `slices/S<n>.md`. Its terms (§4)
are fixed: **run remote**, **local mode**, **feature branch**, **run branch** and **merged**. The locked decisions
are in §5, and no slice moves one. S1 states the remote seam, `runRemote` and `runRef`, in `scripts/remotes.mjs`.
Every later slice reads it by name from the integration branch.

## Tests

The three modes in a test use two scratch bare repositories:

- `origin.git` holds `main`, and gets `feat/` and (unset mode) every run branch;
- `second.git` is a second remote, named `second` in the work clone, for `git config pilot.remote second`;
- local mode is `git config pilot.remote none` against `origin.git` alone.

Copy `scratchRepos` from `scripts/test/base.test.mjs`. gh is always injected as `(args) => string`. Nothing reaches
GitHub or a deck from a test.

## Gate command

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
```

There is no typecheck, lint or build step. To run one file, use `node --test <file>`. On Windows, use the glob form
for a directory. Pins on one rule are spread across `deck/test/`, `scripts/test/` and `hooks/test/`, so grep for the
sentence before the first full run.

## Live verification

Every CLI slice runs its command for real, `node bin/pilot.mjs <command>`, in a scratch clone with two local bare
remotes. Paste the output in the PR. Never run `pilot branches prune` without `--dry-run` against
HazzardRust/pilot (L12). Never use the live deck on 4321.

## Diff limit

300 changed lines per slice. Past that, stop and ask `main`.
