# Consecutive runs build on each other

Ticket `itm_ded1a879578b` · branch `design/runs-build-on-each-other` · base `origin/main` at d3f668f

## 1. Problem

> we need to make sure that tickets running consecutively build on eachother rather than having to manage many
> merge conflicts. additionally, the ticket making skill needs to direct the agent to check if parts of the ticket
> being made already exist in other tickets.

On 2026-10-04, #289, #290 and #297 were each cut from `main` while the others were open. When #290 merged, #297
conflicted in 3 files and #289 in 7, and each signed PR's tip had to move again (#309, #310). The user is
usually away between a run's Gate 1 and its Gate 2, so finished feature PRs wait unmerged while the next run
starts. Separately, nothing checks at the moment a ticket is made whether part of it already sits in another open
ticket or an unmerged PR.

## 2. Spec

| # | Behaviour | Evidence |
|---|---|---|
| 1 | A run that starts while any feature PR of an earlier run in the same deck directory is open (draft included, signed or not; only PRs the signed-in `gh` account authored, L13) cuts `design/<slug>`, and so `feat/<slug>`, from the top of the stack: the open PR no other open PR stands on, the newest run's when several qualify. With none open it cuts from the default branch, as today. | `pilot base` prints `base feat/<a> <sha> stands on #N`; `git merge-base --is-ancestor <sha> origin/feat/<slug>` exits 0; scratch-clone test |
| 2 | The stacked feature PR targets the default branch (L11) and its body carries the line `Stands on #N.`, as `pilot base` prints it. Once #N merges, its diff lists only this run's own files, with no retarget. | the PR body; `git diff --name-only origin/main...feat/<slug>` after #N merges |
| 3 | `pilot integrate <slice>` takes the base's new tip before it merges the slice: #N's head while #N is open, the default branch once #N has merged. `pilot integrate` with no branch does the same alone, and the pilot runs it before it sends QA the fix-round tip, so the walkthrough and Gate 2 see the final base. The base is never taken by hand. | integrate's line names the base taken (`base feat/a@<sha>` or `base main@<sha>`); scratch-clone test with #N merged between two integrations |
| 4 | When #N is closed unmerged and its changes cannot be taken out cleanly (spec 13), `pilot integrate` leaves the branch as it found it, pushes nothing, exits 3, and its line names #N and says to ask the user (L12). When #N is reworked, its new commits arrive at the next take with no special step. A conflict while taking the base stops the integration as a slice conflict does, naming the base. | exit 3 and the line, in a test with a fake `gh`; a conflict test |
| 5 | `Stands on #N` is trusted only when #N is a PR of the same repository (`isCrossRepository: false`) whose head is a `feat/` branch and whose author is the account `gh` is signed in as (L13). PR numbers and branch names reach `git` and `gh` as argv items, never in a shell string, and a ref always carries its `origin/` prefix (L10). | tests: a fork PR, a non-`feat/` head, another user's PR and a `#12; rm` body each refused by name |
| 6 | `pilot base` exits 3 naming the stack when 3 open PRs already stand in it (*assumed* A3); the pilot then asks the user. | test with a fourth run |
| 7 | Runs on parallel decks (another directory) never stack on each other (*assumed* A4). | `pilot base` in a directory with no records prints the default branch, whatever PRs are open |
| 8 | The architect's worktree is cut from the base its brief names, not from `origin/<default>` by rule. | `agents/pilot-architect.md` "Where you work" names the brief's base; pinned |
| 9 | The feature's principles review and QA measure the feature against its base, not the default branch, so they never review the earlier run's code. | pilot.md step 7 names the base as the diff; `agents/pilot-fundamentalist.md` reads "the base the brief names"; pinned |
| 10 | Before the proposal table, ticket-making has the pilot run `pilot tickets --open`: every open ticket of the directory in any state (title, state, body) and every unmerged feature PR of the directory with the files it changes. | `pilot tickets --open` on a scratch deck; the skill's pinned step |
| 11 | The proposal table gains a Found column per row: `merge into <ticket>` (a queued green ticket, by the Merging rule), `drop: in #N` (held by an unmerged PR or a yellow or red ticket), or `nothing found` (*assumed* A5). | the skill; `ticket-making.test.mjs` pins the column |
| 12 | The pilot's own share of its prompt stays at or under 10270.75. | `scripts/test/measure-prompt.test.mjs` green |
| 13 | When #N is closed unmerged, `pilot integrate` takes #N's changes out of `feat/<slug>` unattended: one revert commit of #N's own non-merge commits (those reachable from #N's head and not from the default branch), made and pushed only if it applies with no conflict and the full test run stays green. From then on the run's base is the default branch, and the integrate line says #N was taken out. A conflict or a red run resets to the start and is spec 4's stop (L12). | scratch-clone tests: a clean take-out pushed, with #N's files gone and `base main@<sha>` on the next line; a conflicting one and a red one each reset, exit 3, nothing pushed |

