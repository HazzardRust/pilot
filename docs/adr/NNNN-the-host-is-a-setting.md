---
status: proposed
date: 2026-11-18
tags: [deck, host, github, gitlab, install]
supersedes: []
superseded_by: []
paths: [deck/host.mjs, scripts/host-setting.mjs, scripts/uninstall.mjs, docs/INSTALL.md, docs/design/other-host/architecture.md]
---
# The host is a setting, and every host call goes through one verb interface

This amends ADR 0182's "not a host abstraction". We decided that the forge a repository lives on is the git setting `pilot.host` (`github`, `gitlab`, `none`), read by one function and written by `pilot host <name>`, and that every host call the deck and its scripts make goes through `deck/host.mjs` as verbs on a **Host** adapter, so GitHub is one adapter beside GitLab and plain git.

## Context

ADR 0182 put every `gh` process start behind one allowlist in `deck/host.mjs` and named a second host as a later ticket. That ticket is this one: a user whose repositories are on GitLab, or on a bare remote with no forge, could not run the pilot past its first PR step, because every caller still spoke `gh` argv.

## Decision

- **L1 Host takes verbs, not argv**: `whoami`, `reviews`, `review`, `open`, `edit`, `comment`, `upsertComment`, `signedIn`, with `name` and `cli`. Each adapter (`deck/host-github.mjs`, `deck/host-gitlab.mjs`) is the one module that starts its CLI.
- **L2 One reader, `hostOf(git)`**, validates the value against `HOST_NAMES`; a bad value stops the command naming `pilot.host`. `pilot host` refuses any other name before git is called, and writes the list's own string, so nothing off `HOST_NAMES` reaches git's argv.
- **L3 `pilot.host` is git config**: the install asks for it and writes it `--global` with `pilot host <name>`; a repository may override it with `--local`; `pilot uninstall --yes` unsets the global key and leaves a repository's; unset reads as `github`, so an install from before this decision behaves as it did.
- **L4 The pilot never touches a host token**: each CLI keeps its own login (`gh auth`, `glab auth`); adapters inherit the environment and `signedIn()` reads only the CLI's exit status.

## Rejected

- *Per-host argv translation under the old allowlist* (L1): every caller would still speak `gh`.
- *Reading the host from the origin URL* (L2): a mirror or a self-hosted forge would switch host silently.
- *A setting in the deck's store or a pilot config file* (L3): git config already has global and per-repository scopes, and every script already runs git.
- *A token in the deck store or config* (L4).

## Consequences

- This amends ADR 0182: `deck/host.mjs` is now the host abstraction, and `assertHostVerb` stays the GitHub adapter's fail-closed guard, moved, not loosened.
- Install asks a fifth question and writes one key to the user's global git config; uninstall takes it back out.
- At `none`, `hostFor` returns null, no host CLI starts, and a feature lands as a branch the user merges by hand.
