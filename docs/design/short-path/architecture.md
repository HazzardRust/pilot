# short-path: a small ticket takes the short path

Ticket `itm_3f18af072438` · slug `short-path` · base `origin/pilot` 54d11846 · ADR 0168 · depth: forks

## 1. Problem

A one-slice ticket pays grilling, Gate 1, co-pilot, implementer, reviewer, fundamentalist and evidence runner, QA,
walkthrough, Gate 2 and a landing: ten agents and two presses for about 100 lines. The user wants a systematic
change, not another rule: a ticket whose signed plan has 2 slices or fewer skips the co-pilot, the fundamentalist,
the evidence runner and QA; the pilot spawns the implementer itself, one reviewer per slice, and the one press is
the gate2.

## 2. Spec

| # | Behaviour | Evidence (bar) |
| --- | --- | --- |
| 1 | A ticket whose signed plan has 2 slices or fewer is **short path**: the pilot claims the implementing lane with `deck_ticket co-pilot`, spawns one implementer per slice itself, integrates each (step 5) and spawns no co-pilot, fundamentalist, evidence runner or QA. | `lanesFrom` for a 1- and a 2-slice head reads `… is short path — deck_ticket co-pilot it and spawn its implementer`; a 3-slice head keeps today's line (3 fixtures). Wording pin on pilot.md's `## Yellow` naming the short path and the four agents it skips. |
| 2 | Its gate2 is the pilot's, carrying one `Verdict:` line per slice and a `Gate:` line (the slice gate's pass and fail counts); the deck refuses a short-path gate2 missing either. A plan marked `surface` needs a `walkthrough`, which the pilot posts. *assumed (A2)* | Deck tests, 5 cases: accepted with no surface; refused with `surface: true` and no walkthrough; accepted with one; refused with fewer `Verdict:` lines than slices; refused with no `Gate:` line. A 2-slice gate1 without `surface` refused. |
| 3 | The press lands it as any other ticket, lander included. | The landing suites pass unchanged; one test: the pilot's gate2 on a 2-slice ticket turns it green, releases the lane, and its Sign off reads `landing started`. |
| 4 | The Tickets tab marks a signed ticket of 1 or 2 slices `short path`. | Render test over 4 fixtures: plan of 1 and 2 marked; plan of 3 and an unsigned ticket of 1 not. |
| 5 | The full suite still runs once, at the landing: it is the referee for the skipped QA pass. *practitioner: release engineer* | pilot.md and ADR 0168 name it; the landed ticket's PR comment carries exactly 1 full-suite line, from the landing (existing `pilot land`). |
| 6 | The path is fixed at Gate 1: a found-issue slice that takes the ticket to 3 keeps it short. *assumed (A3)* | Wording pin on `## Yellow`; S1 test: `isShortPath` reads `plan.sliceCount` only (L2), so a ticket with `sliceCount: 5` and a plan of 2 is short. |
| 7 | The plugin version bumps by a patch, `0.9.4` → `0.9.5`, as the feature's last slice. *added: the user's word on the Gate 1 thread, "throw in a version bump, small one"* | `pilot --version` prints `0.9.5`; the slice diff is the three version files and the two tests that pin it (`deck/test/status-command.test.mjs`, `deck/test/store-upgrade.test.mjs`), nothing else. |

Practitioner lines: an SRE counting toil would measure agents per ticket. The raw material is the session's own spawn
list. Acceptance §9 item 4 counts it on the first real short-path ticket: 0 co-pilot, fundamentalist, evidence-runner
and QA spawns.

## 3. Findings

- The deck already allows the short path. `deck_ticket co-pilot` only records a lane claim and spawns nothing
  (`deck/store-runs.mjs:381`). The pilot may post a gate2 (`deck/store-items.mjs:79`) on a yellow, non-live ticket
  (`:205`). `walkthrough` is optional (`deck/items.mjs:234`). The post turns the ticket green and releases the claim (`store-items.mjs:161-165`).
- Gate 1 sign-off stores `ticket.plan = planOf(gate1)` with `sliceCount` (`store-items.mjs:587`, `:630`). The tab
  renders it (`deck/ui/render-rail.mjs:92-104`, `:143`).
- `lanesFrom` writes the refusal `yellow lane empty; <id> is planned — deck_ticket co-pilot it first`
  (`deck/lanes.mjs:89`). `pilot wait` and the stop hook print it.
