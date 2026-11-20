# Two devices, one repo

Ticket `itm_c844d6d00d8e` · slug `two-devices` · base `origin/pilot` dc5f7beb · ADR NNNN (`docs/adr/NNNN-two-devices.md`, S3)

## 1. Problem

The user wants to carry on work on this repository from a second device that has pilot and the same accounts
signed in. Not a session continuation: git is what the two devices share. They want the rule written down, a
warning before two decks cut the same slug, and a setup path for device 2, and explicitly no syncing of the
deck's store.

## 2. Spec

| # | Behaviour | Evidence | Bar |
| --- | --- | --- | --- |
| 1 | The rule is written where the crew and the user read it: `docs/OPERATING.md` `## Two devices, one repo`, four numbered rules (git is the shared state; each device runs its own deck; one device owns the queue and the landings on `pilot`; the other hands work over by a pushed branch and a PR), and it says two decks landing is already git-safe, so the owner rule is about the queue. `agents/pilot.md` links the section. | `scripts/test/two-devices-doc.test.mjs`, a structural lint (A3) | heading present once; exactly 4 numbered rules; 1 link from `agents/pilot.md` to `docs/OPERATING.md#two-devices-one-repo`; every `pilot <verb>` in the section is a verb `pilot help` lists |
| 2a | `pilot doctor slug <slug>` reads origin (and the run remote) live and prints one line per clash: `feat/<slug>` or `design/<slug>` on a remote, or an open PR from either; a free slug prints `free <slug>`. The pilot runs it at step 1 when it names a slug (L8). | `deck/test/slug-clash.test.mjs` with a bare-repo remote and a stub Host | clash: exit 1, 1 line per clash naming the ref or `PR #<n>`; free: exit 0, 0 clash lines; a non-slug argument: exit 2, git never called |
| 2b | Bare `pilot doctor` has a `slugs` row and `pilot start` prints the same clash lines before it opens the window, over the slugs this deck holds queued: an open ticket whose body names `docs/design/<slug>/`, with no run record here (L8). Neither refuses (A2). | `deck/test/doctor-slugs.test.mjs`; `scripts/test/start-slugs.test.mjs` | a held clashing slug: row `fail` naming it, start prints it and still opens; none held or all free: row `pass`, start prints 0 lines |
| 2c | The check reads the remote live, never stale tracking refs; an unreachable remote or host reads `cannot tell`, never free. *practitioner: release engineer, who `ls-remote`s before cutting a shared branch name* | `deck/test/slug-clash.test.mjs` | a stale local `origin/feat/<slug>` alone: free; remote unreachable: `cannot tell`, exit 1 |
| 3 | A second device is set up from one section, `### Setting up a second device`: install pilot, clone, `pilot host <name>`, the same `pilot.remote` as device 1 (never `none`, A5), CLIs on PATH and signed in, `pilot doctor`, `pilot start`. | the user follows it on device 2 and `pilot doctor` reads pass (their walkthrough); agents: a fresh clone in scratch, the section's commands, `pilot doctor` | every step a numbered line with its command; `pilot doctor` 0 `fail` rows on the scratch clone |
| 4 | Nothing here syncs the store, commits tickets or records to the repo, or exports and imports them. | `git diff --stat origin/pilot...feat/two-devices -- deck/store*.mjs docs/adr/0028* docs/adr/0044*` | 0 files; the only deck read is `GET /api/tickets` |

## 3. Findings

- `bin/pilot.mjs:249-273` `start`: takes no argument, opens a window (Windows) or prints the `claude` line; no
  slug, repository or deck check. So "the slug this deck is about to cut" is unknowable there (L8).
- No slug field on a queued ticket (`deck/ticket-shape.mjs:19-32`); the slug first appears at gate1 as
  `plan.slug` (`deck/store-items.mjs:649`) and in the run record from the first `deck_status`
  (`deck/store-runs.mjs:655`). A body may name `docs/design/<slug>/architecture.md` (run-split tickets).
- Nothing refuses or warns on an existing slug: no `ls-remote` or PR list runs before a cut
  (`scripts/feature-pr.mjs:152` runs after; `scripts/branches.mjs:48` `tipsOn` is prune only). The architect's
  `git worktree add -b design/<slug>` fails only on a local branch.
- `GET /api/tickets?repo=&open=1` (`deck/server-routes.mjs:608`, `deck/tickets.mjs:63` `queueView`) answers every
  open ticket's body and the repository's run records' slugs: a read that marks nothing delivered.
- `deck/doctor.mjs:409-445` `checkAll`, `:457` `main`: rows `pass`/`fail`/`cannot tell`; exit 1 on a `fail`;
  `defender due` is the verb-with-exit-code precedent `slug` copies. It already takes `git` and `hostFor`.
