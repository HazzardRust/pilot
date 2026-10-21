# A blocked yellow ticket yields the lane

Ticket `itm_d39f0d55cad6` · feature `blocked-yellow-yields` · base `pilot` 4a9b17ad · ADR 0153 (the next free number when S8 lands) · one run

## 1. Problem

The user's words: "why not move onto the next task if i have not answered the blocking question after some
time?" and "yes, and when it is paused, it flips to green ofcourse". Today a yellow (implementing) ticket whose
blocking question waits on the user holds the co-pilot lane idle until the user comes back. Second half, in the
user's words: "i see a few of the same issue occurring in blocking questions. is there a systematic fix to this?":
`Blocked:` items (auto-mode denials) pile up after the step was done another way or stopped mattering, and the deck
refuses the pilot's close of any of them ("it waits for their reply or Assume the default", `deck/store-items.mjs:499`).

## 2. Spec

The ticket's lines 1–8 (body 1–5, the pilot's comment 6–8) against this artefact's 1–9. *Added* lines are found
or implied behaviour built under the build-now rule.

| # | Ticket | Behaviour a user can watch | Evidence |
| --- | --- | --- | --- |
| 1 | 1 | A yellow ticket held by the co-pilot whose blocking question has had no user reply for 20 minutes is paused by the deck: in one write it turns green with `paused: { question, at }`, the co-pilot lane is released, and a deck line on the question's thread wakes the pilot's `pilot wait` to send the co-pilot the pause. The rail shows it `paused` and waiting on that question. | a yield test: a blocking question 20 min old, the timer fires, the ticket reads green + `paused`, `coPilotFor` reads not live, the thread holds the deck line with a `seq`; the rail's standing reads `paused` |
| 2 | 2 | The co-pilot lane then names the next runnable yellow ticket in queue order: one with no open blocking item of its own; with none runnable, the lane line and `pilot wait` say which tickets are blocked on which question. | a lanes test: two yellow, the head blocked, `next` is the second; all blocked, the line names each with its question |
| 3 | 3 | The user's answer on the pausing question (a reply or Assume the default) turns the ticket yellow again, `paused` cleared, at the head of the yellow queue, in the same write; when the lane frees the pilot spawns its successor co-pilot from the plan and the record's `next`, as for a `paused` hand-back today. | a resume test: the reply moves it to the yellow head; the lane line reads `co-pilot: empty → next <it>` |
| 4 | – (*added*) | A paused ticket is not concluding: the concluding lane never takes it, QA is not started on it, and its questions are never hidden as behind (`isBehind`, `items.mjs:638`, would hide a green ticket's thread outside the concluding hand). | items tests: `nextTicketOf(…, 'green')` skips it; `isBehind` false for its question; `standingOf` reads `paused` |
| 5 | 5 | The timeout is one constant, `YIELD_MS = 20 * 60_000` in `deck/lanes.mjs`, named in the ADR. | the constant; ADR indexed; `check-references` passes |
| 6 | 6 | The pilot closes a `Blocked:` item whose step was done another way, belonged to another role or no longer matters with a resolution starting `Moot:`, with no press from the user; any other unanswered blocking item still refuses the close, and only a Blocked item still open refuses its ticket's gate2. The stop hook holds no turn on a moot one. | an items test: `Moot:` resolve accepted, the gate2 post then accepted; a plain resolve still refused; a `Moot:` on a non-Blocked blocking question refused; a stop-gate test |
| 7 | – (*added*, found) | A Blocked item is filed under the ticket of the lane that was denied: a co-pilot crew agent's under the co-pilot's ticket, QA's under the live concluding ticket, a planning role's and the pilot's under the live planning ticket. Today every denial files under the live red ticket (`hooks/lib/deck.js:180`, `deck/tickets.mjs:60`), which is how run 2's four Blocked items reached this ticket. | a hooks test: an implementer's denial with a live co-pilot on yellow `Y` posts with `ticket: Y`; QA's with green `G` live posts `ticket: G`; no lane ticket posts a plain question |
| 8 | 7 | The crew's prose names the call shapes that trip auto mode and forbids them: a kill bundled with a read, a `cat` of a transcript or task-output file, `pilot land` from a co-pilot; a file edit the classifier refuses goes to `main` as one question with its default, and the hook posts no Blocked item for it. | wording pins on `agents/pilot.md`, `agents/pilot-co-pilot.md`, `agents/pilot-implementer.md`; a `blocked.js` test: an `Edit` denial posts nothing |
| 9 | 4, 8 | The pilot's and co-pilot's prose name the yield (timeout, flip, resume) and the Moot rule; one ADR records both rules; the prompt pins move by exactly what the wording costs. | wording pins; the pin diff; ADR indexed; `check-references` |
| 10 (added) | – | The vocabulary guard on `origin/pilot` 34f596ff exempts this run's design docs and ADR 0153, where the user's words are quoted; the guard stays on everywhere else. | `vocabulary-guard.test.mjs` pins the two paths; `the whole repository is clean` green with the base merged |
| 11 (added) | – | A `Moot:` close of the item that paused a ticket, or of the last unanswered blocking item naming it, resumes the ticket as the user's answer does (found by S5). | a moot-resume test: the pilot's Moot close turns the paused ticket yellow at the head; a plain close does not |

## 3. Findings

- **Lanes** (`deck/lanes.mjs`, 66 lines): pure `laneOf`, `lanesFrom`, `lanesOf`. The idle yellow lane's next is
  `ticketQueueOf(items, repo, 'yellow')[0]` (:42), blind to blocking questions. Ticket `itm_97a14cc327a5`
  (queued after) changes gate2's landing and `chainNext` here; this run touches only `YIELD_MS`, the yield read
  and the yellow `next`.
- **States** (`deck/store-tickets.mjs`): `needTicket` (:312) turns yellow green only while an open question,
  walkthrough or gate2 names it, and releases the co-pilot in the same write; `pivotTicket` (:339) turns green
  yellow but leaves queue position. Queue order is `deck.items` order. `need` today means "QA's turn"
  (`agents/pilot.md:165`), so a paused green ticket needs its own mark.
- **Co-pilot** (`deck/store-runs.mjs:368-392`, `store-core.mjs:718-734`): one `coPilots[repoKey]` entry per
  repository, live only while its ticket is open and yellow. Pause is a `SendMessage` protocol
  (`agents/pilot.md:142-154`, `pilot-co-pilot.md:101-111`); the deck never stops an agent.
- **Clock**: every time rule is read off the clock and swept by nothing (`HANDOFF_ACK_MS`, `items.mjs:507`;
  `armHandoffs`, `server-wait.mjs:316`, timers that only repaint). The one timer that writes is the landing's
  timeout settle (`landing.mjs:254`). A parked `pilot wait` wakes only on a thread line with a `seq`
  (`store-items.mjs:389-395`, `from: 'deck'`).
- **Blocked items** (`hooks/lib/blocked.js`, ADR 0137): posted by the hook, `options [I ran it, Skip it]`,
  `recommended: Skip it`, `blocking: true` on `deck.liveTicket(repo)`, which is `/api/tickets`' `live`, the
  live red ticket. `permission-denied.js:41-50` passes `agent_type` but never `agent_id`, cwd branch or
  worktree; run records hold no ticket field, so a cwd mapping is not derivable without new state.
  `commandOf` gives a bare `Edit` for a file tool. No code reads the two options; only Assume the default is
  special (`store-items.mjs:288-315`, deletes `blocking`).
- **Refusals**: `resolveItem` refuses an unanswered blocking item (:498-501); gate2's post and Sign-off press
  both read `gate2Blockers` (`items.mjs:698`). No `Moot` path exists anywhere.
- **Stop hook** (`hooks/stop-gate.js:102-111`): holds only on items this session posted through `deck_post`;
  hook-posted Blocked items are never recorded (`inbox-alert.js:297-305`), so it holds no turn on them now.
- **Hook pins**: `session-handoff.js:365` pins the co-pilot lane line by regex; `pilot wait` prints only
  `lanes.refusal` (`wait.mjs:233-237`).
- **Prompt pins**: only the pilot's (`scripts/test/measure-prompt.test.mjs:165-170`, `own <= 11072.75`, one
  history line per change); co-pilot and implementer have none. About 39 wording-pin tests read these agents.
