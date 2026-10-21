# The pilot clears a blocking thread it no longer needs

Ticket `itm_809d3e826efc`, slug `blocking-close`. Base `origin/pilot` a37673eb. ADR 0172 (S3).

## 1. Problem

The user, in thread itm_3bd661057597: "have we created a ticket that allows the pilot to close blocking threads if it needs?" / "yes we need a pathway for the agent to get rid of blocking threads". Today the pilot may close only a `Blocked: <command>` item itself, as `Moot: <why>` (agents/pilot.md:161). Every other unanswered blocking question waits on the user. After 20 minutes it pauses its ticket (`Paused <id>`), and it refuses that ticket's gate2 even when its answer stopped mattering an hour ago.

## 2. Spec

| # | Behaviour | Evidence (bar) |
|---|---|---|
| 1 | (Agreed by the user, itm_e0a9f965d9c8 "Moot and Assumed", overriding ADR 0153 A4.) The pilot closes any open blocking question on a ticket with `Moot: <why>` or `Assumed: <what>`, the reason non-empty. A bare close, an empty reason or any other writer is refused, and the refusal names both prefixes. | `deck/test/moot.test.mjs`: 1 accepted close per prefix (2 tests); 3 refusals (bare, empty reason, QA writer), each message naming `Moot:` and `Assumed:` |
| 2 | That close resumes the ticket the question paused, in the same write, and lifts the gate2 refusal the question held. | 1 test: a paused ticket reads yellow with no `paused` after the close; 1 test: a gate2 refused before the close posts after it |
| 3 | The close is visible. The thread's resolution line carries the prefix, the user gets the close notice, and both the gate2 body and the closing report list every blocking question the pilot closed, under `Closed by the pilot:` (user, itm_0f4c0a7f0105; L8). | `deck/test/pilot-closes.test.mjs`: a fixture with 1 close names its id and reason in both; a fixture with 0 closes adds nothing to the gate2 and `- none` to the report; `notice === true` on the closed item |
| 4 | A gate1, gate2, signoff, walkthrough or proposal is never closed this way: only the user's press passes a gate. | 5 refusals, 1 per kind, in `moot.test.mjs`; the existing gate tests pass unchanged (0 edited) |
| 5 | The pilot's rule widens `Blocked:`-only Moot to every blocking question with the same three reasons (done another way, superseded, a safe assumption emerged), and says a question whose answer is still needed waits. A co-pilot sends `main` `moot <id>: <why>` and the pilot closes it. | `scripts/test/yield-wording.test.mjs` pins on 2 files (`agents/pilot.md`, `agents/pilot-co-pilot.md`); `check-references` exits 0; `measure-prompt` pin moved by exactly the measured delta |
| 6 | The user's veto (practitioner: incident reviewer; agreed by the user, itm_f66a8772e2c4 "Yes, add it"). Reopening a question the pilot closed puts its hold back, and the pilot cannot close it again: only the user's answer clears it. | 1 test: after the reopen, the gate2 is refused again and a second `Moot:` close is refused (0 accepted) |

Cannot mean here: the co-pilot closes. It holds no `deck_resolve` (agents/pilot-co-pilot.md:89-91), and the pilot posts and owns its questions. A thread another agent owns, the pilot takes back with a pass first (`mayWrite`, store-items.mjs:542); the owner rule is unchanged.

## 3. Findings

