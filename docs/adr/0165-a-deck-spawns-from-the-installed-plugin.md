---
status: proposed
date: 2026-10-20
tags: [deck, daemon, lifecycle, upgrade]
supersedes: []
superseded_by: []
paths: [deck/spawn-root.mjs, deck/client.mjs, deck/test/spawn-root.test.mjs, docs/adr/0156-a-session-replaces-an-older-deck.md, docs/design/deck-spawn-root/architecture.md]
---
# A deck on the deck port spawns only from the installed plugin

We decided that a client starting the deck on port 4321 spawns `deck/daemon.mjs` from the installed plugin root, never from the checkout it runs from; that a checkout whose installed root cannot be found starts no deck; and that "older", in ADR 0156's replace rule, is measured against the version of the root the client would spawn, not the client's own package.json.

## Context

Every client spawned the `deck/daemon.mjs` beside its own module. A session opened in a worktree on a feature branch therefore started the machine's one shared deck from that worktree, and a branch with a newer package.json replaced the installed deck with itself through ADR 0156's exit route. The user's deck then ran whatever branch last started a session, and died or broke when that worktree was pruned. A checkout is told from an installed copy by `.git` in its root (a directory in a clone, a file in a worktree); installed copies under `~/.claude/plugins/cache` have none.

## Decision

- `deck/spawn-root.mjs` `spawnRoot({ ownRoot, port, env?, lookup? })` is the one place the rule is decided (L2). On a port other than 4321 it answers `ownRoot`, so tests and scratch decks keep their own checkout (L4). An `ownRoot` without `.git` is answered as itself with no call to `claude`. A checkout on 4321 asks `lookup`, by default `bin/launcher.mjs` `pluginRoot`, and reads that root's `package.json` version.
- When the lookup fails, `spawnRoot` throws naming why and `pilot deck --from <dir>`; it never answers `ownRoot` (L3). `ensureDaemon` prints that as one stderr line and spawns nothing.
- `ensureDaemon` resolves the root only when no deck answers or the deck is older than the client, so a join to a current deck never asks `claude`. It replaces a deck only when that deck is older than the root's version, and the exit request carries the root's version. This amends ADR 0156's "older than its own plugin".

## Rejected

- *Falling back to the checkout when the lookup fails*: that is the incident.
- *Inline in `ensureDaemon`*: `pilot deck --from` needs the same rule.
- *Tests set `PILOT_PLUGIN_ROOT` instead of a port rule*: it edits every daemon test and the variable leaks into sessions.
- *Asking `claude plugin list` on every spawn instead of the `.git` test*: 1-30 s per start, and an installed copy needs no answer.

## Consequences

- A branch of a newer version leaves an installed deck alone: a 0.9.4 checkout finding an installed 0.9.2 deck keeps it, with no exit request.
- A deck change on a branch reaches 4321 only after `claude plugin update`, or by `pilot deck --from <dir>`.
- A non-git copy outside the plugin cache counts as installed and spawns its own root.
- A checkout client on a machine where `claude` is missing starts no deck on 4321 and says so.
