# Ticket states and autonomous mode

Feature `ticket-states` · tickets itm_84f59554db90 (A, states) and itm_7c09752c8bab (B, modes), merged
into one design by the user · base `main` b09e0c5 (0.7.15) · design branch `design/ticket-states`

## 1. Problem

The deck classifies tickets only by size, small or regular. Its green/yellow/red phase is derived
across the whole repository from gate threads (thread-kinds L4, L19, spec 16; ADR 0057). As a
result, a session can carry only one ticket through planning at a time, and a ticket has no state of
its own. The user wants the phase to live on the ticket:

- green while it is being planned;
- yellow once its Gate 1 is signed;
- red once its Gate 2 is *posted*;
- closed once its closing report is posted.

At Gate 1 the ticket's artefact is bundled with it by reference, and the estimate given at creation
is replaced by a sharper one. The small-ticket classification goes ("it just is useless"), and
same-type green tickets merge into one plan while they are being planned.

The second half (B) builds on that state. "All the time I spend at the computer is completing
green and red phases, whilst yellow is autonomous." In **attended** mode the user works one ticket
at a time: first the red queue (leftover grilling, then Gate 2), then the green queue (grilling,
then Gate 1, after which the ticket is yellow). In **autonomous** mode, the pilot works down the
yellow queue unattended and takes each ticket to red.

## 2. Spec

Every line was agreed on the deck on 2026-10-01 (A1–A6, B1–B6 answered; see §6).

| # | Behaviour | Evidence |
|---|---|---|
| 1 | A ticket carries a stored `state`: green, yellow, red or closed. Only the daemon writes it, in the same store write as the event that changes it. Posting a ticket makes it green. Signing its `gate1` makes it yellow. **Posting** its `gate2` makes it red. Posting its closing `report` makes it closed and resolves the ticket (A1); signing `gate2` leaves it red. | One ticket walks all four states on a scratch deck; each step shows on the tab and in `deck.json`. |
| 2 | Every `gate1` and `gate2` names its ticket in a required `ticket` field. The deck refuses, by name, a gate whose ticket is missing, closed, not live, or in the wrong state. | A deck test for each refusal. |
| 3 | The Tickets tab shows three queues (green, yellow, red), each in queue order with its estimates. The live ticket is marked. Closed tickets leave the tab. | The tab on a scratch deck with fixture tickets in each state. |
| 4 | Each repository has at most one **live ticket**. The deck's phase is that ticket's state, and with no live ticket there is no colour. `runPhaseOf` and its cycle-start rules (thread-kinds L4, L17, spec 16, 17) are deleted. ADR 0060 amends ADR 0057. | The tab's colour follows the live ticket through a walk; the phase tests are rewritten; `npm test` is green. |
| 5 | Every run is on a ticket. A direct request is first posted as a ticket in the user's words, and then taken (L17). | `pilot.md` step 1 is pinned; on the scratch deck a direct request shows up as a live green ticket. |
| 6 | At creation a ticket carries `estimate`, a required count of minutes. | A post without it is refused by name; the tab shows it. |
| 7 | When Gate 1 is signed, the daemon writes the ticket's **plan**, by reference: artefact path, design branch, sha, slug, slice count, and the Gate 1 estimate (slice count × minutes per slice). | A yellow ticket's row and `GET /api/record?ticket=` show the references and both estimates. **Amended by the user on the Gate 2 walkthrough (itm_3985d0d540a9, 2026-10-03):** "get rid of the estimate ... tell the user it is 5 slices rather than some estimate time". The row shows the slice count ("N slices") and no minutes; a row with no plan shows no estimate. The record and `GET /api/record?ticket=` still carry both estimates; moving them to slice counts is queued ticket itm_1214816b3789. |
| 8 | **Minutes per slice** is worked out from items. For each closed ticket, take gate2's `postedAt`, subtract the later of gate1's `resolvedAt` and the ticket's last `takenAt`, and divide by the slice count. The figure is the median over the repository's last 20 closed tickets at most; until one exists it is 30 (A4, L13). | A pinned test on fixture items. |
| 9 | A run can end at Gate 1 as **planned**. The pilot parks the ticket, records `finished: "planned"`, and takes the next ticket in the same session. | On a scratch deck, two tickets are planned to yellow in one session. |
| 10 | Small tickets are retired: `size`, `deck_ticket start/small/regular`, `startedAt`, the badge, the walkthrough's `ticket:` field, ticket-shape's "Answered before posting" rule, and the side-job paragraphs. | `grep` finds no small ticket in `deck/*.mjs`, the agents or the skill; the pinned tests go with it. |
| 11 | During planning the pilot merges same-type green tickets into the live one (A2) with `deck_ticket merge <id>`. The absorbed ticket is closed as "merged into" the live one, and its body arrives on the live ticket as a reply. | On a scratch deck, two green tickets become one and the other reads "merged into itm_…". |
| 12 | The ticket-making skill is rewritten around states, the creation estimate and merging during planning, with no Size band and no small ticket (A6). | The text is pinned by `scripts/test/ticket-making.test.mjs`; a Make tickets thread with two same-surface jobs yields one ticket. |
| 13 | The chain makes the next ticket live instead of resolving it (run-chaining L4). `nextTicketOf(items, repo, mode)` chooses that ticket. In run 1 it is the first green ticket; run 2 adds the modes, and the yellow queue is theirs (spec 16). `deck_ticket take` works on any open ticket, so nothing extra is built for taking a yellow ticket by hand. | `chain.test.mjs` is rewritten; after a chain hand-off the ticket is open and live. |
| 14 | A run record names its ticket (`deck_status` `ticket`), and `GET /api/record?repo=&ticket=` returns it. | A deck test; on the scratch deck the record is read through the route. |
| 15 | Each repository has a mode: **attended** (the default) or **autonomous**, set by a control on the tab and stored by the daemon; it **replaces full auto** (B1): the `auto` map, its toggle, its `auto` closures of questions, sign-offs, gates and walkthroughs, and its self-merge are removed, with their tests and prose. `GET /api/record` reports `mode`, and the live pilot is told of a change on its next `deck_wait`, which takes effect at its next park or close (B3). | The toggle on the scratch deck; the route's output; a test of the notice. |
| 16 | In autonomous mode the next ticket is the head of the yellow queue. Its session: (a) resumes from the plan and record at step 4, with no Gate 1; (b) implements and runs QA; (c) posts the walkthrough and `gate2`, and the ticket turns red; (d) parks the ticket; (e) finishes with "gate 2 posted". The chain then starts the next yellow ticket in a cleared session (B2). A run that cannot finish parks the ticket yellow with its blocker queued (B4). | Two yellow tickets reach red on a scratch deck with no human reply between them. |
| 17 | A question that a run on a ticket cannot settle names that ticket. A **blocking** question — unreasonably expensive to revise *and* no safe assumption; the body says both — refuses that ticket's `gate2` post until answered; the pilot carries on with everything that does not stand on the answer and parks the ticket `blocked` only when nothing independent is left. Every other question is assumed at its recommended default and waits on the ticket as **red-phase grilling**: it does not hold the Stop gate while its ticket is not live, and it refuses only the gate2's Sign off. No question affects another ticket's gates. "Assume the default" on a blocking question makes it plain. | Two tickets: A with an open plain question — A's gate2 posts and its Sign off is refused by name, B's gate2 posts. A with an open blocking question — A's post is refused by name, B's posts; Assume the default, then A's posts. (S18) |
| 18 | In attended mode the next ticket is the first ticket with open queued questions or in red, then the head of the green queue. The chain and the tab's `next` marker read the same `nextTicketOf`. | With one red ticket and one green ticket, the red is taken first; a scratch session walks both. |
| 19 | When someone replies on a parked red ticket's walkthrough, the live pilot resumes `pilot-qa` for that ticket from the `qa` refs in its record (branch, worktree, scratch-deck URL). Two QA agents are never live at once. | A reply on a parked red ticket's walkthrough is answered on that thread. |
| 20 | An autonomous run's `gate2` is its report: its body carries what happened while the user was away — the decisions assumed with their defaults, the hiccups (blocked, retried or skipped steps), and the questions it queued — and in attended mode the Tickets tab opens on the first red ticket, whose previews list its queued questions and its `gate2`. No separate report item; the closing report follows the sign-off as today (B5). | After an autonomous run on a scratch deck, the red ticket's `gate2` body lists assumptions, hiccups and its open questions; the tab's first red ticket shows those previews. |