| What | Where | Leaned on |
|---|---|---|
| Close predicate, `Blocked:` questions only | `deck/blocked-shape.mjs:20-32` `MOOT`, `isMoot` | widened in place (S1) |
| Refusal of an unanswered blocking close | `deck/store-items.mjs:563-567` `resolveItem` | message names both prefixes, same line count |
| Resume on a pilot close | `deck/store-items.mjs:598`, `resumeIn` :784-797 (`answered` reads `isMoot` on closed items via `resolvedBy`) | widens with the predicate, no new code |
| Gate2 refusal | `deck/items.mjs:734-737` `gate2Blockers` reads open items only | lifted by any close, no new code |
| Gate refusal | `store-items.mjs:572-576` `isGate && !signed` | spec 4 for gate kinds already holds; pinned |
| Reopen | `store-items.mjs:674-696` pushes `Closed with: <resolution>` as a pilot reply; `/reopen` is the page's press (`server-routes.mjs:481`) | the veto reads that reply |
| Who closed | `deck/ui/render-cards.mjs:43-55`: who closed lives in the resolution's own words | no UI change |
| Report and gate2 posts | `deck/closing-report.mjs:108-128` `postFilled` wraps every `deck_post` (`server-tools.mjs:221`); `closingReportOf(record, gate)` :52 | one place appends the section to both |
| Line bar | `deck/test/facades.test.mjs:18` BAR 800; store-items.mjs is 795 | store-items stays line-neutral |
| Prompt pin | `measure-prompt`: pilot 11558.25 / 11562.5, headroom 4.25 | S3 moves the pin |
| Live deck (practitioner: the deck store) | `~/.claude/pilot/deck.json`, 2026-10-21: 75 blocking items, 51 `Blocked:`, 10 pilot Moot closes, 0 open | low volume; the audit trail matters more than throughput |

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| `deck/blocked-shape.mjs` | `PILOT_CLOSES`, `isPilotClose(item, resolution, author)` | `MOOT`, `isMoot`, the kind, proposal and veto checks | in-process, pure |
| `deck/pilot-closes.mjs` (new) | `pilotClosesOf(items, ticketId)`, `closedByPilotLines(closes)` | the query and the section text both posts share | in-process, pure |
| `deck/store-items.mjs` | `resolveItem(id, resolution, author)`, `resumeIn(deck, question)` | unchanged signatures; call `isPilotClose` | in-process, local store |
| `deck/closing-report.mjs` | `postFilled(fields)`, `closingReportOf(record, gate, closes)` | appends the section to a gate2 body and a report | in-process, local store |
| Prose | `agents/pilot.md` Yellow, `agents/pilot-co-pilot.md` hand-off | the rule | n/a (prompt) |

