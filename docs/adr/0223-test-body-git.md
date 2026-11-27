---
status: proposed
date: 2026-11-27
tags: [testing, git, cost]
supersedes: []
superseded_by: []
paths: [scripts/test/lib/seed.mjs, scripts/test/lib/git-fixture.mjs]
---
# Fixture history is seeded in one spawn

We decided that a test fixture writes its origin's history, its branches, commits and merges, with one `git init --bare` and one `git fast-import` (`seed`), and keeps `git clone` for the working copies its tests drive.

## Context

A full suite starts about 12,400 git processes against a signed bar of 10,000 (test-body-git spec 1). About 4,500 of them are fixture git, and the largest share, about 2,350, runs inside `gitFixture` builders that write a history the porcelain way: an init, then an add, a commit, a checkout and a push per step, about fifteen git for a two-commit origin. `commitFile` cannot fold those steps (land-batching S6: `commit -i` refuses an untracked path).

## Decision

- **L3** `seed(dir, history, refs)` writes the history from a plain list of commits (`{ branch, files, message, merge? }`) in two git, whatever its length; `refs` puts more branches on an existing tip in the same import. Commit times count up by a second from a fixed epoch in history order, so topological and date order agree; author and committer are the fixture's global identity. A merge's tree is computed, not merged by git: its first parent's files with each merged branch's files laid over.
- Every branch name and path is checked before git starts, and git gets argv and stdin only.
- Working copies stay `git clone`: a builder spends one more git per working copy.

## Rejected

- *Porcelain folds* (`commit -a`, one push of many refs): `commitFile` cannot fold, and a fold still spends a git per commit.
- *Plumbing per commit* (`hash-object`, `mktree`, `commit-tree`): more spawns than the porcelain build.
- *Copying a `.git` to a new path*: git-light-tests A1, paths baked into the copy.

## Consequences

- A test that relies on a commit's wall-clock date reads a 2023 date from a seeded origin.
- A history whose merge would conflict, or needs a merge base to resolve, is not one to seed: its builder keeps the porcelain steps.
