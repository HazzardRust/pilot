# Gate 2 frees the lane: the deck owns the landing and the report, a resolver on a conflict

Ticket `itm_97a14cc327a5` · feature `gate2-frees-lane` · base `pilot` 34f596ff · ADR 0154 · one run, after
`blocked-yellow-yields` (`itm_d39f0d55cad6`, ADR 0153)

## 1. Problem

The user's words: "i often get to gate 2, press sign off, and then have to wait a significant amount of time before
finding out whether it succeeded, or it failed in which case i have to press it again and restart the process in some
cases." Merge conflicts at landing fall to a pilot that is busy elsewhere ("like the pilot will be handling other
things"). And "the pilot is woken to write the closing report, but nothing really ensures that it actually gets done."
The user's ticket says foreman and task, which are the repo's co-pilot and ticket.

## 2. Spec

The ticket's lines 1–6, sharpened against the code; 7–9 are *added* under the build-now rule. The user agreed
all nine lines as written (itm_e3027a457f0c).

| # | Ticket | Behaviour a user can watch | Evidence |
| --- | --- | --- | --- |
| 1 | 1 | The Sign off press on a gate2 takes its ticket off the concluding lane in the press's own write. The rail reads it `landing`, and each queued stage lane takes its head in place, concluding first, with no hand-off and no `/clear`. One deck line with a `seq` on the gate2 names what went live and wakes the pilot. "Else red" cannot mean a red ticket on the concluding lane (three lanes, ADR 0151): it means the planning lane fills too when it is empty. | a press test: `standingOf` reads `landing`, the next green ticket is live, the line has a `seq`; `chainNext` is not called |
| 2 | 2 | The gate2 thread and the feature row read `landing started` at the press, then the `landed … at <sha>` line or the `NOT landed` line. | a settle test reads the row and thread text for a landed and a refused landing |
| 3 | 3 | A `pr ready failed` is retried by the deck with `pilot land --ready`, which runs only the ready step (no suite, no push): three attempts, at 0, 1 and 5 minutes. Only past the bound does the blocked `Mark #N ready` question go up, on the signed ticket. The ticket now live is untouched. | a landing test: ready fails once then passes and nothing is asked; fails three times and exactly one blocked question names the old ticket |
| 4 | 4 | Once a landing is `landed` and its ready step has settled, the deck itself posts the closing report from the record and the landing line: landing SHA, merge-first line, slices and PRs, worktrees kept, friction ranked. In the same write it resolves the gate2 if open, closes the ticket and sets the ticket's record `finished: closing report posted`, without chaining. It then posts a `report due` deck line that reaches the pilot at its next tool call. The pilot's `Findings:` reply on the report is appended to it. A deck that restarts writes any report a landed gate2 still owes. | a test with no session reads the report item after `landed`; an inbox-alert test reads the nudge; a reply test reads the appended findings; a restart test reads the owed report |
| 5 | 5 | Land's exit 3 is stored as `landing.conflict { dir }` and wakes the pilot. The pilot replies `Resolving` on the gate2 and dispatches a short-lived resolver (a `pilot-implementer` on a fix brief with `resolving-merge-conflicts`) in the kept `<checkout>-land-<slug>` worktree, then a fresh language reviewer on the resolution. On a pass it replies `Land again` and the deck re-runs land, whose `resume()` takes the committed merge. A failed review (the pilot's question), or no `Resolving` within `CONFLICT_TURN_MS` (A1), hands the conflict to the user as one blocked question on the signed ticket. | a test with a planted conflict reads `conflict.dir`, a `Land again` that lands; the timer posts the question; the prose pins the dispatch |
| 6 | 6 | The pilot's and QA's prose name the new order: press, lane freed, deck report, nudge, resolver. The prompt pin moves by exactly the wording's measured cost, and ADR 0154 records the decision. | wording pins; the pin history line; the ADR indexed; `check-references` passes |
| 7 | – (*added*) | A press while another landing in the repository runs is queued, not refused: the thread reads `landing queued`, and the landing starts when the first one settles. Today `refuseLanding` (`deck/store-items.mjs:450-462`) refuses it, which is the press-again pain once lanes free. | a queue test: two presses, one running, one `queued`, the second spawns on the first's settle |
| 8 | – (*added*, found) | A deck-written finish never ends the pilot's `deck_wait` while any lane of the directory still holds a live ticket or co-pilot. Today `stopReason` (`deck/server-tools.mjs:422-433`) stops on the newest record's `finished`. | a stop test: a deck finish with a live green ticket reads no stop; with every lane empty, the stop |
| 9 | – (*added*) | The vocabulary guard exempts `docs/design/gate2-frees-lane/` and `docs/adr/0154-`, where the user's words are quoted. | `vocabulary-guard.test.mjs` pins both paths |
| 10 | – (*added*, found in S1 and S4) | A landing ticket's row offers no Continue (switch) control, and a report whose last line is the deck's `report due` reads as awaiting findings, not `landing ended short`. | a rail render pin and a `threadState` pin |

