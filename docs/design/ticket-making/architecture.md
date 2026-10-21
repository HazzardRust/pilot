# Ticket making: a skill for cutting work into tickets, a reorderable queue, small tickets beside a run — architecture artefact

Feature: **ticket-making** · slug `ticket-making` · integration branch `feat/ticket-making` · base `main` at `8145ba4` ·
architect branch `design/ticket-making`. Grilling depth for this run: **forks** (L1). Twelve slices, one run, at the bound (L9).

## 1. Problem

The pilot has no rule for turning a list of jobs into queued tickets. On itm_d2f9ed260436 it posted nine tickets
unconfirmed and had to withdraw them. A ticket is one run, but nothing says what is big enough to be one, what should
merge, or how long one should take. The queue's order cannot be changed from the UI or by the pilot; the only way to
reorder was to withdraw and re-store. A ticket's hand-off carries its body alone (`deck/chain.mjs:41`), so a spec line
added as a comment is lost to the session that starts it (2026-09-28: three of six queued tickets). And a job of under
an hour has to wait for a whole run of its own.

The user: "a skill for knowing how to make tickets. there should be a button in the tickets tab that lets you create a
thread with the pilot ... remember that 1 ticket = 1 run." / "reordering the queue by pressing small up and down arrows
next to them." / "reading a handoff sourced from a ticket should include the comments on the ticket." / "a single ticket
should aim for the implementation stage to be 5-7 hours in length." / "a small ticket can be ran asynchronously ...
started at any time and left at gate 2, with the gate 2 approval just sitting as an open thread whilst a larger,
unrelated ticket can be completed. a small ticket can skip gate 1 ... a small ticket should be classified as being <1 hour.
1 small ticket can sit on a deck at a time ... ensure that the terms gate 1 and gate 2 are documented." / "I like
keeping it on the deck because it can just run on a subagent ... I dont want to run it in a separate deck."

## 2. Spec

| # | Behaviour | Evidence |
|---|---|---|
| 1 | The Tickets tab has a **Make tickets** button that opens a new thread with the pilot. | Pressing it lands on a new `user` thread titled `Make tickets`, owned by the pilot. |
| 2 | In that thread the pilot follows `skills/ticket-making/SKILL.md`. | The file exists; `agents/pilot.md`'s skills table names it against the `Make tickets` title; the pilot answers the thread itself. |
| 3 | The pilot proposes the cut as a table and posts no ticket until the user says yes. | A list typed into the thread gets a table and zero new `ticket` items; they appear only after the yes. |
| 4 | One ticket is one run. Small jobs on the same surface and files merge; feature-sized work stands alone; work that starts with third-party code or a credential stands alone. | The skill states each rule; itm_d2f9ed260436 is its worked example. |
| 5 | A ticket's body quotes the user's words, then spec lines with their evidence. | Every ticket posted through the skill has both, in that order. |
| 6 | The proposal names where each new ticket sits in the queue, and the user confirms it. | A position column; after the yes the Tickets tab shows the agreed order. |
| 7 | Each queued ticket on the Tickets tab has small up and down arrows that move it one place among that repository's queued tickets. | Press up: it sits above its neighbour, still after a reload, and the next chain takes the new head. The head has no up, the tail no down. |
| 8 | The pilot moves a ticket through the same mechanism. | `deck_ticket` with `up` reorders an open Tickets tab without a reload. |
| 9 | A hand-off chained from a ticket carries the ticket's comments, in order, labelled by who said them, after its body. | `deck/test/chain.test.mjs`: two comments in order; none gives a byte-identical body; deck markers left out. |
| 10 | A ticket is sized so its implementation stage takes 5 to 7 hours; a job under the band merges with a neighbour on the same surface, else stands alone. | The skill states the target once; each proposal row has an estimate, and one outside 5–7 h says why. |
| 11 | A standalone job estimated under 1 hour is proposed and posted as a **small ticket**, marked on the tab and never taken by the chain as a run. | The item carries `size: 'small'`; the tab shows `small`; `next` marks the first regular ticket. |
| 12 | A small ticket becomes regular when added spec lines take its estimate past 1 hour. | `deck_ticket` with `regular` drops the badge and the chain may take it. |
| 13 | The pilot hands a small ticket to one Opus implementer as a side job on this deck while a larger run carries on; no second deck, no run record of its own. | The ticket shows `started`; the run's record and slice table are unchanged; a draft PR against `main` appears. |
| 14 | A small ticket skips Gate 1; after a `pilot-qa` pass, its Gate 2 is QA's `walkthrough` with Sign off on this deck, naming the ticket, which sits open while the larger run proceeds. | Reopening the deck shows that walkthrough; the run's own `spec` and `signoff` post over it. |
| 15 | One small ticket is in flight per deck: starting another while one is started and its Gate 2 walkthrough not resolved is refused. | `deck_ticket start` names the ticket in flight and changes nothing. |
| 16 | Resolving a small ticket's Gate 2 walkthrough closes the ticket and frees the slot. | The ticket leaves the tab; the next small ticket starts. |
| 17 | Gate 1 and Gate 2 are defined once, with the small-ticket exception to Gate 1, and every place that states the gates agrees. | `rules/vertical-execution.md` "The two human gates" defines both; `rules/orchestration.md`, `agents/pilot.md`, `README.md` carry the exception; pins green. |
| 18 | The architect cuts runs against the same 5–7 h target, stated in the skill, and a 12-slice bound, 14 with slices added mid-run. | `agents/pilot-architect.md` says 12 and 14 and points at the skill's Size section; `run-split.test.mjs` pins it. |
| 19 | A finding whose fix exceeds the small-diff limit is built as an added slice and named at Gate 2 instead of asked, within its rails: its own PR and reviewer, at most 2 a run and never past 14 slices, tracing to an agreed spec line and moving no locked decision, within the per-slice diff limit. | `agents/pilot.md` states the rule and each rail; QA's walkthrough names each added slice as built. |
| 20 | A small ticket's grilling happens in the ticket-making thread before it is posted, on forks only, and stands in for Gate 1; its body records the answers and what was assumed; a small ticket reclassified as regular gets Gate 1 as any run does. | A small ticket's body has an "Answered before posting" section; no small ticket is posted while a question about it is open. |
| 21 | A session started by `pilot run` carries `CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1`, so Claude Code does not stop the listener when memory is short; and when a listener is stopped anyway, the pilot says so in the chat and restarts it on the user's word. | The spawn's env holds the variable in a test; the pilot's definition states the rule; a chat line appears when it happens. |

