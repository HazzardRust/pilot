# Every worktree is pruned when its job ends

Feature `prune-worktrees` · ticket `itm_0ddca8a8e2f0` · base `main` at `e44e215` · amends ADR 0081 and ADR 0171
(who removes, and which trees are the run's), builds on ADR 0163 (a live holder keeps a tree)

## 1. Problem

Each run leaves worktrees behind (slice, design, qa, fix, fund, land, scratch), each able to hold a multi-GB build
artefact, and the disk filled ("the worktrees were making a 13 gb artefact each time"). Removing them has fallen to
the user as "human steps" that are not human: the handoff-no-wait steps thread (itm_2286770ec8ec) had three steps and
only the merge was the user's. The user wants each worktree gone when its job ends, by the crew, and only genuinely
human steps on their list; branch pruning is not part of that list ("dont worry about that").

## 2. Spec

| # | Behaviour | Evidence and bar |
| --- | --- | --- |
| 1 | `pilot integrate` removes the slice's worktree once the slice is integrated and pushed. | Test: after integrate, `git worktree list` names 0 trees on the slice branch and its dir does not exist; integrate's line ends `; removed <dir>` or `; kept <state> <dir>`. |
| 2 | Once Gate 1 is signed (the pilot's `finished: "planned"`) and `feat/<slug>` holds the design tip, the `design/<slug>` tree goes. | Test: a seeded run, the stage prune `planned`: 0 trees on `design/<slug>`, the feat tree untouched. Today 7 `design/*` trees stand at their feat tree's sha. |
| 3 | At landing every worktree of the run goes, detached ones and ones outside the repo's parent included: every tree tagged to the run at creation, the run's branches, the land dir. | Test seeds a branch tree, a tagged detached tree, a tagged tree under a scratch dir elsewhere, and the land dir, lands: 0 of them in `git worktree list`, 0 dirs on disk. |
| 4 | When a run is marked abandoned, its trees whose work is on the remote and that are clean go. | Test: `finished: "abandoned by the user"` → a pushed clean tree gone, an unpushed one kept as `kept unpushed <dir>`. |
| 5 | Every removal goes through one `pilot` command (`pilot worktrees remove <path>`, `prune --run <slug>`); no agent text removes a tree with `rm`, `Remove-Item` or `git worktree remove`. A tree it will not remove is kept and named in one line `kept <state> <dir>`, state one of `dirty`, `unpushed`, `locked`, `live <pid>`, `leftover`. | One test per state. Grep: 0 agent files name `Remove-Item`, `rm -rf` or `git worktree remove` for a worktree; the shell rule names `pilot worktrees remove`. |
| 6 | `pilot doctor` has a `worktrees` row: tree count, trees with no commit for 14 days and not landed, untagged detached trees, `<repo>-*` dirs git does not list, free space on the repo's volume, and the build-output size of the stale trees. *practitioner: SRE* | One test per state (stale, untagged, orphan, low disk). Run on this machine: the row prints in under 15 s with its free-GB figure within 1 GB of `Get-PSDrive C`. |
| 7 | A human-steps thread carries only steps a person must do. The lander's prune removes every removable tree before the report posts, and the thread names no worktree removal; a kept tree is a line in the closing report's "Worktrees left". | Test: a landing with 2 leftover clean trees and 1 dirty posts a steps thread with 0 `Remove` steps; the report lists the dirty one; `git worktree list` no longer names the 2. |
| 8 | A tree holding a link or junction (a QA scratch tree's `node_modules`) has the link removed first by the same command, then the tree, and the dir is checked gone. *practitioner: git-for-Windows maintainer* | Test: a junction into a sibling tree's `node_modules`; after removal the target's files are byte-identical and the tree's dir is gone. Probe (§3 F5): git 2.56 alone exits 0 and leaves the dir. |
| 9 | No human-steps thread or closing walkthrough carries "prune other runs' branches". The branch prune itself is out of scope. | Test: the steps a landing posts name `pilot branches prune` 0 times. |
| 10 | The closing report's "Worktrees left" is true: it lists every tree of the run still on disk. (Added, build-now.) | Test: a tagged detached tree kept dirty is 1 of its lines; 0 trees on disk go unlisted. Field case: handoff-no-wait's report said "none" while `pilot-cheap-suite-fund` and the `qa-hnw` scratch stood. |
| 11 | *assumed, itm_c83b9ffb134b*: the trees already on disk without a tag are swept once by `pilot worktrees prune` (no `--run`), which judges against the run remote's `pilot` too, removing those clean, moved and landed; the rest kept and named. | Test: a legacy tree landed on `pilot` but not `main` goes; one at an unlanded sha stays. On this machine `--dry-run` names the landed leftovers. |

Lines 6's orphan dirs, 8's dir check and 10 are implied, not asked for. Line 1 cannot mean the legacy names
`slice/cheap-suite-fix`: a prefix match would make `clean-landing`'s branches `clean`'s (F3).

## 3. Findings

- **F1** `scripts/worktrees.mjs` is the remover: `prune` (:193) classifies (ADR 0081: moved, in base, clean incl.
  untracked; never `--force`), and on a landed run (`landedRun` :97, ADR 0171) takes every `runWorktrees` tree
  with `--force` unless tracked dirt or a holder (`holderFrom` :251, `deck/procs.mjs`). `runWorktrees` (:106) is the
  run's branches (`isRunBranch` :162) plus the land dir: no detached tree, no tag. `land.mjs:36` calls `prune` too.
- **F2** `deck/closing-report.mjs`: `stepsOf` (:164) adds one `Remove <path> when you are done with it.` per tree
  left and `PRUNE_STEP` (:134); `postFilled` (:266) reads `worktreesLeft` (:247) and posts the steps thread before
  the report. The lander's clean tail runs `pilot worktrees prune --run <slug>` first (`agents/pilot-lander.md:58`).
- **F3** `isRunBranch` also selects remote branches for `pilot branches prune` (`scripts/branches.mjs:167`), and
  `worktrees.test.mjs:238` pins that `slice/clean-landing-s1` is not `clean`'s. So the run set cannot grow by name.
- **F4** Gate 1's press runs no code beyond the store write (`deck/server-routes.mjs:252-301`,
  `store-items.mjs:576`); the pilot then sends `deck_status finished: "planned"` (`agents/pilot.md:367`). `deck_status`
  (`deck/server-tools.mjs:440-492`) runs nothing on `finished` but `chainNext`, `prWrite` and the run.json mirror.
  `deck/pr-writes.mjs:53` `startPrWrite` is the pattern for a detached `pilot` child from the deck.
- **F5** Probe, git 2.56.0.windows.4: `git worktree remove --force` on a tree whose `node_modules` is a junction
  into a sibling tree exits 0, drops the registration, keeps the target's files, and leaves the dir and the junction
  on disk, unlisted. That is how an orphan dir arises.
- **F6** On disk today: 22 trees; untagged detached `pilot-cheap-suite-fund` and a QA scratch in another session's
  scratchpad; `slice/cheap-suite-fix`, `-s8fix` (names no rule matches); 7 design trees beside their feat trees.
  `pilot worktrees prune` without `--run` judges against `origin/main` (:302), so a run landed on `pilot` reads `open`.
- **F7** Agents create trees with bare `git worktree add` (architect :185, implementer :26/:164, qa :35,
  fundamentalist :42, auditor :22) and remove them with no named command, or `Remove-Item -Recurse -Force`
  (auditor :35-38). The shell rule every crew agent carries is one constant, `scripts/shell-rules.mjs:18`.
- **F8** `scripts/sync.mjs:191` `removeWorktree` forces and `rmSync`s the deck's own temp merge dirs (land, sync);
  `deck/doctor.mjs` `checkAll` (:474) builds rows with injected probes and has no disk or worktree row.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `scripts/worktree-remove.mjs` | `removeTree(repo, dir, { landed, holder })`, `keptLine` | prune's inline remove/`-D` loop (:223-242), link unlinking, the gone check, the run.json rule | local-substitutable (real git on a temp repo) |
| `scripts/worktrees.mjs` | `runWorktrees`, `tagOf`, `prune(…, { stage })`, CLI `add`/`remove`/`prune` | the run set (branches ∪ tag ∪ land dir), stage rules | local-substitutable |
| `deck/run-prune.mjs` | `startRunPrune(ticket, repo, slug, stage, deps)` | the detached child and its one note | in-process, spawn injected |
| `deck/closing-report.mjs` | `stepsOf(record, gate, method)` | nothing new; two steps deleted | in-process |
| `deck/doctor.mjs` | `worktreesRow(deps)` | the disk and tree census | local-substitutable |

Deletion test: `sync.mjs`'s `removeWorktree` survives as the deck's own temp-dir remover (always forced, its own
dirs); folding it would put its policy behind the guarded seam. `isRunBranch` survives unchanged (F3).

## 4. Ubiquitous language

- **Job end**: the moment a tree's work is done: integrated (slice), Gate 1 signed (design), landed, abandoned.
- **Tag**: the run slug written into git's admin dir for a tree (`<gitdir>/pilot-run`) by `pilot worktrees add`.
- **Run's trees**: tagged to the run, on a run branch (`isRunBranch`), or the land dir.
- **Kept**: a tree a removal leaves, named `kept <state> <dir>`.
- **Safe head**: a tree's HEAD, less a run.json-only tail, reachable from a remote-tracking ref, local `pilot` or `feat/*`.

## 5. Locked decisions

- **L1** One guarded removal, `removeTree`; every crew removal is `pilot worktrees remove|prune`. `sync.mjs`'s
  `removeWorktree` stays for the deck's own temp dirs. Rejected: each caller keeping its own `git worktree remove`.
- **L2** Links and junctions among a tree's untracked and ignored entries are unlinked first, never followed; after
  removal the dir must be gone, else `kept leftover`. Rationale F5. Rejected: trusting git's exit code.
- **L3** The deck's `docs/design/*/run.json` is never dirt, modified, added or untracked: the record lives in the
  deck store and is mirrored again. Rejected: `--run`-only mirror matching (F6's kept feat tree).
- **L4** A live holder keeps a tree and is never killed (ADR 0163). A locked tree is kept.
- **L5** Remote branches are never touched; a local branch goes with the tree only when its tip is a safe head.
  Branch pruning is out of scope (the user).
- **L6** `--force` only on a landed run, after the tracked status is re-read clean (ADR 0171 kept).
- **L7** The run set is not widened by name (F3); new trees are tagged at creation instead. ADR NNNN records L1-L7.

## 6. Assumed decisions

- **A1** Which trees are the run's. Default: a tag written at creation by `pilot worktrees add --run <slug>`, plus
  run branches and the land dir. Tradeoff: every creating agent's line changes (S6), and untagged legacy trees are
  never found by `--run` (spec 11, doctor). Rejected: inferring from HEAD or path, which misses `qa-hnw` and could
  claim another session's tree.
- **A2** Where the landing's prune runs. Default: where it does now, the lander's step 1 (`pilot worktrees prune
  --run`) in its own process, before its report post; `stepsOf` simply stops naming removals. Tradeoff: ordering
  rests on the lander's prose. Rejected: the deck pruning inside `postFilled`, which would block the deck's MCP
  call for minutes deleting a 13 GB tree.
- **A3** Untracked non-ignored files keep a tree at a mid-run job end (slice, design, abandon, `remove`); at landing
  only tracked dirt keeps one (ADR 0171). Tradeoff: a stray scratch file keeps a slice tree. Rejected: tracked-only
  everywhere, which loses a file an implementer forgot to add.
- **A4** Design and abandon prunes run from `deck_status`'s `finished` (`planned`, `abandoned…`) as a detached
  `pilot worktrees prune --run <slug> --stage <s>` child noting one line on the ticket. Tradeoff: the deck spawns
  one more child kind. Rejected: a hook on the press, which runs before the pilot has sent `finished`.
- **A5** Doctor: stale is 14 days without a commit and not in `pilot`; the size walk covers stale trees only and
  stops at 10 s (`≥` then); the row fails only under 10% free. Rejected: sizing every tree (minutes on 22 trees).
- **A6** Legacy trees (itm_c83b9ffb134b, spec 11). Default: one sweep, `pilot worktrees prune` without `--run`
  judging against `pilot` as well as `main`, as slice S8, droppable alone. Rejected: name only (the disk stays full).
- red team: F3 — widening `isRunBranch` to `slice/<slug>-*` would move `pilot branches prune`'s selection and break
  the collision pin; L7 and A1 replace it with the tag.
- red team: S5's `planned` prune deletes the design tree a re-cut architect reuses; S6 makes the re-cut text re-add
  it from `<remote>/design/<slug>`, and L5 keeps the local branch under `Remote: local`.
- red team: a repo-wide sweep would take a live run's clean pushed feat tree; S8 requires the head in `pilot` and
  moved since creation (ADR 0081 L10), which a live run's tree is not.
- red team: S2 folds the loop `land.mjs` relies on; S2's Prohibited keeps `worktrees.test.mjs` and
  `worktrees-landed.test.mjs` green unedited but for the new run-set row, and `land.mjs` is not touched (cheap-suite).

## 7. Out of scope

Pruning branches, local or remote (`pilot branches prune`). Deleting build output inside a live tree. Other
repositories' trees. The deck's temp-dir remover (`sync.mjs`). Disk outside the repo's volume.

## 8. Slices

Width 4; longest stem 4

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | `pilot worktrees remove` keeps or removes one tree (walking skeleton) | 5, 8 | `scripts/worktree-remove.mjs` (new), `scripts/worktrees.mjs` (CLI `remove`), `scripts/test/worktree-remove.test.mjs` (new), `docs/adr/NNNN-prune-worktrees.md` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | A landing removes every tagged tree of the run | 3, 10 | `scripts/worktrees.mjs` (`add`, `tagOf`, `runWorktrees`, `prune` fold), `scripts/test/worktrees-tagged.test.mjs` (new), `scripts/test/worktrees-landed.test.mjs` | S1 (`scripts/worktrees.mjs`, `removeTree`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |
| S3 | The steps thread names no removal and no branch prune | 7, 9 | `deck/closing-report.mjs`, `deck/test/closing-report.test.mjs`, `deck/test/human-steps-fill.test.mjs`, `deck/test/human-steps.test.mjs` | – | `pilot:typescript-reviewer` | [S3](slices/S3.md) |
| S4 | Integrate removes the slice's tree | 1 | `scripts/integrate.mjs` (`pruneSlice`), `scripts/test/integrate-prune.test.mjs` (new) | S1 (`removeTree`) | `pilot:typescript-reviewer` | [S4](slices/S4.md) |
| S5 | Gate 1 and abandon prune the run's trees | 2, 4 | `scripts/worktrees.mjs` (`--stage`), `deck/run-prune.mjs` (new), `deck/server-tools.mjs` (deck_status call), `deck/test/run-prune.test.mjs` (new), `scripts/test/worktrees-stage.test.mjs` (new) | S2 (`scripts/worktrees.mjs`, `runWorktrees`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S5](slices/S5.md) |
| S6 | Every agent creates with a tag and removes with the command | 3, 5 | `scripts/shell-rules.mjs`, `agents/*.md` (the shell-rule line), `agents/pilot-architect.md`, `agents/pilot-implementer.md`, `agents/pilot-qa.md`, `agents/pilot-fundamentalist.md`, `agents/pilot-auditor.md`, `agents/pilot-lander.md`, `agents/pilot.md`, `scripts/test/agents-worktrees.test.mjs` (new), `scripts/test/measure-prompt.test.mjs` | S2 (`pilot worktrees add`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S6](slices/S6.md) |
| S7 | `pilot doctor` shows the worktree census and free disk | 6 | `deck/doctor.mjs` (`worktreesRow`), `deck/test/doctor-worktrees.test.mjs` (new) | S2 (`tagOf`) | `pilot:typescript-reviewer` | [S7](slices/S7.md) |
| S8 | One sweep takes the legacy leftovers | 11 | `scripts/worktrees.mjs` (no-`--run` base), `scripts/test/worktrees-sweep.test.mjs` (new) | S5 (`scripts/worktrees.mjs`) | `pilot:typescript-reviewer` | [S8](slices/S8.md) |

## 9. Acceptance evidence

In QA's scratch repo with a bare remote and an isolated deck store, on Windows:

1. `pilot worktrees remove` on a dirty tree prints `kept dirty <dir>`; on a clean pushed tree with a junction it
   removes the tree, the dir is gone and the junction's target unchanged (spec 5, 8).
2. `pilot integrate` of a slice ends `; removed <dir>` (spec 1).
3. `deck_status finished: "planned"` and the design tree is gone within a minute; the feat tree stays (spec 2).
4. A landing: every tagged, branch and land tree gone; the steps thread holds only the merge step; the report's
   "Worktrees left" names the one dirty tree (spec 3, 7, 9, 10).
5. `finished: "abandoned by the user"`: the pushed tree gone, the unpushed one named `kept unpushed` (spec 4).
6. `pilot doctor` on the real checkout prints the `worktrees` row with free GB matching `Get-PSDrive C` (spec 6).
7. `pilot worktrees prune --dry-run` on the real checkout names the landed leftovers and no live run's tree (spec 11).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 5, 8 |
| S2 | planned | | | | S1 | 3, 10 |
| S3 | planned | | | | – | 7, 9 |
| S4 | planned | | | | S1 | 1 |
| S5 | planned | | | | S2 | 2, 4 |
| S6 | planned | | | | S2 | 3, 5 |
| S7 | planned | | | | S2 | 6 |
| S8 | planned | | | | S5 | 11 |
| prune-worktrees | planned | feat/prune-worktrees | | | S1-S8 | 1-11 |
