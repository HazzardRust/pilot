# co-pilot-successor

Ticket `itm_8f6348630abd`, with `itm_9769b49d525b` (the co-pilot implements the graph as drawn)
merged in on `itm_9882fdc95aff`. Base `pilot@725a5bd1`.

## 1. Problem

> when the co-pilot hits the 230k limit, does it post it's own handoff or does it tell you to?
> i want it to be self sustaining, so it doesnt need the pilot in any way to hand-off back to itself essentially

Today a co-pilot past its hard mark (260,000 tokens) gets the crew agent's notice: commit `wip:`
to a slice branch it does not own, message `main`, stop. The guard posts a `crew-handoff`.
Nothing in `pilot-co-pilot.md` says what a co-pilot does at its mark, so whether its ticket
continues depends on the pilot reading a prose handoff and choosing to spawn again.

Merged in, the user on the slice-graph walkthrough (itm_b46b100bc0e5):

> i want to ensure that the execution of the slices happens in the order described in the graph. if 3 tickets sit parallel to each other on separate stems, then that means they can be built at the same time.
> i am asking for the general structure to be followed correctly, which mainly is parallelisation but also includes other things. i want to make sure that the slice implementation is both systematic and time efficient, and i need the graph to represent it so that the user knows how things are flowing.

`pilot.md` step 4 allows parallel lanes; `pilot-co-pilot.md` says "slice by slice" and leaves
the lanes to prose, so parallel stems are allowed but not ensured, and nothing makes the
graph's dots move at the moment the work does.

## 2. Spec

Lines were signed at Gate 1 (itm_9aaf713569c3). Lines 6 to 10 are the merged ticket's, renumbered. Line 1 is sharpened against the platform
(L1, pressed on itm_61d0dd538124): the respawn is one `Agent` call by the main session, made
with no user, no judgement and a brief of three ids, because a co-pilot cannot spawn its own successor (Findings F1, F2).

| # | Behaviour | Evidence |
|---|---|---|
| 1 | A co-pilot that crosses its advisory mark pauses itself: it starts nothing new, integrates every slice in flight through its gate and review, brings its rows and `next` current with `deck_status`, and hands back `paused` with no child live. | A scratch yellow run: the co-pilot's transcript shows the notice, no `Agent` call after it, the in-flight PR integrated, one `deck_status`, the `paused` table.; the main transcript between the two co-pilots shows `release`, `co-pilot` and one `Agent` call whose brief is three ids. |
| 2 | On that hand-back the main session releases the co-pilot and spawns its successor on the same ticket in the turn the hand-back wakes, with no user input. The successor's brief is the ticket id, the co-pilot's `crew-handoff` item id and the run record's location, nothing else; the successor reads the signed plan, the record and that item itself, and its first `deck_status` continues the rows. | Same run: between the two co-pilots, the main transcript holds `deck_ticket release`, `deck_ticket co-pilot`, one `Agent(pilot-co-pilot)` whose brief is those three lines, and no user turn; the graph shows no row reset. |
| 3 | The successor hands back to `main` exactly as a first co-pilot does; `pilot.md`'s Yellow section gains only the successor's three-line brief. | `git diff pilot -- agents/pilot.md` is that one clause; the pilot's budget pin moves only by its measured cost, tabled in S1's PR (L6). |
| 4 | At its advisory mark the guard posts the co-pilot's `crew-handoff` itself, naming the ticket (from the deck's `co-pilots` record), the pause reason and the record's location, and tells the co-pilot the co-pilot's words at both marks: pause, hand back `paused`, no `wip:` commit. "Handoff failed" on it still has the pilot spawn a fresh co-pilot from the plan. | Guard tests: a `pilot:pilot-co-pilot` payload at 225,000 tokens posts one item with the ticket id and gets the co-pilot text; at 260,000 no second item; a slice agent's texts and items unchanged. |
| 5 | `pilot-co-pilot.md` says what a co-pilot does at its marks in one paragraph, pinned. | A wording pin in `scripts/test/yellow-co-pilot.test.mjs`; the hand-back table pin unchanged. |
| 6 | A slice starts the moment every row it comes after is integrated, and never waits on a row no line joins it to. *L12 for a single-blocker stem.* | `deck/test/schedule.test.mjs`, graph S1 → S2 ‖ S3 → S4, S9 after S1: with S1 integrated, S2, S3, S9 startable; S4 waits on S2 and S3 only. |
| 7 | Separate stems run at once within the yellow budget; the next slice on a single stem starts from its predecessor's draft PR tip (pipeline). | Same test: 3 slots start S2, S3, S9; 2 slots start two and hold one; S4 starts only when a slot and its blockers are free. |
| 8 | The start order is the graph's `after` lists, never the status table's row order. | A fixture listing S9 last still starts S9 beside S2. |
| 9 | Every move shows on the graph as it happens: a dot to `implementing` at its implementer's spawn, to `draft PR #n`, to `integrated` on merge; the fix round's and QA's rows the same. | Pins on the co-pilot's `deck_status` moments; in QA, a real yellow run's graph read against its PRs' timestamps. |
| 10 | The co-pilot's definition says 6 to 9 in one paragraph, pinned. | A wording pin in `scripts/test/yellow-co-pilot.test.mjs`. |

