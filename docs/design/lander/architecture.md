# A landing agent owns every merge and the clean tail; one Gate 2 press lands

Ticket `itm_439d37064018` · feature `lander` · base `pilot` at `bc4eb8ea` · runs after
landing-keeps-worktrees (#785) and held-handoff (`itm_8a85a7dbe884`, design/held-handoff `aee71dcc`) ·
amends ADR 0154 L5-L7, ADR 0116 L5 and landing-keeps-worktrees' ADR

## 1. Problem

The user's words: "landing is a complex process of resolving merge conflicts. it is not something that the
deck can handle on it's own, and i dont want the pilot dealing with it other than for high level decisions.
this should be an agent's job. pressing gate 2 ensures that the PR is opened with no merge conflicts and is
passing all the tests it needs to." A landing queues instead of spawning when the pilot is at its hand-off
cap. The same agent keeps the branch tail clean and takes landing work off the pilot, which the user calls
"a massive attention drain".

Three incidents from today:
- Gate2 `itm_514e6cd6dba0` landed short after one press: `NOT synced: main@ef6c374 conflicts with pilot in
  README.md`.
- A main-to-pilot sync needed an implementer. The pilot's push to `pilot` was refused as a merge without
  review, so it went through PR #837 and a blocking item.
- A co-pilot's `sed` on README.md mid-merge was refused as irreversible local destruction.

## 2. Spec

The user agreed lines 1-9 as written (itm_fb4602890eec, "Agreed"). Line 10 is the user's addition on A1 (itm_2d42865fad51).

| # | Behaviour a user can watch | Evidence |
| --- | --- | --- |
| 1 | A `pilot-lander` agent resolves a landing conflict. It uses `resolving-merge-conflicts` in the kept worktree, runs `npm test` there, commits, and replies `Land again` on the gate2. The deck lands that commit. The pilot only spawns it, and judges a trade-off only when the lander flags one. | `agents/pilot-lander.md` wording pin; `deck/test/land-again.test.mjs`: the lander's `Land again` starts the landing; another crew kind's is refused |
| 2 | `pilot land`, `pilot sync` and `pilot integrate --default` each stop on a conflict with one line naming the lander and a kept worktree. Sync today removes its worktree; integrate resets. QA and the co-pilot hand that line to `main` and resolve no hunk. | one conflict test per command asserting the kept dir and `the lander resolves in <dir>`; wording pins on `pilot-qa.md` and `pilot-co-pilot.md` |
| 3 | The deck refuses a gate2 whose `sha` does not merge clean onto `origin/pilot`. Clean means a merge-tree with no source conflict, or a kept land worktree holding the lander's committed merge of that sha. `pilot integrate --default` makes the same check, so QA learns of a conflict before posting. | `deck/test/gate2-base.test.mjs`: a conflicting sha is refused naming the lander; a prepared merge is accepted; `integrate-default` test: the trial line |
| 4 | One press lands. Every refused landing goes to the lander: a conflict, a red gate on the merge, a sync-first stop, or pilot moving twice. The page no longer offers Sign off again. | a landing test: pilot moves between the press and the merge, the lander resolves, and the feature lands with one stored press; a render test: a refused gate2 draws no second Sign off |
| 5 | A press makes a lander due on its gate2. The pilot spawns it from the press line unless it is at its cap (A1). Otherwise it stays queued, and the fresh session's first prompt after `/clear` names it. | `deck/test/run.test.mjs`: an open hand-off plus a due lander gives no spawn line to the old session, and the first prompt names `pilot-lander <gate2>`; `lander-queue.test.mjs`: the press line reads `queued` |
| 6 | The generated ADR index and the vocabulary exempt list resolve without a stop in all three merges. | `merge-generated.test.mjs`: one test per command with both files conflicting |
| 7 | A landing leaves a clean tail. On `pilot` it is one merge commit of the signed sha, after any sync merge of main, and that merge carries the run record. Land deletes the run's merged `slice/<slug>-s<n>` branches. Afterwards `pilot branches prune --slug <slug> --dry-run` lists only `feat/<slug>`, which waits on its PR to main. | `land-record.test.mjs`: the record is in the merge's tree; `land-prune.test.mjs`: the dry run lists only `feat/<slug>` |
| 8 (amended) | Once QA has torn down, the lander runs `pilot worktrees prune --run <slug>`, posts the closing report from the run record (landing sha, merge-first line, worktrees kept, deferred findings, assumed decisions; the deck ranks friction) and sets the record's `finished`. It then hands the pilot one line: `landed <sha7> · merge first: … · kept: … · report: <id>`. The pilot quotes it in its `Findings:` reply. Step 9's resolver paragraph and Ending a run's prune and report lines leave `agents/pilot.md`. | `measure-prompt.test.mjs`: the pilot pin falls by the measured cut; wording pins on the hand-back line in `pilot-lander.md` and `pilot.md`; `deck/test/closing-report.test.mjs`: the body built from a record names its landing sha and merge-first line |
| 8b (added) | On `landed` the deck resolves the gate2 and posts no report, and no restart writes one; the lander's `report`, posted without a body, is filled by the deck from the run record (`closingReportOf`) and is the ticket's only closing report, which closes it. Amended with L12, on the user's A (S10 question). | `deck/test/closing-report.test.mjs`: landed posts no report; the lander's bodiless report is filled from the record and closes the ticket; the human step reads `Merge <pr>, then #<this>` or `#<this> alone` |
| 9 | ADR 0154 L5-L7, ADR 0116 L5 and landing-keeps-worktrees' ADR read amended, and one new ADR records the lander. | status lines; `npm run adr-index` clean |
| 10 | The agent budget is one larger, so a lander fits beside the co-pilot: `DEFAULT_BUDGET.main` goes from 4 to 5 and `CEILING` from 12 to 13, so the default split sums to the ceiling with no warning. A split already stored is kept (budget A5). | `deck/test/budget.test.mjs`: `CEILING` is 13, `checkBudget({ main: 5, yellow: 8 })` has no warning, `{ main: 5, yellow: 9 }` warns `14 is over the ceiling of 13`; `rules/orchestration.md` reads thirteen |
| 11 (added) | The plugin version is bumped by a patch, 0.9.3 → 0.9.4, in the three files that carry it (`npm run bump`). The user's words on the gate1 (itm_778d97453131, after Sign off): "add a version bump, a small one please". | `package.json`, `package-lock.json` (top and `packages[""]`) and `.claude-plugin/plugin.json` read `0.9.4`; `pilot --version` prints it |
| 12 (added) | One pilot session writing two tickets’ run records keeps each record’s own feature name; a co-pilot’s `deck_status` no longer renames another ticket’s `run.json`. Found by the mac-linux co-pilot, verified at `deck/store-runs.mjs:590,664`; added by the co-pilot within rails, moving no locked decision. | `deck/test/record-feature.test.mjs`: two slugs named in turn keep their names |
| 13 (added) | A crew agent's `pilot wait --as <kind>` without `--item` is refused, so one run's QA is never handed another run's Sign off. Found by lander's QA, which was replayed three other runs' resolved presses; added by the co-pilot within rails, moving no locked decision. | `deck/test/wait-as.test.mjs`: `--as qa` alone is refused naming `--item`; `--as pilot` is unchanged |

**Implied:**
- Lines 3 and 4 make the press safe. Line 2 is what QA sees before it.
- Line 5 is the pilot's whole share of a landing; line 8 moves the closing report to the lander (L12).

**Cannot mean here:**
- "The deck spawns the lander". The deck spawns only `node pilot land` and a terminal (`deck/landing.mjs:376`,
  `deck/session.mjs:129`), so the pilot spawns it.
- The draft's "dry run lists nothing". `feat/<slug>` stays until its PR to main merges (`scripts/branches.mjs`
  merged rule).
