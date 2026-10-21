# Crew agents wait in the background

Feature `crew-waits` · ticket itm_9ff19d0cd2b1 · base `origin/feat/ticket-states` 84860f5 (0.7.17, PR #270
open) · design branch `design/crew-waits`

## 1. Problem

In the ticket-states runs, a crew agent held up an autonomous run twice, and both times the pilot noticed only
when the user asked "is qa stuck?".

- **Run 1.** After Gate 2, QA was told to flip PR #260 to ready. It re-ran walkthrough steps in the browser
  instead, and the pilot's messages sat "queued for delivery".
- **Run 2.** QA parked inside `deck_wait` with a 55-minute timeout. A `SendMessage` is delivered only between
  an agent's tool calls, so four of the pilot's messages queued up. Stopping QA also killed its scratch deck
  and its keeper.
- **Left on read.** Separately, QA read a user's reply on its walkthrough and then built for 5–10 minutes
  before saying anything: "you need to respond to me rather than leaving me on read".

The user wants every crew agent that waits to use the pilot's system. The agent starts a background
`pilot wait` and ends its turn, so a `SendMessage` resumes it at once.

## 2. Spec

Sharpened against 84860f5 and agreed by the user as proposed on 2026-10-04 (deck itm_e1cee8396386).

| # | Behaviour | Evidence |
|---|---|---|
| 1 | Once the user Signs off the walkthrough, QA corrects the feature PR body and posts its QA comment, then reports and keeps waiting. Once the `gate2` is signed, the pilot runs `gh pr ready` itself and tells QA only to tear down. No step waits on a crew agent for an action the pilot can do in two tool calls. (L10) | `pilot.md` step 9 and `pilot-qa.md` "When the user is satisfied" say so; a pin on each. |
| 2 | A `SendMessage` to a crew agent whose result says it was queued, not that the agent resumed, is treated as undelivered. The pilot checks for the expected effect (a PR state, a deck item, a report) after a bounded wait of its own. If the effect is absent, it stops the agent and either does the step itself or re-briefs it. | The rule in `pilot.md` names both result texts, "Resuming agent <id>" (delivered now) and "Message queued for delivery to <id> at its next tool round" (the agent is mid-turn or parked in a tool call); a pin. |
| 3 | A crew agent given a finishing step after a sign-off performs only the actions it was named: no re-probe, no walkthrough step re-run, no browser. | A pin in `pilot-qa.md`. |
| 4 | `pilot wait --as <kind>` (pilot, qa, teacher or auditor) exits only on a user reply on an open thread in this directory that `kind` owns. `--item <id>` narrows it to one thread. | On a scratch deck, a wait as QA exits on a walkthrough reply and not on a pilot question, and the pilot's wait does the reverse. |
| 5 | `pilot-qa`, `pilot-teacher` and `pilot-auditor` each start that wait with `run_in_background` and end their turn. No crew file tells its agent to wait inside `deck_wait`. | A pin across `agents/*.md`, and the frontmatter of each. |
| 6 | A message from the pilot to a waiting crew agent is acted on within seconds, and the agent's scratch processes survive it. | In a scratch session, a `SendMessage` to a waiting QA is answered with no stop, and its scratch deck is still up. |
| 7 | A wait **takes** what it prints: no second wait of the same kind prints that reply. The walkthrough Sign off is taken once by QA's wait and once by the pilot's. | Two waits as one kind in one directory: one prints the reply and the other keeps waiting. A Sign off reaches both kinds. |
| 8 | The first thing an agent does after a user's reply reaches it is post one line on that thread saying what happens next, before any other work. | `pilot.md`, `pilot-qa.md`, `pilot-teacher.md` and `pilot-auditor.md` say so; a pin in each. |
| 9 | A reply shows "Seen by <kind>" the moment a wait takes it, and the page updates without a reload. A reply no wait has taken shows no mark. | On a scratch deck, a taken reply shows the mark live and an untaken one does not. |
| 10 | The mark names every kind that took the reply, so a walkthrough Sign off reads "Seen by qa and pilot". | A deck test, and the Sign off seen on the scratch deck. |
| 11 | Every change above fits within the existing pin on the pilot's own prompt share (10336.75) and the one on QA's (5752). Neither pin is raised. | `node --test scripts/test/measure-prompt.test.mjs scripts/test/qa-preview.test.mjs`, and the measured figures in each PR. |

