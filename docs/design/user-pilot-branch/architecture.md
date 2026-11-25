# The pilot branch is named for its user

Ticket `itm_0476cd419c86` · slug `user-pilot-branch` · design cut from `origin/feat/reply-markdown` at `109f613`.

## 1. Problem

Every run lands on one shared branch literally named `pilot`. Two pilot users in one repository would land on
each other's branch, and a contributor who does not know the plugin cannot tell that `pilot` is one person's
working branch. The user wants it named `<gh-user>-pilot`, here `hazzardrust-pilot`.

## 2. Spec

| # | Behaviour | Evidence | Bar |
|---|---|---|---|
| 1 | The branch every Gate 2 lands on is `<login>-pilot`, lower-cased from the host CLI's signed-in user, derived on first use and stored as `git config --local pilot.branch`. Cutting is unchanged (ADR 0200): main or the concluding `feat/<N>` on a host, the pilot branch under `pilot.host none` or another run remote. | test, seeded login `HazzardRust`: `pilot base`, `pilot sync`, `pilot land`, `pilot restack` name `hazzardrust-pilot`; config holds it | 4 commands name it; 0 login reads on a second run |
| 2 | Two users, two clones, one remote: each landing and sync pushes only its own `<login>-pilot`, and `pilot restack` touches only the signed-in user's own PRs. | test, two seeded names: the other branch's tip and the other user's PR base unchanged | 0 writes to the other's branch or PRs |
| 3 | A repository with a legacy `pilot` and no `<login>-pilot`: the first `pilot base` creates it at `pilot`'s tip, `pilot restack` retargets the user's open PRs based on `pilot` to it, run records with base `pilot` read as it, and landings made before the move still count. `pilot` itself is left untouched (L1). | test on a seeded repo; live on QA's scratch GitHub repo (L13): 2 PRs on `pilot` | both PR bases = new branch; new tip = old tip; `pilot` tip unchanged; a pre-move landing reads landed |
| 4 | One derivation: no literal branch `pilot` in `bin/`, `scripts/`, `deck/*.mjs` outside `scripts/pilot-branch.mjs`; CI triggers on `'*-pilot'`; agents and docs say "your pilot branch (`<login>-pilot`)". | structural test; CI run on a PR to `hazzardrust-pilot` | 0 hits; 1 green CI run on that PR |
| 5 | No name to read (host CLI signed out or `pilot.host none`, no stored name, no `PILOT_BRANCH`): exit 1 with one line naming `gh auth login` / `glab auth login` and `git config pilot.branch <name>`; nothing created. | test per case | exit 1; 0 refs and 0 config written |
| 6 | A login git would not take literally as a branch (`..`, a trailing `.` or `.lock`, anything off `[a-z0-9._-]`) is refused with spec 5's line, never cleaned (user, itm_20ed8652604a). | test per bad shape | exit 1 per shape; 0 refs |
| 7 | `pilot doctor` has a pilot-branch row: the name and its source (env, stored); a signed-in account whose `<login>-pilot` differs from the stored name is a warn row, never a switch (user, itm_5eefba8d691c). | test per state | 4 states, 4 rows: pass, pass, warn, fail |
| 8 | Two devices on one account (ADR 0207) get the same branch with no shared state. practitioner: release engineer — a line must not depend on which machine landed. | test, two clones, same seeded login | 1 name across 2 clones; 0 deck reads |
| 9 | A second user joining a repository that has already moved starts from the default branch's tip, never from the stale `pilot`. red team: the legacy copy alone would hand user B user A's old line. | test: `a-pilot` and `pilot` on origin, login `b` | `b-pilot` tip = default tip; 0 commits from `pilot` |
| 10 | (added, A6) Until a repository moves, a push or PR to the legacy `pilot` still runs the Gate and Rune deck CI. | gate-workflow test: a draft to `pilot` runs | 1 draft to `pilot` runs the gate |

Spec 1, 6 and 7 are the user's (main, 2026-11-24); 2-5, 8, 9 stand *assumed* as proposed.

## 3. Findings

