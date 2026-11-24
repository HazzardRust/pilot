# land-batching: landing spawns far fewer git processes

Ticket `itm_7a100ab43411`. Grilling depth: forks (L1). Brief: `brief.md`. Base `main` at `ffc8384`.

## 1. Problem

A full `npm test` spawns 13,677 processes, 12,572 of them git, over the signed bars of 11,000 / 10,000
(cheap-suite A4). The bars were lowered to the measured run as a stopgap (cheap-suite S15). The user said Yes to:
"Batch git calls in land, integrate and sync; the suite then meets 11,000 / 10,000 and spec 3's bars return to the
signed numbers".

## 2. Spec

| # | Behaviour | Evidence and bar |
|---|---|---|
| 1 | A full suite run spawns at most 11,000 processes, at most 10,000 of them git. | `npm run test:cost` on the feature tip prints `spawns <t> (node …, git <g>, …)` with t ≤ 11,000 and g ≤ 10,000; recorded as `docs/design/land-batching/cost-after.txt` (S7, or S6 when the product cut falls short). Today 13,677 / 12,572. |
| 2 | The gate holds the signed bars: `SPAWN_CEILING` reads 11,000 and a new `GIT_CEILING` 10,000; a run over either is red. cheap-suite's spec 3 and A4 name 11,000 / 10,000 again. | `scripts/test/gate-spawns.test.mjs`: a count of 11,001 total is red, 10,001 git under 11,000 total is red, 11,000 / 10,000 is green (3 cases). The cheap-suite rows read the signed numbers. |
| 3 | `pilot land`, `pilot integrate` and `pilot sync` behave as before: same printed lines, refusals, commits and pushes. | All existing land*, integrate*, sync* tests pass unchanged (0 edited asserts). One pin per command on a seeded repo, written on the base before any product change: printed lines (SHAs normalised), pilot's and the feature's tips, the merge commit's parents and subject. |
| 4 | The saving comes first from product code: one landing, one integrate and one sync each spawn fewer git, asserted. *assumed* (A2) | `countGit` per command on a seeded repo: landing 39 → ≤ 27 (S5); `pilot sync` main-merge 18 → ≤ 14; integrate one slice ≤ 75% of its base count, both numbers in the test. |
| 5 | Any remainder past spec 4 comes from the shared test fixture helpers, with no test skipped, cut or weakened. *assumed* (A1, itm_6b7ac21774f1). This rewrites the ticket's spec 4 ("not from fixtures"), which the user's Yes covered; S6 alone delivers it and nothing comes after it, so a no at Gate 1 drops S6 alone. | S6's diff touches only `scripts/test/lib/` and helper call sites; the test count of the full run equals the base's (629 files) and 0 asserts removed. |
| 6 | practitioner: git performance engineers (GIT_TRACE2 users) — the per-call-site git census, before and after, is kept beside the design. | `spawns-before.txt` (this commit) and S7's `spawns-after.txt`: git spawns per entry module and per argv, same probe; both files cover at least 99% of the gate's git count. |

## 3. Findings

**Measured on `ffc8384`** (full `npm run test:cost`, one probe per git spawn naming its outermost product frame;
summary in `spawns-before.txt`): 13,677 / 12,572, exactly the ticket's numbers. Of the git:

| Owner | git | Notes |
|---|---|---|
| test fixtures (`scripts/test/lib/*`, test bodies) | 4,048 | commit 510, push 386, checkout -b 298, rev-parse HEAD 238, add ~270, init 231, clone 171 |
| `scripts/land.mjs` entry (land + the sync/branches/worktrees it calls) | 3,942 | ~100 landings, 39 git each |
| `scripts/integrate.mjs` entry | 1,264 | ls-remote --symref 132, config pilot.remote 93, symbolic-ref 155 |
| `scripts/sync.mjs` entry | 596 | 18 git per main-merge |
| other product code (deck/server-tools 231, base 211, stack 188, …) | ~2,700 | not this ticket's surface |