Dropped: **draft A4** (an autonomous chain that a stalled agent cannot block) is already built. In autonomous
mode QA reports once the walkthrough is posted and stops (`agents/pilot-qa.md:147-148`). The pilot parks and
finishes `"gate 2 posted"` (`agents/pilot.md:149-156`). The daemon chains on that finish without consulting
any agent (`deck/chain.mjs:20`), and ticket-states S16 test 2 pins it. The user was told and did not object (L11).

Settled: **draft B4**. `owner` already distinguishes all four kinds (`deck/items.mjs:497` `OWNER_KINDS`;
ADR 0053, ADR 0058). Only `deck_reply`'s `to` is limited to pilot and qa (`PASS_KINDS`, `:500`), and that is on
purpose, because a teacher or an auditor owns only what it posts. The question that is actually open is how a
Bash process proves its kind (L14).

## 3. Findings

| Area | What exists | Anchor |
|---|---|---|
| `pilot wait` | A background poll every 2 s through `/api/tool` `deck_read`, sent **without** `repo` so that it marks nothing delivered. It matches the pilot's open threads whose last word is the user's and is newer than a baseline seq (`awaitsPilot`). It claims owner-fallback replies through a `deck_wait` with `since: MAX_SAFE_INTEGER`. Exit 0 on a reply or a timeout, exit 1 when the deck is unreachable; the default timeout is 110 min. | `deck/wait.mjs:105-147, 154-226`; `bin/pilot.mjs:63,124` |
| Two waits | Nothing records who has a reply, so every `pilot wait` in a directory prints the same reply. This is the live case seen in this session. | `deck/wait.mjs:142-147` |
| `deck_wait` | A long poll in the daemon. It is filtered by repository and by `ownerFilter(kind)`, and holds the kind active (`holdWait`) so the fallback does not fire while the owner waits. For the pilot it runs the fallback and the mode notice. It marks what it returns with `handOff`, which announces the change to the pages. | `deck/server.mjs:520-582, 923-970`; `deck/agents.mjs:213-222` |
| Kind | The hook stamps `author` from `agent_type` on the five deck MCP tools only. An HTTP caller with no author is read as the pilot, and any loopback caller may name any author. | `hooks/deck-author.js:30-40`; `deck/items.mjs:486-523` |
| Delivery | `deliveredAt` and `deliveredTo` are written once. The Sign off is the one reply with two recipients, `['qa','pilot']`. A fallback writes `[owner,'pilot']`. | `deck/store.mjs:1194-1229, 1288-1305` |
| Owner fallback | A reply nobody claims passes to the pilot after 30 s. A reply that was taken but not answered on its thread passes after 5 min. Either waits until the owner kind has also been quiet for the live window. | `deck/items.mjs:508-509`; `deck/store.mjs:1237-1278` |
| Thread page | `renderMessage` draws "you · <time>" and has no delivery mark. The bar's "<owner> has it" names the owner, not the kind that took the reply. | `deck/ui/render.mjs:146-157`; `deck/items.mjs:793-803` |
| Crew waits | QA parks on `deck_wait` when idle. The teacher waits on its lesson with it, and has no Bash. The auditor parks on its audit item with no idle timeout. | `agents/pilot-qa.md:151-152`; `agents/pilot-teacher.md:5,27-33`; `agents/pilot-auditor.md:102-108` |
| Finishing | QA flips the PR on the pilot's word (`gh pr ready`, its comment, seed copy, teardown). Step 9 tells QA to do it. | `agents/pilot-qa.md:183-203`; `agents/pilot.md:491-506` |
| Budgets | Measured at 84860f5. Pilot: 8520 definition + 1798 schemas = 10318, against a pin of 10336.75. QA: 3319 + 1416 + 1016 = 5751, against a pin of 5752. The `deck_wait` schema is 160 tokens in each frontmatter that lists it (pilot, qa, teacher, auditor). | `node scripts/measure-prompt.mjs`; `scripts/test/measure-prompt.test.mjs:106-112`; `scripts/test/qa-preview.test.mjs` |
| Skills | `grilling`, `wizard` and `diagnosing-bugs` tell "any other agent" to park on `deck_wait`. QA loads `diagnosing-bugs`. | `skills/grilling/SKILL.md:29`; `skills/wizard/SKILL.md:48`; `skills/diagnosing-bugs/SKILL.md:42` |
| Run-2 friction | "Explorer and QA agents that poll on a background wait re-notify the pilot every cycle". L9's probe shows that a subagent's own shell resumes the subagent itself. | `docs/design/ticket-states/architecture.md:269` |