Not meant: a co-pilot with no notice pausing on a guess of its own size; a successor that
resumes the predecessor's live children (there are none: line 1 drains them); the pilot's own
step 4 outside a co-pilot (it keeps its prose rule).

## 3. Findings

| ID | Where | What exists | What it means here |
|---|---|---|---|
| F1 | code.claude.com/docs/en/sub-agents | "up to three layers below the main conversation. At the depth limit, Claude Code withholds the `Agent` tool". `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`. | Path (a): a successor spawned by the co-pilot sits at depth 2, its implementer at 3 with no `Agent`, so no reviewer; a second successor spawns nothing. Raising the env var grows by one per hand-off. |
| F2 | same page | "In interactive session… a subagent that launches background subagents waits for their results before it finishes." | Under path (a) the predecessor stays live at 260k+ until its successor finishes, and is resumed by the successor's result. Under every path a co-pilot with a live child cannot finish, so it must drain first. |
| F3 | same page; harness note | "A background subagent's results reach Claude as a completion notification"; a notification fires "each time this agent stops with no live background children". | The main session is woken by the hand-back itself; the pilot being idle costs nothing. |
| F4 | `docs/adr/0088`, `docs/design/yellow-agent` L1 | The second-session sub-deck (`pilot run --sub`) was removed for a subagent co-pilot. | Path (b), a headless co-pilot from `deck/run.mjs`, re-opens that reversal; its hand-back could reach the pilot only by cross-session message. |
| F5 | docs/en/hooks | No hook can call `Agent`; `SubagentStop`'s `additionalContext` continues the stopping agent's conversation. | Path (c), a hook-injected respawn, adds nothing the hand-back does not already carry. |
| F6 | `agents/pilot.md` Yellow | "With no live co-pilot of yours, `deck_ticket co-pilot` the yellow head; unrefused, spawn `pilot-co-pilot`… `release` a stopped or `paused` one." | Already the successor rule: a released `paused` co-pilot leaves the ticket the yellow head with no live co-pilot. |
| F7 | `agents/pilot-co-pilot.md` Hand-back; ADR 0089 | `paused` exists: integrate the slice in flight, rows current, start nothing, hand back; ticket stays yellow. | The self-pause is that path with the notice as its trigger. |
| F8 | `hooks/context-size-guard.js:303-307, 395-414, 547-570` | One crew text for every subagent ("Commit what you have to your slice branch… message `main`"); `whatComesNext` "stash and hand off"; `announce` body "brief a fresh agent from there". `agent_type` is in the payload (`safeAgentType`). | The guard branches on `pilot:pilot-co-pilot` for its texts and the item body. |
| F9 | `scripts/test/measure-prompt.test.mjs:127` | Only the pilot, explorer and QA have own-share budgets; the co-pilot has none. | Spec 5's "within budget" has no pin to meet; no new budget is set (the pins are the user's). |
| F11 | `deck/status.mjs:60, 326-330, 432-452` | Rows carry `after` as a list (`blockersOf`); `phaseOf` maps a state's first word to planned/doing/done (`implementing`, `draft`, `fixing`, `in` are doing; `integrated`, `ready`, `merged` done). | The scheduler reads the same rows and the same phases the graph draws, so the order and the picture cannot disagree. |
| F12 | `deck/server.mjs:1516`; `bin/pilot.mjs:202` | `GET /api/record?ticket=` serves a ticket's record; `pilot budget` is the CLI precedent beside it. No scheduler exists (`grep startable`, `pilot ready`: nothing). | A `pilot ready` command reads the record the way `pilot budget` reads its split. |
| F13 | `agents/pilot.md:359-375` | Step 4: "Sequential along the DAG is the default"; pipeline and parallel lanes are relaxations "allowed without asking". | The co-pilot's difference turns the relaxations into the rule; `pilot.md` stays untouched (spec 3). |
| F14 | `deck/server.mjs:1516-1527`; `deck/run.mjs:439-445` | `GET /api/record?ticket=` returns the ticket's record and its plan; `?repo=` returns `co-pilot: { ticket, live, at }`. | The guard learns the co-pilot's ticket from `?repo=`; the successor reads plan and record from `?ticket=`. |
| F10 | `agents/pilot-implementer.md:147`, `pilot-qa.md:25` | A co-pilot's child addresses the hello's `from` and never falls back to `main`. | A successor could not take over a live child without re-greeting it; draining (spec 1) avoids that. |