- Only prose spawns a co-pilot: `agents/pilot.md:141-146`. The steps a co-pilot runs (4-8) are pilot.md's own. Step 5
  (integrate) already names the pilot. Trivial work (`pilot.md:191`) is the no-architect path. This path sits between it and the full run.
- `withTicket` gives a gate1 `sliceCount: 3` (`deck/testUtils.mjs:144`). Only `deck/test/blocking.test.mjs:64` and
  `deck/test/merge-gate.test.mjs:21` post a gate1 of 1 slice.
- Wording pins read a pilot.md section by heading (`scripts/test/landing-wording.test.mjs:16`).
- Standing designs. stage-queue-tail S1 and S2 edit `deck/store-items.mjs`, and S3 here rebases on them. one-integration-line S9 owns
  `agents/pilot.md`, and S4 here rebases on it if it lands first; otherwise it rebases on this. suite-at-landing owns no file here. It is
  the landing suite spec 5 leans on.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `deck/items.mjs` short path | `isShortPath(ticket) -> boolean`, `SHORT_PATH_MAX = 2` | the threshold three callers would each restate (lanes, gate2 post, tab) | in-process |
| `deck/lanes.mjs` | `lanesFrom(items, repo, opts)` (existing) | the short-path wording of `refusal` and `coPilot` | in-process |
| `deck/store-items.mjs` post | `postItem({ kind: 'gate1' \| 'gate2', … })` (existing) | `surface` on the plan; the short-path gate2 refusals | local-substitutable (scratch store dir) |
| `deck/ui/render-rail.mjs` | `renderTicketRow(item, …)` (existing) | the `short path` mark | in-process |
| `agents/pilot.md` | its `## Yellow` and `### 9. Gate 2 and ready` sections, read by wording pins | the short path's steps | prose pin |

Deletion test: without `isShortPath` the `<= 2` comes back in three callers, so it stays. Every other module is an
existing seam. No fold slice.

## 4. Ubiquitous language

- **Short path**: a ticket whose signed plan has `sliceCount <= 2`. Derived, never stored.
- **Long path**: every other implementing ticket, built by a co-pilot as today.
- **Surface**: something a user looks at (a deck screen, a rendered page). It is marked on the gate1 as `surface`.
- **Implementing lane**: the deck's one yellow claim per repository (`deck_ticket co-pilot`). Its holder is a co-pilot or, on the short path, the pilot.

## 5. Locked decisions

