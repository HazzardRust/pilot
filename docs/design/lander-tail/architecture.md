# The lander's tail is the lander's: the report posts and every run worktree goes

Feature `lander-tail` · ticket itm_6971c0f47a93 · branch `design/lander-tail` on `origin/pilot` c1836f88 ·
thread itm_62983536e457 · merge: none (no other red ticket)

## 1. Problem

> why are you manually doing these things, shouldn't that have been the lander's job?

On 2026-10-20 the pilot posted the closing reports of one-integration-line and defender-dev-drive by hand
(itm_4acd9d52d5c4, itm_ac671a158634, both prose, author `pilot`). It also removed their qa, fix and landing
worktrees itself. `agents/pilot-lander.md:43-52` already gives that tail to the lander: prune, then a bodiless
`report`, then `finished`. Neither step works from an agent today, so the tail falls back to the pilot.

## 2. Spec

Lines 1-4 are the ticket's draft lines, sharpened against the code (confirmed by `main`, 2026-10-20). Line 5 is added.

| # | Behaviour | Evidence | Bar |
| --- | --- | --- | --- |
| 1 | A `report` posted through `deck_post` with a `ticket` and a body that is absent, `""` or whitespace is accepted. The deck renders it from the run record. Every other kind with no or blank body is still refused with the same message. | `deck/test/report-post-body.test.mjs`: the `deck_post` inputSchema's `required` is `['kind']`. A post of `{kind, ticket}` and one of `{kind, ticket, body: ""}` each store 1 report whose body is `closingReportOf`'s. A `question` with no body is refused with "body must be a non-empty string". | 2 bodiless shapes stored, 0 refused; 1 other kind refused |
| 2 | After the lander's prune, post and `deck_status finished: "closing report posted"`, in that order, the record reads finished and the ticket is closed. The pilot sends no `finished`. | The same test drives the post, then `deck_status` with that slug and `finished`: `recordForTicket` shows `finished` and the ticket is resolved. The lander pin (`scripts/test/lander-wording.test.mjs:39`) still holds the order. | 1 finished record, 1 closed ticket |
| 3 | `pilot worktrees prune --run <slug>` on a **landed run** removes every run worktree: feat, qa, fix, slice, design and the land dir. That includes an unmoved head, a head ahead only by run-record commits, untracked files, and ignored ones such as `node_modules`. It keeps a tree with a modified tracked file other than its own `run.json` (`kept merged-dirty <path>`) or one a live process holds (`kept live <pid> <path>`), and names it. A run that has not landed is pruned exactly as today. | `scripts/test/worktrees-landed.test.mjs`: a fixture with 6 worktrees (feat with a record-only tail and run.json modified, unmoved qa with an untracked file and `node_modules/`, fix, slice, a detached land dir, a slice with a modified tracked file). Exit 0, 5 `removed` lines and 1 `kept merged-dirty` line. The same fixture before landing removes 0. After the prune, `git worktree list --porcelain` holds no `prunable` entry (practitioner: a git maintainer, who trusts the admin list over the disk). | 5 of 6 removed; 0 before landing; 0 prunable entries |
| 4 | Once `pilot land` prints `landed`, no `<checkout>-land-<slug>` directory exists, `node_modules` included. That holds on the already-landed path too. A removal that fails prints `NOT removed <dir>: <why>` in land's output instead of passing in silence. | `scripts/test/land-clear.test.mjs`: a landing over a prepared land dir holding `node_modules/x/y.js` leaves `fs.existsSync(dir)` false. The already-landed case is the same. A held-open dir prints the `NOT removed` line. | zero land dirs after `landed`; at most one `NOT removed` line per landing |
| 5 | *added, assumed (A3)*. The closing report's worktree section lists the run's worktrees that still exist when the report posts, not land's earlier `kept concluding` lines. | `deck/test/closing-worktrees-left.test.mjs`: with 1 run worktree still present, the report lists exactly that path. With none, it says `none`. | 1 path listed for 1 tree left; `none` for 0 |

