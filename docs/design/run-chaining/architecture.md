# Run chaining (v2): stored tickets and a self-clearing hand-off — architecture artefact

Feature: **run-chaining** · slug `run-chaining` · integration branch `feat/run-chaining-v2` · base `main` at
`9fb00e0` · architect branch `design/run-chaining-v2`. Supersedes the v1 design rejected at Gate 2 (PR #125,
closed unmerged; `feat/run-chaining` kept at `82458e8` for salvage). Every slice is implemented and fixed on
**Opus** (brief constraint).

## 1. Problem

The user, rejecting v1 at Gate 2: "I dont want any headless sessions, i just want it stored as a ticket, so when the
pilot post's it's final report, it creates a handoff to start the next ticket and /clears." The acute case: a spec is
worked until it is too big for one run. The pilot should then say so on a fresh thread, with the split into runs
(slices, each carrying spec lines), and ask whether the runs go in sequence on this deck or in parallel on separate
decks. The user is not asked when the work clearly fits one run. At the end of each run, the next run starts itself
in the same deck: "this mimics my exact workflow, just with the step of starting a new run being autonomously
decided." Closing reports get a section of their own and stay open as threads. Standing words from the same day:
"one run per deck, in succession; parallel only on separate decks"; "if a ticket is mine, put it on the deck".

## 2. Spec

| # | Behaviour | Evidence |
|---|---|---|
| 1 | When the architect's DAG is over the **one-run bound** *(A3)*, the pilot posts one `question` on a fresh thread. It gives the **split** (run 1..k, each run's slices, each slice's spec lines) and three answers: one run anyway / in sequence on this deck / in parallel on separate decks, **in sequence on this deck recommended** (L12: one deck is the simple path for a fresh user). Within the bound, nothing is asked | the thread; a ≤ 6-slice run shows no such item (S4's pin) |
| 2 | Runs 2..k, and any later agreed work, are stored as **tickets** on this directory's deck, oldest first, each with its spec text. The tab lists them read-only under **Tickets** in the left-side section group, in that group's own schema, never the right strip (L13). There is no editing UI and no ceiling. They survive a daemon restart | the tab; `deck.json` after a restart |
| 3 | **Chain step.** When a run's record turns `finished: "closing report posted"` and a ticket is open, the daemon posts a **chain hand-off** for the head ticket. `pilot run` types `/clear` and the first prompt. The SessionStart lane hands the fresh session the ticket's spec, with no old record, and marks the ticket taken. The session starts the run from it: nothing pasted, no new yes, no headless session. A later run of a split ticket starts at step 4 with its slices *(A4)* | live in a `pilot run` terminal: the screen clears itself, and the next first turn restates the ticket's spec; one `claude` process throughout |
| 4 | *(implied)* Without `pilot run`, the chain hand-off waits for the user's own `/clear`: no hook or tool can clear a session (`deck/run.mjs:1-16`) | the hand-off item sits open; typing `/clear` picks it up |
| 5 | *(implied)* A run that ends abandoned, stopped or crashed never chains. Starting `pilot run` in a directory with no unfinished run and an open ticket starts the head ticket *(A5)* | S1's and S5's pins |
| 6 | Closing reports are their own kind, **report**, and have a **Closing reports** section on the tab. They stay open after the session moves on and never hold a turn at the Stop gate. A reply to one after the next run has started reaches the pilot live in that directory, which answers in the thread *(A6)* | the section; a reply to run 1's report answered by run 2's pilot |
| 7 | **Parallel.** On that answer, the pilot creates one worktree per extra deck. It stores each deck's runs as tickets for that worktree's directory, and posts one `walkthrough` step per deck: `cd <path> && pilot run`. Each deck then chains its own runs | the walkthrough; each worktree's tab lists only its own tickets |
| 8 | New work agreed on **any** thread (Create threads, the chat, mid-run) is stored as a ticket at the back naming that thread, and is not re-asked at the end. Nothing is stored without the user's words, and full auto never stores | the ticket's body names its thread |
| 9 | *(implied)* The chained session is not told `stop listening` because of the previous run's finish | S1's pin on `stopReason` |
| 10 | The pilot's prompt share stays ≤ 9800 tokens, with no slice raising the pin | `node scripts/measure-prompt.mjs`; `measure-prompt.test.mjs` |
| 11 | **No headless sessions anywhere** (L10). Pressing Create opens a chat thread that the pilot live on that deck answers. With none live, the thread waits and is shown as waiting. The daemon never starts a `claude`: the launcher, `deck_launch`, the Stop button and thread binding (`PILOT_THREAD`) are removed. `node-pty` stays only as `pilot run`'s optional pty (L11) | live: Create with a `pilot run` session open, and the pilot answers; with none, a waiting card and no process started; `deck/launch.mjs` gone |

