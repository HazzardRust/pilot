# The pilot runs on a host other than GitHub

Ticket itm_b18bcafffbce · slug `other-host` · base `origin/pilot` 368eaa2a · merge: none (itm_6971c0f47a93 kept
apart, thread itm_ad8696351ec5) · runs after `deck-writes-github` (itm_5f1725c876a7) lands on pilot

## 1. Problem

The deck is built around GitHub: PRs, landing, review and Gate 2 assume `gh` and a PR number. Someone whose
repository lives on GitLab, Gitea or a plain git server, or on no server at all, cannot run the pilot. The user:
"this kind of ruins the agnosticity - building around github".

## 2. Spec

Agreed by the user on itm_fe12eadc0ed4 (2026-10-20); depth: No grilling (L1).

Sharpened from the ticket's five lines; 6 is implied (the host token), proposed to the user through `main`.
Depth is No grilling (L1), so every open point is decided here and listed in §6 as *assumed*.

1. The host is the git setting `pilot.host` (`github`, `gitlab`, `none`), which the install asks for and
   `pilot host <name>` writes; unset reads as `github`, today's behaviour. `pilot doctor` shows it, and checks
   only that host's CLI (`gh` at github, `glab` at gitlab, none at `none`). *Evidence: a `pilot host` test per
   answer over a fake git; doctor tests; bar: 3 answers write 3 values, a 4th name is refused naming the key,
   doctor at `none` checks 0 host CLIs and at gitlab fails naming `glab` when it is missing.* (A2, A3)
2. Every host call goes through `deck/host.mjs`: `hostFor` returns one adapter of the verb interface **Host**,
   and the GitHub adapter is deck-writes-github's argv moved behind it, not rewritten. *Evidence: one contract
   table run against each adapter over a fake CLI; the deck-writes-github grep bar widened; bar: every verb
   returns the same shape on all 3 adapters, 0 `gh` or `glab` process starts outside `deck/host-*.mjs`, the
   GitHub fake sees today's verbs and filters (only `--json` widens to one field set, A5).* practitioner:
   multi-forge tool maintainer: state normalised to `open|merged|closed`, a review matched by its head
   branch, never by title.
3. At `none` a slice is a branch pushed and reviewed, and a feature a branch landed on pilot: no host CLI
   runs, the gate2's `pr` names `feat/<slug>` with its `sha`, the landing prints `main gets pilot: merge
   pilot into main by hand`, and the closing report names branches to merge. *Evidence: a fixture run at
   `none` (bare remote, integrate, land, report) over a fake CLI that throws if called; bar: 0 host CLI
   starts, 0 `#\d+` in the report, a gate2 with `pr: feat/<slug>` accepted.*
4. A GitLab adapter (`glab`, merge requests) passes the same contract and one live run against a throwaway
   gitlab.com project. *Evidence: the contract test; QA's live run opens a draft MR, edits its description,
   upserts one note, marks it ready, and reads it back with `glab mr view`; bar: 1 MR, 1 note after 2
   upserts, `draft: false` after ready.* practitioner: GitLab integration maintainer: `glab api` on REST v4
   endpoints, not porcelain flags that move between glab versions (A6).
5. Crew prose names no host: the crew's own host commands become `pilot review open` and `pilot review view`,
   which go through **Host**; "PR" stays the crew's word, defined once as the host's review (A4).
   *Evidence: `check-references` refuses `gh pr`, `gh api` and `github.com` in `agents/pilot*.md` and
   `skills/` (wizard excepted, A7); `measure-prompt` within each touched pin; bar: exit 0 on the tree, 1 on
   a fixture prompt naming `gh pr view`.*
6. Implied: the pilot never reads, stores or passes a host token; each CLI keeps its own (`gh auth`, `glab
   auth`, or its env), and doctor reports signed in or not without printing it. *Evidence: a doctor test over
   a fake `glab auth status`; a grep bar; bar: 0 `token` reads in `deck/host-*.mjs`, the doctor row carries
   no characters of the fake's token line.*

Acceptance as a whole: practitioner: release engineer; raw material: the run's own record and the host's
review page. A fixture feature runs to a landing at `none` and at `gitlab`, and the GitHub suites stay green
with their verbs and filters unchanged.

## 3. Findings