One landing's 39 git, in order (land.test): symbolic-ref ×2, config pilot.remote ×2, rev-parse HEAD ×4,
rev-parse origin/pilot ×4 (two spellings), worktree list ×3, fetch ×3, ls-remote ×2, worktree prune after a
successful remove, and the writes that stay (push ×2, merge, commit, amend, worktree add/remove, mv).
Exact-duplicate reads (same process, cwd, argv, no write between) suite-wide: 961; synonyms in land: 456.

**What the design leans on**
- `scripts/remotes.mjs:19` `oncePerRunner`: memo per `git` runner (cheap-suite spec 3). It fails across runners:
  `scripts/integrate.mjs:283` `gitIn(cwd)` builds a new runner per call (`:290`, `:306`, `:314`, `:406`, `:440`, `:547`).
- `scripts/land.mjs:61` `land({ git })` already threads one runner into `catchUp`, `landCaughtUp`, `mergeIntoPilot`
  (`scripts/sync.mjs:58`), `deleteMerged` (`scripts/branches.mjs`), `clear`; `prune` (`scripts/worktrees.mjs:28`)
  and `removeWorktree` (`scripts/sync.mjs:190`) spawn their own.
- Tip reads: `land.mjs:117,220,226,235,242`, `sync.mjs:174` `pilotTipOf`, `integrate.mjs:292` `pilotBase`.
- Fixtures: `scripts/test/lib/git-fixture.mjs` already builds each repo once per key and restores it
  (git-light-tests); `scripts/test/lib/land-repos.mjs:28` `commitFile` is add + commit per call.
- Bars: `scripts/gate.mjs:54` `SPAWN_CEILING = 14929`, `:200` `spawnLines`; `scripts/test/gate-spawns.test.mjs`;
  `docs/design/cheap-suite/architecture.md` spec 3, A4, S15.

**Seams** (deepening pass)

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| `gitView` (`scripts/git-view.mjs`, new) | `gitView(cwd) → Git`; `tipOf(git, ref)`; `holdsIn(git, args)` | per-call `gitIn(cwd)` runners, the repeated tip reads, `holds`' repeated ancestry checks, `removeWorktree`'s unconditional prune | local-substitutable (real git on a temp repo) |
| `countGit` (`scripts/test/lib/count-git.mjs`, new) | `countGit(fn) → { value, git }` | ad hoc spawn counting per test | in-process |
| gate bars (`scripts/gate.mjs`) | `SPAWN_CEILING`, `GIT_CEILING`, `runGate({ ceiling, gitCeiling })` | the one-number ceiling | in-process |

Deletion test: `oncePerRunner` stays (its two users get the same answer through a view, and a plain runner still
needs it); `holds` stays for callers outside the three commands. No fold slice: `gitView` is new code each slice
adopts, not a move.

## 4. Ubiquitous language

- **view**: one command's `Git` runner from `gitView`; it remembers read answers until a write passes through it.
- **read**: a git call on the view's allowlist (rev-parse, symbolic-ref, config --get, ls-remote, for-each-ref,
  worktree list, merge-base --is-ancestor); everything else is a **write**.
- **epoch**: the stretch of a view between two writes; a remembered answer lives one epoch.
- **pin**: a spec 3 test written on the base that records a command's printed lines and resulting tips.
- **census**: the per-entry-module, per-argv git count of a full run (`spawns-before.txt`, `spawns-after.txt`).

## 5. Locked decisions