**Cannot mean here.** "The session /clears itself" holds only under `pilot run` (spec 4). "A different deck" means a
different directory: a deck is a `repoKey` (`deck/items.mjs:363`), so parallel runs need worktrees.

## 3. Findings

| Area | Fact the design leans on | Where |
|---|---|---|
| Hand-off pickup | Lane reads open items, takes the newest open `handoff` for `cwd`, claims it per item id, and emits a fixed "pick the run up from there" frame plus `recordFor(cwd)` | `hooks/session-handoff.js:121-132, 153-174, 196-223` |
| The `/clear` | `pilot run` wraps `claude --agent pilot:pilot` in a pty. On a `changed` event with an unclaimed open hand-off it types `/clear`, then `FIRST_PROMPT` once the lane's claim appears. A 5-min cooldown per wrapper is retried on the next change | `deck/run.mjs:82-92, 323-348, 415-435` |
| Record lookup | `recordFor(repo)` = last-written record for the directory, finished or not, any slug | `deck/store.mjs:1165-1171` |
| Stop listening | `finished` stops a wait when `record.updatedAt >= run.startedAt`. Registration survives `/clear`, so a chained session inherits the old `startedAt` → **would be stopped at once** (spec 9) | `deck/server.mjs:683-694` |
| Kinds | `kind` is an open string. `KINDS` are the specially rendered ones. `handoff` is posted via `deck_post` as an unknown kind. `SPECS` gives each kind its fields | `deck/items.mjs:24-45, 230-248`; `deck/store.mjs:475-503` |
| Waiting | `isQueued` is the daemon's one spelling of "waiting on the user". The tab's waiting list and `appearsInYours` use it | `deck/items.mjs:345-376`; `deck/ui/render.mjs:1508-1526` |
| Stop gate | Holds a turn up to 570 s on an own-posted open item with no reply (`awaitsUser`) | `hooks/stop-gate.js:119-128, 253-263` |
| Replies | Scoped by repository and thread binding, never by poster: a later session in the directory hears replies to earlier items. A reply reopens a resolved item | `deck/server.mjs:500-504, 721`; `deck/store.mjs:601, 905-917` |
| `deck_status` | Handler at `deck/server.mjs:636-659`. `finished` is free text; the pilot is told the two values | `agents/pilot.md:69-70` |
| Headless surface | `deck/launch.mjs` (342 lines) is the only spawner. Callers: `deck_launch` (`deck/tools.mjs:328`, `launchTool` `deck/server.mjs:701`), `/create` when no unbound run is live (`deck/server.mjs:905-915`), and Stop (`/thread/<id>/stop`, `deck/server.mjs:741-746, 960`; button `deck/ui/render.mjs:686-694`). Binding: `PILOT_THREAD` (`deck/client.mjs:172-174`, `hooks/inbox-alert.js:161`), `run.thread` and `threadFilter` (`deck/store.mjs:884-917, 947, 1002-1053`). Tests: `deck/test/launch.test.mjs` (89 hits), `routing.test.mjs` (27), `create.test.mjs`, `daemon.test.mjs` | grep `headless\|launcher\|PILOT_THREAD` |
| `node-pty` | Used by `deck/launch.mjs` **and** `deck/run.mjs:440-464`, which needs it to type `/clear`. It cannot leave the package without breaking the chain | `package.json:26` |
| Created chat waiting | `isQueued` already shows a created thread as waiting until the pilot's first reply | `deck/items.mjs:340-347` |
| Budget | Pilot share **9792** = 1534 + 6634 + 1624 at `9fb00e0`; the pin is 9800 | `scripts/measure-prompt.mjs` |
| v1 salvage | Queue store (`enqueue`…`listQueues`, `deck/store.mjs:353-498` on the branch) is launcher-free but duplicates items. `deck/ui/queue.mjs` is about 75 of 130 lines of edit forms | `origin/feat/run-chaining` |
| Neighbour | `design/housekeeping-audit` S5 owns `agents/pilot.md` (Agent list) and `SKILL.md` step 1 and Models. Its S6 calls `deck_launch` | that branch's `architecture.md` §8 |