- **Mis-filing** (found): `itm_876b716e20c5`, `itm_af1a88c59c39`, `itm_59273d57a120`, `itm_8311b4b3cff7` were
  denials of run 2's crew (`itm_a5394180830f`) filed under this red ticket; they held run 2's gate2 not at all.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `deck/lanes.mjs` | `YIELD_MS`, `yieldsDue(items, repo, coPilotTicket, now)`, `runnableYellowOf(items, repo)`, `lanesFrom` | the yield rule and the runnable rule, read by the timer, the lane lines and the hooks alike | In-process |
| `deck/store-tickets.mjs` | `yieldTicket(id, questionId)`, `resumeIn(deck, question)` | the green flip, the `paused` mark, the release, the deck line; the resume and the move to the yellow head | Local-substitutable (`PILOT_DECK_DIR`) |
| `deck/items.mjs` | `isPaused(ticket)`, `nextTicketOf`, `isBehind`, `standingOf` | "paused is not concluding" in the four readers that would otherwise each test `ticket.paused` | In-process |
| `deck/blocked-shape.mjs` | `isMoot(item, resolution, author)` | which close of a blocking item is the pilot's to make | In-process |
| `deck/lane-ticket.mjs` (new) | `laneTicketOf(items, repo, agentType, coPilot)`; `GET /api/tickets?repo=&agent=` → `filed` | the role → lane → ticket rule, once, deck-side; the hooks hold no copy | In-process |
| `server-wait.mjs` timers | `armYields()` beside `armHandoffs()` | one one-shot timer per due yield, overdue fired at once on start | Local-substitutable (injected clock) |