- deck-writes-github (signed, unbuilt) creates `deck/host.mjs` with `hostIn(cwd) -> (args) => string` taking
  **gh argv** and `HOST_VERBS` (its S1), and moves the three old runners onto it (its S8): `deck/tickets.mjs:24`,
  `scripts/branches.mjs:149`, `scripts/integrate.mjs:55` (imported by `scripts/land.mjs:27`). A GitLab adapter
  cannot sit under gh argv: the seam must take verbs. Its `scripts/feature-pr.mjs` (pr create/edit/view, comment
  upsert by marker) is the fifth caller.
- The PR-less path exists: with the run remote off `origin` the implementer opens no PR
  (`agents/pilot-implementer.md:125`), land prints `open a PR from <x> to main by hand` (`scripts/land.mjs:288`),
  branches judge merged by ancestry (`scripts/branches.mjs:6-8`), integrate skips the title check with no PR
  (`scripts/integrate.mjs:58-64,311`). `none` reuses each one.
- Callers and their reads: integrate `pr list --head --limit 1` (title, number); land `pr list --head`
  (state, base), `pr close --comment` / `pr comment` (`land.mjs:259-266`), main-PR lookup and `pr create`
  (`:291-307`); branches `pr list --state all` (state, headRefOid); tickets `api user` + `pr list --author @me`
  (`deck/tickets.mjs:34-35`). Each asks a different `--json` set.
- PR-shaped data: gate2 `pr` required, `/^(#\d+|https?:\/\/\S+)$/` (`deck/items.mjs:232`, file at the 800 bar);
  rendered by `renderUrl` (`deck/ui/render-parts.mjs:254`); slice rows' `pr` is an optional integer
  (`deck/status.mjs:190`); report `featurePr.number` integer (`deck/runs.mjs:347`); `MAIN_LINE`
  (`deck/closing-report.mjs:30`) parses land's main line, and its by-hand step says "open a PR".
- Setting precedent: `pilot.remote` in git config, one reader `runRemote(git)` that validates
  (`scripts/remotes.mjs:19`, ADR 0134). The install is once per machine, asked by the agent from
  `docs/INSTALL.md` "The three questions" (:32), and writes no repository setting (:30); plain-session adds a
  question and a `pilot reach` verb the same way. Doctor rows: `{ name, verdict, detail, steps? }`,
  `CLIS = ['gh','git','claude']` makes a missing `gh` a fail on every host (`deck/doctor.mjs:135,206`).
- Crew lines naming GitHub (RUN): `agents/pilot.md:406,408`, `pilot-explorer.md:19`, `pilot-implementer.md:125`,
  `pilot-qa.md:139,140,211` (the QA ones go in deck-writes-github S6). User-project: `skills/wizard/SKILL.md`
  (5 lines, CI secrets), `react-reviewer.md:47,50`, `typescript-reviewer.md:29,32` (vendored). `github.com` in
  `pilot-evidence-runner.md:60,62` is a Go module path. `check-references` `FORBIDDEN` is `{pattern, why}[]`
  over `agents skills rules commands hooks` (`scripts/check-references.mjs:26,35`).
- `glab` and `tea` are not installed here; their flags came from memory, unverified (A6, A3).

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `deck/host.mjs` | `hostOf(git)`, `hostFor(cwd, deps)`, `HOST_NAMES`, type `Host`, `Review` | dwg's `hostIn` and `HOST_VERBS` (gh argv) become the GitHub adapter's internals; the `pilot.host` read and check; the `none` adapter | true external (CLI, injected `run`) |
| `deck/host-github.mjs` (new) | `githubHost(run) -> Host` | every `gh` argv and its JSON mapping to `Review` | true external (`gh`) |
| `deck/host-gitlab.mjs` (new) | `gitlabHost(run) -> Host` | `glab api` REST v4 calls, `opened→open` mapping, note upsert by marker | true external (`glab`) |
| `scripts/review.mjs` (new) | `main(argv, inject?)` for `pilot review open|view` | the crew's draft open and read through `Host` | true external (`Host`, injected) |
| `scripts/host-setting.mjs` (new) | `main(argv, inject?)` for `pilot host <name>` | the `git config --global pilot.host` write, name check | local-substitutable (git) |
| `deck/doctor.mjs` | `checkAll(deps)` row `host` | host CLI choice, `signedIn()` | local-substitutable |
| `deck/closing-report.mjs` | `MAIN_LINE`, the main human step | the `merge … by hand` line | in-process |
| `scripts/check-references.mjs` | `FORBIDDEN`, `checkReferences(paths)` | host patterns scoped to crew files | in-process |

