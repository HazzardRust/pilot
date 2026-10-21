# yellow-lane: the yellow lane cannot sit idle, a blocked step is a blocking item, the install allows scratch decks

Ticket `itm_c310da07c9c6`, with `itm_f14acd8c224e` (red/green swap), `itm_b610f6d3a24f` (hand-off on work done) and
`itm_8d99d8ca5448` (friction survives the hand-off) merged in on 2026-10-13 (thread `itm_3ee239111925`).
Base `pilot` at 2bbbc8fe. Grilling depth: forks (L1).

## 1. Problem

Twice on 2026-10-11 the deck showed no yellow ticket active while one was planned: the co-pilot had been released and
nothing refused the idle lane. A crew agent's blocked step went up as a plain walkthrough with no blocking flag, so
the gate2 could pass over it. A plain ticket-making proposal held a red ticket's Gate 2 press. A nested QA was refused
`pilot deck --scratch`. On 2026-10-13 a hand-off dropped a chat reply the old session had promised to continue,
because only the record's `next` survives. The user wants each of these to be a mechanism, a refusal or a
record, and not a habit. The merged tickets add the following. Ticket states are renamed so that a ticket goes
red → yellow → green. The hand-off is advised on work done, not only on tokens. Friction rows survive every
session to the closing report.

## 2. Spec

| # | Behaviour | Evidence |
|---|---|---|
| 1 | `pilot wait` (kind pilot) exits at once, and the Stop hook blocks, with `yellow lane empty; itm_… is planned — deck_ticket co-pilot it first` when the directory has a yellow ticket and no live co-pilot. There is no refusal with a live co-pilot, with no yellow ticket, or while an open hand-off exists. | wait and stop-gate tests for each of the four cases |
| 2 | `deck_ticket co-pilot`, `release` and `need` answer with both lanes on one line: `Co-pilot X: released. Yellow: empty, next itm_…. Main: itm_…`. | store/tool tests on each reply |
| 3 | The lane line is `co-pilot: empty → next itm_…` or `co-pilot: itm_…`, in the `pilot handoff` body and in the SessionStart `Lanes now:` notice. | a session-handoff test on a planned ticket with no co-pilot shows the line |
| 4 | A `walkthrough` accepts `blocking`, and it counts as a blocking item of its ticket. | items tests |
| 5 | A ticket's gate2 is refused, on post and on Sign-off press alike, only while a blocking item of that ticket (question or walkthrough) is open. The refusal names the ids and the word `blocking`. A plain question never holds it. | a press passes with a plain open question and is refused with a blocking one |
| 6 | A ticket-making proposal is a `question` with `proposal: true` and no `ticket`. It never holds a gate1, signoff or gate2, and the Tickets tab still lists it open. | post and gate tests |
| 7 | A blocked step reaches the deck as a blocking item naming the exact command. #620's hooks post the denials. Here, the deck refuses a `Blocked:` question or walkthrough that names a ticket without `blocking`, with the rule, and pins on `agents/pilot.md` and the co-pilot name the rule. | the refusal test; the pins |
| 8 | The install allow-list gains `Bash(pilot deck --scratch *)` beside `--stop`, `land` and `integrate`. | the allow-list tests |
| 9 | An owed user thread is listed by id with its last line quoted, in the hand-off item and in both SessionStart notices (picked-up and recovered), also when the directory has no run record. | a session-handoff test with no record; a handoff test |
| 10 | `pilot handoff` exits non-zero naming the ids while a user thread has an unanswered user reply, and posts once it is answered. | a handoff test |
| 11 | `deck_reply` takes `promise: true`. A thread whose last pilot reply carries it is owed until the pilot replies again. *assumed* (A2) | a reply test; an owed test |
| 12 | Ticket states are `red` (planning), `yellow` (implementing) and `green` (concluding) in every reader and writer; the design is otherwise unchanged. | renamed tests green; a grep finds no old meaning in `deck/`, `hooks/` |
| 13 | The deck shows the states to match: planning red, concluding green, with labels and headings in red → yellow → green order. | a UI pin per state; a scratch-deck screenshot |
| 14 | Prose says the new words. An ADR records the swap and amends the ADRs that named the old ones. | wording pins; `check-references`; ADR index check |
| 15 | A store written before the swap loads with each ticket's meaning kept (`green` → `red`, `red` → `green`), once, by a versioned upgrade. No ticket changes state. *assumed* (A4) | a store test on a v1 fixture; a scratch deck seeded old |
| 16 | `hooks/context-size-guard.js` counts the work handled since the last hand-off: gate1s and gate2s signed in this directory. | a guard test on a deck with 2 signed gate2s and 1 gate1 reads "2 landings, 1 design" |
| 17 | At the ceiling the guard advises the hand-off before the token mark, naming what it counted. | a test under the token mark gets the advice |
| 18 | The count survives the hand-off because it is derived from the deck since the newest `handoff` item, not stored. *assumed* (A5) | a test with a hand-off item between the gates counts only those after it |
| 19 | The ceiling is a pin: 2 signed gates since the last hand-off. *assumed* (A5) | the pinned constant; the ADR |
| 20 | The run record's `friction` array is appended to by each `deck_status` that sends it, never replaced, and is mirrored to `run.json` and committed by `pilot handoff`. | a deck test appends across two calls; a handoff test's committed run.json holds the rows |
| 21 | Drain rows `{kind: "drain", what, size}` sit in the same array apart from agent rows `{agent, what, evidence, size?}`. Pins on pilot.md name the four drains. | a validator test; the pin |
| 22 | The hand-off generates nothing. The "When your own context fills" section asks for no friction summary. | a wording pin |
| 23 | The closing report's `report.friction` is derived from the record's rows from every session: the top 5 by size, drains listed apart. A `report.friction` sent by the caller is refused. *assumed* (A7) | a `finished` test |
| 24 | The co-pilot's definition names the friction row it writes per crew report. | a wording pin on `agents/pilot-co-pilot.md` |
| 25 | The pilot's prompt-budget pin moves by exactly what the clauses cost, named in the PR. The co-pilot has no pin (A9). | the pin diff |
| 26 | The plugin's version is bumped with the store format change, 0.8.4 → 0.9.0 in `package.json` and `.claude-plugin/plugin.json` (and the marketplace entry if it names one), in the swap slice. *added* (the user, itm_1f13152f78e2) | the version diff in both files, equal to each other; `node -e` reading both prints one number |