Deletion test: delete `yieldsDue` and the 20-minute rule reappears in the timer, the lane line and its test
(kept). Delete `isPaused` and four readers each spell `ticket.paused` and one forgets (fold kept). A separate
`yield.mjs` would hold one 15-line function beside the lanes it reads (not created; `YIELD_MS` stays in
`lanes.mjs`, spec 5). `laneTicketOf` gets its own file so ticket `itm_97a14cc327a5` rebases on a narrow
`lanes.mjs`. No fold slice: each seam is created by the slice whose behaviour needs it.

## 4. Ubiquitous language

- **Yield**: the deck pausing the co-pilot's ticket at `YIELD_MS` on an unanswered blocking question.
- **Paused ticket**: green with a `paused` mark naming its question; held by no lane; not concluding.
- **Runnable**: a yellow ticket with no open blocking item of its own; only a runnable ticket is the lane's next.
- **Resume**: the user's answer turning a paused ticket yellow at the head of the yellow queue.
- **Moot**: the pilot's close of a `Blocked:` item, its resolution starting `Moot:`.
- **Lane ticket**: the ticket a denied agent's role works on, the one its Blocked item is filed under.

## 5. Locked decisions

| # | Decision | Rationale and source | Rejected |
| --- | --- | --- | --- |
| L1 | A paused ticket is green with a `paused: { question, at }` mark, not a new state. | The user: "when it is paused, it flips to green ofcourse" (itm_0bfcf27836de). | A fifth state `paused`. |
| L2 | The deck pauses on a timer: `armYields` arms one timer per due yield; on fire `yieldTicket` writes the flip, the release and a `from: 'deck'` line with a `seq` on the question, which wakes the pilot. A restart fires an overdue yield at once. | The user, itm_d2a46ab6e71c: "A: the deck pauses it on a timer". A pure read wakes no parked wait. The landing timeout is the precedent for a timer that writes. | B: the pilot pauses on a printed line. |
| L3 | The deck never stops an agent: the line tells the pilot to send today's pause; the co-pilot integrates its slice in flight and hands back `paused`. | `pilot-co-pilot.md:101-103`; the deck has no channel to an agent. | The deck killing the co-pilot. |
| L4 | `YIELD_MS` is one constant in `deck/lanes.mjs`, 20 minutes. | Ticket line 5. | A setting. |
| L5 | Only the co-pilot's held ticket yields; a queued yellow ticket with a blocking item is skipped as not runnable, never flipped. | Only a held ticket idles a lane; flipping queued ones would spread green over tickets nobody built. | Pausing every blocked yellow ticket. |
| L6 | Lane changes stay narrow: `YIELD_MS`, `yieldsDue`, `runnableYellowOf` and the yellow `next`; `laneTicketOf` lives in its own file. | Ticket `itm_97a14cc327a5` rebases onto `lanes.mjs` after this. | Folding the attribution into `lanesFrom`. |
| L7 | QA runs against a scratch deck (`pilot deck --scratch`, seeded with a run record) plus `npm test`; the live deck on 4321 is never touched. | The user, itm_9dddb2d22954. | QA on the live deck. |