- `deck/host.mjs:12` `Host.reviews({ head, state })`: the open-PR probe on GitHub and GitLab; `hostFor` is null at
  `pilot.host none`, where no PR exists to clash.
- `scripts/remotes.mjs` `runRemote`, `remoteOf`: `feat/` lives on origin, `design/` on the run remote (null under
  `none`, local refs only, so device 1's `design/` is invisible to device 2: A5).
- `scripts/land.mjs:9-10,243-249`: `pilot land` fetches, re-merges once onto a moved `pilot`, pushes non-force,
  and on a second move stops "run pilot land again"; tests `land.test.mjs:37`, `land-remote.test.mjs:124`.
  `sync.mjs:150-158` pushes non-force and tags `pushRejected`. Two decks landing is git-safe today.
- ADR 0180 L5-L6: no test pins a phrase in prose; a structural lint is the form (`scripts/test/operating-runbook.test.mjs`
  is the precedent for an OPERATING.md section).
- `scripts/install-permissions.mjs:172-196`: read-only pilot verbs are allowed by exact rule (ADR 0186); `pilot doctor`
  has none, so the pilot's step-1 run would prompt.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| Slug clash | `slugClashes(slug, { git, host })` → `{ clashes: Clash[], unread?: string }` | `runRemote`/`remoteOf`, `tipsOn` per remote, `host.reviews` open by head for both branches, slug validation | local-substitutable (git: a bare repo) + true external (Host: a stub adapter) |
| Held slugs | `heldSlugs(view)` → `string[]` | ticket bodies' `docs/design/<slug>/`, minus record slugs, `SLUG`-checked, deduped | in-process (pure) |
| Doctor slug verb | `pilot doctor slug <slug>`; `slugsRow({ view, git, hostFor })` | the printing and exit code of 2a; the row of 2b, which `start` prints | in-process over the two above |

Deletion test: `tipsOn` survives (prune and clash, two callers; exported, no fold slice). `heldSlugs` vanishes
into its one caller if deleted, but it is the pure seam 2b's test needs; kept. No fold slice.

## 4. Ubiquitous language

- **Owner device**: the one device whose deck holds the queue and lands on `pilot`.
- **Hand-over**: the other device's work arriving as a pushed branch and a PR, never as store data.
- **Clash**: `feat/<slug>` or `design/<slug>` on a remote, or an open PR from either, for a slug this deck has no record of.
- **Held slug**: a slug an open ticket's body names as `docs/design/<slug>/`, with no run record on this deck.

## 5. Locked decisions

- **L1** Depth: forks (user, itm_09b174565601): only decisions whose paths build materially different deliverables are posted.
- **L2** No store sync, export or commit (user's ticket, spec 4). Rejected: sharing the store through git (ADR 0006, 0028, 0044).
- **L3** One clash module, `deck/slug-clash.mjs`, read by the verb, the row and start. Rejected: a check in each caller.
- **L4** A slug from argv or a ticket body is held to `SLUG` (`deck/runs.mjs:248`) before it reaches git or the host;
  git runs as argv. Rejected: passing the raw word to `ls-remote`.
- **L5** A slug with a run record on this deck is never a clash: its branches are this deck's own (red team).
- **L6** Small-diff limit 400 changed lines per slice; past it the implementer stops and asks `main`.
- **L7** The run's ADR is `docs/adr/NNNN-two-devices.md`, written in S3; the landing numbers it.
- **L8** Spec 2's shape (user, itm_5592c6cfc6b8): `pilot doctor slug <slug>` run by the pilot at step 1, a `slugs`
  row in bare `pilot doctor`, the same lines from `pilot start` for queued tickets whose body names
  `docs/design/<slug>/`; origin read live, offline `cannot tell`. Rejected: a step-1 check only.

## 6. Assumed decisions

- **A1** The owner device is told by convention only: the doc's rule, no setting. Trades: Sign off on device 2 lands
  on `pilot` itself; git-safe (land.mjs:243). Rejected: `git config pilot.owner false` making `pilot land` refuse on
  device 2 and name the PR (a 4th slice, a refusal path in land). Posted itm_bfe82a9f0104.
  User answer: Convention only (itm_bfe82a9f0104).
- **A2** Warn, not refuse: `pilot doctor slug` exits 1 on a clash and the pilot picks another slug; start and bare
  doctor only print. Trades: a hand cut is not stopped. Rejected: start refusing to open (a stale or offline check
  blocks starting). Posted itm_2cfc074cc683.
  User answer: Warn (itm_2cfc074cc683).
- **A3** Spec 1's "prose test pins the four clauses" becomes a structural lint (count of numbered rules, the link,
  real verbs), because ADR 0180 L5-L6 forbids a phrase pin. Trades: a reword that drops a clause's meaning passes.
  Rejected: a phrase pin (cut by ADR 0180). Not posted (covered by an ADR; main).
- **A4** A clash on a held slug is a `fail` row (doctor exits 1), not a new `warn` verdict. Trades: doctor goes red
  for something that refuses nothing. Rejected: a fourth verdict across every row printer. Not posted.
- **A5** The setup section says both devices set the same `pilot.remote`, never `none`; `pilot doctor slug` under `none`
  reads `cannot tell` for `design/`. Rejected: probing local refs as if shared. Not posted (codebase fact).
- **A6** `Bash(pilot doctor slug *)` joins the read-only allow rules (ADR 0186), so step 1 does not prompt. Trades:
  one more allow rule. Rejected: the pilot's run prompting the user. Not posted.

## 7. Out of scope

- Syncing, exporting or importing the deck store, tickets, threads or records (L2).
- A cross-device lock or lease on `pilot` or the queue; a deck learning of another deck.
- Changing `pilot land` or `pilot sync` (already git-safe; A1 answered convention only).
- Session continuation across devices; renaming a slug already cut.

## 8. Slices

Width 2; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Walking skeleton: `pilot doctor slug <slug>` names a clash on origin | 2a, 2c, 4 | `deck/slug-clash.mjs` (new), `deck/doctor.mjs`, `scripts/branches.mjs`, `scripts/install-permissions.mjs`, `scripts/test/install-permissions.test.mjs`, `deck/test/slug-clash.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | Bare doctor and start show clashes on the slugs this deck holds | 2b, 4 | `deck/doctor.mjs`, `bin/pilot.mjs`, `deck/test/doctor-slugs.test.mjs` (new), `scripts/test/start-slugs.test.mjs` (new) | S1 (`deck/doctor.mjs`, `slugClashes`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |
| S3 | The two-device rule and device-2 setup are written and the pilot runs the slug check | 1, 3, 4 | `docs/OPERATING.md`, `agents/pilot.md`, `scripts/test/two-devices-doc.test.mjs` (new), `docs/adr/NNNN-two-devices.md` (new) | S1 (`pilot doctor slug` verb) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S3](slices/S3.md) |

S1 first: if `ls-remote` or the Host probe cannot answer cleanly, 2b and step 1 both change. S2 and S3 run side by
side (disjoint files).

- red team: the owner device's own live run has `design/<slug>` and `feat/<slug>` on origin; a held-slug check would
  flag itself. L5 skips slugs with a record; S2 behaviour 2 pins it.
- red team: a stale `refs/remotes/origin/feat/<slug>` (deleted on origin after a merge) would read as a clash from
  tracking refs. S1 reads `ls-remote` (spec 2c, behaviour 3).
- red team: under `pilot.remote none` device 1's `design/` is local-only; device 2 would read free. A5: setup forbids
  `none`, and S1 reads `cannot tell` there for `design/`.
- red team: `start` is synchronous and opens a window; a hung `ls-remote` would delay it. S2 bounds the deck read
  (`TIMEOUT_MS` as `pilot base`) and the git read by the existing leash; on timeout prints `cannot tell`, still opens.
- red team: S1 and S2 both edit `deck/doctor.mjs` (`main`'s verb parse vs `checkAll`): serial, S2 after S1.
  Seams half-built by two slices: none; `slugClashes` is whole in S1.
- red team: a landed run's `design/<slug>` is pruned on merge but `feat/<slug>` stays on origin until its PR merges to
  main; reusing that slug reads a clash, which is right (the open feature PR would collide).
- red team: S3 behaviour 5's scratch clone is a new directory with no tickets on this deck, so its `slugs` row passes;
  a `fail` there is another row, named in the report.

## 9. Acceptance evidence

1. On device 1, `pilot doctor slug two-devices` prints the clash lines for `feat/two-devices` and `design/two-devices`
   (exit 1); `pilot doctor slug some-free-name` prints `free` (exit 0) (spec 2a).
2. Offline, it reads `cannot tell` (spec 2c).
3. A queued ticket naming `docs/design/<taken>/` shows in bare `pilot doctor`'s `slugs` row and in `pilot start`'s
   output, and the window still opens (spec 2b).
4. `docs/OPERATING.md` `## Two devices, one repo`: four rules, the land-is-safe note, and the setup steps (spec 1).
5. On device 2, the user follows the setup section; `pilot doctor` reads pass; `pilot start` opens (spec 3).
6. The feature diff touches no `deck/store*.mjs` (spec 4).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | `slice/two-devices-s1` | – | – | – | 2a, 2c, 4 |
| S2 | planned | `slice/two-devices-s2` | – | – | S1 | 2b, 4 |
| S3 | planned | `slice/two-devices-s3` | – | – | S1 | 1, 3, 4 |
| Two devices, one repo | planned | `feat/two-devices` | – | – | S1-S3 | 1-4 |
