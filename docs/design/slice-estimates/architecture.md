# Estimates are slice counts

Feature `slice-estimates` · ticket itm_1214816b3789 · design branch `design/slice-estimates` · grilling depth *forks* (L1)

## 1. Problem

> i want to get rid of the time estimates and just replace it with n of slices. and we want to aim for n = 15. doing things in bigger tickets is more efficient as long as they are on the same surface. only do smaller tickets if they have completely different surfaces.

> nah get rid of the self evaluations, it's unnecessary mechanism

A ticket's size is in minutes today: the posted `estimate`, `deck_post`'s "ticket only: minutes", the merge sum, the Gate 1
estimate the deck measures from closed runs, the chain hand-off's "about N minutes", ticket-making's sizing prose, the
architect's 12-slice bound and the auditor's effort × 30 minutes. The user wants one unit everywhere, the slice count;
15 slices per ticket as the aim; one ticket per surface; and the self-measuring deleted, not converted.

## 2. Spec

Sharpened from the four lines the user approved when the ticket was stored (itm_1214816b3789) and the three decisions they took on the deck (L11, L12, L13); the user reads all seven here at Gate 1.

| # | Behaviour | Evidence |
|---|---|---|
| 1 | A ticket is posted with a slice count, `sliceCount`, a whole number, and nothing changes it but a merge (spec 4). A post without one, or with the retired `estimate`, is refused by name. (L13) | On a scratch deck `deck_post` kind `ticket` with `sliceCount: 15` lands; with `estimate: 90` the answer is "a ticket item takes no estimate. It takes … sliceCount."; with neither, "a ticket needs sliceCount". Pinned in `deck/test/ticket-tool.test.mjs`. |
| 2 | A ticket's row says its size in slices: the plan's count once Gate 1 is signed, the posted count before; a ticket with no count shows none. | The Tickets tab on a scratch deck: a green ticket posted at 8 reads "8 slices"; a yellow one planned at 11 reads "11 slices"; a ticket stored without a count shows no size. Pinned in `deck/test/estimate.test.mjs`. |
| 3 | Signing Gate 1 writes the plan with no estimate, and nothing measures a finished run: `minutesPerSlice`, its default of 30 and its window of 20 are gone, and the chain hand-off of a yellow ticket says its slices and no minutes. | `GET /api/record?repo=&ticket=` on a planned ticket returns a `plan` with no `estimate` key; the hand-off text has no "minutes"; `grep -rn "minutesPerSlice\|MINUTES_PER_SLICE" deck/` prints nothing. |
| 4 | A merge adds the two slice counts and says so in slices. | `deck_ticket merge` of a 4 into a live 8 answers "Merged itm_… into itm_…: 12 slices." and the host row reads "12 slices". |
| 5 | ticket-making aims for 15 slices a ticket; jobs on one surface go in one ticket however many there are; a job is cut off into its own ticket only when its surface is completely different; the Estimate column and every post carry a slice count and the skill carries no minutes. *(cut rules assumed, A3)* | `scripts/test/ticket-making.test.mjs` pins 15, the one-surface rule, the split-only-across-surfaces rule, `sliceCount` on every post and no "minute" in the skill; a Make tickets thread on a scratch deck yields a table whose Estimate cells are slice counts. |
| 6 | The architect's one-run bound is 20 slices (a run reaches 22 only by slices added mid-run, A4); the auditor posts a pick with `sliceCount` from its effort as slices (S 1, M 3, L 8, A6), no conversion to time. | `scripts/test/run-split.test.mjs` pins "over 20 slices", "runs of at most 20" and 22; `ticket-making.test.mjs`'s auditor pin asserts `sliceCount` and no "minutes per slice". |
| 7 | No minute estimate stays in the store: a ticket's `estimate` and a plan's `estimate` are dropped on read and gone from `deck.json` after the next write (L11). | A deck test seeds both fields and reads them back absent; QA runs the strip against a copy of the live `deck.json` and reads none back. |

The draft's evidence `grep -ri minute deck/` cannot be literal: `deck/audit.mjs` ranks findings by minutes *saved*
(audit L6), and `deck/wait.mjs`, `deck/run.mjs` and others count timeouts in minutes. None is an estimate; spec 3 and
5 carry the narrowed greps.

