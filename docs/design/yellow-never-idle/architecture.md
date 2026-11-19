# yellow-never-idle: a built ticket waiting on the user can never stay yellow

Ticket `itm_74926a1687c5` · base `pilot` (655a49d8) · origin thread `itm_1f10574ff8b3` · ADR 0193

## 1. Problem

The user came back after a night away to a yellow (implementing) ticket that was not running: it was built and its
walkthrough was waiting on them, yet it still read implementing and held the yellow lane. The only thing that moves
it on is the pilot remembering `deck_ticket need`. The user wants a system that makes this impossible, not a pilot
that tries harder.

The incident, read from the live store: audit-f6 (`itm_50652e3e4f6f`, short path, 1 slice) had its walkthrough
`itm_ab39b4603222` posted by the pilot at 2026-11-17 17:16Z on the yellow ticket. Nothing moved it; `need` came at
2026-11-18 02:17Z, 9 h later. The co-pilot slot's `live: true` is a stored flag, so the lane read `held` and no
refusal fired, and the pilot was parked in `pilot wait`, which the Stop hook never sees.

## 2. Spec

| # | Behaviour | Evidence and bar |
| --- | --- | --- |
| 1 | A non-blocking walkthrough posted on an open yellow ticket of its repository turns the ticket green and releases its co-pilot in the same write as the post. | Deck test: 1 `postItem` call, then `stateOf` green, `coPilotFor` live false, `yellowClause` `Yellow: empty`. |
| 2 | `deck_post`'s answer for a walkthrough or gate2 that moved its ticket says so in one clause, `<ticket> is now green (concluding); the yellow lane is free.` | Tool test: the clause present once; 0 times when the ticket was already green. |
| 3 | A blocking walkthrough on a yellow ticket leaves it yellow, so never-stuck spec 8's yield still holds. | `deck/test/yield-walkthrough.test.mjs` passes with 0 edits; 1 new assert reads yellow after the post. |
| 4 | Only a walkthrough posted by the pilot or QA (gate2's posters) moves a ticket; one from any other author is stored and moves nothing. | Deck test: an architect-stamped walkthrough leaves the ticket yellow, 1 assert. |
| 5 | A held yellow ticket whose crew (co-pilot, implementers, reviewers, fundamentalist, QA) has made no tool call for 20 min, with no unanswered blocking item and not draining, is named in `lanes.refusal`. | Lanes test: crew last seen 21 min ago gives the line naming the id; 19 min ago, an unanswered blocking question, or a draining ticket gives none. |
| 6 | The Stop hook refuses the pilot's stop on that refusal, naming the ticket id, at most once per stop. | Hook test on a deck on a free port: 1 `block` whose reason holds the id; the same deck with a crew heartbeat 1 min old returns null. |
| 7 | When a held yellow ticket goes idle, the deck writes exactly one `from: 'deck'` line on the ticket, which wakes a parked `pilot wait`. | Mock-timer test: 1 line at 20 min, still 1 at 60 min with no new heartbeat; a real `pilot wait` exits on it within 1 poll. |
| 8 | practitioner: SRE (a dead-man's switch counts a restart as a heartbeat) — a deck restart never reads a ticket idle before 20 min after the restart. | Lanes and timer tests: crew unseen since start gives no line and no refusal at 19 min, both at 21 min. |
| 9 | practitioner: incident replay — the post shape of `itm_ab39b4603222` (author pilot, non-blocking, short-path yellow ticket) reads green in the same call. | Deck test fixture copied from that item's fields: green after 1 post, where the incident took 9 h. |

Agreed: the user took all 6 proposed lines (`itm_f4b60134c37c`, "All 6"), 3 slices; they are 1, 2, 3, 5 with 6
(the Stop hook half of proposed line 4), 7 and 8. Line 4 is agreed (`itm_db72fd8d7683`, "Pilot or QA only") and
replaces the agreed line 1's "any author". Line 9 is *assumed*: the incident's replay as a test, which sharpens line 1
and adds no slice.
QA environment (`itm_ee6677a81961`, "Scratch deck"): a scratch deck with a temp repository, a real parked `pilot wait`,
and the Stop hook run with a payload; the live deck is not touched.

The draft's "holds the turn until the ticket is moved" cannot mean a hold loop here: the existing lane refusal blocks
once per stop (`stop_hook_active`), and a loop would trap a pilot whose crew is merely quiet (spec 6).

## 3. Findings

What exists and what the design leans on:

- `deck/store-items.mjs:168-173`: posting a gate2 already turns its ticket green and calls `releaseIn` in the same
  write. A walkthrough is not in `TICKET_STATES_FOR` (`:191`) and moves nothing; `walked` (`:165`) already finds its ticket.
- `deck/store-items.mjs:79` `POSTERS`: gate2 is posted by `pilot` or `qa` only; spec 4 reuses that list.
- `deck/store-tickets.mjs:338` `needTicket`: the manual yellow-to-green move the pilot must remember (`agents/pilot.md:134`).
- `deck/store-core.mjs:759` `isLiveCoPilot`: a stored flag, never evidence of a running agent.
- `deck/agents.mjs:162` `noteAgent`: an in-memory heartbeat roster per repository, fed by `hooks/agent-roster.js`;
  `lastActive` (`:204`) defaults to the daemon's `startedAt`, but keys by owner kind, and the co-pilot and reviewers
  read as `other` (`deck/items.mjs:352`), so it cannot say "the yellow crew".
- `deck/lane-ticket.mjs:10` `CO_PILOT_CREW`: the yellow crew's agent types, unexported.
- `deck/lanes.mjs:99` `lanesFrom`: the one place a lane refusal is spelled; `hooks/stop-gate.js:235` blocks on
  `lanes.refusal` read from `GET /api/record`, so the hook needs no change (idle-main-lane L2).
- `deck/wait.mjs:251-263`: `pilot wait` prints a refusal once and keeps listening; only a reply ends it.
- `deck/server-wait.mjs:465` `armOneShots`, `:497` `armYields`: the one-shot timer pattern, armed on every store change.
- `deck/store-items.mjs:471` `noteDeck`: one `from: 'deck'` line with a `seq`, which wakes the pilot once.
- `hooks/test/stop-gate-yellow-lane.test.js`: the hook-against-a-real-deck test pattern.

**Seams** (deepening pass):

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `postItem` (store-items) | `postItem(given) -> item` | the walkthrough's stage move beside the gate2's: one `concludeOn(deck, ticket)` internal for both | in-process |
| `idleYellowOf` (lanes) | `idleYellowOf(items, repo, held, crewSeenAt, now) -> { ticket, at } \| null` | the idle rule for the refusal and the timer alike | in-process, pure |
| `crewSeenAt` (agents) | `crewSeenAt(repo) -> ms` | the yellow crew's last heartbeat per repository, `startedAt` when unseen | in-process, local-substitutable |
| `armIdle` (server-wait) | `armIdle() -> void` | the wake timer and its re-arm on a not-yet-due fire | in-process, timer |

Deletion test: `needTicket` survives (the pilot's `need` for a question-only hand-back); `lastActive` survives
(owner-kind fallback); `crewSeenAt` is not a pass-through: deleting it puts the crew list in two callers.

## 4. Ubiquitous language

- **Yellow crew**: the agents that work a yellow ticket, `CO_PILOT_CREW` plus `pilot:pilot-qa`.
- **Crew seen**: the last heartbeat of any yellow-crew agent in a repository, or the daemon's start.
- **Idle yellow ticket**: held yellow, crew unseen for `IDLE_MS`, no unanswered blocking item, not draining.
- **Concluding move**: the one write that turns a yellow ticket green and releases its co-pilot.
- **Idle episode**: one stretch of crew silence, keyed by its crew-seen moment; one wake line per episode.

## 5. Locked decisions

- **L1** Depth: forks (user, `itm_54daee7f93a5`).
- **L2** The walkthrough's post is the concluding move, in `postItem`'s write beside gate2's (ADR 0066: ready for
  concluding is "QA's walkthrough is posted"). Rejected: a hook forcing `need`, which still depends on the pilot.
- **L3** Only a non-blocking walkthrough by `pilot` or `qa` moves the ticket (user, `itm_db72fd8d7683`). Rejected: QA only, which misses the
  incident (the pilot posted it, short path has no QA); any author, which lets an explorer or teacher move a ticket.
- **L4** The idle rule lives in `deck/lanes.mjs` and reaches the Stop hook as `lanes.refusal`; `hooks/stop-gate.js`
  is not edited. Rejected: the hook reading the roster, a second copy of the rule in CommonJS.
- **L5** Liveness is observed (crew heartbeats), never the stored `live` flag. Rejected: trusting `live: true`.
- **L6** The refusal is said once per stop. Rejected: a hold until moved, which traps a quiet but working crew.
- **L7** The wake is one `noteDeck` line on the ticket per idle episode, stamped `idleNoted` with the crew-seen
  moment. Rejected: `pilot wait` exiting on the refusal, which loops a pilot that judged the crew still working.
- **L8** No walkthrough post is refused for a lane reason (switch pending): the post always lands, as gate2's does.

## 6. Assumed decisions

- **A1** On an idle yellow ticket the deck tells the pilot (line, refusal); it never releases the co-pilot itself.
  Trades: one pilot action. Rejected: auto-release, which after a rate-limit stall or a long test leaves the
  original co-pilot waking beside a successor, two writers on one branch. Posted as `itm_b2779ef0011f`.
  User answer: "Tell the pilot (default)".
  Verdict: stands — the user chose "Tell the pilot (default)" on itm_b2779ef0011f
- **A2** `IDLE_MS` is 20 min, the yield's bound, twice the 10-min foreground tool cap. Trades: a dead crew is found
  20 min late. Rejected: 90 s (`LIVE_WINDOW_MS`), which fires on every long test run.
  Verdict: stands — 20 min is the yield's bound already in use; no queued ticket touches the threshold
- **A3** The co-pilot lane line stays `co-pilot: <id>`; idle shows as the deck line on the ticket's card and the
  refusal. Trades: no idle word in the rail. Rejected: a new line shape, which touches two regex copies
  (`deck/lanes.mjs:46`, `hooks/session-handoff.js:402`).
  Verdict: stands — no queued ticket claims the lane line's shape; the idle shows on the ticket and in the refusal
- **A4** 3 slices, not the 2 sized: spec 7 is the wake the draft lacked; without it a parked pilot never stops.
  User answer: "All 6" on the spec, 3 slices (`itm_f4b60134c37c`).
  Verdict: stands — the user chose "All 6" on itm_f4b60134c37c, 3 slices
- red team: S3's timer, armed only on store writes, would never fire for a crew that went quiet without a write
  after a not-yet-due check. Changed: `idleYellowOf` returns the future `at` and `armIdle` re-arms on a not-due fire.
- red team: a walkthrough's ticket is read through `walked`, not `ticketNamedBy`, which skips walkthroughs; S1 owns it.
- red team: a ticket reply's deck line must reach `pilot wait`; `deck/store-runs.mjs:96` hands any item's `deck` line
  to the pilot. S3's real-wait behaviour proves it rather than assuming it.
- red team: `lanesFrom` callers that pass no crew input (8 test files call it) must see no idle refusal; S2's input is
  optional and absent means not idle.

## 7. Out of scope

Auto-release (A1); a lane-line shape change (A3); `agents/pilot.md` prose (the `need` refusal on a green ticket
names its state); rate-limit detection; the audit tickets F11, F12, F14 and the home-store gate check.

## 8. Slices

Width 2; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | A walkthrough on a yellow ticket turns it green | 1, 2, 3, 4, 9 | `deck/store-items.mjs`, `deck/server-tools.mjs`, `deck/test/walkthrough-concludes.test.mjs` (new), `docs/adr/0193-yellow-never-idle.md` (new) | – | typescript, security | [S1](slices/S1.md) |
| S2 | A yellow ticket with no crew for 20 minutes refuses the pilot's stop | 5, 6, 8 | `deck/agents.mjs`, `deck/lane-ticket.mjs`, `deck/lanes.mjs`, `deck/test/lanes-idle.test.mjs` (new), `hooks/test/stop-gate-idle-yellow.test.js` (new) | – | typescript | [S2](slices/S2.md) |
| S3 | The deck wakes a parked pilot once when its yellow ticket goes idle | 7, 8 | `deck/server-wait.mjs`, `deck/store-tickets.mjs`, `deck/test/idle-wake.test.mjs` (new) | S2 (`idleYellowOf`, `crewSeenAt`) | typescript | [S3](slices/S3.md) |

S1 is the walking skeleton: the incident's own path, closed end to end through the real tool.

## 9. Acceptance evidence

On a scratch deck (`pilot deck --scratch`) with a temp repository:

1. Post a non-blocking walkthrough as the pilot on a yellow ticket: the answer says green, the card is green, the
   rail's yellow lane is empty (1, 2, 9). A blocking one leaves it yellow (3); an architect's leaves it yellow (4).
2. Grant a co-pilot, report no crew heartbeat, advance 21 min: `GET /api/record` carries the idle refusal (5, 8).
3. Run `node hooks/stop-gate.js` with a Stop payload: `block`, reason naming the ticket (6).
4. Park a real `pilot wait`: it exits on one deck line on the ticket; nothing more by 60 min (7).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | `slice/yellow-never-idle-s1` | – | – | – | 1, 2, 3, 4, 9 |
| S2 | planned | `slice/yellow-never-idle-s2` | – | – | – | 5, 6, 8 |
| S3 | planned | `slice/yellow-never-idle-s3` | – | – | S2 | 7, 8 |
| yellow-never-idle | planned | `feat/yellow-never-idle` | – | – | S1, S2, S3 | 1-9 |