Deletion test: `isMoot` alone would leave the veto and kind checks spread over three call sites, so it folds into `isPilotClose`. `MOOT` folds into `PILOT_CLOSES`. A separate `pilot-closes.mjs` survives because two posts share it and closing-report.mjs is the overlap file with lander-tail (#959). It keeps that diff small.

## 4. Ubiquitous language

- **Pilot close**: a `deck_resolve` by the pilot of an unanswered blocking question whose resolution starts `Moot:` or `Assumed:` and carries a reason.
- **Moot**: the answer no longer matters (done another way, or superseded).
- **Assumed**: a safe assumption emerged; the pilot names it. Not **Assume the default**, which is the user's press.
- **Hold**: an open blocking question's refusal of its ticket's gate2 and its 20-minute pause.
- **Veto**: the user's Reopen of a pilot-closed question; it restores the hold for good.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
|---|---|---|---|
| L1 | Pilot close covers any blocking **question**, never a walkthrough, proposal or gate kind. | The user asked for the pathway (proposal itm_88f74b002ec2, Yes). Walkthroughs and gates are presses. | ADR 0153 A4's `Blocked:`-only scope, superseded by ADR 0172 |
| L2 | Two prefixes, `Moot:` and `Assumed:`, free text after; `Assumed:` need not match `recommended`. | The reason is the audit. Matching the default would refuse a better assumption. | One prefix (loses the why-kind); `Assumed:` pinned to `recommended` |
| L3 | Only the pilot's stamped author (`authorKind === 'pilot'`); the owner rule stays. | Unchanged trust boundary; a co-pilot routes through `main` (*assumed*, A2, per `main`). | The co-pilot closes its crew's question |
| L4 | The veto is read from the reopen's `Closed with: Moot:/Assumed:` reply, with no new field. | Reopen already writes it (store-items.mjs:684-691). No schema change. | A `vetoed` flag on the item |
| L5 | `isPilotClose` lives in blocked-shape.mjs; store-items.mjs stays at or under its 795 lines. | Facades BAR 800 (`main`'s instruction). | Inline in `resolveItem` |
| L6 | The section is appended to the gate2 body at post time. A close after the gate2 posts reaches the user through its notice and the closing report. | One write path (`postFilled`). | Render at view time in the UI (larger, touches render) |
| L7 | Grilling depth is "forks" (user, itm_9839b108857e): only the stashed questions whose paths give materially different deliverables are posted. That is A1, which `main` posts. The free-text `Assumed:` (L2) and the 3-slice cut (§8) stand without a question. | Asking only where the deliverable differs | Posting every branch |
| L8 | The gate2 body and the closing report both list the pilot closes under `Closed by the pilot:` (user, itm_0f4c0a7f0105). | The user sees what was assumed before the press; the report repeats it after landing. | Closing report and notice only |

## 6. Assumed decisions

- **A1** settled: the user chose the gate2 body and the closing report (itm_0f4c0a7f0105, "Gate2 body and closing report"), locked as L8. Default: the gate2 body and the closing report both list the pilot's closes, so the user sees them before Sign off. Cost: the gate2 post path grows by one append. Rejected: closing report plus notice only, which comes after landing.
  Verdict: stands — The fork is posted (itm_0f4c0a7f0105); nothing queued changes the gate2 post path, and the user has asked this month to see assumptions before a press.
- **A2** (*assumed*, `main`'s fact). Default: the co-pilot sends `main` `moot <id>: <why>` and the pilot closes. Cost: one hop. Rejected: give the co-pilot `deck_resolve`.
  Verdict: stands — The co-pilot definition grants no deck_resolve and the queue holds no ticket that would.
- **A3** settled: both prefixes, by the user (itm_e0a9f965d9c8, "Moot and Assumed"), overriding ADR 0153 A4; ADR 0172 records it (S3).
  Verdict: stands — settled by the user
- **A4** settled: spec 6 veto, added by the user (itm_f66a8772e2c4, "Yes, add it").
  Verdict: stands — settled by the user
- red team: S1's first red step (`Assumed:` on a design question) runs today against store-items.mjs:565 and is refused, so it is red. Checked: the `resumeIn` `answered` check passes the stored `resolvedBy: 'pilot'` back through `authorKind`, which returns 'pilot' ('pilot' is in AUTHOR_KINDS, items.mjs:351). So the widened resume works on a closed item, and S1 pins it with a paused design-question test beside `deck/test/moot-resume.test.mjs`, which must pass unedited. Found: the veto must not break the resume. After a reopen and a user answer, `isAnswered` is true first, so `isPilotClose` is never the only path. Risk: S2 and lander-tail (#959) on closing-report.mjs; S2 adds at most 10 lines there, the rest in the new module. No seam is half-built by two slices: S2 only reads S1's `isPilotClose`.

## 7. Out of scope

Auto-closing by a timer; closing walkthroughs or gates; a UI byline for who closed; changing the 20-minute yield; giving any agent but the pilot this close; editing the gate2 after it posts.

## 8. Slices

Width 2; longest stem 2.

| # | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | Skeleton: the pilot closes any blocking question as Moot or Assumed | 1, 2, 4, 6 | `deck/blocked-shape.mjs`, `deck/store-items.mjs` (import and refusal line only), `deck/test/moot.test.mjs` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | The gate2 and the closing report list the pilot's closes | 3 | `deck/pilot-closes.mjs` (new), `deck/closing-report.mjs`, `deck/README.md`, `deck/test/pilot-closes.test.mjs` (new) | S1 (`isPilotClose`) | `pilot:typescript-reviewer` | [S2](slices/S2.md) |
| S3 | The pilot's rule and ADR 0172 widen Moot to every blocking question | 5 | `agents/pilot.md`, `agents/pilot-co-pilot.md`, `scripts/test/yield-wording.test.mjs`, `scripts/test/measure-prompt.test.mjs`, `docs/adr/0172-the-pilot-closes-a-blocking-question.md` (new), `docs/adr/0153-a-blocked-yellow-ticket-yields-the-lane.md` (`superseded_by`), `docs/adr/README.md` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S3](slices/S3.md) |

Every spec line is delivered: 1, 2, 4 and 6 by S1; 3 by S2; 5 by S3. Security on S1 (who may answer for the user is a trust boundary) and S3 (agent configuration).

## 9. Acceptance evidence

In the order the user meets it, on a scratch deck (`pilot deck --scratch`):

1. A blocking design question is posted on a yellow ticket; a gate2 post is refused naming it (spec 2).
2. The pilot's bare close is refused, naming `Moot:` and `Assumed:` (spec 1).
3. The pilot closes it `Assumed: <what>`. The thread shows the resolution, the notice appears, and a paused ticket is yellow again (spec 1, 2, 3).
4. A `Moot:` close of a gate2, signoff, walkthrough and proposal is refused (spec 4).
5. The gate2 posts, its body lists `Closed by the pilot:` with that id (spec 3).
6. Reopen on a second pilot-closed question: the gate2 Sign off is refused, and a second pilot close is refused (spec 6).
7. After landing, the closing report lists the close (spec 3).
8. `agents/pilot.md` and `agents/pilot-co-pilot.md` read the widened rule; `npm test` green (spec 5).

## 10. Status

| Slice | State | Branch | PR | Worktree | Blockers | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | – | – | – | – | 1, 2, 4, 6 |
| S2 | planned | – | – | – | S1 | 3 |
| S3 | planned | – | – | – | – | 5 |
| blocking-close | planned | feat/blocking-close | – | – | S1, S2, S3 | 1-6 |