## 3. Findings

- **F1** No record field names a feature PR. `RECORD_ORDER` (`deck/runs.mjs:223`) has `branch` (`feat/<slug>`),
  `ticket`, `finished`, `updatedAt`; the deck keeps one record per directory and slug, never dropped
  (`deck/store.mjs:1633-1652`). The PR number lives only in a gate2's `pr` and in prose.
- **F2** The pilot's pin counts its deck tool schemas (`measure-prompt.test.mjs:113`, `pilot.tools`, 1632 of
  15480 bytes/4). A new `deck_status` field costs the pin; a daemon read route costs nothing.
- **F3** `scripts/integrate.mjs` already fetches, merges `--no-ff --no-commit`, installs, tests, pushes and commits
  the record, and finds a PR by head with `gh` through an injectable `findPr` (`:27`, `:95-104`). On a merge
  stop it aborts and says so in one line (`:108-113`).
- **F4** `GET /api/tickets` (`deck/server.mjs`, `deck/tickets.mjs` `queueView`) is a read that marks nothing
  delivered; it returns the live ticket and the green queue only. No route lists a directory's records.
- **F5** GitHub (docs lookup; retarget rows unverified knowledge): a PR based on another PR's head stays based on
  it after that head merges unless the branch is deleted. This repo deletes no branches, so a stacked PR
  targeting `feat/a` would merge into `feat/a`, not `main`, silently. A PR targeting `main` but cut from `feat/a`
  shows both runs' changes until `feat/a` merges with a merge commit, after which three-dot diffing drops A's
  commits. `gh pr create --base` and `gh pr edit --base` exist.
- **F6** The same-surface merge lives in `agents/pilot-architect.md` "Merge first" and `pilot tickets`; merge-first
  L6 forbids a copy of it in the skill. The skill's Merging rule 1 (merge into a queued ticket by reply) exists.
- **F7** `agents/pilot-architect.md:92` cuts the design worktree from `origin/<default-branch>`;
  `agents/pilot-fundamentalist.md:14` and pilot.md step 7 diff against the default branch.
- **F8** pilot.md step 5 restates integrate's internals ("fetches, merges `--no-ff`, runs `npm ci` when the
  lockfile moved …"), about 45 tokens no test pins: the budget this feature's clauses are paid from.

## 4. Ubiquitous language

- **Base**: the ref a run is cut from and keeps taking: the head of the PR it stands on while that PR is open,
  otherwise the default branch.
- **Stands on**: the line `Stands on #N.` in a feature PR's body; the only place a stack is written.
- **Stack**: a chain of open feature PRs of one directory, each standing on the one before; its **top** is the
  one no other stands on.
