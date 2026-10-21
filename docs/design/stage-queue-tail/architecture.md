# stage-queue-tail: a ticket entering a stage joins the back of that stage's queue

Ticket `itm_0e1448c0a24c` · base `pilot` at ba3f5d11 · depth: forks (itm_d2670048cf23)

## 1. Problem

"After a ticket passes yellow, it gets put into the top of the green queue. It needs to be put at the back instead."
A stage queue is deck order (ADR 0047), and every stage write changes `state` in place. So an old ticket that turns
green late sits above greens that arrived before it, and the concluding lane takes it first. Yellow has the same
fault: a Gate 1 signed today for a ticket posted last week jumps every yellow signed since.

## 2. Spec

Lines 1-9 were locked by the user as proposed (itm_999e7be18623). Line 10 is the pivot, settled under A1 and refined by A2.

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | A yellow ticket that turns green, by `need` or by a gate2 post, becomes its repository's green tail. | Store test: two greens, the ticket posted first but needed second is last in `ticketQueueOf(…, 'green')`, and `nextTicketOf(…, 'green')` picks the other. |
| 2 | Reopening a closed ticket puts it at the green tail. | Store test: a green queued, then a reopen of an older closed ticket: the reopened one is the tail. |
| 3 | Signing a ticket's Gate 1 (red to yellow) puts it at the yellow tail. | Store test: two yellows, the one signed later is the tail. |
| 4 | A write that leaves the stage unchanged keeps the ticket's place: a gate2 posted on a ticket already green, a take, a park. A yield (yellow to green, paused) also keeps its place, because nothing takes a paused ticket. | Deck order unchanged in a gate2-on-green test; `yield.test.mjs` and `paused-standing.test.mjs` pass unchanged. |
| 5 | A resumed ticket still goes to the yellow head (blocked-yellow-yields), as now. | `resume.test.mjs`, `moot-resume.test.mjs` pass unchanged. |
| 6 | Moving a ticket to the tail leaves every other item's relative order unchanged, and another repository's tickets are untouched. | Store test with a question and a ticket of another repo between the two tickets: the order of everything else is the same before and after. |
| 7 | The order already on the deck is not re-sorted. Only the next stage entry moves a ticket. | `upgradeStore` is unchanged; no existing store test changes. |
| 8 | ADR 0047 is amended with the rule and its reason. | Its status reads `amended` with an "Amended 2026-10-19 (stage-queue-tail)" paragraph, as 0133 has one; `npm run adr-index` leaves `docs/adr/README.md` clean. |
| 9 | The Tickets tab, `pilot tickets --open` and the queue place in `deck/server-tools.mjs:407` show the new order with no change of their own. | `three-lanes`, `next-ticket`, `move`, `paused-standing` tests pass unchanged; no file of theirs is in a slice. |
| 10 | A pivot (green to yellow) puts the ticket ahead of every yellow that was never green. Pivoted tickets order among themselves by when each first turned green (`greenAt`), so pivots of 4 then 3, or 3 then 4, both give 3, 4, 5. *A1 (front), refined by A2* | Store test: yellows 5 (never green), then pivot 4 and then 3 (3 first green before 4): `ticketQueueOf(…, 'yellow')` is 3, 4, 5; the same with the pivots in the other order. |

## 3. Findings

- `deck/items.mjs:591` `ticketQueueOf(items, repo, state)`: a stage's queue is its open tickets of that state, in deck
  order. It is the one spelling of the queue, and `moveTicket`, the tab, the chain and `nextTicketOf` (:615) read it.
- The stage writes, all `ticket.state = …` in place:
  - `deck/store-tickets.mjs:326` `needTicket`, yellow to green.
  - `:350` `yieldTicket`, yellow to green with `paused`.
  - `:374` `pivotTicket`, green to yellow.
  - `deck/store-items.mjs:162` gate2 post. The ticket may be yellow or green there (`TICKET_STATES_FOR`, :182).
  - `:587` a signed gate1, red to yellow.
  - `:679` reopen, closed to green.
  - `:775` `resumeIn`, green (paused) to yellow, which already splices the ticket in `deck.items`, to the yellow head.
- `resumeIn` (store-items.mjs:767-782) is the precedent: it splices within `deck.items` and moves no other item. This
  design mirrors it at the other end.