- **L1** Grilling depth Forks (user, itm_8e2eaf276999): only questions whose paths give a different deliverable are posted.
- **L2** One view per command, the same `(args) => string` shape every callee already takes, created at each
  command's entry and threaded down. Rejected: a cache file across processes (stale between commands, a new failure
  mode); a long-lived `git cat-file --batch` process (async, a held process on Windows, ADR 0163's live-process rules).
- **L3** The view forgets everything on any write through it, or on `forget()` after a write made outside it, and never remembers a throw; code on a view's path
  writes through the view (`removeWorktree(cwd, dir, git)`). Rejected: per-ref invalidation (a merge moves HEAD and
  refs at once; guessing which is the bug class this ticket must not add).
- **L4** Tips come from one `for-each-ref --format=%(objectname) %(refname)` snapshot per epoch (`tipOf`), HEAD from
  one `rev-parse HEAD`. Rejected: `rev-parse a b c` per call site (each site still needs its own list).
- **L5** Pins first: each command's pin is written and green on the base in the slice that first changes that
  command, before its product change. Rejected: golden files (they pin paths and timing noise).
- **L6** The run's ADR is `docs/adr/NNNN-land-batching.md` (ADR NNNN, S1): a command reads git through one view.

## 6. Assumed decisions

- **A1** Where the remainder past product batching comes from (itm_6b7ac21774f1, posted). Default: fixture helpers
  (S6), after S1-S5 are measured. Product cut estimated −1,500 to −2,100; fixture folds −500 to −900; needed −2,572.
  Trades spec 4's "not fixtures" wording. Rejected: bars at what product reaches (keeps spec 4, misses the signed
  bars); product beyond the three scripts (~400 duplicate reads there, still short).
- **A2** Per-command bars (spec 4): landing ≤ 27 of 39 (S1 ≤ 36, S2 ≤ 32, S5 ≤ 27), sync main-merge ≤ 14 of 18, integrate ≤ 75% of its base
  count. Trades: a looser bar per command for one that each slice can prove alone. Rejected: one combined bar.
- **A3** The landing's tail (S5) reuses the landing's own fetch: `deleteMerged` and `prune` read refs the landing's
  fetch and push left, no second and third `fetch origin`. Trades: a branch another session pushes in those seconds
  is seen at the next landing, not this one. Rejected: keep the fetches (−200 lost).
- **A4** prune-worktrees (itm_0ddca8a8e2f0) lands first, as the ticket says: S5 (worktrees.mjs) and S3
  (integrate.mjs, its `pruneSlice` neighbour) merge `origin/main` before they start, and S7 measures after it, its
  added tests included. archive-page, reply-markdown, classifier-env share no file with this run (checked by diff).