The spec is final: lines 1–8 as put to the user; 9–21 locked by the user's answers. Implied lines folded in: head/tail
arrows (7), queue per repository (7). Under full auto a small ticket passes no human gate: full auto answers its Gate 2
like any other walkthrough, and that is the user's decision (itm_0401f2ce47e2).

## 3. Findings

- **Queue order is array order.** `postItem` appends (`deck/store.mjs:553`); `listItems` is oldest first (`:835`);
  the chain takes the first open ticket of the repo (`deck/chain.mjs:37`); the tab lists `ticketsOf` unsorted with index 0
  `next` (`deck/ui/render.mjs:1157-1159`, `:1195-1197`). `queueOf` is already taken (`deck/status.mjs:486`, the
  overview queue), so the ticket queue needs another name.
- **Page writes** are forms to routes guarded by `fromOwnPage` (`deck/server.mjs:813`) that call `announceChange()`;
  the page patches `[data-live]` regions over SSE (`deck/ui/js/live.mjs:329`); the tickets panel is `data-live="tickets"`
  (`deck/ui/strips.html:81`). Create is `POST /create` → `createThread` (`store.mjs:1158`), kind `user`, always the
  pilot's (`items.mjs:400`); `deck_wait` replies carry the thread `title` (`store.mjs:866`).
- **Item fields**: a ticket takes only `slice`, `repo`, `dir` (`items.mjs:294`); any other field is refused
  (`store.mjs:435-447`), so size and a walkthrough's ticket link are new fields. Full auto answers every kind in `KINDS`
  but `audit` (`store.mjs:547`), a `walkthrough` included. `GATED_KINDS` is spec and signoff (`items.mjs:90`): only an
  open `question` blocks them, so an open small-ticket walkthrough blocks nothing of the larger run.
- **Stop hook**: an open item the session itself posted, last word the pilot's, holds the turn up to nine minutes,
  once per item per session (`hooks/stop-gate.js:132-137`, `:277-289`). A small ticket's walkthrough is QA's post and
  holds nothing more than a feature's Gate 2 walkthrough does.
- **Deck tools**: six (`deck/tools.mjs:136-355`), dispatched by `callTool` (`server.mjs:625-734`); `WRITING_TOOLS`
  announces (`:742`); `DECK_TOOLS` pins the pilot's six (`scripts/test/pilot-agents.test.mjs:54`). A new tool reaches
  a pilot session only after it restarts.
