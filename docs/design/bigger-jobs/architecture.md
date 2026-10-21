# Bigger jobs: a found issue is built in the run, with no question and no hard slice cap

Ticket itm_7397c7bb01d2 (merges itm_b3a3903fd2b6, itm_3f772cc973a3) · slug `bigger-jobs` · base `pilot` 64906d40 · branch `design/bigger-jobs`

## 1. Problem

The crew treats a bigger job as a cost to avoid. A recommended default often defers a fix
found during a run to a future ticket ("an invisible incentive to get the ticket in hand
finished first"), and the user sees no benefit in that: "pushing it into tech debt is a
slower moving machine". The user wants an agent that spots an issue to add it to the ticket
and build it without asking, removing it afterwards if they don't want it. They also want
bigger tickets, with 20 slices an aim rather than a limit; ticket-making and the audit's picks
merging the jobs on one surface into fewer, larger tickets; implementers allowed more
children; the in-flight ceiling moved from 8 to 12; and a question whose default rests on
outside practice refused until it has been researched. Two merged tickets ride along. The
auditor's suggestions get an adversarial fundamentalist pass before the user picks from
them. The installed pilot gets a one-command version bump, and its first turn reads the
deck brief.

## 2. Spec

| # | Behaviour | Evidence |
|---|---|---|
| 1 | A found issue is built in the run: grilling, the pilot, the architect, QA and the co-pilot say no recommended default defers work found during a run to a later ticket. The architect's Scope discipline, its "bigger fold goes to main as a candidate ticket" and its "cut the first coherent part" are rewritten. | Wording pins on the five files; itm_113930f2ed32's question re-run on a scratch deck recommends the sweep in the run |
| 2 | A found issue enters the live ticket as an added spec line and slice, with no question to the user. The added-slice rails lose "at most 2 a run, never past 14 slices" and "traces to an agreed spec line". "Moves no locked decision" stays, and is the one rail that still makes a question. The status table says added and Gate 2 names it. | Pins on the pilot and architect; a scratch run whose architect report shows a found issue added as a slice and no question posted for it |
| 3 | 20 slices is an aim, not a refusal: past 20, the architect cuts one run unless the user asks for a split. Ticket-making's estimate aims at 20. | Pins; check-slices passes a 25-slice directory; the deck takes a ticket of `sliceCount` 30 |
| 4 | Every prompt pin moves by exactly its measured cost, named in the PR | The pin diff shows the new numbers, each with a history comment, and nothing else |
| 5 | Ticket-making aims a ticket well above 15, says why small tickets cost more (each costs a grilling, a Gate 1, a QA pass and a Gate 2), merges same-surface jobs, and re-cuts one- or two-slice rows before it proposes | A pin on the skill; its worked example shows a merged cut |
| 6 | The audit posts one ticket per surface: `pilot audit spec <report> <id> [<id>…]` prints several rows as one ticket body, and the auditor groups the picks by surface | A CLI test: two ids give one body the deck accepts; pins on the audit skill and the auditor; a scratch audit with ten picks across two surfaces posts two tickets |
| 7 | An implementer holds five children at once, and every file that names the count says five | Pins on `agents/pilot-implementer.md`, `rules/orchestration.md` and `agents/pilot-co-pilot.md` |
| 8 | The deck refuses a question from the pilot, the architect or QA that carries `recommended` but whose body has no `Research:` line. A default that skips research says `Research: none, <reason>`, the reason one of grilling's skip list, and the refusal names the rule. | A deck test refuses the unresearched post; itm_49d87121223d re-run on a scratch deck goes up with a `Research:` line in 3 of 3 runs |
| 9 | The ceiling moves from 8 to 12: `CEILING` 12, default split main 4 / yellow 8. The architect's children go from 4 to 6 and QA's from 2 to 3. `rules/orchestration.md` records the move from 8 and why. | `pilot budget` on a fresh deck prints `budget main 4 yellow 8`; pins on orchestration, the architect, QA and the co-pilot |
| 10 | Before it posts the audit item, the auditor spawns `pilot-fundamentalist` on its report, and the fundamentalist joins its child list | Pins on `agents/pilot-auditor.md` and `skills/audit/SKILL.md`; a scratch audit's transcript shows the spawn before the post |
| 11 | The fundamentalist's audit brief has one shape: it argues each row down, removal first, and returns a verdict per row (keep, cut as unnecessary, cut as overengineering) with a reason | A pin on the brief; the scratch audit's report carries one verdict per row |
| 12 | The audit item lists the kept rows to pick from, then the cut rows with their reasons. A cut row can still be picked (*assumed*, A4). | A `renderReport` test; the scratch audit item's body |
| 13 | `npm run bump <version>` writes package.json, package-lock.json, .claude-plugin/plugin.json and deck/client.mjs, and a test pins that the four agree | The test; one bump on a temp copy |
| 14 | The pilot's first-turn read asks `open: true, brief: true` and reads by `id` each thread it takes; grilling reads an answer by `id` | Pins on `agents/pilot.md`'s first-turn paragraph and `skills/grilling/SKILL.md` |

Dropped as already met: F1's "version past 0.8.1" (0.8.2 is installed, and its
`deck/tools.mjs` carries `brief`) and "GET /api/items?open=1&brief=1 answers" (200 on 4321).