Deletion test: delete `host.mjs` and a host switch reappears in five callers (integrate, land, branches,
tickets, feature-pr) and doctor; two real adapters plus `none` make it a real seam, not a hypothetical one.
`host-github.mjs` and `host-gitlab.mjs` survive as adapters; a `none` adapter is a constant object, so it stays
inside `host.mjs`. The callers' own PR helpers (`prOf`, `prsByHead`, `openRuns`' list) are shallow over **Host**
and shrink to one call each.

## 4. Ubiquitous language

- **Host**: the forge `pilot.host` names, and the verb interface (`deck/host.mjs`) every host call goes through.
- **Review**: one PR or MR as **Host** returns it: `{ number, state, base, head, headSha, title, url }`.
- **Adapter**: one host's implementation of **Host** over an injected `run(cmd, args) -> string`.
- **PR**: the crew's word for a review on any host; at `none` the pushed branch stands in for it.
- **none**: no host: no CLI runs, branches only, merged judged by ancestry.

## 5. Locked decisions

- **L1** Grilling depth: No grilling (the user, itm_3e0b7050e260): every open point decided and listed in §6;
  one spec question goes to the user through `main`. Rejected: forks, every.
- **L2** **Host** takes verbs, not argv: `reviews`, `view`, `open`, `editBody`, `comment`, `close`,
  `upsertComment`, `ready`, `whoami`, `signedIn`, with `name` and `cli`. Rejected: per-host argv translation
  under `hostIn` (every caller still speaks gh).
- **L3** One reader, `hostOf(git)`, validates against `HOST_NAMES` before any use, as `runRemote` does; a bad
  value stops the command naming `pilot.host`. Rejected: reading the origin URL at run time (silent switch on a
  mirror or a self-hosted forge).
- **L4** At `none`, and wherever the run remote is not `origin`, callers take today's PR-less path; `none`'s
  adapter returns `[]` for reads and `null` for writes, so no caller branches on the host name.
  Rejected: an `if (host === 'none')` in each caller.
- **L5** The pilot never touches a token: adapters inherit the environment, `signedIn()` reads only the CLI's
  exit status. Rejected: a token in the deck store or `pilot.host` config (the store is plain JSON on disk).
- **L6** The run starts once deck-writes-github is on pilot, and every slice reads its seams from there
  (ADR 0038); a dwg symbol that landed under another name is a seam change through `main`.
- **L7** QA environment: a scratch deck (`pilot deck --scratch`) with fake-CLI adapters for the contract, a
  fixture repository with a bare remote for `none`, and a throwaway gitlab.com project for the live GitLab
  run; the user creates that project and runs `glab auth login` (the one handoff only the user can do).
  Rejected: the user's deck on 4321; a self-hosted GitLab.

## 6. Assumed decisions

Each is a default taken without the user (L1); the pilot judges and writes the verdicts.

- **A1** Depth reached into the setting's home: `pilot.host` is git config, the install writes it with
  `--global` and a repository overrides it locally; uninstall unsets the global key. Trade: the install
  touches the user's global gitconfig. Rejected: a `~/.claude/pilot/host.json` (no per-repository override);
  per-repository only (the install runs once per machine).
  Verdict: stands — plain-session keeps its own store (~/.claude/pilot/reach.json) for a per-install choice; a per-repository host belongs beside the origin URL in git config, and the two stores answer different questions
- **A2** Unset reads as `github`, so a user who changes nothing sees the same argv. Trade: a GitLab user who
  skips the question gets `gh` failures until they set it; doctor names it. Rejected: deriving it from origin.
  Verdict: stands — an existing install changes nothing, the same rule plain-session locked for the reach
- **A3** `gitea` is not an install answer: no adapter is built, and an answer that fails at the first PR is
  worse than none. Trade: the ticket's fourth answer goes; a third adapter is one file and a contract row.
  Rejected: a `tea` adapter in this run (its flags are unverified and nobody here runs Gitea).
  Verdict: stands — the spec question says gitea is dropped; a Change there reopens it
- **A4** "PR" stays the crew's word, defined once in `agents/pilot.md`; no 73-line rename to "review".
  Trade: the word reads GitHub-ish on GitLab. Rejected: renaming every PR line (every prompt pin moves).
  Verdict: stands — every agent prompt pin sits at zero headroom (plain-session, walkthrough-surface S5), a 73-line rename moves them all
