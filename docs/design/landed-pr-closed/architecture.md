# A landing leaves no draft PR behind

Feature `landed-pr-closed` · ticket `itm_8ae644730463` · base `hazzardrust-pilot` at `e634fdd8` · supersedes ADR 0200's
cutting rule (each run its own PR to main) and amends ADR 0218 L2

## Overview

- **Also**: the flaky green-tree reuse test is fixed.
- **What changes**: Every run is cut from your pilot branch again, and main receives features only through the one release PR. When a run that was cut from main lands, its PR is now moved onto your pilot branch first, so the landing merges it and does not leave it behind.
- **Why**: Two shapes were running side by side. #149 (portable-store, cut from main) stayed open as a draft after its landing, while its commits also rode release PR #167 to main.
- **What you'll notice**: After a landing, no draft PR is left open. `pilot base` names your pilot branch. A gate1 shows a `Base:` line. A run record can no longer be given base `main`.
- **Can it be undone**: Yes, by reverting the feature PR. No record or PR is rewritten; old `main` records still land.

## 1. Problem

The user found #149 (`feat/portable-store` → main) still open and draft after its landing at `e634fdd8`, with its commits
also in release PR #167. "There should be no drafts." The question is how this happened, and whether it can happen again.

## 2. Spec

| # | Behaviour | Evidence and bar |
| --- | --- | --- |
| 1 | A landing whose run has an open own-repo PR on a base other than the pilot branch moves that PR to the pilot branch before the pilot push. The push then merges it, and the landing ends on the release PR line like every other landing. practitioner: a release engineer, for whom a PR list that tells the truth is the release ledger | Land test on a scratch bare remote with a fake `gh`, a record base `main` and an open PR base main: 1 `pr edit --base <pilot>` before the pilot push, the output line `retarget #<n> to <pilot>`, then `main gets pilot: #<m>`; the edit is made while origin's pilot is still the pre-landing tip; `comment` polls that PR for merged |
| 2 | `pilot base` prints the pilot branch for an unchained run on origin with a host. | `base-main.test.mjs`: `base <name> <sha>`, never `base main`; 0 of 4 paths print the default branch |
| 3 | The deck refuses a run record write that sets `base` to anything but the pilot branch, the legacy `pilot` or `feat/<slug>`. A record that already holds `main` still reads, and still lands through spec 1. | deck test: `base: "main"` refused 1 of 1, naming the allowed forms; a stored `main` record reads back unchanged and its landing passes spec 1's test |
| 4 | A gate1 carries a `Base: <base>` line matching its ticket's run record, so the user sees at Gate 1 what the run was cut from. | deck test: a gate1 with no `Base:` line is refused 1 of 1; one naming another base is refused; a matching one is accepted |
| 5 | The crew and the docs describe one shape: runs are cut from the pilot branch, and main gets them through the release PR. | `git grep -n "own PR to main\|feature PR: #" agents docs/OPERATING.md`: 0 hits outside legacy wording; ADR 0200 `superseded_by` names this run's ADR |
| 6 | `scripts/test/test-ledger.test.mjs` "pilot test reuses a green tree" is deterministic: its changed-tree step cannot be read as unchanged. (merged ticket itm_f9cbce1dd9ea) | The test run 200 times in a loop on CI's OS: 200 passes; before the change the same loop fails at least once, or S5 says the cause was something else and shows it |
| 7 | The other 3 Gate failures of the last 60 runs are each named with their cause, and any that is a flaky test is fixed here. | A table: run id, failing test, cause, fixed or not-a-flake; 3 rows |

Draft line 3 (why portable-store got base `main`) is answered in §3 F1-F3. It needs no slice. The draft's lines 1-2 are
sharpened into 1-4 here. Line 5 follows from them.

## 3. Findings

- **F1 main-cut is the designed path, not a defect.** `scripts/base.mjs:113-120` prints the default branch for an
  unchained run on origin with a host (audit-f14 L9). ADR 0200 makes that the only path for new runs, and ADR 0218 L2 reaffirms
  it, rejecting "cutting every run from the pilot branch". `agents/pilot.md:182` says "Every run is cut from what `pilot base` prints".
  portable-store followed that rule: #149 was opened on 11-23 against main, and `run.json:6` reads `"base": "main"`.