Cannot mean: the deck pruning by itself (the lander runs the prune, `pilot-lander.md:45`). GitHub writes
(deck-writes-github, itm_5f1725c876a7). Changing which agent posts the report.

## 3. Findings

- **The schema blocks the bodiless post.** `deck/tools.mjs:194` declares deck_post `required: ['kind','title','body']`, and Claude Code
  validates MCP input against it, so no agent can omit `body`. The lander sends `""`. `postFilled`
  (`deck/closing-report.mjs:108`) fills the body only when `body === undefined`, so the post falls to `requireText`
  (`deck/store-core.mjs:438-440`): "body must be a non-empty string". `~/.claude/pilot/deck.log` has that refusal 5 times.
  The existing test (`deck/test/report-post-body.test.mjs`) calls `callTool` directly and never meets the schema.
- **Deployment lags.** The deck runs from the installed cache (`…/plugins/cache/pilot/pilot/0.9.4/deck/daemon.mjs`, pid
  5744). That copy's `postFilled` fills author `lander` only, and it has no `adr-allocate.mjs`. A fix reaches the user's
  deck only after a release and install (§7).
- **A landed feat worktree reads `open`.** `pilot worktrees prune --run held-handoff --dry-run` prints
  `kept open …/pilot-feat-held-handoff`. Its head 1f982ffc `chore(held-handoff): run record` sits on top of the landed d0793b4e
  and is not in `origin/pilot`, and the deck's `mirrorRecord` (`deck/server-tools.mjs:165`) rewrote run.json after
  landing. prose-concision reads the same.
- **The prune rule is ADR 0081** (`scripts/worktrees.mjs:74-86`, `prune` :137). Unmoved means open (L10). Untracked
  files mean dirty. Removal never uses `--force` (clean-landing L6). A detached tree is never matched by `isRunBranch` (:109), so
  `prune --run` never sees the land dir.
- **Land clears the land dir only in one path.** `mergeIntoPilot` (`scripts/sync.mjs:56`) removes it in `finally` through
  `removeWorktree` (:167), which is best effort: errors are swallowed and there is no result. The already-landed early return
  (:67-69) never enters the `try`, so a prepared `-land-` dir survives. `clear()` (`scripts/land.mjs:146`) prunes with
  `keep: [feat, qa]`.
- **The report's worktree section is stale.** It lists `Worktrees kept:` from land's `kept` lines (`closing-report.mjs:68`).
  Those are the trees the lander's prune is about to remove.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `deck_post` tool (`deck/tools.mjs` + `postFilled`) | `TOOLS[deck_post].inputSchema`, `postFilled(fields)` | the blank-body test, beside the absent one | in-process |
| `scripts/worktrees.mjs` | `prune(repo, base, { run, landed, … })`, `landedRun(repo, base, slug)`, `runWorktrees(repo, slug)` | `isRunBranch` + the `keptDir` match folded into `runWorktrees`; record-only tail stripping; the landed state rule | local-substitutable (git fixture) |
| `scripts/land.mjs` `clear()` via `land` | land's output lines; `removeWorktree(cwd, dir) -> boolean` | the land-dir removal on every landed path | local-substitutable |
| `deck/closing-report.mjs` | `closingReportOf(record, gate, left)` | the worktree section from `left` | in-process |

Deletion test: `postFilled` survives, because without it every caller writes the report. `isRunBranch` survives
inside `runWorktrees`; its one other caller (`scripts/worktrees.mjs` itself) moves behind it. `moved` and `stateOf`
survive, gated by `landed`. No fold slice: each fold sits inside the slice that changes that module (<200 lines).

## 4. Ubiquitous language

