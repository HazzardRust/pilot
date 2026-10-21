# A closing report is a record, never a channel to the user

Ticket `itm_6468bd2c24da` · base `pilot` 671567e4, designed for a base that already carries
`feat/yellow-lane` (§3, Collisions) · ADR 0148 · merge: none (itm_e4ec1bdb840a)

## 1. Problem

The user, on itm_043485a97070 (2026-10-14):

> at one point i had instructions given through a closing report. we need to make sure that
> closing reports are never considered as pathways to correspondence to a user.

A closing report today has a reply box on its thread page, a reply typed there wakes the
pilot's `pilot wait` and holds its Stop gate, and nothing stops a report from asking the user
to act and answer ("say so there and it is added", itm_351eeb1012f6). The report is the
run's record; anything that needs the user must be its own thread.

## 2. Spec

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | A user's reply on a `report` is refused by the store, whoever sends it (`POST /reply`, a script, an MCP caller): the refusal names the repository's chat and ADR 0148, stores nothing, and does not reopen a closed report. | store test: `addReply` on an open and a closed report throws, the report unchanged; route test: `POST /reply` on a report answers the refusal, no reply stored. |
| 2 | A report's thread page draws no reply box and no Send. | render test: `renderThreadPage` on an open report has no `reply-text` and no `/reply` form; a question's page still has both. |
| 3 | A user reply already stored on a report (from before this change, or written into the store by hand) is never delivered: `pilot wait` under any `--as`, with or without `--item <report>`, never returns it, and neither the Stop gate nor the inbox line names it. | wait test with a planted reply on a report and one on a question: the wait returns only the question's; hook tests: `unanswered` excludes the report, the Stop gate lets the turn end. |
| 4 | The deck refuses a `report` post when a body line or a step asks the user anything: a line ending in `?` outside code spans and quotes, or "say so", "tell me" or "let me know". "Reply here" is not on the list: the sanctioned worktrees reply is announced as "I reply here". The refusal names the step number or the line, and ADR 0148. | refusal test per pattern; a fixture of today's stored report lines: the nine "I reply here with what is kept" lines and the `?`-bearing URLs, regexes and quoted titles pass; the two real asks on open reports (itm_ffb2bd6090ea, itm_351eeb1012f6, both "say so") are refused naming the line. |
| 5 | The pilot's own reply on a report (the worktrees reply) passes the same check, so the one sanctioned reply cannot ask either. *assumed* (A3) | store test: `addPilotMessage` on a report with "Tell me which to keep" is refused; "Kept: `pilot-feat-x` (dirty)" is stored. |
| 6 | `agents/pilot.md` "Ending a run" says the only reply on a closing report is the pilot's worktrees reply; anything that needs the user goes up as its own `question` or `walkthrough` before the report; a user's words on a report are never relayed or acted on; the friction section is picked with Add on Tickets or in the chat, never by a reply on the report. | wording pins; QA on a scratch deck: a reply planted in the scratch store on the report, `pilot wait --as pilot` started, nothing returned and no action in the transcript. |
| 7 | ADR 0148 records the decision in the user's words; both refusals and the pilot.md clause cite it; the index lists it. | the file exists, `npm run adr-index` lists 0148, the refusal strings contain `ADR 0148`. |
| 8 | The pilot's prompt-budget pin moves by exactly the measured cost of the clause, named in the PR. | the pin diff: the new number, its history line, nothing else. |

## 3. Findings

What exists:

- `report` is a kind (`deck/items.mjs:95`), standing (`STANDING_KINDS`, :129; hooks spelling
  `hooks/lib/deck.js:309`, pinned equal by `hooks/test/join.test.js:95`) and silent (:139).
  Its post closes its ticket once the gate2 is signed (`deck/store-items.mjs:135`; yellow-lane S15–S17 swap the red/green state names, which this design never reads or writes). ADR 0044: its data is the record's
  `report` field; the item is what the user reads.
- User replies go through one function, `addReply` (`deck/store-items.mjs:253`), from
  `POST /reply` (`deck/server-routes.mjs:227`). A refusal is `DeckRefusal`; on a page press
  `landRefusedPress` (`deck/server-wait.mjs:426`) redirects with `?refused=`. `addReply`
  reopens a closed thread (:282) before writing, so the refusal must precede that line.
- Agent replies go through `addPilotMessage` (`deck/store-items.mjs:317`, `deck_reply` at
  `deck/server-tools.mjs:299`); `writeToThread` refuses a non-owner. yellow-lane adds a
  `promise` parameter to it.