- ADR 0047's claim "nothing but the queue depends on a ticket's position" was checked by one probe for position
  readers. Only `moveTicket` (store-tickets.mjs:79-83), `resumeIn` (:777-780) and the queue-place read
  (server-tools.mjs:407) index items. Sorting happens elsewhere (resolved list, landing, status), by timestamps. The
  claim holds.
- `deck/store-core.mjs` already imports `ticketQueueOf` and `stateOf` from `items.mjs` (:16-36). Both store-items and
  store-tickets import from it, so a shared helper sits there with no new import edge.
- ADR 0133 shows the amendment format (a closing `**Amended <date> (<run>):**` paragraph, status `amended`).

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `enterStage` (store-core.mjs) | `enterStage(deck, ticket, state, place = 'tail')` | the in-place `ticket.state = 'green'/'yellow'` arrival writes (need, gate2 post, gate1 signoff, reopen at the tail; pivot by landing order; first green entry stamps `greenAt`) and `resumeIn`'s head splice, folded in S2 | in-process |
| `ticketQueueOf` (items.mjs) | `ticketQueueOf(items, repo, state)` | unchanged: survives the deletion test (four readers); `enterStage` reads it for the tail | in-process |
| `nextTicketOf` (items.mjs) | `nextTicketOf(items, repo, state)` | unchanged: the test surface for "the lane takes the other one" | in-process |

Deletion test: `enterStage` deleted means each of six writers carries its own splice, six places for one rule
(it earns its keep). `resumeIn` keeps its own answered-check and only hands its placement to `enterStage(…, 'head')`.
`yieldTicket` stays outside it on purpose (L3).

## 4. Ubiquitous language

- **Stage**: a ticket's open state, red, yellow or green, and so the lane that holds it (ADR 0147).
- **Stage queue**: `ticketQueueOf(items, repo, state)`, a repository's open tickets of one stage, in deck order.
- **Tail**: the last ticket of a stage queue. **Head**: the first.
- **`greenAt`**: when a ticket first entered green, through `enterStage`; written once, never cleared. A yield does not write it.
- **Pivoted block**: the yellows with a `greenAt`, ahead of the fresh ones, in `greenAt` order.
- **Entering a stage**: a write that changes a ticket's open state to a different one, other than a yield or a resume.
- **Arrival order**: a stage queue ordered by when each ticket entered that stage, until a move reorders it.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
| --- | --- | --- | --- |
| L1 | Depth: forks. Only questions whose paths fork the deliverable are posted, the rest are assumed (itm_d2670048cf23). | The user's answer. | Asking every default. |
| L2 | The entering ticket is spliced in `deck.items` to just after its repository's current tail of the new stage. With no ticket of that stage it stays where it is, and if it already stands after the tail it stays. | Mirrors `resumeIn`. The queue stays deck order (ADR 0047), and no other item moves relative to the rest. | Appending to the end of `deck.items`, which moves the ticket past every non-ticket item for no queue gain. A `rank` or arrival timestamp every reader sorts by, which ADR 0047 rejected. |
| L3 | A yield keeps its place, and a resume keeps going to the yellow head (now through `enterStage(…, 'head')`). | A paused ticket is never taken (`nextTicketOf` skips `isPaused`), so its green place is invisible to the lanes. A resume is interrupted work whose head placement is blocked-yellow-yields' decision. | Treating the yield as an arrival, which moves a ticket that is waiting on a question and gains nothing. |
| L4 | `enterStage` is a no-op when the ticket is already in the stage. | A gate2 posted on a green ticket is not an arrival, so its place is kept for free. | A caller-side guard at the gate2 post. |
| L5 | No backfill. The deck's present order stands. | Arrival times per stage are not stored, so a re-sort would guess. The fault heals as tickets move. | A one-off re-sort in `upgradeStore`. |
| L6 | ADR 0047 is amended, not superseded. | The queue is still deck order. Only what writes that order grows. | A new ADR superseding 0047. |
| L7 | Spec lines 1-9 as proposed; the splice after the tail (L2) and one `enterStage` in store-core.mjs are confirmed (itm_999e7be18623). | The user's answer. | – |

## 6. Assumed decisions

