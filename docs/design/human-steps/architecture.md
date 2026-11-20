# Human steps are a green thread

Ticket `itm_7d3455d28cd6` · slug `human-steps` · base `origin/pilot` d2358d9f (re-cut from d03db508) · ADR 0202 (`docs/adr/0202-human-steps.md`, S1)

## 1. Problem

The user keeps closing reports as records and does not read them, so the human steps inside them (merge the main
PR, set an environment variable, grant a permission, remove a kept worktree) get forgotten. They want the steps
out of the report, in a thread of their own after Gate 2, with the ticket left in the green section until they
press Done on that thread. It is a reminder list: nothing waits on it and nothing monitors it.

## 2. Spec

| # | Behaviour | Evidence | Bar |
| --- | --- | --- | --- |
| 1 | When the lander posts the closing report of a landed gate2, the deck posts one `steps` thread on the ticket in the same `deck_post` call: the main-PR step, the recorded steps, one step per worktree left, the prune step, in that order, each one line. | `human-steps-fill.test.mjs`: a landed gate2 and a record with one recorded step give one steps thread | exactly 1 thread, 4 steps in that order, each 1-300 chars, no newline |
| 2 | The closing report stays a record and carries no human steps; the pilot's `Findings:` reply carries findings only. | `closing-report.test.mjs`; a read of `agents/pilot.md` "Ending a run" | 0 `Human step` lines in the report body; 0 step instructions in the Findings prose |
| 3 | The ticket stays open and green after the report while its steps thread is open; the user's Done closes the thread and the ticket in one write. | `human-steps.test.mjs` | `stateOf` = green after the report, = closed after Done |
| 4 | Nothing waits on the thread: no lane holds the ticket, `pilot wait` and `deck_wait` are not woken by it or its Done, the Stop gate does not hold for it, and the next green ticket is taken. | `human-steps.test.mjs`, `hooks/test/join.test.js` | 0 lanes held, 0 replies handed to the pilot, `awaitsUser` false, `nextTicketOf` returns the next green ticket |
| 5 | A landing with no human steps posts no thread, and the report closes the ticket as today. | `human-steps.test.mjs`: a report posted on a ticket no steps thread names | 0 steps threads, ticket closed in the report's write |
| 6 | Only the user's Done closes a steps thread: an agent's resolve of one is refused. | `human-steps.test.mjs` | `resolveItem` by pilot/lander/qa throws `DeckRefusal`; thread stays open |
| 7 | A step the crew finds during the run (an env var, a permission, a revert) is recorded on the run record as it arises, never recalled at the end; a credential value in it is refused. *practitioner: release manager's post-deploy checklist, filled as the work finds each item* | `human-step-record.test.mjs` | `deck_status` `step` appends 1 entry; a token-shaped value is refused; 21st step refused |
| 8 | A retried report post on a ticket that already has its report posts no second report and no second steps thread. *red team* | `human-steps-fill.test.mjs` | 1 report, 1 steps thread after two posts; the second is refused naming the first |

G1: every landing has a main-PR step (`mainStep` always returns one), so in practice every run gets a thread; spec 5
is the guard. Taken as the user's intent (main, 2026-11-19).

## 3. Findings

- `deck/store-items.mjs:170-175`: posting a `report` with a ticket closes the ticket in the post's write, clearing
  `live` and `concludedBy` (yellow-never-idle, d2358d9f; `concludedBy` lets a gate2 post on a green ticket,
  `:216`). Spec 3 adds one condition there; Done must clear the same fields, so S1 folds the close into `closeTicket`.
- `deck/closing-report.mjs:54-67,81-112`: `mainStep` and `PRUNE_STEP` are the only `Human step:` lines; `postFilled`
  (159-185) fills the lander's bodiless report from the run record and notes `REPORT_DUE`. crew-refusals S3 (#121)
  adds `blockedStepLines` here: S2 rebases after it.
- `deck/items.mjs:575`: `isLanding` holds for an open green ticket whose newest gate2 has the user's Sign off, so
  `liveTicketOf` and `nextTicketOf` already skip a ticket that stays open after its report: no lane change (spec 4).
- `deck/items.mjs:123,134` `STANDING_KINDS`, `RECORD_KINDS`, mirrored in `hooks/lib/deck.js:326,337` and pinned by
  `hooks/test/join.test.js`: a standing kind is never queued, never in Yours, never held at the Stop gate
  (`hooks/stop-gate.js:102-112`); a record takes no reply, so nothing is handed to a waiting pilot.
- `deck/store-items.mjs:765-776` `closeItem`: the page's Close, for `CLOSABLE_KINDS = [question, user]`; it pushes a
  user reply with a `seq`, which `repliesSince` would hand to the owner. Done on a steps thread must not.
- `deck/owed.mjs:24` `isReportOwed`: open ticket + landed gate2. With the ticket left open it would read `report owed`
  forever (`pilot wait`, `render-cards.mjs:285`). Red team find, fixed in S1.
- `deck/ui/render-rail.mjs:79-87` `ticketLabelOf`: a landing ticket reads `landing`; S1 reads `human steps` while a
  steps thread is open.