## 4. Ubiquitous language

- **Wait**: a `pilot wait --as <kind>` process started with `run_in_background`, whose exit is the only thing
  that wakes the agent that started it.
- **Owner kind**: pilot, qa, teacher or auditor, the one kind a thread's user replies go to (ADR 0041).
- **Take**: a wait prints a reply and marks it delivered to its kind, in one daemon call. A reply is taken once
  per kind.
- **Seen mark**: the "Seen by <kinds>" line under a user reply, drawn from `deliveredTo`.
- **Finishing step**: an action after a sign-off whose every detail is already decided.
- **Undelivered message**: a `SendMessage` whose result says it was queued rather than that the agent resumed.

## 5. Locked decisions

| Id | Decision | Rationale | Rejected |
|---|---|---|---|
| L1 | Grilling depth is *forks*: only decisions whose paths produce materially different deliverables are asked, and the rest are assumed and listed for Gate 1. | The user, deck itm_203a4f9ee2f0. | *every* |
| L2 | This run stacks on `feat/ticket-states`. Design and slices are cut from 84860f5. The feature PR targets `main` and is clean to merge only once #270 is in, and a change to #270 before then means a rebase. | The user, deck itm_efbc5cc904f4. | Waiting for #270 to merge |
| L3 | A wait takes what it prints (spec 7, 9). The daemon marks `deliveredTo` its kind in the call that returns the reply, and a later wait of that kind is never handed it. The Sign off goes once to each kind by the existing rule (`store.mjs:1217`). This is ADR 0061, and it supersedes `wait.mjs`'s "mark nothing until a real turn reads it". | It answers spec 7 (the two-waits live case) and spec 9 (the mark at the moment of hand) with code that already exists. A reply printed to a session that then dies is marked seen with no reader. For a crew thread, L7's 5-minute fallback hands it to the pilot. For the pilot's own thread, the session is the run, and its death is ADR 0059's recovery. | Keeping the mark at the next `deck_read`: that leaves the live case unsolved and the mark late. |
| L4 | `--item <id>` narrows a wait to one thread. The teacher waits on its lesson and the auditor on its audit item. | Two teachers can be live in one directory. A kind-wide wait would let one take the other's reply. | A single wait per kind per directory, where a newer wait supersedes the older: this breaks two concurrent lessons. |
| L5 | `deck_wait` stays a daemon tool and an MCP tool. It leaves the frontmatter of the pilot, QA, the teacher and the auditor, which frees 160 tokens in each for spec 1, 2 and 8. | Spec 11 is paid by subtraction. Plain sessions and three skills still name the tool, and the hooks reach it over HTTP. | Deleting the tool: that means four skills, the hooks' inbox path and a breaking change to the MCP surface. |
| L6 | `untaken` and `item` are declared arguments of `deck_wait` in `deck/tools.mjs`. `pilot wait` sends them over `/api/tool`. | There is one spelling of a wait, and no hidden argument. The schema growth costs no crew pin (L5). | A new `/api/wait` route: a second wait implementation beside `runTool`. |
| L7 | The seen mark is drawn per reply from the stored `deliveredTo`. The bar's five states keep their words. | A per-reply line is what spec 9 asks to see. The bar has its own pins, and its own vocabulary has been agreed. | Rewording `threadState`'s "<owner> has it" to name the taker. |
| L9 | A crew agent waits by starting a background shell and ending its turn. A live probe by `main` on 2026-10-04 showed both halves. A subagent ran `sleep 150` with `run_in_background` and ended its turn. A `SendMessage` 18 s later answered "Resuming agent <id>" and the agent acted at once, with its shell still running. At the shell's exit (14:24:32Z), the background shell's exit notification for its own command resumed the agent. | This is the evidence for spec 5 and 6. | The pilot's wait taking crew threads' replies and resuming each owner by `SendMessage`, which costs pilot context on every reply. |
| L10 | QA corrects the PR body and posts its QA comment after the walkthrough Sign off, then reports and waits. The pilot runs `gh pr ready` after Gate 2 and tells QA only to tear down. | The user, deck itm_e1cee8396386. QA holds the knowledge for the comment, and the pilot's pin has 18.75 tokens of headroom. | The pilot posting the summary from QA's report |
| L11 | Draft A4 is dropped as already built (§2). | The user, deck itm_e1cee8396386. | Adding a further pin |
| L8 | Neither prompt pin is raised or lowered. The headroom L5 frees is spent on prose. | It makes spec 11 hold without re-creating the zero headroom of run 2 (§3 friction). | Lowering both pins to the newly measured figures. |
| L12 | `pilot-teacher` gets Bash, with prose limiting it to `pilot wait`, so QA, the teacher and the auditor all wait the same way. | The user, deck itm_501abddaff23. A lesson costs the pilot no context. The limit is prose, not enforcement. | The teacher holding no wait: the pilot's wait takes lesson replies and resumes the teacher for each one. |
| L14 | A wait states its kind with a flag the agent types, `--as <kind>`; no hook stamps it. | The user, deck itm_11eefabe4039. It is no weaker than today: any loopback caller can already name any author over HTTP. A mistyped kind is a bug the tests pin. Measured on the way: no hook runs before Bash today; one hook call costs about 42 ms (39 ms of it starting node) and no context tokens. | Extending `hooks/deck-author.js` to Bash so that it rewrites `pilot wait` with `agent_type`: unforgeable, but it fails open (the flag would stay underneath), and a Bash `updatedInput` and what the permission check sees are both unverified. A fair later ticket. |
| L13 | QA runs against a scratch deck on a spare port started from the feature worktree, plus a scratch agent session; the user's walkthrough is on that scratch deck. No migrations. | The user, deck itm_3dc02244644c. The live deck on 4321 carries this run and is not restarted onto unmerged code. | The live deck on 4321, restarted onto the branch. |

