# Thread kinds and who owns them

Feature `thread-kinds` · ticket itm_2899d7dd82d7 · branch `design/thread-kinds` · base `main` at 778c98b (0.7.14)

## 1. Problem

The deck's threads are where the user meets the crew, and five of them behave worse than the user expects:

- The audit item is an 18-paragraph wall nobody can scan (itm_ff114b08d5e9), Evidence and Fix buried inline, in an
  order whose reason is invisible, and its author is gone the moment it posts.
- The status tab stacks three runs' slices: nothing at a run's end clears them.
- Gate 1 and Gate 2 are an undifferentiated `signoff` with a `gate` tag that the pilot's own tool schema (the 0.7.12
  cache) cannot send, so the tab's phase never moves.
- A resumed session can hold a run for minutes without saying so on the hand-off thread; the user pressed Handoff
  failed on silence (itm_1f8e3533ae5f, 04:43Z to 04:47Z).

## 2. Spec

Numbers are stable; the pilot holds them. *assumed* marks a line the user has not confirmed.

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | Each finding in the audit item has its **Evidence** and **Fix** on their own lines, labels bold. | The item on a scratch deck shows both labels, each starting a line. |
| 2 | The audit item is concise: per finding one headline (id, finding cut to ~100 chars, score, saving, effort), one short Evidence and one Fix line; the full report's path at the foot; the `.md` report and `audit spec` unchanged. | The 18-row fixture's deck body is under 55% of today's length *assumed threshold, moved from 40% on 2026-10-01: at 40% the Fix line loses its verb object (S7's measurement, 60% at the Interface's cuts)*; `audit spec` output byte-identical. |
| 3 | Findings run in order of importance and the order is legible: each headline shows the score it was ranked by; rows saving nothing sit under a closing "Baselines" heading. (L1) | The first finding has the top score; baselines last under their heading. |
| 4 | The auditor stays alive and owns the audit thread, as QA holds one: a reply typed there is answered there by the auditor; the pilot can take it back. | The byline and owner say auditor; a typed reply is answered by it; `to: "pilot"` takes it back. |
| 5 | *implied* An auditor that has gone leaves the thread to the pilot by the owner fallback (ADR 0045). | End the auditor, reply; the pilot answers after the fallback window. |
| 6 | The auditor posts the picked tickets itself and resolves the audit item (L14). | The tickets carry the auditor as author; the item resolves listing their ids. |
| 7 | A `deck_status` whose slug has no record yet starts a fresh table on the tab; the old slug's record keeps its rows. | Two runs in one repo: the tab shows only the second's rows; the first record lists its own. |
| 8 | Setting `finished` empties the tab's status table and tree at once; the record keeps the rows. | After the closing report's call, table and tree are empty. |
| 9 | The TEMPORARY paragraph in `agents/pilot.md` "Ending a run" is gone. | `grep -n TEMPORARY agents/pilot.md` prints nothing. |
| 10 | `deck_post` takes kinds `gate1` and `gate2`; a `signoff` carrying `gate` is refused naming the kind to use. | Post each; the tagged signoff is refused. |
| 11 | A `gate1` needs `artefact`, `sha`, `locked` (count) and `slices`; a `gate2` needs `pr` and `sha`, and `walkthrough` only when QA posted one (walkthroughs are not mandatory, L19); a missing required field is refused by name. | Each missing required field refused; a complete post stored; a gate2 without `walkthrough` accepted. |
| 12 | The `gate` tag is retired everywhere: the phase reads kinds only (ADR 0052 amended). | No `gate` field in `deck/*.mjs` or the `deck_post` schema; the phase tests pass. |
| 13 | Each gate kind draws Sign off and Not yet, its own note, and its evidence as a field block, not prose. | Rendered on a scratch deck and looked at. |
| 14 | `signoff` stays for non-gate sign-offs; `pilot.md` and `pilot-qa.md` post the new kinds. | The token and sentence pins hold. |
| 15 | A signed `gate1` moves the tab green *planning* to yellow *implementing*; a signed `gate2` yellow to red *concluding*; nothing else moves it forward, and the closing report no longer clears it (L17). The red phase is named *concluding* wherever it is named (L18). | Scratch deck: the colour changes only on those two threads and stays red after the report. |
| 16 | The phase resets to green when a new ticket starts in the directory: a hand-off, a `question` or a `gate1` posted while red, or a small ticket started while red (a side job started beside a yellow run holds it, as a hand-off from yellow does, L13). | Post a question while red: the tab goes green; start a small ticket while yellow: stays yellow. |
| 17 | A hand-off posted while red resets to green; one posted while yellow holds (L13). | Hand off from red: green. From yellow: stays yellow. |
| 18 | A resumed session's first tool call is a reply on the hand-off thread saying it holds the run; the SessionStart lane and `pilot.md` name it first; a sentence test pins it. | Scratch deck: the first message on the thread is that reply. |
| 19 | A hand-off with no pilot reply 3 min *assumed* after posting shows *unacknowledged* on the thread and the tab. | Post one and do not resume: after 3 min both show it. Resume: it never shows. |
| 20 | Handoff failed pressed on an acknowledged thread tells the user it was picked up and when. | Press it after the reply: the thread says "picked up at <time>". |
| 21 | *implied* A chain hand-off the lane resolves itself counts as acknowledged at that resolution. | Chain one: it never shows unacknowledged. |
| 22 | A run has a record from its first minutes: the pilot's first `deck_status` lands at step 1, before the architect is spawned, with `slug`, `feature` and a `next` naming the open items and the design branch. | During grilling, `GET /api/record?repo=<dir>` returns the slug and its `next`. |
| 23 | A fresh session in a directory whose newest record is unfinished, with no open hand-off there and no other live session, is handed that record by the SessionStart lane as a *recovered* run: the hand-off's payload shape (record + open threads) under a notice that says recovered, not handed off. | Kill the host mid-run without `pilot handoff`; the next session's first notice says recovered and carries the record and its `next`. |
| 24 | `next` is the save state: `pilot.md` says every `deck_status` that moves a row carries the current `next`, so a crash loses at most the move since the last call. | A sentence pin on `pilot.md` holds. |
| 25 | No `spec` item is posted: the kind is retired from the deck (its place in the kinds lists, its buttons, its renderer, and the open-question refusal as far as it concerned a spec, which stays for `signoff`, `gate1` and `gate2`); the pilot agrees the spec through grilling and the artefact's §2, and the user reads it at Gate 1 in the artefact the `gate1` thread names. | `deck_post` with kind `spec` is refused, saying the kind is retired; no `KIND_SPEC` in `deck/*.mjs`; the `pilot.md` pin holds. |