- **Take the base**: merge the base's current tip into `feat/<slug>` with a merge commit, inside `pilot integrate`.
- **Open run**: a record of this directory with a `feat/` branch whose PR is open.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
|---|---|---|---|
| L1 | Grilling depth is *forks* (user, itm_62e331bd2d49). | The user's answer. | *every* |
| L2 | The stack is written once, as `Stands on #N.` in the PR body, and code reads it from GitHub. | No new state, no pin cost (F2); the reader sees it on the PR. | A `base` record field: costs the pilot's pin through `deck_status` and duplicates the PR. |
| L3 | Open runs are deck records (which runs, F1) crossed with `gh` (which PRs are open), in one module, `deck/stack.mjs`, serving `pilot base`, `pilot integrate` and `pilot tickets --open`. | Records give the directory filter (spec 7); `gh` gives merged or closed; one place gets it right. | `gh pr list` alone: it cannot tell decks apart. |
| L4 | `pilot integrate` takes the base on every call, for every run; an unstacked run's base is the default branch (user, itm_8c4cd08cb061). | One rule, in code; it is what stops a signed tip moving at merge time. | Taking main only after a stacked base merges: two rules, and an unstacked run still meets the #289 conflicts at the end. |
| L5 | Taking the base is a committed `--no-ff` merge before the slice merge; one test run covers both, and red resets to the start. | The tests judge the state that is pushed; nothing half-taken is left. | Rebasing `feat/<slug>`: rewrites a pushed branch with a PR open. |
| L6 | The only new `agents/pilot.md` words are step 2's base (`pilot base`), Gate 1's body line, and step 7's integrate-alone and diff base; step 5's restatement is cut to pay for them. | The pin has about 5 tokens of headroom (F8). Spec 4's rule lives in integrate's line, which the pilot already routes as a red integration. | A rules paragraph in pilot.md: the pin cannot carry it. |
| L7 | The ticket-making check reads `pilot tickets --open` and lives in the skill; the architect's same-surface merge is untouched and not restated. | Merge-first L6 (F6); this check is about parts already built or held, not surfaces. | Folding it into Merge first: that runs after the ticket exists, too late for the ask. |
| L8 | `deck/stack.mjs` and integrate take `gh` as an injected function, the existing `findPr` pattern (F3); QA drives the real code through a `gh` stub on `PATH`. | No new production seam. | An env var naming a fake `gh`. |
| L9 | QA runs in a scratch clone with a local bare remote and stacked `feat/` branches, a `gh` stub on `PATH`, and a scratch deck on its own port and store; no real GitHub PRs, never the live deck on 4321 or this repository's real branches (user, itm_7e044891073a). | The user's answer. | Two real throwaway draft PRs as well. |
| L10 | `Stands on #N` is trusted with checks: #N is a PR of the same repository (`isCrossRepository: false`) whose head is a `feat/` branch; PR numbers and branch names reach `git` and `gh` as argv, never a shell string (user, itm_de918effabfc). | A forged line can name no fork and run no command; at worst it points a run at another `feat/` branch of the same repository. | The base as a run-record field (L2). |
| L11 | A stacked feature PR targets the default branch and names its base as `Stands on #N.` in its body (user, itm_c9cf91a8a57c; was A1). | An out-of-order merge is never silent: merging B first lands A's signed changes in main too, rather than B into `feat/a` (F5). It trades away a clean diff while #N is open: the PR shows #N's changes too until #N merges. | Targeting #N's branch: after #N merges, B still targets `feat/a`, and Merge lands it there with no warning unless someone retargets it first. |
| L12 | When #N is closed unmerged, integrate takes its changes out automatically when that is clean (no conflict, full tests green), and stops and asks when it is not (user, itm_1e5748e2b6f7: "Take A's changes out automatically", then "clean only"; was A2). The take-out is recorded as one revert commit whose subject names #N; integrate reads that commit to know #N is already out, so nothing is written to the PR body or the run record. | Closing #N rejects its work without the run waiting on the user; nobody guesses at a conflict or carries a red branch on while the user is away. | Always stop and ask (the architect's default): the run waits on every close. Always automatic: the pilot resolves a revert conflict unattended. Keeping #N's changes: closing #N would no longer reject it. |
| L13 | A run stacks on the user's own most recent feature PR, signed or not: the base is the top of the stack of this directory's open runs, the newest run's, draft included, and a PR is a candidate only if its author is the account `gh` is signed in as (user, itm_45fcb03511a4: "work completed by the actual user only", "the most recently added feature as the base", "but yes unsigned work"; was A6). | Runs follow each other while the user is away, so the earlier PR is usually unsigned; another user's open PR is never built on. The deck's records already keep other users' PRs out (L3); the author check holds even if a record or a `Stands on` line names one. | Any open feature PR whoever opened it. Only PRs past Gate 2: two runs in a row while the user is away would both be cut from main and conflict as on 2026-10-04. |