## 4. Ubiquitous language

- **Mark**: the guard's advisory (225,000) or hard (260,000) token count.
- **Self-pause**: a co-pilot's own `paused` hand-back, triggered by its advisory notice.
- **Successor**: the co-pilot the main session spawns on the same ticket after a self-pause.
- **Drained**: no child of the co-pilot live; every slice it started integrated or recorded.
- **Hand-back**: the co-pilot's one table to `main`, unchanged in shape.
- **Startable**: a planned slice whose blockers allow a start now (spec 6, L12), in graph order.
- **Slot**: one agent the yellow budget still allows, counted by the co-pilot.

## 5. Locked decisions

| ID | Decision | Rationale | Rejected |
|---|---|---|---|
| L1 | The successor is spawned by the main session, woken by the hand-back's notification, with a brief of three ids: the ticket, the `crew-handoff` item, the record's location. The co-pilot's hand-off is its last `deck_status` (rows and `next`) plus the guard's item; the successor reads the plan, the record and the item itself. The user, on itm_61d0dd538124: "why cant the co-pilot just post it's handoff to the deck and then the main agent only needs to spawn the co-pilot, no need to hold the brief". | The only path that keeps the depth budget (F1), lets the predecessor finish (F2) and keeps one session (F4); the main session holds no brief and makes no judgement. | (a) self-spawn: depth and the predecessor kept live. (b) headless co-pilot: reverses ADR 0088. (c) hook respawn: no hook can spawn (F5). Main writing the full brief from the plan: the user's objection. |
| L2 | The co-pilot hands back `paused` for its own pause; no new outcome. | `pilot.md` already releases on it (F6); only the successor's brief is new (spec 3). | A new `handed off` outcome: a pilot.md clause paid from a budget at its pin, for no different action. |
| L3 | The trigger is the advisory notice, not the hard one. **Amended by QA F3** (itm_a26a3ef9763c): a co-pilot never ends a turn with a child live; it waits on each with `TaskOutput` or `Monitor`, each wait bounded, and stops (`TaskStop`) a child silent for 90 minutes in all (A5), writes its row's real state, names it a blocked step in the hand-back and carries on. | A co-pilot cannot finish with a live child (F2); draining needs the 35,000 tokens between the marks. | Hard mark only: a slice in flight would push it far past 260,000 before it could stop. |
| L4 | The guard branches on `agent_type === 'pilot:pilot-co-pilot'` for its advisory, hard and item texts. | The co-pilot owns no slice branch; the slice text is an instruction it cannot follow (F8). | Leaving the text generic: the gap the user hit. |
| L5 | ADR 0107 "A co-pilot pauses itself at its advisory mark" records L1 to L3. | Structural; the rejected paths are what a later reader would retry. | No ADR. |
| L6 | Tickets on one surface are merged; a prompt pin may move when a merged run needs the text. The user, on itm_9882fdc95aff: "if we need to move the prompt budget we can - it's just to keep the prompt from running off into the distance. i want there to be more bias to merge tickets together - it is more efficient." | The user's standing bias. | The architect's "merging doubles the run" (withdrawn). |
| L7 | QA environment (was A3, answered on itm_83a2a730bf1a with the default): the guard by payload replay; the respawn live on a scratch repository's yellow ticket, the co-pilot briefed to act on a forged advisory line. No test-only mark override. **Amended on itm_02ef49618243**, the user's word "Walkthrough (option b)": the live respawn (§9 steps 3-6) is evidenced by the user's Gate 2 walkthrough, run by them on a scratch repository under `pilot run`, not by QA; QA probes everything else itself. | Cheap and covers each hop once. | A real co-pilot driven to 225,000 tokens. |
| L8 | Scheduling is code: `deck/schedule.mjs`'s `startable` over the record's rows, behind `pilot ready`; the co-pilot runs it after every spawn and every integration and starts what it prints. | The spec's evidence is a scheduling test, and a prose rule cannot be one; one function serves the test and the co-pilot. | A paragraph alone (untestable); the deck pushing starts (the co-pilot owns spawns). |
| L9 | The co-pilot passes `--slots`: its yellow budget less every live agent, itself and reviewers included. | Only the co-pilot sees its live children; the record does not. | The CLI counting `doing` rows (misses reviewers and QA). |
| L11 | Grilling depth for this run: forks (itm_cfbefb76532e). Every branch with two defensible answers is a question; the rest take their default. | The user's answer. | Deeper grilling. |
| L12 | A slice with exactly one blocker starts once that blocker has a draft PR, branched from its tip (the pipeline); a join (two or more blockers) waits for all of them integrated. Answered with the default on itm_3987773a595e. | Reconciles spec 6's "never before integrated" with spec 7's pipeline; a join stacked on unmerged PRs breeds conflicts. | Pipelining joins too; integrated-only for every slice. |
| L10 | ADR 0108 "The co-pilot starts slices from the graph" records L8, L9 and L12. | Structural. | No ADR. |