- **L1 Depth: forks** (itm_3c7d4ec08362, the user). Only questions whose paths fork go up: A1 and A2. *Rejected*: a full grilling round over every branch.
- **L2 Derived, not stored.** `isShortPath` reads `ticket.plan.sliceCount`. *Rejected*: a stored `path` field, which could disagree with the plan (ADR 0151's reason).
- **L3 The deck changes only its wording and the gate2's evidence.** It spawns nothing, so "never offered to a co-pilot" is the lane's line plus prose. *Rejected*: refusing `deck_ticket co-pilot` on a short ticket, which would leave the pilot no lane claim and break yield and pause.
- **L4 The gate2 carries its evidence in the body.** One `Verdict:` per slice and a `Gate:` line, checked by the deck for short-path tickets only. *Rejected*: prose only (nothing checks it), or new gate2 fields (the PR body already carries verdicts).
- **L5 Budget.** The short-path implementer and its children count against the `yellow` half, since they hold the yellow lane. *Rejected*: the main half, which would starve planning.
- **L6 ADR 0168, numbered.** This ticket goes to the head of yellow and may land before one-integration-line's placeholder rule exists. A collision is renumbered by the pilot at the base merge.
- **L7 Fix round.** Each slice's reviewer findings are fixed inside its own slice loop, as today. No feature-level fix round.

## 6. Assumed decisions

- **A1 One implementing lane** (itm_553ac7e99734). Default: a short ticket claims the one lane, so it waits behind a long ticket and a long one waits behind it. *Trade*: no store change, and yield and pause work unchanged. *Rejected*: a second lane beside the co-pilot (a new claim record, a lanes and rail change, and two tickets building at once).
    Verdict: stands — the user took the default (itm_553ac7e99734)
- **A2 Surface: the pilot walks it** (itm_9c4fabb9cb94). Default: gate1 gains `surface` (boolean), required when `sliceCount <= 2`. The pilot posts the walkthrough from the implementer's live check, and the deck refuses that gate2 without one. *Trade*: one more Gate 1 field, and a thinner walkthrough than QA's. *Rejected*: a surface takes the long path (most deck-UI tickets lose the saving); prose only (a forgotten walkthrough is never caught).
    Verdict: stands — the user took the default (itm_9c4fabb9cb94)
- **A3 Fixed at Gate 1.** Default: an added slice never switches path. *Trade*: a short ticket that grows to 3 skips the fundamentalist. *Rejected*: re-evaluating at each added slice, which would spawn the long-path crew mid-run.
    Verdict: stands — the plan signed at Gate 1 is the plan run; an added slice stays within step 7's rails and never re-routes a ticket mid-run.
- red team: S3's conditional `surface` breaks the two 1-slice gate1 fixtures (Findings), so S3 owns both files. S2 and S3 both import `isShortPath` and own disjoint files. S4's pins quote S2's line and S3's refusal text, so S4 comes after both.

## 7. Out of scope

A second implementing lane (A1's rejected path). Changing the co-pilot's, QA's or the architect's definitions. Any change to trivial work. The Linux referee (the user's temporary rule, unchanged). Moving this ticket to the head of yellow at Gate 1, which is the pilot's `deck_ticket up`.

## 8. Slices

Width 2; longest stem 4

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | The Tickets tab marks a short-path ticket | 4 | `deck/items.mjs`, `deck/ui/render-rail.mjs`, `deck/ui/deck.css`, `deck/test/short-path.test.mjs` (new) | – | `pilot:typescript-reviewer` | [S1](slices/S1.md) |
| S2 | The lane's line tells the pilot to build a short ticket itself | 1 | `deck/lanes.mjs`, `deck/test/short-path-lanes.test.mjs` (new) | S1 (`isShortPath`) | `pilot:typescript-reviewer` | [S2](slices/S2.md) |
| S3 | A short-path gate2 carries its verdicts, gate and walkthrough | 2, 3 | `deck/items.mjs`, `deck/tools.mjs`, `deck/store-items.mjs`, `deck/test/short-path-gate2.test.mjs` (new), `deck/test/blocking.test.mjs`, `deck/test/merge-gate.test.mjs` | S1 (`deck/items.mjs`, `isShortPath`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S3](slices/S3.md) |
| S4 | The pilot runs the short path | 1, 2, 5, 6 | `agents/pilot.md`, `docs/OPERATING.md`, `docs/adr/0168-a-small-ticket-takes-the-short-path.md` (new), `docs/adr/README.md`, `scripts/test/short-path-wording.test.mjs` (new) | S2 (the lane line), S3 (the refusal text) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S4](slices/S4.md) |
| S5 | The plugin version bumps by a patch (added) | 7 | `package.json`, `package-lock.json`, `.claude-plugin/plugin.json`, `deck/test/status-command.test.mjs`, `deck/test/store-upgrade.test.mjs` | S4 (lands last) | `pilot:typescript-reviewer` | [S5](slices/S5.md) |

S1 is the walking skeleton. It adds the predicate and makes it visible on the tab. S2 and S3 run side by side.
S4's prose names what they built. S5 is the patch bump, last, one generated edit.

## 9. Acceptance evidence

1. On a scratch deck (`pilot deck --scratch`), a signed 2-slice ticket shows `short path` on the Tickets tab, and a 3-slice one does not.
2. `pilot wait` on that deck prints `… is short path — deck_ticket co-pilot it and spawn its implementer`.
3. A pilot gate2 with no `Verdict:` lines is refused, naming the lines it lacks. With them it posts, and Sign off reads `landing started`.
4. On the first real short-path ticket, the session spawns no co-pilot, fundamentalist, evidence runner or QA, and the user presses once.
5. The landed PR's comment carries the landing's full-suite line.
6. `pilot --version` on the landed tip prints `0.9.5`.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | – | – | – | – | 4 |
| S2 | planned | – | – | – | S1 | 1 |
| S3 | planned | – | – | – | S1 | 2, 3 |
| S4 | planned | – | – | – | S2, S3 | 1, 2, 5, 6 |
| S5 | planned | – | – | – | S4 | 7 |
| short-path | planned | feat/short-path | – | – | S1, S2, S3, S4, S5 | 1-7 |
