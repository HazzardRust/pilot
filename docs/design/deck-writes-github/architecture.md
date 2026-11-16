# The deck writes to GitHub, the crew never does

Ticket itm_5f1725c876a7 · slug `deck-writes-github` · base `origin/pilot` b38de846 · merge: none (re-cut, this ticket
alone) · re-cut 2026-11-16 of the plan signed 2026-10-20 (itm_a1470fd62ac4, "Re-cut, fresh Gate 1")

Lineage: the signed sha 50e92503 is not in this repository; it survives in `C:/Users/Hazzard/Projects/pilot-archive`
(worktree `pilot-design-deck-writes-github`), and its `docs/design/deck-writes-github/` is byte-identical to
3f453bcb on `origin/feat/deck-writes-github` (`diff -r`, 2026-11-16). This re-cut changes only what the drift forces.

## 1. Problem

Crew agents keep hitting denied commands: QA's `gh pr comment` and `gh api -X PATCH` (external write), the pilot's
`gh pr edit --base pilot` for a dropped stacked base, earlier `pilot integrate --default` and a co-pilot's
`pilot land`. Each denial stalls the run until the user is back. The user wants a systematic change, not another
rule: no crew agent writes to GitHub; the deck performs each write from the run record, as it already runs
`pilot land` on the gate2 press.

## 2. Spec

Sharpened from the ticket's six lines; 7 is added (found), 8 by the user. Re-cut: 1, 3 and 4 move and are *assumed*
until A4–A6 are answered; 2 follows L7' (*assumed*, awaiting itm_b69e08509bb5); 6's bar is re-measured.

1. *Assumed (A4).* No crew prompt names a GitHub write: `gh pr edit` (its `--base` retarget included),
   `gh pr comment`, `gh pr ready`, `gh pr close`, `gh api` with `-X`/`--method` PATCH or POST, or `gh pr create`
   for the feature PR; `gh pr create --draft` stands only in the implementer's own slice PR (A1). A dropped base is
   `deck_status base: pilot`, which the deck applies. *Evidence: `check-references` carries them as forbidden
   patterns; bar: exits 0 on the tree, 1 on a fixture prompt naming `gh pr edit 12 --base pilot`.*
