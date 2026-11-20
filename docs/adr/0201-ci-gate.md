---
status: proposed
date: 2026-11-20
tags: [ci, host, land, integrate, gate2, ci-gate]
supersedes: []
superseded_by: []
paths: [scripts/checks.mjs, deck/gate2-checks.mjs, deck/host.mjs, deck/host-github.mjs, deck/host-gitlab.mjs, docs/design/ci-gate/architecture.md]
---
# The host's CI is a gate at every step

We decided that every step that moves work reads the host's checks on one full commit sha through one reader,
`checksAt` in `scripts/checks.mjs`, and that land and a gate2 pass green only, failing closed on red, pending and
a host that cannot be read.

## Context

PRs were opened and landed on `pilot` while the Gate workflow was red: every step trusted the local suite, and no
code read the host's checks. Read live on 2026-11-20, PR #121's head `5fef2ab` had three `failure` check runs.

## Decision

- **L1** One reader by commit sha: every step calls `checksAt` on a full sha, never `gh pr checks` or a branch.
- **L2** GitHub reads `repos/{owner}/{repo}/commits/<sha>/check-runs?filter=latest&per_page=100`, one fixed GET in
  the `gh` allowlist, the sha checked full hex.
- **L3** Red if any run failed (failure, cancelled, timed_out, action_required, stale); else pending if any is not
  completed; else green at one or more; none at zero; unread when the host throws or answers off the shape. Red
  wins over pending. Neutral and skipped pass.
- **L4** Land and gate2 pass green only, none only where CI is not configured (noted); integrate refuses red only
  and says nothing otherwise, since the co-pilot's `--wait` reads pending and land is the hard gate; base only
  reports.
- **L5** Land reads HEAD after `catchUp` and before `commitRecords`.
- **L6** The daemon starts no host CLI: a gate2's `checks` field is QA's line, checked for shape, sha and CI
  configured locally in `deck/gate2-checks.mjs`; land's own read is the enforcement.
- **L7** Gate runs on push to `pilot`, so a base tip has checks to read.
- **L8** Verdict and gate logic is tested pure over fake runs, 0 spawns; one fixture test each for land,
  integrate and base.
- **L9** Nothing a Gate 1 sign-off needs lives only in a slice file.
- **L10** Land and gate2 refuse pending; the lander and co-pilot wait with `pilot checks --wait`.
- **L11** No override path: red is fixed or rerun on the host.
- **L12** No host protection on `pilot` (spec line 5 dropped): the tools enforce, and spec lines 1, 3 and 4 hold.
- **L13** Grilled at depth "every" (the user, `itm_01944e4474fe`).

## Alternatives rejected

- Per-PR reads (`gh pr checks`): `pilot base` has no PR, and a PR's base moves (L1).
- Any GET under `repos/`: widens the allowlist (L2).
- Land polling inside its 30 min child (L10); a user-only `Land over red` reply (L11); landing by host merge (L12).

## Consequences

- A run.json-only commit takes its parent's checks (L5).
- A press after a late push is refused once; the lander waits and presses again (L10).
- The flaky idle-wake test blocks landings after 10:20 UTC until ci-green lands (L11).