- **Comments** are `item.replies` (`store.mjs:635`, `:659`); reopening adds markers (`store.mjs:743-756`, constants
  `items.mjs:152-173`). `hooks/session-handoff.js` passes the hand-off `body` and never reads `replies`.
- **Run records**: `recordFor` reads the newest record for a repo (`store.mjs:1293`); a side job must not write one.
- **Gate text and its pins**: `rules/vertical-execution.md:127-139`, `rules/orchestration.md:49-60`,
  `agents/pilot.md:286-303`, `README.md:72` ("Your part", exactly three bullets); pinned at
  `scripts/test/pilot-agents.test.mjs:913-926` and `scripts/test/install.test.mjs:961`. `scripts/install-rules.mjs:13`
  never overwrites a file already in `~/.claude/rules/`, so the user's loaded copies do not change on update.
- **Run bound**: `agents/pilot-architect.md:88` ("Over 6 slices"), pinned by `scripts/test/run-split.test.mjs:28-31`.
- **Pilot prompt budget** (corrected by L18): the pilot's own share is 7958 tokens against a 9800 pin (`scripts/measure-prompt.mjs`,
  `scripts/test/measure-prompt.test.mjs:105-111`); every slice that edits `agents/pilot.md` spends from ~1840.
- **Run time**: nothing records the implementation stage; the deck holds both moments (Gate 1 `signoff.resolvedAt`,
  Gate 2 `walkthrough.postedAt`). Measured: architect-depth 1h22, run-chaining v1 (4 slices) 1h43, run-analytics (4)
  1h52, housekeeping-audit (7) 2h22, thread-ownership (6) 2h32, run-chaining v2 (6) 3h24, usage-telemetry (8) 4h25:
  about 30 min a slice.
- **Gates**: `npm test` (`node --test`, all of `deck/test`, `scripts/test`, `hooks/test`);
  `node scripts/check-references.mjs`; `node scripts/check-provenance.mjs`. No typecheck or build (plain ESM).
  Deck tests use `tempDeck` and `deckOnAPort` (`deck/testUtils.mjs`); prompt files are pinned by text.

## 4. Ubiquitous language

- **Gate 1**: the user approving the design (the architecture artefact and its slices) before implementation. A small
  ticket has none; its grilling before it is posted stands in for it.
- **Gate 2**: the user working the procedure on the finished work, where it runs, and signing off before its PR
  leaves draft. Every ticket has one.
- **Queue**: a repository's open, unstarted tickets in deck order; its first regular ticket is the **head** the chain takes.
- **Move**: swapping a queued ticket with its neighbour, one place up or down; the only way order changes.
- **Small ticket**: a ticket estimated under 1 hour, carrying `size: 'small'`; run as a **side job**, never as a run.
- **In flight**: a small ticket started and its Gate 2 walkthrough not yet resolved; at most one per repository.
- **Comment**: any message in a ticket's `replies` except a deck marker, labelled by who said it.

## 5. Locked decisions

- **L1 Grilling depth is forks** (user, itm_552a8e7c3afd).
- **L2 A move swaps the ticket with its nearest queued same-repo ticket in `deck.items`.** Chain, tab and badge already
  read array order. Rejected: a `rank` field every reader sorts by (three readers and a backfill). ADR 0047 in S1.
- **L3 One store function per write, every caller through it.** `moveTicket`, `setTicketSize`, `startTicket` in
  `deck/store.mjs`; the page route and the pilot's tool both call them; `ticketQueueOf` in `deck/items.mjs` is the one
  queue predicate. Rejected: a tool that posts to the HTTP route.
- **L4 Comments are appended to the hand-off body at chain time** (user, itm_c2e540086198), in order, labelled,
  markers left out, none unchanged byte for byte. Rejected: telling the session to read the thread (needs `hooks/`).
- **L5 Line 6 is post-then-move.** Confirmed tickets are posted and moved into place. Rejected: a position on `deck_post`.
- **L6 The pilot answers a `Make tickets` thread itself**, not through an explorer (`agents/pilot.md:61-62`).
- **L7 Under the band, merge with a neighbour on the same surface, else stand alone; under 1 hour standing alone is a
  small ticket, and added spec lines past 1 hour make it regular** (user). Rejected: forcing every job to 5 h.
  **Amended at Gate 2, 2026-09-29** (user, on the walkthrough itm_028503e03932, seq 464, read by the pilot on the
  thread: "i want b, but let's still have a guide line that keeps, the surface reasonable."):
  under the band, merge with neighbours until the ticket is inside it, same surface or not. The guideline is at most
  two surfaces, and only what one reviewer and one walkthrough can hold; "two" is QA's reading of "reasonable". Same
  surface and files stays the first preference. This amends spec lines 4 and 10, whose rows in §2 keep the wording
  agreed at Gate 1. In the skill at 1f6a54a, pin fixed at a2f0e20.
