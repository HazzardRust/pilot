# The deck writes to GitHub, the crew never does

Ticket itm_5f1725c876a7 · slug `deck-writes-github` · base `origin/pilot` 4c6448b8 · merge: none (no other red
ticket) · rebases on `one-integration-line` (itm_d1054e1ebb14, PR #884) and beside `crew-tests-behaviour` (PR #906)

## 1. Problem

Crew agents keep hitting denied commands: QA's `gh pr edit`, `gh pr comment` and `gh api -X PATCH` (external write),
a co-pilot's or QA's `pilot integrate --default` (unrequested commit), earlier a co-pilot's `pilot land`. Each denial
stalls the run until the user is back. The user wants a systematic change, not another rule: no crew agent writes to
GitHub; the deck performs each write from the run record, as it already runs `pilot land` on the gate2 press (#849).

## 2. Spec

Sharpened from the ticket's six lines; 7 is added (found), 8 by the user. A1–A3 are answered (§6): no line is *assumed*.

1. No crew prompt names a GitHub write: `gh pr edit`, `gh pr comment`, `gh pr ready`, `gh pr close`, `gh api` with
   `-X`/`--method` PATCH or POST; `gh pr create` stands only in the implementer's own draft slice PR (A1).
   *Evidence: `check-references` carries them as forbidden patterns; bar: exits 0 on the tree, 1 on a fixture
   prompt naming `gh pr comment`.*
2. The deck owns the feature PR: on a gate1 post and on every `deck_status` of a ticket that has one, it spawns
   `pilot pr --ticket <id>` (the installed bin, a fixed argv like `pilot land`), which opens the draft PR (head
   `feat/<slug>`, base `pilot`) when none is open, else rewrites its body from the artefact's §2 and the record's
   slice table; the pilot no longer opens it (A2). practitioner: GitHub-bot maintainer: the write is
   idempotent. *Evidence: fake-gh verb tests and a daemon test over a fake spawn; bar: first run 1 create, a row
   change 1 edit, the same record again 0 writes.*
3. QA's comment is the record's `qaComment`, sent as a `comment` field on QA's walkthrough post and completed on its
   gate2 post; the same verb upserts one comment on the feature PR found by a hidden marker, so a lost id never
   posts twice. The "Non-additive migrations" section moves into it (A2). *Evidence: a daemon test over the two
   posts and a verb test; bar: first text 1 POST, changed text 1 PATCH, same text 0 writes; `pilot-qa` names no
   `gh` write.*
4. `pilot integrate --default` is gone (one-integration-line S5) and stays gone: `check-references` refuses it in
   crew prose; `pilot land` stands only in prohibitions and the lander's `Land again`. *Evidence: `check-references`;
   bar: exits 1 on a fixture naming `pilot integrate --default`, 0 on the tree.*
5. Every crew command that pushes or writes GitHub is one plain command with literal arguments: `pilot integrate
   <branch> --dir <worktree>`, `git -C <dir> push`; `cd <dir> && { …; }` stays for local reads and tests
   (A3). *Evidence: `pilot integrate --dir` test; `check-references` refuses `&& pilot ` in crew prose;
   `measure-prompt` within each touched agent's pin; bar: 0 `&& pilot ` in `agents/`.*
6. `pilot doctor` reads `~/.claude/settings.json` and names each of the install's pilot allow rules that is missing,
   with the install command as its step (the install already writes them, ADR 0110). *Evidence: a doctor test over a
   settings fixture; bar: a fixture missing `pilot sync *` and `pilot integrate *` fails naming exactly those 2.
   This machine reads that today.*
7. Added (found): a deck write that fails puts one line on the ticket's thread, `feature PR not updated: <line>`
   (a credential withheld), the same line once, and the next trigger retries; nothing blocks, nothing waits on the
   user. *Evidence: a daemon test over a failing fake spawn; bar: 1 note for 2 identical failures, 0 Blocked items.*

8. Added (user, itm_f93fc6cf6eb6): every GitHub call the deck and its scripts make goes through one module,
   `deck/host.mjs`, with no `gh` invocation elsewhere in `deck/` or `scripts/`, so a second host (GitLab, Gitea, plain
   git) is one adapter; the agents name no GitHub write beyond A1's `gh pr create --draft` and reads (`gh pr view`,
   `gh pr list`). *Evidence: a grep of `deck/` and `scripts/` finds a `gh` process start only in `deck/host.mjs`;
   `check-references` refuses the write verbs of spec 1 in crew prose; bar: 0 starts outside the module on the tree.*

Acceptance as a whole (practitioner: SRE; raw material: the deck's `Blocked:` items `hooks/permission-denied.js`
posts): QA's run of a fixture feature yields 0 `Blocked: gh …` and 0 `Blocked: … pilot integrate …` items, and
`gh pr view <n> --json body,comments` on the fixture PR confirms the body and the one QA comment from outside.

## 3. Findings

- The daemon calls no `gh` (`deck/gate2-base.mjs:6`; `deck/test/create.test.mjs` pins no `child_process` in
  `server-tools.mjs`). Its one GitHub path is spawning `node <PILOT_BIN> land` (`deck/landing.mjs:371`,
  `landingSpawnOptions`, `watch` :211, injected `spawn`, faked by `aSpawn()` in `deck/test/landing.test.mjs:54`);
  ADR 0154 L4 rejected a daemon-side `gh` call and kept the spawn shape fixed.
- Every `gh` write lives in `scripts/` behind an injected `gh: (args) => string` (`ghIn`, `scripts/integrate.mjs:55`;
  `comment`, `ready` in `scripts/land.mjs:272,286`). No code opens or edits a PR body.
- Three runners start a `gh` process: `ghIn` (`scripts/integrate.mjs:55`, imported by `scripts/land.mjs`), a copy in
  `deck/tickets.mjs:24`, an inline one in `scripts/branches.mjs:149`. Verbs today: `pr list` (6), `pr view`,
  `pr comment`, `pr ready`, `api user`. `scripts/install-settings.mjs:500` names `gh` only in allow-rule strings.
- Crew writes today: `agents/pilot-qa.md:139` (`gh pr comment`), `:206` (edit the body), `:211` (`gh api -X PATCH`),
  `:226` (`--default`); `agents/pilot.md:358-361` (opens the feature PR), `:397` (`cd "<worktree>" && pilot
  integrate`), `:401` (close a slice PR with a comment), `:494` (`--default`); `agents/pilot-implementer.md:159` (a fix
  brief edits the feature PR body); `agents/pilot-co-pilot.md:47` names `pilot land` it may not run (`:93`).
- `deck_status` (`deck/server-tools.mjs:322`, schema `deck/tools.mjs:255`) writes the record (`setSlices`,
  `deck/store-runs.mjs:548`; fields `RECORD_ORDER`, `deck/runs.mjs:239`); it has no PR number, comment id or spec.
  `pilot ready --ticket` already reads it over `/api/record` (`deck/schedule.mjs:82`).
- `pilot-qa` holds no `deck_status`; its walkthrough (`deck/items.mjs:263`) and gate2 posts carry `ticket`.
- A gate1 post and the walkthrough Sign off run nothing in the daemon today (`store-items.mjs:158,289`).
- Claude Code: "a `cd` into a directory outside your working directories generate[s] its own Read rule" and "a rule
  must match each subcommand independently" (code.claude.com/docs/en/permissions); the crew-refuse hook denies the
  prompt (`hooks/permission-refuse.js:57`). `pilot --dir` exists but only before the verb (`bin/pilot.mjs:175`).
- The install writes `Bash(pilot sync|integrate|land *)` (`PILOT_MERGE_ALLOW`, `scripts/install-settings.mjs:571`);
  this machine's `~/.claude/settings.json` holds only `Bash(pilot land *)`, so the `--default` denial was a missing
  rule as much as a shape. `pilot doctor` (`deck/doctor.mjs:249`) reads no settings.
- The deck lands with the installed plugin (0.9.4), so this takes effect after `claude plugin update`.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `deck/host.mjs` (new) | `HOST_VERBS`, `hostIn(cwd) -> (args) => string` | the one `gh` process start, the verb table, refusal of any other verb | true external (`gh`) |
| `scripts/feature-pr.mjs` (new) | `featureBody(spec, record, footer)`, `syncFeaturePr({ gh, git, record })`, `main(argv)` | PR lookup by head, create-or-edit, unchanged-body skip, QA comment marker, run-remote check | true external (`hostIn`, injected) |
| `deck/pr-writes.mjs` (new) | `startPrWrite(ticketId, repo, deps)` | the spawn, one in flight per ticket plus one rerun, the note, credential withhold | true external (spawn, injected) |
| `deck/server-tools.mjs` | `callTool(name, args, deps)` | the two triggers (gate1 post, `deck_status`), the `comment` → `qaComment` copy | in-process |
| record `qaComment` | `deck/tools.mjs` `comment` on `deck_post`; `RECORD_ORDER` | length bound, credential refusal | in-process |
| `scripts/integrate.mjs` | `main(argv)` with `--dir <worktree>` | the chdir | local-substitutable |
| `deck/doctor.mjs` | `checkAll(deps)` row `pilot allow rules` | settings read, `denyCovers` reuse | local-substitutable |
| `scripts/check-references.mjs` | `FORBIDDEN`, `checkReferences(paths)` | the write and shape patterns | in-process |

Deletion test: `feature-pr.mjs` holds the gh calls three callers would otherwise repeat (gate1, integrate, QA);
`pr-writes.mjs` holds the spawn discipline `landing.mjs` already has, reusing its exported `landingSpawnOptions`
and `watch` rather than a second copy. `host.mjs` folds the three runners (S8, spec 8): deleted, a `gh` process start
reappears in four files and a second host means editing each.

## 4. Ubiquitous language

- **Deck write**: a GitHub write the daemon starts by spawning `pilot pr`, never an agent's tool call.
- **Feature PR**: the one draft PR `feat/<slug>` → `pilot`, opened and rewritten only by a deck write.
- **QA comment**: the one comment on the feature PR carrying `<!-- pilot:qa -->`, its text the record's `qaComment`.
- **Trigger**: a gate1 post, a `deck_status`, or a walkthrough or gate2 post with `comment`, for a ticket with a gate1.
- **Host**: `deck/host.mjs`, the one module that starts a `gh` process; a verb outside `HOST_VERBS` is refused.
- **One plain command**: a single subcommand with literal arguments, no `&&`, `;`, `|` or shell variable.

## 5. Locked decisions

- **L1** The daemon still runs no `gh`: it spawns `node <PILOT_BIN> pr --ticket <id>` with `landingSpawnOptions`,
  as ADR 0154 L4 kept the landing. Rejected: `gh` in the daemon (a second process discipline, untested there).
- **L2** One verb does every feature-PR write, reading the record over `/api/record` as `pilot ready` does and the
  artefact by `git show origin/feat/<slug>:<artefact>`; the daemon passes its own port and store dir in the env, so
  a scratch deck's verb reads the scratch record. Rejected: a temp record file (cleanup, a second source).
- **L3** Writes are idempotent: the PR found by head, its body compared before an edit, the comment found by
  marker. A missing `feat/<slug>` on origin or a run remote other than `origin` prints one line and exits 0.
  Rejected: storing the PR number or comment id in the record (state that drifts from GitHub).
- **L4** Triggers coalesce per ticket: one spawn in flight, at most one rerun queued. Rejected: one spawn per call.
- **L5** `PILOT_DECK_NO_LAND` also stops deck writes, so no daemon test reaches GitHub. Rejected: a second switch.
- **L6** QA's comment rides on its own posts (`comment` on walkthrough and gate2), QA's tools unchanged. Rejected:
  giving QA `deck_status` (it could move rows).
- **L7** The base is `pilot` (one-integration-line A1); the title `feat(<slug>): <feature>` from the record.
- **L8** Grilling depth: forks (the user, itm_e8f2042663eb, 2026-10-20). Rejected: the thread's other depths.
- **L9** QA runs on a scratch deck (`pilot deck --scratch`) with fixture draft PRs on throwaway branches of
  HazzardRust/pilot, which QA closes after; never the user's deck on 4321; no database (the user, itm_adda0735a7fd).
  Rejected: the user's deck (fixture writes among real tickets).

## 6. Assumed decisions (all answered)

- **A1** Only feature-PR writes move: an agent still pushes its own branch and the implementer opens its own draft
  slice PR (`gh pr create --draft`), neither ever denied; the pilot's slice-PR close fallback goes, GitHub marking a
  slice PR merged when feat holds its head. Rejected: the deck opening slice PRs too. Thread itm_ab137d949ec8. **Answered** 2026-10-20: "Feature PR and
  comments only", the default taken by the user.
  Verdict: stands — nothing queued moves slice PRs, `gh pr create --draft` is never denied, and the user asked for fewer prompts, not more verbs.
- **A2** The feature PR body is the deck's alone, overwritten on every change; QA's corrections and the
  "Non-additive migrations" section move into the QA comment. Rejected: a deck-owned marked section inside a body
  others edit. Thread itm_217e4ac33d2f. **Answered** 2026-10-20: "body is the deck's", the default taken by the user.
  Verdict: stands — a body two writers share is the race this ticket exists to remove.
- **A3** "One plain command" binds commands that push or write GitHub; `pilot integrate` takes `--dir`, so the
  existing `Bash(pilot integrate *)` matches; `cd <dir> && { …; }` and shell variables stay for local reads and
  tests. Rejected: an allow rule `pilot --dir * integrate *` (`*` is any text, so it admits other verbs); banning
  `cd &&` everywhere (every implementer's test run). Thread itm_3b7bfdbafe55. **Answered** 2026-10-20: "writes only",
  the default taken by the user.
  Verdict: stands — crew-tests-behaviour S5–S12 rewrites the same prompts, so a ban on every `cd &&` would be swept twice; binding writes only keeps S6 small and last.
- red team: S6's first red step, QA sending `qaComment` by `deck_status`, failed on `agents/pilot-qa.md`'s tools
  line (no `deck_status`): spec 3 and L6 moved the field onto QA's posts, and S3 owns `deck/items.mjs`.
- red team: S2's trigger on every `deck_status` would spawn a real `pilot pr` in ~100 daemon tests: L5 and the
  gate1 condition (most tests post none) keep them offline; S2's test 3 pins it.
- red team: `callTool(name, args, land = {})` spreads its third argument into `startLanding`; S2 renames it `deps`
  with `prWrite` beside the landing keys, the gate2 path unchanged.
- red team: a gate1 posted before the pilot pushes `feat/<slug>` would fail the first write: L3 makes it a quiet
  `no PR yet` and the pilot's `finished: "planned"` `deck_status` retries; S6 puts the push before the post.
- red team: S6 alone edits four agent files that `crew-tests-behaviour` S5–S12 and `one-integration-line` S9 rewrite:
  it goes last, after both land on pilot, and moves each prompt pin only by measured cost.
- red team: S8 before S1 makes the stem S8→S1→S2→S3→S6 (5): S1 creates `deck/host.mjs` with the whole verb table, S8
  only moves the three old runners onto it; S8 shares `scripts/integrate.mjs` with S4, so it comes after S4.
- red team: a verb table of only pr create/edit/comment/ready/view/close and api PATCH/POST would refuse today's
  `pr list` (6 calls) and `api user`: `HOST_VERBS` carries both reads.
- red team: spec 8's "agents name none" meets A1's answer, which keeps `gh pr create --draft` in the implementer's
  prompt, and the crew's `gh pr view`/`list` reads: S6 refuses the writes spec 1 lists in crew prose and no more;
  a ban on every `gh ` in `agents/` would undo A1. Sent to main.

## 7. Out of scope

- Trivial work's one PR to the default branch (`agents/pilot.md:191`), its open and ready stay the pilot's.
- The landing's own comment and the main PR (`scripts/land.mjs`, one-integration-line S2), already deck-run.
- Slice PRs (A1); `git push` of an agent's own branch; the lander's `pilot sync`.
- Writing the missing allow rules on this machine: the user re-runs the install, which doctor now names.
- A second host adapter (GitLab, Gitea, plain git): ticket itm_b18bcafffbce; this run builds the one seam (spec 8).

## 8. Slices

Width 4; longest stem 4

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | `pilot pr` writes the feature PR from the record | 2 | `deck/host.mjs` (new), `scripts/feature-pr.mjs` (new), `bin/pilot.mjs`, `scripts/test/feature-pr.test.mjs` (new) | – | typescript, security | [S1](slices/S1.md) |
| S2 | The deck runs `pilot pr` on gate1 and every status | 2, 7 | `deck/pr-writes.mjs` (new), `deck/server-tools.mjs`, `deck/landing.mjs`, `deck/test/pr-writes.test.mjs` (new) | S1 (`pilot pr` argv) | typescript, security | [S2](slices/S2.md) |
| S3 | QA's comment rides on its posts | 3 | `deck/items.mjs`, `deck/tools.mjs`, `deck/runs.mjs`, `deck/store-runs.mjs`, `scripts/feature-pr.mjs`, `deck/server-tools.mjs`, `deck/test/qa-comment.test.mjs` (new), `scripts/test/feature-pr-comment.test.mjs` (new) | S1 (`syncFeaturePr`), S2 (`server-tools.mjs`) | typescript, security | [S3](slices/S3.md) |
| S4 | `pilot integrate --dir` | 5 | `scripts/integrate.mjs`, `scripts/test/integrate-dir.test.mjs` (new) | – | typescript, security | [S4](slices/S4.md) |
| S5 | `pilot doctor` names a missing allow rule | 6 | `deck/doctor.mjs`, `scripts/install-settings.mjs`, `deck/test/doctor-allow.test.mjs` (new), `docs/INSTALL.md` | – | typescript | [S5](slices/S5.md) |
| S6 | The crew names no GitHub write and one plain command | 1, 3, 4, 5, 8 | `agents/pilot.md`, `agents/pilot-qa.md`, `agents/pilot-implementer.md`, `agents/pilot-co-pilot.md`, `scripts/check-references.mjs`, `scripts/test/references-writes.test.mjs` (new), `scripts/test/measure-prompt.test.mjs`, `scripts/test/qa-preview.test.mjs` | S3 (`comment` field), S4 (`--dir`) | typescript, security | [S6](slices/S6.md) |
| S7 | ADR and OPERATING say the deck writes GitHub | 2 | `docs/adr/NNNN-the-deck-writes-to-github.md` (new), `docs/adr/README.md`, `docs/adr/0154-gate2-frees-the-lane.md`, `docs/OPERATING.md` | – | typescript | [S7](slices/S7.md) |
| S8 | Every `gh` call goes through `deck/host.mjs` | 8 | `deck/tickets.mjs`, `scripts/branches.mjs`, `scripts/integrate.mjs`, `scripts/land.mjs`, `scripts/test/host-bar.test.mjs` (new) | S1 (`hostIn`), S4 (`scripts/integrate.mjs`) | typescript, security | [S8](slices/S8.md) |

S1 is the walking skeleton: `pilot pr --ticket <id>` in a fixture checkout with a fake `gh` opens one draft PR whose
body is the fixture artefact's spec and slice table. Stems: S1→S2→S3→S6 (4); S4→S6; S1→S8, S4→S8; S5, S7 alone.
Rebases on one-integration-line: S2 on its S3/S4 (`landing.mjs`, `server-tools.mjs`), S4 on its S5 (`integrate.mjs`
`main`), S8 on its S2 and S5 (`land.mjs`, `integrate.mjs`), S6 on its S9 (crew prose), S7 on its S10 (`docs/adr/README.md`, OPERATING; ADR number allocated at landing,
its spec 5). S6 also rebases on crew-tests-behaviour S5–S12 (same agent files and prose pins).

## 9. Acceptance evidence

0. QA updates the installed plugin from the feature (`claude plugin update`), since the deck writes with it, and
   runs a scratch deck (`pilot deck --scratch`), never the user's deck on 4321, with fixture draft PRs on throwaway
   branches of HazzardRust/pilot that it closes after; no database (L9; L5 off on the scratch deck only).
1. QA posts a gate1 for a fixture ticket whose `feat/<slug>` is pushed: one draft PR appears against `pilot`, its
   body the artefact's spec and slice table (spec 2); `deck_status` moving one row edits it once, a repeat not at all.
2. A walkthrough post with `comment`, then a gate2 post with a changed `comment`: one QA comment on the PR, edited
   once (spec 3), read back with `gh pr view <n> --json body,comments`.
3. A fake failing remote: the ticket thread reads `feature PR not updated: …` once (spec 7).
4. `pilot integrate <branch> --dir <worktree>` integrates from another directory (spec 5).
5. `pilot doctor` on this machine names `Bash(pilot sync *)` and `Bash(pilot integrate *)` missing (spec 6).
6. `node scripts/check-references.mjs` exits 0, and 1 on a fixture prompt with `gh pr comment` (spec 1, 4, 5);
   the run's deck has 0 `Blocked: gh …` items.
7. A grep for a `gh` process start in `deck/` and `scripts/` hits only `deck/host.mjs`, and `pilot tickets` and a
   `pilot integrate` still read their PRs (spec 8).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 2 |
| S2 | planned | | | | S1 | 2, 7 |
| S3 | planned | | | | S1, S2 | 3 |
| S4 | planned | | | | – | 5 |
| S5 | planned | | | | – | 6 |
| S6 | planned | | | | S3, S4 | 1, 3, 4, 5, 8 |
| S7 | planned | | | | – | 2 |
| S8 | planned | | | | S1, S4 | 8 |
| deck-writes-github | planned | `feat/deck-writes-github` | | | S1–S8 | 1–8 |