- The thread page's reply box: `renderReplySlot` (`deck/ui/render-cards.mjs:34`), called at
  `deck/ui/render-pages.mjs:434` for every open item; a report gets the textarea and Send. Only
  the rail's Closing reports panel is form-free (`deck/test/standing.test.mjs:137`).
- Delivery: `repliesSince` (`deck/store-runs.mjs:91`) returns every user reply with its `kind`,
  no kind filter; `deck_wait` (`deck/server-tools.mjs:445`) filters by repo, `--item`, fresh and
  owner only. Hooks: `awaitsPilot` (`hooks/lib/deck.js:335`) and `unanswered` (:360) have no
  kind check, used by `hooks/stop-gate.js:318` and `hooks/inbox-alert.js:188`. `awaitsUser`
  (`stop-gate.js:104`) already skips standing kinds.
- Post-time shape checks are pure `<kind>-shape.mjs` modules returning gaps
  (`deck/walkthrough-shape.mjs`, `deck/question-shape.mjs`), called from `postItem` (:65).
- The store holds 56 reports (54 open), none with a user reply, none with `options`; 11 trip a
  bare phrase rule, 9 of them "I reply here with what is kept", the pilot announcing its own
  worktrees reply. No line ends in `?`; `?` appears inside URLs, regexes, `??` and a quoted title.
- The pilot's prompt pin: `scripts/test/measure-prompt.test.mjs` (`own <= …`), measured by
  `scripts/measure-prompt.mjs`.

Collisions with `feat/yellow-lane` (it lands first; this run cuts after it or rebases):

| File | yellow-lane | here |
| --- | --- | --- |
| `agents/pilot.md` "Ending a run" | S17 rewrites "the friction rows ranked into…" to "the friction the deck ranks from the record's rows" and adds a friction paragraph | S4 edits the same sentence's "for the user to pick from" and adds one clause |
| `scripts/test/measure-prompt.test.mjs` | pin to 10775.25 | S4 moves it from whatever the base holds |
| `deck/store-items.mjs` | `addReply` (refuseSignOffBlocked), `addPilotMessage(…, promise)` | S1 one guard in `addReply`; S2 one guard each in `postItem` and `addPilotMessage` |
| `docs/adr/` | 0143–0147 | 0148 |

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `deck/items.mjs` record kinds | `RECORD_KINDS`, `isRecord(item)` | the "takes no reply" rule, one spelling for the store, the page and delivery | in-process |
| `hooks/lib/deck.js` | `isRecord(item)`, `unanswered(items, posted, baseline, repo)` | the hooks' spelling, pinned equal to the deck's | in-process |
| `deck/report-shape.mjs` (new) | `reportAskGaps(body, screens)` | the ask patterns, the code-span and quote exemptions | in-process |
| `deck/store-items.mjs` | `addReply(id, said)`, `addPilotMessage(id, text, author, to, promise)`, `postItem(item)` | the refusals, before any write or reopen | local-substitutable (store dir) |
| `deck/store-runs.mjs` | `repliesSince(since, limit)` | delivery skips record kinds for every waiter | local-substitutable (store dir) |
| `deck/ui/render-pages.mjs` | `renderThreadPage(item, …)` | `renderReplySlot` draws nothing for a record | in-process |

Deletion test: `isRecord` holds the rule for four daemon call sites and the hooks' mirror;
deleting it spreads `kind === 'report'` over five places with no pin keeping the hooks in step,
so it stays. `reportAskGaps` is a pure module like its two siblings. Nothing is shallow enough
to fold: no fold slice.

## 4. Ubiquitous language