Line 16 is sharpened from the 04:47Z comment's "a ticket is started or a run's first `deck_status` lands for a new
slug": a regular ticket is never "started" on an item (only small tickets carry `startedAt`, `deck/store.mjs:915`), and a
slug is not an item (L4). A chained run reaches the deck as the chain's hand-off (`deck/chain.mjs:79`); a run started
from a bare prompt reaches it as its first grilling `question`, or, with nothing to ask, its `gate1`; each while the
tab is red (L15).

Line 25 was added after the 24-line spec was agreed as posted (itm_ba266bb3a2a7), from the user on itm_561602da0fc1
at 07:25Z: "i dont like that i have to confirm on the creation of a spec ... i will look at it at gate 1", then "it
feels redundant and that it should be removed." It moved line 16's trigger from a `spec` to a `question`.

## 3. Findings

| # | Fact | Where |
| --- | --- | --- |
| F1 | The audit is already ranked: `rankRows` sorts by (minutes + tokens/1000) ÷ effort weight, ids F1..Fn in that order; itm_ff114b08d5e9 is in that order with its baselines (F16-F18) last. What is missing is the reason, not the order. | `deck/audit.mjs:105-117` |
| F2 | The deck body is one line per row, `Evidence:` and `Fix:` inline; the `.md` table and its spec section are separate. | `deck/audit.mjs:159-200` |
| F3 | The audit item is posted by the session running the skill, not the auditor; the auditor has no deck tools. | `skills/audit/SKILL.md:36-45`; `agents/pilot-auditor.md:5` |
| F4 | Owner kinds are a closed list `['pilot','qa','teacher']`; author kinds map an unknown agent type to `other`; an owner kind's own post is its own (A1 rule); a stamped non-owner is refused a wait. | `deck/items.mjs:434-493`; `deck/store.mjs:569`, `:1007-1021`; `deck/server.mjs:888` |
| F5 | The owner fallback is kind-generic (30 s unpicked, 5 min unanswered, 90 s quiet) but its note names "your QA agent"; the roster ignores non-owner kinds. | `deck/store.mjs:1088-1158`; `deck/server.mjs:550-552`; `deck/agents.mjs:195` |
| F6 | `setSlices` lays a call's rows over `previous?.slices ?? run.slices`: a new slug has no record, so it inherits the last run's rows; `finished` never empties the run's table. | `deck/store.mjs:1347-1348`, `:1364` |
| F7 | `KINDS` drives full auto; `POSTABLE_KINDS` is the `deck_post` enum; `GATED_KINDS` = spec, signoff (ADR 0029); `GATES`, `GATE_FIELD`, `GATE_2_FIELD` carry the tag. ADR 0051 rejected gate kinds; this feature supersedes that line at the user's request. | `deck/items.mjs:85-110`, `:280-291`; `deck/tools.mjs:34-40`, `:151`, `:185` |
| F8 | `runPhaseOf` reads `item.gate` after the newest `report`; callers `tabsOf` and the away rule. Gate 2 passes on a pilot signoff or on QA's walkthrough. | `deck/items.mjs:605-621`; `deck/tabs.mjs:140`; `deck/store.mjs:593`; `agents/pilot.md:298`, `:483`; `agents/pilot-qa.md:129` |
| F9 | `tabsOf` takes runs, items and four maps; `renderHomePage` takes twelve positional arguments. A phase input that is not an item threads through both. | `deck/tabs.mjs:87`; `deck/ui/render.mjs:1844-1858` |
| F10 | Walkthrough and report draw their fields as a `<dl class="detail">` (`renderWalkthroughDetail`); signoff draws none. | `deck/ui/render.mjs:184`, `:303-316` |
| F11 | `handoff` is postable, not in `KINDS`; its one button, Handoff failed, is an ordinary reply with no server path but the chain's un-resolve. The lane tells the stash session to resolve the thread, not to reply first. | `deck/items.mjs:60-65`, `:361-366`; `deck/store.mjs:683-712`; `hooks/session-handoff.js:154-175` |
| F12 | `threadState` is pure, from the last message; nothing marks an item by age; `server.mjs`'s due timers (`setTimeout(announceChange)`) are the model for a repaint. | `deck/items.mjs:683-691`; `deck/server.mjs:520-575`; `deck/ui/render.mjs:658` |
| F13 | Pins on agent prose: `scripts/test/pilot-agents.test.mjs:323` (`kind \`signoff\``), `:1039-1057`; `small-ticket.test.mjs:65`; `ticket-making.test.mjs:79`; the lane's notice in `hooks/test/session-handoff.test.js:726-731`. | as named |
| F15 | The lane returns before reading the record when no open hand-off is for the cwd, and claims per item id; the record is written only by `deck_status` with a slug, first sent at slice-table time, so steps 1-3 have none; a hand-off carrying `next` takes the chain branch; `item.repo` is matched exactly. `GET /api/runs?live=1` is already in the hooks' client. `chainNext` at start chains only on a null or finished record. | `hooks/session-handoff.js:126`, `:248-264`; `deck/server.mjs:793-795`; `deck/store.mjs:1373`; `agents/pilot.md:536-546`; `hooks/lib/deck.js:162`; `deck/chain.mjs:72-74` |
| F16 | The `spec` kind: in `KINDS`, `GATED_KINDS` and `RUN_KINDS`; its `SPECS` entry fixes the buttons agree / agree with edits and refuses options; a reply prompt; a `KIND_RENDERERS` entry; `refuseOverOpenQuestions` refuses it while a `question` is open (ADR 0029). `pilot.md` step 3 posts it and waits on it; full auto names it. Pins: `deck/test/spec-gate.test.mjs`, `type-buttons.test.mjs`, `audit-kind.test.mjs`, `scripts/test/pilot-rules.test.mjs`. | `deck/items.mjs:33`, `:85`, `:110`, `:306`, `:346-350`, `:605`; `deck/store.mjs:518-529`, `:575`; `deck/ui/render.mjs:306`; `agents/pilot.md:72`, `:176-181`, `:256-262` |
| F14 | The pilot's tool schemas and agent files come from the plugin cache (0.7.12), not the repo. Nothing here reaches a live run until a release holding it is installed. | ADR 0001; ticket comment 04:48Z |