## 6. Assumed decisions

Decided by the architect at the user's grilling depth (forks only); each default is taken and the run proceeds on it.

- **A1 The clock starts at the question's `postedAt`**, and "unanswered" is no message from the user on it, the
  predicate `resolveItem` already uses. Tradeoff: a question posted before the ticket was held can yield at once
  when it becomes held. Rejected: `max(postedAt, coPilot.at)`, a second clock to explain.
  Verdict: stands
- **A2 A crew denial is filed by agent type** (spec 7): the co-pilot and its crew (implementer, fact sheet,
  fundamentalist, evidence runner, the reviewers) under the live co-pilot's ticket, else the live green ticket;
  `pilot-qa` under the live green ticket; architect, explorer, teacher and the pilot under the live red one (today's
  rule); no lane ticket gives today's plain question. Tradeoff: a reviewer spawned by QA while a co-pilot is live
  files under the yellow ticket. Rejected: cwd → branch → slug → ticket, which needs a git call in the hook and a
  ticket field the run records do not hold.
  Verdict: stands
- **A3 Resume needs every blocking item naming the ticket answered**: the first user reply on the last one turns
  it yellow; another still unanswered keeps it paused. Tradeoff: a second question keeps the lane moving on. Rejected:
  resuming on the pausing question alone, which resumes into a second wait.
  Verdict: stands
- **A4 `Moot:` is the pilot's, on `Blocked:`-titled items only**, and leaves the user its close notice as any
  agent close does. Tradeoff: a design question marked blocking still needs the user. Rejected: `Moot:` on any
  blocking item, which lets the pilot answer for the user.
  Verdict: stands
- **A5 A denied file edit posts no Blocked item** (`Edit`, `Write`, `NotebookEdit`): the agent sends `main` one
  question with its default, which the pilot posts. Tradeoff: an agent that forgets leaves the denial unposted.
  Rejected: a Blocked `Edit` item, which the user cannot "run" and which duplicates the agent's question.
  Verdict: stands
- **A6 Paused tickets are on no lane**: the concluding lane skips them and the rail shows them `paused` on their
  question. Tradeoff: one more standing word on the rail. Rejected: the concluding lane taking them, which reads as
  QA's turn (`agents/pilot.md:165`).
  Verdict: stands

## 7. Out of scope

Stopping an agent from the deck (L3); a configurable timeout (L4); yielding a queued yellow ticket (L5); gate2's
landing and `chainNext` (ticket `itm_97a14cc327a5`); closing the four mis-filed Blocked items (the pilot's, with
`Moot:` once S5 lands); a cwd-based attribution (A2); the store, daemon and doctor tickets.

## 8. Slices

Width 5 (S2, S3, S4, S6, S8); longest stem 4 (S1 → S4 → S5 → S7).

