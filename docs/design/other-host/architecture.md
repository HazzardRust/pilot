# The pilot runs on a host other than GitHub

Ticket itm_b18bcafffbce · slug `other-host` · base `origin/pilot` 0a9a978a · merge: decided before (not this
session's planning ticket; the live ticket is itm_a2aeb8349afc) · re-cut of the October plan (ecdd81f4, gone
from origin; read from the `pilot-archive` worktree) after deck-writes-github landed (bc75cc5b)

## 1. Problem

The deck is built around GitHub: the feature PR, the landing's comment and retarget, the main PR, branch prune
and `pilot tickets` all start `gh`. Someone whose repository lives on GitLab, on a plain git server, or on no
server at all cannot run the pilot. The user: "this kind of ruins the agnosticity - building around github".

## 2. Spec

Agreed by the user in October (itm_fe12eadc0ed4); re-cut against today's code. Spec changes from the ticket
body, accepted by `main` on 2026-11-17, are marked **change**.

1. The host is the git setting `pilot.host` (`github`, `gitlab`, `none`), which the install asks for and
   `pilot host <name>` writes; unset reads as `github`. `pilot doctor` shows it and checks only that host's CLI.
   *Evidence: `pilot host` tests over a fake git, doctor tests; bar: 3 answers write 3 values, a 4th name is
   refused naming the key, doctor at `none` checks 0 host CLIs, at gitlab fails naming `glab` when absent.*
   **change**: `gitea` dropped, carried from October's signed A3 (no adapter is built; an answer that fails at
   the first PR is worse than none).
2. Every host call goes through `deck/host.mjs`: `hostFor` returns one **Host** adapter, and the GitHub adapter
   is today's `hostIn` allowlist and argv moved behind verbs, not rewritten. *Evidence: one contract table run
   against each adapter over a fake CLI; the deck-writes-github bar widened; bar: every verb returns the same
   shape on both adapters, 0 `gh`/`glab` process starts outside `deck/host-*.mjs`, 0 exports of `hostIn`.*
   practitioner: multi-forge tool maintainer: state normalised to `open|merged|closed`, a review found by its
   head branch, never by title.
3. At `none` a feature is a branch landed on pilot: no host CLI starts, the gate2's `pr` names `feat/<slug>`
   beside its `sha`, the landing prints `main gets pilot: merge pilot into main by hand`, the closing report
   names branches to merge. *Evidence: a fixture run at `none` (bare remote, integrate, `pilot pr`, land,
   report) over a fake CLI that throws if started; bar: 0 host CLI starts, 0 `#\d+` in the report, a gate2
   with `pr: feat/<slug>` accepted.* **change**: "a slice is a branch pushed and reviewed" is already true
   today on every host (`agents/pilot-implementer.md:127`, "Open no PR"), so no slice builds it.
4. A GitLab adapter (`glab`, merge requests) passes the same contract and one live run against a throwaway
   gitlab.com project. *Evidence: the contract test; QA's live run: `pilot pr` opens a draft MR, edits its
   description, upserts one note twice, `pilot land` comments on it; bar: 1 MR, 1 note after 2 upserts, read
   back with `glab mr view`.* practitioner: GitLab integration maintainer: `glab api` on REST v4, not
   porcelain flags that move between glab versions (A3).
5. Crew prose names no host. **change**: already true today but for 5 lines, since ADR 0182 took the crew's
   GitHub writes away: `agents/pilot-explorer.md:19` (`gh pr view`, `gh pr diff`),
   `agents/pilot-implementer.md:89-90` and `agents/pilot-qa.md:101` (the gh-stub probe, "real GitHub"),
   `agents/pilot-architect.md:189` ("no GitHub write"). October's `pilot review open|view` verb is dropped: no
   crew agent opens a review any more. *Evidence: `check-references` refuses `gh pr`, `gh api` and `glab ` in
   `agents/pilot*.md`; `measure-prompt` within each pin; bar: exit 0 on the tree, 1 on a fixture prompt
   naming `gh pr view`, 0 of the 5 lines left.*
6. The pilot never reads, stores or passes a host token: each CLI keeps its own (`gh auth`, `glab auth`), and
   doctor reports signed in or not without printing it. *Evidence: a doctor test over a fake `auth status`;
   bar: 0 `token` reads in `deck/host-*.mjs`, the doctor row carries 0 characters of the fake's token line.*
   **change**: carried from October's agreed spec; the ticket body omits it.

