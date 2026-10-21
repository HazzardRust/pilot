# main-never-red: the gate rebuilds the ledgers, CI runs it on every PR to main

Ticket `itm_d45883c51639`. Merge thread `itm_bd24011aed33`: merged none. The user agreed the spec on `itm_9b5a7ff2c339` and answered A1 (`itm_a8a3c9e3fd16`) and A2 (`itm_77a8fafa927d`) at their defaults, then overrode both on cost (`itm_c0eba1fff954`, L8).

## 1. Problem

#685 was trivial work: no architect and no slices. It edited two rule files, never ran the full gate, and was opened ready rather than as a draft. GitHub showed no check, so the PR looked green, and the user merged it. Main went red on four ledger tests (`scripts/shipped-rules.json` and `VENDOR.md` were stale), and #699 repairs that. The user wants the fix in code:

- the gate itself rebuilds the ledgers and fails when one moves;
- CI runs the full gate on every PR to main;
- the pilot's trivial-work path gates in full once and stays a draft until the user's Sign off.

## 2. Spec

| # | Behaviour | Evidence |
|---|---|---|
| 1 | `npm test` (and `test:quiet` and `coverage`, which share `scripts/gate.mjs`) first rebuilds `scripts/shipped-rules.json` and `VENDOR.md` in place. When either changed, it prints `ledger stale: <path>, rebuilt; commit it` once per file and exits 1 before the suite starts. On a current tree it prints `ledgers current` and runs the suite as before. A shallow clone or a missing `git` is red, with the reason. | A `rebuildLedgers` test on a temp git repo with an edited rule reads `['scripts/shipped-rules.json']`. A `runGate` test with a stale `ledgers` reads exit 1 and no suite spawned. Live: edit a rule in a worktree, run `npm test`, read the line within seconds. A clean tree passes with the base's pass count plus the new tests. |
| 2 | `.github/workflows/gate.yml` runs `npm ci`, `npm test`, `node scripts/check-references.mjs` and `node scripts/check-provenance.mjs agents/ skills/ rules/` on non-draft PRs to `main` (L8) and on every push to `main`, using `GITHUB_TOKEN` read-only and no secret. | The workflow file and its pin test. `gh pr checks` on this run's feature PR shows `gate`. After the merge, `gh run list --branch main --workflow gate.yml` shows a push run. |
| 3 | `agents/pilot.md` holds the trivial-work rule: one PR to the default branch, the full gate once on its final state with the gate's pass and fail lines in the body, opened `--draft`, and marked ready only on the user's Sign off. The prompt pin moves by the measured cost, and an ADR records the three rules. | A wording pin on `agents/pilot.md`. The ADR's row is in `docs/adr/README.md`. `check-references` passes. |

The user agreed this spec as written (`itm_9b5a7ff2c339`). Line 2 cannot mean blocking a merge (F4).

## 3. Findings