## 3. Findings

- **The deferral is written down.** `agents/pilot-architect.md:92` sends a fold over 200
  lines to `main` "as a candidate ticket". `:171-173` bars "while we are here" and says to
  "cut the first coherent part" of a big request. `:150-153` groups more than 20 slices into
  runs and lets a run reach 22 only by slices added mid-run. `agents/pilot.md:445-450`
  caps added slices at "at most 2 a run, never past 14 slices". `agents/pilot-qa.md:145`
  already names each added slice at Gate 2.
- **Nothing in code caps slices.** `scripts/check-slices.mjs` and `deck/ticket-shape.mjs`
  carry no count. `deck/items.mjs:216,255` only requires `sliceCount`, and the test helper
  `deck/testUtils.mjs:125` posts 60. The bound is prose: `skills/ticket-making/SKILL.md:64-67,89`
  and the architect's item 8.
- **The budget is one module.** `deck/budget.mjs:14-15` holds `DEFAULT_BUDGET {3,5}` and
  `CEILING 8`. The store applies the default only where none is stored
  (`deck/store-runs.mjs:340-343`), so a split the user stored is kept. The help line is at
  `bin/pilot.mjs:104-106`. The pins are `deck/test/budget.test.mjs:40,129` and
  `scripts/test/cli-wiring.test.mjs:75`.