Acceptance as a whole: practitioner: release engineer; raw material: the run's own record and the host's
review page. A fixture feature runs to a landing at `none` and at `gitlab`, and the GitHub suites stay green.

## 3. Findings

- `deck/host.mjs:66` `hostIn(cwd) -> (args) => string` is a `gh` argv allowlist (`assertHostVerb`, :55), not a
  host abstraction (ADR 0182:46). Callers and their 19 calls: `deck/tickets.mjs:32-33` (`api user`, `pr list
  --author @me`); `scripts/branches.mjs:59` `prsByHead` (`pr list --state all`, used by `deleteMerged` from
  `scripts/integrate.mjs:534` and `scripts/land.mjs:138`); `scripts/land.mjs:268,280` `retarget`, `:328,335`
  `comment`, `:350` `readsMerged`; `scripts/release.mjs:76-105` `releasePr` (list, notes list, `label create`,
  edit, create; called from `land.mjs:241`); `scripts/feature-pr.mjs:180-248` `syncFeaturePr` and
  `syncQaComment` (list, create, edit, comments view, comment, `api … PATCH`). Each asks its own `--json` set.
- Argv pins: `scripts/test/host-bar.test.mjs:89-90,113-127` (and its `GH_START` scan, :37),
  `integrate-remote.test.mjs:118`, `integrate-prune.test.mjs:69-71`, `integrate-base.test.mjs:125`,
  `land-chain.test.mjs:79-80`, `land-main-pr.test.mjs:39`, `release.test.mjs:84-101`,
  `feature-pr.test.mjs:88-125,233-253`, `feature-pr-comment.test.mjs:52,73`, fake in `test/lib/land-repos.mjs:105`.
- The PR-less path exists where the run remote is not `origin`: `feature-pr.mjs:163` (`no PR: run remote …`),
  `release.mjs:68` (`byHand`), `land.mjs:239` (no retarget). `none` joins each guard.
- PR-shaped data: gate2 `pr` `/^(#\d+|https?:\/\/\S+)$/` (`deck/items.mjs:228`, file at 798 of the 800 bar);
  `MAIN_LINE` and the by-hand step (`deck/closing-report.mjs:52,58-59`); `mainLine` (`land.mjs:360`).
- Setting precedent: `pilot.remote`, one validating reader `runRemote(git)` (`scripts/remotes.mjs:19`).
  Install questions: `docs/INSTALL.md:32-59` (four). Doctor: `CLIS = ['gh','git','claude']` (`deck/doctor.mjs:137`),
  rows `{ name, verdict, detail, steps? }`.
- `check-references` `FORBIDDEN` (`scripts/check-references.mjs:37-83`) already refuses crew `gh pr edit|comment|
  ready|close`, `gh api` writes and `gh pr create --head feat/` in prompts.
- Pins: pilot 11850/11871, explorer 2513.25/2513.25 (0 headroom), architect 10469.25/10520.25, QA
  5083.75/5113.25 (`scripts/test/measure-prompt.test.mjs:206,224,243`, `qa-preview.test.mjs:78`); implementer unpinned.
- `glab` docs (docs.gitlab.com/cli/api, /api/merge_requests): `glab api -X`, `--input`, `:id` placeholder for the
  current repo; MR `state` `opened|closed|merged|locked`, `iid`, `sha`, `draft`. Create-as-draft, note PUT and
  4xx exit codes were not confirmed (A3). `glab` is not installed here.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `deck/host.mjs` | `hostOf(git)`, `hostFor(cwd, deps?)`, `HOST_NAMES`, types `Host`, `Review` | the `pilot.host` read and check; adapter choice; `none` as `null` | local-substitutable (git) |
| `deck/host-github.mjs` (new) | `githubHost(run) -> Host`, `ghRun(cwd)` | `assertHostVerb`, every `gh` argv and its JSON mapping to `Review`, the label, the comment upsert by marker | true external (`gh`, injected `run`) |
| `deck/host-gitlab.mjs` (new) | `gitlabHost(run) -> Host`, `glabRun(cwd)`; its `run(args, input?)` takes a JSON body on stdin (`--input -`) | `glab api` REST v4 calls, `opened→open`, `Draft:` title, note upsert by marker | true external (`glab`, injected `run`) |
| `deck/doctor.mjs` | `checkAll(deps)`'s `host` row | host CLI choice, `signedIn()` | local-substitutable |
| `scripts/host-setting.mjs` (new) | `main(argv, inject?)` for `pilot host <name>` | the `git config --global pilot.host` write, name check | local-substitutable (git) |
| `deck/closing-report.mjs` | `MAIN_LINE`, `mainStep` | the `merge pilot into main by hand` line | in-process |
| `scripts/check-references.mjs` | `FORBIDDEN`, `checkReferences(paths)` | the host ban on crew prompts | in-process |