- **F1. The ledger tests exist and are right.** `scripts/test/install.test.mjs:336` ("every current rules file's hash is in the ledger") runs `build-rules-ledger.mjs --check`. `:418` and `:452` pin `VENDOR.md`. #685 failed none of its own gate; it never ran the suite. Its body says "the pilot made the edit and verified it" through seven targeted test files.
- **F2. Neither builder is a gate step.** `scripts/build-rules-ledger.mjs` binds `ROOT` to its own location and keeps `buildRulesLedger()` module-private (unimported-exports L1). It walks `git log` over `rules/` (127 commits, about 3 s) and refuses a shallow clone. `scripts/build-vendor-ledger.mjs` already exports `buildLedger(root)` and `checkLedger(root)`, and runs in about 0.1 s.
- **F3. The gate.** `scripts/gate.mjs` `runGate(args, deps)` takes a slot, runs `node --test` with width `min(4, cores/2)`, and runs the census and the spawn ceiling. All of its dependencies are injected, and its tests call it with `cwd: 'C:/scratch'` (`scripts/test/gate.test.mjs:64`). The entry point runs `missingInstall` and then `runGate(argv)`.
- **F4. GitHub.** The repo is **private**, and `GET branches/main/protection` returns 403 ("Upgrade to GitHub Pro or make this repository public"). A check therefore cannot be made required: it shows on the PR but does not stop a merge. `.github/workflows/claude.yml` triggers on `issue_comment` and `pull_request_review_comment` only, so the new workflow shares none of its triggers. Main took 35 merged PRs in the last 7 days. Feature PRs target `main` and are drafts from Gate 1 (`agents/pilot.md:182`, `:354`).
- **F5. The pilot has no trivial-work rule.** `grep -i trivial agents/pilot*.md` finds nothing. The path #685 took borrowed `rules/vertical-execution.md:99` ("Trivial work collapses to implement, review, commit"), which names neither the gate nor the draft. `agents/pilot.md:178` "The shape of a run" is where PR shape is stated.
- **F6. Pins and guards.** The pilot's prompt pin is in `scripts/test/measure-prompt.test.mjs` (one dated comment per move; the last is 11035.75). The vocabulary guard's `EXCEPTIONS` are in `scripts/vocabulary.mjs:20`. ADR 0153 is taken by blocked-yellow-yields (now on `pilot`), so this run takes 0154 unless another lands first.
- **F7. Platform.** The process census reads the process table through PowerShell on win32 (`deck/procs.mjs:56`). `SPAWN_CEILING` was measured on Windows with Node 26.1, and the local machine has 12 cores (suite width 4). A 2-core runner gives width 1.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| `scripts/build-rules-ledger.mjs` | `rulesLedgerText(root): string` | the `ROOT`-bound history walk and `render`; `main` writes and `--check`s through it | Local-substitutable (git on a temp repo) |
| `scripts/ledgers.mjs` (new) | `rebuildLedgers(root): string[]` | both builders' build-compare-write, which before lived only in each script's `main` | Local-substitutable (fs and git on a temp repo) |
| `scripts/gate.mjs` | `runGate(args, { ledgers, ...deps }): number` | the ledger step, before the slot | In-process (injected) |
| `.github/workflows/gate.yml` (new) | triggers, `permissions`, job `gate`, its four run steps | – | True external (GitHub Actions), pinned by text |
| `agents/pilot.md` | the "Trivial work" sentence in "The shape of a run" | – | Prose, pinned by wording |

Deletion test: `rebuildLedgers` earns its place. Without it, the gate would need to know two scripts' `ROOT`, render and write rules. `checkLedger` stays, because `--check` and `install.test` use it.

## 4. Ubiquitous language

- **Ledger**: one of the two generated files, `scripts/shipped-rules.json` and `VENDOR.md`.
- **Ledger step**: the gate's rebuild of both ledgers before it takes a slot.
- **Gate**: `scripts/gate.mjs` (`npm test`). The **full gate** is that plus `check-references` and `check-provenance`.
- **CI gate**: the `gate` job in `.github/workflows/gate.yml`, read through `gh pr checks`.
- **Trivial work**: a change the pilot makes as one PR to the default branch, with no architect and no slices.

## 5. Locked decisions