- **Children counts in prose:** `rules/orchestration.md:61` ("Up to eight") and `:72-73`
  (architect four, implementer three, QA two); `agents/pilot-implementer.md:87` ("At most
  three"); `agents/pilot-qa.md:192` ("at most two"); `agents/pilot-architect.md:57` ("up to
  four"). `scripts/shipped-rules.json` holds the hash of every shipped `orchestration.md`, so
  a new one needs its hash appended (`scripts/build-rules-ledger.mjs`).
- **The question path.** `deck/store-items.mjs:81-89` refuses on shape before it reads the
  store: the body length of a question, and `ticketShapeGaps` for a ticket (`deck/ticket-shape.mjs`,
  pure). The walkthrough check is scoped by author with `authorKind(author)` (`:99`). This is
  the pattern spec 8 follows. 29 test files post with `recommended`, and only those
  authored as pilot, architect or QA are affected.
- **The research rule** is ADR 0119, in grilling's *Finding facts* paragraph
  (`skills/grilling/SKILL.md:35`). Its line 29 says `deck_read` "returns every item".
- **The audit.** `deck/audit.mjs:346` `specFor(reportJson, id)` takes one id. `renderReport`
  (`:175`) renders every row. Step 7 of `agents/pilot-auditor.md` posts one ticket per id, with
  `sliceCount` from effort (S 1, M 3, L 8). The auditor spawns only `pilot-explorer`
  (`:150`), and `scripts/test/audit-agent.test.mjs:66` pins "at most two at once".
- **Prompt pins, measured on 64906d40:** the pilot's own share is at its pin of 10219.5, and
  QA's at its pin of 4583.5, so neither has headroom. The always-loaded rules are 3382 of
  3500. The architect, co-pilot, implementer and auditor have no own-share pin.
- **Pins this feature rewrites:** `scripts/test/pilot-agents.test.mjs:1396` (the rail),
  `run-split.test.mjs:30-31`, `deepening.test.mjs:63`, `ticket-making.test.mjs:72-78`, and
  `audit-agent.test.mjs:66`.
- **Overlap.** idle-main-lane (yellow) owns `deck/server-tools.mjs`, `deck/server-routes.mjs`,
  `deck/lanes.mjs`, `deck/wait.mjs` and the hooks. No slice here owns any of them; S1 changes
  `deck/store-items.mjs`, which is upstream of `server-tools`, not the same file.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| Question shape | `questionShapeGaps(body, { recommended, author }) -> string[]` in `deck/question-shape.mjs` (new) | the research-line rule, out of `store-items` the way `ticketShapeGaps` is | in-process |
| Agent budget | `checkBudget({ main, yellow })`, `DEFAULT_BUDGET`, `CEILING` in `deck/budget.mjs` | unchanged shape; numbers move | in-process |
| Audit report | `specFor(reportJson, ids)`, `renderReport(report)`, `validateReport(report)` in `deck/audit.mjs` | several rows' specs as one body; a row's `verdict` | in-process |
| Version bump | `bump(version, { root }) -> string[]` in `scripts/bump.mjs` (new) | the four hand edits of 79e26684 | local-substitutable |
| Prompt budget | `measure({ root, home })` in `scripts/measure-prompt.mjs` | unchanged; the pins read it | local-substitutable |
| Crew prose | the headings each slice names (pilot.md §3, §7, first turn; architect items 8 and Scope discipline; ticket-making Estimates) | the build-now rule, stated once in grilling and named by the agents | in-process |

Deletion test: `specFor` single-id would reappear as a loop in the auditor's prose, so it is
widened and not wrapped. `question-shape.mjs` passes the test the way `ticket-shape.mjs` does:
deleting it puts the rule inline in `postItem`. No fold changes code beyond these seams.

## 4. Ubiquitous language

- **Found issue**: a defect, flake, weakness or seam an agent finds during a run, beside or
  under the work in hand. Not a wish to tidy code the run did not touch.
- **Added slice**: a slice the run adds for a found issue, with an added spec line, no
  question, marked `added` in the status table, and named at Gate 2.
- **The aim**: 20 slices a run, a target the architect and ticket-making cut towards, never a refusal.
- **Ceiling**: 12 agents in flight, the main session and every child counted.
- **Research line**: the question body's one `Research:` line, either researched or
  `Research: none, <skip reason>`.
- **Verdict**: the fundamentalist's call on one audit row: keep, cut as unnecessary, or cut
  as overengineering, with its reason.

## 5. Locked decisions

- **L1** No grilling (user, itm_c14b689ad1fa): the spec goes to the user, and every fork is
  assumed here. *Rejected*: forks as questions.
- **L10** The spec in §2 is agreed as is (user, itm_1fde7e306178), spec 12's pickable cut rows aside, which stay A4.
- **L2** itm_b3a3903fd2b6 and itm_3f772cc973a3 merge in (user, itm_9f640733d2e8, "Merge these").
- **L3** Of the added-slice rails, only "moves no locked decision" survives as a question
  trigger. Each added slice still gets its own PR and reviewer and stays within the per-slice
  diff limit. *Rejected*: higher caps (say 4 a run): a cap is the incentive the user named.
- **L4** Build-now is stated once, in grilling's *Finding facts* neighbourhood, and each
  agent names it in a clause (ADR 0119's one-rule pattern). *Rejected*: five copies and five pins.
- **L5** A pin rises by its measured cost and nothing else, with a history comment (0119 L5).
  *Rejected*: trimming other prose to stay under a pin.
- **L6** `added` lives in the artefact's status table and the Gate 2 walkthrough, as pilot.md
  already says. No new `deck_status` state. *Rejected*: a deck state, which would be a new
  enum and a new UI for one word.
- **L7** The fundamentalist's audit brief lives in `agents/pilot-auditor.md`, and its verdicts
  in the report JSON as `verdict: { call, reason }` per row. *Rejected*: a section in
  `pilot-fundamentalist.md`, a second home for a brief only the auditor writes.
- **L8** The bump is `scripts/bump.mjs` behind `npm run bump`, the way `adr-index` runs.
  *Rejected*: `npm version`, which leaves `plugin.json` and `deck/client.mjs` alone.
- **L9** F1's spec 2 and 3 are dropped as met (§2). *Rejected*: carrying lines no slice can make red.

## 6. Assumed decisions

- **A1** Spec 8 is a deck refusal on the body's `Research:` line, not a prose rule that the
  pilot spawns the explorer first. Only the deck can't be skipped; the cost is one visible line
  on every recommended question, `Research: none, scope call` included.
- **A2** The 12 split is main 4 / yellow 8. Main fits the pilot, an architect and two
  researchers; yellow fits the co-pilot, an implementer and five children, plus one. The architect
  goes to 6 and QA to 3, ×1.5 like the ceiling. The cost: two implementers with full child sets
  don't fit yellow at once.
- **A3** The auditor groups picks by surface by judgement, with no `surface` field on report
  rows. That costs nothing in schema, but the grouping isn't checked.
- **A4** A cut row stays pickable: the user can override the fundamentalist, at the cost of
  a list that is shorter only in its order.
- **A5** A split the user has already stored is kept; only the default moves. A user on 3/5
  stays there until they run `pilot budget`.
- **A6** QA runs on a scratch deck (`pilot deck --scratch` on a scratch repository,
  `claude --plugin-dir <worktree>`), as in idle-main-lane L9.
- **A7** The refusal applies to authors pilot, architect and QA (ADR 0119's owners). The
  auditor, teacher and user aren't checked.
- **A8** The implementer gets exactly five, the least the user asked for.

## 7. Out of scope

- A `surface` field or grouping code on audit rows (A3).
- The auditor's own child cap beyond adding the fundamentalist; the teacher; the explorer.
- `deck/tools.mjs` schema text: the refusal message teaches the line.
- Any idle-main-lane file (§3 Overlap).
- A deck UI for added slices or runs.

## 8. Slices

Width 7; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | The deck refuses an unresearched question, and grilling builds found work now | 8, 1, 14 | `deck/question-shape.mjs` (new), `deck/store-items.mjs`, `deck/test/question-shape.test.mjs` (new), `skills/grilling/SKILL.md`, `vendor/methodology.md`, deck test fixtures that post a refused question | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | The pilot adds a found issue as a slice without asking, and reads the brief first | 1, 2, 14, 4 | `agents/pilot.md`, `scripts/test/measure-prompt.test.mjs`, `scripts/test/pilot-agents.test.mjs`, `scripts/test/bigger-jobs-pilot.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |
| S3 | The architect builds found issues in the run and cuts past 20 into one run | 1, 2, 3, 9 | `agents/pilot-architect.md`, `scripts/test/run-split.test.mjs`, `scripts/test/deepening.test.mjs`, `scripts/test/bigger-jobs-architect.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S3](slices/S3.md) |
| S4 | Twelve agents in flight, five children an implementer | 9, 7, 1, 4 | `deck/budget.mjs`, `bin/pilot.mjs`, `deck/test/budget.test.mjs`, `scripts/test/cli-wiring.test.mjs`, `rules/orchestration.md`, `scripts/shipped-rules.json`, `agents/pilot-implementer.md`, `agents/pilot-co-pilot.md`, `agents/pilot-qa.md`, `scripts/test/qa-preview.test.mjs`, `scripts/test/bigger-jobs-ceiling.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S4](slices/S4.md) |
| S5 | Ticket-making aims big and re-cuts small tickets | 3, 5 | `skills/ticket-making/SKILL.md`, `scripts/test/ticket-making.test.mjs` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S5](slices/S5.md) |
| S6 | An audit posts one ticket per surface | 6 | `deck/audit.mjs`, `deck/test/audit-pick.test.mjs`, `skills/audit/SKILL.md`, `agents/pilot-auditor.md` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S6](slices/S6.md) |
| S7 | The auditor's rows are argued down before the pick | 10, 11, 12 | `deck/audit.mjs`, `deck/test/audit-body.test.mjs`, `skills/audit/SKILL.md`, `agents/pilot-auditor.md`, `scripts/test/audit-agent.test.mjs` | S6 (`deck/audit.mjs`, `agents/pilot-auditor.md`, `skills/audit/SKILL.md`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S7](slices/S7.md) |
| S8 | One command bumps the version everywhere | 13 | `scripts/bump.mjs` (new), `package.json`, `scripts/test/bump.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S8](slices/S8.md) |

Walking skeleton: S1, the one mechanism a user watches refuse something; the rest are
independent stems. S1's fixture edits stop at files the other slices own. A fixture in one of
them goes to `main` instead.

## 9. Acceptance evidence

In the order a user meets it, on a scratch deck (A6):

1. `pilot budget` prints `budget main 4 yellow 8`, and `pilot help` says "warns above 12" (spec 9).
2. The pilot's first turn reads the brief, then threads by id (14).
3. itm_49d87121223d's question goes up with a `Research:` line 3 of 3, and a hand-posted
   question with `recommended` and no line is refused, naming the rule (8).
4. itm_113930f2ed32's question recommends the sweep in the run (1).
5. A scratch run's architect report shows a found issue as an added slice, with no question
   (2); its artefact cuts 25 slices as one run (3).
6. A ticket-making proposal of six one-slice jobs on one surface comes back as one row (5).
7. A scratch audit posts the item with kept rows, then cut rows with their reasons, after a
   fundamentalist spawn (10-12). Ten picks across two surfaces post two tickets (6).
8. `npm run bump 0.8.3` on a temp copy changes the four files, and the agreement test is green (13).
9. The PR names every pin's move with its measured cost (4); every crew file says five and 12 (7, 9).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | – | – | – | – | 8, 1, 14 |
| S2 | planned | – | – | – | – | 1, 2, 14, 4 |
| S3 | planned | – | – | – | – | 1, 2, 3, 9 |
| S4 | planned | – | – | – | – | 9, 7, 1, 4 |
| S5 | planned | – | – | – | – | 3, 5 |
| S6 | planned | – | – | – | – | 6 |
| S7 | planned | – | – | – | S6 | 10, 11, 12 |
| S8 | planned | – | – | – | – | 13 |
| bigger-jobs | planned | `feat/bigger-jobs` | – | – | S1-S8 | 1-14 |