- "The lander pushes `pilot`". See L3.

## 3. Findings

- **Merges:**
  - `sync` and `land` share `mergeIntoPilot` (`scripts/sync.mjs:52`). It makes a temp worktree at the run
    remote's pilot, runs `mergeResolved` (`scripts/merge-generated.mjs:197`) and `npm test`, then
    `git push <runs> <sha>:refs/heads/pilot`.
  - `integrate --default` is `takeDefault` (`scripts/integrate.mjs:413`). It pushes `feat/<slug>` to origin.
- **Conflict lines today:**
  - land: `…; resolve in <dir>, commit, and land again` (`land.mjs:263`). The kept dir is
    `<checkout>-land-<slug>` (`:192`), and `resume` (`:199`, `:274-307`) re-merges it onto a moved pilot.
  - sync: `NOT synced: <label> conflicts with pilot in <paths>; nothing pushed` (`sync.mjs:81`), with the
    worktree removed (`:122`).
  - integrate: `default NOT taken: …; nothing merged or pushed`, after `reset --merge` (`integrate.mjs:430`, `:454`).
  - The deck parses only land's line (`deck/store-items.mjs:463` `conflictOf`).
- **Generated files:**
  - The ADR index is `merge=union` (`.gitattributes:2`) and regenerated (`merge-generated.mjs:44-60`).
  - `run.json` is taken by side (`:141-147`). The prompt pin is re-measured, by integrate only (`:85-126`).
  - The vocabulary exempt paths are one long line, `scripts/vocabulary.mjs:27`. It was hand-resolved in
    `434864ba`, and nothing resolves it.