## 4. Ubiquitous language

| Term | Means exactly |
|---|---|
| **Ticket** | An open item of kind `ticket` on a directory: title its name, body its spec text (naming the thread it was agreed on). Oldest open is the **head** |
| **Run split** | The architect's grouping of a DAG's slices into runs of at most the bound, in §8 of the artefact |
| **One-run bound** | More than 6 slices *(A3)* |
| **Chain hand-off** | A `handoff` item the daemon posts carrying `next: <ticket id>`. Its body is the ticket's spec |
| **Clean finish** | `finished` exactly `closing report posted` (`FINISHED_CLEAN`) |
| **Standing kind** | `ticket` or `report`: open, but never waiting on the user, never in Yours, never holding a turn |
| **Report** | The closing report's kind; renders as a walkthrough |

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
|---|---|---|---|
| L1 | PR #125 closed unmerged; `feat/run-chaining` kept for salvage (was Q1) | User's answer | merge, then subtract |
| L2 | A ticket is a deck **item**, posted with `deck_post`, not a queue store | Items already persist, are repo-keyed, render, and take replies. The deletion test on v1's queue: nothing lost | salvaged `deck.queues` + `deck/ui/queue.mjs` |
| L3 | The **daemon** posts the chain hand-off, in one deep function `chainNext(repo)` in `deck/chain.mjs`, called from `deck_status` (S1) and `POST /api/chain` (S6) | Deterministic, no prompt tokens, one place to get the rule wrong | the ending pilot posting it (prompt cost, forgettable) |
| L4 | The chain hand-off's body is the ticket's spec, and `chainNext` resolves the ticket in the same deck write | A ticket is taken exactly once; a failed `/clear` leaves the spec in an open hand-off, not lost | resolving the ticket at pickup (two writers) |
| L5 | The lane, on a hand-off carrying `next`, emits a **next-run** frame (no record) and resolves the hand-off. `stopReason` ignores a finish superseded by a resolved chain hand-off posted after it | Fixes spec 9 without touching registration | re-registering on SessionStart (changes run identity) |
| L6 | `ticket` and `report` are **standing kinds**: `isQueued` false, a section each on the tab, exempt from `awaitsUser` | One spelling in `items.mjs`, mirrored in `hooks/lib/deck.js` and pinned by `join.test.js` | a title convention for reports |
| L7 | No change to `deck/run.mjs`'s clear path; S6 adds only one call at start | The wrapper already does the whole `/clear` | a second clearing path |
| L12 | The split question recommends **in sequence on this deck** (spec 1) | The user, at the spec: one deck promotes simplicity for a fresh user | recommending parallel decks |
| L13 | The read-only **Tickets** and **Closing reports** components live in the **left-side section group** of the tab and follow its schema (`run-section`), never the right strip | The user, at the spec | a right-strip bookmark like v1's Queue |
| L8 | New ADR 0039 supersedes ADR 0035: the daemon starts no session. A run is started by a person or by a cleared `pilot run` session | The record must say why both paths left | editing 0035 in place |
| L9 | S4–S6 together spend at most what S2 banks; the share stays ≤ 9800 after every slice and the pin is never raised | Spec 10 | raising the pin |
| L10 | Headless launching is removed everywhere: launcher, `deck_launch`, Stop, binding. A Create thread is a chat for the live pilot (was Q2) | User: "if I press Create, it starts a thread with the current agent"; headless "later, if the CLI becomes redundant" | keeping Create's headless chat |
| L11 | `node-pty` stays, as `pilot run`'s optional dependency only | `deck/run.mjs` types `/clear` through it; the chain (spec 3) rests on it | removing it with the launcher |

## 6. Assumed decisions awaiting the user