## 6. Assumed decisions

| # | Question | Default taken | What it trades away |
|---|---|---|---|
| A3 | How deep may a stack grow? | 3 open PRs; `pilot base` refuses the fourth and the pilot asks (green, so the user is there). | A fourth queued run waits for one merge or the user's word. |
| A4 | Do parallel decks stack? | No: records are per directory, so a parallel deck sees no open runs of another. | Two parallel decks touching the same files still conflict, as today; that was the user's choice of parallel. |
| A5 | What does "parts already exist" mean? | Open tickets' titles, bodies and spec lines, and unmerged PRs' changed files; the pilot judges overlap; a hit goes in Found. | No semantic match by code; the pilot's judgement can miss a part named differently. |

## 7. Out of scope

- Merging PRs or retargeting them on GitHub: the user merges, and L11 makes a retarget unnecessary.
- Squash-merged bases: this repo merges with merge commits. A squash leaves A's changes in B's diff until B
  takes main, which the next take resolves.
- Rework of #N after B's walkthrough is signed (R2).
- Stacks across directories or decks (A4); any change to the architect's Merge first.

## 8. Slices

| Slice | Title | Spec | Files owned | After | File |
|---|---|---|---|---|---|
| S1 | Walking skeleton: `pilot base` names the top of the stack, and a run is cut from it | 1, 2, 5, 7, 8, 12 | `deck/stack.mjs` (new), `scripts/base.mjs` (new), `bin/pilot.mjs`, `deck/tickets.mjs`, `deck/server.mjs`, `agents/pilot.md`, `agents/pilot-architect.md`, `deck/test/stack.test.mjs` (new), `scripts/test/base.test.mjs` (new), `deck/test/tickets.test.mjs` | – | [S1](slices/S1.md) |
| S2 | `pilot integrate` takes the base | 3, 4, 9, 12 | `scripts/integrate.mjs`, `scripts/test/integrate.test.mjs`, `scripts/test/integrate-base.test.mjs` (new), `agents/pilot.md`, `agents/pilot-fundamentalist.md` | S1 | [S2](slices/S2.md) |
| S3 | A stack deeper than 3 is refused | 6 | `scripts/base.mjs`, `scripts/test/base-depth.test.mjs` (new) | S1 | [S3](slices/S3.md) |
| S4 | Ticket-making checks what already exists | 10, 11 | `deck/tickets.mjs`, `deck/server.mjs`, `skills/ticket-making/SKILL.md`, `deck/test/tickets-open.test.mjs` (new), `scripts/test/ticket-making.test.mjs` | S1 | [S4](slices/S4.md) |
| S5 | A closed base is taken out when that is clean | 13 | `scripts/integrate.mjs`, `scripts/test/integrate-takeout.test.mjs` (new) | S2 | [S5](slices/S5.md) |

S2, S3 and S4 may run in parallel after S1: their files are disjoint. S5 follows S2 (both own `scripts/integrate.mjs`); the pilot added it after the architect's cut, when L12 was locked. Each slice keeps spec 12 green. Estimate:
5 slices, one run.

## 9. Acceptance evidence

In a scratch clone with a bare remote, a `gh` stub and a scratch deck (L9):

