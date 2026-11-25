---
status: proposed
date: 2026-11-23
tags: [gate, landing, tests, ci, security]
supersedes: []
superseded_by: []
paths: [scripts/land.mjs, scripts/select-tests.mjs, scripts/checks.mjs]
---
# The landing trusts a tree green CI proved

We decided that `pilot land` runs only the tests that differ from a tree green CI proved on the landing's exact tip, and the full suite when there is no such proof. This amends ADR 0166 L4 and L8.

## Context

ADR 0166 made the landing the one full run of the suite per feature. That run is also what times a landing out: on a shared Windows machine it queues behind other runs' gates, while CI has already run the whole suite on three OSes against the feature PR. A `pull_request` run tests GitHub's merge commit, not the head commit, and the landing's own merge renumbers the ADR and adds the run record, so the tree CI tested and the tree the landing tests are almost never equal. A diff between them, with the selection run over it, closes that gap.

## Decision

- **L1** After `checksGate` passes, `land` asks `provenTree` (cheap-suite A2) for the tree at least three `gate (<os>)` jobs, all green, tested on the caught-up tip. Its line, `ci proved <tree7> on <n> jobs` or `no ci proof: <why>`, is in land's output.
- **L2** With a tree, the feature merge passes `mergeIntoPilot` `since: <tree>` (amends ADR 0166 L8), so `npm run test:changed -- --since=<tree>` runs. With none, no `since` is passed and `npm test` runs in full, as before.
- **L3** `selectTests` takes a `since` that names a tree and diffs it as it is against the working tree, untracked files included, with no merge-base: a tree has no history. A commit keeps ADR 0166 L6's merge-base rule. Anything that resolves to neither runs in full, saying `cannot resolve`.
- **L4** Past a proved tree, a change under `.github/` or to a `FULL_TRIGGERS` file runs in full. That includes a change landed on `pilot` after the feature branched, which `provenTree`'s `base...sha` check cannot see. The run that proved the tree is the one such a change alters.
- **L5** When a proved landing posts its comment on the feature PR, the comment reads `; ci proved <tree7> on <n> jobs, then <counts>`, not `full suite`.

## Rejected

- *Always the full suite, made fast* (A2): about 10 to 12 minutes even when made fast, and it still queues behind other gates.
- *Trusting the head commit's checks with no tree diff*: CI tested the merge commit, and `pilot` may hold changes `main` did not.
- *A merge-base for a tree `since`*: a tree has no history to take one from.

## Consequences

- A landing whose tip CI proved runs only what differs from the proved tree, and says so in its output and on its PR.
- **Misses**: a test the selection does not reach for a file the delta changed (no import, no basename mention), the environment of this machine for unchanged areas, and a test that prints a forged `tested-tree` annotation in its own job. CI's next push run on `pilot` is the backstop.
- No proof, an unreadable host or an unresolvable tree all fall back to the full suite, never to a smaller one.
