# The pilot branch reads as a develop line to a team

Ticket `itm_ec448e2fd6f6` · branch `design/pilot-develop-line` · base `origin/pilot` at 4e5def84 · merge: none

## 1. Problem

> how is this gonna work as a tool in another dev environment? just a random unlabelled pr laying around?
> does this solve the other problem of ensuring PRs one after another inherently avoid conflicts?
> I would like to treat the pilot branch as something the pilot can merge to at any time to retain it's canonical
> codebase state, which is separate to production or main.

`pilot` stays the pilot's canonical line, merged to at any time; `main` stays production. But to a teammate the
repository reads badly: the one pilot → main PR (#986) was titled "main gets pilot" with an empty body and no
label; #844 read *closed* with a "landed by hand" comment; every feature leaves draft slice PRs behind (809 merged
PRs against `feat/*` branches against about 60 feature PRs); and features built one after another still meet a
merge hunk at landing, because a built feature waits unlanded in concluding while the next is cut from pilot's tip
and pilot moves under it (fresh-public-repo's hunk came from the take's `pilot sync` of main).

## 2. Spec

Agreed with the user on itm_009187df97b8 ("Stands"). Lines marked *assumed* are recorded in §6.

| # | Behaviour | Evidence (bar) |
|---|---|---|
| 1 | `pilot land` keeps one open pilot → main PR titled `Release: <slug>, <slug>, <slug> +N more` (≤ 120 chars), its body one row per first-parent `Merge feat/<slug> into pilot` in `<main>..pilot` (feature, feature PR #, landing sha), labelled `release` (created `--force` when absent), rewritten on every landing, an already-landed one included. Still one open, merged only by the user. Rows carry no ticket id or closing report (*assumed* A4). | gh-stub test: 2 landings → title names both slugs, body has 2 rows, 1 `pr edit … --add-label release` per landing; `gh pr list --label release --state open` lists 1 |
| 2 | The feature PR against pilot reads MERGED: the landing waits up to 30 s for GitHub to read it merged, then comments `landed on pilot at <sha>`; it never closes it (A1). | test: an OPEN-then-MERGED fake → 0 `pr close`, 1 comment; `grep -c "'close'" scripts/land.mjs` = 0 |
| 3 | A slice reaches `feat/<slug>` as one first-parent commit `feat(<slug>): S<n> <title>` carrying a `Reviewed-by: <reviewer>: <verdict>` line per reviewer, security's verdict included; the implementer opens no PR, its reviewer reads `<feat>...HEAD` (A3). | integrate test: `git log --first-parent --format=%s` shows 1 subject per slice; 0 `gh pr create` lines in `agents/pilot-implementer.md` |
| 4 | While feature N waits unlanded in concluding, `pilot base` prints `base feat/<N> <sha> (concluding <ticket>)`, the run is cut from it, and its record carries `base: feat/<N>`; with none it prints `base pilot <sha>` as now (A5). | base test: 1 green ticket → the chained line; 0 → today's line |
| 4a | `pilot integrate` merges the run's base at every slice: `feat/<N>`'s tip until N's landing merge is on pilot, then pilot. | integrate-chain test: 2 integrations, the base switches at exactly 1 `Merge feat/<N> into pilot` |
| 4b | `pilot land` refuses N+1 while its base `feat/<N>` has not landed, naming N, exit 1, nothing pushed. | land-chain test |
| 4c | N+1's feature PR targets `feat/<N>`; N's landing retargets every open PR based on `feat/<N>` to pilot, so a teammate sees only N+1's diff (*assumed* A6). | gh-stub: 1 `pr edit <n> --base pilot` |
| 4d | The take runs `pilot sync` only when the base is pilot; a chained take skips it (*assumed* A7). | 1 pinned take line in `agents/pilot.md`; 0 sync calls on a chained take |
| 4e | N dropped unlanded: N+1's refusal names N; the pilot sends a fix-round implementer to range-revert N on `feat/<N+1>`, reviewed, then a fresh gate2 (A2). | 1 pinned fix-round line in `agents/pilot.md`; 0 lander lines |
| 5 | integrate's per-slice base merge, and the landing's one merge and one full suite, stand. | `integrate-base`, `land-suite` tests pass unchanged |
| 6 | ADR `NNNN-pilot-develop-line` amends 0083 (reversing L5's "two bases is the bug" for a depth-1 chain), 0139 and 0167. | the ADR in `docs/adr/README.md` after landing |

Practitioner lines:
- *practitioner: release manager*: the release body is derived from git (`--first-parent` merges in
  `<main>..pilot`), never from a store, so two rewrites give 1 identical body and survive a lost deck (spec 1).
- *practitioner: stacked-PR reviewer (Graphite, ghstack)*: a PR built on another targets it and is retargeted on
  its merge, 1 edit per landing (spec 4c).
- *practitioner: teammate reading the repo*: confirmation is `gh pr list --state all --limit 20` after one run:
  one feature PR MERGED, one open `release` PR, no slice PR (§9).

## 3. Findings

- `scripts/land.mjs:294-325` `mainGetsPilot` opens `--title 'main gets pilot' --body ''` and never edits it;
  `mainLine` (`:328`) is parsed by `deck/closing-report.mjs:30` and `deck/store-items.mjs:413`: kept as is.
- `scripts/land.mjs:274-284` `comment` closes an OPEN pilot PR right after the push: a race with GitHub's async
  merged reading. #982, #913, #879 (drafts on pilot) read MERGED from the push; #844 targeted main (pre-0167).
- `scripts/integrate.mjs:58-90` `prOf`, `mergeMessage`, `titleProblem` exist only for slice PRs; `:364-396`
  merges the slice `--no-ff --no-commit`; `trailers` (`Key: value`) already ride every commit it makes.
- `scripts/integrate.mjs:247` `baseOf` is pilot only; `:264` `landedOnPilot` reads git alone.
- `scripts/base.mjs` (50 lines) prints `base pilot <sha>[ on <remote>| local]`; no `Remote:` line.
- `deck/items.mjs:637` concluding = an open `green` ticket, one per repo; `deck/tickets.mjs:63` `queueView`
  answers `/api/tickets` with run records (`slug, branch, …`); `deck/runs.mjs:239` `RECORD_ORDER` has no base.
- `deck/schedule.mjs:17` pipelines on a `draft…` state with a `branch`; `deck/status.mjs:436` maps `draft` → doing.
- `agents/pilot.md:184-186, 387, 398-411, 562`, `agents/pilot-implementer.md:3, 118-163, 201`,
  `agents/pilot-co-pilot.md:46` describe slice PRs; pinned by `yellow-co-pilot`, `pilot-agents`,
  `security-trigger`, `seam-change`, `run-remote-prose`, `principles-sweep` tests.
- Precedent: `docs/design/runs-build-on-each-other` stacked runs on open feature PRs, up to 3 deep, with an
  unattended revert; ADR 0083 L5 deleted it after a 4-deep stack (#318-#321).
- Overlap: audit-f1 (`design/audit-f1`) adds a read-only `scripts/pilot-tip.mjs` beside `pilot base`; this run
  edits `scripts/base.mjs` only and does not read or name that seam.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| `scripts/release.mjs` (new) | `releaseNotes`, `releasePr` | `mainGetsPilot`'s lookup and create, out of `land.mjs` | git local-substitutable; `gh` true external, injected |
| `land.mjs` `comment` | `comment({ gh, head, sha, counts, already, wait })` | the `pr close` branch, removed | `gh` true external, injected |
| `integrate.mjs` `integrate` | `integrate(branch, { trailers, … })` | `prOf`, `mergeMessage`, `titleProblem`, removed; subject from the run record row | local-substitutable |
| `integrate.mjs` `baseOf` | `baseOf(cwd, runs) -> { ref, chained? }` | the record's `base` and `landedOnPilot` of it | local-substitutable |
| `land.mjs` `chainGuard` / `retarget` | `chainGuard({ cwd })`, `retarget({ gh, head })` | none | local-substitutable; `gh` injected |
| `scripts/base.mjs` | `base({ cwd, say, warn, concluding })` | the deck read, injected | in-process; the deck remote but owned |
| `deck/tickets.mjs` `queueView` | `queueView(...).concluding` | `liveTicketOf(…, 'green')` + its record | in-process |

Deletion test: `release.mjs` survives (first-parent parsing and title bounding would otherwise sit in a 385-line
`land.mjs`); `prOf`/`titleProblem` fail it once no slice PR exists and are deleted; `chainGuard` is one call on
`baseOf` and stays in `land.mjs`.

## 4. Ubiquitous language

- **release PR**: the one open pilot → main PR, label `release`, rewritten by each landing.
- **base**: the ref a run is cut from and merges at every slice: `pilot`, or a concluding `feat/<N>`.
- **chained run**: a run whose base is `feat/<N>`; depth is at most 1.
- **slice commit**: the first-parent `feat(<slug>): S<n> <title>` merge carrying `Reviewed-by:` lines.
- **landing**: `pilot land`'s one merge into pilot, one full suite, one push.

## 5. Locked decisions

- **L1 Grilling depth: forks** (itm_002acc6ba8d6): only questions whose paths fork are posted; the rest stand as
  assumed. Rejected: posting every default.
- **L2 QA environment** (itm_50a1ed59b468): this repository, scratch branches (a scratch base and scratch feature
  branches, never `pilot` or `main`); the one-open-release-PR rule is tested against the scratch base.
  `overridden: test PRs stay visible in the repo's history; the recommended throwaway repo was declined`.
- **L3 The release body is derived from git**, rewritten whole each landing. Rejected: appending rows from the
  deck (lost with the deck, not idempotent).
- **L4 `mainLine`'s `main gets pilot: #<n>` line stays** so the deck's closing report and blocked-item parse are
  untouched. Rejected: a `release:` line (two deck parsers and nine tests move for a word).
- **L5 The chain is depth 1 by construction**: concluding holds one green ticket, and N+1 reaches Gate 2 only
  after N's press frees the lane. This reverses ADR 0083 L5's "two bases is the bug" on those terms only.
  Rejected: stacking on any open feature PR (the 4-deep stack 0083 deleted).
- **L6 The base is recorded on the run record** (`base`, written by the pilot's `deck_status`, mirrored to
  `run.json` and read by `integrate` and `land` from the worktree). Rejected: `git config` per branch (unpushed,
  invisible to the deck) and inferring the base from ancestry (fix rounds of N break it).
- **L7 No `gh pr merge` and no ready press** (A1 answered). ADR 0139 stands.

## 6. Assumed decisions

- **A1 Push-detected merge** — *answered: default* (itm_964d7740e1d4). Wait 30 s for MERGED, then comment; never
  close. Rejected: `gh pr merge --merge` (ready press, host checks, an untested tree if pilot moved).
  Verdict: stands
  Note: the user pressed the default
- **A2 Fix-round implementer reverts a dropped N** — *answered: default* (itm_34397e684e54). Rejected: the lander
  (never edits `feat/`).
  Verdict: stands
  Note: the user pressed the default
- **A3 Merge commit per slice** — *answered: default* (itm_a7b140b1a22e). The `--no-ff` merge subjected
  `feat(<slug>): S<n> <title>`; cost: the PR's Commits tab lists implementer commits. Rejected: squash (breaks
  `deleteMerged`, worktree prune, the pipeline).
  Verdict: stands
  Note: the user pressed the default
- **A4 Release rows omit ticket and closing report** — both live on the local deck, dead links to a teammate.
  Verdict: stands
- **A5 `pilot base` reads the concluding feature from the deck** (`/api/tickets`); deck down → `base pilot` with
  `(deck not reached)`. Fallback rejected: the pilot passing `--on feat/<N>` (a rule, not a change).
  Verdict: stands
  Note: audit-f1 (queued) adds a read-only `scripts/pilot-tip.mjs` beside `base.mjs`, no shared file
- **A6 N+1's PR targets `feat/<N>`, retargeted by N's landing.** Cost: one `gh pr edit` per landing.
  Verdict: stands
- **A7 A chained take skips `pilot sync`**; main enters at the next take on pilot. Cost: main's changes wait one
  feature longer. This is fresh-public-repo's actual hunk; chaining alone does not cure it.
  Verdict: stands
  Note: the user hand-merges fixes to main and expects them in pilot, one feature later is acceptable and the alternative is the fresh-public-repo hunk
- **A8 Slice branches still push** (pipeline, remote integrate); only the PR goes. Rejected: commits straight on
  `feat/` (parallel lanes would collide).
  Verdict: stands

## 7. Out of scope

Tags or GitHub releases; changelog files; retargeting the feature PRs already open (#951, #954, #955); migrating
closed slice PRs; `pilot sync` itself; the CI trigger on `feat/**` (`gate-workflow.test.mjs:161`), which now fires
only on the feature PR; audit-f1's `pilot-tip.mjs`.

## 8. Slices

Width 4; longest stem 3

| Slice | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | A landing leaves a labelled release PR | 1 | `scripts/release.mjs` (new), `scripts/land.mjs`, `scripts/test/release.test.mjs` (new), `scripts/test/land-main-pr.test.mjs` | – | typescript, security | [S1](slices/S1.md) |
| S2 | The feature PR reads merged, never closed | 2 | `scripts/land.mjs`, `scripts/test/land-merged-read.test.mjs` (new), `scripts/test/land-main-pr.test.mjs`, `scripts/test/lib/land-repos.mjs` | S1 (`land.mjs`, `land-main-pr.test.mjs`) | typescript | [S2](slices/S2.md) |
| S3 | A slice integrates as one subject with its verdicts | 3 | `scripts/integrate.mjs`, `scripts/test/integrate-slice-commit.test.mjs` (new), `scripts/test/integrate.test.mjs` | – | typescript | [S3](slices/S3.md) |
| S4 | No slice PR is opened | 3 | `agents/pilot-implementer.md`, `agents/pilot.md`, `agents/pilot-co-pilot.md`, `agents/pilot-qa.md`, `deck/schedule.mjs`, `deck/status.mjs`, six pinned tests | S3 (`integrate`'s subject and trailers) | typescript, security | [S4](slices/S4.md) |
| S5 | `pilot base` names the concluding feature | 4 | `scripts/base.mjs`, `deck/tickets.mjs`, `scripts/test/base-chain.test.mjs` (new) | – | typescript | [S5](slices/S5.md) |
| S6 | integrate takes the chained base until N lands | 4a, 5 | `deck/runs.mjs`, `deck/tools.mjs`, `scripts/integrate.mjs`, `scripts/test/integrate-chain.test.mjs` (new), `scripts/test/measure-prompt.test.mjs` | S3 (`integrate.mjs`) | typescript | [S6](slices/S6.md) |
| S7 | land guards the chain and retargets | 4b, 4c | `scripts/land.mjs`, `scripts/test/land-chain.test.mjs` (new) | S2 (`land.mjs`), S6 (`baseOf`) | typescript, security | [S7](slices/S7.md) |
| S8 | The take and the cut follow the base line | 4, 4d, 4e | `agents/pilot.md`, `agents/pilot-architect.md`, `scripts/test/chain-prose.test.mjs` (new) | S4 (`agents/pilot.md`), S5 (the base line) | typescript, security | [S8](slices/S8.md) |
| S9 | ADR for the develop line | 6 | `docs/adr/NNNN-pilot-develop-line.md` (new), `docs/adr/0083-the-pilot-owns-a-branch.md`, `docs/adr/0139-the-landing-is-the-only-ready-press.md`, `docs/adr/0167-pilot-is-the-one-integration-line.md` | – | typescript | [S9](slices/S9.md) |

Walking skeleton: S1, a real landing in a scratch repo that leaves a release PR with a title, a row and a label.

red team: attacked each first red step against the files. (1) S3's subject needs the slice title, which came from
the PR: it now reads the run record row whose `branch` is the slice, already in the worktree (`RECORDS`,
`integrate.mjs:51`); a row without one refuses, nothing merged. (2) S6 and S7 each half-build "is N landed":
one seam, `baseOf` answers `chained` and S7 calls it, never re-derives. (3) S2 and S1 both edit
`land-main-pr.test.mjs`: serialised by `after`. (4) A chained N+1 inherits N's `NNNN-<slugN>.md`; N's landing
renames it on pilot and N+1's next base merge takes the rename clean (N+1 never edits it); a citation N+1 adds
to N's ADR is rewritten at N+1's landing only if in its own changed files: S9's ADR records it as a consequence.
(5) S4 and S8 both edit `agents/pilot.md`: serialised.

## 9. Acceptance evidence

On scratch branches in this repository (L2), in order a teammate meets it:
1. `gh pr list --state open --label release` → one PR, `Release: <a>, <b>`, two rows (spec 1).
2. `gh pr view <feature> --json state` → `MERGED`, one `landed on pilot at` comment (spec 2).
3. `gh pr list --base feat/<slug> --state all` → none; `git log --first-parent` shows one `S<n>` subject per
   slice with `Reviewed-by:` (spec 3).
4. With N in concluding, `pilot base` prints `base feat/<N>`; N+1's PR targets `feat/<N>`; land N+1 first →
   refused naming N; land N → N+1's PR targets pilot; land N+1 → no hunk (spec 4).
5. `npm test` green; the WSL loop at the landing (spec 5); the ADR listed (spec 6).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | `slice/pilot-develop-line-s1` | – | – | – | 1 |
| S2 | planned | `slice/pilot-develop-line-s2` | – | – | S1 | 2 |
| S3 | planned | `slice/pilot-develop-line-s3` | – | – | – | 3 |
| S4 | planned | `slice/pilot-develop-line-s4` | – | – | S3 | 3 |
| S5 | planned | `slice/pilot-develop-line-s5` | – | – | – | 4 |
| S6 | planned | `slice/pilot-develop-line-s6` | – | – | S3 | 4a, 5 |
| S7 | planned | `slice/pilot-develop-line-s7` | – | – | S2, S6 | 4b, 4c |
| S8 | planned | `slice/pilot-develop-line-s8` | – | – | S4, S5 | 4, 4d, 4e |
| S9 | planned | `slice/pilot-develop-line-s9` | – | – | – | 6 |
| feature | planned | `feat/pilot-develop-line` | – | – | S1-S9 | 1-6 |