1. Seed two records and one open PR (`feat/a`, #1): `pilot base` prints `base feat/a <sha> stands on #1`; with no
   records, `base main`; a body naming a fork PR, a non-`feat/` head or another user's PR is refused (spec 1, 5, 7).
2. A design worktree cut from that line: `git merge-base --is-ancestor` exits 0 (spec 1, 8).
3. Push a commit to `feat/a`; `pilot integrate slice/b-s1` names `base feat/a@<sha>` and the slice. Mark #1 merged
   and merge `feat/a` into the bare remote's main; the next `pilot integrate` names `base main@<sha>`, and
   `git diff --name-only origin/main...feat/b` lists only B's files (spec 2, 3).
4. Mark #1 closed unmerged: `pilot integrate` pushes one revert commit naming #1, `feat/a`'s files are gone from
   `feat/b`, and the next line names `base main@<sha>`. Repeat with B editing a line A added: exit 3 naming #1,
   nothing pushed (spec 4, 13).
5. Three stacked open PRs: `pilot base` exits 3 naming them (spec 6).
6. `pilot tickets --open` on the scratch deck lists a yellow ticket and the unmerged PR's files; the skill's proposal
   shows Found (spec 10, 11).
7. pilot.md step 7 and the fundamentalist read the base; `npm test` green, the pin included (spec 9, 12).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Delivers |
|---|---|---|---|---|---|---|
| S1 | integrated | slice/…-s1 | #312 | | – | 1, 2, 5, 7, 8, 12 |
| S2 | integrated | slice/…-s2 | #315 | | S1 | 3, 4, 9, 12 |
| S3 | integrated | slice/…-s3 | #313 | | S1 | 6 |
| S4 | integrated | slice/…-s4 | #314 | | S1 | 10, 11 |
| S5 | integrated | slice/…-s5 | #316 | | S2 | 13 |
| feature | ready | feat/runs-build-on-each-other | #311 | | | |

## Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | No `gh`, or the remote is unreachable: no base can be read. | Integrate takes nothing and says `base not read: <why>`; `pilot base` prints the default branch with the reason. It never guesses. |
| R2 | #N is reworked after B's walkthrough is signed: main gains commits B lacks. | B's tip moves once at merge time, as today; rare. |
| R3 | A stacked B is implemented before A (queue reordered). | B takes A's tip at each integration; a conflict stops integrate naming the base. |
| R4 | Taking main on every integration moves every run's tip more often. | Only before Gate 2; one test run judges it (L5). |

## Principles and QA verdicts

Feature review at 6cae076 and QA's read-only pass; fixed in #317 unless dropped.

| # | Verdict | Finding |
|---|---|---|
| 1 | kept | `openRuns` made one `gh` call per record ever made; one `gh pr list --state open --author @me` instead. |
| 2 | kept | A failed fetch unstacked a run for good (`base.mjs`); the top is kept and the reason appended. |
| 3 | kept | Default-branch lookup written three times, `firstLine` twice; one export in `deck/stack.mjs`. |
| 4 | kept | `findPrWithGh` was a second `gh` seam; deleted, the call goes through the injected `gh`. |
| 5 | kept | `integrate()` at cognitive complexity 37; the take-out moved to `takeBase`. Still 29 against a limit of 15. |
| 6 | kept | Surviving mutants in integrate; six tests added. `main()` exiting 3 is not tested: it needs a new seam. |
| n1 | kept | `topOf`'s cycle fallback was always discarded; it reduces over tops only. |
| n2 | kept | Unread fields and exports removed from `stack.mjs` and `base.mjs`. |
| n3 | kept | S2's closed-base test renamed to what it pins since S5. |
| n4 | dropped | A `checkedPr` refusal inside integrate shares the gh-unavailable catch already pinned; QA ran it live. |
| J1 | kept | A `Stands on` line that does not parse was silently unstacked; the integrate line now says so. |
| J2 | dropped | A refused base still lands the slice: R1 by design, and the line says why. |
| J3 | dropped | Stop-line wording; no consequence beyond the wording. |
| J4 | dropped | `pilot tickets --open` diffs a stacked run against main, so its base's files show under it; low, a candidate ticket. |