## 3. Findings

| Area | What exists | Where |
|---|---|---|
| Ticket field | `estimate`: required count on `ticket` | `deck/items.mjs:393`; count check `deck/items.mjs:341-344` |
| Tool | `estimate: integer, 'ticket only: minutes'`; `sliceCount` already declared for gate1, no description | `deck/tools.mjs:183-185` |
| Unknown field | Refused by name, listing what the kind takes: a free refusal for a retired field | `deck/store.mjs:458-465` |
| Measurement | `minutesPerSlice` (median of 20 closed, default 30) | `deck/items.mjs:711-741` |
| Plan | `planOf(item, estimate)`, written on gate1 Sign off as `sliceCount × minutesPerSlice` | `deck/store.mjs:866-886` |
| Report guard | A report closes a ticket only after its newest gate2 is resolved; its comment says it exists for the measurement | `deck/store.mjs:662-667` |
| Merge | `host.estimate` = sum; server answers "estimate N minutes" | `deck/store.mjs:1079`, `deck/server.mjs:896` |
| Hand-off | "N slices, about M minutes" in a yellow ticket's spec | `deck/chain.mjs:76` |
| Row | Planned row: `plan.sliceCount` slices (ticket-states run 2); unplanned row: no size | `deck/ui/render.mjs:1351-1358, 1395` |
| `/api/record` | Returns the ticket, plan included; the estimate reaches it only through the plan | `deck/server.mjs:1421-1428`, `deck/store.mjs:1580-1587` |
| Read migration | Idempotent strip on read, rewritten on next write, no version bump | `deck/store.mjs:234-248` (`asUserThread`) |
| Prose | ticket-making Estimates, table, Posting, Merging; architect §8; auditor step 7 | `skills/ticket-making/SKILL.md:3,60-86,111,122-127`; `agents/pilot-architect.md:88-93`; `agents/pilot-auditor.md:128-130` |
| Pins | `ticket-making.test.mjs:69-77,93-94,127-134,182-187`; `run-split.test.mjs:28-56`; `estimate.test.mjs` (150 lines, mostly `minutesPerSlice`) | `scripts/test/`, `deck/test/` |
| Fixtures | 32 `estimate` lines across 21 deck test files, plus `deck/testUtils.mjs:108` | `deck/test/*.test.mjs` |
| Live store | 551 items, 70 tickets; `estimate` on 2 open green tickets (itm_70e85babf58c 90, itm_17e9243f39ff 30); `plan.estimate` on 2 closed (300; and 5 for 5 slices: the measure had floored at 1 min/slice) | `~/.claude/pilot/deck.json`, read only |
| Pilot prompt | Untouched by this feature; its share pin sits at zero headroom | `scripts/test/measure-prompt.test.mjs` |

## 4. Ubiquitous language

