# Run branches pruned on merge, with a run remote to opt out

Feature `pilot-fork` · ticket itm_8dd4b8c8e06b · cut from `origin/pilot` · design branch `design/pilot-fork`

## 1. Problem

Every run pushes `pilot`, `design/*`, `slice/*`, `fix/*`, `qa/*` and `feat/*` to `origin`, and nothing ever
deletes them. On 2026-10-12 origin held 504 run branches. Anyone watching the repository sees every run's
scaffolding, and two users piloting one repository would share one `pilot` and one branch list. The user
wants:

- run branches deleted once they are merged, and never before (L14);
- by default, run branches and slice draft PRs still going to `origin`, so unfinished work has a cloud copy;
- one setting, `git config pilot.remote`, as the opt-out: `none` keeps run branches local, and any other
  value names a remote that takes them instead;
- `feat/<slug>` always on `origin`, so the feature PR is never cross-repository.

## 2. Spec

| # | Behaviour | Evidence |
|---|---|---|
| 1 | With `pilot.remote` unset, every run behaves as today: every git and gh argv is unchanged, run branches and slice draft PRs go to `origin`. | The existing suites pass unchanged. `remotes.test`: unset → `origin`. |
| 2 | `pilot.remote` names the **run remote**. Unset means `origin`. `none` means there is none, and run branches stay local. Any other value must be a remote name `git remote` lists (L2), or the command stops and names the key. `pilot base` appends ` on <name>` or ` local` only when the run remote is not `origin`. | `remotes.test` covers the four cases: unset, `none`, a listed second remote, a bad value (`--upload-pack=x`, `nosuch`). `base-remote.test` pins the three base lines. |
| 3 | When the run remote has no `pilot` (under `none`: no local `pilot`), `pilot base` creates it, never forced. It starts from origin's `pilot` when origin has one, else from origin's default tip (L7). | `base-remote.test`: given an origin `pilot` ahead of `main`, the second remote's `pilot` (and, under `none`, the local `pilot`) is created at origin's `pilot` tip, and origin's refs do not move. |
| 4 | `pilot sync`, `integrate`, `land`, `handoff` and the deck's gate1 lineage check read and push `pilot`, `slice/`, `design/`, `fix/` and `qa/` on the run remote, or as local refs under `none`. Origin's default branch and `feat/<slug>` are always read and pushed on `origin`. | One `*-remote` test per command, under `none` and with a second bare remote: origin's `ls-remote` lists no `pilot` or `slice/` branch, and the run's refs sit where the setting says. |
| 5 | `feat/<slug>` is always pushed to `origin`, and the feature PR is a same-repository draft into origin's default branch. Slice draft PRs exist only when the run remote is `origin`. Otherwise `pilot integrate` merges the slice with no PR (L15). | `integrate-remote.test`: a slice with no PR merges as `Merge <slice>`. Scratch run: `gh pr view --json isCrossRepository` on the feature PR → `false`. |
| 6 | A `slice/`, `fix/`, `qa/` or `design/` branch is deleted on the remote it lives on once it is **merged**, never before:<br>• `pilot integrate` deletes the slice it merged.<br>• `pilot land` deletes the run's merged `design/`, `fix/` and `qa/` branches.<br>• An unmerged branch is kept and named.<br>• A guard refuses to delete any other prefix, `pilot`, or the default branch. | `branches.test`: a refusal for each forbidden name. `integrate-prune.test` and `land-prune.test`: a planted unmerged `fix/` survives and is named in the output line. |
| 7 | `feat/<slug>` stays while its PR is open. After the feature PR merges, `pilot branches prune --slug <slug>` deletes it on `origin`, along with the run's other merged branches; another slug's are the backlog, one pair per slug (L12). The pilot's closing step runs it; with `--dry-run` it only lists (L13). | `branches.test`: an open PR's `feat/` is kept and a merged one is deleted. In a scratch run, origin lists no run branch but `pilot` after the merge and the prune. |
| 8 | A Gate 1 plan's sha and a slice merge sha still resolve after their branches are deleted, through `feat/<slug>` and `pilot`. | `land-prune.test`: `git cat-file -e <sha>` succeeds on a fresh clone after the prune. |
| 9 | Where the agents' prose names `origin` for a run branch, it names the run remote that `pilot base` printed instead. The implementer opens a slice PR only when that remote is `origin`. The pilot's closing step runs `pilot branches prune --slug <slug>` (*assumed*: implied by the request). | `run-remote-prose.test` wording pins. The prompt-budget pins move by exactly the measured cost. |
| 10 | The README's install section names `pilot.remote` and its two opt-out values in a few lines. An ADR records the model. | A wording pin on the README section. The ADR is listed in `docs/adr/README.md`. |