## 6. Assumed decisions awaiting the user

| Id | Question | Default taken | Tradeoff |
|---|---|---|---|
| A5 | `pilot wait --as` is a client of the daemon's `deck_wait` long poll (L3, L6). | Accepted by `main` as assumed for Gate 1. | It replaces `wait.mjs`'s own poll-and-match, and its fallback hack, with the wait the daemon already has. |
| A6 | How is the work split? | 5 slices in one run, the walking skeleton first (§8). | None at this size, which is well inside the one-run bound. |

## 7. Out of scope

- Any wake of a parked `deck_wait` by a pilot message. That job is withdrawn.
- Superseding or reaping a stray wait. L3 already stops a stray from printing a reply that another wait took.
- Changing the owner-fallback timers (30 s, 5 min), or the pass kinds.
- Bash-side author stamping (L14's rejected path).
- The size of a `deck_read` of open threads (§3 friction), and `compliance-review`, which no crew agent runs.

## 8. Slices

| Slice | Title | Spec | Files owned | After | File |
|---|---|---|---|---|---|
| S1 | Walking skeleton: QA waits in the background, as QA, and takes its reply | 4, 5 (QA), 6, 7 | `deck/wait.mjs`, `deck/server.mjs`, `deck/tools.mjs`, `bin/pilot.mjs`, `deck/test/wait.test.mjs`, `deck/test/wait-as.test.mjs` (new), `agents/pilot-qa.md` (wait paragraph, frontmatter), `scripts/test/crew-waits.test.mjs` (new), `docs/adr/0061-a-wait-takes-what-it-prints.md` (written at Gate 1, amended only if the code moves it) | – | [S1](slices/S1.md) |
| S2 | A reply shows who has seen it | 9, 10 | `deck/ui/render.mjs`, `deck/ui/deck.css`, `deck/test/seen-by.test.mjs` (new) | – | [S2](slices/S2.md) |
| S3 | The teacher and the auditor wait in the background on their own item | 5 | `agents/pilot-teacher.md`, `agents/pilot-auditor.md`, `skills/grilling/SKILL.md`, `skills/wizard/SKILL.md`, `skills/diagnosing-bugs/SKILL.md`, `scripts/test/crew-waits.test.mjs` | S1 | [S3](slices/S3.md) |
| S4 | The pilot finishes decided steps and does not trust a queued message | 1, 2, 3, 11 | `agents/pilot.md` (step 9, the crew section, frontmatter), `agents/pilot-qa.md` ("When the user is satisfied"), `scripts/test/crew-waits.test.mjs` | S3 | [S4](slices/S4.md) |
| S5 | A reply is never left on read | 8, 11 | `agents/pilot.md`, `agents/pilot-qa.md`, `agents/pilot-teacher.md`, `agents/pilot-auditor.md`, `scripts/test/crew-waits.test.mjs` | S4 | [S5](slices/S5.md) |

S2 runs beside S1, because its files are disjoint from S1's and it reads only the stored `deliveredTo`, which
already exists. S3 to S5 are prose and pins on shared files, so they run in sequence. One run of 5 slices
(A6).

## 9. Acceptance evidence

The feature is accepted on a scratch deck on a spare port, driven from a QA worktree. There are no migrations.
In the order a user meets it:

1. QA posts its walkthrough, starts `pilot wait --as qa --item <id>` in the background and ends its turn. The
   terminal shows a background shell, not a parked tool call (spec 4, 5).
2. The pilot sends QA a message. QA answers within seconds, and its scratch deck is still up (spec 6).
3. The user replies on the walkthrough. QA's first act is one line on the thread saying what happens next
   (spec 8). The reply shows "Seen by qa" without a reload (spec 9). The pilot's wait does not exit on it
   (spec 4).
4. A second wait as qa in the same directory does not print that reply (spec 7).
5. The user Signs off. The reply reads "Seen by qa and pilot" (spec 10). QA corrects the PR body, posts its
   comment and reports. Then the `gate2` is signed, the pilot flips the PR to ready itself, and QA only tears
   down, with no browser (spec 1, 3).
6. A message to a stopped agent, which comes back queued, is followed by the pilot's own check and the step
   done by the pilot (spec 2).
7. A `Teach me` lesson and an audit item each wait in the background on their own item (spec 5).
8. `node scripts/measure-prompt.mjs` shows the pilot at or under 10336.75 and QA at or under 5752, and
   `npm test` is green (spec 11).

## 10. Status

| Slice | State | Branch | PR | Worktree | Blocker | Spec |
|---|---|---|---|---|---|---|
| S1 | integrated | `slice/crew-waits-s1` | #284 | | – | 4, 5, 6, 7 |
| S2 | integrated | `slice/crew-waits-s2` | #283 | | – | 9, 10 |
| S3 | integrated | `slice/crew-waits-s3` | #285 | | S1 | 5 |
| S4 | integrated | `slice/crew-waits-s4` | #286 | | S3 | 1, 2, 3, 11 |
| S5 | integrated | `slice/crew-waits-s5` | #287 | | S4 | 8, 11 |
| fix round | integrated | `fix/crew-waits-principles` | #288 | | S5 | – |
| feature | in QA | `feat/crew-waits` | #282 | `pilot-feat-crew-waits` | S1–S5 | 1–11 |

The live state is `run.json` beside this file.

## 11. Decided after Gate 1

| Id | Decision | Source |
|---|---|---|
| L15 | Spec 8 narrows to the pilot, QA and the auditor. The teacher is exempt and keeps "exactly one message per reply, never two": its next act after a reply already is its reply, so there is no gap in which the user is left on read. | The user, deck itm_e215a0a33e4a, on principles finding F13. |
| – | S1 shipped at 769 changed lines against the 400-line limit, on the pilot's word: production code is net negative, and the overage is tests against the real daemon. | `main`, S1's PR #284. |

## 12. Principles review verdicts

One review of the whole feature at 9a89c0f against `origin/feat/ticket-states`; fixes in #288.

| Finding | Verdict | Reason or outcome |
|---|---|---|
| F1 `readOnlyOpen` duplicates `readFlag` | kept, fixed | Deleted. |
| F2 `untakenBy` restates the Sign off rule | kept in a narrower form, not done | The reviewer's `deliveredTo` rewrite was rejected: after a thread is passed it would hand a kind replies another kind already took. The store's predicate needs the item's kind, which would cost the store read F3 removed; the line stays, correct beside `ownerFilter`. |
| F3 three store parses per untaken pass | kept, fixed | `repliesSince` rows carry `open`; `untakenBy` reads nothing. |
| F4 `--item` unpinned against a real daemon | kept, fixed | Test added; fails with the filter removed. |
| F5 long wait's poll interval unpinned | kept, fixed | Test added. |
| F6 the 10 ms pause | dropped | Cheap insurance against a hot loop; surviving mutants show it is untested, not dead. |
| F7 three refusals unasserted | kept, fixed | Asserted. |
| F8 guard in `renderSeenBy` | kept, not done | A hand-edited store with `deliveredTo` and no `deliveredAt` would call `renderTime(undefined)`; the guard stays. |
| F10 S1's interface block and two comments | kept, fixed | They say `take` marks inside `waitForReplies`. |
| F11 dead `awaitsPilot`, stale comment, ADR 0045 | kept, fixed | The deck's `awaitsPilot` is deleted (§3's row names it as it was at 84860f5); ADR 0061 says what it supersedes. |
| F12 teacher sentence that cannot happen | kept, fixed | Deleted. |
| F13 one-line-first in the teacher | kept, fixed | L15. |
| F14 the rule printed by `pilot wait` instead of four prompts | deferred | Changes spec 8's agreed evidence; offered in the closing report. |
| `untaken` as `deck_wait`'s only behaviour | deferred | Over the diff limit and changes the MCP tool; the user's decision. |
| N1 `kinds.join` | kept, fixed | |
| N2 skills spell the CLI | dropped | No consequence shown. |
| N3 two duplicate tests | kept, fixed | Deleted. |
| N4, QA-J2 "keep your wait" after Sign off | kept, fixed | QA ends its turn; a message from `main` resumes it. |
| QA-J1 no time on a two-kind mark | dropped | Matches S2's interface. |
| QA-J3 `compliance-review` names `deck_wait` | dropped | Out of scope (§7). |