- `deck/server-tools.mjs:409-422` `deck_status` passes `friction` to `setSlices` (`store-runs.mjs:551`), which
  appends it to the record: the pattern S3's `step` copies.
- `agents/pilot.md:610-623` "Ending a run": the pilot's `Findings:` reply lists the human steps; `REPORT_DUE`
  (`items-bounds.mjs:45`) asks for them. S4 moves both.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| Steps thread store | `postSteps`, `closeItem` (steps branch), `resolveItem` refusal | the kind's lifecycle: post, close with ticket, refuse agents, leave the report's close off | in-process |
| Steps of a landing | `stepsOf(record, gate, left)` | `mainStep`, `PRUNE_STEP`, worktree lines, recorded steps, the schema | in-process (pure) |
| Recorded steps | `deck_status` `step` → `record.humanSteps` | append, bound, credential refusal | in-process |
| Ticket close | `closeTicket(ticket, by, at)` | state, resolution, `resolvedAt`, clearing `live` and `concludedBy`: the report's and Done's one path | in-process |
| Report owed | `isReportOwed(ticket, items)` | reads a posted report, not only the landed gate2 | in-process (pure) |

Deletion test: `mainStep`/`PRUNE_STEP` as report lines vanish into `stepsOf` (one caller each, folded, no fold slice:
S2 moves them). `postFilled` survives: it is the one place a lander's report becomes a report.

## 4. Ubiquitous language

- **Human step**: one line the user does by hand after a landing; never a question, never waited on.
- **Steps thread**: the `steps` item holding a ticket's human steps; posted only by the deck.
- **Done**: the user's press that closes a steps thread and its ticket.
- **Recorded step**: a human step sent with `deck_status` `step` during the run, kept on the run record.
- **Worktree left**: a run worktree still on disk when the report posts (lander-tail spec 5).

## 5. Locked decisions

- **L1** Depth: Forks (user, itm_217cb90cae5e): only the assumed decisions whose paths fork are posted.
- **L2** The lander still posts one bodiless report; `postFilled` posts the steps thread first, then the report,
  and the report post closes the ticket only when no open steps thread names it. Rejected: one combined store
  write (a second write path beside `postItem` for one call site).
- **L3** `steps` is a known kind kept out of `POSTABLE_KINDS`, like `chat`: `deck_post` refuses it and only
  `postSteps` makes one, so the schema and the writer cannot be bypassed. Rejected: a postable kind the pilot posts
  (nothing ensures it is posted; a second writer of steps).
- **L4** Done writes the close without a reply `seq`, so no waiter is handed it (spec 4). Rejected: reusing
  `closeItem`'s user reply (wakes the owner).
- **L5** Step schema: a string, trimmed, 1-300 chars, no newline, at most 20 per thread and per record, credentials
  refused by `refuseCredentials`. Kept as `{ text }` objects so a later tick is a field, not a migration.
- **L6** `isReportOwed` is false once a report names the ticket (red team).
- **L7** Small-diff limit 300 changed lines per slice; past it the implementer stops and asks `main`.
- **L8** The run's ADR is `docs/adr/0202-human-steps.md`, written in S1, amending ADR 0148 and ADR 0154 A2.

## 6. Assumed decisions

- **A1** Where non-deck steps come from: the crew's steps are sent with `deck_status` `step` as they arise and kept
  on the record; `stepsOf` reads them. Trades: the pilot must send them before the press; a step found after the
  report has no way in. Rejected: the pilot posting or replying steps after `REPORT_DUE` (two writers, unenforced).
  Not posted (main).
  Verdict: stands — the user asked for steps "posted by whoever writes the closing report"; one writer, the deck's fill from the record
- **A2** One Done per thread, not a tick per step. Trades: no partial progress shown. Rejected: a stored tick per step
  (a route and a write per press). Posted by main as itm_c5aaa6a3e9b3; L5 keeps the shape able to take a tick.
  Verdict: stands — the user chose "One Done" on itm_c5aaa6a3e9b3
- **A3** A new `steps` kind, not a report or walkthrough reused. Trades: one more kind in the mirrors and renderer.
  Rejected: a walkthrough (it waits on the user and holds the Stop gate). Not posted (main).
  Verdict: stands — the user asked for it "schematised"; no queued ticket claims a steps kind
- **A4** The thread is standing and a record: not in Yours, not counted on the tab; the reminder is the ticket in
  the green group labelled `human steps`, and the thread under it. Trades: no Yours card. Rejected: a Yours card that
  holds nothing (a third predicate beside standing and queued; the Stop gate holds pilot-posted queued items).
  Not posted (main). Changed from the first findings' default (Yours), on the Stop-gate evidence.
  Verdict: stands — the user said nothing waits on it and it needs no monitoring; a Yours card would hold the Stop gate (hooks/stop-gate.js:102)
- **A5** Worktrees left stay listed in the report as record lines and each also becomes a step `Remove <path> when
  you are done with it.` Rejected: steps only (the record loses what was on disk).
  Verdict: stands — worktrees left as steps is the reminder the user asked for; the report keeps them as record

