---
status: superseded
date: 2026-10-13
tags: [deck, gates, integrate]
supersedes: []
superseded_by: [0167]
paths: [deck/gate2-base.mjs, deck/server-tools.mjs, scripts/integrate.mjs, scripts/merge-generated.mjs, docs/design/gate-no-stall/architecture.md]
---
# A gate2 holds the default branch

We decided that the deck refuses a `gate2` whose `sha` does not hold `origin/<default>`'s tip, naming `pilot integrate --default`, and that this command merges the default branch into `feat/<slug>` before the gate, resolving a prompt-pin conflict in `scripts/test/measure-prompt.test.mjs` by measuring, running the gate, pushing and printing `mergeable: MERGEABLE at <sha>`, the sha the gate2 then names.

## Context

A feature that lands on `pilot` before its gate2 never takes `main` after its cut, so #576 and an earlier PR each reached their gate2 with two merge bases and a pin conflict, and the user signed a sha that could not merge.

## Decision

- The check is local git in the tool layer, `holdsDefault` before a gate2 `postItem`; no `gh`, no network in the daemon's post path (L7); it reads `origin/<default>` as last fetched (A5).
- `pilot integrate --default` is the fixer, beside the base-taking it already does, so the existing allow rule covers it and no new command is learnt (L8).
- A pin conflict resolves to the measured value, even when it rises, with a dated comment naming the merge (A3).
- The merge runs before the gate2, not inside `pilot landing`, so the gate2 names the sha the user signs (A2).

## Rejected

- *Doing the merge in `pilot landing`*: it runs after the Sign off, so the user would have signed another sha.
- *Fetching in the post path*: network in the daemon.
- *Stopping on a pin conflict and handing it to the pilot*: a measured number is the pin's only correct value.