- **F2 the pilot mostly does not follow it.** 21 of the 25 run records since 11-21 have base `pilot` or `hazzardrust-pilot`
  (grep of `"base"` over `docs/design/*/run.json`, dated with `git log -1 --format=%cs`). This run is one of them, by the pilot's
  own call (A4). As a result ADR 0200's A3 cutover never finishes. The release PR lives on, and the user merges it
  (`gh pr list --base main`: #162, #163 and #164 merged, #167 open; the last per-feature merges were #140 and #146 on 11-22). A main-cut feature
  therefore reaches main twice.
- **F3 why the draft stays.** Under ADR 0167, feature PRs targeted pilot, so ADR 0139's ready press at the landing was dropped.
  ADR 0200 never put it back: there is no `ready` call in `scripts/` or `deck/`, and `deck/host-github.mjs` allows
  only `pr create|edit|comment|view|list`. `feature-pr.mjs:199` opens every PR `draft: true`. #145 (main-cut) reads MERGED with draft=true,
  because GitHub marked it merged once a release PR carried its tip.
- **F4 the landing.** `scripts/land.mjs:269-271` computes `legacy` from the record base (`isPilotBase`). `:314-315` returns early
  for a non-legacy run with `featurePr`/`featureLine` (`:338-360`): no release PR, no retarget. `comment` (`:449-461`) polls
  only a PR whose base is the pilot branch for reading merged, and closes nothing. `retarget` (`:386-407`) already
  moves chained PRs with `host.edit`.
- **F5 main is stale.** `origin/main..origin/hazzardrust-pilot` is 175 commits. A main-cut run builds on code that pilot has moved past.
- **F6 the base write.** `RUN_BASE` (`deck/runs.mjs:260`) accepts any branch name (audit-f14 A7). It is checked on the incoming
  field only (`:426-429`), so tightening it leaves stored records alone.
- **F7 gate1 checks.** `deck/store-items.mjs:167` collects gate1 gaps from `deck/gate2-evidence.mjs` (`recutGate1Gaps`,
  `surfaceGate1Gaps`). A base gap fits beside them, reading `deck.records` the way `ownBranchGaps` (`:126`) does.
- **F8 the flake.** Gate run 46137559499 (pull_request, `e634fdd8`) failed at `test-ledger.test.mjs:132` (`a changed tree runs: 'x' !== 'xx'`), while the push run of the same sha passed, and attempt 2 passed. Suspected, not reproduced: `worktreeTree` (`scripts/test-ledger.mjs:53-56`) copies the index with `copyFileSync`, which gives the copy a new mtime. Git's racy-entry check compares a file's mtime against the index's own, so a same-size rewrite of `a.txt` in the same second as the first run reads as clean to `git add -A`. S5 confirms or rejects this.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `scripts/land.mjs` | `land`, `retargetOwn` | the main-cut branch of the landing (`featurePr`, `featureLine`, the early return) deleted; one retarget before the push | true external (the host) behind `deck/host.mjs` |
| `scripts/base.mjs` | `base` | which ref a run is cut from | local-substitutable (git) |
| `deck/runs.mjs` | `RUN_BASE`, the record write | the allowed base forms | in-process |
| `deck/gate2-evidence.mjs` | `baseGate1Gaps` | the gate1's base line against the record | in-process |
| `scripts/test-ledger.mjs` | `worktreeTree` | how the worktree's tree is read | local-substitutable (git) |

Deletion test: `featurePr` and `featureLine` exist only for the main-cut return. Once every landing takes the release path,
deleting them removes complexity rather than moving it, so they go in S1. `restack`, `prBase`'s main and `feat/` arms, and
closing-report's `FEATURE_LINE` parse still serve any main PR left open. They stay (A5). No fold-only slice is needed.

## 4. Ubiquitous language

- **one line**: every run is cut from and lands on the pilot branch, and main gets them through the release PR.
- **main-cut record**: a run record whose base is the default branch, written before this run.
- **own PR**: the open PR from this repository whose head is the landing's `feat/<slug>`.
- **retarget**: `host.edit(n, { base: <pilot branch> })`.

## 5. Locked decisions

- **L1** Grilling depth is forks (the user's, itm_97bc4bdf8de5). Only questions whose paths give materially different deliverables go to the user.
- **L2** The retarget happens before the pilot push, never after. A push onto a base that already holds the head is the merge GitHub reads, which is how legacy PRs read merged today (`comment`'s poll). Rejected: retarget after the push, since whether GitHub accepts a base edit to a branch already holding the head is unverified.
- **L3** No migration. Stored `main` records stay as written (F6) and land through spec 1. Rejected: rewriting records, which races the deck's status writes (audit-f14 L6).
- **L4** The base refusal checks the incoming field only, at `deck/runs.mjs:426-429`. Rejected: refusing at read, which would break history.
- **L5** This run's ADR is `docs/adr/NNNN-landed-pr-closed.md` (ADR NNNN). It supersedes ADR 0200's cutting and landing-line rules, and amends ADR 0218 L2 and ADR 0139 (no ready press: a PR merged by push needs none).

## 6. Assumed decisions

- **A1** *assumed*, answered by the user on itm_0a129aaf2c8a: "One line: release PR only (default)", the default taken: one line. Every run is cut from the pilot branch, and main gets it through the release PR. Trade: a feature no longer shows on main as its own PR (ADR 0200's SOP). Rejected path: per-feature PRs. That would force runs onto main, add a `ready` host verb (an allowlist change) for the landing, retire the release PR, and build every run on a main 175 commits stale (F5).
- **A2** *assumed*: retarget, not close. Trade: the PR reads merged into the pilot branch rather than closed with a comment. Rejected: `gh pr close`, a new host verb the allowlist lacks.
- **A3** *assumed*: refuse plus show. The deck refuses a new `main` base (spec 3), and the gate1 shows the base (spec 4). Trade: about 40 lines more than showing alone. Rejected: show only, which leaves the drift F2 measured free to recur.
- **A4** *assumed* (the pilot's call, not the user's): this run is cut from `origin/hazzardrust-pilot`, because a session-start notice said the checkout was behind it. If A1 goes to per-feature PRs, `design/landed-pr-closed` is re-cut from main.
- **A5** *assumed*: the remaining main-cut machinery stays for a follow-up ticket. That is `pilot restack`'s retarget, rebase and merge-forward, `prBase`'s main and `feat/` arms, closing-report's `FEATURE_LINE`, and the main path in `deck/lineage.mjs`. It serves no open PR today (`gh pr list --base main --state open`: only #167). Rejected: deleting it here, which adds about 300 changed lines across 4 more files.
- red team: S1 alone would be undone by `feature-pr.mjs:184-189`, which re-edits a PR's base to `prBase(record.base)` on every status write. Between the retarget and the push there is no status write, because the landing is one process. After the push the PR reads merged, and an edit to a merged PR's base is refused by the host and caught by `syncFeaturePr`'s step. Recorded in S1's Misses.
- red team: spec 3's refusal was checked against `deck/test/lineage-base.test.mjs`, which passes `base: 'main'` to `assertOnPilotTip` and never writes a record, so it stands. Any test seeding a `main` record through `deck_status` turns red in S2's gate; S2 seeds main-cut records by file, as `land-feature-line.test.mjs:18-24` does.
- red team: spec 1's "0 open PRs" cannot be read from a fake `gh`, which never turns a PR merged. The bar is the order instead: the `pr edit --base` call lands while origin's pilot is still the pre-landing tip. The merged read on a real host is QA's.

## 7. Out of scope

- Removing restack, prBase arms, FEATURE_LINE and lineage's main path (A5).
- Any ready press, or a `gh pr close` verb.

## 8. Slices

Width 5; longest stem 1

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | A main-cut run's landing merges its own PR (walking skeleton) | 1 | `scripts/land.mjs`, `scripts/test/land-feature-line.test.mjs` | – | `pilot:typescript-reviewer` | [S1](slices/S1.md) |
| S2 | Every run is cut from the pilot branch | 2, 3 | `scripts/base.mjs`, `scripts/test/base-main.test.mjs`, `deck/runs.mjs`, `deck/test/run-base.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |
| S3 | A gate1 shows the run's base | 4 | `deck/gate2-evidence.mjs`, `deck/store-items.mjs`, `deck/test/base-gaps.test.mjs` (new), `agents/pilot-architect.md` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S3](slices/S3.md) |
| S4 | The crew and docs say one line | 5 | `docs/adr/NNNN-landed-pr-closed.md` (new), `docs/adr/0200-stacked-feature-prs.md`, `docs/adr/README.md`, `agents/pilot.md`, `agents/pilot-lander.md`, `docs/OPERATING.md` | – | `pilot:security-reviewer` | [S4](slices/S4.md) |
| S5 | The gate stops failing on the green-tree reuse test | 6, 7 | `scripts/test/test-ledger.test.mjs`, `scripts/test-ledger.mjs` (if the cause is there) | – | `pilot:typescript-reviewer` | [S5](slices/S5.md) |

## 9. Acceptance evidence

1. `pilot base` in this repo prints `base hazzardrust-pilot <sha>` (spec 2).
2. `deck_status` with `base: "main"` on a scratch ticket is refused, naming the allowed forms (spec 3).
3. A gate1 without `Base:` is refused, and one with it is accepted (spec 4).
4. The scratch-remote landing test shows `retarget #<n> to <pilot>` before the push, `main gets pilot: #<m>`, and 0 open PRs with that head (spec 1).
5. S5's loop: 200 of 200 passes, and its table names the other 3 Gate failures (spec 6, 7).
6. The grep in spec 5 shows 0 stale hits, and `npm run test:quiet` is green.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | `slice/landed-pr-closed-s1` | – | – | – | 1 |
| S2 | planned | `slice/landed-pr-closed-s2` | – | – | – | 2, 3 |
| S3 | planned | `slice/landed-pr-closed-s3` | – | – | – | 4 |
| S4 | planned | `slice/landed-pr-closed-s4` | – | – | – | 5 |
| S5 | planned | `slice/landed-pr-closed-s5` | – | – | – | 6, 7 |
| landed-pr-closed | planned | `feat/landed-pr-closed` | – | – | S1-S5 | 1-7 |