## 3. Findings

| Area | What exists | Anchor |
|---|---|---|
| Phase | `runPhaseOf(items, repo)` is pure and derived from resolved gates after a cycle start. Its only callers are `tabsOf` and the away rule, under which a question posted while implementing needs `recommended`. | `deck/items.mjs:641-685`, `deck/tabs.mjs:140`, `deck/store.mjs:611` |
| Phase drawn | `renderStripLink` outputs `<span class="phase" data-phase>`. The colours are keyed by phase name. | `deck/ui/render.mjs:1036-1047,1100`, `deck/ui/deck.css:316-322` |
| Ticket item | A standing kind with the optional fields `slice`, `repo`, `dir` and `size`. Its order is its position in `deck.items`. It has no link to a run or a record. | `deck/items.mjs:59,102,371`, `deck/store.mjs:548-623` |
| Queue | `ticketQueueOf` holds the open tickets without `startedAt`. `queueHeadOf` returns the first non-small one, and `moveTicket` swaps neighbours. | `deck/items.mjs:693-711`, `deck/store.mjs:920-990` |
| Small tickets | `SIZE_SMALL`, `isSmall`, `isInFlight`, `startTicket`, `setTicketSize` and the walkthrough's in-flight check (`TICKET_FIELD` itself stays: L6 reuses it; `ui/js/size.mjs` is panel resizing, not ticket size, and stays). About 437 hits; the heaviest are `small.test` (67), `small-flight.test` (52), SKILL.md (48), and `scripts/test/small-ticket.test.mjs` (47, which pins pilot/implementer/qa). | `deck/items.mjs:271-275,328,708-711`, `deck/store.mjs:626-640,920-960` |
| Gates | `gate1` takes `artefact`, `sha`, `locked` (a count) and `slices` (the table text). `gate2` takes `pr` and `sha`, plus an optional `walkthrough`. A `signoff`/`gate1`/`gate2` is refused while a question is open (ADR 0029). | `deck/items.mjs:333-345`, `deck/store.mjs:529` |
| Chain | `chainNext` posts the hand-off for the head ticket and `resolveItem`s that ticket. Only a finish of `FINISHED_CLEAN` chains. | `deck/chain.mjs:64-85`, `deck/runs.mjs:226` |
| Record | `deck.records[]` holds one record per repo and slug. `recordFor` returns the newest, through `GET /api/record?repo=`, mirrored to `docs/design/<slug>/run.json`. | `deck/runs.mjs:223,355`, `deck/store.mjs:1408-1455`, `deck/server.mjs:714-724,1369` |
| Full auto | A per-repository `auto` map of `{merge, at}`. While a repository is in it, `postItem` closes question, signoff, gate and walkthrough items as `auto`. The toggle sits under Create on a tab, and `recordFor`'s route returns it. | `deck/store.mjs:329-368`, `deck/server.mjs:759,1151`; independence spec 5, 6, L5 |
| Timings | No minutes-per-slice figure exists. `pilot analytics` agent-time is printed, not stored. The gate items carry `postedAt` and `resolvedAt`. | `deck/analytics.mjs:98-212`, run-analytics A6 |
| Store | `STORE_VERSION = 1`, and a mismatch is refused. Upgrades are read-time maps only. | `deck/store.mjs:93,199-233` |
| Ticket shape | A body that names `docs/design/<slug>/architecture.md` passes whole. | `deck/ticket-shape.mjs:24` |
| Prose pins | `scripts/test/small-ticket.test.mjs`, `ticket-making.test.mjs`, and `run-split.test.mjs:46-56` (the architect points at "Size") | `scripts/test/` |