## 7. Out of scope

- Ticking steps one by one (A2), editing or adding a step after the thread is posted.
- Dedupe of one main PR across several threads (G3): each thread repeats it.
- Detecting that a step was done (nothing monitors).
- Migration: tickets already closed stay closed; a ticket reopened after its Done is today's reopen.
- The Rune UI (itm_0dcd9aa67146) re-renders the Done button later.

## 8. Slices

Width 2; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Walking skeleton: Done on a steps thread closes its green ticket and wakes nobody | 3, 4, 5, 6 | `deck/items.mjs`, `deck/store-items.mjs`, `deck/owed.mjs`, `hooks/lib/deck.js`, `hooks/test/join.test.js`, `deck/ui/render-cards.mjs`, `deck/ui/render-rail.mjs`, `deck/test/human-steps.test.mjs` (new), `docs/adr/0202-human-steps.md` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | The lander's report posts the steps thread and loses its human steps | 1, 2, 8 | `deck/closing-report.mjs`, `deck/test/closing-report.test.mjs`, `deck/test/closing-main-pr.test.mjs`, `deck/test/host-none-report.test.mjs`, `deck/test/report-post-body.test.mjs`, `deck/test/human-steps-fill.test.mjs` (new) | S1 (`postSteps`), S3 (`record.humanSteps`) | `pilot:typescript-reviewer` | [S2](slices/S2.md) |
| S3 | A human step sent with deck_status is kept on the run record | 7 | `deck/server-tools.mjs`, `deck/tools.mjs`, `deck/store-runs.mjs`, `deck/test/human-step-record.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S3](slices/S3.md) |
| S4 | The pilot records steps as they arise and its Findings carry none | 2, 7 | `agents/pilot.md`, `agents/pilot-lander.md`, `deck/items-bounds.mjs`, `hooks/test/inbox-alert.test.js`, `deck/test/report-due.test.mjs`, `scripts/test/measure-prompt.test.mjs` | S3 (`deck_status` `step`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S4](slices/S4.md) |

S1 and S3 start at once; S1 first by risk (if the Stop gate or a waiter still sees the thread, spec 4 needs another
shape). S2 after both; S4 after S3. S2 also rebases after crew-refusals S3 lands `deck/closing-report.mjs`.

- red team: `isReportOwed` reads open ticket + landed gate2; left open, the ticket reads `report owed` in `pilot wait`
  and on its card forever. S1 owns `owed.mjs` (L6).
- red team: a lander that retries its report post after a timeout would post a second report and thread, since the
  ticket is now still green; today the closed ticket refuses it. S2 refuses a second report on a ticket (spec 8).
- red team: `closeItem` pushes a user reply with a `seq`; `repliesSince` hands it to the owner and wakes a waiting
  pilot. S1's Done branch writes no `seq` (L4), pinned in behaviour 3.
- red team: `deck_post` would accept `steps` if it were postable, and an agent could post or close one: L3 keeps it
  out of `POSTABLE_KINDS`; S1 behaviour 4 pins the refusal.
- red team: crash between S2's two posts leaves a thread and no report; the lander's retry finds an open steps thread
  and posts only the report (S2 behaviour 3). Seams half-built by two slices: none; `record.humanSteps` is written
  whole in S3 and read whole in S2.
- red team (re-cut, d2358d9f): yellow-never-idle landed a `concludedBy` the report clears on close. Left open by a
  steps thread, a ticket would keep it and take a second gate2 (`store-items.mjs:216`), and Done would close without
  clearing it. S1: the report clears `live` and `concludedBy` whether or not it closes; report and Done close through
  one `closeTicket` (behaviours 1, 3). S3: only line anchors moved; the `deck_status` arg list is untouched.

## 9. Acceptance evidence

On a scratch deck (`npm test` plus a scratch `pilot deck`), in the order the user meets it:

1. During a run the pilot sends `deck_status` with `step: "Set STRIPE_KEY in Vercel (value in 1Password)"`; a value
   is refused (spec 7).
2. Gate 2 signed, landed: the lander's report shows no `Human step` line (spec 2); a `Human steps` thread sits under
   the ticket with main-PR, the recorded step, each worktree left, prune (spec 1).
3. The ticket stays in the green group labelled `human steps`; no lane holds it; the next green ticket is taken; the
   pilot is not woken; the session stops freely (spec 3, 4).
4. The pilot's attempt to resolve the thread is refused (spec 6). The user presses Done: thread and ticket closed
   (spec 3).
5. A second report post on the ticket is refused (spec 8); a landing with no steps closes on the report (spec 5).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | `slice/human-steps-s1` | – | – | – | 3, 4, 5, 6 |
| S2 | planned | `slice/human-steps-s2` | – | – | S1, S3 | 1, 2, 8 |
| S3 | planned | `slice/human-steps-s3` | – | – | – | 7 |
| S4 | planned | `slice/human-steps-s4` | – | – | S3 | 2, 7 |
| Human steps are a green thread | planned | `feat/human-steps` | – | – | S1-S4 | 1-8 |