- **L8 The 5–7 h target is stated once, in the skill's Size section; the architect refers to it** (user).
- **L9 The run bound is 12 slices, 14 with slices added mid-run** (user). This feature is cut against 12.
- **L10 Small tickets run on this deck** (user): the live run's pilot hands one to one Opus implementer as a side job;
  no run record, no deck of its own, so `recordFor` is undisturbed; the deck refuses a second start while one is in
  flight. Rejected: a separate deck or a chained run.
- **L11 A small ticket gets a `pilot-qa` pass before its sign-off, the same pass a feature gets** (user,
  itm_6988f0587816). Its Gate 2 is therefore QA's `walkthrough` with Sign off, carrying `ticket`, and the one-in-flight
  check and the closing of the ticket key on that walkthrough. Rejected: the implementer's own procedure as a pilot `signoff`.
- **L12 Full auto answers a small ticket's Gate 2 like any other** (user, itm_0401f2ce47e2): under full auto a small ticket
  passes no human gate, and that is the user's decision. Rejected: exempting it.
- **L13 A big fix becomes an added slice within its rails** (user, itm_6ccf54a71a40): its own PR and reviewer; at most
  2 a run, never past 14 slices; traces to an agreed spec line and moves no locked decision; within the per-slice
  diff limit; the Gate 2 walkthrough names each as built without asking.
- **L15 A twelfth slice keeps the listener alive** (user, itm_c6aac2129194): `pilot run` sets
  `CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1` in the session's env; a listener stopped anyway is said in the chat and
  restarted on the user's word.
- **L14 A small ticket is grilled before it is posted, in place of Gate 1** (user, itm_388123601a79): in the ticket-making
  thread, forks only; its body records the answers and what was assumed; reclassified regular, it gets Gate 1.
- **L16 QA runs against a scratch deck from the feature's worktree** (user, itm_2e7f3eee0170): started from
  `feat/ticket-making` on its own port with its own empty store, tickets seeded, the Tickets tab driven in a browser, and a
  fresh session against that deck for the pilot's side. The user's deck on 4321 and its queue are never touched. No
  migrations, no database. Rejected: installing over the running plugin and trying it on the real queue.
- **L17 The spec is lines 1–21 as posted, agreed without edits** (user, itm_6bfbd3d0e5b6).
- **L18 The pilot's prompt pin is raised from 9800 to 10400 tokens** (user, itm_c6045fbc9d19, after Gate 1). §3's
  "~1840" counted `agents/pilot.md` alone; the pin also counts the deck tool schemas, so the room was 334, and 237
  after S2 (9563) against 730 budgeted by S7, S8, S10, S11 and S12. It costs about 600 tokens of every pilot session
  until the queued ticket "Crew voice and shipped rules" prunes it back. Rejected: an added slice trimming
  `agents/pilot.md` mid-run; shrinking the remaining budgets to fit 237.
- **L19 QA's prompt pin is raised from 5500 to 5600 tokens** (user, itm_bf1d822b9e0a, after Gate 1). `pilot-qa` is
  granted `deck_post`, so S5's `size` and S6's `ticket` fields count against its pin, which stood at 5498 before S5.
  S5 fitted only by trimming `deck_post`'s description; that wording is restored with this decision (QA 5505 after
  it). It costs up to 100 tokens of every QA session. Rejected: trimming tool descriptions further; trimming
  `agents/pilot-qa.md`.

## 6. Assumed decisions awaiting the user

- **A1 Estimate** = slices × ~30 min, re-measured from `signoff.resolvedAt` to `walkthrough.postedAt`; no analytics change.
- **A2 Adding to an existing ticket comments rather than edits its body**, since comments travel (L4).
- **A3 Deck polish is not merged in**; the user placed it as its own ticket.
- **A4 One pilot tool `deck_ticket { id, action: 'up' | 'down' | 'small' | 'regular' | 'start' }`** carries every
  queue write, on the store functions of L3. Rejected: `deck_move` plus a tool per action (three grants and pins).
  Cost: a pilot session sees it only after a restart, so QA's probes of 8, 12, 13 and 15 need a session started after
  the plugin update.
