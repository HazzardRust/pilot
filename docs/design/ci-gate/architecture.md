# ci-gate: the host's CI is a gate at every step

Ticket `itm_e5e0bc09827d` · base `pilot` (ebe5233c) · merge thread `itm_e5218f28dd12` (merged none) · ADR NNNN

## 1. Problem

PRs were opened and landed on `pilot` while the Gate workflow on GitHub was red. Every step that moves work
(integrate, the co-pilot, the lander, the gate2, `pilot base`) trusts only the local suite, and no code reads the
host's checks. The user: "how were we opening prs if the CI is completely failing????". They want the host's CI
to be a gate at every step. Read live on 2026-11-20: PR #121's head `5fef2ab` has 3 check runs, `gate
(ubuntu-latest)`, `gate (windows-latest)`, `gate (macos-latest)`, all `failure`.

## 2. Spec

| # | Behaviour | Evidence and bar |
| --- | --- | --- |
| 1 | `pilot land` refuses while the feature tip's host checks are red, pending or unread, naming each failed or pending check; green lands. | Pure tests of `checksGate` (red, pending, unread, none-with-config refuse; green passes) and 1 fixture land test: red refuses with nothing pushed to pilot; #121's three failures replayed refuse naming all 3. |
| 2 | The lander runs `pilot checks <feat sha> --wait` before it says `Land again`; a red result is its hand-back line, verbatim. | 1 prose pin on `agents/pilot-lander.md`: the command precedes `Land again`, and red goes to `main`. |
| 3 | `pilot integrate <slice>` refuses to merge onto a feature tip whose checks are red, nothing merged, naming the checks; the co-pilot (and the pilot on the short path) runs `pilot checks --wait` after each integration and routes red as a failed gate, never integrating over it. | 1 fixture integrate test: red tip gives `NOT integrated … checks red at <sha7>: <names>`, HEAD unmoved; prose pins on the co-pilot and `agents/pilot.md`. |
| 4 | A gate2 on a repository with CI configured carries `checks`, the `pilot checks <sha>` line at the gate2's own sha, green; one missing, at another sha, or not green is refused naming why. | Deck tests: 3 refusals and 1 accept; a scratch repo with no workflow file posts without the field, so today's gate2 tests stay green unedited. |
| 6 | `pilot base` adds `(CI red at <sha7>: <names>)` when the base tip's checks are red, and `(CI pending at <sha7>)` when pending; Gate runs on every push to `pilot`. | Base test with a fake host: each of 2 suffixes once; `gate-workflow.test.mjs` pins `pilot` on push; a landing's push shows 1 Gate run on GitHub. |
| 7 | `pilot checks [<ref>] [--wait <min>]` prints one line, `checks <state> at <sha7>[: <names>]`, state one of green, red, pending, none, unread, exit 0, 1, 4, 5, 6; `--wait` polls until not pending or the bound (default 20 min, max 60). | CLI tests on a fake host, one per state; live on #121's head prints `checks red at 5fef2ab: gate (ubuntu-latest), gate (windows-latest), gate (macos-latest)`. |
| 8 | The GitLab adapter answers the same `checks` verb from the commit's statuses, so `pilot.host gitlab` is gated the same. | Contract test over a fake `glab` run: 3 statuses, failed, running, success, map to red, pending, green. |
| 9 | practitioner: release engineer (a gate fails closed) — a host that cannot be read (no auth, timeout, bad JSON) is `unread`, which `land` and a gate2 refuse like red and name as unread, never as green. | `checksGate` test: 3 failures (throw, timeout, bad JSON) each give `unread` and a refusal naming the error's first line. |
| 10 | practitioner: release engineer (the sha, not the branch) — every read is of one full commit sha, never "the PR" or a branch name, so a push after the read cannot slip past it. | `checksAt` refuses a non-full-sha argument before any `run`; land reads the tip it is about to merge. |

Lines 1-4 and 6 sharpen the draft; 7 and 8 are implied (one reader for every step; other-host parity); 9 and 10
are *assumed* practitioner lines inside the ask. The draft's line 5 (a required check on `pilot`) is dropped (L12):
land pushes a fresh merge commit CI never ran, so a required check would refuse every landing.

## 3. Findings

- `deck/host.mjs:9-17`: the **Host** verbs (`reviews`, `review`, `open`, `edit`, `comment`, `upsertComment`,
  `signedIn`); `hostFor(cwd)` is the one way in, null at `pilot.host none`. No verb reads CI.
- `deck/host-github.mjs:31-64`: `assertHostVerb`; `gh api` allows only `api user` and a comment PATCH. A GET of
  `repos/{owner}/{repo}/commits/<sha>/check-runs` is a new allowlist entry. ADR 0182 forbids a verb without a caller.
- `deck/host-gitlab.mjs:15-55`: `glab api projects/:id/…` allowlist; GET under `MR_PATH` only.
- `scripts/land.mjs:78` `catchUp`, `:215` `commitRecords`, `:216` `source`, `:217` `pushFeature`, `:227`
  `mergeIntoPilot`: land commits run.json before it pushes, so the sha CI ran on is HEAD before `:215`.
- `scripts/integrate.mjs:408` `start`, the feature tip before the merge; `:461` runs the selection only;
  `agents/pilot-co-pilot.md:44` "the full suite runs once, at `pilot land`". CI on the feature PR is today the only
  full suite between slices, and nothing reads it.
- `.github/workflows/gate.yml:6-12`: Gate runs on PRs to main, `feat/**`, `pilot` and on push to main only; the
  pilot tip has no checks at all. `concurrency` cancels a superseded PR run, so only a tip's run is read.
- Ruleset 25518896 (read live): target `~DEFAULT_BRANCH`, `required_status_checks`, no bypass actors. `pilot`
  has none; land pushes a new merge commit to `pilot` that never ran CI, so a required check there refuses it.
- `deck/pr-writes.mjs:2`: the daemon runs no `gh`; `deck/gate2-base.mjs:4-6` runs local git under a 5 s deadline.
- `deck/items.mjs:227` `GATE2_FIELDS`; `deck/gate2-evidence.mjs:63` `gate2EvidenceGaps`; `deck/store-items.mjs`
  798 lines against `facades.test.mjs`'s 800, so nothing is added there.
- Tests: `deck/test/host-contract.test.mjs` (fake runs), `scripts/test/host-bar.test.mjs`,
  `scripts/test/lib/land-repos.mjs:104` `fakeGh` (throws on an unknown verb: every land test breaks unless it
  answers `checks`), `scripts/test/integrate.test.mjs:60` (api answers `me\n`), `scripts/test/gate-workflow.test.mjs:160-164`.
- Spawns: `SPAWN_CEILING` 13300 (`scripts/gate.mjs:46`) since coverage-cell landed at ebe5233.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| **Host** `checks` (`deck/host.mjs`) | `checks(sha) -> Check[]` | gh check-runs JSON, glab statuses JSON, each adapter's state words | true external (host CLI), adapter per host |
| **Checks** (`scripts/checks.mjs`) | `checksAt({ host, sha }) -> Verdict`, `checksGate({ host, git, sha, at }) -> { ok, line }`, `checkLine(verdict)`, `parseCheckLine(line)`, `ciConfigured(git, sha)`; S2's `scripts/checks-cli.mjs` `main(argv)` | verdict rules, fail-closed reads, CI-configured test, the one line every step prints | in-process, host and git injected |
| gate2 checks (`deck/gate2-checks.mjs`) | `checksRefusal(repo, sha, checks) -> string \| null` | CI-configured read under the 5 s deadline, line parse, sha match | local-substitutable (git) |

Deletion test: without **Checks**, land, integrate, base, the CLI and the gate2 each re-derive red from raw runs
(5 copies). No fold slice: the seams are new, nothing existing is shallow on this path.

## 4. Ubiquitous language

- **Check**: one host CI result on one commit, `{ name, outcome: pass | fail | pending, url }`.
- **Verdict**: the commit's checks read as one state: green, red, pending, none, unread.
- **CI configured**: the tree at the sha holds `.github/workflows/*.yml|yaml` or `.gitlab-ci.yml`.
- **Check line**: `checks <state> at <sha7>[: <names>]`, the one string every step prints and a gate2 carries.
- **Unread**: the host could not answer; never green.

## 5. Locked decisions

- **L1** (`itm_256e82e76009`, default) One reader by commit sha: every step calls `checksAt` on a full sha, never `gh pr checks` or a branch.
  Rejected: per-PR reads, since `pilot base` has no PR and audit-f14 moves feature PR bases.
- **L2** (`itm_616e231df8ec`, default) GitHub reads `repos/{owner}/{repo}/commits/<sha>/check-runs?filter=latest&per_page=100`, one fixed GET
  in the allowlist with the sha checked full hex. Rejected: any GET under `repos/`, which widens the allowlist.
- **L3** (`itm_ae9b15006e02`, default) Verdict rules: red if any outcome is fail (failure, cancelled, timed_out, action_required, stale); else
  pending if any is not completed; else green when at least one; none at zero; unread when `run` throws or the
  answer is not the shape. Red wins over pending. Neutral and skipped pass.
- **L4** (`itm_e3c214c8c20b`, default) Gates by step: land and gate2 pass green only (none passes only where CI is not configured, noted);
  integrate refuses red only and says nothing otherwise, since the co-pilot's `--wait` reads pending and land is
  the hard gate; base only reports.
- **L5** (`itm_c92cb0ee11b0`, default) Land reads HEAD after `catchUp` and before `commitRecords`: a run.json-only commit takes its parent's checks.
- **L6** (`itm_5ed96e38b7be`, default) The daemon starts no host CLI: the gate2 field is QA's line, checked for shape, sha and CI-configured
  locally in `deck/gate2-checks.mjs`; land's own read is the enforcement.
- **L7** (`itm_9a4f1e7e7bd9`, default) Gate runs on push to `pilot` (`gate.yml`), so a base tip has checks to read.
- **L8** (`itm_4931415fcf47`, default) Tests stay under the spawn ceiling: verdict and gate logic tested pure over fake runs (0 spawns); one
  fixture test each for land, integrate and base, reusing the cached fixtures (about 35 spawns each).
- **L9** Nothing a Gate 1 sign-off needs lives only in a slice file.
- **L10** Pending (`itm_db635f8bd508`, "Refuse, lander waits"): land and gate2 refuse pending; the lander and
  co-pilot wait with `pilot checks --wait`. Trades: a press after a late push is refused once. Rejected: land polls
  inside its 30 min child.
- **L11** Override (`itm_be1089fc71d0`, "No override"): no override path; red is fixed or rerun on the host.
  Trades: the flaky idle-wake test blocks landings after 10:20 UTC until ci-green lands. Rejected: a user-only
  `Land over red` reply.
- **L12** Spec 5 (`itm_a01115b80bcf`, "Drop line 5, enforce in the tools"): no host protection on `pilot`; lines
  1, 3, 4 enforce. Rejected: landing by host merge (`gh pr merge`), a rewrite of land overlapping audit-f14.
- **L13** Depth (`itm_01944e4474fe`, "every").

## 6. Assumed decisions

- **A1** Pending (answered on `itm_db635f8bd508`, "Refuse, lander waits"): now L10.
  Verdict: stands — the user chose "Refuse, lander waits" on itm_db635f8bd508
- **A2** No CI (`itm_2d7a27c628fd`, default): `none` refuses at land and gate2 where CI is configured, passes noted where not; `pilot.host none`
  passes noted (`checks none at <sha7>: no host`). Trades: a repo whose workflow never triggers on PRs is blocked.
  Rejected: none always passes, which reopens the incident when a trigger is dropped.
  Verdict: stands — none passing everywhere would reopen the incident when a workflow trigger is dropped; walked with the user as its own item
- **A3** Override (answered on `itm_be1089fc71d0`, "No override"): now L11.
  Verdict: stands — the user chose "No override" on itm_be1089fc71d0
- **A4** Spec 5 (answered on `itm_a01115b80bcf`, "Drop line 5, enforce in the tools"): now L12.
  Verdict: stands — the user chose "Drop line 5, enforce in the tools" on itm_a01115b80bcf
- **A5** The gate2 `checks` field is QA's word, not re-read by the daemon (L6). Trades: a gate2 can carry a stale
  green line at its sha; land re-reads. Rejected: a daemon child per gate2 post.
  Verdict: stands — the daemon starts no host CLI today and land's own read is the enforcement
- **A6** QA environment (`itm_8677fb5e6e5e`, answered "Stub + live read", the default): scratch repo with `pilot gh-stub` replies, plus one live read-only
  `pilot checks` on #121's head. Rejected: a throwaway live PR.
  Verdict: stands — answered "Stub + live read" on itm_8677fb5e6e5e
- **A7** Overlaps: audit-f14 touches `scripts/integrate.mjs` and `scripts/land.mjs` (S3, S4 rebase on it; L1
  keeps reads PR-free); recut-decision touches `deck/server-tools.mjs` (S5 adds one call there) and
  `deck/landing.mjs` (untouched). ci-green must land before this run lands, or L11's cost bites daily.
  Verdict: stands — audit-f14 and recut-decision are both implementing on those files and ci-green is signed and queued ahead; this run builds after them
- **A8** Grilling depth (answered on `itm_01944e4474fe`, "every"): now L13.
  Verdict: stands — the user pressed "every" on itm_01944e4474fe
- **A9** Spawns: S3, S4, S6 add one fixture test each (about 105 spawns), under coverage-cell's `SPAWN_CEILING`
  13300, on `pilot` since ebe5233; each slice prints the gate's spawn count.
  Verdict: stands — coverage-cell landed at ebe5233 and pilot's ceiling is 13300

## 7. Out of scope

Host branch protection on `pilot` (L12); landing by host merge; re-running CI from the pilot; commit statuses
from non-Actions GitHub apps (check runs only); making the suite green (ci-green); an override path (L11).

## 8. Slices

Width 6; longest stem 3

| Slice | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- |
| S1 The checks on one commit read as one line | 7, 9, 10 | `deck/host.mjs`, `deck/host-github.mjs`, `scripts/checks.mjs` (new), `scripts/test/checks.test.mjs` (new), `deck/test/host-contract.test.mjs` | – | typescript, security | [S1](slices/S1.md) |
| S2 `pilot checks` prints it and waits | 7 | `bin/pilot.mjs`, `scripts/checks-cli.mjs` (new), `scripts/test/checks-cli.test.mjs` (new), `scripts/install-permissions.mjs`, `scripts/install-settings.mjs`, `scripts/test/install-allow-checks.test.mjs` (new) | S1 (`checksAt`) | typescript, security | [S2](slices/S2.md) |
| S3 A landing refuses a red feature | 1, 9 | `scripts/land.mjs`, `scripts/test/lib/land-repos.mjs`, `scripts/test/land-checks.test.mjs` (new) | S1 (`checksGate`) | typescript | [S3](slices/S3.md) |
| S4 Integrate refuses a red feature tip | 3 | `scripts/integrate.mjs`, `scripts/test/integrate-checks.test.mjs` (new) | S1 (`checksAt`) | typescript | [S4](slices/S4.md) |
| S5 A gate2 carries its green checks | 4 | `deck/items.mjs`, `deck/gate2-checks.mjs` (new), `deck/server-tools.mjs`, `deck/test/gate2-checks.test.mjs` (new) | S1 (`parseCheckLine`) | typescript, security | [S5](slices/S5.md) |
| S6 `pilot base` says a red base | 6 | `scripts/base.mjs`, `.github/workflows/gate.yml`, `scripts/test/gate-workflow.test.mjs`, `scripts/test/base-checks.test.mjs` (new) | S1 (`checksAt`) | typescript | [S6](slices/S6.md) |
| S7 The crew reads checks before each move | 2, 3, 4 | `agents/pilot-lander.md`, `agents/pilot-co-pilot.md`, `agents/pilot.md`, `agents/pilot-qa.md`, `scripts/test/ci-gate-wording.test.mjs` (new) | S2 (`pilot checks --wait`), S5 (the `checks` field) | typescript, security | [S7](slices/S7.md) |
| S8 GitLab answers the same checks | 8 | `deck/host-gitlab.mjs`, `deck/test/host-gitlab-checks.test.mjs` (new) | S1 (the **Host** `checks` verb) | typescript, security | [S8](slices/S8.md) |
| S9 The run's ADR and glossary (added) | – | `docs/adr/NNNN-ci-gate.md` (new), `CONTEXT.md` | S1 | typescript | [S9](slices/S9.md) |
| S10 A hung `gh` reads unread (added) | 9 | `deck/host-github.mjs`, its contract test | S1 | typescript | [S10](slices/S10.md) |

S1 is the walking skeleton: a real `gh` read of one commit's check runs, through the **Host** seam, to the one
check line. red team: `fakeGh` throws on an unknown verb (`land-repos.mjs:128`), so S3 owns that helper and
answers green by default; `integrate.test.mjs:60` answers `me\n` to any api call, so S4's L4 rule (silent unless
red) keeps every integrate test's line unchanged; requiring `checks` on every gate2 would break every deck gate2
test, so S5 requires it only where CI is configured (A2), and the scratch repos have no workflow file; S2's CLI was
in S1 first, over 150 lines with its tests, so it is its own slice, S1's caller being `checksAt` (ADR 0182); land's
`source` sha includes a fresh run.json commit CI never ran, so S3 reads before `commitRecords` (L5); S7's
`pilot.md` and `pilot-qa.md` have token pins (`measure-prompt.test.mjs:207`, `qa-preview.test.mjs:79`), so S7
adds at most 2 lines to each.

## 9. Acceptance evidence

1. `pilot checks <#121 head>` prints the red line naming 3 runs, exit 1 (spec 7).
2. In the scratch repo with `pilot gh-stub` answering a red check run: `pilot integrate slice/a` refuses (3);
   `pilot land` refuses naming the check, pilot unmoved (1, 9); answered pending, both say pending; green, both pass.
3. `pilot base` in the scratch repo with a red stub prints `(CI red at …)` (6).
4. A gate2 posted on the scratch deck without `checks` for a repo with a workflow file is refused; with the green
   line it posts (4).
5. The lander's, co-pilot's and QA's definitions show `pilot checks` before each move (2, 3).
6. After landing, a Gate run appears on GitHub for the push to `pilot` (6).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 7, 9, 10 |
| S2 | planned | | | | S1 | 7 |
| S3 | planned | | | | S1 | 1, 9 |
| S4 | planned | | | | S1 | 3 |
| S5 | planned | | | | S1 | 4 |
| S6 | planned | | | | S1 | 6 |
| S7 | planned | | | | S2, S5 | 2, 3, 4 |
| S8 | planned | | | | S1 | 8 |
| S9 | planned (added) | | | | S1 | – |
| S10 | planned (added) | | | | S1 | 9 |
| CI is a gate at every step | planned | feat/ci-gate | | | S1-S8 | 1-4, 6-10 |