- **Gate2:** `assertHoldsDefault` (`deck/server-tools.mjs:178-183`, `deck/gate2-base.mjs:37-59`) checks main
  only. Nothing checks pilot before the press.
- **The press:**
  - `deck/server-routes.mjs:245-258` leads to `startLanding` (`deck/landing.mjs:336`).
  - One landing runs per repository, and a second press queues (`store-items.mjs:495`, `landing.mjs:403`).
  - A refused landing wakes the pilot as a `from:'deck'` line (`store-items.mjs:404-416`).
  - The page offers Sign off again on `refused` (`deck/ui/render-parts.mjs:316`).
- **`Land again` and `Resolving`:** the pilot's words only (`deck/landing-replies.mjs:43-63`,
  `server-tools.mjs:309`). `Land again` needs a conflict and a kept worktree. The 15-minute clock is in
  `server-wait.mjs:348-392`.
- **Authors:** `authorKind` (`deck/items.mjs:368`) maps `pilot:pilot-<x>` to `<x>` if it is in `AUTHOR_KINDS`,
  else `other`.
- **Cap:**
  - The pilot's hand-off is `pilot handoff` at the guard's mark (`agents/pilot.md:571-585`,
    `hooks/context-size-guard.js:68-69`).
  - The agent room is `pilot budget` (`deck/budget.mjs`, main 4).
  - After `/clear`, the wrapper types `FIRST_PROMPT` (`deck/run.mjs:337-345`).
  - held-handoff adds the pure `holdFor(items, cwd, coPilot, now)` and leaves "a landing queued past the
    cap" to this run (its §7).
- **Land's tail:**
  - `deleteRunBranches` (`land.mjs:134`) deletes design, qa and fix branches, not slice branches. Origin
    still holds `slice/clean-landing-s1..s11`.
  - `catchUp` discards the deck's `run.json` mirror (`land.mjs:111`).
  - `commitRecords` (`integrate.mjs:187`) commits it.
- **Pins:**
  - pilot `own <= 11496.5` (`scripts/test/measure-prompt.test.mjs:168-175`).
  - Step 9 phrases (`scripts/test/landing-wording.test.mjs:12-35`).
  - `CREW` (`scripts/test/pilot-agents.test.mjs:30-41`); a new agent needs a Models row and the pilot's `Agent(...)` entry.