| # | Default taken | Alternative and tradeoff |
|---|---|---|
| A3 | Bound = more than 6 slices; runs of at most 6, each its own feature PR and Gate 2 | the architect's judgement, or a diff-size estimate: fuzzier, asked more often |
| A4 | Gate 1 on the artefact covers every run in it; run *n* > 1 starts at step 4 with its slices, rebased on the then-current `main` | every run repeats steps 1-3: re-asks what was agreed |
| A5 | `pilot run` starting with no unfinished run and an open ticket starts the head ticket. Otherwise only a clean finish chains | only a clean finish: an abandoned run leaves tickets waiting for a hand-typed prompt |
| A6 | A reply to an old report is heard by the pilot live in the directory, which answers there and may store a ticket | hold it until no run is live: slower, needs new routing |

## 7. Out of scope

Any UI to add, edit, reorder or drop tickets; a ceiling; a daemon-launched run; typing into a session that was not
started with `pilot run`; overlap checks between parallel decks' files (integration catches it); editing `SKILL.md` step 1 or Models, or the `Agent(...)`
list (housekeeping-audit owns them).

## 8. Slices

`S1 → S2 → S3 → S4 → S5 → S6`, linear. S1 and S2 share `deck/server.mjs`. S2 and S3 share `deck/ui/render.mjs` and
`deck/store.mjs`. S2, S4, S5 and S6 share the prompt files. S2 removes before anything spends: it banks the
`deck_launch` schema and the headless prose for S4 to S6. Diff limits are in each slice file.

| Slice | Delivers | Files owned | After | Detail |
|---|---|---|---|---|
| **S1 A stored ticket starts itself when the run before it finishes cleanly** (walking skeleton) | 3, 4, 5 (clean finish only), 9 | `deck/chain.mjs` (new), `deck/items.mjs`, `deck/runs.mjs`, `deck/server.mjs`, `hooks/session-handoff.js`, `deck/test/chain.test.mjs` (new), `hooks/test/session-handoff.test.js` | – | [slices/S1.md](slices/S1.md) |
| **S2 Create opens a chat for the live pilot; the daemon starts no session** | 11, 10 | `deck/launch.mjs` (deleted), `deck/server.mjs`, `deck/store.mjs`, `deck/client.mjs`, `deck/tools.mjs`, `deck/ui/render.mjs`, `hooks/inbox-alert.js`, `deck/test/launch.test.mjs` (deleted), `deck/test/routing.test.mjs`, `deck/test/create.test.mjs`, `deck/test/daemon.test.mjs`, `agents/pilot.md` (tool row, Create rule, `tools:` line), `skills/pilot/SKILL.md` (line 54 only), `scripts/test/pilot-agents.test.mjs`, `docs/adr/0039-the-daemon-starts-no-session.md` (new) | S1 | [slices/S2.md](slices/S2.md) |
| **S3 Tickets and closing reports have their own sections and never hold a turn** | 2, 6 | `deck/items.mjs`, `deck/ui/render.mjs`, `deck/ui/deck.css`, `hooks/lib/deck.js`, `hooks/stop-gate.js`, `deck/test/standing.test.mjs` (new), `hooks/test/standing.test.js` (new), `hooks/test/join.test.js` | S2 | [slices/S3.md](slices/S3.md) |
| **S4 The pilot stores agreed work as tickets and posts its closing report as a report** | 6 (pilot side), 8, 10 | `agents/pilot.md` (Create rule, finished rule), `skills/pilot/SKILL.md` ("Ending a run"), `scripts/test/pilot-agents.test.mjs` | S3 | [slices/S4.md](slices/S4.md) |
| **S5 A ticket over the bound is split, and the user chooses one run, sequence or parallel** | 1, 3 (A4), 10 | `agents/pilot-architect.md`, `skills/pilot/SKILL.md` (step 3, "The artefact is the state"), `scripts/test/run-split.test.mjs` (new) | S4 | [slices/S5.md](slices/S5.md) |
| **S6 Parallel decks each chain their own runs** | 5 (A5), 7, 10 | `deck/tools.mjs` (`deck_post.dir`), `deck/items.mjs`, `deck/store.mjs`, `deck/server.mjs` (`POST /api/chain`), `deck/chain.mjs`, `deck/run.mjs`, `skills/pilot/SKILL.md` (step 3 parallel branch), `deck/test/parallel.test.mjs` (new), `deck/test/run.test.mjs` | S5 | [slices/S6.md](slices/S6.md) |