## 4. Ubiquitous language

- **Gate thread**: an item of kind `gate1` or `gate2`. A `signoff` is never a gate.
- **Phase**: planning (green), implementing (yellow), concluding (red; formerly *closing*); derived from items, never stored.
- **Cycle start**: the newest moment the phase went back to planning: a small ticket's `startedAt`, or a hand-off, a
  `question` or a `gate1` posted, each while the phase was concluding (the pilot's clarification of 2026-10-01 on S3's PR #249: a small ticket is a side job beside a live run and never resets a yellow tab).
- **Acknowledged**: a hand-off with a pilot message on it, or resolved by the lane. **Unacknowledged**: open, no
  pilot message, older than the interval.
- **Owner**: the one kind whose wait hears a thread's replies; `auditor` joins pilot, qa and teacher.
- **Tab table**: the status table and tree on the tab, the run row's `slices`; the **record** keeps its own copy per slug.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
| --- | --- | --- | --- |
| L1 | Spec 3 keeps `rankRows`; the headline prints the score; zero-saving rows move under "Baselines". | F1: the order exists, its reason is invisible. The user's answer on itm_fd1e46c47a8e. | A new importance field from the auditor's judgement: a second ranking to explain. |
| L2 | The deck body changes only in `renderReport`'s `deckBody`; the `.md` table, the JSON and `specFor` are untouched. | The detailed report is what a fix is written from (the user's words). | Trimming the `.md` too. |
| L3 | `auditor` joins `OWNER_KINDS` and `AUTHOR_KINDS`; the auditor posts the audit item itself, so it owns it by the A1 rule; `PASS_KINDS` unchanged; the fallback note names the owner kind, not QA. The skill keeps both git snapshots: the auditor messages the skill's session when measured and posts once handed the diff lines. | The teacher precedent (ADR 0053); the snapshot proves the auditor left the repo as found, so the auditor cannot take it. | A pass to `auditor`: a new `to` value in the schema for one item. |
| L4 | The phase stays derived from items (ADR 0052): `runPhaseOf` reads gate threads after the cycle start, computed from items alone. | F9: any input not an item threads through `tabsOf` and `renderHomePage`. | A stored per-repo cursor; a record `startedAt` passed into `tabsOf`. |
| L5 | `gate1`/`gate2` evidence are post fields in `SPECS`, validated by `detailOf` and drawn by the walkthrough's `<dl>` renderer; both join `KINDS`, `GATED_KINDS` and `RUN_KINDS`. ADR 0057 supersedes ADR 0051's rejection and amends 0052. | The field machinery and renderer exist (F7, F10); full auto keeps resolving gates. | Parsing body sections; keeping `signoff` with a required `gate`. |
| L6 | No read-time alias for stored gate-tagged items; `GATES`, `GATE_FIELD` and `GATE_2_FIELD` are deleted. | Spec 12; at most one wrong colour on an in-flight tab at upgrade. | A legacy reader kept for ever. |
| L7 | Unacknowledged is derived at read beside `threadState`, with one `setTimeout(announceChange)` at the interval to repaint. | ADR 0017: derived, never declared. | A stored flag written by a sweep. |
| L8 | Handoff failed on an acknowledged hand-off: `addReply` stores the press carrying `pickedUpAt`, the first pilot message's time; the thread draws "Picked up <time>" under it. Amended in the fix round (F2, QA 3): no deck-authored note. | Spec 20; one write path, and the pilot sees it through the reply (`repliesSince`). | A deck-authored note, which every "last word" reader had to skip; a render-only line the pilot never sees. |
| L9 | `setSlices` starts from `[]` when the call's slug has no record, and sets `run.slices = []` when `finished` is set; the record keeps the table either way. | F6; the 00:40Z answers (record keeps rows, tab empties at `finished`). | Dropping rows at the next run's start. |
| L11 | Recovery (23) is a third lane branch after the hand-off pick: no open hand-off, `recordFor(cwd)` unfinished, no live run in the directory but this session's. It claims `recovered-<slug>-<updatedAt>`: one saved state is delivered once, and a later `deck_status` (a new save) is deliverable after the next crash. It never takes the chain branch; it is built from the record, not an item. | Spec 23; the claim mechanism exists (`claimFor`); the live-run check stops a second terminal being told it owns the first's run. | Re-delivering on every start: a `/clear` or a second terminal would be handed a live run. A claim on slug alone: a second crash of one run delivers nothing. |
| L12 | `chainNext` is unchanged. With a record from step 1, `pilot run` where a run crashed during grilling says "a run is unfinished" instead of chaining the next ticket; the recovered lane is how that run is picked up. | F15: `atStart` already refuses on an unfinished record. | A recovery-specific chain rule. |
| L13 | A hand-off from yellow holds the phase (spec 17). | The user's answer on itm_497c0390c3ae. | Resetting to green on every hand-off. |
| L10 | Grilling depth: *forks* — only decisions whose paths give materially different deliverables reach the user as items; the rest are recorded as assumed. | The user's answer on itm_0e966cc91f81, 2026-10-01; nothing here touches schema, auth, money or irreversible data. | *every*: twenty-plus items for a bundle of deck rules. |
| L14 | The auditor posts the picked tickets itself and resolves the audit item (spec 6). | The user's answer on itm_2939b20603c7. | The pilot posting them, which needs a pilot session still waiting on the thread. |
| L15 | The `spec` kind is retired: out of `KINDS`, `POSTABLE_KINDS`, `GATED_KINDS`, `RUN_KINDS`, `SPECS`, `PROMPTS` and `KIND_RENDERERS`; a post of it is refused by a named check saying it is retired and the spec lives in the artefact's §2. The open-question refusal stays for `signoff`, `gate1` and `gate2`. A stored `spec` item draws as an unknown kind, with Dismiss (ADR 0051 L3). The phase's new-run trigger becomes the first `question` posted while red, with `gate1` posted while red as the backstop for a run with nothing to ask; ADR 0029 is amended by ADR 0057. | The user's words on itm_561602da0fc1; items alone (L4): a bare-prompt run's first item is a grilling question, or its Gate 1. | A silent spec resolved at post (the user's first wording, withdrawn a minute later); a `ticket` posted while red as the trigger, because tickets are queued while concluding ("you can add it as a ticket"). The cost kept: a `question` the pilot asks while red, after Gate 2, resets the tab early. |
| L16 | The auditor stays parked on `deck_wait` until its item resolves or its parent session ends; then the owner fallback (spec 5). | The user's answer on itm_bb888fca7c61. | An idle timeout that frees the slot sooner. |
| L17 | After the closing report the tab stays red until a new ticket starts (spec 15, 16); the null phase goes. | The user's answer on itm_6f790feeb38a. | A report clearing the phase, as today. |
| L18 | The red phase is renamed *concluding*: `runPhaseOf`'s value, the `data-phase` CSS rule, the tests that name it, `pilot.md`'s day-and-night paragraph (`:144-145`) and ADR 0057's amendment of 0052. "Closing report" (the report kind) keeps its name. | The user's addendum on itm_6f790feeb38a. | Renaming the label only on the page, leaving the value `closing` beneath it. |
| L19 | Gate 2 is the pilot's `gate2` thread alone: the walkthrough loses its tag, the pilot posts `gate2` citing it once signed, and only `gate2` moves the phase. A walkthrough is any step-by-step ticket only the user can do and is not mandatory, so `gate2`'s `walkthrough` field is optional (spec 11). | The user's answer on itm_6fc36533cc72: the recommended option, with "walkthroughs are not mandatory ... they can be for other things such as cloud configs or github configs". The generalisation itself is merged into the queued ticket itm_fa23429a3888. | QA posting its walkthrough as kind `gate2`: one press, but the gate's evidence buried under forty steps and the walkthrough id meaning nothing. |

## 6. Assumed decisions awaiting the user

| # | Question | Default taken | Tradeoff |
| --- | --- | --- | --- |
| A2 | Stored gate-tagged sign-offs after the upgrade. | No alias (L6); an in-flight tab shows green until its next gate thread. | One wrong colour once, against a legacy reader. |
| A8 | The concision threshold (2) and the unacknowledged interval (19). | Under 55% (was 40%: S7 measured 60% at the agreed cuts, and 40% guts the Fix line the user asked to see); 3 min. | Numbers, cheap to change. |
| A9 | A run left without a finish now blocks chaining at `pilot run` until its record is finished (L12). | Kept: the pilot is offered the recovered run, and the user ends it by having the pilot finish it as abandoned. | A days-old record still blocks the queue; an age cut-off would unblock it but could drop a real run. |

## 7. Out of scope

- Releasing to the plugin cache (F14): a separate bump after Gate 2; until then no live run sees any of this.
- The wizard's closing `signoff` (`skills/wizard/SKILL.md:66`): not a gate, unchanged.
- A pass to the auditor (`PASS_KINDS`), the audit's measuring, and `audit pick`/`audit spec`.
- Migrating stored items (L6).

## 8. Slices

| Slice | Title | Spec | Files owned | After | File |
| --- | --- | --- | --- | --- | --- |
| S1 | Gate threads post as their own kinds (walking skeleton) | 10, 11 | `deck/items.mjs`, `deck/store.mjs`, `deck/tools.mjs`, `deck/ui/render.mjs` (kind table), `deck/test/gate-kinds.test.mjs` (new) | – | [S1](slices/S1.md) |
| S2 | The phase reads gate kinds; the tag is retired; red is *concluding* | 12, 15 | `deck/items.mjs`, `deck/store.mjs`, `deck/tools.mjs`, `deck/ui/deck.css` (phase rule), `deck/test/phase.test.mjs`, `deck/test/away.test.mjs` | S1 | [S2](slices/S2.md) |
| S3 | The phase resets at a new ticket | 16, 17 | `deck/items.mjs`, `deck/test/phase-reset.test.mjs` (new) | S2 | [S3](slices/S3.md) |
| S4 | A gate thread draws its evidence block | 13 | `deck/ui/render.mjs`, `deck/ui/deck.css`, `deck/test/gate-render.test.mjs` (new) | S2 | [S4](slices/S4.md) |
| S5 | The crew posts gate threads | 14 | `agents/pilot.md`, `agents/pilot-qa.md`, `skills/ticket-making/SKILL.md`, `CONTEXT.md`, `docs/adr/0057-gate-threads-are-kinds-and-drive-the-phase.md` (new), `docs/adr/0051`, `docs/adr/0052`, `scripts/test/*` pins | S2, S4 | [S5](slices/S5.md) |
| S6 | The tab's table holds one run | 7, 8, 9 | `deck/store.mjs` (`setSlices`), `agents/pilot.md`, `deck/test/status-run.test.mjs` (new) | S12 | [S6](slices/S6.md) |
| S7 | The audit item reads in a glance | 1, 2, 3 | `deck/audit.mjs` (`renderReport`), `deck/test/audit-body.test.mjs` (new) | – | [S7](slices/S7.md) |
| S8 | A picked-up hand-off says so at once | 18, 20 | `hooks/session-handoff.js`, `hooks/test/session-handoff.test.js`, `agents/pilot.md`, `deck/store.mjs` (`addReply`), `deck/test/handoff-ack.test.mjs` (new) | S6 | [S8](slices/S8.md) |
| S9 | Silence on a hand-off is a state | 19, 21 | `deck/items.mjs`, `deck/server.mjs`, `deck/tabs.mjs`, `deck/ui/render.mjs`, `deck/ui/deck.css`, `deck/test/handoff-unacked.test.mjs` (new) | S3, S4, S8 | [S9](slices/S9.md) |
| S11 | A crashed run is recovered from its record | 22, 23, 24 | `hooks/session-handoff.js`, `hooks/test/session-handoff.test.js`, `agents/pilot.md`, `scripts/test/pilot-agents.test.mjs` (pin) | S8 | [S11](slices/S11.md) |
| S12 | The spec kind is retired | 25 | `deck/items.mjs`, `deck/store.mjs`, `deck/tools.mjs`, `deck/ui/render.mjs`, `agents/pilot.md`, `docs/adr/0057-*.md` (amends 0029), `deck/test/spec-gate.test.mjs`, `deck/test/type-buttons.test.mjs`, `deck/test/spec-retired.test.mjs` (new), `scripts/test/pilot-rules.test.mjs` | S3, S5 | [S12](slices/S12.md) |
| S10 | The auditor owns its thread | 4, 5, 6 | `deck/items.mjs`, `deck/server.mjs`, `deck/ui/deck.css`, `agents/pilot-auditor.md`, `skills/audit/SKILL.md`, `docs/adr/0058-the-auditor-owns-its-thread.md` (new), `deck/test/auditor-owner.test.mjs` (new) | S7, S9 | [S10](slices/S10.md) |

DAG: S1 → S2 → S3; S2 → S4; {S2, S4} → S5; {S3, S5} → S12 → S6 → S8; {S3, S4, S8} → S9; {S7, S9} → S10; S8 → S11, which runs beside S9 and S10 (it owns the lane and `pilot.md`; they own neither). S7 has no
blocker and runs beside S1-S6; S4 runs beside S3 (render and CSS only; after S2 because S2 renames the phase's CSS rule). Every other pair shares
`deck/items.mjs`, `deck/store.mjs`, `deck/server.mjs`, `deck/ui/render.mjs` or `agents/pilot.md` and is serial.
Each slice stays under 400 changed lines excluding tests and fixtures; S1 and S2 carry the largest test churn
(about 20 deck tests hard-code `signoff` or `gate`).

### Runs

| Run | Slices | Spec lines | After |
| --- | --- | --- | --- |
| R1 `thread-kinds` | S1-S12 | 1-25 | – |

Twelve slices × ~30 min ≈ 6 h, at the one-run bound of 12 and inside the 5-7 h band (`skills/ticket-making/SKILL.md` "Size"), so one run and one Gate
2. The jobs cannot split into runs that stand alone: jobs 3, 4 and 5 share `deck/items.mjs` (kinds, phase, thread
state); jobs 2, 3 and 5 share `agents/pilot.md` and `deck/store.mjs`; jobs 1, 3 and 5 share `deck/server.mjs`,
`deck/ui/render.mjs` and `deck.css`. Only job 1's body (S7) is file-disjoint. A two-deck cut would be R1 = S1-S6,
S8, S9, S11, S12 (jobs 2-7, 10 slices, 5 h) and R2 = S7, S10 (job 1, 1 h, under the band and so merged back by the Size rule):
offered, not recommended.

## 9. Acceptance evidence

On a scratch deck started from the feature worktree on another port, with `PILOT_DECK_DIR` a scratch directory, in
the order a user meets it:

1. A fresh repo's tab is green. A `signoff` with `gate: "1"` is refused naming `gate1`; a `gate1` without `sha` is
   refused naming `sha`; a whole one shows its evidence block and Sign off / Not yet (10, 11, 13).
2. Sign off the `gate1`: the tab turns yellow. Sign off a `gate2`: red. Post the report: still red (15).
3. Post a hand-off: green (16, 17). Repeat from yellow: stays yellow. From red again, post a `question`: green (16).
   Post a `spec`: refused, saying the kind is retired (25).
4. `deck_status` with a new slug: only its rows on the tab; with `finished`: table and tree empty (7, 8).
5. Post a hand-off and wait 3 min: *unacknowledged* on the thread and the tab (19). Resume a session: its first
   message on the thread is the acknowledgement; Handoff failed then says when it was picked up (18, 20, 21).
6. `/pilot:audit` against the scratch deck: the item is short, scored, bold Evidence and Fix lines, baselines last
   (1-3); a reply is answered by the auditor; a pick of F1 is posted as a ticket by the auditor (4, 6); end the
   auditor and reply: the pilot answers after the fallback window (5).
7. During grilling, `GET /api/record` returns the run's slug and `next` (22, 24). Kill the host without `pilot
   handoff` and start a fresh session there: its first notice says recovered and carries the record (23).
8. `grep -n TEMPORARY agents/pilot.md` prints nothing (9); no `gate` field and no `KIND_SPEC` in `deck/*.mjs` (12, 25); `npm test` green (14).

## 10. Status

| Slice | State | Branch | PR | Worktree | Blocker | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 10, 11 |
| S2 | planned | | | | S1 | 12, 15 |
| S3 | planned | | | | S2 | 16, 17 |
| S4 | planned | | | | S2 | 13 |
| S5 | planned | | | | S2, S4 | 14 |
| S6 | planned | | | | S12 | 7, 8, 9 |
| S7 | planned | | | | – | 1, 2, 3 |
| S8 | planned | | | | S6 | 18, 20 |
| S9 | planned | | | | S3, S4, S8 | 19, 21 |
| S10 | planned | | | | S7, S9 | 4, 5, 6 |
| S11 | planned | | | | S8 | 22, 23, 24 |
| S12 | planned | | | | S3, S5 | 25 |
| feature | planned | | | | S1-S12 | 1-25 |
