---
status: proposed
date: 2026-11-26
tags: [pilot-branch, git, host, security]
supersedes: []
superseded_by: []
paths: [scripts/pilot-branch.mjs, scripts/base.mjs, deck/host.mjs, deck/host-github.mjs, deck/host-gitlab.mjs, scripts/gate.mjs]
---
# The pilot branch is named for its user

We decided that the branch every Gate 2 lands on is `<login>-pilot`, the host CLI's signed-in user lower-cased, derived once and stored in the repository's local git config, and that the branch literally named `pilot` becomes a legacy branch the pilot reads and never writes. This amends ADR 0083's and ADR 0200's `pilot` wording; ADR 0200's cutting rule stands.

## Context

Every run landed on one shared branch named `pilot`. Two pilot users in one repository would land on each other's branch, and a contributor who does not know the plugin cannot tell that `pilot` is one person's working branch. The name was a module constant read from `PILOT_BRANCH` at import, so it could not differ per repository.

## Decision

- **L1 Copy and retarget.** The move creates the pilot branch at the legacy `pilot`'s tip; `pilot restack` retargets the user's open PRs; `pilot` is never written or deleted, and one line says it can be.
- **L2 Lands on only.** Cutting stays as ADR 0200 has it: main or the concluding `feat/<N>` on a host, the pilot branch under `pilot.host none` or another run remote.
- **L3 Stored once, warn on a switch.** The first derivation writes `git config --local pilot.branch`; later commands read it with no login read. `pilot doctor` warns when the signed-in account's `<login>-pilot` differs from it, and never switches.
- **L4 Refuse a bad login.** A login git would not take literally (`..`, a trailing `.` or `.lock`, anything off `[a-z0-9._-]` once lowered) is refused with the no-name line, never cleaned into a ref.
- **L5 One function per git runner.** `pilotBranch(git)`, remembered per runner like `runRemote`, reads env `PILOT_BRANCH`, then the stored name, and otherwise throws the no-name line naming `gh auth login`, `glab auth login` and `git config pilot.branch`. Only `namePilotBranch`, at the entry points that hold a host (`pilot base`, `sync`, `land`, `restack`, `doctor`), derives and stores. The **Host** gains `login()`, null when signed out.
- **L6** Callers on another git runner shape pass a string runner for the same directory; `pilotBranch` takes `(args) => string` only.
- **L7** The suite pins `PILOT_BRANCH=pilot` in `gateEnv`, so the fixtures that seed `pilot` stand unedited; a test of the derivation unsets it and uses another name.
- **L8 Legacy reads are one predicate.** `isPilotBase(base, name)` is `base === name || base === 'pilot'`; `landingSubjects(head, name)` answers both `Merge <head> into <name>` and `… into pilot`, so landings made before the move still count.
- **L9** `pilot restack` scopes its retarget and merge-forward to the signed-in user's own PRs.
- **L10** The legacy copy runs only when the run remote holds no `*-pilot` branch; a later user starts from the default branch's tip, never a stale `pilot`.
- **L11** CI triggers on `'*-pilot'` beside `main` and `feat/**`; `gate.yml`'s base test is `endsWith(github.base_ref, '-pilot')`.
- **L12** Only decisions whose paths give materially different deliverables went to the user; the rest stood as assumed.
- A name a config value or the env may hold is `^[a-z0-9][a-z0-9._-]*-pilot$` with no `..`, or the legacy `pilot`, checked before any git call; every push still passes `assertPushable`, argv only. `pilot.host none` needs `pilot.branch` set by hand once.

## Rejected

- GitHub's rename API: GitHub-only, and it stales every clone at once (L1).
- An alias branch written beside `pilot`: two names written per landing, and drift is a silent fork (L1).
- Cutting every run from the pilot branch (L2).
- Deriving per process: a network call per command, and a `gh auth switch` moves the line (L3).
- Cleaning a login into a ref: two logins collide silently (L4).
- Keeping a module constant that spawns git at import: bound to the importer's directory, wrong in the deck daemon (L5).
- Editing the ~67 fixtures that seed `pilot`: no behaviour gained (L7).
- Keeping `pilot` under `pilot.host none`: a guessed name.

## Consequences

- A repository under `pilot.host none` that worked before stops with the no-name line until `git config pilot.branch <name>-pilot` is set.
- A stored name naming another user's branch is warned, not refused: setting it by hand is how a user deliberately shares a line.
- `PILOT_BRANCH` and `pilot.branch` accept a closed shape only; `main`, `feat/x` and the like are refused where they are read.
- The legacy `pilot` lingers on the remote until its owner deletes it.
