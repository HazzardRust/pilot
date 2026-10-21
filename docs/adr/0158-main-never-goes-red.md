---
status: proposed
date: 2026-10-17
tags: [gate, ci, ledgers, trivial-work]
supersedes: []
superseded_by: []
paths: [scripts/gate.mjs, .github/workflows/gate.yml, agents/pilot.md]
---
# Main never goes red

We decided that the gate rebuilds the ledgers and fails when one moved, that CI runs the full gate on PRs to `main`, and that the pilot's trivial work gates in full once and stays a `--draft` until the user's Sign off.

## Context

#685 was trivial work: no architect and no slices. It edited two rule files, never ran the full gate, and was opened ready rather than as a draft. GitHub showed no check, so the PR looked green and the user merged it. Main went red on four ledger tests, `scripts/shipped-rules.json` and `VENDOR.md` being stale, and #699 repaired it. The user wanted the fix in code, not in a reminder.

## Decision

- **The gate rebuilds the ledgers** (spec 1; L1, L2): `npm test` first writes `scripts/shipped-rules.json` and `VENDOR.md` in place, prints `ledger stale: <path>, rebuilt; commit it` for each that moved and exits 1 before the suite; on a current tree it prints `ledgers current`. The step is an injected `ledgers` dependency of `runGate` that only the entry point passes, so no test writes the real repository's ledgers.
- **CI runs the full gate on PRs to `main`** (spec 2; L4, L8): `.github/workflows/gate.yml` runs `npm ci`, `npm test`, `check-references` and `check-provenance` on `ubuntu-latest`, on non-draft PRs to `main` and pushes to `main`, through `pull_request` with a read-only token and no secret. The check shows on the PR and cannot block a merge (L5).
- **Trivial work gates in full and stays a draft** (spec 3; L6): one sentence under "The shape of a run" in `agents/pilot.md`: one PR to the default branch, the full gate once on its final state with its pass and fail lines in the body, opened `--draft`, and marked ready only on the user's Sign off.

## Rejected

- *A `--check`-only ledger step* (L1): it leaves the user to run the builder.
- *Comparing the ledgers against `HEAD`* (L1): every gate run before a commit would fail.
- *Defaulting `runGate` to the real ledger step* (L2): fixtures would write the real ledgers.
- *`pull_request_target`* (L4): it runs with a write token and the secrets beside a fork's code.
- *Windows runners and every PR event* (L8): about 30 billed minutes a run spends the free 2,000 in days.
- *Editing `rules/vertical-execution.md`* (L6): the global trivial-work line outside the pilot is out of scope.