Deletion test: delete `host.mjs` and a host switch reappears in five callers and doctor; two adapters make it a
real seam. The callers' helpers (`prsByHead`, `retarget`'s list, `releasePr`'s list, `syncQaComment`'s
find-then-patch) are shallow over **Host** and shrink to one verb each; the comment upsert moves into the
adapters whole. `hostIn` fails the deletion test once every caller takes a **Host** (S6).

## 4. Ubiquitous language

- **Host**: the forge `pilot.host` names, and the verb interface every host call goes through.
- **Review**: one PR or MR as **Host** returns it: `{ number, state, base, head, headSha, title, body, url, crossRepo }`.
- **Adapter**: one host's **Host** over an injected `run(args, input?) -> string`; `input`, when given, is written to the CLI's stdin (GitLab's JSON bodies, `--input -`).
- **none**: no host: `hostFor` returns `null`, no CLI starts, merged is judged by ancestry.
- **PR**: the crew's word for a review on any host (October A4: no rename).

## 5. Locked decisions

- **L1** **Host** takes verbs, not argv: `whoami`, `reviews({ head?, base?, state, mine? })`, `review(n)`,
  `open({ base, head, title, body, draft?, label? })`, `edit(n, { base?, title?, body?, label? })`,
  `comment(n, body)`, `upsertComment(n, marker, body)`, `signedIn()`, with `name` and `cli`. Rejected: per-host
  argv translation under `hostIn` (every caller still speaks gh). October L2, unchanged.
- **L2** One reader, `hostOf(git)`, validates against `HOST_NAMES` as `runRemote` does; a bad value stops the
  command naming `pilot.host`. Rejected: reading the origin URL (a mirror or self-hosted forge switches silently).
- **L3** `pilot.host` is git config; the install writes it `--global`, a repository may override it, uninstall
  unsets the global key; unset is `github`. October A1 and A2, verdicts "stands".
- **L4** The pilot never touches a token (spec 6): adapters inherit the environment; `signedIn()` reads only the
  CLI's exit status. Rejected: a token in the deck store or config.
- **L5** The GitHub adapter keeps `assertHostVerb` as its fail-closed guard, moved, not loosened; the gh-stub
  (ADR 0173) still intercepts it by PATH.
- **L6** QA environment: this machine, a scratch deck (`pilot deck --scratch`), fake-CLI adapters for the
  contract, a fixture repository with a bare remote for `none`, and a throwaway gitlab.com project for spec 4;
  the user creates that project and runs `glab auth login` (the one handoff only the user can do). Rejected:
  the user's deck on 4321; a self-hosted GitLab.
- **L7** No `pilot review` verb and no new allow rule: no crew agent opens or reads a review through a host CLI
  any more (spec 5 change). Rejected: October's `pilot review open|view` and its allow rule.

## 6. Assumed decisions

Accepted by `main` on 2026-11-17 as defaults; the user sees them at Gate 1.

- **A1** At `none`, `hostFor` returns `null`, and the existing PR-less guards (`feature-pr.mjs:163`,
  `release.mjs:68`, `land.mjs:239`) plus `land`'s comment, `deleteMerged` and `openRuns` read `null` as "no
  review". Trade: one `host === null` check at six call sites. Rejected: October's L4, a `none` adapter returning
  `[]`/`null` (a write returning `null` trips `feature-pr`'s "no PR url" refusal, and `land` would print
  `comment failed: no open or merged PR`).
  Verdict: stands
- **A2** One field set per verb: the GitHub adapter's `reviews` asks one `--json` set for every caller, so argv
  pins move; each slice names the tests it moves. Trade: a wider read per call. Rejected: a field set per caller
  (the interface leaks gh's field names). October A5.
  Verdict: stands
- **A3** The GitLab adapter uses `glab api` REST v4 on `projects/:id/…` with a JSON body by `--input -`, a draft as
  a `Draft: ` title prefix, a note upsert by `GET`/`PUT …/notes/:note_id`; its fixtures are written from the REST
  docs and replaced by recorded ones in QA's live run. Trade: unverified until QA runs it. Rejected: `glab mr`
  porcelain (flags differ by version; `-F` means `--output` there and `--field` in `glab api`). October A6.
  Verdict: stands
- **A4** `hostIn` is retired in its own slice (S6) once every caller takes a **Host**, not in each caller.
  Trade: one more slice, ~60 lines. Rejected: each caller slice deleting its part (they run in parallel and
  would each edit `host.mjs`).
  Verdict: stands
- **A5** The crew ban covers `agents/pilot*.md` only; vendored reviewers, `skills/wizard` (the user's own CI)
  and the evidence runner's Go module paths stay. Rejected: banning `gh ` repo-wide. October A7.
  Verdict: stands
- red team: S2's first red step pins `deleteMerged({ host })`, but `land.mjs:138` and `integrate.mjs:534` pass
  `gh`: S2 owns both call lines, so S3 and S4 come after S2 on `land.mjs`.
- red team: `releasePr` takes its `gh` from `land.mjs:241`; S3 owns that line, so S4 (the rest of `land.mjs`)
  comes after S3.
- red team: S6 and S7 both edit `deck/host.mjs`; S6 comes after S7.
- red team: a gate2 at `none` needs a `pr`, and `items.mjs` is at 798 of 800 lines: S8 widens the one regex in
  place, net 0 lines.
- red team: handoff-mod (itm_97c9e8fdf1d2) owns `deck/doctor.mjs` (its S6) and `bin/pilot.mjs` (its S7, S12):
  S9 and S10 are cut from pilot after handoff-mod lands. blocked-steps (itm_a2aeb8349afc) edits the QA and
  implementer prose: S11 is cut after it lands if it lands first; else blocked-steps rebases on S11.
- red team: the explorer pin has 0 headroom: S11 replaces two `gh` commands with a shorter `git diff` form.

## 7. Out of scope

- A Gitea adapter (spec 1 change); self-hosted GitLab beyond what `glab`'s own config reaches.
- Renaming "PR" in crew prose; the vendored reviewers' and the wizard's GitHub examples (A5).
- Slice rows' integer `pr` (`deck/status.mjs:190`): no slice opens a review now.
- CI, checks and merge buttons on any host; `pilot gh-stub` stays GitHub's test aid.

## 8. Slices

Width 6; longest stem 5

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | `pilot tickets` reads its reviews through **Host**, at github and none | 2, 3, 6 | `deck/host.mjs`, `deck/host-github.mjs` (new), `deck/tickets.mjs`, `deck/test/host-contract.test.mjs` (new), `deck/test/tickets-open.test.mjs`, `scripts/test/host-bar.test.mjs` | – | typescript, security | [S1](slices/S1.md) |
| S2 | Branch prune asks **Host** | 2, 3 | `scripts/branches.mjs`, `scripts/integrate.mjs`, `scripts/land.mjs` (the `deleteMerged` line), `scripts/test/integrate-remote.test.mjs`, `scripts/test/integrate-prune.test.mjs`, `scripts/test/integrate-base.test.mjs`, `scripts/test/branches.test.mjs` | S1 (`Host`) | typescript, security | [S2](slices/S2.md) |
| S3 | The main PR goes through **Host** | 2, 3 | `scripts/release.mjs`, `scripts/land.mjs` (the `releasePr` line), `scripts/test/release.test.mjs`, `scripts/test/land-main-pr.test.mjs` | S2 (`scripts/land.mjs`) | typescript, security | [S3](slices/S3.md) |
| S4 | `pilot land` comments and retargets through **Host**; at none it says merge by hand | 2, 3 | `scripts/land.mjs`, `scripts/test/land-chain.test.mjs`, `scripts/test/land-remote.test.mjs`, `scripts/test/land-merged-read.test.mjs`, `scripts/test/lib/land-repos.mjs`, `scripts/test/land-none.test.mjs` (new) | S3 (`scripts/land.mjs`) | typescript, security | [S4](slices/S4.md) |
| S5 | `pilot pr` writes the feature review through **Host** | 2, 3 | `scripts/feature-pr.mjs`, `scripts/test/feature-pr.test.mjs`, `scripts/test/feature-pr-comment.test.mjs` | S1 (`Host`, `githubHost`'s upsert) | typescript, security | [S5](slices/S5.md) |
| S6 | Only adapters start a host CLI | 2 | `deck/host.mjs`, `scripts/test/host-bar.test.mjs` | S4 (last `hostIn` caller), S5 (`hostIn` caller), S7 (`deck/host.mjs`) | typescript, security | [S6](slices/S6.md) |
| S7 | The GitLab adapter passes the contract | 4, 6 | `deck/host-gitlab.mjs` (new), `deck/host.mjs`, `deck/test/host-contract.test.mjs`, `deck/test/fixtures/glab/*.json` (new) | S1 (`deck/host.mjs`, contract test) | typescript, security | [S7](slices/S7.md) |
| S8 | At none the gate2 and the closing report name branches | 3 | `deck/items.mjs`, `deck/closing-report.mjs`, `deck/test/host-none-report.test.mjs` (new) | S4 (land's main line) | typescript | [S8](slices/S8.md) |
| S9 | `pilot doctor` shows the host and checks its CLI | 1, 6 | `deck/doctor.mjs`, `deck/test/doctor-host.test.mjs` (new) | S1 (`hostOf`, `Host.signedIn`) | typescript | [S9](slices/S9.md) |
| S10 | The install asks the host; `pilot host <name>` writes it | 1 | `scripts/host-setting.mjs` (new), `bin/pilot.mjs`, `scripts/uninstall.mjs`, `docs/INSTALL.md`, `docs/adr/NNNN-the-host-is-a-setting.md` (new), `docs/adr/README.md`, `scripts/test/host-setting.test.mjs` (new) | S1 (`HOST_NAMES`) | typescript, security | [S10](slices/S10.md) |
| S11 | Crew prose names no host | 5 | `agents/pilot-explorer.md`, `agents/pilot-implementer.md`, `agents/pilot-qa.md`, `agents/pilot-architect.md`, `scripts/check-references.mjs`, `scripts/test/references-host.test.mjs` (new) | – | typescript, security | [S11](slices/S11.md) |

S1 is the walking skeleton: with `git config pilot.host none`, `pilot tickets` lists the queue with no host CLI
started; unset, the fake `gh` sees `api user` and one `pr list` through `githubHost`. Stems: S1→S2→S3→S4→S8
(5), S1→S2→S3→S4→S6 (5); S1→S5, S1→S7, S1→S9, S1→S10; S11 alone. After S1: S2, S5, S7, S9, S10, S11 (width 6).

Cross-ticket order: S9 (`deck/doctor.mjs`, handoff-mod S6) and S10 (`bin/pilot.mjs`, handoff-mod S7/S12) are cut
from pilot after handoff-mod lands. S11 (QA and implementer prose) is cut after blocked-steps if it lands first.
No other slice shares a file with either. ADR number allocated at landing.

## 9. Acceptance evidence

0. QA runs a scratch deck and fixture repositories, never the user's deck on 4321 (L6).
1. `pilot host gitlab` then `git config --get pilot.host` prints `gitlab`; `pilot host gitea` is refused (1).
2. `pilot doctor` at `none` shows `host: none` and no `gh` row; at gitlab with `glab` absent it fails naming
   `glab`; signed in, the row says so and prints no token (1, 6).
3. The contract test passes for github and gitlab, and the grep finds `gh`/`glab` starts only in
   `deck/host-*.mjs` (2).
4. At `none`, a fixture slice integrates, `pilot pr` prints `no PR: host none`, the feature lands with no host
   CLI started; the gate2 shows `feat/<slug>`; the report says to merge pilot into main by hand, no `#n` (3).
5. On the user's throwaway gitlab.com project: `pilot pr` opens a draft MR and upserts one note twice, `pilot
   land` comments on it, `glab mr view` reads it back (4).
6. `node scripts/check-references.mjs` exits 0, and 1 on a fixture prompt naming `gh pr view` (5).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 2, 3, 6 |
| S2 | planned | | | | S1 | 2, 3 |
| S3 | planned | | | | S2 | 2, 3 |
| S4 | planned | | | | S3 | 2, 3 |
| S5 | planned | | | | S1 | 2, 3 |
| S6 | planned | | | | S4, S5, S7 | 2 |
| S7 | planned | | | | S1 | 4, 6 |
| S8 | planned | | | | S4 | 3 |
| S9 | planned | | | | S1 | 1, 6 |
| S10 | planned | | | | S1 | 1 |
| S11 | planned | | | | – | 5 |
| other-host | planned | `feat/other-host` | | | S1–S11 | 1–6 |