- **L1. Rebuild in place, then fail fast.** The ledger step writes both ledgers. If either moved, the gate exits 1 before the slot and the suite: seconds, not five minutes, and the fix is already on disk. Rejected: `--check` only, which leaves the user to run the builder; comparing against `HEAD`, which fails every gate run before a commit; and running the suite after a stale ledger, whose own ledger tests would then pass and hide the cause. Tradeoff: a local rerun passes with the rebuilt ledger uncommitted. What is committed is CI's to catch (spec 2).
- **L2. The step is an injected `ledgers` dependency of `runGate`, defaulting to none.** Only the entry point passes `rebuildLedgers`. Existing `runGate` tests and the census fixtures (`gate-census.test.mjs:51`) never write the real repo. Rejected: defaulting to the real step, which would write ledgers from fixtures with `cwd: 'C:/scratch'`. A thrown error (a shallow clone, no git) is red as `ledgers: <message>`.
- **L3. The rules builder takes a root (fold S2).** `rulesLedgerText(root)` replaces the private `buildRulesLedger()` with `git -C root`. The CLI's output and exit codes are unchanged. Rejected: copying the script into a temp repo to test it.
- **L4. One workflow, `gate.yml`, `pull_request` and never `pull_request_target`.** It has `permissions: contents: read`, checks out with `fetch-depth: 0` (the rules ledger refuses a shallow clone), uses `actions/setup-node@v4` with Node 26 (the version that measured `SPAWN_CEILING`) and the npm cache, and needs no secret. `concurrency: gate-${{ github.ref }}` with `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`: a superseded PR run is cancelled and every push to `main` runs to the end (the user's decision on `itm_d3b75462e9c0`, overriding the original `cancel-in-progress: true`). Trust: a fork's PR runs with a read-only token and no secret, so untrusted code reaches nothing.
- **L5. The check shows on the PR but cannot block a merge (F4).** Making it required needs GitHub Pro or a public repo, which is a handoff for the pilot to the user. The design adds no workaround.
- **L6. The trivial-work rule is one sentence under "The shape of a run" in `agents/pilot.md`.** `rules/vertical-execution.md:99` is left alone (§7). The sentence rebases over blocked-yellow-yields and gate2-frees-lane, which both edit `agents/pilot.md` and the pin ahead of this run.
- **L7. QA environment (`itm_73958769edf5`, the user's answer).** QA runs the local full gate in its own worktree, and reads GitHub Actions on this run's own PRs through `gh pr checks` and the Actions log. Rejected: the local gate alone, which never shows spec 2 working.
- **L8. Ubuntu, non-draft PRs only (`itm_c0eba1fff954`, the user's decision on cost).** `runs-on: ubuntu-latest`. `pull_request` to `main` on `opened`, `synchronize`, `reopened` and `ready_for_review`, with the job guarded by `github.event_name == 'push' || !github.event.pull_request.draft`, plus `push` to `main`, with L4's `concurrency` cancelling superseded runs per ref. Rationale: a private repo gets 2,000 free Actions minutes a month and Windows bills at 2x. A run of about 15 minutes on Windows (2-core runner, suite at width 1) costs about 30 billed minutes; at about 5 PRs a day and about 4 runs each, every PR event on Windows spends the 2,000 in 3 to 4 days. Skipping drafts leaves about 2 runs per PR (ready, then the push to `main`), and Linux bills at 1x. Tradeoff: a feature PR's `gate` check shows as skipped until the Sign off marks it ready, and the suite has never run on Linux. An OS-bound test that goes red there is a found issue, built in this run as an added slice. Rejected: A1's and A2's defaults.

## 6. Assumed decisions

Grilling depth: *forks* (`itm_2a8cda6f6825`); only A1 and A2 were posted, both answered, then replaced by L8 on `itm_c0eba1fff954`.

- **A1. Triggers (`itm_a8a3c9e3fd16`).** Default: `pull_request` to `main` on every event, drafts included, plus `push` to `main`. A feature PR is a draft from Gate 1, so QA reads a real check. Tradeoff: about 4 runs per PR at about 5 PRs a day on a private repo's minutes. Rejected: skipping drafts, which roughly halves the runs but shows no check until the PR is marked ready.
  Verdict: stands
  Reason: every feature PR in this repo is a draft from Gate 1 to the Gate 2 press, so a non-draft trigger would leave QA with no check on any run; nothing queued changes that).
  Answer: the user chose every PR event to `main` (the default).
  overridden: on `itm_c0eba1fff954` the user weighed the compute (2,000 free minutes a month, which every PR event spends in 3 to 4 days) and chose non-draft PRs only (L8).
- **A2. Runner (`itm_77a8fafa927d`).** Default: `windows-latest`, because the census (PowerShell) and the spawn ceiling were measured on Windows (F7). Tradeoff: Windows minutes count double on a private repo, and the 2-core runner runs the suite at width 1. S1 measures the run's time. Rejected: `ubuntu-latest`, at half the minutes, on which the suite has never run.
  Verdict: stands
  Reason: the user runs the suite on Windows and every pin, census and ceiling was measured there; Linux is an unmeasured path, not a cheaper one yet).
  Answer: the user chose `windows-latest` (the default).
  overridden: on `itm_c0eba1fff954` the user weighed the compute (Windows bills at 2x on a private repo's 2,000 free minutes) and chose `ubuntu-latest` (L8).

## 7. Out of scope

- `rules/vertical-execution.md:99`, the global trivial-work line outside the pilot.
- Branch protection, required checks, or a repo or plan change (L5).
- CI on slice PRs or pushes to `pilot` or `feat/*`.
- Speeding up the suite on a 2-core runner (no width override).
- #699's repair of main.

## 8. Slices

Width 3; longest stem 2.

| Slice | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | The CI gate runs the full gate on PRs to main (walking skeleton) | 2 | `.github/workflows/gate.yml` (new), `scripts/test/gate-workflow.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | The rules ledger builds for any root | 1 | `scripts/build-rules-ledger.mjs`, `scripts/test/rules-ledger.test.mjs` (new) | – | `pilot:typescript-reviewer` | [S2](slices/S2.md) |
| S3 | The gate rebuilds the ledgers and fails naming a stale one | 1 | `scripts/ledgers.mjs` (new), `scripts/gate.mjs`, `scripts/test/ledgers.test.mjs` (new), `scripts/test/gate.test.mjs` | S2 (`rulesLedgerText`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S3](slices/S3.md) |
| S4 | The pilot's trivial work gates once in full and stays a draft until Sign off | 3 | `agents/pilot.md`, `scripts/test/measure-prompt.test.mjs`, `scripts/test/trivial-work.test.mjs` (new), `docs/adr/0158-main-never-goes-red.md` (new), `docs/adr/README.md`, `scripts/vocabulary.mjs` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S4](slices/S4.md) |

S4 rebases over blocked-yellow-yields (`feat/blocked-yellow-yields`) and gate2-frees-lane (`feat/gate2-frees-lane`, design `c6c497d3`). Both edit `agents/pilot.md` and the `measure-prompt` pin, and either may take the next ADR number: S4 takes the next free number when it lands and regenerates the index with `node scripts/adr-index.mjs`. S1's first hosted run comes when the feature PR is marked ready at the Sign off (L8); no draft and no slice PR triggers it.

## 9. Acceptance evidence

1. Live: edit a line in `rules/typescript/testing.md` in a worktree and run `npm test`. `ledger stale: scripts/shipped-rules.json, rebuilt; commit it` appears within seconds and the exit code is 1. A rerun prints `ledgers current` and runs the suite.
2. After the Sign off marks the feature PR ready, `gh pr checks <feature PR>` lists `gate`, green, on `ubuntu-latest`. S1's author or QA reports the first Linux run's minutes from `gh run view`. An OS-bound test red on Linux is a found issue, built in this run.
3. After the merge, `gh run list --branch main --workflow gate.yml` shows the push run.
4. `agents/pilot.md` "The shape of a run" carries the trivial-work sentence, the ADR is indexed, and `check-references` passes.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | `slice/main-never-red-s1` | – | – | – | 2 |
| S2 | planned | `slice/main-never-red-s2` | – | – | – | 1 |
| S3 | planned | `slice/main-never-red-s3` | – | – | S2 | 1 |
| S4 | planned | `slice/main-never-red-s4` | – | – | – | 3 |
| main-never-red | planned | `feat/main-never-red` | – | – | S1, S2, S3, S4 | 1, 2, 3 |