- `scripts/pilot-branch.mjs:24-32`: `PILOT_BRANCH`, a module constant from env `PILOT_BRANCH` else `'pilot'`,
  validated by `PLAIN` and lower case. `ensurePilotBranch` (:141) creates the branch from origin's `pilot` or the
  default tip; `pilotLineage` (:213) builds the upstream from it.
- Consumers of the constant (~65 sites): `scripts/integrate.mjs`, `land.mjs`, `release.mjs`, `sync.mjs`,
  `stack.mjs`, `base.mjs`, `branches.mjs`, `feature-pr.mjs`, `worktrees.mjs`, `deck/gate2-base.mjs`, `deck/lineage.mjs`.
- Literal bypasses: `scripts/pilot-tip.mjs:18`, `deck/recut.mjs:178`, `deck/store-items.mjs:482`,
  `deck/closing-report.mjs:128,137`, `deck/tickets.mjs:94`, `deck/runs.mjs:258` (`RUN_BASE`'s `pilot|`), and
  `.github/workflows/ci.yml:8`, `gate.yml:10,13,27`.
- Landing detection reads commit subjects: `integrate.mjs:331` `Merge <head> into ${PILOT_BRANCH}`, and
  `release.mjs:19` its own copy as a regex. After a rename the old landings say `into pilot`.
- `scripts/remotes.mjs:19-47`: `oncePerRunner` and `runRemote`, the pattern for a per-repo `pilot.*` setting read
  once per git runner. `deck/host.mjs:27-39`: `pilot.host`, GitHub when unset.
- `deck/host-github.mjs:229` `signedIn` already runs `api user --jq .login`; `reviews({ mine })` filters by
  `--author @me` (:171). GitLab adapter beside it.
- `scripts/stack.mjs:32-103`: `restack` walks every open feature PR in the repo and retargets with `host.edit`;
  `prBase` throws on a base that is neither the pilot branch, main nor `feat/`.
- Live state: 10 open PRs based on `pilot` (#137, 139, 142-144, 152-156); `pilot` unprotected; default `main`.
- ~67 test files seed `pilot` / `origin/pilot`; `scripts/gate.mjs:99` `gateEnv` is the suite's env.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| `scripts/pilot-branch.mjs` | `pilotBranch(git)`, `namePilotBranch({ git, host })`, `isPilotBase(base, name)`, `landingSubjects(head, name)`, `LEGACY_PILOT`, `ensurePilotBranch({ git, host })` | `PILOT_BRANCH`, 7 literal `pilot`s, `base === PILOT_BRANCH` checks, `release.mjs`'s `LANDING` copy | local-substitutable (git in a temp repo) |
| Host adapter (`deck/host.mjs`) | `login(): string \| null` | the login read inside `signedIn` | true external (`gh`, `glab`): fake adapter in tests |
| `restack` (`scripts/stack.mjs`) | `restack({ cwd, git, host })` | `prBase`'s legacy mapping, the `mine` filter | remote-but-owned (host through the adapter) |

Deletion test: `PILOT_BRANCH` deleted, the env read reappears in 11 modules, so it earns a seam; it becomes a
function because the name is now per repository. `pilot-tip.mjs` survives (hooks call `pilotTip`). `release.mjs`'s
`LANDING` is a shallow duplicate of `landingMessage`: folded into `landingSubjects`.

## 4. Ubiquitous language

- **pilot branch**: the signed-in user's `<login>-pilot` in this repository; where Gate 2 lands.
- **legacy pilot**: the branch literally named `pilot`, from before this feature; read, never written.
- **stored name**: `pilot.branch` in the repository's local git config.
- **the move**: the first `pilot base` that copies the legacy pilot's tip to the pilot branch, and the restack after it.
- **login**: the host CLI's signed-in user name, as `gh api user` / `glab api user` answer it.

## 5. Locked decisions

- **L1 Copy and retarget** (user, itm_8d6db0970c4b). The move creates the pilot branch at the legacy pilot's tip;
  restack retargets; `pilot` is never written or deleted; one line says it can be deleted. Rejected: GitHub's rename
  API (GitHub-only, stales every clone at once); an alias (two names written per landing, drift is a silent fork).
- **L2 Lands on only** (user, itm_017a5456a1ed). Cutting stays as ADR 0200 has it. Rejected: cutting every run from it.
- **L3 Stored once, warn on a switch** (user, itm_5eefba8d691c). Local git config, written on first derivation.
  Rejected: deriving per process (a network call per command; a `gh auth switch` moves the line).
- **L4 Refuse a bad login** (user, itm_20ed8652604a). Rejected: cleaning it into a ref (two logins collide silently).
- **L5 The seam is a function per git runner**, `pilotBranch(git)` via `oncePerRunner`, like `runRemote`.
  Precedence: env `PILOT_BRANCH`, then the stored name; neither throws spec 5's line. Only `namePilotBranch`, at
  the entry points holding a host (`pilot base`, `pilot sync`, `pilot land`, `pilot restack`, `pilot doctor`), derives
  and stores. Rejected: keep the constant and spawn git at import (cwd-bound, wrong in the deck daemon).
- **L6 Callers on another git runner shape** (`gitUnder`'s spawn result, `recut`'s async git) pass a string runner
  for the same cwd; `pilotBranch` takes `(args) => string` only.
- **L7 The suite pins `PILOT_BRANCH=pilot`** in `gateEnv`, so the ~67 fixtures stand unedited; every new test
  unsets or overrides it and uses a non-`pilot` name. Rejected: editing 67 files (no behaviour gained).
- **L8 Legacy reads are one predicate**: `isPilotBase(base, name)` is `base === name || base === LEGACY_PILOT`;
  `landingSubjects` answers both `into <name>` and `into pilot`.
- **L9 Restack scopes to `mine`** for its retarget and merge-forward, so a second user's PRs are never touched.
- **L10 Spec 9**: the legacy copy runs only when origin holds no `*-pilot` branch; else the default tip.
- **L11 CI** triggers on `'*-pilot'` and `main`/`feat/**`; `gate.yml`'s base test is `endsWith(github.base_ref, '-pilot')`.
- **L12 Grilling depth: forks** (user, itm_210405d6a2eb): only decisions whose paths give materially different
  deliverables are posted; the rest stand as A‹n›.
- **L13 QA environment** (user, itm_e01ae7f5c98e; was A1). QA creates a private `HazzardRust/pilot-branch-scratch`
  with `gh`, seeds `pilot` + 2 feat PRs, and the user deletes it after Gate 2. Rejected: tests only (the first real
  retarget would be this repo's 10 PRs); a user-made repo (one more handoff).
- Recorded as `docs/adr/NNNN-user-pilot-branch.md` (ADR NNNN), amending ADR 0083 and ADR 0200's `pilot` wording.

## 6. Assumed decisions

- **A1 QA environment**: moved to §5 as L13 (user, itm_e01ae7f5c98e).
  Verdict: stands — the user chose it on itm_e01ae7f5c98e; now L13
- **A2 `pilot.host none` needs `pilot.branch` set** by hand once (spec 5), so a local-only repository that works
  today stops until it is set. Trades one command for "never guess". Rejected: `none` keeps `pilot`.
  Verdict: stands — the user agreed never guessing a name; no queued ticket depends on host none
- **A3 Spec 2-5, 8, 9 as proposed**, not yet confirmed by the user.
  Verdict: stands — spec 9 is a consequence of spec 2
- **A4 What a name can reach** (security). `PILOT_BRANCH` and `pilot.branch` are accepted only as
  `^[a-z0-9][a-z0-9._-]*-pilot$` (no `..`, no `.lock` or `.` end) or the legacy `pilot`, before any git call, so
  neither can name an option, a refspec, `HEAD`, a `feat/`/`slice/` branch or the default branch; every push still
  passes `assertPushable`, argv only. A derived login passes the same test (spec 6). Trades a free-form override
  for a closed shape. Rejected: today's `PLAIN` alone (would let `pilot.branch=main-line` or `feat/x` be the line).
  Verdict: stands
- **A5 A stored name naming another user's branch** is warned, not refused: `pilot doctor`'s spec 7 row says the
  stored name is not `<login>-pilot`; landings proceed. Git holds no ownership to check, and a hand-set name is how a
  user deliberately shares a line or runs `pilot.host none`. Trades: user B can land on `a-pilot` if B sets it by
  hand. Rejected: refusing every push whose name differs from the signed-in `<login>-pilot` (a login read per push,
  and no answer under `pilot.host none`).
  Verdict: stands — setting another user's name is a deliberate local act; refusing would break host none
- **A6 Legacy `pilot` kept as a CI trigger until the move** (added) — assumed from itm_7a23388d2dec's default,
  unanswered; departs from L11 as signed; awaits the user at Gate 2. Trades one more trigger name on two workflows
  for CI on the 10 PRs still based on `pilot` until `pilot restack` retargets them. Rejected: L11 as signed
  (`*-pilot` only), under which those PRs run no CI until the move.

## 7. Out of scope

Deleting the legacy `pilot`; branch protection; renaming `feat/`, `slice/`, `design/` per user; the deck's
`base` field values in old run records (read through `isPilotBase`, never rewritten); `pilot.remote` semantics.

## 8. Slices

Width 6; longest stem 3 (S1 → S2 → S6).

| Slice | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | `pilot base` names and creates your pilot branch (walking skeleton) | 1, 3, 5, 6, 8, 9 | `scripts/pilot-branch.mjs`, `deck/host.mjs`, `deck/host-github.mjs`, `deck/host-gitlab.mjs`, `scripts/base.mjs`, `scripts/gate.mjs`, `scripts/test/pilot-branch-name.test.mjs` (new), `docs/adr/NNNN-user-pilot-branch.md` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | Integrate and sync land on your pilot branch | 1, 2, 3 | `scripts/integrate.mjs`, `scripts/sync.mjs`, `scripts/worktrees.mjs`, `scripts/test/integrate-user-branch.test.mjs` (new) | S1 (`pilotBranch`, `landingSubjects`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |
| S3 | `pilot land` and the release PR name your pilot branch | 1, 3 | `scripts/land.mjs`, `scripts/release.mjs`, `deck/closing-report.mjs`, `deck/store-items.mjs`, `scripts/test/land-user-branch.test.mjs` (new) | S1 (`pilotBranch`, `landingSubjects`, `isPilotBase`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S3](slices/S3.md) |
| S4 | Restack retargets your `pilot` PRs and leaves others' | 2, 3 | `scripts/stack.mjs`, `scripts/feature-pr.mjs`, `scripts/test/restack-user-branch.test.mjs` (new) | S1 (`namePilotBranch`, `isPilotBase`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S4](slices/S4.md) |
| S5 | The deck and the tip reads follow your pilot branch | 1, 4 | `deck/gate2-base.mjs`, `deck/lineage.mjs`, `deck/recut.mjs`, `deck/tickets.mjs`, `deck/runs.mjs`, `deck/tools.mjs`, `scripts/pilot-tip.mjs`, `scripts/branches.mjs`, `deck/test/deck-user-branch.test.mjs` (new) | S1 (`pilotBranch`, `isPilotBase`) | `pilot:typescript-reviewer` | [S5](slices/S5.md) |
| S6 | One name: the constant goes, CI triggers on `*-pilot` | 4 | `scripts/pilot-branch.mjs` (the `PILOT_BRANCH` export deleted), `.github/workflows/ci.yml`, `.github/workflows/gate.yml`, `bin/pilot.mjs`, `scripts/test/one-branch-name.test.mjs` (new) | S2 (`PILOT_BRANCH` consumers), S3 (same), S4 (same), S5 (same) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S6](slices/S6.md) |
| S9 | (added) Legacy `pilot` stays a CI trigger until the move | 10 | `.github/workflows/ci.yml`, `.github/workflows/gate.yml`, `scripts/test/gate-workflow.test.mjs` | S6 | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S9](slices/S9.md) |
| S7 | `pilot doctor` shows your pilot branch and warns on a switched account | 7 | `deck/doctor.mjs`, `deck/test/doctor-pilot-branch.test.mjs` (new) | S1 (`namePilotBranch`, `login`) | `pilot:typescript-reviewer` | [S7](slices/S7.md) |
| S8 | Agents and docs say "your pilot branch" | 4 | `agents/pilot.md`, `agents/pilot-lander.md`, `agents/pilot-architect.md`, `agents/pilot-auditor.md`, `agents/pilot-co-pilot.md`, `rules/vertical-execution.md`, `README.md`, `GLOSSARY.md`, `CLAUDE.excerpt.md`, `docs/OPERATING.md`, `docs/INSTALL.md`, `skills/domain-modeling/ADR-FORMAT.md` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S8](slices/S8.md) |

S6 deletes the `PILOT_BRANCH` export from `scripts/pilot-branch.mjs` through S1's seam: S1 keeps it as
`export const PILOT_BRANCH` only for the unfolded consumers and S6's structural test fails while any import remains;
the deletion is S6's one line in a file S1 owns, after S1 has integrated.

Shared with land-batching (`design/land-batching`, Gate 1 signed, queued): `scripts/gate.mjs` (S1 here; its S6, S7),
`scripts/integrate.mjs`, `scripts/sync.mjs`, `scripts/worktrees.mjs` (S2; its S3, S4, S5), `scripts/land.mjs` (S3;
its S1, S2, S5), `scripts/branches.mjs` (S5; its S5). Land-batching first is cheaper: its change is structural (one
`gitView` through the landing), ours a name swap per site that re-applies on top; the other order makes its slices
re-thread `pilotBranch(git)` through `tipOf` refs. Neither order makes a slice here unbuildable: S1, S2, S3, S5 merge
land-batching's feature first when it has landed, and S1's `gateEnv` line sits beside its spawn constants, not in them.

Red team (walked each first behaviour against the files):
- red team: `release.mjs:19` keeps its own `LANDING` regex; S2 and S3 would each half-build landing detection.
  Folded into S1's `landingSubjects`, so S2 and S3 run side by side.
- red team: `deck/lineage.mjs` and `deck/gate2-base.mjs` run git through `gitUnder` (a spawn result, not a string)
  and `recut` through async git; a `pilotBranch(git)` taking any runner breaks there. L6 fixes the shape.
- red team: `restack` walks every open PR in the repository; with two users it would retarget the other's. L9.
- red team: the legacy copy alone hands a second user the first user's stale `pilot`. Spec 9, L10.
- red team: old landings say `into pilot`; a name-only subject match reads every pre-move feature as unlanded. L8.

## 9. Acceptance evidence

1. In QA's scratch repo (L13), signed in: `pilot base` prints `base … ` and `git config pilot.branch` reads
   `hazzardrust-pilot`; `git ls-remote origin hazzardrust-pilot` equals the old `pilot` tip (spec 1, 3).
2. `pilot restack` prints `retargeted #<n> to hazzardrust-pilot` twice; both PRs show that base on GitHub (spec 3).
3. A feature taken through Gate 2 lands on `hazzardrust-pilot`; `pilot` is unchanged (spec 1, 3).
4. A second clone with `git config pilot.branch other-pilot` lands; `hazzardrust-pilot` unchanged (spec 2).
5. `gh auth logout` in a fresh clone: `pilot base` exits 1 with the line (spec 5).
6. `pilot doctor` shows the branch row; `PILOT_BRANCH` unset and a different seeded login shows the warn (spec 7).
7. CI runs on a PR to `hazzardrust-pilot` (spec 4).

User steps after landing: none required; delete `pilot` on GitHub when content (L1). No branch protection exists today.
This repository moves when the released plugin runs its first `pilot base` here: 10 PRs are retargeted then.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 1, 3, 5, 6, 8, 9 |
| S2 | planned | | | | S1 | 1, 2, 3 |
| S3 | planned | | | | S1 | 1, 3 |
| S4 | planned | | | | S1 | 2, 3 |
| S5 | planned | | | | S1 | 1, 4 |
| S6 | planned | | | | S2, S3, S4, S5 | 4 |
| S9 | planned (added) | | | | S6 | 10 |
| S7 | planned | | | | S1 | 7 |
| S8 | planned | | | | – | 4 |
| feature | planned | `feat/user-pilot-branch` | | | | 1-9 |