- **Gate slots:** they are machine-wide and first come, first served (`scripts/gate-slots.mjs:103`). Today a
  pilot's `pilot sync` waited behind QA's sync and the mac-linux base.

### Seams

Deletion test:
- `mergeIntoPilot` earns its keep: land and sync would each rebuild the temp-worktree merge.
- The three conflict lines are three formatters for one fact, and the deck parses one of them. They are folded
  into `conflictLine` and `LANDER_LINE` (S2), so the emitters and the parser cannot drift.
- `resolveGenerated` gains an exported predicate the gate2 check shares, instead of a second list.
- The lander queue is derived from items by one pure function, which both the press line and the wrapper read.

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `scripts/merge-generated.mjs` | `conflictLine({ head, onto, paths, dir }) -> string`, `LANDER_LINE: RegExp`, `autoResolves(path) -> boolean`, `mergeResolved` | the three commands' conflict wording and the deck's parse; the generated-file list | In-process |
| `scripts/sync.mjs` | `mergeIntoPilot({ …, keep, reuse, push })`, `sync({ cwd, git, test, keep })` | the kept sync worktree and its resume | Local-substitutable (git fixture) |
| `scripts/integrate.mjs` | `takeDefault(…)`, `trialOnPilot({ cwd, git, head }) -> { clean } \| { paths, dir }` | the kept default merge and the trial merge onto pilot | Local-substitutable |
| `deck/gate2-base.mjs` | `cleanOnPilot(repo, sha, { git }) -> { ok } \| { ok: false, paths, why }` | merge-tree plus the prepared-merge read | Local-substitutable |
| `deck/landing-replies.mjs` | `landingReply(item, text, kind, at)`, `landerDue(items, repo) -> gate2Id[]` | who may say `Land again` and `Resolving`, and which gate2s wait on a lander | In-process (pure) |
| `deck/run.mjs` | held-handoff's `holdFor` (unchanged), `firstPrompt(items, cwd) -> string` | the queued lander named after `/clear` | In-process (pure) |
| agent prose | the pinned phrases in S1, S5, S8, S10 | the lander's rules, the press spawn and the hand-back | In-process (file read) |

## 4. Ubiquitous language

- **Lander**: the `pilot-lander` agent; one per repository at a time.
- **Kept worktree**: the worktree a merge command leaves mid-merge for the lander: `<checkout>-land-<slug>`,
  `<checkout>-sync` or `<checkout>-default-<slug>`.
- **Lander line**: `conflictLine`'s output, `… conflicts with <onto> in <paths>; the lander resolves in <dir>`.
- **Due lander**: a signed gate2 with no lander's `Resolving` yet.
- **Clean on pilot**: `cleanOnPilot` holds for the sha.
- **Hand-back line**: `landed <sha7> · merge first: … · kept: …`.

## 5. Locked decisions

- **L1 Depth: forks** (itm_561c32a504a3, the user took the default).
- **L2 The pilot spawns the lander, and the lander is a new agent type.** The deck cannot spawn an agent.
  The press line asks once, and the brief is the gate2 id. This reverses ADR 0154 L6 ("no new agent type"),
  because the resolver now also prunes, gates and hands back.
  Rejected: a `pilot-implementer` on a fix brief (today), which the pilot writes per conflict.
- **L3 The lander never moves `pilot` itself.**
  - `pilot` moves only through the deck's spawned `pilot land`, on the lander's `Land again`. That process is
    outside the permission classifier, and it is how the deck lands today.
  - `feat/<slug>` moves through `pilot integrate --default`, as QA's push does today.
  - A standalone sync conflict is the one push the lander makes itself: `pilot sync`, which resumes the kept
    sync worktree under the install's allow rule (ADR 0110). If the classifier refuses it, `hooks/permission-denied.js`
    already posts one blocking question, and the user runs `! pilot sync` once.
  - Rejected: the lander running `git push`/`git merge` onto pilot (refused as a merge without review), or
    `pilot land` (refused from the crew, ADR 0154 L5). Also rejected: a deck route that runs sync, which is a
    second spawn shape.