## 3. Findings

- **What holds the lane** today: the press stores a Sign off reply only (`addReply`, `deck/store-items.mjs:285-338`;
  ":154 signing the gate2 moves nothing"). The green ticket stays `live` until a `report` item closes it
  (`store-items.mjs:160-166`) and the pilot's `deck_status finished` runs `chainNext` (`deck/server-tools.mjs:343`),
  which chains only on `finished === FINISHED_CLEAN` (`deck/chain.mjs:88`). That window covers the suite, the
  `pilot landing` wait (up to 40 min), any conflict, the ready question and the report.
- **Landing** (`deck/landing.mjs`): it is already asynchronous: a fixed `node pilot land` spawn in the record's
  worktree, a 30-minute kill, and `settleLanding` and `noteLanding` on close (`:189-262`). `askReady` posts the blocked
  question on `pr ready failed` (`:127-143`). A clean `landed` line is pilot-kind with no `seq` and wakes nobody. Only
  a short landing wakes anyone (`isShortLanding`, `store-items.mjs:383-395`).
- **land** (`scripts/land.mjs`): exits 0 landed (the ready line last, `pr ready failed:` included), 1 refused, and
  3 a conflict (`:263`, `:284`). The conflicted merge is kept in a sibling worktree, and a rerun's `resume()`
  (`:274-307`) takes a committed resolution. A rerun repeats sync, the suite and the push before `ready()`
  (`:222-229`, `:323-331`), hence a ready-only flag.
- **Report**: `deck_status.report` holds `featurePr`, `slices`, `assumed`, `humanSteps` and `worktreesLeft`. Friction is
  ranked by the deck (`rankFriction`, `deck/runs.mjs:337-352`, `:436`). A report item refuses asks
  (`deck/report-shape.mjs`, ADR 0148) and an open newest gate2 (`store-items.mjs:203-211`). It takes only the pilot's
  worktrees reply (`:361`). Nothing checks that a report was ever posted.
- **Nudge**: `hooks/inbox-alert.js` delivers each `seq` line once per session at the next tool call
  (`:220-265`). Its deck-line notice is worded only for a landing that ended short (`:94`, `:102-110`).
- **Stop**: `stopReason` reads `recordFor(repo)`, the directory's newest record. A finish the deck writes on the
  landed ticket's record would end the pilot's listening while it holds other lanes (spec 8).
- **Lanes** (`deck/lanes.mjs`): untouched by this run. `laneOf` reads `liveTicketOf` and `nextTicketOf`
  (`deck/items.mjs:554-591`). `takeTicket` refuses while another ticket of the state is live
  (`deck/store-tickets.mjs:99-102`), so a landing ticket must stop reading live.
- **Rebase on blocked-yellow-yields** (its artefact §8): it adds `isPaused` beside `nextTicketOf` and `standingOf`
  (its S2), edits `addReply` and `resolveItem` (S4, S5), `armYields` in `server-wait.mjs` (S1), and `agents/pilot.md`
  and the pin (S7). This run is cut against that state and rebases on `feat/blocked-yellow-yields` once it lands on
  `pilot`.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `deck/items.mjs` | `isLanding(ticket, items)`, `liveTicketOf`, `nextTicketOf`, `standingOf` | "signed is off the lane", derived from the newest gate2's stored Sign off, in the four readers that would each test it | In-process |
| `deck/chain.mjs` | `fillLanes(repo) -> taken[]`, `chainNext` | taking each queued stage lane's head in place, shared by the press and `chainNext`'s under-the-mark branch | Local-substitutable (`PILOT_DECK_DIR`) |
| `deck/closing-report.mjs` (new) | `closingReportOf(record, gate)`, `closeLanded(gate2Id)`, `closeOwed()` | the minimal report's body, the gate2 resolve, the report post, the record finish and the nudge, in one module | Local-substitutable |
| `deck/landing.mjs` | `startLanding(gate2Id, deps)`, `READY_DELAYS_MS` | the spawn, the ready retries, the queue and the exit code, with `spawn` and `clock` injected | True external (Mock: injected spawn) |
| `scripts/land.mjs` | `main(['--ready'])` | the ready step alone on a landed feature | True external (gh, injected) |
| `deck/server-wait.mjs` timers | `armConflicts()` | one timer per conflict past `CONFLICT_TURN_MS`, fired at once on a restart | Local-substitutable (injected clock) |