## 3. Findings

- **`origin` is hard-coded for run branches** (line numbers at `origin/pilot` cd7862ce):
  - `scripts/pilot-branch.mjs`: `ensurePilotBranch` :86-93, `pilotLineage` :124
  - `scripts/sync.mjs` :51, :97, :128
  - `scripts/integrate.mjs` :147, :165, :218, :248 (slice ref), :290 (pushes `feat/`, which stays on origin)
  - `scripts/land.mjs` :59 (`feat/`, stays), :68, :77, :175
  - `scripts/handoff.mjs` :76 pushes the run record's worktree `HEAD`, which can be a `design/` branch (this
    design branch carries one).
  - `deck/lineage.mjs` :15, :35
- **Reads that stay on origin and need no change:**
  - `defaultBranch` and `remoteDefaultBranch` (`pilot-branch.mjs` :31, :45);
  - `worktrees.mjs` :159 (origin's default);
  - `deck/tickets.mjs` `openRuns`/`formatRuns` :29-107, which read only feature PRs and `origin/feat/`. Its
    `isCrossRepository === false` filter (:34) stays right because the feature PR is same-repository (spec 5).
  - The four gh calls need no `--repo`: every PR they read is on origin, the gh default.
- **`integrate` already merges with no PR** (`integrate.mjs` :197-210): `pr` stays null and the merge message
  is `Merge <slice>` (`mergeMessage` :54-55). Spec 5's no-PR path costs nothing new.
- **`assertPushable` is the push guard** (`pilot-branch.mjs` :65). It is an allowlist, refuses deletions, and
  reads the default branch from origin. It stays the only push guard; deletion gets its own (L4).
- **Existing data**: origin holds 332 `slice/`, 61 `design/`, 48 `fix/` and 63 `feat/` branches (`git ls-remote
  --heads origin`, 2026-10-12). `gh repo view --json deleteBranchOnMerge` → `false`. `pilot worktrees prune`
  never touches remote branches (`worktrees.mjs` :13).
- **PRs are opened in prose, not code**: the feature PR in `agents/pilot.md` :342, slice PRs in
  `agents/pilot-implementer.md` :101; the implementer's worktree and rebase lines (:24, :96, :122) name `origin`.
- **Tests run real git against scratch bare repositories** (`scripts/test/base.test.mjs` `scratchRepos`). A second
  run remote is a second bare repository. gh is injected as `(args) => string` (`integrate.mjs` :39).
- **Merge permissions**: pilot's merge commands are allowed by `PILOT_MERGE_ALLOW` (`install-settings.mjs` :560),
  so deletions inside `integrate` and `land` need no new rule. The default branch is never pushed to a run remote,
  so the ask rules (:486) need no new form either.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| `scripts/remotes.mjs` (new) | `runRemote(git) -> string \| null`, `runRef(runs, branch) -> string` | The run remote's name at 14 call sites, the `none` case, and the name check. Deleting the module spreads that back across 6 files. | Local-substitutable (real git on scratch repos) |
| `scripts/pilot-branch.mjs` | `ensurePilotBranch`, `pilotLineage`; signatures unchanged, now reading `runRemote` | `pilot` on the run remote, or local | Local-substitutable |
| `scripts/sync.mjs` | `mergeIntoPilot`, `sync` (signatures unchanged) | Merging origin's default into the run remote's `pilot`, or the local `pilot` | Local-substitutable |
| `scripts/branches.mjs` (new) | `assertDeletable(branch, { git })`, `deleteMerged({ git, gh, branches, into }) -> { deleted, kept }`, `main(argv)` for `pilot branches prune` | Every remote deletion: the prefix allowlist, the merged test, and the one `git push <remote> --delete` per remote | Local-substitutable for git; gh is true external (injected) |
| `scripts/integrate.mjs` | `integrate(branch, options)` | Deleting the slice it merged, through `deleteMerged` | Local-substitutable |
| `scripts/land.mjs` | `land(options)` | Deleting the run's `design/`, `fix/` and `qa/` branches, through `deleteMerged` | Local-substitutable |

Deletion test: `handoff.mjs` and `deck/lineage.mjs` only consume `runRemote` and fold nothing. `worktrees.mjs`
and `deck/tickets.mjs` fail the test, because nothing in them changes. Every fold is part of a change this feature
makes anyway, so there is no separate fold slice.

## 4. Ubiquitous language

- **Run remote**: where a run's `pilot`, `slice/`, `design/`, `fix/` and `qa/` branches live. Set by `pilot.remote`;
  unset means `origin`.
- **Local mode**: `pilot.remote` is `none`. There is no run remote, and run branches are local refs.
- **Feature branch**: `feat/<slug>`, always on `origin`, the head of the run's one same-repository PR.
- **Run branch**: `pilot`, `design/`, `slice/`, `fix/`, `qa/` or `feat/`.
- **Merged** (for deletion): gh reports the branch's PR `MERGED`. A branch with no PR counts as merged once its
  tip is an ancestor of the branch it went into, as fetched.

## 5. Locked decisions

- **L14 Default home is origin, pruned on merge (user, itm_5168ca36772e, 2026-10-12).**
  - Run branches and slice draft PRs go to origin as today, and are deleted when merged (spec 6-7).
  - `pilot.remote` is the opt-out: `none` keeps run branches local, and any other value names a remote that takes
    them instead.
  - `feat/<slug>` is always pushed to origin, so the feature PR is never cross-repository.
  - Rejected: a fork or a per-user namespace by default. The bloat was never that the branches exist, only that
    nothing deleted them.
  - Rejected: local by default, which leaves unfinished work with no cloud copy.
- **L1 One module answers the run remote.** `runRemote(git)` is the only reader of `pilot.remote`, and
  `runRef` is the only code that turns a run branch into a ref (`<remote>/<branch>`, or `<branch>` under `none`).
  Rejected: an `origin` string at each call site plus a threaded parameter, which leaves 14 places that can each
  get it wrong.
- **L2 The configured name is validated.** A value from git config reaches argv and ref paths. It must be `none`,
  or match `^[A-Za-z0-9][A-Za-z0-9._-]*$` and be listed by `git remote`; otherwise the command stops and names
  the key. Rejected: trusting config, since a value such as `--upload-pack=…` would be an argument injection.
- **L3 Unset means today's argv.** With `pilot.remote` unset, every git argv is unchanged and no gh argv changes,
  so the existing suites are the regression net. No gh call gains `--repo`, because every PR read is on origin.
  Rejected: always resolving through `git remote` output in the default case, which changes argv for nothing.
- **L4 Deletion has its own guard.** `assertDeletable` allows only plain `slice/`, `fix/`, `qa/`, `design/` and
  `feat/` names, compared without case, and never `pilot` or origin's default. `feat/` is deleted only on origin;
  the other four only on the run remote. It is the only code that runs `git push <remote> --delete`. Rejected:
  loosening `assertPushable` to accept deletions, which weakens the one push guard.
- **L5 "Merged" means gh says MERGED, or ancestry when there is no PR.** `integrate` waits for GitHub's merged
  state with a bounded poll (30 s at most), so a PR never reads closed because its branch was deleted early. On
  a timeout it keeps the branch and names it. A branch with no PR (any slice off origin, L15) is judged by ancestry
  in the fetched `origin/feat/<slug>`. Rejected: ancestry alone where a PR exists, which can close a PR that
  GitHub has not yet marked merged.
- **L6 The feature PR stays the pilot's prose and stays as it is**: a same-repository draft from `feat/<slug>`.
  Rejected: a new `pilot pr` command, which is more code than the sentence it would replace.
- **L7 `pilot base` creates a missing `pilot` from origin's `pilot`**, so landed but unmerged features carry over
  to a new run remote or to local mode. Rejected: creating it from the default branch, which silently drops them.
- **L8 The run remote is chosen between runs.** A run in flight when `pilot.remote` changes is not migrated.
- **L9 `pilot branches prune` gets no allow rule.** A bulk deletion stays a prompt for whoever runs it by hand.
- **L10 An ADR records the run-remote model** (S10). The code headers cite it.
- **L11 QA environment (user, itm_0f6b380d1d75):**
  - a scratch deck against two throwaway GitHub repositories under the user's account:
    `HazzardRust/pilot-qa-upstream` as `origin` and a private second repository as the named run remote;
  - QA runs a scratch run against them in each of the three modes and deletes both at teardown;
  - nothing touches HazzardRust/pilot.

  Under L14 the second repository need not be a fork, so the premise question itm_f5975cdc5741 is moot.
- **L12 The backlog prune is a human step (user, itm_d54bba150079).** Origin holds 504 existing run branches.
  Clearing them is a step in the closing report, one pair per slug since SR2 made `--slug` required:
  `pilot branches prune --slug <slug> --dry-run` on HazzardRust/pilot first, then the real run, for each slug the
  report lists (prose changed 2026-10-13, itm_2ecda9e7c405). The run itself never deletes them. Rejected: pruning during the run, which is irreversible on
  existing data (the shas survive through merges, the branch names do not).
- **L13 `pilot branches prune` deletes `feat/<slug>` (user, itm_ec30065ef60a).** Once the feature PR merges, the
  pilot's closing step runs it, and GitHub's auto-delete setting is left alone. Cost: the deletion waits for the
  closing step, or for whoever runs the command.

- **L15 With a named run remote, slices get no PR (user, itm_7f02544830b8, 2026-10-12).** The slice branch is
  pushed there as the cloud copy. `pilot integrate` merges it with no PR (it already can), and it is pruned by
  ancestry (L5). Cost: off origin there is no PR page for a slice. Rejected: PRs on that remote with
  `feat/<slug>` mirrored there, which needs `--repo` on every gh call, a second feature-branch copy and its
  deletion: about two more slices.

## 6. Assumed decisions

- **A2 Local mode deletes no local branch.** Under `none`, merged local `slice/`, `design/`, `fix/` and `qa/`
  refs stay, because local cleanup is clean-landing (itm_09983af566aa). Cost: local branch lists grow until
  that lands.

## 7. Out of scope

- Hiding branches from viewers of origin: the opt-out moves them, it does not hide the feature PR.
- Slice PRs on a non-origin remote (L15).
- Migrating a run in flight (L8).
- Pruning origin's backlog during the run (L12).
- A `pilot pr` command (L6).
- Changing GitHub repository settings.
- Local worktree and branch cleanup, which is clean-landing (itm_09983af566aa).

## 8. Slices

Width 5; longest stem 4 (S1 → S2 → S4 → S8).

| Slice | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | `pilot base` puts `pilot` on the run remote (walking skeleton) | 1, 2, 3 | `scripts/remotes.mjs` (new), `scripts/pilot-branch.mjs`, `scripts/base.mjs`, `scripts/test/remotes.test.mjs` (new), `scripts/test/base-remote.test.mjs` (new) | – | typescript, security | [S1](slices/S1.md) |
| S2 | `pilot sync` merges origin's default into the run remote's `pilot` | 4 | `scripts/sync.mjs`, `scripts/test/sync-remote.test.mjs` (new) | S1 (remotes.mjs) | typescript | [S2](slices/S2.md) |
| S3 | `pilot integrate` takes `pilot` and the slice from the run remote | 4, 5 | `scripts/integrate.mjs`, `scripts/test/integrate-remote.test.mjs` (new) | S1 (remotes.mjs) | typescript | [S3](slices/S3.md) |
| S4 | `pilot land` lands onto the run remote's `pilot` | 4 | `scripts/land.mjs`, `scripts/test/land-remote.test.mjs` (new) | S1 (remotes.mjs), S2 (mergeIntoPilot) | typescript | [S4](slices/S4.md) |
| S5 | `pilot handoff` and the gate1 lineage read the run remote | 4 | `scripts/handoff.mjs`, `deck/lineage.mjs`, `scripts/test/handoff-lineage-remote.test.mjs` (new) | S1 (remotes.mjs) | typescript | [S5](slices/S5.md) |
| S6 | `pilot branches prune` deletes merged run branches, guarded | 6, 7, 8 | `scripts/branches.mjs` (new), `bin/pilot.mjs`, `scripts/test/branches.test.mjs` (new) | S1 (remotes.mjs) | typescript, security | [S6](slices/S6.md) |
| S7 | `pilot integrate` deletes the slice it merged | 6, 8 | `scripts/integrate.mjs` (after S3), `scripts/test/integrate-prune.test.mjs` (new) | S3 (integrate.mjs), S6 (deleteMerged) | typescript, security | [S7](slices/S7.md) |
| S8 | `pilot land` deletes the run's merged design/fix/qa branches | 6, 8 | `scripts/land.mjs` (after S4), `scripts/test/land-prune.test.mjs` (new) | S4 (land.mjs), S6 (deleteMerged) | typescript, security | [S8](slices/S8.md) |
| S9 | The crew's prose names the run remote and runs the prune | 5, 7, 9 | `agents/pilot.md`, `agents/pilot-implementer.md`, `agents/pilot-qa.md`, `agents/pilot-fundamentalist.md`, `agents/pilot-architect.md`, `scripts/test/measure-prompt.test.mjs`, `scripts/test/run-remote-prose.test.mjs` (new) | S1 (base's remote line), S6 (the prune command) | typescript, security | [S9](slices/S9.md) |
| S10 | README and ADR name `pilot.remote` | 10 | `README.md`, `docs/INSTALL.md`, `docs/adr/0134-run-branches-live-on-the-run-remote.md` (new), `docs/adr/README.md`, `scripts/test/run-remote-readme.test.mjs` (new) | – | typescript | [S10](slices/S10.md) |