- **A5 The pilot's `tools:` line gains `mcp__plugin_pilot_deck__deck_ticket`**, and `DECK_TOOLS` its seventh tool. No
  crew agent gets it; `hooks/` is untouched (an unstamped call is the pilot's).
- **A6 The button is a second form on `/create` with the fixed name `Make tickets`**; no `purpose` field. Tradeoff: a
  thread named `Make tickets` by hand also gets the skill.
- **A7 In flight runs from start to the Gate 2 walkthrough resolved**, not only while it is open: one small ticket at a time.
- **A8 One QA agent is live per session**: a small ticket's QA waits while the larger run's QA is live, and the reverse
  (the coordinator's default). Rejected: two QA agents on one deck at once.
- **A9 The side job branches from `main` and opens a draft PR against `main`**; QA flips it to ready after the
  user's Sign off, as for a feature PR.
- **A10 A started small ticket stays on the tab marked `started`, with no arrows**, until its Gate 2 walkthrough closes it.
- **A12 "No small ticket posted over an open question about it" is the skill's rule, not the deck's**: the deck
  cannot tell which question is about which job, and refusing on any open question would hold small tickets behind the
  larger run's grilling. Rejected: adding small tickets to `GATED_KINDS`.
- **A13 The install writes no `env` into `~/.claude/settings.json`**; a session not started by `pilot run` is not
  covered, and the README says how to set the variable by hand (coordinator's default).
- **A14 `startPlain` sets the variable too**: it is the same `pilot run` without a pty, and line 21 covers any
  session `pilot run` starts. Rejected: the pty path only (the fallback would lose the listener under pressure).
- **A11 The user's installed rules get the exception by hand**: the closing report carries a step to copy the
  plugin's `rules/vertical-execution.md` and `rules/orchestration.md` over `~/.claude/rules/`. Rejected: changing
  `scripts/install-rules.mjs` (outside the boundary, and its never-overwrite rule is deliberate).

## 7. Out of scope

Drag-and-drop or multi-place moves; moving tickets between repositories; moving started or closed tickets; a `purpose`
field on threads; gate timestamps in `pilot analytics`; any change to `hooks/` or `scripts/install-rules.mjs`;
re-cutting tickets already queued; more than one small ticket in flight; small tickets on a deck with no live pilot.

## 8. Slices

S1 is the walking skeleton. S3 runs beside S1; S7 beside S5 and S6. S10 is kept
(L13); S11 comes after it because they share `agents/pilot.md` and `agents/pilot-qa.md`. S12 touches no file of
S1–S6 in code; it comes last only for `agents/pilot.md` and `README.md` (S7), and rebases over draft PR #189 if that
merges first.
`agents/pilot.md` is edited by S2, S7, S8, S10, S11, S12 in that order, within the ~1840-token budget.

| Slice | Delivers | Files owned | After | Detail |
|---|---|---|---|---|
| **S1 Up and down arrows move a ticket in the queue** (walking skeleton) | 7 | `deck/items.mjs`, `deck/store.mjs`, `deck/server.mjs`, `deck/ui/render.mjs`, `deck/ui/deck.css`, `deck/test/move.test.mjs` (new), `docs/adr/0047-the-ticket-queue-is-deck-order.md` (new) | – | [S1](slices/S1.md) |
| **S2 The pilot moves a ticket with `deck_ticket`** | 8 | `deck/tools.mjs`, `deck/server.mjs`, `agents/pilot.md`, `scripts/test/pilot-agents.test.mjs`, `deck/test/ticket-tool.test.mjs` (new) | S1 | [S2](slices/S2.md) |
| **S3 A chained hand-off carries the ticket's comments** | 9 | `deck/chain.mjs`, `deck/test/chain.test.mjs` | – | [S3](slices/S3.md) |
| **S4 Make tickets opens a ticket-making thread** | 1 | `deck/ui/render.mjs`, `deck/ui/deck.css`, `deck/test/make-tickets.test.mjs` (new) | S1 | [S4](slices/S4.md) |
| **S5 A small ticket is marked and the chain passes it by** | 11, 12 | `deck/items.mjs`, `deck/store.mjs`, `deck/chain.mjs`, `deck/server.mjs`, `deck/tools.mjs`, `deck/ui/render.mjs`, `deck/test/small.test.mjs` (new) | S2, S3, S4 | [S5](slices/S5.md) |
| **S6 One small ticket in flight, closed by its Gate 2** | 13 (deck), 14 (deck), 15, 16 | `deck/items.mjs`, `deck/store.mjs`, `deck/server.mjs`, `deck/tools.mjs`, `deck/ui/render.mjs`, `deck/test/small-flight.test.mjs` (new) | S5 | [S6](slices/S6.md) |
| **S7 Gate 1 and Gate 2 defined once, with the small-ticket exception** | 17, 20 (glossary) | `rules/vertical-execution.md`, `rules/orchestration.md`, `README.md`, `agents/pilot.md`, `scripts/test/pilot-agents.test.mjs`, `scripts/test/install.test.mjs` | S2 | [S7](slices/S7.md) |
| **S8 The pilot cuts tickets by the ticket-making skill** | 2, 3, 4, 5, 6, 10, 11 (pilot), 12 (pilot), 20 | `skills/ticket-making/SKILL.md` (new), `agents/pilot.md`, `scripts/test/ticket-making.test.mjs` (new) | S4, S5, S7 | [S8](slices/S8.md) |
| **S9 The architect shares the target and the 12-slice bound** | 18 | `agents/pilot-architect.md`, `scripts/test/run-split.test.mjs` | S8 | [S9](slices/S9.md) |
| **S10 A big fix becomes an added slice, named at Gate 2** | 19 | `agents/pilot.md`, `agents/pilot-qa.md`, `scripts/test/pilot-agents.test.mjs` | S9 | [S10](slices/S10.md) |
| **S11 The pilot runs a small ticket as a side job** | 13, 14 | `agents/pilot.md`, `agents/pilot-implementer.md`, `agents/pilot-qa.md`, `scripts/test/small-ticket.test.mjs` (new) | S6, S10 | [S11](slices/S11.md) |
| **S12 The listener survives memory pressure, and a stopped one is said** | 21 | `deck/run.mjs`, `deck/test/run.test.mjs`, `agents/pilot.md`, `scripts/test/pilot-agents.test.mjs`, `README.md` | S11 | [S12](slices/S12.md) |

**Estimate against the band**: 12 slices × ~30 min ≈ 6 h, inside 5–7 h, at the 12-slice bound.

## 9. Acceptance evidence, in the order the user meets it

On a preview deck from `feat/ticket-making`, a scratch repository, a `pilot run` session started after the plugin update:

1. The Tickets tab shows **Make tickets**; pressing it lands on a thread titled `Make tickets` (1).
2. Paste the nine jobs of itm_d2f9ed260436: a proposal table with estimate and position, one row marked small, its forks asked in the thread first; the
   tab gains nothing (2, 3, 4, 10, 11, 20).
3. Say yes: the tickets appear in the agreed order, bodies quoting you then spec lines; the small one shows `small`
   and `next` sits on the first regular ticket (5, 6, 8, 11).
4. Press up on the third ticket, reload: still moved; head has no up, tail no down (7). Ask the pilot to move one: the
   open tab reorders (8). Add spec lines to the small ticket and ask: it turns regular (12).
5. With a run live, the pilot starts a small ticket: it shows `started`; asking for a second is refused by name (13, 15).
6. When the side job reports, a `pilot-qa` pass runs (after the larger run's QA, if one is live), and QA's Gate 2
   walkthrough naming the small ticket appears; the larger run posts its own sign-off over it; close and reopen the deck
   and it is still there; Sign off and the small ticket leaves the tab (14, 16).
7. Comment twice on the head ticket and let the run finish cleanly: the hand-off shows both comments, labelled (9).
8. In the `pilot run` session, `echo $CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP` prints `1`; the pilot's definition says
   what it does when a listener is stopped anyway (21).
9. Read `rules/vertical-execution.md` "The two human gates" and `agents/pilot-architect.md`'s bound (17, 18); copy the
   two rules files into `~/.claude/rules/` (A11). `npm test` and `check-references` green.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Delivers |
|---|---|---|---|---|---|---|
| S1 Up and down arrows move a ticket in the queue | planned | | | | – | 7 |
| S2 The pilot moves a ticket with `deck_ticket` | planned | | | | S1 | 8 |
| S3 A chained hand-off carries the ticket's comments | planned | | | | – | 9 |
| S4 Make tickets opens a ticket-making thread | planned | | | | S1 | 1 |
| S5 A small ticket is marked and the chain passes it by | planned | | | | S2, S3, S4 | 11, 12 |
| S6 One small ticket in flight, closed by its Gate 2 | planned | | | | S5 | 13, 14, 15, 16 |
| S7 Gate 1 and Gate 2 defined once, with the small-ticket exception | planned | | | | S2 | 17, 20 |
| S8 The pilot cuts tickets by the ticket-making skill | planned | | | | S4, S5, S7 | 2, 3, 4, 5, 6, 10, 11, 12, 20 |
| S9 The architect shares the target and the 12-slice bound | planned | | | | S8 | 18 |
| S10 A big fix becomes an added slice, named at Gate 2 | planned | | | | S9 | 19 |
| S11 The pilot runs a small ticket as a side job | planned | | | | S6, S10 | 13, 14 |
| S12 The listener survives memory pressure, and a stopped one is said | planned | | | | S11 | 21 |
| feature ticket-making | planned | `feat/ticket-making` | | | S12 | 1–21 |

The live state of each row is the run record, `run.json` beside this file; this table is the plan as approved.

## 11. Held for the feature-level review and the closing report

Written by the pilot during implementation (2026-09-29), for the session that runs steps 7 to 9. None is decided;
each is a note to weigh against the diff, not a verdict.

| # | Note | From | Where |
|---|---|---|---|
| H1 | A hand-off body over `MAX_TEXT_BYTES` (64 KB) is refused by `postItem`, so a ticket whose body and comments pass it is never taken by the chain. No pin. | S3 report | `deck/chain.mjs` `handoffBody`, `deck/store.mjs` |
| H2 | No security reviewer ran on S1, which takes form input on `POST /move`. The pilot's own read found the Origin check and a same-origin redirect. | S1 report | `deck/server.mjs` |
| H3 | The skill says the user listed the nine jobs "each with a size"; the sizes were the pilot's, in its restated table. | pilot, S8 diff | `skills/ticket-making/SKILL.md`, Worked example |
| H4 | "Size" says the band is roughly 10 to 14 slices; the run bound is 12, 14 only by slices added mid-run (L9). A reader may take the band as leave to cut 14. | pilot, S8 diff | `skills/ticket-making/SKILL.md`, Size |
| H5 | Nothing un-starts a small ticket: if its QA walkthrough is never posted it stays in flight and blocks every other small ticket of that directory. | pilot, S6 diff | `deck/store.mjs` `startTicket` |
| H6 | `deck_post`'s `size` has no description, by the budget decision before L19 raised QA's pin; there is room for a short one now. | S5 reviewer | `deck/tools.mjs` |
| H7 | S7's text cites `(S11)` and S4's comments cite `(S8)`: slice numbers in shipped prose mean nothing after the run. | S7, S4 reports | `agents/pilot.md`, `deck/ui/render.mjs` |

### Gate 2 (2026-09-29)

Signed by the user on the walkthrough itm_028503e03932 at 14:04:06Z (seq 466, "Sign off"), at tip 1d6e25b, after
two requests of theirs landed: the amended merge rule (L7; 1f6a54a, a2f0e20) and arrows that move a ticket in place
with no page load (1d6e25b, 101 lines, server untouched; spec line 7's wording unchanged). They typed nothing
about steps 11 to 13, so whether the echo inside `pilot run` and the optional small-ticket session were run is not
known. Left as built: two quick presses on an arrow move a ticket two places.

### Verdicts at step 7 (pilot, 2026-09-29)

The principles review ran once on 994d7d5 (Opus): diff coverage 100% of 279 changed lines; mutation 125 of 161
killed, 77.6%, with `store.mjs`, `server.mjs` and `run.mjs` read by hand and not mutated. The kept findings landed
in PR #204, merged as c6d90f1.

| Id | Verdict | Reason |
|---|---|---|
| F1 (H1) | kept | A hand-off past 64 KB blocked the whole queue, not one ticket. Comments are added only while the body fits. The fix's own reviewer found the fallback unchecked; fixed in 6bdee86. |
| F2 | kept | "A small ticket has no Gate 1" was said twice in `agents/pilot.md`; the copy citing `(S11)` and its pin went. |
| F3 | kept, fix changed | The proposed assertion would not have killed `queued = tickets`: Apple was first either way. The fixture now puts the ticket in flight first. |
| N1 | dropped | The `CLOSED` clause in `isComment` is unreachable today, costs nothing, and guards a marker that may reach tickets. |
| N2 | kept | The `deck_ticket` row in the pilot's table repeated the tool's description and omitted `start`. |
| N3 | kept | One `queueHeadOf` in `items.mjs` for the chain and the tab. |
| N4 | kept | The move form sends `back`; `refererPath` deleted. Security reviewer: no findings. |
| N5 | kept | Two doc comments in `render.mjs` trimmed. |
| N6 | kept | Two rules stated twice in the skill; one copy of each removed. |
| N7 | kept | "also" removed from `agents/pilot-qa.md` (S11's MEDIUM finding). |
| H2 | dropped | Does not hold: `/move` checks Origin, bounds the form, and its tests cover foreign and missing origins. |
| H3, H4 | kept | The worked example names the pilot as the one who sized the jobs; "10 to 14 slices" removed. |
| H5 | kept | One sentence in `agents/pilot.md`: a started small ticket that stalls is freed by `deck_resolve`. |
| H6 | dropped | A description on `size` costs 12 of QA's 25 remaining tokens; the skill and the store's refusal say it. |
| H7 | dropped for code | The repository's code already cites slice numbers; F2 removed the one in a prompt. |
| QA N1 | kept | A posted ticket is told it starts itself "once it is the head ticket". |
| QA N2, N3 | dropped | The walkthrough card naming its ticket and larger arrows are additions of taste, left for the deck polish ticket. |

Pins after the fix round: pilot 9932 of 10400; QA measured 5574.75 of 5600 before it, one token lower after.

Assumed during S11 and S12, without the user: the pilot's rule reads "Never two QA agents live at once", because
`pilot-rules.test.mjs` rejects a "one … at a time" sentence; `CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP` was
confirmed from the Claude Code 2.1.284 bundle, its documentation does not name it.

Checks no implementer could run, which are QA's at step 8, in a session started after the plugin update: `deck_ticket`
called by a fresh pilot session (S2); the live `Make tickets` thread with the nine jobs (S8); an architect cutting a
13-slice feature into a Runs table (S9); a run following the added-slice rule (S10); a fresh pilot session running
a small ticket through to its side PR (S11); the `echo` inside a real `pilot run` (S12). The first passed headless on
QA's scratch deck (2026-09-29); the last two are steps of the user's procedure, and no agent opens a PR against
`main` for S11's.

Friction rows collected for the closing report's "make agents cheaper here":

| What | Evidence |
|---|---|
| `deck/test/usage.test.mjs`, "a reset time already behind us…", fails now and then under load | failed once for S8's implementer and once in `pilot integrate` of S6; 43 of 43 alone, three times |
| The brief's gate named `check-provenance.mjs` without its directories | bare, it prints usage and exits 2; fixed in the brief at de2bdc7 |
| The artefact budgeted prompt pins against `agents/pilot.md` alone | the pins count deck tool schemas, and QA is granted `deck_post`; two pins raised mid-run (L18, L19) |
| Two tests pin the whole deck tool list, and one assumed every `deck_post` field has a description | `deck/test/routing.test.mjs`, `deck/test/daemon.test.mjs`, `deck/test/items.test.mjs:153` |
| No written recipe for seeding a preview deck on Windows | a run needs a PID really alive (not Git Bash's `$$`), paths need forward slashes, `deck_post` through `/api/tool` needs `repo`, and the deck caches modules until restarted; four implementers each rediscovered part of it |
| A worked example cited a deck thread the artefact never copied | S8 waited on the pilot for the text of itm_d2f9ed260436 |
| A duplicate ADR number passes every check | main and S1 both took 0046; renumbered to 0047 in e67df1d |
| A new worktree has no `node_modules` | about twenty unrelated tests fail until `npm ci` |
| `measure-prompt.test.mjs` does not state its formula | own share = (definition + skills + tools) / 4, rules excluded |
| `pilot-rules.test.mjs` rejects a sentence the slice file itself prescribed | S11's full `npm test` failed on "One QA agent is live at a time" |
| `measure-prompt.mjs` prints the pinned share as two columns | S12 and the pilot each added Definition and Deck tool schemas by hand |
| Claude Code's documentation does not name the reap variable | S12's docs lookup found nothing; one search of the installed bundle settled it |
| The repository has no coverage or mutation tooling, and `.review/` is not ignored | the fundamentalist hand-rolled lcov, diff-cover and a Stryker config; its output sat untracked |
| `store.mjs` and `server.mjs` cannot be mutated | the queue's move, start and size logic got a manual read only; pure functions could live in `items.mjs` |
| A long PR body in a heredoc fails in Git Bash | the fix round lost a round-trip; `gh pr edit --body-file` worked |
| The pilot's fix brief misquoted where a sentence ends (H4) | the implementer followed the quoted deletion, which was right |

Worktrees left on disk by this run, all clean as last checked: `pilot-ticket-making-s1` to `-s12`,
`pilot-ticket-making-merge-main`, `pilot-ticket-making-fixes` and QA's `pilot-ticket-making-qa`.
