---
status: proposed
date: 2026-10-18
tags: [platform, macos, linux, paths, security]
supersedes: []
superseded_by: []
paths: [hooks/lib/platform.js, hooks/lib/atomic-write.js, deck/items.mjs, hooks/lib/deck.js, .github/workflows/gate.yml, docs/design/mac-linux/architecture.md]
---
# One CommonJS platform seam, realpath path keys, and a private store directory

We decided that every `process.platform` read in non-test source goes through one CommonJS module, `hooks/lib/platform.js`, that a repository's key is its realpath (case-folded on win32 only), that privacy on POSIX is the store directory's (0700, with 0600 only through `atomicWriteFileSync`), and that the macOS and Windows CI jobs run on every PR once the repository is public and on the `all-os` label, a weekly schedule and dispatch while it is private.

## Context

Pilot had only been proven on Windows (mac-linux, `itm_1d6f74c3861a`). Twenty inline `process.platform` reads, two copies of `repoKey` pinned equal by a test, two disagreeing process-tree kills, BSD `ps` rejecting `etimes`, a platform-blind install profile and a `claude` lookup that trusted relative PATH entries off Windows each hid a Mac or Linux difference. The host has no Mac; GitHub's macOS runners bill at about 10x, and the user has queued a move to a fresh public repository (`itm_c570093cafb5`) where standard runners are free.

## Decision

- `hooks/lib/platform.js` (CJS) is the only non-test reader of `process.platform`, exporting `hostPlatform`, `isWindows`, `pathKey`, `killTree` and `claudeBin`; every other module takes a `platform` argument defaulting to `hostPlatform()`, read live on each call. A test greps the sources for the single read site (L1, L2).
- `pathKey` realpaths a path that exists and falls back to `path.resolve`; case folds on win32 only. Every deck and hook repo key is a `pathKey`, so `/tmp/x` and `/private/tmp/x` are one repository (L3).
- The store dir and `pilot-inbox` are 0700 on POSIX, with `atomicWriteFileSync` writing 0600; the ten raw writers are unchanged (L6).
- `gate.yml` runs ubuntu on every non-draft PR to main; macos and windows on every such PR when `github.event.repository.private == false`, else on the `all-os` label, a weekly schedule and `workflow_dispatch` (L10).

## Rejected

- *`deck/platform.mjs` plus a CJS copy for the hooks*: the hooks are synchronous CommonJS and cannot import `.mjs`; the copy is the duplicate the `repoKey` pin already fights.
- *A module-level platform constant*: three tests redefine `process.platform` at run time.
- *Realpath only at registration*: leaves the hooks' cwd spellings split from the deck's.
- *0600 on every store file*: ten raw writers to change for nothing a 0700 directory does not already close.
- *Label/weekly for good, or 3 OSes on every PR now*: the first needs a second workflow edit at the public move; the second spends the private repo's 2,000 minutes in about four days.

## Consequences

- A new inline `process.platform` read fails `npm test`.
- Keys already stored in deck.json carry over on Windows (`lower(realpath)` equals `lower(resolve)` except through a junction or `subst` drive).
- TCC prompts, Terminal.app profile sourcing and APFS case-variants stay unproven until someone runs it on a Mac.