| # | Title | Spec | Files owned | After | Reviewers | Model | File |
|---|---|---|---|---|---|---|---|
| S1 | Skeleton: the deck pauses a blocked co-pilot ticket at 20 minutes | 1, 5 | `deck/lanes.mjs`, `deck/store-tickets.mjs`, `deck/store.mjs`, `deck/server-wait.mjs`, `deck/test/yield.test.mjs` (new) | – | ts | opus | [S1](slices/S1.md) |
| S2 | A paused ticket is not concluding and the rail says so | 1, 4 | `deck/items.mjs`, `deck/ui/render-parts.mjs`, `deck/test/paused-standing.test.mjs` (new) | S1 (the `paused` mark) | ts | sonnet | [S2](slices/S2.md) |
| S3 | The co-pilot lane takes the next runnable yellow ticket | 2 | `deck/lanes.mjs`, `deck/wait.mjs`, `hooks/session-handoff.js`, `deck/test/lanes-runnable.test.mjs` (new), `hooks/test/session-handoff.test.js` | S1 (`deck/lanes.mjs`) | ts, security | opus | [S3](slices/S3.md) |
| S4 | The user's answer resumes a paused ticket at the yellow head | 3 | `deck/store-items.mjs` (`addReply`), `deck/store-tickets.mjs`, `deck/test/resume.test.mjs` (new) | S1 (`deck/store-tickets.mjs`) | ts, security | opus | [S4](slices/S4.md) |
| S5 | The pilot closes a moot Blocked item | 6 | `deck/store-items.mjs` (`resolveItem`), `deck/blocked-shape.mjs`, `deck/test/moot.test.mjs` (new), `hooks/test/stop-gate.test.js` | S4 (`deck/store-items.mjs`) | ts, security | opus | [S5](slices/S5.md) |
| S6 | A Blocked item is filed under its lane's ticket | 7 | `deck/lane-ticket.mjs` (new), `deck/server-routes.mjs`, `deck/tickets.mjs`, `hooks/lib/deck.js`, `hooks/lib/blocked.js`, `deck/test/lane-ticket.test.mjs` (new), `hooks/test/permission-denied.test.js` | – | ts, security | opus | [S6](slices/S6.md) |
| S7 | The crew's prose names the yield, Moot and the shapes auto mode refuses | 8, 9 | `agents/pilot.md`, `agents/pilot-co-pilot.md`, `agents/pilot-implementer.md`, `hooks/permission-denied.js`, `scripts/test/yield-wording.test.mjs` (new), `scripts/test/measure-prompt.test.mjs`, `hooks/test/permission-denied.test.js` | S6 (`hooks/permission-denied.js` beside `blocked.js`), S1 (the deck line), S5 (the `Moot:` rule) | ts, security | opus | [S7](slices/S7.md) |
| S8 | ADR 0153 records the yield and the Moot rule | 5, 9 | `docs/adr/0153-a-blocked-yellow-ticket-yields-the-lane.md` (new), `docs/adr/README.md` | – | ts | sonnet | [S8](slices/S8.md) |
| S9 | The vocabulary guard keeps this run's quoted user words (added) | 10 (added) | `scripts/vocabulary.mjs` (`EXCEPTIONS`), `scripts/test/vocabulary-guard.test.mjs` | – | ts | sonnet | [S9](slices/S9.md) |
| S10 | A moot close resumes the ticket it paused (added) | 11 (added) | `deck/store-tickets.mjs` (`resumeIn`), `deck/store-items.mjs` (`resolveItem`), `deck/test/moot-resume.test.mjs` (new) | S4, S5 | ts, security | sonnet | [S10](slices/S10.md) |

Reviewers: ts = `pilot:typescript-reviewer`, security = `pilot:security-reviewer` (hooks, an API route, a
trust boundary on who closes or reopens a blocking item, agent configuration). Sonnet for S2 and S8, precise and
off the trigger; Opus elsewhere.

## 9. Acceptance evidence

On a scratch deck (`pilot deck --scratch`, seeded with a run record and a planted store; never 4321, L7) plus
`npm test`, in the order the user meets it:

1. A yellow ticket held by a co-pilot with a blocking question posted 20 minutes ago (planted `postedAt`): on start
   the ticket turns green, the rail reads `paused` on that question, the question's thread holds the deck's line,
   and a parked `pilot wait` prints it (1, 4, 5).
2. The concluding lane does not offer the paused ticket; its question stays visible (4).
3. The co-pilot lane line names the next runnable yellow ticket; with every yellow ticket blocked it names each
   and its question (2).
4. Answering the question turns the ticket yellow at the head; the lane line names it next (3).
5. A `Blocked:` item resolved with `Moot: done another way` closes with a notice; the gate2 then posts (6).
6. A denial from an implementer under a live co-pilot appears on the yellow ticket, not the red one (7).
7. The pin diff and the wording; ADR 0153 in the index; `check-references` passes (8, 9).

## 10. Status

| Slice | State | Branch | PR | Worktree | Blockers | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1, 5 |
| S2 | planned | | | | S1 | 1, 4 |
| S3 | planned | | | | S1 | 2 |
| S4 | planned | | | | S1 | 3 |
| S5 | planned | | | | S4 | 6 |
| S6 | planned | | | | – | 7 |
| S7 | planned | | | | S6, S1, S5 | 8, 9 |
| S8 | planned | | | | – | 5, 9 |
| S9 (added) | planned | | | | – | 10 |
| S10 (added) | planned | | | | S4, S5 | 11 |
| blocked-yellow-yields | planned | `feat/blocked-yellow-yields` | | | S1–S8 | 1–9 |