- **A5** The GitHub adapter asks one `--json` field set for every list, so its argv differs from today's only
  in that flag; tests that pin `--json` move with it. Trade: a wider read per call. Rejected: a field set per
  caller (the interface leaks gh's field names).
  Verdict: stands — one field set is a smaller interface; the tests it moves are named
- **A6** The GitLab adapter uses `glab api` on REST v4 (`merge_requests`, `notes`, `user`) with a JSON body file
  (`--input`); its fixtures are written from the REST docs and replaced by recorded ones in QA's live run.
  Trade: unverified until QA runs it. Rejected: `glab mr` porcelain (flags differ by version).
  Verdict: stands — unverifiable on this machine; QA's live run is the check and the GitLab project is the user's handoff
- **A7** The host ban covers `agents/pilot*.md` and `skills/` except `skills/wizard` (the user's own CI
  secrets); vendored reviewers and Go module paths stay. Trade: `gh secret set` remains in one skill.
  Rejected: banning `gh ` repo-wide (rewrites vendored files and the user-project wizard).
  Verdict: stands — the wizard's gh secret set is about the user's own CI, not the pilot's host
- **A8** `pilot review` gets an allow rule, `Bash(pilot review *)`, written by the install beside ADR 0110's
  three; doctor's allow-rule row (dwg S5) names it. Trade: one more rule. Rejected: keeping `gh pr create`
  in prose for GitHub (spec 5 fails).
  Verdict: stands — plain-session keeps permission rules at every reach level, so the rule reaches every install
- red team: S1's red step "GitHub fake sees today's argv byte-for-byte" fails: callers ask four different
  `--json` sets; A5 fixes the set and names the tests that move (`integrate-base.test.mjs:73`).
- red team: land at `none` would print `pr comment failed: no open or merged PR` (`land.mjs:212-214`): S2's
  none test pins 0 failure lines.
- red team: S5 and S1 both edit `deck/host.mjs` and `deck/README.md`: S5 comes after S1; S2, S3 call
  **Host** but edit neither, so they run beside S5.
- red team: `pilot host` and `pilot review` both dispatch in `bin/pilot.mjs`: S8 after S7 on that file.
- red team: a gate2 at `none` needs a `pr`, and `items.mjs` is at the 800 bar: S4 widens the one regex in
  place, net 0 lines.
- red team: every slice names dwg symbols not yet built: L6 and each implementer's fact sheet read pilot first.

## 7. Out of scope

- A Gitea adapter (A3); self-hosted GitLab beyond what `glab`'s own config reaches.
- Renaming "PR" in crew prose (A4); the vendored reviewers' and the wizard's GitHub examples (A7).
- The lander's report renderer and worktree prune (itm_6971c0f47a93); this run changes only `MAIN_LINE` and
  its human step in `closing-report.mjs`.
- GitHub Actions, CI checks, merge buttons on any host.

## 8. Slices

Width 5; longest stem 4

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | `pilot integrate` reads its review through **Host**, at github and none | 2, 3 | `deck/host.mjs`, `deck/host-github.mjs` (new), `scripts/integrate.mjs`, `deck/README.md`, `deck/test/host-contract.test.mjs` (new), `scripts/test/integrate-base.test.mjs` | – | typescript, security | [S1](slices/S1.md) |
| S2 | land, branches and tickets go through **Host** | 2, 3 | `scripts/land.mjs`, `scripts/branches.mjs`, `deck/tickets.mjs`, `scripts/test/host-bar.test.mjs`, `scripts/test/land-none.test.mjs` (new) | S1 (`Host`) | typescript, security | [S2](slices/S2.md) |
| S3 | `pilot pr` writes the feature review through **Host** | 2, 3 | `scripts/feature-pr.mjs`, `scripts/test/feature-pr-host.test.mjs` (new) | S1 (`Host`) | typescript, security | [S3](slices/S3.md) |
| S4 | At none the gate2, landing line and report name branches | 3 | `deck/items.mjs`, `deck/ui/render-parts.mjs`, `deck/closing-report.mjs`, `scripts/test/host-none-run.test.mjs` (new) | S2 (land's main line) | typescript | [S4](slices/S4.md) |
| S5 | The GitLab adapter passes the contract | 4, 6 | `deck/host-gitlab.mjs` (new), `deck/host.mjs`, `deck/README.md`, `deck/walkthrough-shape.mjs`, `deck/test/host-contract.test.mjs`, `deck/test/fixtures/glab/*.json` (new) | S1 (`deck/host.mjs`, contract test) | typescript, security | [S5](slices/S5.md) |
| S6 | `pilot doctor` shows the host and checks its CLI | 1, 6 | `deck/doctor.mjs`, `deck/test/doctor-host.test.mjs` (new) | S1 (`hostOf`, `Host.signedIn`) | typescript | [S6](slices/S6.md) |
| S7 | The install asks the host; `pilot host <name>` writes it | 1 | `scripts/host-setting.mjs` (new), `bin/pilot.mjs`, `scripts/uninstall.mjs`, `docs/INSTALL.md`, `docs/adr/NNNN-the-host-is-a-setting.md` (new), `docs/adr/README.md`, `scripts/test/host-setting.test.mjs` (new) | S1 (`HOST_NAMES`) | typescript, security | [S7](slices/S7.md) |
| S8 | `pilot review open|view` for the crew | 5 | `scripts/review.mjs` (new), `bin/pilot.mjs`, `scripts/install-settings.mjs`, `scripts/test/review.test.mjs` (new) | S7 (`bin/pilot.mjs`) | typescript, security | [S8](slices/S8.md) |
| S9 | Crew prose names no host | 3, 5 | `agents/pilot.md`, `agents/pilot-implementer.md`, `agents/pilot-explorer.md`, `agents/pilot-qa.md`, `scripts/check-references.mjs`, `scripts/test/references-host.test.mjs` (new), `scripts/test/measure-prompt.test.mjs` | S8 (`pilot review`) | typescript, security | [S9](slices/S9.md) |

S1 is the walking skeleton: with `git config pilot.host none`, `pilot integrate` merges a slice with no host
CLI started; unset, the fake `gh` sees today's `pr list --head` call. Stems: S1→S7→S8→S9 (4); S1→S2→S4;
S1→S3, S1→S5, S1→S6. After S1: S2, S3, S5, S6, S7 at once (width 5).

Overlaps: every slice rebases on deck-writes-github (L6): S1 on its S1/S8 (`host.mjs`, `integrate.mjs`), S2 on its
S8 (`land.mjs`, `branches.mjs`, `tickets.mjs`, `host-bar.test.mjs`), S3 on its S1/S3 (`feature-pr.mjs`), S6 on
its S5 (`doctor.mjs`), S8 on its S5 (`install-settings.mjs`), S9 on its S6 (crew prose, `check-references`).
plain-session S5/S6 share `doctor.mjs`, `INSTALL.md`, `agents/pilot.md`; fresh-public-repo shares nothing named
here; itm_6971c0f47a93 (lander tail) shares `deck/closing-report.mjs` with S4: whichever lands second rebases.
ADR number allocated at landing.

## 9. Acceptance evidence

0. QA runs a scratch deck and a fixture repository, never the user's deck on 4321 (L7).
1. `pilot host gitlab` then `git config --get pilot.host` prints `gitlab`; `pilot host gitea` is refused (1).
2. `pilot doctor` at `none` shows `host: none` and no `gh` row; at gitlab with `glab` absent it fails naming
   `glab`; signed in, the row says so and prints no token (1, 6).
3. At `none`, a fixture slice integrates and the feature lands with no host CLI started; the gate2 shows
   `feat/<slug>`; the closing report says to merge pilot into main by hand and has no `#n` (3).
4. The contract test passes for github, gitlab and none, and the grep finds `gh`/`glab` starts only in
   `deck/host-*.mjs` (2).
5. On the user's throwaway gitlab.com project: `pilot review open` opens a draft MR, `pilot pr` edits it and
   upserts one note twice, ready marks it, `glab mr view` reads it back (4).
6. `node scripts/check-references.mjs` exits 0, and 1 on a fixture prompt with `gh pr view` (5).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 2, 3 |
| S2 | planned | | | | S1 | 2, 3 |
| S3 | planned | | | | S1 | 2, 3 |
| S4 | planned | | | | S2 | 3 |
| S5 | planned | | | | S1 | 4, 6 |
| S6 | planned | | | | S1 | 1, 6 |
| S7 | planned | | | | S1 | 1 |
| S8 | planned | | | | S7 | 5 |
| S9 | planned | | | | S8 | 3, 5 |
| other-host | planned | `feat/other-host` | | | S1–S9 | 1–6 |