S7 takes `scripts/integrate.mjs` after S3, and S8 takes `scripts/land.mjs` after S4. A stem never runs beside
its parent, so files owned stay disjoint between slices that can run at once.

## 9. Acceptance evidence

On a scratch deck against `HazzardRust/pilot-qa-upstream` (origin) and a second private repository (L11):

1. With `pilot.remote` unset, a one-slice scratch run pushes everything to origin and opens a slice draft PR,
   exactly as today. `pilot base` prints today's line.
2. `pilot integrate` merges the slice and prints `deleted slice/<…>`. Origin no longer lists that branch, and its
   PR reads merged.
3. A planted unmerged `fix/<slug>-s<n>` survives `pilot land` and is named in its output; a merged one is deleted (the
   S8 seam). Origin then lists `pilot`, `feat/<slug>` and the unmerged `fix/<slug>-s<n>`.
4. `git cat-file -e` succeeds on the Gate 1 sha and the slice merge sha from a fresh clone.
5. After the feature PR is merged on GitHub, `pilot branches prune --slug <slug>` deletes `feat/<slug>`.
6. With `pilot.remote` set to the second repository's remote, `pilot base` prints `… on <name>`. Origin's
   `ls-remote` lists only `feat/<slug>` from the run, and the feature PR reads `isCrossRepository: false`.
7. With `pilot.remote none`, `pilot base` prints `… local`. Origin lists only `feat/<slug>` from the run.
8. `git config pilot.remote nosuch` makes `pilot base` stop and name the key.
9. The README section reads right.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 1, 2, 3 |
| S2 | planned | | | | S1 | 4 |
| S3 | planned | | | | S1 | 4, 5 |
| S4 | planned | | | | S1, S2 | 4 |
| S5 | planned | | | | S1 | 4 |
| S6 | planned | | | | S1 | 6, 7, 8 |
| S7 | planned | | | | S3, S6 | 6, 8 |
| S8 | planned | | | | S4, S6 | 6, 8 |
| S9 | planned | | | | S1, S6 | 5, 7, 9 |
| S10 | planned | | | | – | 10 |
| pilot-fork | planned | feat/pilot-fork | | | S1–S10 | 1–10 |