## 9. Acceptance evidence, in the order the user meets it

1. Create, with a `pilot run` session open: the thread is answered by that pilot. With none open: a waiting card,
   and `tasklist` shows no new `claude`. There is no Stop button (spec 11).
2. A ticket of more than 6 slices: a fresh thread with the split and three answers. A 3-slice ticket: no such thread (spec 1).
3. "In sequence": the tab's **Tickets** section lists runs 2..k read-only, run 2 marked *next*. They are still there
   after a daemon restart (spec 2).
4. Run 1's closing report appears under **Closing reports**, and the turn ends without a 9-minute hold (spec 6).
5. The `pilot run` terminal clears itself. Run 2's first turn restates its ticket and goes to step 4 without a
   stop-listening message. Run 2 leaves Tickets (spec 3, 9).
6. A reply to run 1's report is answered in that thread by run 2's pilot (spec 6).
7. In a chat, agree new work: a ticket appears at the back, naming the chat (spec 8).
8. "In parallel": a walkthrough with one `cd <path> && pilot run` per deck. Running it starts that deck's first
   ticket, and each tab shows only its own tickets (spec 5, 7).
9. `npm test` green, including the 9800 pin (spec 10).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Delivers |
|---|---|---|---|---|---|---|
| S1 A stored ticket starts itself when the run before it finishes cleanly | planned | | | | – | 3, 4, 5, 9 |
| S2 Create opens a chat for the live pilot; the daemon starts no session | planned | | | | S1 | 10, 11 |
| S3 Tickets and closing reports have their own sections and never hold a turn | planned | | | | S2 | 2, 6 |
| S4 The pilot stores agreed work as tickets and posts its closing report as a report | planned | | | | S3 | 6, 8, 10 |
| S5 A ticket over the bound is split and the user chooses | planned | | | | S4 | 1, 3, 10 |
| S6 Parallel decks each chain their own runs | planned | | | | S5 | 5, 7, 10 |
| feature run-chaining | planned | `feat/run-chaining-v2` | | | S6 | 1–11 |

## Principles findings and QA findings: the verdicts

Reviewed once over the whole feature at 28d4b98 (fundamentalist, Opus) beside QA's read-only pass; fixed on PR #139, integrated at 71f7c96.

| Finding | Verdict | Why |
| --- | --- | --- |
| F1 `session-handoff.js` resolved the chain hand-off before the payload write, so a failed write lost the ticket | kept | the loss the lane exists to prevent; resolve now runs in `deliver()`'s success path with a non-parsing call |
| F2 `createThread`'s `body` parameter had no caller since `deck_launch` went | kept | removal |
| F3 `chain.mjs` supersede mutant `>= → true` survived | kept | under it a chained session never stops listening; test added |
| F4 render mutants (head is `next`, sections disjoint, names) survived | kept | spec 2 was unasserted; tests added against the tab markup |
| F5 the next-run frame's fence strings were unpinned | kept | test added |
| N1 unreachable `item.next` branch in `notice()`; N2 one-entry `UNRENDERED_SPECS`; N3 unused `renderStanding` export | kept | removals |
| N4 an `isOpenTicket` helper for three spellings | dropped | net zero, no consequence named |
| N5 same-ms tie and ticket-has-no-options pins | kept | cheap, and the tie was measured 2 ms off |
| QA F1 Tickets and Closing reports drawn as collapsed sections under the rail | kept, revised | first answered "sections with a count"; the user reversed it on a preview: each is a rail tab with a badge count, an expanded item opens in its own pane, rows spaced like notifications |
| QA F2 the chain hand-off card did not say `/clear` starts the run, and Dismiss lost the ticket | kept | card says so; dismissing reopens the ticket |
| QA F3 at-start frame said "the previous run finished" after an abandoned or absent run | kept | "no run is unfinished here" |
| QA F4 `deck_post`'s answer for a ticket told the pilot to resolve it | kept | a ticket is stored, never resolved by the pilot |
| QA F5 `/api/chain` bad-body message borrowed `/api/record`'s | kept | its own wording |

Decision withdrawn during the run: the Opus-only rule for implementers (brief.md, 9616df1) — model per ticket again.
