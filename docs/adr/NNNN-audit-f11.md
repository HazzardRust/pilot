---
status: proposed
date: 2026-11-19
tags: [tests, git, windows]
supersedes: []
superseded_by: []
paths: [scripts/test/lib/git-fixture.mjs, scripts/test/git-fixture.test.mjs, scripts/test/audit-context.test.mjs, docs/design/audit-f11/architecture.md]
---
# Fixture git sets core.autocrlf to false in the fixture config

We decided that the gitconfig `git-fixture.mjs` writes into the fake home carries `core.autocrlf = false`, so no git
in a test process or its children converts line endings or prints `LF will be replaced by CRLF`.

## Context

On Windows the system gitconfig (`Program Files/Git/etc/gitconfig`) sets `core.autocrlf=true`. The fixture config is
the global file and outranks the system one, but it never set the key, so every `git add` of an LF file in a fixture
repo printed the warning: 116 and 156 lines in a full gate run.

## Decision

- **L1**: the key lives in the fixture config, one `[core]` line beside `checkStat`. Every git inherits it through
  `GIT_CONFIG_GLOBAL` with no spawn. Rejected: `git config core.autocrlf false` per repository (a spawn per build,
  missed by builders that skip the helper); `GIT_CONFIG_COUNT` in the gate's environment (missed by
  `node --test <file>`).
- **L2**: only `core.autocrlf`. With no conversion there is nothing to warn about, so `core.safecrlf` would add a key
  with no effect.

`audit-context.test.mjs` imports `git-fixture.mjs`, which imports `fake-home.mjs`, in place of importing
`fake-home.mjs` alone, so it gets the same config.

## Consequences

Fixture repos check out and add files byte for byte, as on Linux CI where the key is unset. A test that makes a repo
without the helper still inherits the system value.