## 3. Findings

- **Lanes.** `deck/lanes.mjs:18` `lanesFrom` spells every lane string. `refusal` (:29) is main-only and suppressed by an open hand-off. `co-pilot` (:27) prints `co-pilot: none`. `coPilotStateOf` (`deck/items.mjs:607`) already answers `queued` for a yellow ticket with no co-pilot. `pilot wait` (`deck/wait.mjs:175`) and the Stop hook (`hooks/stop-gate.js:230`, :337) print `lanes.refusal` from `GET /api/record`, so a second refusal folded into that one string needs no hook change.
- **Notice regex.** `hooks/session-handoff.js:363` `CO_PILOT_LINE` accepts only `none|itm_…`. A new spelling would silently drop the whole Lanes block.
- **deck_ticket replies** are built in `deck/server-tools.mjs:330-341`. `need` says only the state; co-pilot and release say `mainClause`.
- **Gate2 rule is split.** The post waits on blocking questions only (`deck/store-core.mjs:469-479`). The press waits on every open question (`deck/store-items.mjs:500-505`, `openQuestionsOf`), which is the 2026-10-11 bug. `isBlocking` (`items.mjs:670`) is question-only. An unticketed open question holds every gate1 and signoff (`store-core.mjs:480-484`), so "post the proposal without `ticket`" alone moves the bug to gate1.
- **Blocked steps.** gate-no-stall (#620, `feat/gate-no-stall`) adds `hooks/lib/blocked.js`. Its `postBlocked` posts a `question` titled `Blocked: <command>` with `blocking` on the live ticket, for both auto-mode denials (`hooks/permission-denied.js`, `PermissionDenied`, auto mode only per code.claude.com/docs/en/hooks) and refused crew prompts (`hooks/permission-refuse.js`). The pilot-lane line of the 2026-10-12 comment is that ticket's spec 3 and is dropped here. The co-pilot has no `deck_post` (its tools: `deck_status`, `deck_read`), so its other blocked steps (`NOT landed`, a silent child) reach the deck through the pilot.
- **Allow-list.** `scripts/install-settings.mjs:560-568` `PILOT_MERGE_ALLOW`. Its comment (process-gc L14) says "never `deck --scratch`", and `scripts/test/install-allow-gc.test.mjs:40` asserts it. No ADR gives a reason; ADR 0135 leashes every scratch deck to its session.
- **Threads.** `chat` and `user` kinds (`items.mjs:53,57`) keep messages in `replies[]` with `from: 'user'|'pilot'` (`store-items.mjs:286,330`). `lastSaid` (`items.mjs:422`) reads through a pass. `openThreads` (`session-handoff.js:390`) excludes chats and runs only on record paths (:281, :461). No notion of a promise exists.
- **Record.** `deck/runs.mjs:237` `RECORD_ORDER`; `recordFields` (:346) validates; `nextRecord` (:400) replaces a sent field whole. `report.friction` rows are `{agent, what, evidence}` (:314), capped at `MAX_FINDINGS` 40. `mirrorRecord` (`server-tools.mjs:161`) writes run.json; `commitRecords` (`scripts/integrate.mjs:186`) commits it at hand-off.
- **Guard.** `hooks/context-size-guard.js` runs in PostToolUse via `post-tool.js`. For the pilot it reads the status-line snapshot, not the transcript (:27-31). It already reads the repo's deck items (`pilotRunFor`, :529). Signed gate1 and gate2 items carry `kind`, `repo` and `resolvedAt`.
- **States.** `TICKET_STATES` (`items.mjs:76`) is used only by `stateOf`. Every reader compares bare literals: 37 in `deck/*.mjs`, about 65 test files, labels at `deck/ui/render-rail.mjs:72,180`. CSS keys on the state name (`deck.css:320-322,433-435`), so colour follows the name and needs no edit. `STORE_VERSION = 1` (`store-core.mjs:45`); `readDeck` refuses any other version (:163) and has no upgrade path.
- **Pins.** `scripts/test/measure-prompt.test.mjs:154` pins the pilot at 10464 (10494.75 on gate-no-stall). There is no co-pilot pin.
- **Collisions.** gate-no-stall touches `agents/pilot.md`, `deck/server-tools.mjs`, `deck/items.mjs`, `scripts/install-settings.mjs` and the pin, and owns ADRs 0137-0140. verdict-pass (ce47f273) is docs-only so far and owns 0141-0142. **Rebase rule:** every slice is cut from `pilot` after #620 lands. A slice owning one of those five files rebases onto `pilot` before its gate, and S13 reads the pin from `pilot`'s tip, never this artefact.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| `deck/lanes.mjs` | `lanesFrom(items, repo, {switching, co-pilot})` → `{main, co-pilot, mainClause, yellowClause, refusal}` | the yellow refusal and both lane clauses, beside the main lane's | in-process |
| `deck/items.mjs` gate rule | `gate2Blockers(items, ticketId)`, `isBlocking(item)`, `holdsGates(item)` | the post's and the press's two gate2 predicates, folded into one | in-process |
| `deck/blocked-shape.mjs` (new) | `blockedShapeGaps({kind, title, ticket, blocking})` → `string[]` | the blocked-step backstop, beside `question-shape.mjs` | in-process |
| `deck/owed.mjs` (new) | `owedThreadsOf(items, repo)` → `[{id, line, why}]`; served as `GET /api/record`'s `owed` | unanswered and promised user threads | in-process, crossing to CommonJS hooks by HTTP |
| `deck/runs.mjs` record | `recordFields`, `nextRecord`, `rankFriction(rows)` | the friction append and the derived report rows | in-process |
| `hooks/context-size-guard.js` work | `workSince(items, repo)` → `{landings, designs}`; `WORK_CEILING` | the work count and its advice | local-substitutable (deck client fake) |
| `deck/store-core.mjs` store | `readDeck()`, `upgradeStore(raw)` → v2 deck | the v1 → v2 state swap | local-substitutable (temp store dir) |
| `scripts/install-settings.mjs` | `PILOT_MERGE_ALLOW` | the scratch-deck rule | in-process |

Deletion test: `refuseSignOffAsked` (`store-items.mjs:500`) fails it. It restates the gate2 rule with the wrong predicate, so it folds into `gate2Blockers` (S3, under 60 lines). Everything else passes, and nothing else folds.

## 4. Ubiquitous language

- **Yellow lane**: the co-pilot's lane. It is *idle* when a yellow ticket is open and no live co-pilot holds it.
- **Blocking item**: an open question or walkthrough with `blocking: true` naming a ticket. Only these hold that ticket's gate2.
- **Blocked step**: a call that was not run because the permission mode refused it, or a step the crew could not do. It always becomes a blocking item.
- **Proposal**: a ticket-making question with `proposal: true`. It holds no gate.
- **Owed thread**: an open `chat` or `user` thread whose last message is the user's (*unanswered*) or whose last pilot reply carries `promise` (*promised*).
- **Work**: gate1s (designs) and gate2s (landings) signed in a directory since its newest hand-off item.
- **Friction row**: an entry of the record's `friction` array, an agent row or a drain row, appended and never replaced.

## 5. Locked decisions

- **L1 Grilling depth: forks** (the user, `itm_16e751892ce5`, 2026-10-13).
- **L2 The yellow refusal is `lanesFrom`'s `refusal`**, the main lane's first and then the yellow lane's. The hooks print the daemon's string unchanged (ADR 0123). Rejected: a second field every hook learns to read.
- **L3 One gate2 rule**, `gate2Blockers`, read by post and press alike. This fixes the press bug by deletion. Rejected: patching the press predicate and keeping two rules.
- **L4 A proposal is a flag, not a missing `ticket`.** Without `ticket` an open question holds every gate1 (store-core.mjs:480). Rejected: posting unticketed.
- **L5 Blocked steps are posted by #620's hooks.** This run adds only the backstop and the prose. Rejected: a new `blocked:` post field (agreed with main as a default before #620's `blocked.js` was read; the hooks already post the structured item).
- **L6 Owed threads are computed in the daemon** (`deck/owed.mjs`) and served on `/api/record`, as lanes are. The hooks are CommonJS and cannot import. Rejected: a second implementation in `hooks/lib/deck.js`.
- **L7 Scratch decks are allowed** (the user's spec 6 on the ticket), reversing process-gc's "never `deck --scratch`" comment. ADR 0135's leash bounds what one can leave behind. Rejected: keeping a refusal the nested QA hits every run. *With the user as a fork (allow vs keep the ban); S6 is written on the default.* Confirmed by the user (itm_c7e0508d3a77, 2026-10-13: Allow them); process-gc's comment at install-settings.mjs:564 and install-allow-gc.test.mjs:40 are amended with the reason.
- **L8 Friction appends in `nextRecord`, and the report's friction is derived**, so the only list is the record's. Rejected: a fresh list at finish (8d99's complaint).
- **L9 The swap runs last, as one sweep** (S15-S17), so no slice writes the old words under it. *Taken with main's agreement, not yet the user's.* Rejected: swap first as a stem, which serialises every deck slice behind 65 test files.
- **L10 QA environment: a scratch deck and a temp repository** (itm_a8414629d196, 2026-10-13). QA runs `pilot deck --scratch` seeded with a copy of this deck's store, so the v1→v2 upgrade and the swapped colours are seen on real tickets, plus a temp git repository for the hand-off and wait checks, from its own worktree. Rejected: the live deck on 4321, which would upgrade the user's store before the feature is signed.

## 6. Assumed decisions

- **A1 The backstop's pattern.** A `question` or `walkthrough` whose title starts `Blocked:` (what `blocked.js` writes), naming a `ticket`, without `blocking` is refused. Cost: a blocked step worded otherwise slips past. The hooks cover the denial paths themselves. Verdict: stands (the hooks own the denial paths; a title backstop is cheap).
- **A2 Promise is a `deck_reply` field**, `promise: true`, set by the pilot. A later pilot reply on the thread discharges it. Cost: a pilot that forgets the flag owes nothing. Rejected: a phrase list, which misfires. Verdict: stands.
- **A3 Owed threads quote the last message clipped to 120 characters.** `pilot handoff` refuses only on *unanswered* and carries *promised* ones. Verdict: stands.
- **A4 The store goes to `STORE_VERSION` 2.** `readDeck` upgrades a v1 file once (swap `red` and `green` on tickets) and writes v2. An older plugin then refuses the v2 store with its existing message: a downgrade needs the newer plugin back. Irreversible for the stored file. Verdict: stands (the user, itm_1f13152f78e2, 2026-10-13: One-way upgrade), with spec 26 added in the user's words: the plugin version is bumped in the same slice.
- **A5 Work is derived, not stored.** Each signed gate1 or gate2 counts as one, from the newest `handoff` item on, with a ceiling of 2. So 2 landings, 1 design and 1 landing, or 2 designs each advise. b610's "the record carries the count" becomes "the deck already does". Cost: an abandoned session with no hand-off item carries its count into the next one. Verdict: stands (the user, itm_57919cd4db5a, 2026-10-13: Derive from the deck).
- **A6 Friction keeps the newest 40 rows.** An append past 40 drops the oldest and says so in the `deck_status` reply. Verdict: stands.
- **A7 The report ranks by `size`**, which agent rows may now carry: the top 5 agent rows and the top 5 drains. Verdict: stands.
- **A8 The yellow refusal reads `coPilotStateOf`'s `queued`.** A yellow ticket with no signed plan still counts, because its gate1 made it yellow. Verdict: stands (mirrors the main lane L7).
- **A9 Spec 25 moves the pilot's pin only.** The draft's "co-pilot's pin" does not exist, and none is added. Verdict: stands.

## 7. Out of scope

- The auto-mode denial hook and the refused-prompt poster (#620, gate-no-stall spec 3).
- Cheaper crew models (`itm_55f675c9714d`, left unmerged).
- Any change to CSS colours (they follow the state name), to the co-pilot's tools, or to how QA posts.
- A per-session counter file for work. A `dontAsk` or deny-rule denial has no hook event (code.claude.com/docs/en/hooks).

## 8. Slices

Width 6; longest stem 7 (S3 → S5 → S7 → S10 → S11 → S15 → S16).

| # | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | Walking skeleton: an idle yellow lane is refused | 1 | `deck/lanes.mjs`, `deck/test/lanes-yellow.test.mjs`, `hooks/test/stop-gate-yellow-lane.test.js`, `deck/test/wait-yellow-lane.test.mjs` | – | ts, security | [S1](slices/S1.md) |
| S2 | Both lanes on every lane line | 2, 3 | `deck/lanes.mjs`, `deck/server-tools.mjs`, `hooks/session-handoff.js`, `deck/test/ticket-tool-yellow.test.mjs`, `hooks/test/session-handoff-yellow.test.js` | S1 (lanes.mjs) | ts, security | [S2](slices/S2.md) |
| S3 | Only a blocking item holds a gate2 | 4, 5 | `deck/items.mjs`, `deck/store-core.mjs`, `deck/store-items.mjs`, `deck/test/gate2-blockers.test.mjs` | – | ts | [S3](slices/S3.md) |
| S4 | A proposal holds no gate | 6 | `deck/items.mjs`, `deck/store-core.mjs`, `deck/tools.mjs`, `deck/test/proposal.test.mjs` | S3 (items.mjs, store-core.mjs) | ts, security | [S4](slices/S4.md) |
| S5 | An unflagged blocked step is refused | 7 | `deck/blocked-shape.mjs`, `deck/store-items.mjs`, `deck/test/blocked-shape.test.mjs` | S3 (store-items.mjs) | ts, security | [S5](slices/S5.md) |
| S6 | The install allows scratch decks | 8 | `scripts/install-settings.mjs`, `scripts/test/install-allow-gc.test.mjs`, `scripts/test/install.test.mjs` | – | ts, security | [S6](slices/S6.md) |
| S7 | Owed threads are known to the deck | 11 | `deck/owed.mjs`, `deck/store-items.mjs`, `deck/tools.mjs`, `deck/server-routes.mjs`, `deck/test/owed.test.mjs` | S4 (tools.mjs), S5 (store-items.mjs) | ts, security | [S7](slices/S7.md) |
| S8 | The fresh session is told what is owed | 9 | `hooks/session-handoff.js`, `hooks/test/session-handoff-owed.test.js` | S2 (session-handoff.js), S7 (owed) | ts, security | [S8](slices/S8.md) |
| S9 | `pilot handoff` carries owed threads and refuses unanswered | 9, 10 | `scripts/handoff.mjs`, `scripts/test/handoff-owed.test.mjs` | S7 (owed) | ts, security | [S9](slices/S9.md) |
| S10 | Friction rows append and survive the hand-off | 20, 21 | `deck/runs.mjs`, `deck/tools.mjs`, `deck/server-tools.mjs`, `deck/test/record-friction.test.mjs`, `scripts/test/handoff-friction.test.mjs` | S2 (server-tools.mjs), S7 (tools.mjs) | ts | [S10](slices/S10.md) |
| S11 | The closing report ranks every session's friction | 23 | `deck/runs.mjs`, `deck/test/report-friction.test.mjs` | S10 (runs.mjs) | ts | [S11](slices/S11.md) |
| S12 | The guard advises a hand-off on work done | 16, 17, 18, 19 | `hooks/context-size-guard.js`, `hooks/test/context-work.test.js` | – | ts, security | [S12](slices/S12.md) |
| S13 | The pilot's prose and pin, ADRs 0143-0146 | 6, 7, 11, 21, 22, 25 | `agents/pilot.md`, `scripts/test/measure-prompt.test.mjs`, `scripts/test/yellow-lane-wording.test.mjs`, `docs/adr/0143`-`0146`, `docs/adr/README.md` | – | ts, security | [S13](slices/S13.md) |
| S14 | The co-pilot's and ticket-making's prose | 6, 7, 24 | `agents/pilot-co-pilot.md`, `skills/ticket-making/SKILL.md`, `scripts/test/co-pilot-friction-wording.test.mjs` | – | ts, security | [S14](slices/S14.md) |
| S15 | Red is planning, green is concluding, the store kept | 12, 15, 26 | `deck/*.mjs` state literals, `deck/store-core.mjs`, the tests naming states, `deck/test/store-upgrade.test.mjs` | S2 (lanes.mjs, server-tools.mjs), S4 (items.mjs, store-core.mjs), S5 (store-items.mjs), S8 (session-handoff tests), S9 (handoff tests), S11 (runs.mjs) | ts, database | [S15](slices/S15.md) |
| S16 | The deck reads red → yellow → green | 13 | `deck/ui/render-rail.mjs`, `deck/test/rail-states.test.mjs` | S15 (state names) | ts, react | [S16](slices/S16.md) |
| S17 | The prose says the new words, ADR 0147 | 14 | `agents/*.md`, `skills/**`, `rules/**`, `deck/README.md`, `CONTEXT.md`, `docs/adr/*` amended, `docs/adr/0147-*.md`, `scripts/test/measure-prompt.test.mjs` | S13 (pilot.md, adr README, pin), S14 (co-pilot.md, ticket-making) | ts, security | [S17](slices/S17.md) |

Reviewers: ts = `pilot:typescript-reviewer`, security = `pilot:security-reviewer`, database = `pilot:database-reviewer`
(store upgrade), react = `pilot:react-reviewer` (rail markup). 17 slices, so one run: no Runs split.

## 9. Acceptance evidence

1. On a scratch deck with a yellow ticket and no co-pilot, `pilot wait` prints the yellow refusal and exits, and ending the turn is refused with the same line (1). `deck_ticket co-pilot` answers both lanes (2), and the SessionStart notice shows `co-pilot: itm_…` (3).
2. A QA walkthrough posted `blocking` holds the Sign-off press with its id named; a plain question on the ticket does not (4, 5). A proposal holds no gate (6). A `Blocked:` item without `blocking` is refused (7).
3. A nested QA runs `pilot deck --scratch` without a prompt (8).
4. A chat with an unanswered user message makes `pilot handoff` exit naming it. Once it is answered, the hand-off posts, and the fresh session's notice lists a promised thread with its line (9-11).
5. Two `deck_status` calls append friction rows that run.json carries across a hand-off. The `finished` report ranks them, drains apart (20-24).
6. After 2 signed gates the guard advises the hand-off, naming the count, under the token mark (16-19).
7. A scratch deck seeded with a v1 store shows each ticket in the right queue. The Tickets tab reads red planning, yellow implementing and green concluding (12-15). The pin diff shows only the new number (25).

## 10. Status

| Slice | State | Branch | PR | Worktree | Blockers | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 1 |
| S2 | planned | | | | S1 | 2, 3 |
| S3 | planned | | | | – | 4, 5 |
| S4 | planned | | | | S3 | 6 |
| S5 | planned | | | | S3 | 7 |
| S6 | planned | | | | – | 8 |
| S7 | planned | | | | S4, S5 | 11 |
| S8 | planned | | | | S2, S7 | 9 |
| S9 | planned | | | | S7 | 9, 10 |
| S10 | planned | | | | S2, S7 | 20, 21 |
| S11 | planned | | | | S10 | 23 |
| S12 | planned | | | | – | 16-19 |
| S13 | planned | | | | – | 6, 7, 11, 21, 22, 25 |
| S14 | planned | | | | – | 6, 7, 24 |
| S15 | planned | | | | S2, S4, S5, S8, S9, S11 | 12, 15, 26 |
| S16 | planned | | | | S15 | 13 |
| S17 | planned | | | | S13, S14 | 14 |
| yellow-lane | planned | feat/yellow-lane | | | S1-S17 | 1-25 |