- **L4 No destructive edit mid-merge.**
  - The lander resolves a hunk only with the Edit tool. A generated file is regenerated by its generator.
  - It stages by name and runs `git commit --no-edit`.
  - It never runs `sed -i`, `git checkout --ours/--theirs`, `reset`, `--abort`, `rm` or `clean` mid-merge.
  - A refused edit is a flagged trade-off, which the pilot turns into one question.
  - Rejected: whole-file side picks, the shape the classifier refused today.
- **L5 One lander per repository, and nothing yields a gate slot.**
  - A second due lander waits on the first's hand-back. The deck already runs one landing per repository.
  - The lander runs `npm test` once, on its final resolution, and runs none while the deck's `pilot land`
    runs; it waits on `pilot landing <gate2>` instead.
  - Slots stay first come, first served for QA, the lander and the pilot alike.
  - Rejected: lander priority, which needs a preemptive slot and would stall QA's gate mid-suite.
- **L6 The gate2 check is merge-tree plus a prepared merge.** No worktree is made at post time. A conflict
  that only generated files have (`autoResolves`) counts as clean.
  Rejected: merging `pilot` into `feat/<slug>`, which ADR 0116 L6 forbids.
- **L7 Every refused landing goes to the lander, and the deck refuses a second press.** `Land again` from the
  lander runs land on any `refused` gate2: in the kept worktree when there is a conflict, otherwise fresh.
  Rejected: keeping Sign off again for non-conflict refusals, which is the user's second press.
- **L8 The exempt paths move to `scripts/vocabulary-exempt.txt`**, one path per line, `merge=union`.
  Rejected: a line-level resolver for `vocabulary.mjs:27`, which is code that parses code.
