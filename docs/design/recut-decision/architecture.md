# recut-decision: a re-cut is the pilot's or co-pilot's decision

Ticket `itm_5807aa39f833` · base `pilot` 35868866 · branch `design/recut-decision` · express run, no grilling (L1).

## 1. Problem

A landing that touches a file a signed plan owns turns that ticket red and asks the user for a new Gate 1. The user is
away while tickets implement, so nothing completes. The user's words: "the re-cut thing is triggering and nothing will
get completed whilst i am gone. we need to make some express changes to turn it off so the tickets stay yellow", "like
right away". Re-cuts are decisions for the pilot (planning) or the co-pilot (implementing); only a re-cut that changes
what the user signed comes back to them.

## 2. Spec

| # | Behaviour | Evidence | Bar |
| --- | --- | --- | --- |
| 1 | After a landing touches a file a signed plan owns, the pilot or co-pilot puts the plan on the new pilot by a merge, and `deck_ticket replan` moves the yellow ticket's plan to the merge commit with no press. | `deck/test/replan.test.mjs`: a yellow signed ticket replanned at a merge sha | state `yellow`, `plan.sha` the new sha, 0 gate1 items |
| 2 | Every drift and every replan is recorded on the ticket thread: what changed, why, by whom. | test reads the ticket's deck lines | 1 line per drift naming the landing sha7, the files and the slices owning them; 1 line per replan naming the sha7 and the author kind |
| 3 | A re-cut that moves a spec line, a locked decision or the slice graph still comes to the user as a Gate 1; a change confined to slice files or the brief does not. *assumed* A1 | replan test each way | a §3 or slice-file reword: replanned, named on the line; a changed §2, §5 or §8 of `architecture.md`: refused naming the section and the gate1 path |
| 4 | Putting a pushed plan on current pilot asks no force-push question. | prose pins on the three agent files; the gate1 lineage refusal text | the Rune case (itm_43233104ddcc) replayed by the prose: merge, 0 questions; refusal text names `git merge`, not only `rebase` |
| 5 | A landing never turns a signed ticket red on its own, and neither does a first grant; the drift is noted and the ticket stays yellow. | `deck/test/landing-recut.test.mjs`, `deck/test/plan-drift.test.mjs` | the 2026-11-19 case (landings ffeb730, 3586886 over itm_7d3455d28cd6, itm_0dcd9aa67146) replayed in a scratch store: both yellow, 0 items posted, 0 `recutTicket` calls |

practitioner: release engineer — a moved base is a merge-and-retest, never a re-approval, unless the contract moved (spec 3).

## 3. Findings

| What | Where |
| --- | --- |
| Post-landing sweep: each never-granted yellow ticket with drift goes red via `recutTicket`, one gate2 line `Re-cut by this landing` | `deck/landing.mjs:401-442`, call at `:244` |
| First-grant check: drift re-cuts in the `co-pilot` call, answer `Re-cut check due` | `deck/server-tools.mjs:460-473` |
| `planDrift` returns `moved` with files only, no slice names; `ownedAt` reads slice files one by one | `deck/recut.mjs:57-69, 119-155` |
| `deck_ticket replan` accepts only a red ticket carrying `recut.from`; diffs the whole design dir; any change refused | `deck/server-tools.mjs:223-245`, `deck/store-tickets.mjs:474-488` |
| `replanTicket` deletes `plan.grantedAt` (right for a re-cut, wrong for a granted yellow plan) | `deck/store-tickets.mjs:483` |
| Who moves tickets: pilot; architect only for `merge`, `replan`; co-pilot holds no `deck_ticket` | `deck/server-tools.mjs:444-447`; co-pilot tool list |
| Gate1 lineage already accepts a merge of pilot on the branch; its refusal text says only `rebase` | `scripts/pilot-branch.mjs:209-235`, `deck/lineage.mjs:42-47` |
| Prose naming the flow, pinned | `agents/pilot.md:165`, `agents/pilot-architect.md` §Re-cut, `scripts/test/recut-prose.test.mjs:28-41` |
| Prior design: never-stuck L2-L5, L7, L10 | `docs/adr/0187-never-stuck.md` |
| The Rune force-push question: architect rebased a pushed design branch, so the push was not a fast-forward | deck item itm_43233104ddcc |

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `recut.mjs` drift | `planDrift(repoDir, plan)`, `driftLine(drift, why)` | the two drift sentences the sweep and the grant each built by hand | local-substitutable (git in a temp repo) |
| landing sweep | `driftAfterLanding(gate2Id, deps)` | – | in-process |
| replan | `replanTicket(id, sha)`, `deck_ticket replan`, `numberedSections(text)` | red re-cut replan and yellow move behind one call; the §2/§5/§8 read | in-process + local-substitutable |
| gate1 lineage | `assertOnPilotTip(repo, branch)` | – | local-substitutable |

