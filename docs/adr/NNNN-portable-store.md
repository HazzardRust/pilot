---
status: proposed
date: 2026-11-25
tags: [deck, store, operating]
supersedes: []
superseded_by: []
paths: [deck/store-codec.mjs, deck/machine.mjs, deck/store-bundle.mjs, deck/store-move.mjs, deck/store-gone.mjs, deck/exported.mjs, docs/OPERATING.md]
---
# The deck's store is portable: exportable by hand, never synced

We decided that the store holds no machine-bound path or process state, so `pilot store export` and `pilot store import` move it between devices by hand. Nothing syncs it. This amends ADR 0207's "No store sync" bullet.

## Context

ADR 0207 kept the two devices apart: each deck's tickets, threads and run records stay on that device, because the store held absolute paths and live process state that mean nothing on another machine. Moving to a new device then meant starting from an empty deck. Once the store keeps only portable data, the move is a file the user carries, and the open question is only how much of it to automate.

## Decision

- **L1** The codec sits at the persistence seam: in memory the deck keeps absolute paths and folded keys; only `deck.json`, month archives and audit directory names hold stored paths.
- **L2** A stored path is the string `@<root>/<rel>`. Default roots (`home`, one per drive or `/`) are derived, never stored; only `--root` overrides are.
- **L3** Machine-bound state (run sessions, pids, leases, lane switches, a landing's pid, root overrides) lives in `machine.json`, never in `deck.json`.
- **L4** The bundle is one gzipped JSON document `{ manifest, entries }`. Entry names are held to an allowlist, so a traversal cannot be expressed.
- **L5** Import trusts nothing it did not write: every check runs before the first write, which is staged then renamed. `--replace` sets the old files aside, never over them.
- **L6** Store version 4 is one-way like version 3; `deck.v3-<date>.json` is the way back.
- **L7** Export reads the files as they are and needs no daemon; import refuses while one serves. The export mark is its own file, `exported.json`.
- **L8** Nothing runs export or import on its own: no timer, watcher or hook. The user moves the store by hand; sync of any kind, and merging two stores, stay out.

## Rejected

- **Sync, scheduled or on change.** Two decks writing one queue is the failure ADR 0207's owner rule exists to avoid, and a timer would run it unattended.
- **Committing the store to git.** Tickets, chats and run records are private to the device that made them, and the repository is public.
- **Merging two stores on import.** There is no rule for two queues that is not a guess; `--replace` and a fresh import are the two outcomes.
- **Rewriting every reader to carry root-relative paths.** A wide diff, each reader a migration risk, where one codec at the seam does the same.