- **L9 The lander claims by `Resolving`.** It is accepted from the lander on any signed gate2 and stops the
  15-minute clock. A due lander is derived from items, so nothing is migrated (ADR 0154 L1's pattern).
- **L10 The run record is committed on `feat/<slug>` before the landing merge**, by `commitRecords`, so the
  one merge carries it. Rejected: a second commit on `pilot` after the merge, which is a second push.
- **L11 The agent budget rises by one** (the user's, itm_2d42865fad51: "both caps, but lets raise the agent budget by 1"). The rise is main's share, so `DEFAULT_BUDGET` goes from `{ main: 4, yellow: 8 }` to `{ main: 5, yellow: 8 }`. `CEILING` goes from 12 to 13, so the default split stays at the ceiling. A stored split is kept, as `deck/budget.mjs` A5 says, so a deck with a stored main of 4 needs `pilot budget` run by hand.
  Rejected: taking the agent from yellow, which the user did not ask for.
- **L12 (amended) The lander posts the closing report** (the user's, itm_978cf284c354: "Yes, the lander posts it"; reaffirmed as A on the S10 question: "change the mechanics all you want, the old system is stale and bumpy, this should not be a deterministic mechanic"). It builds the `report` item from the run record through `deck/closing-report.mjs` and sends `finished: "closing report posted"`; the pilot's verdicts are already in the record. A human step that needs a judgement call comes to the pilot as one line first. Trade-off: the report's human steps are written by an agent that never saw the user's chat.
  Rejected: the pilot keeps the report and the lander hands it the landing line only (spec 8 as drafted).
  Amended: gate2-frees-lane's deck already posted the report on `landed` (`closeLanded`); the deck stops (S15, spec 8b) and the lander's bodiless `report` is filled from the record. Rejected: the deck keeps posting (B).
  overridden: a landing with no live lander has no report until the next session's lander posts it

## 6. Assumed decisions

- **A1 Either cap queues the lander.** The two caps are the pilot's posted context hand-off, and
  `pilot budget` with no room. Trade-off: two triggers to test. Rejected: the context hand-off alone. Thread
  `itm_2d42865fad51`. Answered: both caps, plus a budget one larger (L11, spec 10).
  Verdict: stands — the user's hand-off cap wording covers both readings and nothing queued narrows it
- **A2 A lander on every press.** Trade-off: one Opus agent per landing, even a clean one. Rejected: a lander
  only on a refusal, which leaves the prune and the reading with the pilot. Thread `itm_585d60ae10fc`. Answered: every press.
  Verdict: stands — the ticket says pressing gate 2 ensures no merge conflicts, which a per-refusal lander cannot promise
- **A3 The lander runs on Opus.** Trade-off: Opus price on a clean landing. Rejected: Sonnet. Thread
  `itm_faf191727e8c`. Answered: Opus.
  Verdict: stands — a hunk resolution is judgement, and no run has a Sonnet precedent for it
- **A4 S8 runs after S1 and S7 only** (co-pilot, assumed). held-handoff (`itm_8a85a7dbe884`) is queued and not built, so S8 does not wait on it; where S8 needs `holdFor` and it is absent on `pilot`, its implementer builds against what is there and reports the gap. Trade-off: S8 may rebase when held-handoff lands. Rejected: holding S8 and S10 on an unbuilt ticket.
- **A5 S13 lands after S14** (co-pilot, assumed): the version bump stays last.

## 7. Out of scope

- Resolving a slice's rebase onto `feat/<slug>`, which stays the implementer's (`pilot-implementer.md:119`).
- Merging the feature PR to main, and pruning `feat/<slug>` after it, which stay the user's and the pilot's.
- Preemptive gate slots (L5).
- Cleaning other runs' leftover branches and worktrees (the `pilot-mac-linux-s*` trees), which is origin's
  backlog and a human step.
- Changing held-handoff's `holdFor`.

## 8. Slices

Width 6; longest stem 4

| # | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | A lander answers a conflicted press and the deck lands it (walking skeleton) | 1 | `agents/pilot-lander.md` (new), `agents/pilot.md` (step 9 spawn, Models, Agent list), `deck/items.mjs` (`AUTHOR_KINDS`), `deck/landing-replies.mjs`, `deck/server-tools.mjs` (`Land again` author), `deck/test/land-again.test.mjs`, `scripts/test/pilot-agents.test.mjs`, `scripts/test/landing-wording.test.mjs`, `scripts/test/lander-wording.test.mjs` (new), `scripts/test/measure-prompt.test.mjs` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | Land's conflict line names the lander, through one formatter the deck parses (fold) | 2 | `scripts/merge-generated.mjs`, `scripts/land.mjs`, `deck/store-items.mjs` (`conflictOf`), `scripts/test/land-conflict.test.mjs`, `deck/test/landing-conflict.test.mjs` | – | `pilot:typescript-reviewer` | [S2](slices/S2.md) |
| S3 | A sync conflict is kept for the lander and resumes | 2 | `scripts/sync.mjs`, `scripts/land.mjs` (sync-first line), `scripts/test/sync.test.mjs`, `scripts/test/sync-resume.test.mjs` (new) | S2 (`scripts/land.mjs`, `conflictLine`) | `pilot:typescript-reviewer` | [S3](slices/S3.md) |
| S4 | A default-branch conflict is kept for the lander and resumes | 2 | `scripts/integrate.mjs` (`takeDefault`), `scripts/test/integrate-default.test.mjs` | S2 (`conflictLine`) | `pilot:typescript-reviewer` | [S4](slices/S4.md) |
| S5 | A gate2 not clean on pilot is refused, and QA hands it to the lander | 2, 3 | `deck/gate2-base.mjs`, `deck/server-tools.mjs` (gate2 assert), `scripts/integrate.mjs` (`trialOnPilot`), `scripts/sync.mjs` (`push: false`), `agents/pilot-qa.md`, `agents/pilot-co-pilot.md`, `deck/test/gate2-base.test.mjs`, `scripts/test/integrate-trial.test.mjs` (new), `scripts/test/qa-preview.test.mjs` | S1 (`deck/server-tools.mjs`), S3 (`scripts/sync.mjs`), S4 (`scripts/integrate.mjs`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S5](slices/S5.md) |
| S6 | The vocabulary exempt list and the ADR index merge without a stop | 6 | `scripts/vocabulary.mjs`, `scripts/vocabulary-exempt.txt` (new), `.gitattributes`, `scripts/test/merge-generated.test.mjs` | – | `pilot:typescript-reviewer` | [S6](slices/S6.md) |
| S7 | One press lands: every refused landing goes to the lander | 4 | `deck/store-items.mjs` (`refuseLanding`), `deck/landing-replies.mjs` (`Land again` on any refusal), `deck/ui/render-parts.mjs`, `deck/test/landing-guard.test.mjs`, `deck/test/lander-one-press.test.mjs` (new) | S1 (`deck/landing-replies.mjs`), S2 (`deck/store-items.mjs`) | `pilot:typescript-reviewer` | [S7](slices/S7.md) |
| S8 | A lander past the cap queues, and the next session spawns it | 5 | `deck/landing-replies.mjs` (`landerDue`), `deck/run.mjs` (`firstPrompt`), `deck/store-items.mjs` (press line), `agents/pilot.md` (queue sentence), `deck/test/run.test.mjs`, `deck/test/lander-queue.test.mjs` (new), `scripts/test/measure-prompt.test.mjs` | S1 (`deck/landing-replies.mjs`, `agents/pilot.md`), S7 (`deck/store-items.mjs`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S8](slices/S8.md) |
| S9 | A landing leaves one merge with its record and no slice branches | 7 | `scripts/land.mjs` (`deleteRunBranches`, record commit), `scripts/test/land-prune.test.mjs`, `scripts/test/land-record.test.mjs` (new) | S3 (`scripts/land.mjs`) | `pilot:typescript-reviewer` | [S9](slices/S9.md) |
| S10 | The lander prunes, posts the closing report and hands back one line; the pilot's step 9 shrinks | 8 | `agents/pilot-lander.md`, `agents/pilot.md` (step 9, Ending a run), `scripts/test/lander-wording.test.mjs`, `scripts/test/landing-wording.test.mjs`, `scripts/test/measure-prompt.test.mjs` | S8 (`agents/pilot.md`, the pin), S1 (`agents/pilot-lander.md`, `deck/items.mjs`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S10](slices/S10.md) |
| S11 | The ADRs record the lander | 9 | `docs/adr/0154-gate2-frees-the-lane.md`, `docs/adr/0116-a-finished-feature-lands-on-pilot-before-its-gate-2.md`, landing-keeps-worktrees' ADR, `docs/adr/0161-the-lander-owns-every-merge.md` (new), `docs/adr/README.md` | – | `pilot:typescript-reviewer` | [S11](slices/S11.md) |
| S12 | The agent budget holds a lander beside the co-pilot | 10 | `deck/budget.mjs`, `deck/test/budget.test.mjs`, `rules/orchestration.md` | – | `pilot:typescript-reviewer` | [S12](slices/S12.md) |
| S13 (added) | The plugin version bumps by a patch | 11 | `package.json`, `package-lock.json`, `.claude-plugin/plugin.json` | S1–S12, S14, S15 (lands last, so no other run's bump collides) | `pilot:typescript-reviewer` | [S13](slices/S13.md) |
| S14 (added) | A run record keeps its own feature name, not the session’s | 12 | `deck/store-runs.mjs` (`upsertRecord`), `deck/test/record-feature.test.mjs` (new) | – | `pilot:typescript-reviewer` | [S14](slices/S14.md) |
| S15 (added) | The deck stops posting the closing report; the lander posts it from the record | 8b | `deck/closing-report.mjs` (`closeLanded`, `closingReportOf`), `deck/landing.mjs` (`closeOwed`), `deck/daemon.mjs`, the bodiless-report fill (`deck/store-items.mjs` or `deck/server-tools.mjs`), `deck/test/closing-report.test.mjs`, `deck/test/report-due.test.mjs`, `deck/test/landing-ready.test.mjs`, `deck/test/landing-queue.test.mjs` | S1 (`deck/items.mjs`) | `pilot:typescript-reviewer`, `pilot:silent-failure-hunter` | [S15](slices/S15.md) |
| S16 (added) | `pilot --version` prints the plugin version | 11 (evidence) | `bin/pilot.mjs`, `scripts/test/version-command.test.mjs` (new) | S13 | `pilot:typescript-reviewer` | [S16](slices/S16.md) |
| S17 (added) | A crew wait names its thread | 13 | `deck/wait.mjs` (`parseArgs`), `deck/test/wait-as.test.mjs`, `skills/wizard/SKILL.md` | – | `pilot:typescript-reviewer` | [S17](slices/S17.md) |

## 9. Acceptance evidence

In the order a user meets it:
1. QA's `pilot integrate --default` on a feature that conflicts with pilot prints the lander line, and a
   gate2 at that sha is refused naming the lander (spec 2, 3).
2. The lander resolves in the kept worktree, and QA posts the gate2 at a clean sha (spec 1, 3).
3. The user presses Sign off once. If pilot moved meanwhile, the gate2 thread shows the lander's `Resolving`
   and `Land again`, then `landed … at <sha>`, with no second Sign off on the page (spec 4).
4. With the pilot past its hand-off, the press line reads `queued`, and the fresh session spawns the lander
   (spec 5).
5. A landing where both sides changed the ADR index and the exempt list lands without a stop (spec 6).
6. `git log --first-parent origin/pilot` shows one merge for the feature, carrying `run.json`. `pilot branches
   prune --slug <slug> --dry-run` lists only `feat/<slug>` (spec 7).
7. The lander's closing report names the landing sha and the merge-first line, and the pilot's `Findings:` quotes the lander's hand-back line (spec 8).
8. `npm run adr-index` is clean (spec 9).
9. `pilot budget` on a fresh deck prints `budget main 5 yellow 8` with no warning (spec 10).
10. `pilot --version` prints `0.9.4` (spec 11, added).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | slice/lander-s1 | – | – | – | 1 |
| S2 | planned | slice/lander-s2 | – | – | – | 2 |
| S3 | planned | slice/lander-s3 | – | – | S2 | 2 |
| S4 | planned | slice/lander-s4 | – | – | S2 | 2 |
| S5 | planned | slice/lander-s5 | – | – | S1, S3, S4 | 2, 3 |
| S6 | planned | slice/lander-s6 | – | – | – | 6 |
| S7 | planned | slice/lander-s7 | – | – | S1, S2 | 4 |
| S8 | planned | slice/lander-s8 | – | – | S1, S7, held-handoff | 5 |
| S9 | planned | slice/lander-s9 | – | – | S3 | 7 |
| S10 | planned | slice/lander-s10 | – | – | S8, S1 | 8 |
| S11 | planned | slice/lander-s11 | – | – | – | 9 |
| S12 | planned | slice/lander-s12 | – | – | – | 10 |
| S13 | planned (added) | slice/lander-s13 | – | – | S1–S12 | 11 |
| S14 | planned (added) | slice/lander-s14 | – | – | – | 12 |
| lander | planned | feat/lander | – | – | S1–S14 | 1–12 |