- **Slice count**: the only size a ticket has, in slices. Never minutes.
- **Posted count**: the ticket's own `sliceCount`, given at posting and summed by a merge.
- **Planned count**: `plan.sliceCount`, from the signed gate1; what the row shows once it exists.
- **Surface**: the screen, module or files a job touches; tickets are cut by it.
- **Target**: 15 slices, what ticket-making aims a ticket at.
- **One-run bound**: 20 slices, past which the architect groups slices into runs.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
|---|---|---|---|
| L1 | Grilling depth is *forks*. | The user, deck thread itm_94be2e81d860, 2026-10-04. | *every* |
| L2 | The measured estimate is deleted, not converted: `minutesPerSlice`, its constants, its tests, `plan.estimate`, the skill's two measured bullets. | "get rid of the self evaluations, it's unnecessary mechanism"; the live deck shows it already measuring nonsense (5 slices, 5 minutes). | A measured slices-per-run figure. |
| L3 | One unit, slices, with no conversion to time anywhere. | "replace it with n of slices". | Minutes kept beside slices. |
| L4 | The row shows the planned count, else the posted count. | Approved spec line 1 ("shows 15 slices on its row"); ticket-states hid unplanned estimates only because they were minutes. | Planned rows only (spec 1's evidence unmet). |
| L5 | A merge sums slice counts. | ticket-states L15 with the unit changed; a merged ticket holds both jobs' slices. | Leave the host's count (understates the work). |
| L6 | No ceiling on the count. | 90 slices and 90 minutes are the same integer; the field name, not the value, retires minutes (L13). A ceiling is new mechanism. | A cap such as 45 to catch minute-sized numbers. |
| L7 | The report-after-gate2 guard stays; only its comment changes. | It is ticket lifecycle (a ticket closes after its Gate 2); deleting it is a behaviour change outside the spec. | Delete it with `minutesPerSlice`. |
| L8 | The target is 15 and the one-run bound is 20. | "aim for n = 15"; the bound was locked at 15 at Gate 1 and moved by the user after it (itm_02f0d2dd14f3, 2026-10-04: "i think that slice bound is silly, can you bump it up to 20"). A ticket over 20 is still one ticket and the architect splits it into runs at Gate 1, as today. | Bound 15 (the first lock); bound left at 12. |
| L9 | `GET /api/record` keeps its route and shape; the plan loses its key. | The route serves the SessionStart hook; nothing reads `plan.estimate` but the hand-off line. | A route change. |
| L10 | Prose is pinned by the existing prose tests, edited in place. | `ticket-making.test.mjs` and `run-split.test.mjs` already pin these sections. | New test files. |
| L11 | Stored minutes are dropped: `estimate` on tickets and `plan.estimate` on plans are stripped on read, idempotently, like `asUserThread`, and gone at the next write; the two open green tickets show no size until Gate 1 gives each the plan's count (assumed A7, fix round: no code reads a count from a reply; asked on the deck); nothing is converted. (Was A2.) | The user, itm_303f112f9d53: "Drop them". | Converting at 30 min/slice (90 becomes 3: an invented figure); a hand edit of `deck.json` (irreversible, races the daemon). |
| L12 | QA runs against a scratch deck: a second daemon on a spare port (not 4399, which `run.test.mjs:254` takes) with its own `PILOT_DECK_DIR`, fixture tickets, the page opened in a browser, a Make tickets thread run there; the strip of old minutes is proven on a copy of `deck.json`, never the live store. (Was A5.) | The user, itm_12214e31155f; matches ticket-states and crew-waits. | QA on the live deck. |
| L13 | The ticket's field is `sliceCount`, the property `deck_post` already declares for gate1; `estimate` is retired and refused by the store's existing unknown-field refusal. (Was A1.) | The user, itm_02b1d791ad82: "Rename to sliceCount". One term for ticket and plan, a tool property fewer, minutes refused by name with no new code, old minute values unambiguous dead data; 33 fixture lines pay for it. | Keep `estimate` meaning slices: `estimate: 90` posted reads as 90 slices. |

## 6. Assumed decisions awaiting the user

| # | Question | Default taken | Tradeoff | Rejected | Evidence |
|---|---|---|---|---|---|
| A3 | Which of ticket-making's cut rules survive "only do smaller tickets if they have completely different surfaces"? | Keep "same surface merges" (now regardless of count) and "third-party code or a credential stands alone"; delete "short jobs merge with neighbours across up to two surfaces" and "feature-sized work stands alone". | The credential rule is a second reason to split that the user's "only" does not name; it keeps a queue from waiting on the user's key. | Surface as the single rule. | `skills/ticket-making/SKILL.md` "One ticket is one run" |
| A4 | How far can a run grow mid-run past the bound of 20? | 22: the existing allowance of two kept, on the bound of 20 (L8). | A run may end two slices over the aim. | 20 hard. | `agents/pilot-architect.md:91`; `run-split.test.mjs:37-44` |
| A6 | What slice count does an audit pick carry? | Its effort as slices: S 1, M 3, L 8 (the weights of `deck/audit.mjs`). | An audit fix is sized by the auditor's effort band, not a cut. | A flat 1 per pick. | `agents/pilot-auditor.md:128-130`; ticket-states A9 |
| A7 | Does a reply on a queued ticket re-estimate it? | No: drop the reply re-estimate. The two open green tickets show no size until Gate 1 gives each the plan's count (fix round; asked on the deck). | Spec 1: nothing changes a ticket's count but a merge, and `addReply` reads no number. | Keep the skill sentence telling the pilot to name a new count in the reply. | `deck/store.mjs:750-780`; `skills/ticket-making/SKILL.md` "Merging" |

A1, A2 and A5 were answered and are L13, L11 and L12; the numbers are kept so the deck threads still match.

## 7. Out of scope

- The audit's ranking by minutes and tokens saved (`deck/audit.mjs`, audit L6): a saving, not a ticket size.
- Timeouts counted in minutes (`deck/wait.mjs`, `deck/run.mjs`, hooks).
- `docs/design/ticket-states/` and other finished artefacts: records, not edited.
- `agents/pilot.md`: it names no estimate, and its prompt-share pin has no headroom.
- A measured or derived size of any kind (L2), and any ceiling on the count (L6).

## 8. Slices

| # | Slice | Spec | Files owned | After | File |
|---|---|---|---|---|---|
| S1 | Walking skeleton: a ticket is posted with a slice count and its row says it | 1, 2, 4, 7 (ticket field) | `deck/items.mjs`, `deck/tools.mjs`, `deck/store.mjs`, `deck/server.mjs`, `deck/ui/render.mjs`, `deck/testUtils.mjs`, `deck/test/ticket-tool.test.mjs`, `deck/test/merge.test.mjs`, `deck/test/ticket-state.test.mjs`, the other deck test files whose fixtures post `estimate` (listed in S1) | – | [S1](slices/S1.md) |
| S2 | Gate 1 writes no estimate and nothing measures a run | 3, 7 (plan field) | `deck/items.mjs`, `deck/store.mjs`, `deck/chain.mjs`, `deck/test/estimate.test.mjs`, `deck/test/chain.test.mjs` | S1 | [S2](slices/S2.md) |
| S3 | ticket-making, the architect and the auditor size in slices | 5, 6 | `skills/ticket-making/SKILL.md`, `agents/pilot-architect.md`, `agents/pilot-auditor.md`, `scripts/test/ticket-making.test.mjs`, `scripts/test/run-split.test.mjs` | – | [S3](slices/S3.md) |

S1 and S3 own disjoint files and may run in parallel; S2 shares `deck/items.mjs` and `deck/store.mjs` with S1, so it
follows it. Spec 1, 2, 4 by S1; 3 by S2; 5, 6 by S3; 7 split between S1 (ticket field) and S2 (plan field, which S1
cannot strip while gate1 still writes it). Three slices, one run; no Runs table.

ADR 0062 (`docs/adr/0062-a-tickets-size-is-a-slice-count.md`) records L2, L3, L8, L11 and L13; it is written on the design branch at Gate 1 and no slice owns it.

## 9. Acceptance evidence

On a scratch deck (L12), in the order the user meets it:

1. A Make tickets thread with two jobs on one surface and one on another proposes two tickets; the Estimate cells are slice counts (5).
2. Posting them with `sliceCount` lands two green rows reading "N slices"; a post with `estimate: 90` is refused naming `estimate` (1, 2).
3. Taking one live and merging a same-surface green ticket into it answers "…: N slices" and the row reads the sum (4).
4. Signing its gate1 at 11 slices turns it yellow reading "11 slices"; `GET /api/record?ticket=` shows a plan with no `estimate`; a yellow ticket's hand-off text has no minutes (2, 3).
5. A copy of the live `deck.json` loaded by the scratch daemon reads every ticket and plan that carried an `estimate` back without one (an unplanned ticket shows no size, a planned one its plan's count), and after one write the copy holds no `estimate` anywhere (7).
6. `grep -rn "minutesPerSlice\|minutes per slice" deck/ skills/ticket-making agents/` prints nothing, and the architect pin passes at 20, the ticket-making pin at a target of 15, and the auditor pin at `sliceCount` (3, 5, 6).

## 10. Status

| Slice | State | Branch | PR | Worktree | Blocker | Spec |
|---|---|---|---|---|---|---|
| S1 | integrated | | #299 | | – | 1, 2, 4, 7 |
| S2 | integrated | | #300 | | S1 | 3, 7 |
| S3 | integrated | | #298 | | – | 5, 6 |
| slice-estimates (feature) | planned | | | | S1, S2, S3 | 1–7 |
