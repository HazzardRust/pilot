---
status: accepted
date: 2026-09-28
tags: [deck]
supersedes: []
superseded_by: []
paths: [docs/design/usage-telemetry/architecture.md, deck/store.mjs]
---
# A closing report is data in the deck store only

A run's closing report was Markdown in a deck item, so the audit could not read what earlier runs had found costly. The user asked to "schematise the end of ticket review". Asked where that data should live, they chose the deck's store over the repository (itm_0c7bbb6f700e, 2026-09-28; L10, L11 of `docs/design/usage-telemetry/architecture.md`). So we decided a closing report is one validated field, `report`, of the run record, sent by the pilot in the `deck_status` call that sets `finished`, and read by the audit from the store.

- **`report` holds** the feature PR with its state and merge SHA, each slice PR and merge SHA, the assumed decisions, the friction rows, the human steps left and the worktrees left. Kept and dropped findings stay in the record's `findings`.
- **The audit reads the store** through a read-only `recordsFor(repo)`, the first import of `deck/store.mjs` from outside the daemon.
- **The Markdown item stays**; it is what the user reads.

Rejected:
- The repository's `run.json`, committed before the merge: it survives losing the machine and travels with a clone, but cannot hold the feature's own merge SHA and needs the report final before the merge. This was the pilot's recommendation.
- A second file beside `run.json`: the record is already the run's durable state (ADR 0028).

**Consequences**:
- An audit on another machine, or on a fresh clone, has no closing reports.
- `deck.records` is never pruned and stays uncapped, because a cap would drop the reports this keeps.
- The four closing reports posted before this are not converted.