## 6. Assumed decisions (awaiting the user)

| ID | Default taken | Tradeoff |
|---|---|---|
| ~~A1~~ | Locked into L1: pressed on itm_61d0dd538124 (main session, one `Agent` call, no user turn, the ids-only brief). | – |
| A2 | A co-pilot that crosses the hard mark still undrained keeps waiting on its children and does nothing else; it never stops a child. | A stopped implementer loses its slice in flight; waiting costs the co-pilot tokens past 260,000 on reports only. |
| ~~A3~~ | Locked as L7. QA: the guard's texts by replaying a `pilot:pilot-co-pilot` payload through `hooks/context-size-guard.js`; the respawn live on a scratch repository's two-slice yellow ticket, the co-pilot's brief telling it to act on a forged advisory line after S1. No test-only mark override is added. | Driving a real co-pilot to 225,000 tokens costs a long run; a forged notice exercises every step after it but not the guard-to-co-pilot delivery, which the replay covers. |
| ~~A4~~ | Locked as L12 (itm_3987773a595e). | – |
| A5 | A child that has reported nothing to its co-pilot for 90 minutes in all is stopped (L3 amended; replaces A2's "never stops a child"). The user, on itm_a26a3ef9763c: "i dont want any user interaction, and also the co-pilot can wait on it's child to finish, just set some limitations on how long it can keep going for." The 90 minutes is the pilot's default. | Shorter stops a slow slice in flight and loses its work; longer leaves a hung child holding a yellow slot. |

## 7. Out of scope

- A headless or second-session co-pilot; raising `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`.
- Changing the marks, the pilot's own hand-off, `deck/run.mjs` or the chain hand-off hold.
- A prompt budget for the co-pilot (F9).
- The pilot's own step 4 outside a co-pilot; the architect's cut for width (itm_70316ba6afe7).

## 8. Slices

Width 3 (S1, S2, S3 at once), longest stem 2 (S1 or S3, then S4). S4 waits on S1 for
`agents/pilot-co-pilot.md`, `scripts/test/yellow-co-pilot.test.mjs` and `docs/adr/README.md`
(files shared), and on S3 for `pilot ready` (seam). S2 shares nothing.

| Slice | Title | Spec | Files owned | After | File |
|---|---|---|---|---|---|
| S1 | A co-pilot pauses itself at its advisory notice and its successor is spawned (walking skeleton) | 1, 2, 3, 5 | `agents/pilot-co-pilot.md`, `agents/pilot.md` (Yellow: the successor's brief), `scripts/test/measure-prompt.test.mjs` (the pilot pin, if it moves), `scripts/test/yellow-co-pilot.test.mjs`, `docs/adr/0107-a-co-pilot-pauses-itself-at-its-advisory-mark.md` (new), `docs/adr/README.md` | – | [S1](slices/S1.md) |
| S2 | The guard tells a co-pilot the co-pilot's words at both marks | 4 | `hooks/context-size-guard.js`, `hooks/test/context-size.test.js` | – | [S2](slices/S2.md) |
| S3 | `pilot ready` prints the slices the graph lets start now | 6, 7, 8 | `deck/schedule.mjs` (new), `deck/test/schedule.test.mjs` (new), `bin/pilot.mjs` | – | [S3](slices/S3.md) |
| S4 | The co-pilot starts what `pilot ready` prints and moves each dot as it happens | 7, 9, 10 | `agents/pilot-co-pilot.md`, `scripts/test/yellow-co-pilot.test.mjs`, `docs/adr/0108-the-co-pilot-starts-slices-from-the-graph.md` (new), `docs/adr/README.md` | S1, S3 | [S4](slices/S4.md) |

## 9. Acceptance evidence

1. Replay: `node` the guard with a `pilot:pilot-co-pilot` payload at 225,000 and 260,000
   tokens; the texts name the self-pause and `paused`, and a `pilot:pilot-implementer`
   payload still gets the `wip:` text (spec 4).
2. `pilot ready --ticket <scratch ticket> --slots 3` on a scratch record S1 → S2 ‖ S3 → S4, S9
   after S1, S1 integrated: prints S2, S3, S9; `--slots 2` prints two (spec 6, 7, 8).
3. Scratch repository, that graph as a yellow ticket, pilot under `pilot run`: the co-pilot
   starts S2, S3 and S9 together after S1, and the graph's dots turn as each implementer
   spawns and each PR merges, read against the PRs' timestamps (spec 7, 9).
4. After S1 integrates, QA replays the guard with a co-pilot payload for the scratch
   directory, which posts the `crew-handoff`; the co-pilot, briefed to, acts on a forged advisory line, drains and hands back
   `paused` with nothing live (spec 1).
5. The main session's next turn, untouched by the user: `release`, `co-pilot`, one spawn;
   the successor's first `deck_status` continues the rows, the graph unbroken (spec 2).
6. The successor's hand-back reaches `main` and the ticket goes red as any other (spec 3).
7. `git diff pilot -- agents/pilot.md` is the successor-brief clause alone; `npm test` green (spec 3, 5, 10).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | feat/co-pilot-successor-s1 | – | – | – | 1, 2, 3, 5 |
| S2 | planned | feat/co-pilot-successor-s2 | – | – | – | 4 |
| S3 | planned | feat/co-pilot-successor-s3 | – | – | – | 6, 7, 8 |
| S4 | planned | feat/co-pilot-successor-s4 | – | – | S1, S3 | 7, 9, 10 |
| co-pilot-successor | planned | feat/co-pilot-successor | – | – | S1, S2, S3, S4 | 1-10 |