## 4. Ubiquitous language

- **Ticket state**: green (planning), yellow (planned), red (concluding: Gate 2 posted, grilling queued), closed.
- **Live ticket**: the one ticket per repository that the session is on. The deck's phase is its state.
- **Take / park**: making a ticket live / ending its liveness without changing its state.
- **Plan**: the references written onto a ticket at Gate 1, together with the Gate 1 estimate.
- **Mode**: attended (green and red work, with the user) or autonomous (yellow work, unattended), per repository.
- **Red-phase grilling**: open questions that name a ticket and wait for its next attended turn.
- **Next ticket**: what `nextTicketOf(items, repo, mode)` returns. The chain and the tab both read it.

## 5. Locked decisions

All 22 were walked on the deck at *every* depth on 2026-10-01 and kept; L13 (a 20-ticket window) and L18 (the split by slice sequence) were amended on their threads.

| Id | Decision | Rationale | Rejected |
|---|---|---|---|
| L1 | Grilling depth is *every*: Gate 1 walks each locked decision. | The user, on the deck. | *forks* |
| L2 | QA runs on a scratch deck: a second daemon on a free port, started from the feature worktree and seeded with fixture tickets. The 4321 deck is untouched. | The user, on the deck. | the live deck |
| L3 | The state is **stored** on the ticket. Its one writer is the store's gate transitions in `postItem`/`resolveItem`, in the same write as the event. | The user: "canonically stored in the tickets themselves". A single writer cannot drift, and a parked ticket needs stored data anyway. | Deriving it from gate items: a pure function, but dismissing a gate would change the answer, and the user named storage. |
| L4 | The live pointer is `live: true` on the ticket, plus `takenAt`. The phase is read from items alone. | Keeps thread-kinds L4's reason (F9): `tabsOf` gains no input. | The record naming the live ticket, which adds an input to `tabsOf`/`renderHomePage`. |
| L5 | A parked ticket's record is found by the `ticket` field on the record. Records are already one per repository and slug, and the plan names the slug. | It reuses `deck.records`, which is already mirrored to `run.json`. | Copying the record onto the ticket, which makes two copies that drift. |
| L6 | Gates and the closing `report` (and in run 2, questions and walkthroughs) name their ticket in `ticket`. The small walkthrough's `TICKET_FIELD` is reused. | The deck can then tell whose gate it is. ADR 0057 rejected parsing the body. | Inferring the ticket from the live pointer, which is wrong once a ticket is parked and its gate is re-posted. |
| L7 | `gate1` gains `branch` (the design branch) and `sliceCount` (a count); `slices` stays as the table text. | The estimate needs a number, and the card keeps its table. | Making `slices` a count (the table leaves the card), or counting rows, which is parsing. |
| L8 | The `state` values are `green`, `yellow`, `red` and `closed`. The page labels them planning, implementing and concluding, and `data-phase` takes the colour. | The user's words; one spelling for both ticket and tab. | Storing the phase names, which would be a second vocabulary. |
| L9 | One ticket is live per repository. `take` is refused while another ticket is live. `park` ends the liveness of a ticket in any state. Closing ends it too. | "The deck still works on only 1 ticket at a time, regardless of what state it is in." Run 2 parks green and red tickets as well (B3, spec 16). | Several live tickets, or park only for yellow, which run 2 would have to widen. |
| L10 | A planned run calls `deck_ticket park` and then `finished: "planned"`, and the same session takes its next ticket without a `/clear`. | "During a 2 hour session" the user plans several tickets. Only `FINISHED_CLEAN` chains. | A cleared session per planned ticket, which loses the sitting's grilling context. |
| L11 | A gate resolution that is not a Sign off leaves the state unchanged. | Only a signed gate moves the state, as A9 already has it. | Reverting the state, which would need a history. |
| L12 | Existing data stays at `STORE_VERSION` 1. A missing `state` reads as green when the item is open and closed when it is resolved. A legacy `size` or `startedAt` is ignored. A run that is in flight has no colour until its next take. | The change is additive, at the cost of one wrong colour once, as ADR 0057 accepted. | A version bump and the deck's first migration framework. |
| L13 | Minutes per slice is a pure function, `minutesPerSlice(items, repo)`, reading at most the last 20 closed tickets (the user's cap, on the deck). | It is derived from items. Agent-time double-counts parallel agents (run-analytics A6). | Storing a figure; reading analytics. |
| L14 | `deck_ticket` takes `up`, `down`, `take`, `park` and `merge`; `start`, `small` and `regular` go. | One tool the pilot already knows, at no new prompt share. | A new tool. |
| L15 | Merging goes only into the **live green** ticket, from a green ticket. The absorbed body arrives as a reply on the host, the host's estimate becomes the sum of the two, and the absorbed ticket is resolved "merged into itm_…" with `mergedInto`. | "We merge during the planning phase." It follows ticket-making's existing reply-on-the-ticket pattern. | Editing the host body (forbidden), or merging yellow tickets that were each signed. |
| L16 | ADR 0060 amends 0057 (the phase is the live ticket's state; red comes on gate2 posted; the cycle start goes) and run-chaining L4 (take, do not resolve). | The record says why both moved. | Editing 0057 in place. |
| L17 | Every run is on a ticket. A direct request is first posted as a ticket in the user's words, naming its artefact path, and then taken. | The user, on the deck. Without it a run has no state and no colour. | Runs without a ticket. |
| L18 | **Runs**: two, in sequence on this deck, split by the slice sequence rather than by A/B: run 1 is S1–S8 (the deck's state machine; spec 1–4, 6–10, 13, 14) and run 2 is S9–S16 (merge, the pilot's prose, the skill, and the modes; spec 5, 11, 12, 15–20). | The user, on the deck: "split it up by our predicted sequence of slices". Even halves at the seam where the deck model is complete; run 2 starts from run 1's tip with no second grilling. | One run (16 slices, over the bound; the user's first pick, withdrawn after the pushback); the A/B split (S1–S11 / S12–S16, uneven and the prose lands late); parallel decks. |
| L19 | `nextTicketOf(items, repo, mode)` lives in run 1 with the attended rule, where it returns the first green ticket. Run 2 adds the mode branch and the red-first ordering. | B is built on A, not beside it: the chain and the tab never grow two head functions. | Keeping `queueHeadOf` and adding a yellow head beside it. |
| L20 | The mode is stored in a per-repository `mode` map that replaces `auto`. A missing entry, or a legacy `auto` entry, reads as attended. | One map, one route field, one place on the tab; nothing of full auto survives to contradict it. | Widening `auto` to three positions (B1's recommended default; the user chose Replace). |
| L21 | `awaitsUser` is false for a question whose ticket is not the live ticket. The Stop gate never holds a turn on red-phase grilling. | Without this an autonomous session stalls at its first turn end (spec 17). | A hold-until-red flag on the question. |
| L22 | **Revised 2026-10-02 (itm_4c0faaf3ea87, S18).** A `gate2` post is refused only by an open **blocking** question on its own ticket; a question on another ticket refuses nothing. A blocking question is one that is unreasonably expensive to revise after the fact (schema or migration, auth or trust boundary, public API shape, irreversible data — not a slice re-cut) *and* has no safe assumption; every other question is assumed at its recommended default and refuses only that gate2's **Sign off**. A blocking question stops nothing until the gate: the run carries on with everything independent of it and parks `blocked` only when nothing independent is left. The user may press "Assume the default", which makes it plain. | Red must be reachable by an autonomous run that has stashed questions (spec 16, 17), and a second run must never be refused by the first run's stash. | The first wording ("refused only by open questions that do not name its ticket"), which let a parked ticket's question refuse the next ticket's gate2 — found in S16's walk. |

## 6. Assumed decisions (asked on the deck)

| Id | Question | Default taken | Tradeoff |
|---|---|---|---|
| A1 | When is a ticket closed? | **Answered by the user**: when its closing `report` is posted — the report can only follow the signed `gate2`, so red → closed on the report. The merge stays a human step in it. | The deck cannot see a merge; a ticket reads closed with its PR still unmerged. |
| A2 | What does "same-type" mean? | **Answered by the user** (the default): same surface: the same screen, module or files. | Tickets have no type field, and adding one is a taxonomy to keep up. |
| A3 | How is a yellow ticket taken before run 2 lands? | **Moot** (the user, on the deck): B is in this run, so autonomous mode takes the yellow queue; `take` stays a plain action on any open ticket. | Nothing built for a hand-take. |
| A4 | Where does minutes per slice come from? | **Answered by the user** (the default): the median of the last 20 closed tickets at most (the user widened the window from five on L13); 30 until there is one. | Early estimates use the old constant. |
| A6 | What happens to ticket-making's run-size target? | "Size" becomes "Estimates": minutes per slice, the creation estimate, and the one-run bound. The 5–7 h band and small tickets go. | The architect needs a bound (`run-split.test.mjs:46-56`), so that pin moves. |
| A7 | What does a parked ticket's badge say? | **Answered by the user** (itm_bd2ace799968, the default, taken as assumed while they were away): a parked yellow row reads "planned", a parked red row "awaiting sign-off"; the live row keeps L8's words; the strip is unchanged. | Built in fix round PR #269. |
| B1 | Does the mode control replace, extend or sit beside full auto? | **Answered by the user: Replace.** Full auto is removed; attended and autonomous are the only modes, and self-merging runs go. | Extend was recommended (nothing removed); the user took the smaller system. |
| B2 | Does each yellow ticket get its own session? | **Answered by the user** (the default): yes, a cleared session per yellow ticket, through the chain. Autonomy then needs `pilot run`. | One long session fills its context by about the third ticket. |
| B3 | What happens to a mode switch made mid-ticket? | It takes effect at the next park or close. A green ticket being grilled is parked green. | Cutting mid-step would leave a half-posted gate. |
| B4 | What happens to an autonomous run that cannot finish? | **Answered by the user** (the default): the ticket parks yellow with its blocker queued as a question, and the chain moves on. Attended mode takes tickets with questions first. | It needs no new state, but a blocked ticket looks like any other yellow ticket until it is opened. |
| B5 | What is "one report per session"? | **Answered by the user**: no report item — "the report will literally be gate 2": assumptions, hiccups and the questions needing answers go into the autonomous run's `gate2` and its queued questions, and the deck opens on the first red ticket with those previews. | A stretch report would make the agent rebuild eight hours of context from the threads; the closing report stays where it is, after the sign-off. |
| B6 | A ticket reaches red two ways: from a live attended run, or from a parked autonomous run. Is that one state? | Yes, one state. The row marks the ticket live or parked. | Two red states would split one queue that the user empties in the same way. |

| A8 | The hand-off that left the fresh session idle on 2026-10-02 (wrapper typed `/clear`, the lane never marked): fix in this run or queue it? | **In this run** (the user, on the chat itm_0bfcf27836de: "just do it in this run") as S17, added. Fallback on no marker: *assumed* B, post the failure on the handoff thread and the chat, never a prompt into an unidentified session. |
| A9 | What `estimate` does an audit pick carry, when a report row has `effort` S/M/L and a saving, not a cost? | *Assumed* (pilot, during S11): effort weight (S 1, M 3, L 8, the weights of `deck/audit.mjs`) × 30 min, until the deck measures one. |

| A10 | The pilot's background `pilot wait` is killed by Claude Code's 2-hour cap on background commands (seen 2026-10-02 at the 2 h mark, no reply). The user: "i want it systematically fixed rather than just a memory from you". | **Fix round of this run** (spec 16, 18: an unattended run keeps listening): `pilot wait` ends on its own well inside the cap (default 110 min), answering `no reply after 110 minutes`, and the pilot's prose restarts a wait on *any* exit, silently when it ended with no reply, with no "say so and wait for the user" exception; pinned by a test. |

## 7. Out of scope

- A GitHub merge poll.
- A store migration framework.
- Port allocation for scratch decks (a friction row).
- Editing ticket bodies.
- Any hands-off mode that signs a gate or merges: full auto goes and nothing takes its place.
- A headless start of autonomous mode: `pilot run` stays the only way a cleared session starts (run-chaining L10, L11).

## 7a. Principles review verdicts (run 1, fix round PR #269)

| Finding | Verdict |
|---|---|
| F1 A ticket reopened after its report kept `state: closed` while open and fell out of every queue | Kept: reopen restores red; the stored `closed` stays (spec 1). |
| F2 Three surviving mutants in `minutesPerSlice` | Kept: fixtures for another repo, an open red ticket, a closed ticket with no plan. |
| F3 `pressedOf` | Kept: deleted; F4 makes "closed => gate2 resolved" true by construction. |
| F4 A report closed a ticket whose gate2 was still open | Kept: refused by name; a second open gate1/gate2 for one ticket is refused too (QA). |
| F5 Two formats for one estimate | Kept: `~` + `renderMinutes`. |
| F6 `TICKET_FIELD` duplicate of `TICKET_ID_FIELD` | Kept: deleted; a walkthrough's `ticket` is an item id. |
| F7 `recordForTicket` copied `recordFor`'s guard and the route read the deck twice | Kept: one read returns `{ record, ticket }`. |
| Nits: unreachable guards, `mode` parameter, `phaseOf` name clash, row fallback, `ticket` in the `deck_post` text | Kept, except the `ticket?.kind` guard: a 0.7.15 gate1 has no `ticket`, so it is reachable. |
| Nit: `plan.slug` unread | Dropped: run 2's autonomous resume (spec 16a) keys the run record by slug. |
| The case for a plan by reference (`{ gate1, estimate }`) | Dropped: moves spec 7. |
| QA F1 hand-off frame named no ticket; F2 `deck_ticket` refusal; F4 0-minute floor; D1 gate page rows; D2 parked badge (A7) | Kept, all in PR #269. |

## 7b. Principles review verdicts (run 2, at 85c3fa2; fix round after S18)

Fundamentalist: diff coverage 99 % (505 lines, 4 missed in `run.mjs`), mutation 91.9 % (498 mutants, 44 survived, 2 equivalent), pilot pin at zero headroom. QA read-only pass at 85c3fa2: every run-2 spec line passed on scratch deck 4499.

| Finding | Verdict |
|---|---|
| F1 `awaitsUser` twice (`deck/items.mjs`, `hooks/lib/deck.js`), `namedTickets` lookup | Kept: delete both copies and the join test; the live-ticket check lives in `stop-gate.awaitsUser` (≈ −57). Verified: the deck's copy has no caller outside tests. |
| F2 wrapper log duplicated in `run.mjs` and `hooks/lib/deck.js` | Kept: one `hooks/lib/wrapper-log.js` imported by both (≈ −14). |
| F3 `parkedTicketFilter` copies `ownerFilter`; routing split across store and server | Kept: the parked-red-walkthrough branch moves into `ownerFilter` (≈ −10). |
| F4 `pilot.md` step 2 says "next green ticket" against the Modes section | Kept: drop "green". |
| F5 `items.mjs:695` a question on the live ticket marks it `next` (spec 13), 9 mutants | Kept: walk the queues in order, skip the live ticket; test. |
| F6–F8, F10 untested branches (closed question, red hand-off body, plan over limit, chat line after a refused thread reply) | Kept: one test each. |
| F9 `qa.url` credentials refusal untested | Kept: test (security). |
| F11 S17 log lines not in its Interface | Kept: recorded in S17.md by the pilot. |
| N1 `MODES` export, N2 `setMode` `at`, N5 double `refuseCredentials`, N7 unreachable `isAbsolute`, N8 `sayNoMarker` constant | Kept: each a removal or a one-liner. |
| N3 `modeIn` repeats `modeFor`; `opens` re-derives the branch | Dropped: S18 reworks `nextTicketOf`; re-judge after. |
| N4 `openQuestionsOf` per row | Dropped: no consequence at a deck's size. |
| N6 = QA F2 reopen of a merged ticket double-counts | Kept: refuse reopen of an item with `mergedInto`. |
| N9 CCN 11 on `chainNext`, `renderStrips` | Dropped: no consequence shown. |
| QA F1 Sign off pressed before a question was posted still signs at resolve | Kept: `resolveItem` refuses a signed gate2 while a question on its ticket is open, same message. |
| QA F3 lane notice tells a yellow autonomous ticket to name a gate1 | Kept: prose. |
| QA D1 Tickets panel opens scrolled to green, the red row below the fold (spec 20) | Kept: open scrolled to the first red row. |
| QA D2 artefact path overflows the red row | Kept if ≤ 5 lines of CSS. |
| QA D3 the Sign off refusal is a bare 400 text page | Deferred to a ticket: it is the `/reply` route's existing refusal path, a surface change past the fix round. |
| A10 `pilot wait` killed at the 2-hour background cap | Kept: 110-minute default, prose restarts on any exit, test. |


## 8. Slices and runs

| Run | Slices | Spec lines | After |
|---|---|---|---|
| 1 The deck's state machine | S1–S8 | 1–4, 6–10, 13, 14 | – |
| 2 Planning prose, the skill and the modes | S9–S16 | 5, 11, 12, 15–20 | run 1 |

| # | Slice | Spec | Files owned (beyond their tests) | After | File |
|---|---|---|---|---|---|
| S1 | Signing a gate1 turns its ticket yellow (walking skeleton) | 1, 2 | `deck/items.mjs`, `deck/store.mjs`, `deck/ui/render.mjs`, `deck/ui/deck.css` | – | [S1](slices/S1.md) |
| S2 | Small tickets retired from the deck | 10 | `deck/items.mjs`, `deck/store.mjs`, `deck/ticket-shape.mjs`, `deck/tools.mjs`, `deck/server.mjs`, `deck/chain.mjs`, `deck/ui/render.mjs` | S1 | [S2](slices/S2.md) |
| S3 | Posting gate2 turns the ticket red and the closing report closes it; three queues | 1, 2, 3 | `deck/items.mjs`, `deck/store.mjs`, `deck/ui/render.mjs`, `deck/ui/deck.css` | S2 | [S3](slices/S3.md) |
| S4 | Live ticket: take, park, phase = its state | 4, 9 | `deck/items.mjs`, `deck/store.mjs`, `deck/tabs.mjs`, `deck/tools.mjs`, `deck/server.mjs`, `deck/ui/render.mjs`, `docs/adr/0060-the-phase-is-the-live-ticket-s-state.md` (written at Gate 1; S4 amends it if the implementation moves) | S3 | [S4](slices/S4.md) |
| S5 | The chain makes `nextTicketOf` live instead of resolving it | 13 | `deck/chain.mjs`, `deck/items.mjs`, `hooks/session-handoff.js` | S4 | [S5](slices/S5.md) |
| S6 | A ticket is posted with its creation estimate | 6 | `deck/items.mjs`, `deck/store.mjs`, `deck/tools.mjs`, `deck/ui/render.mjs` | S5 | [S6](slices/S6.md) |
| S7 | Gate 1 writes the plan and its measured estimate | 7, 8 | `deck/items.mjs`, `deck/store.mjs`, `deck/ui/render.mjs` | S6 | [S7](slices/S7.md) |
| S8 | A record names its ticket and is read by it | 14 | `deck/runs.mjs`, `deck/store.mjs`, `deck/server.mjs`, `deck/tools.mjs` | S7 | [S8](slices/S8.md) |
| S9 | Merge a green ticket into the live one | 11 | `deck/store.mjs`, `deck/tools.mjs`, `deck/server.mjs` | S8 | [S9](slices/S9.md) |
| S10 | The pilot plans on tickets: take, park, merge, gates naming tickets | 4, 5, 9, 10, 11 | `agents/pilot.md`, `agents/pilot-implementer.md`, `agents/pilot-qa.md`, `scripts/test/small-ticket.test.mjs` (deleted), `scripts/test/ticket-states.test.mjs` (new) | S9 | [S10](slices/S10.md) |
| S11 | ticket-making rewritten around states and estimates | 10, 12 | `skills/ticket-making/SKILL.md`, `agents/pilot-architect.md`, `agents/pilot-auditor.md`, `rules/orchestration.md`, `rules/vertical-execution.md`, `README.md`, `scripts/test/ticket-making.test.mjs`, `scripts/test/run-split.test.mjs`, `scripts/test/pilot-agents.test.mjs`, `scripts/test/install.test.mjs` | S9 | [S11](slices/S11.md) |
| S12 | Mode control replaces full auto on the tab, reported by the route and the wait | 15 | `deck/store.mjs`, `deck/server.mjs`, `deck/items.mjs`, `deck/ui/render.mjs`, `deck/ui/deck.css`, `deck/ui/js/*` (the control), `deck/tools.mjs`, `deck/test/auto.test.mjs` (deleted) | S11 | [S12](slices/S12.md) |
| S13 | `nextTicketOf` by mode; autonomous chains at gate 2 posted | 16, 18 | `deck/items.mjs`, `deck/chain.mjs`, `deck/server.mjs`, `deck/runs.mjs` | S12 | [S13](slices/S13.md) |
| S14 | Red-phase grilling: questions on a ticket, gate2 sign refused; the first red ticket opens with its previews | 17, 20 | `deck/items.mjs`, `deck/store.mjs`, `hooks/lib/deck.js`, `deck/ui/render.mjs` | S13 | [S14](slices/S14.md) |
| S15 | The record carries `qa` refs; a walkthrough reply on a parked red ticket reaches the live pilot | 19 | `deck/runs.mjs`, `deck/server.mjs`, `deck/items.mjs` | S14 | [S15](slices/S15.md) |
| S16 | The pilot runs both modes: autonomous loop, the gate2 as its report, attended order, QA resumed on demand; full auto prose removed | 15–20 | `agents/pilot.md`, `agents/pilot-qa.md`, `scripts/test/ticket-states.test.mjs`, `scripts/test/pilot-agents.test.mjs`, `deck/items.mjs`, `hooks/lib/deck.js` (seam) | S15 | [S16](slices/S16.md) |
| S17 | A hand-off never leaves the fresh session idle (added, run 2) | 16, 18 | `deck/run.mjs`, `hooks/session-handoff.js`, `hooks/lib/deck.js` | – | [S17](slices/S17.md) |
| S18 | Blocking questions: only a blocking question stops its own ticket turning red (added, run 2) | 17 | `deck/items.mjs`, `deck/store.mjs`, `deck/server.mjs`, `deck/tools.mjs`, `deck/ui/render.mjs`, `deck/ui/deck.css`, `agents/pilot.md` | S16 | [S18](slices/S18.md) |

Run 1 is S1–S8 and run 2 is S9–S16 (L18). The deck slices run in sequence because nearly every one of them owns `deck/store.mjs` and
`deck/items.mjs`. S11 is prose only and runs beside S9–S10. Run 1 has 8 slices of about 30 minutes
each (≈4 h) and run 2 has 8 (≈4 h). Both are inside the one-run bound.

## 9. Acceptance evidence

The run is accepted on the scratch deck (L2), in the order a user meets it:

1. Make tickets posts two tickets with estimates. Both appear green with their minutes (6, 12).
2. The session takes one ticket. The tab turns green and the row is marked live (4, 5, 13).
3. The second ticket merges into the live one, which is marked "merged into" (11).
4. Gate 1 is signed. The ticket turns yellow, its plan and Gate 1 estimate show, and `GET /api/record?ticket=` returns its record (1, 7, 8, 14).
5. The ticket is parked and the next green ticket is taken in the same session. The first ticket waits in yellow (9).
6. The mode is switched to autonomous. Two yellow tickets reach red with no reply, each run in a cleared session, and a stashed question waits on one of them (15, 16, 17).
7. Back on the deck, the Tickets tab opens on the first red ticket; its previews are its queued questions and its `gate2`, whose body lists what the run assumed and where it hiccupped (20).
8. Back in attended mode, the red ticket comes first. Its question is answered. Sign off was refused while the question was open; now the gate signs, the closing report is posted and that closes the ticket; the tab's colour goes (1, 3, 4, 17, 18).
9. A reply on the other red ticket's walkthrough is answered by a resumed QA agent (19).
10. A gate with no `ticket` is refused. No small badge or `start` action remains (2, 10).
11. `npm test` is green.

## 10. Status

| Slice | State | Branch | PR | Worktree | Blocker | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 1, 2 |
| S2 | planned | | | | S1 | 10 |
| S3 | planned | | | | S2 | 1, 2, 3 |
| S4 | planned | | | | S3 | 4, 9 |
| S5 | planned | | | | S4 | 13 |
| S6 | planned | | | | S5 | 6 |
| S7 | planned | | | | S6 | 7, 8 |
| S8 | planned | | | | S7 | 14 |
| S9 | integrated (PR #271, 8582f4e) | `slice/ticket-states-s9` | `pilot-ticket-states-s9` | 271 | run 1 | 11 |
| S10 | integrated (PR #272) | `slice/ticket-states-s10` | `pilot-ticket-states-s10` | 272 | S9 | 4, 5, 9, 10, 11 |
| S11 | integrated (PR #274, 4f14180) | `slice/ticket-states-s11` | `pilot-ticket-states-s11` | 274 | S9 | 10, 12 |
| S12 | integrated (PR #275, 5e7115b) | `slice/ticket-states-s12` | `pilot-ticket-states-s12` | 275 | S11 | 15 |
| S13 | integrated (PR #276, 42a51bb) | `slice/ticket-states-s13` | `pilot-ticket-states-s13` | 276 | S12 | 16, 18 |
| S14 | integrated (PR #277, e746ba8) | `slice/ticket-states-s14` | `pilot-ticket-states-s14` | 277 | S13 | 17, 20 |
| S15 | integrated (PR #278, 3f9accb) | `slice/ticket-states-s15` | `pilot-ticket-states-s15` | 278 | S14 | 19 |
| S16 | integrated (PR #279, fbdca3f) | `slice/ticket-states-s16` | `pilot-ticket-states-s16` | 279 | S15 | 15, 16, 17, 18, 19, 20 |
| S17 | integrated (PR #273, 7d941af) | `slice/ticket-states-s17` | `pilot-ticket-states-s17` | 273 | – | 16, 18 |
| S18 | integrated (PR #280, 69310bc) | `slice/ticket-states-s18` | `pilot-ticket-states-s18` | 280 | S16 | 17 |
| feature | run 2 in principles review and QA (PR #270) | `feat/ticket-states` | `pilot-feat-ticket-states` | 270 | S1–S17 | 1–20 |

## 11. Friction collected in run 2 (for the closing report's "make agents cheaper here")

| Agent | What | Evidence |
|---|---|---|
| S9, S10, S12, S14, S16, S18 | The pilot's prompt-share pin sits at zero headroom, so every prose or schema change is byte-counting against unlisted pins | S10: four measure rounds; S16: five (10627 → 10336.75); S18's first cut broke `pilot-rules.test.mjs`, which brief.md did not list |
| S9, S12, S13, S14, S16 | Git Bash heredocs mangle backslashes; Python/node patch scripts fail | each slice lost 1–4 edit cycles before switching to Edit/Write |
| S9, S10, S12, S13, S15, S16, S18, QA | Scratch-deck driving needs undocumented steps: `POST /api/runs` with a long-lived pid (MSYS `$!` is rejected), `repo` on every `/api/tool` item, `{run:{id}}` reply shape, refusals as `{error}`, a yellow ticket only through a signed gate1, `qa.worktree` must be a real worktree, curl JSON with Windows paths fails | one wasted live run per slice; QA's keeper and deck died at the 30-minute background limit |
| S10 | Three tests pin the `deck_ticket` action list, the brief named one | `phase.test.mjs:193` found only by a full suite run |
| S11 | A `rules/` edit fails `install.test.mjs` until `node scripts/build-rules-ledger.mjs` is run | one failed gate |
| S17 | A claim file's mtime is when the claim was taken, not when `/clear` was typed; the wrapper and the lane logged nothing | two transcripts pulled to find the real time; fixed by S17's log |
| fundamentalist | Stryker under `node:test` runs every targeted test per mutant (19m41s); `npm run coverage` covers `deck/**` only; jscpd half-reads `.mjs` | 15-minute budget overrun |
| pilot | `pilot wait` is killed by Claude Code's 2-hour background cap (A10); explorer and QA agents that poll on a background wait re-notify the pilot every cycle | listener stopped once; QA at 195k tokens idle-polling until told to end its turn |
| pilot | A deck_read of open threads is 90–160k characters, unusable in context | listed via a saved file and node each time |

## 12. Hand-off (2026-10-02, pilot context full): the next moves, in order

1. **Fix round.** Spawn one Opus `pilot-implementer` with a fix brief on `feat/ticket-states` itself (tip 894e96b): worktree `C:/Users/Hazzard/Projects/pilot-ticket-states-fix`, branch `fix/ticket-states-r1`, merged by `pilot integrate` when its reviewers clear it. Scope: every **Kept** row of §7b plus A10 (§6). Anchors: F1 `deck/items.mjs:703-714`, `hooks/lib/deck.js:245-258`, `hooks/stop-gate.js:133-135`; F2 `deck/run.mjs:229-252` vs `hooks/lib/deck.js:523-541`; F3 `deck/server.mjs:920-937, 956-962`; F4 `agents/pilot.md:349`; F5 `deck/items.mjs:695`; F7–F8 `deck/chain.mjs:72,78`; F9 `deck/runs.mjs:313`; F10 `deck/run.mjs:453-454`; N1 `store.mjs:314`; N7 `runs.mjs:329`; QA-F1 `deck/store.mjs:819` vs `725-731`; QA-F3 `hooks/session-handoff.js` `nextRunNotice`; QA-D1/D2 `deck/ui/render.mjs` Tickets panel. S18 has since reworked `nextTicketOf` and `awaitsUser`'s callers: re-anchor against 894e96b. Small-diff limit 250 (mostly removals and tests); reviewers `pilot:typescript-reviewer` + `pilot:security-reviewer`; gate per brief.md; no pin raised (pilot 10336.75, pilot-qa 5752).
2. **QA.** The old session's QA agent is gone with it. Spawn a fresh Opus `pilot-qa` on PR #270 with the fix round's tip: brief as the read-only one (scratch deck 4499, keeper pid, no logins, no migrations), its scripts and screenshots in `C:/Users/Hazzard/AppData/Local/Temp/claude/C--Users-Hazzard-projects-pilot/2e0b0246-8865-4cf4-b022-f37c713a1b31/scratchpad/qa/` (`qa.mjs`, `walk2.mjs`, `wrapper-probe.mjs`, `shot-01..07`); its read-only pass at 85c3fa2 passed every run-2 line (§7b). It re-probes S18 and the fixes, then posts the walkthrough: mode control; `deck_ticket merge`; autonomous two-ticket chain to red; plain vs blocking question and Assume the default; the Sign off refusal; the wrapper log. D3 named as deferred. It owns the thread and the branch from then.
3. **Gate 2** (`gate2` with `pr` #270, `sha`, `walkthrough`), then tell QA to flip #270 ready and post its summary.
4. **Closing report** (`report` item; `deck_status` `finished`): slices S9–S18 with PRs #271–#280; assumed A8–A10; §7b verdicts; friction ranked from §11; human steps: merge #270, install the release (the live deck and pilot still run 0.7.15 — nothing of this run reaches them until then), the D3 ticket. Resolve ticket itm_72fcd2a38d64. Tear down worktrees `pilot-ticket-states-s9` … `s18`, `pilot-feat-ticket-states-qa`, `pilot-ticket-states-fix`.
5. Standing: restart `pilot wait` on any exit. Queued ticket itm_1214816b3789 (slice-count estimates) is at queue position 2. Chat itm_0bfcf27836de is answered.