Deletion test: delete `isLanding` and four readers each re-derive "signed" from the gate2's replies (kept). Delete
`fillLanes` and the press and `chainNext` each hold the take loop (kept; `chainNext` calls it). Delete
`closing-report.mjs` and the landing settle, the daemon start and the reply path each build the report (kept). No
fold slice: each seam is created by the slice whose behaviour needs it. `fillLanes` is extracted inside S1, which owns
`chain.mjs`.

## 4. Ubiquitous language

- **Press**: the user's Sign off on a gate2, which is stored and which nothing un-presses.
- **Landing ticket**: an open green ticket whose newest gate2 is pressed. It is held by no lane, and the rail reads it `landing`.
- **Fill**: taking each queued stage lane's head in place, concluding first, with no hand-off.
- **Deck report**: the closing report the deck posts on `landed`, the minimal one, which closes the ticket.
- **Report due**: the deck's `seq` line on the deck report asking the pilot for findings and human steps.
- **Resolver**: a short-lived `pilot-implementer` on a fix brief that resolves a landing conflict in the kept worktree.
- **Land again**: the pilot's reply on a conflicted gate2 that re-runs the landing.

## 5. Locked decisions

| # | Decision | Rationale and source | Rejected |
| --- | --- | --- | --- |
| L1 | Landing is derived, not stored: `isLanding` reads the newest gate2's stored Sign off on an open green ticket. `liveTicketOf` skips such a ticket, so today's in-flight signed tickets leave the lane on deploy with no migration. | The Sign off is already stored and never undone (gate2-lands L1). A pivot turns the ticket yellow, which ends it. | A `landing` mark or a fifth state, which needs a write and a migration. |
| L2 | The press fills lanes in place (`fillLanes`), never through a chain hand-off. | A hand-off makes `pilot run` type `/clear` on a pilot "handling other things"; the under-the-mark path already takes in place (ADR 0117). | `chainNext` at the press, which `/clear`s mid-work. |
| L3 | The deck's finish writes the ticket's own record (`recordForTicket`) and never chains. The lanes were filled at the press. | Spec 1. Chaining twice would hand off a lane already filled. | Calling `chainNext` on `landed`. |
| L4 | Ready is retried with `pilot land --ready`, three attempts at `READY_DELAYS_MS = [0, 60_000, 300_000]`, still the one fixed spawn shape (gate2-lands L2: a constant flag, nothing from the store). | A full rerun repeats the suite (`land.mjs:222`); `gh pr ready` failures are transient auth or network. | Rerunning `pilot land` whole; a daemon-side `gh` call. |
| L5 | The pilot re-lands with a `Land again` reply on the gate2, accepted only from the pilot, only on a landing `refused` with a `conflict`. The deck runs land, and `resume()` refuses anything but a merge of the signed source onto pilot. | Auto mode refuses `pilot land` from the crew, and gate2-lands L7 keeps the CLI for the user's hand. `resume()` is the existing guard. | The pilot or the resolver running `pilot land`; a second user press. |
| L6 | The resolver is a `pilot-implementer` on a fix brief; there is no new agent type. Its reviewer is one fresh language reviewer (ADR 0150). | The implementer already loads skills and owns fix briefs. | A `pilot-resolver` definition. |
| L7 | A pilot turn on a conflict is its `Resolving` reply on the gate2, which stops the `CONFLICT_TURN_MS` timer. | It is the only observable the deck can read. | Inferring a turn from tool-call telemetry. |
| L8 | `deck/lanes.mjs` is not touched. | blocked-yellow-yields L6 keeps it narrow; the fill lives in `chain.mjs`. | Folding the fill into `lanesFrom`. |
| L9 | QA runs against a scratch deck (`pilot deck --scratch`, seeded with a run record and a planted landed gate2) plus `npm test`, never the live deck on 4321. | The pilot's QA-environment default. | QA on the live deck. |

## 6. Assumed decisions