- **Record**: an item kind that takes no reply from the user; today only `report`.
- **Closing report**: the `report` item that closes a ticket after its Gate 2 (ADR 0044).
- **Ask**: a body line or step that wants an answer from the user (§2 line 4's patterns).
- **Worktrees reply**: the pilot's one reply on its closing report, the worktrees the landing kept.
- **Chat**: the repository's always-open thread where the user talks to the pilot.

## 5. Locked decisions

- **L1 One refusal in the store, not in the route.** `addReply` refuses, so the page, a curl and
  any future caller meet it. Rejected: hiding the box only (a POST still lands, the incident's path).
- **L2 Only `report` is a record.** Tickets take user comments the pilot acts on (ticket-making's
  Add). Rejected: reusing `isStanding`, which would silence ticket comments.
- **L3 Delivery filters stay, though the store refuses.** Spec 3 is the user's line, and a reply
  written into the store by hand or by an older daemon must still never reach a pilot. Cost about
  20 lines. Rejected: trusting the refusal alone.
- **L4 Asks are refused at post, as gaps, in a pure module.** The `walkthrough-shape` pattern;
  ADR 0141's cheapest unskippable mechanism. Rejected: prose in pilot.md only.
- **L5 A posting rule, not a storage rule.** Stored reports are not re-checked, rewritten or
  closed; their pages lose the reply box at once because the page reads the kind.
- **L6 Reopen stays on a closed report.** It carries no text; reopening only re-stands it.
- **L7 The ADR is 0148**, the next after yellow-lane's 0143–0147.

## 6. Assumed decisions

- **A1 The ask patterns.** Default (main confirmed the list): a line whose last character outside
  code spans and quotes is `?`, or "say so", "tell me", "let me know" (case-insensitive); "reply
  here" is left off. Tradeoff: a fixed list misses a paraphrase ("ping me when", and the closed
  itm_ab5fbcb2e72f's "Reply here when #72 is merged" would pass); a wider list (any "reply", any
  `?`) refuses the nine sanctioned "I reply here" lines and every URL query.
- **A2 The refusal's wording.** Default: `a closing report is a record and takes no reply (ADR 0148);
  say it on the chat: /thread/<chat id>`, the chat looked up by the report's repo. Tradeoff: a
  repository with no chat yet names `/` instead.
- **A3 The pilot's worktrees reply is checked too** (spec 5). Default: yes. Tradeoff: one more
  refusal on the pilot's path; without it the sanctioned reply is the one channel left.
- **A4 QA runs against a scratch deck** (`pilot deck --scratch`), the reply planted in the scratch
  store file. Tradeoff: the live deck's 54 reports are only read, never exercised.

## 7. Out of scope

- Closing or archiving the 54 open stored reports (itm_351eeb1012f6 notes they bloat a first-turn
  `deck_read`): a separate ticket.
- Re-checking stored reports, or refusing replies on any other kind.
- The record's `report` data (ADR 0044) and `deck_status`.

## 8. Slices

Width 3; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | The user cannot reply on a closing report (walking skeleton) | 1, 2, 7 | `deck/items.mjs`, `deck/store-items.mjs`, `deck/ui/render-cards.mjs`, `docs/adr/0148-a-closing-report-is-a-record-never-a-channel.md` (new), `docs/adr/README.md`, `deck/test/report-record.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | A closing report that asks is refused | 4, 5 | `deck/report-shape.mjs` (new), `deck/store-items.mjs`, `deck/test/report-shape.test.mjs` (new), `deck/test/fixtures/report-lines.json` (new) | S1 (`deck/store-items.mjs`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |
| S3 | A stored reply on a report reaches no pilot | 3 | `deck/store-runs.mjs`, `hooks/lib/deck.js`, `hooks/test/join.test.js`, `hooks/test/report-record.test.js` (new), `deck/test/wait-record.test.mjs` (new) | S1 (`deck/items.mjs` `isRecord`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S3](slices/S3.md) |
| S4 | The pilot ends a run without asking on its report | 6, 8 | `agents/pilot.md`, `scripts/test/measure-prompt.test.mjs`, `scripts/test/report-record-wording.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S4](slices/S4.md) |

S4 cites ADR 0148 by number only and owns no file S1 owns, so it runs beside S1.

## 9. Acceptance evidence

On a scratch deck (`pilot deck --scratch`), in the order the user meets it:

1. A closing report's thread page shows the report and no reply box (spec 2).
2. A `POST /reply` on that report answers the refusal naming the chat and ADR 0148, and the
   report's replies are unchanged (spec 1, 7).
3. A report posted with "Decide whether this becomes a ticket (say so on the chat)." is refused
   naming that step; the same report without it posts (spec 4).
4. The pilot's worktrees reply with "Tell me which to keep" is refused; "Kept: …" is stored (spec 5).
5. A user reply written into the scratch store on that report: `pilot wait --as pilot` stays
   parked, the Stop gate lets the turn end, the inbox line names nothing (spec 3, 6).
6. `agents/pilot.md` "Ending a run" reads the new clause; the PR names the pin's move (spec 6, 8).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1, 2, 7 |
| S2 | planned | | | | S1 | 4, 5 |
| S3 | planned | | | | S1 | 3 |
| S4 | planned | | | | – | 6, 8 |
| report-record | planned | feat/report-record | | | S1, S2, S3, S4 | 1–8 |