- **A1 Where a pivoted ticket goes in the yellow queue.** Default taken: **Settled: the yellow head** (spec 10), the user's answer **Front, like a resume**, kept after one pushback. Reason: a pivoted ticket's feature has already landed on pilot, so later PRs (4, 5, 6) are built on top of it, and the head keeps the merge order simple. overridden: a pivot preempts the yellows that waited (the pilot's objection).
  Tradeoff: A pivot jumps every yellow already queued, a second exception to arrival order beside the resume.
  Rejected path: The tail through `enterStage`, the first default. Thread: itm_75f0c7efd52b, resolved
  Verdict: stands — the head matches how pilot already carries a landed feature, and no queued ticket or other run is moved by it.
- **A2 How the yellow queue orders pivoted tickets.** Default taken: landing order. The first green entry stamps
  `greenAt` once. A pivot splices the ticket ahead of every yellow with no `greenAt`, and after every pivoted yellow
  with an earlier `greenAt`. A Gate 1 entry still goes to the tail, and a resume still goes to the head (L3). A
  ticket from before this ships has no stamp and sits after the stamped ones, in deck order.
  Tradeoff: `greenAt` is when QA handed back, not the git merge, so two features whose QA ran at different speeds can
  order differently from pilot's merge history.
  Rejected path: a head insert (A1 as first cut), which reverses pivots made in a row; reading the merge order from
  git in the store write, which is exact but puts git into a deck write. The research: `pilot land` writes nothing
  to the deck (scripts/land.mjs reads `listItems` only), and a gate2's `landing` record (store-items.mjs:480-486) is
  written after a Sign off, which `pivotTicket` refuses. Thread: itm_43ed5b2f8cea, answered **Landing order** by the user (the default).
  Verdict: stands — the landing order is the merge order the user keeps by hand today, and no queued ticket or other run is moved by it.

## 7. Out of scope

- Any change to `moveTicket`, the Tickets tab, `pilot tickets`, the chain or `nextTicketOf`.
- A change to where a resume lands (L3), and the yield.
- Re-sorting the existing deck (L5).
- A stored arrival time or rank.

## 8. Slices

Width 1; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | A ticket that turns green joins the back of the green queue | 1, 4, 5, 6, 7, 8, 9 | `deck/store-core.mjs`, `deck/store-tickets.mjs`, `deck/store-items.mjs`, `deck/test/stage-queue-tail.test.mjs` (new), `docs/adr/0047-the-ticket-queue-is-deck-order.md`, `docs/adr/README.md` | – | `pilot:typescript-reviewer` | [S1](slices/S1.md) |
| S2 | Gate 1 and reopen join the back; pivots keep landing order | 2, 3, 9, 10 | `deck/store-core.mjs`, `deck/store-items.mjs`, `deck/store-tickets.mjs`, `deck/test/stage-queue-tail.test.mjs` | S1 (`enterStage`, `deck/store-items.mjs`) | `pilot:typescript-reviewer` | [S2](slices/S2.md) |

S1 is the walking skeleton: the seam, the two green arrivals the user reported, and the ADR. S2 routes gate1 and
reopen through the same seam at the tail, folds `resumeIn`'s head placement behind it, and orders pivots by `greenAt` (A1, A2). They share both store files, so they run one after the other.

## 9. Acceptance evidence

In the order a user meets it:

1. A green is queued. An older yellow is needed (or its gate2 posted). On the Tickets tab, the newly green ticket
   is listed under the first one, and the first one is the one marked `next` (spec 1, 9).
2. A gate2 posted again on an already-green ticket, a take or a park leaves the tab's order as it was (spec 4).
3. A reopened ticket shows at the bottom of the green list (spec 2).
4. A Gate 1 signed shows its ticket at the bottom of the yellow list (spec 3). Pivoted tickets show above the never-green
   ones, in the order they first turned green, however many pivot in a row (spec 10, A1, A2).
5. A paused ticket and a resumed ticket behave as before (spec 4, 5). The deck's other items are where they were,
   and nothing already queued moved on upgrade (spec 6, 7).
6. ADR 0047 reads amended, and `npm run adr-index` is clean (spec 8).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | – | – | – | – | 1, 4, 5, 6, 7, 8, 9 |
| S2 | planned | – | – | – | S1 | 2, 3, 9, 10 |
| stage-queue-tail | planned | feat/stage-queue-tail | – | – | S1, S2 | 1-10 |