Grilling depth: *No grilling* (the user, itm_f9d25ae3b0a7). The two forks below had already been posted on
`itm_97a14cc327a5`, and the user answered both with the default, so each stands as assumed. The QA environment is
the scratch deck plus `npm test` (the user, itm_d107f4e0a882; L9).
The user agreed §2 as written (itm_e3027a457f0c), lines 1–9.

- **A1 `CONFLICT_TURN_MS` is 15 minutes** (spec 5's limit; question `itm_b3efe49b63ab`). Tradeoff: a pilot deep in a
  long turn hands over a conflict it would have taken minutes later. Rejected: 5 min (questions the pilot was about
  to take), 60 min (a stuck conflict sits an hour).
  Verdict: stands
  Answered: "15 minutes" (the user, itm_b3efe49b63ab): the default, taken as written.
- **A2 Past the ready bound, the deck writes the report anyway** and closes the ticket. Its first human step names the
  draft PR and the open `Mark #N ready` question (question `itm_b17e7293920a`). Tradeoff: the ticket reads closed while
  one GitHub click is still the user's. Rejected: holding the report until the user answers, which leaves a landing
  ticket nobody owns. It amends `agents/pilot.md:492`'s "the closing report waiting for it".
  Verdict: stands
  Answered: "Write it anyway" (the user, itm_b17e7293920a): the default, taken as written.

## 7. Out of scope

Removing `pilot landing` or `pilot land` (gate2-lands L7, L8; the pilot stops running the wait, and both commands stay
for the user's hand). A configurable bound or limit (L4, A1). Automatic resolution of anything but the generated
files `mergeResolved` already takes. Changes to `deck/lanes.mjs` (L8). Re-landing a `refused` landing that is not a
conflict (the user presses again, gate2-lands A1). The co-pilot's prose, which never touches the landing. The store,
daemon and doctor tickets.

## 8. Slices

Width 4 (S1, S2, S10, S11); longest stem 7 (S2 → S3 → S5 → S6 → S7 → S8 → S9). The stem is the landing files
(`landing.mjs`, `store-items.mjs`) each later slice edits. Rebase: the feature branch is cut from `pilot` after
`feat/blocked-yellow-yields` lands there. Until then, S1, S4, S6, S7 and S8 (`items.mjs`, `store-items.mjs`,
`server-wait.mjs`) and S9 (`agents/pilot.md`, the pin) rebase over its S1–S7. S10 takes 0154, the next number after
its 0153.

| # | Title | Spec | Files owned | After | Reviewers | Model | File |
|---|---|---|---|---|---|---|---|
| S1 | Skeleton: the press frees the concluding lane | 1, 2 | `deck/items.mjs`, `deck/chain.mjs`, `deck/store-items.mjs` (`beginLanding`, `noteLaneFilled`), `deck/server-routes.mjs` (`/reply`), `deck/test/press-frees-lane.test.mjs` (new) | – | ts, security | opus | [S1](slices/S1.md) |
| S2 | A deck finish never stops a pilot that holds a lane | 8 | `deck/server-tools.mjs` (`stopReason`), `deck/test/stop-holds-lane.test.mjs` (new) | – | ts | opus | [S2](slices/S2.md) |
| S3 | The deck writes the closing report on landed | 2, 4 | `deck/closing-report.mjs` (new), `deck/store-runs.mjs` (`finishRecord`, `noteLanding`), `deck/landing.mjs`, `deck/daemon.mjs`, `deck/test/closing-report.test.mjs` (new) | S2 (`stopReason` reads a deck finish) | ts | opus | [S3](slices/S3.md) |
| S4 | Report due reaches the pilot and its findings append | 4 | `deck/store-items.mjs` (report reply), `deck/closing-report.mjs`, `hooks/inbox-alert.js`, `deck/test/report-due.test.mjs` (new), `hooks/test/inbox-alert.test.js` | S1 (`deck/store-items.mjs`), S3 (`deck/closing-report.mjs`) | ts, security | opus | [S4](slices/S4.md) |
| S5 | The deck retries pr ready before asking | 3 | `scripts/land.mjs` (`--ready`), `deck/landing.mjs`, `deck/test/landing-ready.test.mjs` (new), `scripts/test/land-ready.test.mjs` (new) | S3 (`deck/landing.mjs`, `closeLanded`) | ts, security | opus | [S5](slices/S5.md) |
| S6 | A second press queues instead of refusing | 7 | `deck/store-items.mjs` (`refuseLanding`, `queueLanding`), `deck/landing.mjs`, `deck/test/landing-queue.test.mjs` (new) | S5 (`deck/landing.mjs`), S4 (`deck/store-items.mjs`) | ts, security | opus | [S6](slices/S6.md) |
| S7 | A conflict is recorded and handed over past the limit | 5 | `deck/store-items.mjs` (`settleLanding`), `deck/landing.mjs` (exit code), `deck/server-wait.mjs` (`armConflicts`), `deck/test/landing-conflict.test.mjs` (new) | S6 (`deck/landing.mjs`, `deck/store-items.mjs`) | ts, security | opus | [S7](slices/S7.md) |
| S8 | The pilot's Resolving and Land again replies | 5 | `deck/store-items.mjs` (gate2 pilot replies), `deck/server-tools.mjs` (`deck_reply`), `deck/test/land-again.test.mjs` (new) | S7 (`landing.conflict`, `deck/store-items.mjs`), S2 (`deck/server-tools.mjs`) | ts, security | opus | [S8](slices/S8.md) |
| S9 | The pilot's and QA's prose name the new order | 5, 6 | `agents/pilot.md`, `agents/pilot-qa.md`, `scripts/test/landing-wording.test.mjs` (new), `scripts/test/measure-prompt.test.mjs` | S8 (the `Resolving` and `Land again` words), S4 (`report due`) | ts, security | opus | [S9](slices/S9.md) |
| S10 | ADR 0154 records the deck-owned landing | 6 | `docs/adr/0154-gate2-frees-the-lane.md` (new), `docs/adr/README.md` | – | ts | sonnet | [S10](slices/S10.md) |
| S11 | The vocabulary guard keeps this run's quoted words (added) | 9 | `scripts/vocabulary.mjs` (`EXCEPTIONS`), `scripts/test/vocabulary-guard.test.mjs` | – | ts | sonnet | [S11](slices/S11.md) |
| S12 | A landing row and a report due read as what they are (added) | 10 | `deck/ui/render-rail.mjs`, `deck/items.mjs` (`threadState`) | – | ts | sonnet | [S12](slices/S12.md) |

Reviewers: ts = `pilot:typescript-reviewer`, security = `pilot:security-reviewer` (the `/reply` route, a hook, a
process start's argv, a trust boundary on who re-runs a landing, agent configuration). Sonnet for S10 and S11, which
are precise and off the trigger. Opus elsewhere.

## 9. Acceptance evidence

On a scratch deck (`pilot deck --scratch`, seeded with a run record and a feature worktree whose `npm test` is green,
`origin` a local bare repository; never 4321, L9) plus `npm test`, in the order the user meets it:

1. Press Sign off on the gate2: the ticket's rail reads `landing`, the next green ticket is live at once, and the
   thread reads `landing started` (1, 2).
2. Press a second gate2 meanwhile: it reads `landing queued` and starts once the first settles (7).
3. With `gh` failing once, the landing lands, ready succeeds on the retry, and no question appears (3). With it failing
   throughout, one `Mark #N ready` question appears on the old ticket (3, A2).
4. With no pilot session, the report item appears after `landed`: SHA, merge-first, slices, worktrees, friction. The
   ticket reads closed (4). With a session, its next tool call shows `report due`, and its `Findings:` reply appends (4).
5. The pilot's `deck_wait` keeps listening after the deck's finish while a lane holds a ticket (8).
6. A planted conflict reads `NOT landed … conflicts`. `Resolving`, then a committed resolution and `Land again`, lands
   it. With no `Resolving`, the blocked question appears after the limit (5, A1).
7. The wording pins, the pin diff, ADR 0154 in the index, the vocabulary guard and `check-references` all pass (6, 9).

## 10. Status

| Slice | State | Branch | PR | Worktree | Blockers | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1, 2 |
| S2 | planned | | | | – | 8 |
| S3 | planned | | | | S2 | 2, 4 |
| S4 | planned | | | | S1, S3 | 4 |
| S5 | planned | | | | S3 | 3 |
| S6 | planned | | | | S5, S4 | 7 |
| S7 | planned | | | | S6 | 5 |
| S8 | planned | | | | S7, S2 | 5 |
| S9 | planned | | | | S8, S4 | 5, 6 |
| S10 | planned | | | | – | 6 |
| S11 (added) | planned | | | | – | 9 |
| S12 (added) | planned | | | | – | 10 |
| gate2-frees-lane | planned | `feat/gate2-frees-lane` | | | S1–S11 | 1–9 |