2. *Assumed (L7').* The deck owns the feature PR: on a gate1 post and on every `deck_status` of a ticket that has one,
   it spawns `pilot pr --ticket <id>` (the installed bin, a fixed argv like `pilot land`), which opens the draft PR
   (head `feat/<slug>`, base the record's `base`, `pilot` or `feat/<N>`) when none is open, else rewrites its body
   from the artefact's §2 and the record's slice table and retargets it when its base differs; the architect no
   longer opens it (A2). practitioner: GitHub-bot maintainer: the write is idempotent. *Evidence: fake-gh verb tests
   and a daemon test over a fake spawn; bar: first run 1 create, a row change 1 edit, a base change 1 `--base`
   edit, the same record again 0 writes.*
3. (A5, answered.) QA's comment is the record's `qaComment`, sent as a `comment` field on QA's walkthrough post when
   the run has one and on every gate2 post (QA's or the pilot's short-path one); the same verb upserts one comment on
   the feature PR found by a hidden marker, so a lost id never posts twice. The "Non-additive migrations" section
   moves into it (A2). *Evidence: a daemon test over both posts and a verb test; bar: first text 1 POST, changed
   text 1 PATCH, same text 0 writes, a gate2 with no walkthrough 1 POST; `pilot-qa` names no `gh` write.*
4. (A6, answered.) `pilot integrate --default` stays gone (removed by one-integration-line, a usage error at
   `scripts/integrate.mjs:545-561`): `check-references` refuses it in crew prose. *Evidence: `check-references`;
   bar: exits 1 on a fixture naming `pilot integrate --default`, 0 on the tree.*
5. Every crew command that pushes or writes GitHub is one plain command with literal arguments: `pilot integrate
   <branch> --dir <worktree>`, `git -C <dir> push`; `cd <dir> && { …; }` stays for local reads and tests
   (A3). *Evidence: `pilot integrate --dir` test; `check-references` refuses `&& pilot integrate` in crew prose;
   `measure-prompt` within each touched agent's pin; bar: 0 `&& pilot integrate` in `agents/`.*
6. `pilot doctor` reads `~/.claude/settings.json` and names each of the install's pilot allow rules that is missing,
   with the install command as its step (the install already writes them, ADR 0110). *Evidence: a doctor test over a
   settings fixture; bar: a fixture missing `pilot sync *` and `pilot integrate *` fails naming exactly those 2;
   this machine, which now holds every rule, reads `pass`.*
7. Added (found): a deck write that fails puts one line on the ticket's thread, `feature PR not updated: <line>`
   (a credential withheld), the same line once, and the next trigger retries; nothing blocks, nothing waits on the
   user. *Evidence: a daemon test over a failing fake spawn; bar: 1 note for 2 identical failures, 0 Blocked items.*
8. Added (user, itm_f93fc6cf6eb6): every GitHub call the deck and its scripts make goes through one module,
   `deck/host.mjs`, with no `gh` invocation elsewhere in `deck/` or `scripts/`, so a second host (GitLab, Gitea, plain
   git) is one adapter; the agents name no GitHub write beyond A1's `gh pr create --draft` and reads (`gh pr view`,
   `gh pr list`). *Evidence: a grep of `deck/` and `scripts/` finds a `gh` process start only in `deck/host.mjs`;
   bar: 0 starts outside the module on the tree (3 today).*

Acceptance as a whole (practitioner: SRE; raw material: the deck's `Blocked:` items `hooks/permission-denied.js`
posts): QA's run of a fixture feature yields 0 `Blocked: gh …` items, and `gh pr view <n> --json
body,baseRefName,comments` on the fixture PR confirms the body, the base and the one QA comment from outside.

## 3. Findings (re-anchored on b38de846)

- The daemon calls no `gh`: its one GitHub path spawns `node <PILOT_BIN> land` (`deck/landing.mjs:247`, with
  `landingSpawnOptions` :154 exported, `watch` :170 **not** exported, `PILOT_DECK_NO_LAND` :227; `aSpawn()` in
  `deck/test/landing.test.mjs:55`). ADR 0154 Rejected (:35) refused a daemon-side `gh` and kept the spawn shape fixed;
  its 0161 and 0167 amendments leave that line standing. `deck/test/create.test.mjs:220` pins no `child_process` in
  `deck/server*.mjs`/`store*.mjs`.
- `gh` process starts: `ghIn` (`scripts/integrate.mjs:59`, imported by `scripts/land.mjs:27,54`), a copy in
  `deck/tickets.mjs:24`, an inline one in `scripts/branches.mjs:149`. Verbs: `pr list` (4), `pr view`, `pr edit
  --base` (`retarget`, `scripts/land.mjs:264-283`, the landed-base case), `pr comment` (`land.mjs:334`), `api user`.
- `pilot gh-stub` (`scripts/gh-stub.mjs`, ADR 0173) fakes `gh` by PATH for `execFileSync('gh', …)`; the host keeps
  that call shape so the stub still intercepts.
- Crew writes today: `agents/pilot-qa.md:140-141` (`gh pr comment`), `:206-211` (edit the body; `gh api -X PATCH`);
  `agents/pilot.md:362-364` (the architect opens the feature PR), `:399` (`cd "<worktree>" && pilot integrate`),
  `:504` (`gh pr edit --base pilot` for a dropped N); `agents/pilot-architect.md:188-190` (`gh pr create --draft
  --base <base branch> --head feat/<slug>`). `pilot land` in `pilot-co-pilot.md:47-48,100`, `pilot-implementer.md:56,
  179`, `pilot-qa.md:91`, `pilot-lander.md:34` is descriptive or a prohibition (ADR 0161).
- `callTool(name, args, land = {})` (`deck/server-tools.mjs:203`); the gate1 path :213, `deck_reply`'s
  `startLanding(..., ...land)` :315, `deck_status` :322 (the architect's call carries `ticket`, `slices`, `feature`
  only, :326-329). Record fields `RECORD_ORDER` (`deck/runs.mjs:239`, `base` among them); `setSlices`
  (`deck/store-runs.mjs:548`); `refuseCredentials` (`deck/store-core.mjs:119`); `findCredential` (`store.mjs`).
- Item shapes: `GATE1_FIELDS`, `GATE2_FIELDS` (walkthrough optional, L19), walkthrough `SPECS` entry
  (`deck/items.mjs:214-252`); a gate1 carries `surface` (ADR 0181).
- `scripts/integrate.mjs` `main` (:548): `--trial` exclusive, any other flag a usage error, exit 1 (:560-561).
  `pilot --dir` exists only before the verb (`bin/pilot.mjs:208`).
- `PILOT_MERGE_ALLOW` (`scripts/install-settings.mjs`, not exported) holds sync, integrate, land, landing, ps;
  `denyCovers` :557 not exported; `checkAll` (`deck/doctor.mjs:326`) reads no settings. This machine's settings hold
  every one of them, so doctor's row passes here.
- `checkReferences(root, paths = SURFACE)` (`scripts/check-references.mjs:237`), `FORBIDDEN` :35. ADR 0180: no test
  asserts a phrase in prose; a structural lint carries `// lint: <rule>`. Pilot prompt pin 11864
  (`scripts/test/measure-prompt.test.mjs:205`); QA's in `scripts/test/qa-preview.test.mjs`.
- Next ADR number 0182; ADR 0154 already reads `amended` (0161, 0167).
- The deck lands with the installed plugin, so this takes effect after `claude plugin update`.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `deck/host.mjs` (new) | `HOST_VERBS`, `hostIn(cwd) -> (args) => string` | the one `gh` process start, the verb table, refusal of any other verb | true external (`gh`) |
| `scripts/feature-pr.mjs` (new) | `featureBody(spec, record, footer)`, `syncFeaturePr({ gh, git, record })`, `main(argv)` | PR lookup by head, create-or-edit, base retarget, unchanged skip, QA comment marker, run-remote check | true external (`hostIn`, injected) |
| `deck/pr-writes.mjs` (new) | `startPrWrite(ticketId, repo, deps)` | the spawn, one in flight per ticket plus one rerun, the note, credential withhold | true external (spawn, injected) |
| `deck/server-tools.mjs` | `callTool(name, args, deps)` | the two triggers (gate1 post, `deck_status`), the `comment` → `qaComment` copy | in-process |
| record `qaComment` | `deck/tools.mjs` `comment` on `deck_post`; `RECORD_ORDER` | length bound, credential refusal | in-process |
| `scripts/integrate.mjs` | `main(argv)` with `--dir <worktree>` | the chdir | local-substitutable |
| `deck/doctor.mjs` | `checkAll(deps)` row `pilot allow rules` | settings read, `denyCovers` reuse | local-substitutable |
| `scripts/check-references.mjs` | `FORBIDDEN`, `checkReferences(root, paths)` | the write and shape patterns | in-process |

Deletion test: `feature-pr.mjs` holds the gh calls three callers would otherwise repeat (gate1, status, QA);
`pr-writes.mjs` holds the spawn discipline `landing.mjs` already has, reusing `landingSpawnOptions` and `watch`
(exported by S2) rather than a second copy. `host.mjs` folds the three runners (S8): deleted, a `gh` process start
reappears in four files and a second host means editing each.

## 4. Ubiquitous language

- **Deck write**: a GitHub write the daemon starts by spawning `pilot pr`, never an agent's tool call.
- **Feature PR**: the one draft PR `feat/<slug>` → the record's `base`, opened, rewritten and retargeted only by a deck write.
- **QA comment**: the one comment on the feature PR carrying `<!-- pilot:qa -->`, its text the record's `qaComment`.
- **Trigger**: a gate1 post, a `deck_status`, or a walkthrough or gate2 post with `comment`, for a ticket with a gate1.
- **Host**: `deck/host.mjs`, the one module that starts a `gh` process; a verb outside `HOST_VERBS` is refused.
- **One plain command**: a single subcommand with literal arguments, no `&&`, `;`, `|` or shell variable.

## 5. Locked decisions

- **L1** The daemon still runs no `gh`: it spawns `node <PILOT_BIN> pr --ticket <id>` with `landingSpawnOptions`,
  as ADR 0154 (:35) kept the landing. Rejected: `gh` in the daemon (a second process discipline, untested there).
- **L2** One verb does every feature-PR write, reading the record over `/api/record` as `pilot ready` does and the
  artefact by `git show origin/feat/<slug>:<artefact>`; the daemon passes its own port and store dir in the env, so
  a scratch deck's verb reads the scratch record. Rejected: a temp record file (cleanup, a second source).
- **L3** Writes are idempotent: the PR found by head, its body and base compared before an edit, the comment found by
  marker. A missing `feat/<slug>` on origin or a run remote other than `origin` prints one line and exits 0.
  Rejected: storing the PR number or comment id in the record (state that drifts from GitHub).
- **L4** Triggers coalesce per ticket: one spawn in flight, at most one rerun queued. Rejected: one spawn per call.
- **L5** `PILOT_DECK_NO_LAND` also stops deck writes, so no daemon test reaches GitHub. Rejected: a second switch.
- **L6** QA's comment rides on its own posts (`comment` on walkthrough and gate2), QA's tools unchanged. Rejected:
  giving QA `deck_status` (it could move rows).
- **L7'** (re-cut; awaiting itm_b69e08509bb5, default taken) The base is the record's `base`, `pilot` or `feat/<N>`;
  `pilot pr` retargets with `gh pr edit --base` when GitHub's differs; the title `feat(<slug>): <feature>` from the
  record. Was L7: the base is `pilot` (one-integration-line A1), overturned by stacked bases (`agents/pilot.md:364,
  504`). Rejected: keeping `pilot` and leaving a stacked PR's base to the pilot (a crew write spec 1 bans).
- **L8** Grilling depth: forks (the user, itm_e8f2042663eb, 2026-10-20). Rejected: the thread's other depths.
- **L9** (awaiting itm_558bd20de355, unchanged by default) QA runs on a scratch deck (`pilot deck --scratch`) with
  fixture draft PRs on throwaway branches of HazzardRust/pilot, which QA closes after; never the user's deck on 4321;
  no database (the user, itm_adda0735a7fd). This run is the stated exception to ADR 0173's "never real GitHub"
  (`agents/pilot-qa.md:101`): only a real PR proves acceptance's read-back; the verb tests run under `pilot gh-stub`.
  Rejected: the user's deck (fixture writes among real tickets).

## 6. Assumed decisions

- **A1** Only feature-PR writes move: an agent still pushes its own branch and the implementer opens its own draft
  slice PR (`gh pr create --draft`), neither ever denied; the pilot's slice-PR close fallback goes. Rejected: the deck
  opening slice PRs too. Thread itm_ab137d949ec8. **Answered** 2026-10-20: "Feature PR and comments only".
  Verdict: stands — re-cut: still holds; `pilot.md` no longer carries the close fallback.
- **A2** The feature PR body is the deck's alone, overwritten on every change; QA's corrections and the
  "Non-additive migrations" section move into the QA comment. Rejected: a deck-owned marked section inside a body
  others edit. Thread itm_217e4ac33d2f. **Answered** 2026-10-20: "body is the deck's".
  Verdict: stands — re-cut: still holds; `pilot-qa.md:206-207` still edits the body today.
- **A3** "One plain command" binds commands that push or write GitHub; `pilot integrate` takes `--dir`, so the
  existing `Bash(pilot integrate *)` matches; `cd <dir> && { …; }` stays for local reads and tests. Rejected: an
  allow rule `pilot --dir * integrate *`; banning `cd &&` everywhere. Thread itm_3b7bfdbafe55. **Answered**
  2026-10-20: "writes only". Verdict: stands — re-cut: crew-tests-behaviour has landed; the reason holds.
- **A4** (re-cut, spec 1) The ban adds `gh pr edit --base` and the feature PR's `gh pr create`; a dropped N is
  `deck_status base: pilot`, retargeted by the deck; the architect opens no PR. Tradeoff: retarget waits on the next
  deck write. Rejected: the pilot keeps the retarget as the one exception. Thread itm_c647d4200652. **Assumed.**
- **A5** (re-cut, spec 3) `comment` on the walkthrough when there is one and on every gate2. Tradeoff: a run with no
  walkthrough comments only at gate2. Rejected: gate2 only. Thread itm_62acc0074933. **Answered** 2026-11-16: "Gate2 always, walkthrough too", the default.
- **A6** (re-cut, spec 4) Spec 4 is the `--default` lint alone; the `pilot land` half is dropped (ADR 0161). Tradeoff:
  no lint on descriptive `pilot land`. Rejected: dropping spec 4. Thread itm_958e79727604. **Answered** 2026-11-16: "Lint only", the default.
- red team: (2026-10-20, stands) S2's trigger on every `deck_status` would spawn in ~100 daemon tests: L5 and the gate1
  condition keep them offline (S2 test 3). `callTool`'s third argument spreads into `startLanding` (:315): S2 renames
  it `deps` with `prWrite` beside the landing keys. A gate1 before `feat/<slug>` is pushed: L3's quiet `no PR yet`,
  and the next `deck_status` retries. `HOST_VERBS` carries the reads (`pr list`, `api user`) and `pr edit --base`.
- red team: (re-cut) S6's old pin edits to `measure-prompt` and `qa-preview` met ADR 0180: S6 moves only token
  budgets by measured cost and asserts no phrase; its lint tests carry `// lint: forbidden pattern`.
- red team: (re-cut) S7's old test 2 ("0154 reads amended") is green on the base (0154 is amended by 0161, 0167):
  replaced by the new ADR passing `adr-format`; the 0154 line is evidence, not a test.
- red team: (re-cut) S4's test 2 expected exit 2; `main` exits 1 on a usage error (:561), and `--trial` is exclusive,
  so `--trial --dir` must parse: S4 test 2 reads 1, test 4 added.
- red team: (re-cut) the architect, not the pilot, opens the feature PR today (`pilot-architect.md:188-190`), a file
  the old S6 did not own: S6 now owns it. Between S2 and S6 both the architect and the deck could open it: L3 finds
  the PR by head, so the deck edits and never opens a second (S1 test 1 runs with an open PR too).
- red team: (re-cut) `land.mjs` `retarget` (:264) already moves a stacked PR to `pilot` when its base lands; L7'
  only covers the dropped-N case and the record's view, and S8 keeps `retarget` on `hostIn` unchanged.

## 7. Out of scope

- Trivial work's one PR to the default branch (`agents/pilot.md:189`), its open stays the pilot's.
- The landing's own writes (`scripts/land.mjs`: main PR, `retarget`, comment), already deck-run.
- Slice PRs (A1); `git push` of an agent's own branch; the lander's `pilot sync`.
- Writing missing allow rules: the user re-runs the install, which doctor now names.
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
| S6 | The crew names no GitHub write and one plain command | 1, 3, 4, 5, 8 | `agents/pilot.md`, `agents/pilot-qa.md`, `agents/pilot-architect.md`, `agents/pilot-implementer.md`, `scripts/check-references.mjs`, `scripts/test/references-writes.test.mjs` (new), `scripts/test/measure-prompt.test.mjs`, `scripts/test/qa-preview.test.mjs` | S3 (`comment` field), S4 (`--dir`) | typescript, security | [S6](slices/S6.md) |
| S7 | ADR and OPERATING say the deck writes GitHub | 2 | `docs/adr/NNNN-the-deck-writes-to-github.md` (new), `docs/adr/README.md`, `docs/adr/0154-gate2-frees-the-lane.md`, `docs/OPERATING.md` | – | typescript | [S7](slices/S7.md) |
| S8 | Every `gh` call goes through `deck/host.mjs` | 8 | `deck/tickets.mjs`, `scripts/branches.mjs`, `scripts/integrate.mjs`, `scripts/land.mjs`, `scripts/test/host-bar.test.mjs` (new) | S1 (`hostIn`), S4 (`scripts/integrate.mjs`) | typescript, security | [S8](slices/S8.md) |

S1 is the walking skeleton: `pilot pr --ticket <id>` in a fixture checkout under `pilot gh-stub` opens one draft PR
whose body is the fixture artefact's spec and slice table. Stems: S1→S2→S3→S6 (4); S4→S6; S1→S8, S4→S8; S5, S7
alone. Re-cut changes: one-integration-line and crew-tests-behaviour are on pilot, so no rebase notes stand; S6
owns `pilot-architect.md` in place of `pilot-co-pilot.md` (whose `pilot land` lines are descriptive, A6); S4 and S8
both own `scripts/integrate.mjs`, never side by side (S8 after S4).

## 9. Acceptance evidence

0. QA updates the installed plugin from the feature (`claude plugin update`), since the deck writes with it, and
   runs a scratch deck (`pilot deck --scratch`), never the user's deck on 4321, with fixture draft PRs on throwaway
   branches of HazzardRust/pilot that it closes after; no database (L9; L5 off on the scratch deck only).
1. QA posts a gate1 for a fixture ticket whose `feat/<slug>` is pushed: one draft PR appears against the record's
   base, its body the artefact's spec and slice table (spec 2); `deck_status` moving one row edits it once, a repeat
   not at all; `deck_status base: pilot` on a fixture with base `feat/<N>` retargets it once.
2. A walkthrough post with `comment`, then a gate2 post with a changed `comment`: one QA comment, edited once; a
   second fixture's gate2 with no walkthrough posts its one comment (spec 3), read back with `gh pr view`.
3. A fake failing remote: the ticket thread reads `feature PR not updated: …` once (spec 7).
4. `pilot integrate <branch> --dir <worktree>` integrates from another directory (spec 5).
5. `pilot doctor` on this machine reads `pass  pilot allow rules`; the fixture test names the 2 missing (spec 6).
6. `node scripts/check-references.mjs` exits 0, and 1 on a fixture prompt with `gh pr edit 12 --base pilot` or
   `pilot integrate --default` (spec 1, 4, 5); the run's deck has 0 `Blocked: gh …` items.
7. A grep for a `gh` process start in `deck/` and `scripts/` hits only `deck/host.mjs`, and `pilot tickets` and
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
| deck-writes-github | planned | `feat/deck-writes-github` | #4 | | S1–S8 | 1–8 |
