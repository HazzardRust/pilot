# Merge first, by the architect

Feature `merge-first` · ticket itm_9aa2494af867 · base `origin/main` bfd7616 (after PR #282, crew-waits) ·
design branch `design/merge-first`

## 1. Problem

Two failures from the slice-estimates run, in the user's words:

> okay slice count is only 3, at what point does it get merged with another ticket with a similar surface?

> I want the merge to happen as the first step, so we can make the cut 1 time, rather than building part of
> the cut and then merging it with something else and re-cutting. this merging ticket should be the
> architect's job, and it should be able to own it's own thread with regards to merging tickets.

> like make sure the mechanics are encapsulated in the architect rather than giving the pilot yet another job

> this happened because there is some prompt rot lying around. the old system was that you could just infer
> when i sign off, but now it relies on me pressing on the button. because of that prompting, you closed a
> thread prematurely. lets find that rot and get rid of it otherwise future pilots will make the same mistake.

- **The merge was skipped.** "Merge each same-surface green ticket into the live one before step 2" is one
  clause of the pilot's step 1 (`agents/pilot.md:186-187`) and item 2 of ticket-making's Merging
  (`skills/ticket-making/SKILL.md:124-129`). Nothing checks it, the run record has no field for it, a session
  resumed from the record starts past it, and judging surfaces means reading every green ticket's body (this
  deck's open threads are 85,000 characters, more than one `deck_read` returns).
- **A gate closed on typed words.** The pilot closed a `gate1` with `deck_resolve` on the user's typed "i
  want to sign off on this gate". The deck accepted it silently: only a pressed Sign off moves the ticket and
  writes the plan (`deck/store.mjs:855-871`), and the answer was a plain `Closed …` (`deck/server.mjs:847-849`).

## 2. Spec

Agreed with the user on 2026-10-04 as proposed; lines 7-10, found by the architect, stand on assumed
decisions A6-A9 and on L11. The user's own test is the **next** run's first step (L2).

| # | Behaviour | Evidence |
|---|---|---|
| 1 | The merge is the architect's first act: before any research or finding it lists the repository's green queue and names the tickets on the live ticket's surface, so the cut is made once. | Next run: the architect's merge thread is posted before the pilot receives its first findings, and the artefact's §2 carries the merged tickets' spec lines. Scratch deck: a live ticket and two same-surface green tickets are both merged before the architect's first `SendMessage`. |
| 2 | The architect owns the merge thread: a `question` naming the live ticket, waited on with `pilot wait --as architect --item <id>`. | The thread's `owner` reads `architect` in `deck_read`; the reply shows "Seen by architect"; the pilot's `pilot wait` is not woken by it. Pinned in `deck/test/architect-owner.test.mjs`. |
| 3 | The architect makes the merge call itself: `deck_ticket merge` per chosen ticket, then it resolves its thread saying what was merged. | Each merged ticket's resolution reads "merged into itm_…" (`store.mjs:1082`); the thread's `resolvedBy` is `architect`; the transcripts show no pilot deck call between the user's reply and the merge. |
| 4 | The mechanics live in the architect: the pilot's instructions lose their merge sentence and gain no job, and the merge rule has one spelling. | `grep -n "deck_ticket merge" agents/pilot.md` prints nothing; ticket-making's Merging item 2 points at the architect; the pilot's prompt-share pin is lowered to its new measure. |
| 5 | The step cannot be skipped silently: a `gate1` is refused while its repository holds another open green ticket and no merge decision names its ticket. (L13) | `deck_post` of a `gate1` on a scratch deck answers "the architect's merge step has not run for itm_…"; pinned in `deck/test/merge-gate.test.mjs`. |
| 6 | No gate passes on typed words: the deck refuses `deck_resolve` on a `gate1` or `gate2` with no Sign off pressed, the hooks tell the pilot to reply asking for the press, and the swept prose says the press is the pass. (L12) | A deck test of the refusal; hook tests of the gate text; the swept lines (§3 F6) reworded; on a scratch deck a typed "i sign off" on a `gate1` gets the pilot's reply asking for the press and the gate stays open. |
| 7 | With no answer the architect merges nothing: it keeps reading while its wait runs and sends no finding until the thread resolves. *(assumed, A6)* | `agents/pilot-architect.md` "Merge first" says so; a pin. |
| 8 | With no other green ticket nothing is posted; with candidates none of which shares the surface, the architect posts the thread and resolves it itself with its reasons, as a record. *(assumed, A7, A8)* | Pins on the architect's section; `pilot tickets` on a one-ticket scratch deck prints "no other green ticket". |
| 9 | A re-spawned architect does not ask twice: the queue listing shows the live ticket's merge decision when one exists. *(assumed, A9)* | `pilot tickets` after a resolved merge thread prints "merge decided: itm_… — <resolution>"; pinned in `deck/test/tickets.test.mjs`. |
| 10 | The architect reads the queue with a read-only `pilot tickets`, printing the repository's green tickets in queue order with their bodies and comments; it hands no reply over. (L11) | `pilot tickets` on a scratch deck prints the live ticket first and each green ticket's id, title, size, body and comments; no reply is marked delivered. |

## 3. Findings

- **F1 Owner kinds.** `OWNER_KINDS = ['pilot', 'qa', 'teacher', 'auditor']` (`deck/items.mjs:497`). An
  `architect` post is owned by the pilot today: `owner: waiterKind(author) ?? 'pilot'` (`deck/store.mjs:599`),
  and `waiterKind` returns null for a kind outside the list (`items.mjs:521`). `architect` is already an
  author kind (`items.mjs:473`), so the hook stamps it. `pilot wait --as` validates against `OWNER_KINDS`
  (`deck/wait.mjs:164`), and so does the daemon's wait refusal (`deck/server.mjs:965`): adding the kind is
  the whole wait-side change. `PASS_KINDS` stays `['pilot', 'qa']`, as for the auditor (ADR 0058).
- **F2 Precedent.** The teacher (`agents/pilot-teacher.md`, ADR 0053) and the auditor (`agents/pilot-auditor.md`,
  ADR 0058) post a thread, own it, wait with `pilot wait --as <kind> --item <id>` in a background shell
  (ADR 0061 L4, L9), and resolve it. If the owner goes quiet, ADR 0045's fallback hands the thread to the pilot.
- **F3 Merge.** `mergeTicket(id)` (`store.mjs:1063-1087`) folds a green ticket into the live green one: body and
  comments as a reply, estimate summed, the merged ticket closed `merged into <host>`; a merged ticket cannot be
  reopened (`store.mjs:918`). The `deck_ticket` handler checks no author (`server.mjs:893-897`).
- **F4 Gate1 already waits for its questions.** An open `question` naming the gate1's ticket refuses the gate1
  post (`store.mjs:546-556`), so an open merge thread already holds Gate 1; only the skipped thread is uncaught.
- **F5 Resolve.** `resolveItem` closes any gate its owner names; `signed = chosenOf(item) === SIGN_OFF`
  only decides whether the ticket moves (`store.mjs:855-871`). Its one caller is the `deck_resolve` tool
  (`server.mjs:848`). The user's Dismiss on the page closes any item (`store.mjs:982`), so a refused stale
  gate still has an exit.
- **F6 Prompt rot (the pilot's explorer sweep, at origin/main).** Hooks: `hooks/inbox-alert.js:87-92` ("close
  it with deck_resolve … You cannot end your turn while an answer is unresolved") and `hooks/stop-gate.js:179-196`
  ("close the thread with deck_resolve") fire on gates too; `inbox-alert.js:67-68,85` "This is Gate 2 to
  record; QA closes the thread" is stale. The Stop gate already lets a `deck_reply` end the turn
  (`stop-gate.js:189-191`), so the fix there is text. Prose: `agents/pilot.md:34-35, 163-164, 177-178,
  271-275, 319, 353, 494`; `CLAUDE.excerpt.md:41-45`; `rules/vertical-execution.md:87-92`;
  `rules/orchestration.md:42-43, 51`; `agents/pilot-qa.md:156, 162, 185-187`; `CONTEXT.md:70`. The correct
  spelling already exists: the gate notes (`items.mjs:382, 388`) and "Only a Sign off moves a ticket (L11)"
  (`store.mjs:855`). Pins those edits break: `scripts/test/pilot-agents.test.mjs:332, 338, 354`;
  `scripts/test/crew-waits.test.mjs:84-94`; `deck/test/ticket-state.test.mjs:103`; `deck/test/estimate.test.mjs:49`;
  `hooks/test/inbox.test.js:661, 845-856`; `hooks/test/owner-hooks.test.js:207`.
- **F7 Rules reach the machine.** The install replaces a `~/.claude/rules/` file byte-identical to a version
  this package shipped (`scripts/install-rules.mjs:12-20, 180`), so a reworded `rules/*.md` reaches the user
  once `scripts/shipped-rules.json` gains the new hash (`scripts/build-rules-ledger.mjs`).
- **F8 Prompt budget.** The pilot's own share is pinned at 10336.75 tokens with no headroom
  (`scripts/test/measure-prompt.test.mjs:106-112`): definition + preloaded skills + its deck tools'
  schemas. The pilot preloads no skill, so ticket-making and the architect cost it nothing. The architect has
  no pin. No tool schema changes in this feature.
- **F9 Collision with slice-estimates** (draft PR #289, `docs/design/slice-estimates/` on `feat/slice-estimates`):
  its S1 renames `estimate` to `sliceCount` through `store.mjs` (`mergeTicket`), `server.mjs:896` and the deck
  fixtures; its S2 rewrites `deck/test/estimate.test.mjs`; its S3 rewrites ticket-making (Merging included) and
  `agents/pilot-architect.md` §8. Every one of those files is owned here too (A5).
- **F10 A queued contradiction.** itm_db9d90dd1ba0 "Push-back and PR titles" has a spec line "No crew agent
  posts a question of its own"; this feature has the architect post one (§7).

## 4. Ubiquitous language

- **Green queue**: this repository's open green tickets in deck order, the live one first.
- **Same surface**: the same screen, module or files as the live ticket (ticket-making's existing rule).
- **Merge thread**: the `question` the architect posts naming the live ticket by `ticket`, owned by the architect.
- **Merge decision**: a resolved item posted by the architect whose `ticket` is the live ticket. Derived on read; nothing stores it.
- **The press**: a reply whose text is exactly `Sign off` on a gate, the button's own text (`items.mjs:161`). The only pass.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
|---|---|---|---|
| L1 | Grilling depth is *forks*. | The user, itm_c3b98b5e3da0. | *every* |
| L2 | Nothing is merged into this ticket; the user tests the merge on the next run. | The user, itm_7388db5014b3: "merge none ... it can do the merging on the next run for me to test". | Merging the queue now |
| L3 | `architect` joins `OWNER_KINDS` and not `PASS_KINDS`. | ADR 0058's auditor rule: a kind owns what it posts; no `to` enum grows (that schema is in the pilot's pin). A fallen-back merge thread stays the pilot's. | A pass value for one thread kind |
| L4 | The merge thread is a `question` with `ticket` and two options, "Merge these" and "Merge none"; a typed subset is a reply. | Thread kinds are a closed list (ADR 0051), and a question naming the ticket already holds Gate 1 (F4). | A new `merge` kind |
| L5 | The merge decision is derived on read (§4), one helper `mergeDecisionOf` used by `pilot tickets` and the gate1 check. | No field to migrate or to forget to write; the thread is the record. | A `merged` field on the ticket or the gate1 |
| L6 | The planning-time merge rule moves into the architect; ticket-making's item 2 becomes a one-line pointer, items 1 and 3 stay. | One spelling of each rule; the pilot preloads neither. | Copying it into both |
| L7 | The hooks change text, not logic: a reply carries its item's `kind`, and on a gate the notice says "reply asking for the Sign off press; never deck_resolve it unsigned". | The Stop gate already ends the turn on a `deck_reply` (F6). | A new hold rule in the hook |
| L8 | A refused stale gate is closed by the user's Dismiss, or left while the pilot posts a fresh one; no supersede mechanism. | F5 was wrong that Dismiss closes any item (`dismissItem` refused every known kind); S4 makes it true for gates, A10. | Auto-superseding on re-post |
| L9 | The architect waits in a background shell (ADR 0061 L9) and keeps reading the live ticket's surface while it waits. | Same-surface research is valid whatever is merged; the user is present in green, so the wait is short. | Blocking every tool call on the answer |
| L10 | QA runs against a scratch deck: a second daemon on a spare port with its own store (`PILOT_DECK_DIR`, `PILOT_DECK_PORT`), a live ticket and two same-surface green tickets, a real architect run against it, the gate refusals and the typed "i sign off" case walked there; never the live deck on 4321 nor `~/.claude/pilot/deck.json`. | The user, itm_fc357329682c. The next live run is the user's own test (L2), outside Gate 2. | The live deck |
| L11 | The architect gets `deck_post`, `deck_reply`, `deck_resolve` and `deck_ticket`, limited by its instructions to one merge question thread and the `merge` action; no author check in the deck; the queue is read with `pilot tickets`, never `deck_read`. | The user, itm_3ff6f7efe7c6. Any loopback caller can already name any author (ADR 0061 L14). | A merge-only check in the deck by author kind (`server.mjs:886-897`) |
| L12 | Spec 6 is a deck refusal, hook text and wording: `resolveItem` refuses a `gate1`/`gate2` with no press, naming the press and Dismiss; the hooks on a gate say "reply asking for the Sign off press", and that reply ends the turn; the swept prose names the button. | The user, itm_441c4946c405. The hook text that pushed the resolve (F6) would outlive a wording-only fix. Two pins flip (`ticket-state.test.mjs:103`, `estimate.test.mjs:49`). | Wording only |
| L13 | Spec 5 is refused by the deck: `postItem` refuses a `gate1` while another open green ticket is in its repository and `mergeDecisionOf` finds nothing for its ticket; the refusal says the architect's merge step has not run. | The user, itm_5856545a2804. Prose alone is what failed on the slice-estimates run. | Prose only; a `merged` field on the gate1 |
| L14 | A gate's Sign off and Dismiss are taken only from the deck's own page (Origin check); a local agent that forges the Origin or writes the store can still press, and that is accepted. | The user, itm_7adff48520db, 2026-10-04. | A ticket for a boundary the agent cannot cross |

## 6. Assumed decisions

| # | Question | Default taken | Tradeoff | Rejected | Evidence |
|---|---|---|---|---|---|
| A5 | Run order with slice-estimates | merge-first lands first; slice-estimates rebases: its S3 Merging text lands in the architect's "Merge first" section, its S2 meets L12's flipped pin in `estimate.test.mjs`, its S1 renames `estimate` in `deck/tickets.mjs` too. | slice-estimates' plan needs three edits after its rebase. | slice-estimates first: this feature's test run would not merge | F9 |
| A6 | No answer on the merge thread | Merge nothing on a default; keep reading; send no finding until the thread resolves. | A user away at step 2 holds the architect. | Merging the recommendation: irreversible (`store.mjs:918`) | spec 7 |
| A7 | Empty queue | Nothing posted; the gate1 check passes. | No visible trace that the step ran. | A thread saying "nothing to merge" every run | spec 8 |
| A8 | Candidates, none same-surface | Post the thread and resolve it at once with the reason per candidate. | One closed item per such run. | Asking the user to confirm a non-merge | spec 8 |
| A9 | Re-spawned architect | Reads the decision from `pilot tickets` and skips the step. | None found. | Asking again | spec 9 |
| A10 | The exit of an unsigned gate (found in S4) | `dismissItem` accepts `gate1` and `gate2` and the page draws Dismiss on an open gate; a dismissed gate is never signed and moves no ticket; a fresh gate then posts. | Dismiss, until now for unknown kinds only, gains two known kinds. | `deck_resolve` allowed after a pressed Not yet (contradicts "Not yet keeps it open") | spec 6 |

## 7. Out of scope

- itm_db9d90dd1ba0's line "No crew agent posts a question of its own" contradicts spec 2; that run resolves it.
- Merging after the first finding: a same-surface ticket posted mid-run is queued, never merged (the cut is once).
- Merging a yellow ticket, or into a non-live ticket (`store.mjs:1069-1070`).
- Walkthrough Sign off and its exact-text signing (`store.mjs:1172`): a typed bare "Sign off" equals the press.
- The `deck_resolve` and `deck_ticket` tool descriptions: they sit in the pilot's pin; the refusal text speaks.
- The slice-estimates unit change (`sliceCount`).

## 8. Slices

| # | Title | Spec | Files owned | After | File |
|---|---|---|---|---|---|
| S1 | Walking skeleton: `pilot tickets` lists the queue and an architect-owned thread is waited on | 2, 9, 10 | `deck/items.mjs`, `deck/tickets.mjs` (new), `deck/server.mjs`, `bin/pilot.mjs`, `deck/test/tickets.test.mjs` (new), `deck/test/architect-owner.test.mjs` (new), `deck/test/owner.test.mjs`, `deck/test/wait-as.test.mjs` | – | [S1](slices/S1.md) |
| S2 | The architect merges first, and the pilot and ticket-making let go of it | 1, 3, 4, 7, 8 | `agents/pilot-architect.md`, `agents/pilot.md`, `skills/ticket-making/SKILL.md`, `scripts/test/ticket-making.test.mjs`, `scripts/test/merge-first.test.mjs` (new), `scripts/test/measure-prompt.test.mjs` | S1 | [S2](slices/S2.md) |
| S3 | A gate1 is refused when the merge step did not run | 5 | `deck/store.mjs`, `deck/test/merge-gate.test.mjs` (new), deck test fixtures a refused gate1 breaks | S1 | [S3](slices/S3.md) |
| S4 | The deck refuses an unsigned gate close and the hooks ask for the press | 6 | `deck/store.mjs`, `hooks/inbox-alert.js`, `hooks/stop-gate.js`, `deck/test/gate-resolve.test.mjs` (new), `deck/test/ticket-state.test.mjs`, `deck/test/estimate.test.mjs`, `hooks/test/inbox.test.js`, `hooks/test/owner-hooks.test.js` | S3 | [S4](slices/S4.md) |
| S5 | The prompt rot is reworded: the press is the pass | 6 | `agents/pilot.md`, `agents/pilot-qa.md`, `CLAUDE.excerpt.md`, `rules/vertical-execution.md`, `rules/orchestration.md`, `scripts/shipped-rules.json`, `CONTEXT.md`, `scripts/test/pilot-agents.test.mjs`, `scripts/test/crew-waits.test.mjs`, `scripts/test/measure-prompt.test.mjs` | S2 | [S5](slices/S5.md) |

DAG: S1 → S2 → S5 and S1 → S3 → S4. S2 ∥ S3 and S5 ∥ S3/S4 are disjoint. S3 and S4 share `deck/store.mjs`
(different functions) and run in sequence. Five slices: one run, no Runs table.

## 9. Acceptance evidence

On the scratch deck (L10), in the order the user meets it:

1. `pilot tickets` lists the live ticket and two seeded same-surface green tickets, and a third on another surface (spec 10).
2. A real architect spawned on the live ticket posts a merge thread naming the two, owned by `architect`, before any message to the pilot (spec 1, 2).
3. The user presses "Merge these"; "Seen by architect" shows under it, the pilot's wait does not wake; both tickets close "merged into itm_…" and the thread resolves by the architect (spec 2, 3).
4. A re-run of `pilot tickets` prints "merge decided" (spec 9); the artefact's §2 carries the merged spec lines (spec 1).
5. On a second scratch ticket with candidates and no merge thread, `deck_post` of a `gate1` is refused naming the step (spec 5).
6. On a posted `gate1`, the user types "i sign off": the pilot replies asking for the press; its `deck_resolve` is refused; the press then lets it close and the ticket turns yellow (spec 6).
7. `grep -n "deck_ticket merge" agents/pilot.md` prints nothing, and `npm test` is green with the lowered pilot pin (spec 4, 6).

The user's own test is the next live run's first step (L2).

## 10. Status

| Slice | State | Branch | PR | Worktree | Blocker | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 2, 9, 10 |
| S2 | planned | | | | S1 | 1, 3, 4, 7, 8 |
| S3 | planned | | | | S1 | 5 |
| S4 | planned | | | | S3 | 6 |
| S5 | planned | | | | S2 | 6 |
| merge-first (feature) | planned | | | | S1-S5 | 1-10 |