- **Landed run**: a run whose `feat/<slug>` head, with any trailing run-record-only commits stripped, is an ancestor of the base.
- **Run-record-only commit**: a commit whose diff touches only `docs/design/<slug>/run.json`.
- **Tracked dirt**: a tracked file modified, deleted or unmerged, other than the run's own `run.json`.
- **Land dir**: `keptDir(checkout, feat/<slug>)`, `<checkout>-land-<slug>`, the landing's temporary merge worktree.
- **Bodiless report**: a `report` with a `ticket` whose body is absent or blank.

## 5. Locked decisions

- **L1 Grilling depth: forks** (the user, on the deck). Only a decision whose paths give materially different deliverables
  goes up as a question; every other decision is the architect's, recorded as A‹n›.
- **L2 QA environment** (the user, on the deck): a scratch deck (`pilot deck --scratch`) on this machine, over
  throwaway git worktrees QA creates itself, with a fixture run record. The user's :4321 deck and real run worktrees
  are never touched. No database.
- **L3 The schema requires only `kind`.** Per-kind requirements stay in the store, which already refuses them with
  its own words. Rejected: a separate `deck_report` tool. That adds a second surface for one call shape.
- **L4 Blank is absent for a report.** `postFilled` treats `""` and whitespace as no body. Rejected: making agents omit the field.
  An MCP client may still send `""`.
- **L5 Prune keeps its two modes.** The landed relaxation applies only when `prune` is given `landed`. The CLI's `--run`
  sets it from `landedRun`. Land's `clear()` passes nothing and keeps today's behaviour (`land-clear.test.mjs:180,215` stand).
  Rejected: relaxing `clear()` too, which would remove a slice tree while QA still stands in feat and qa.
- **L6 The land dir is removed by `clear()`**, after the prune, with `removeWorktree`, and checked on disk. Rejected:
  only `mergeIntoPilot`'s `finally`, which misses the already-landed path and hides a failure.
- **L7 The lander's tail order stays prune, post, finished** (`pilot-lander.md:43-52`). The report reads what the prune left.

## 6. Assumed decisions

- **A1 A run-record-only tail counts as merged** (`main`, 2026-10-20: default taken). `landedRun` and each tree's
  merged test strip trailing commits that touch only `docs/design/<slug>/run.json` before `--is-ancestor`. Cost:
  a record commit made after landing is deleted with its branch (`-D`), but the record lives on in the deck.
  Rejected: stop mirroring run.json after landing. That changes the record seam, and `finished` itself mirrors.
  Verdict: stands
- **A2 The relaxation is gated on a landed run** (`main`: default). Unmoved heads and untracked files stop keeping a
  tree only when `landedRun` is true. Cost: a run whose feat branch was deleted locally reads not-landed and is pruned as
  today. Rejected: always relaxing, which would remove a fresh worktree of a live run (ADR 0081 L10's reason).
  Verdict: stands
- **A3 Spec 5 is built** (`main`: default). `postFilled` lists `runWorktrees(gate.repo, slug)` at post time.
  Cost: the deck runs one `git worktree list` per closing report. Rejected: keeping land's lines, which name trees
  the prune then removed.
  Verdict: stands
- **A4 Untracked files do not keep a landed run's tree, removed with `--force` after prune's own tracked-dirt check.**
  Asked: itm_f8f7c07d10d3, default "Both". Cost: a stray untracked file in a run worktree is lost, and ADR 0081's
  "never --force" stops being true for landed runs (S2 writes ADR 0171 amending it). Rejected: "Unmoved only", where untracked keeps the
  tree as `kept merged-dirty`, so QA leftovers keep qa trees around. **Answered: "Both (default)"** (the user, itm_f8f7c07d10d3, 2026-10-21).
  Verdict: stands
- **A5 A live holder still keeps a tree** (ADR 0163). Cost: a preview server left running keeps the qa tree, named
  `kept live <pid>`. QA tears down on the press. Rejected: killing the holder.
  Verdict: stands

## 7. Out of scope

- Releasing and installing the plugin so the running deck carries these fixes (the bump is its own step, `scripts/bump.mjs`).
- GitHub writes (deck-writes-github). Other runs' branches (`pilot branches prune`, the report's last human step).
- Clearing the worktrees already left from earlier runs. The user runs `pilot worktrees prune --run <slug>` once this lands.