Deletion test: `recutTicket` survives (the pilot's `recut` action, spec 3's gate1 path); `neverGranted` survives (the
sweep's filter and the grant stamp). Nothing else is deleted; one fold, `driftLine`, inside S1 under the cap.

## 4. Ubiquitous language

- **Drift**: a landing changed a file a signed plan owns, or the plan's sha left its branch. A fact, not a state.
- **Replan**: the plan's sha moves to a new commit with its signature kept; the ticket stays or returns yellow.
- **Re-cut**: the plan changes what the user signed (spec, locked decision, slice graph); it goes red and takes a gate1.
- **Put on pilot**: `git merge <remote>/pilot` into the plan's pushed branch; never a rebase.

## 5. Locked decisions

- **L1** No grilling: the user pressed "No grilling" on itm_61eea62b1c06; every open decision is assumed below.
- **L2** The deck never re-cuts on its own: the sweep and the first grant call `driftLine` and `noteDeck`, never
  `recutTicket`. Rationale: the user's words. Rejected: an env switch turning the sweep off (leaves no record, spec 2).
- **L3** Put on pilot is a merge. Rationale: a pushed branch rewritten needs a force-push, which is the user's (spec 4);
  `pilotLineage` already accepts a merge. Rejected: rebase-then-force-with-lease (the Rune question).
- **L4** One `deck_ticket replan` for both cases: red with a re-cut mark (as today) and open yellow signed (new),
  the yellow case keeping `grantedAt`. Rejected: a new action (more interface for the same diff check).
- **L5** The run's ADR is `docs/adr/NNNN-recut-decision.md`, amending ADR 0187's L2, L5, L7; the landing numbers it.

## 6. Assumed decisions

- **A1** Replan passes when `architecture.md` is byte-unchanged between the two shas; any other change under
  `docs/design/<slug>/` (slice files, brief) passes and is named on the line. Default leans on L8 (everything Gate 1
  needs is in `architecture.md`). Trades away: a wording-only edit to `architecture.md` still takes a gate1.
  Rejected: the deck parsing §2/§5/§8 out of the artefact (fragile), and trusting a free-text why (no floor).
  Verdict: overturned: the user's spec line 3 says a wording-only change passes unasked, and the anchor fixes a landing forces live in architecture.md §3, so byte-equality sends the common case to a Gate 1; replan passes when §2 spec, §5 locked decisions and §8 slices are unchanged, any other edit passes and is named on the ticket line
- **A2** Tickets already red from the old sweep are not migrated; the pilot replans each by hand once S2 lands.
  Trades away: one manual step per such ticket. Rejected: a store migration (irreversible, tiny population).
  Verdict: stands — no ticket is red from the old sweep now; both were replanned by hand today
- **A3** The co-pilot gets no `deck_ticket`; it merges pilot into `feat/<slug>`, pushes, and reports the sha; the
  pilot replans. Trades away: one relay. Rejected: widening the co-pilot's tool list (agent configuration).
  Verdict: stands — the co-pilot's tool list has no deck_ticket, and it still makes the call; the pilot only records it
- **A4** QA runs the deck tests on a scratch store and replays spec 5's case there; no live deck walkthrough beyond
  one `pilot tickets` read. Trades away: the user's own look at a live landing. Rejected: landing a real PR to test.
  Verdict: stands — the plan has no surface a user looks at

## 7. Out of scope

Any change to `planDrift`'s git hardening; the gate2 or landing flow; the co-pilot's tool list; drift checks after the
first grant; renaming `recut` in the store.

## 8. Slices

Width 2; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | A landing over an owned file leaves the ticket yellow with one drift line | 2, 5 | `deck/recut.mjs`, `deck/landing.mjs`, `deck/server-tools.mjs`, `deck/test/landing-recut.test.mjs`, `deck/test/plan-drift.test.mjs` | – | typescript | [S1](slices/S1.md) |
| S2 | A yellow ticket is replanned at a merge commit with no press | 1, 2, 3 | `deck/store-tickets.mjs`, `deck/server-tools.mjs`, `deck/recut.mjs`, `deck/test/replan.test.mjs` | S1 (`deck/server-tools.mjs`, `deck/recut.mjs`) | typescript | [S2](slices/S2.md) |
| S3 | The crew puts a plan on pilot by a merge and decides the re-cut | 1, 3, 4 | `agents/pilot.md`, `agents/pilot-co-pilot.md`, `agents/pilot-architect.md`, `deck/lineage.mjs`, `deck/test/gate1-lineage.test.mjs`, `scripts/test/recut-prose.test.mjs`, `docs/adr/NNNN-recut-decision.md` | – | typescript, security | [S3](slices/S3.md) |

Walking skeleton: S1, the express stop; landed alone it already keeps every ticket yellow (spec 5).

red team: A1's overturn makes S2 read headings; an artefact without `## 2.`, `## 5.` or `## 8.` at either sha is never proven unchanged and is refused (S2 behaviour 4). S2 first behaviour walked against `replanned` (server-tools.mjs:227-245): it reads `recut.from`, absent on a
yellow ticket, so S2 must take `from` as `plan.sha` when yellow; written into S2's Interface. S1 and S2 both edit
`server-tools.mjs` (grant block vs `replanned`), so S2 comes after S1. S3's prose pins `Drift after this landing`,
S1's line text: S3 reads the string from S1's slice file, not from code, so the two can run side by side.

## 9. Acceptance evidence

1. `node --test deck/test/landing-recut.test.mjs`: the 2026-11-19 case, both tickets yellow, 0 items, 1 drift line each.
2. `node --test deck/test/plan-drift.test.mjs`: a first grant over drift goes live and names the drift.
3. `node --test deck/test/replan.test.mjs`: yellow replan at a merge sha; slice-file reword passes; `architecture.md` change refused.
4. `node --test deck/test/gate1-lineage.test.mjs scripts/test/recut-prose.test.mjs`: merge named; prose pinned.
5. `npm test` green; `pilot tickets` on the live deck after a landing lists the ticket yellow.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 A landing over an owned file leaves the ticket yellow with one drift line | planned | `slice/recut-decision-s1` | – | – | – | 2, 5 |
| S2 A yellow ticket is replanned at a merge commit with no press | planned | `slice/recut-decision-s2` | – | – | S1 | 1, 2, 3 |
| S3 The crew puts a plan on pilot by a merge and decides the re-cut | planned | `slice/recut-decision-s3` | – | – | – | 1, 3, 4 |
| A re-cut is the pilot's or co-pilot's decision | planned | `feat/recut-decision` | – | – | S1, S2, S3 | 1-5 |