- **A5** The bars carry no headroom: `SPAWN_CEILING` 11,000 flat, not measured + 10% (gate.mjs L16's rule). Trades:
  the next feature adding spawns past them must cut or ask. Rejected: measured + 10% (would sit above the signed bar).
- **A6** QA environment (itm_470ec6f7a434, main's): this machine with seeded repos and a local bare remote, plus the
  spawn count from a CI run of the feature PR. Trades: no landing on a real host repo before Gate 2.

## 7. Out of scope

Other product modules' git (deck/server-tools, base, stack, select-tests, glossary-diff); node or other spawns;
suite wall time; prune-worktrees' own behaviour; any change to what land, integrate or sync print or refuse.

## 8. Slices

Width 3; longest stem 5 (S1 → S2 → S4 → S7 → S6). S6 has no dependants: a no on A1 drops it alone, and the bars then
stay at S7's product-only run (A1's rejected path).

| Slice | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | One landing runs on one view and spawns fewer git (walking skeleton) | 3, 4 | `scripts/git-view.mjs` (new), `scripts/land.mjs`, `scripts/test/lib/count-git.mjs` (new), `scripts/test/git-view.test.mjs` (new), `scripts/test/land-pin.test.mjs` (new), `docs/adr/NNNN-land-batching.md` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | A landing reads every tip from one snapshot | 4 | `scripts/git-view.mjs` (`tipOf`, `holdsIn`), `scripts/land.mjs`, `scripts/test/git-view-tips.test.mjs` (new), `scripts/test/land-pin.test.mjs` | S1 (`scripts/land.mjs`, `gitView`) | `pilot:typescript-reviewer` | [S2](slices/S2.md) |
| S3 | `pilot integrate` runs on one view | 3, 4 | `scripts/integrate.mjs`, `scripts/test/integrate-pin.test.mjs` (new) | S1 (`gitView`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S3](slices/S3.md) |
| S4 | `pilot sync` and the pilot merge run on one view | 3, 4 | `scripts/sync.mjs`, `scripts/test/sync-pin.test.mjs` (new) | S2 (`tipOf`, `holdsIn`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S4](slices/S4.md) |
| S5 | The landing's tail reuses its fetch and worktree list | 4 | `scripts/branches.mjs`, `scripts/land.mjs` (passes its view to the tail), `scripts/worktrees.mjs`, `scripts/test/land-tail-spawns.test.mjs` (new), `scripts/test/land-pin.test.mjs` | S2 (`scripts/land.mjs` passes its view; `tipOf`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S5](slices/S5.md) |
| S6 | Test fixture helpers close the rest and the bars read the signed numbers | 5, 1, 2 | `scripts/test/lib/land-repos.mjs`, `scripts/test/lib/git-fixture.mjs`, `scripts/test/lib/fixture-git.test.mjs` (new), `scripts/gate.mjs` (the two constants), `docs/design/cheap-suite/architecture.md`, `docs/design/land-batching/cost-after.txt`, `docs/design/land-batching/spawns-after.txt` | S7 (`scripts/gate.mjs`, `cost-after.txt`) | `pilot:typescript-reviewer` | [S6](slices/S6.md) |
| S7 | The gate holds a git ceiling and the product-only run is measured | 1, 2, 6 | `scripts/gate.mjs`, `scripts/test/gate-spawns.test.mjs`, `docs/design/cheap-suite/architecture.md`, `docs/design/land-batching/cost-after.txt` (new), `docs/design/land-batching/spawns-after.txt` (new) | S3 (suite), S4 (suite), S5 (suite) | `pilot:typescript-reviewer` | [S7](slices/S7.md) |

S5 edits `land.mjs` only to pass its view to `deleteMerged` and `clear`, after S2. Census: `spawns-before.txt`, made by `census-probe.mjs` (run: `PROBE_OUT=<file> NODE_OPTIONS=--import=file:///<abs>/census-probe.mjs npm run test:cost`).
red team: `land` calls `commitRecords` (`integrate.mjs`, S3's file), a commit made outside the view, before reading HEAD again: a stale HEAD would push the wrong source. S1 adds `Git.forget()` and calls it there; L3 names it. red team: the 26 landing bar first sat on S2, but four of its savings are S5's fetches and lists: bars now S1 ≤ 36, S2 ≤ 32, S5 ≤ 27.
red team: S3 and S1 both first read `integrate.mjs`'s `git` export (land imports `git as gitAt`): S1 must not change
it, only stop calling it, so S3 owns every `integrate.mjs` line. red team: S2 and S4 both need `holdsIn`: S2 creates
it, S4 only calls it (after S2). red team: S7 measured before prune-worktrees lands would pass and then break on its
landing: A4 makes S7 measure after it. red team: S6 first ran beside S1 with S7 after it, so a no on A1 would have left S7 blocked: S6 now comes last. red team: S6 touching `git-fixture.mjs` could change every fixture-based
test's repo; its pin is the full suite's unchanged test count and pass count.

## 9. Acceptance evidence

1. A landing on a seeded repo prints the same lines as on the base and spawns ≤ 27 git (S1, S2, S5 pins and counts).
2. `pilot integrate` and `pilot sync` print the same lines and spawn fewer git (S3, S4).
3. A full `npm run test:cost` prints spawns ≤ 11,000, git ≤ 10,000 (S7, or S6 after it; `cost-after.txt`).
4. `spawns-before.txt` against `spawns-after.txt`: where the 2,572+ went, per entry module (S7).
5. A gate over 11,000 or over 10,000 git reads red (S7 test).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 3, 4 |
| S2 | planned | | | | S1 | 4 |
| S3 | planned | | | | S1 | 3, 4 |
| S4 | planned | | | | S2 | 3, 4 |
| S5 | planned | | | | S2 | 4 |
| S6 | planned | | | | S7 | 5, 1, 2 |
| S7 | planned | | | | S3, S4, S5 | 1, 2, 6 |
| feature | planned | `feat/land-batching` | | | | 1-6 |