## 8. Slices

Width 3; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | A bodiless report posts through the deck_post schema | 1, 2 | `deck/tools.mjs`, `deck/closing-report.mjs`, `deck/test/report-post-body.test.mjs` | – | typescript, security | [S1](slices/S1.md) |
| S2 | A landed run's prune takes every worktree but tracked dirt | 3 | `scripts/worktrees.mjs`, `scripts/test/worktrees-landed.test.mjs` (new), `agents/pilot-lander.md`, `scripts/test/lander-wording.test.mjs`, `docs/adr/0171-a-landed-runs-prune-keeps-only-tracked-dirt.md` (new), `docs/adr/README.md` | – | typescript, security | [S2](slices/S2.md) |
| S3 | The landing leaves no land dir | 4 | `scripts/land.mjs`, `scripts/sync.mjs`, `scripts/test/land-clear.test.mjs` | – | typescript | [S3](slices/S3.md) |
| S4 | The closing report lists the worktrees left | 5 | `deck/closing-report.mjs`, `deck/test/closing-report.test.mjs`, `deck/test/closing-worktrees-left.test.mjs` (new) | S1 (`deck/closing-report.mjs`), S2 (`runWorktrees`) | typescript | [S4](slices/S4.md) |

Walking skeleton: S1. A real agent call shape, through the real schema and store, closes a ticket with the deck's report.

Red team: I assumed the cut failed and looked for why.
- **red team:** S2's relaxation inside `prune` broke `land-clear.test.mjs:180` (12 unmoved slices `kept open`) and :215
  (an untracked stray `kept merged-dirty`), which S3 owns. Fixed by L5: `landed` is an option only the CLI sets.
- **red team:** `git worktree remove` without force refuses untracked files, so spec 3 as drafted cannot pass on L6
  (clean-landing). Fixed by A4, posted as a question.
- **red team:** the land dir is detached, so `isRunBranch` never matches it. Fixed by folding the `keptDir` path match into
  `runWorktrees` (S2).
- **red team:** the feat branch's head is not in pilot, so `-d` fails even after removal. S2 uses `-D` for a run
  branch whose stripped head is merged.
- **red team:** S1 and S4 share `closing-report.mjs` and run in sequence; S4 also reads S2's `runWorktrees`. No two
  side-by-side slices share a file.

## 9. Acceptance evidence

In QA's scratch deck (L2), in the order a user meets it:
1. Spec 3: in a throwaway repo with a landed fixture run, `pilot worktrees prune --run <slug>` prints 5 `removed` and 1
   `kept merged-dirty` line, and `git worktree list` shows only the main checkout and the dirty tree.
2. Spec 4: `pilot land` on a fixture feature prints `landed`, and no `-land-<slug>` directory exists beside the checkout.
3. Spec 1, 5: a lander-shaped `deck_post {kind: report, ticket, body: ""}` shows a closing report on the scratch deck
   whose worktree section names exactly the dirty tree.
4. Spec 2: `deck_status finished: "closing report posted"` leaves the ticket closed on the scratch deck. The record
   reads finished and the pilot sends nothing.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | `slice/lander-tail-s1` | – | – | – | 1, 2 |
| S2 | planned | `slice/lander-tail-s2` | – | – | – | 3 |
| S3 | planned | `slice/lander-tail-s3` | – | – | – | 4 |
| S4 | planned | `slice/lander-tail-s4` | – | – | S1, S2 | 5 |
| lander-tail | planned | `feat/lander-tail` | – | – | S1-S4 | 1-5 |
