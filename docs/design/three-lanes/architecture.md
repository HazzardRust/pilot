# Three lanes: a planning and a concluding ticket live at once, carried by the architect and QA

Ticket `itm_7c9becb5d765` (merged in: `itm_fbec5738ecc1`, the lander wakes the pilot) · feature `three-lanes` · base `pilot` 83bd69a6 · ADR 0151

## 1. Problem

While a concluding ticket sits in a 5 to 15 minute revision or retest, the user could finish a planning
ticket. The deck holds one red-or-green ticket on the main lane at a time, so it can't. Pilot attention is
the limit, so QA should carry most of concluding and the architect most of planning. The pilot keeps
the gates, the pushbacks and the answers that move the spec. The lanes then hold three pointers: the
co-pilot on implementing, one planning ticket and one concluding ticket. The prose says planning and
concluding and leaves the colours implied: red is planning and green is concluding (ADR 0147).
Merged in: a landing that refuses or ends short wakes nobody today, so the pilot learns of it only by
polling. The lander should fix what it can and wake the pilot on the rest.

## 2. Spec

| # | Behaviour a user can watch | Evidence |
| --- | --- | --- |
| 1 | A repository holds one live planning ticket and one live concluding ticket at once, beside the co-pilot's implementing ticket. Taking a concluding ticket while a planning one is live leaves both live. A second take in the same stage is refused, naming the live ticket. | lanes test: both `live`; the refusal text names the live id |
| 2 | Each stage's lane fills from its own queue. `nextTicketOf(items, repo, stage)` gives the asked ticket first, then the stage's head. The old "with implementing open, concluding first" ordering goes. | items test per stage |
| 3 | The idle-lane refusal (ADR 0123) holds per lane. The hook lane lines read `planning:`, `concluding:` and `co-pilot:`, and `session-handoff` echoes all three. | stop-gate refusal per lane; session-handoff test prints three lines |
| 4 | A concluding ticket's threads stay in view while a planning ticket is in hand, and the reverse also holds. | `isBehind` test: both live tickets' threads shown |
| 5 | A switch is per lane: switching the planning ticket leaves the concluding ticket live, and the reverse also holds. | store-tickets test: a planning switch completes and the concluding ticket stays live |
| 6 | The Tickets rail marks both live tickets in hand. Each stage's queue shows its own `next`. | render test with three lanes |
| 7 | A chained session start fills each empty stage lane from its own head. | chain test: a red and a green queued, both taken |
| 8 | QA owns concluding from `need` to the Gate 2 press. It answers its walkthrough's replies, posts the ticket's questions, lands the fixes, runs `pilot integrate --default`, posts the `gate2` and resolves it after the press. The pilot runs `pilot landing` and the closing report. Where a co-pilot hands back with no walkthrough or question, the pilot still posts that gate2. | wording pins on `pilot-qa.md` and `pilot.md` steps 8 and 9; store test: a qa-authored gate2 on a live concluding ticket is accepted |
| 9 | The architect carries the planning relay. It posts its own stashed questions with the ticket id, waits on them, writes the answers into the artefact, resolves them and writes `brief.md`. On an answer that overrides its default or moves a spec line, it hands the thread to main. The pilot then takes it with `deck_reply to: "pilot"`, pushes back and resolves it. Gate 1, the verdict pass and `deck_status finished` stay the pilot's. | wording pins on `pilot-architect.md` and `pilot.md` steps 2 and 3; store test: an architect question on a live planning ticket is accepted, and so is the pilot's passing reply on it |
| 10 | The pilot, co-pilot, architect, QA, ticket-making and CONTEXT prose names the stages planning, implementing and concluding, with the colours implied. ADR 0151 records the three lanes and the division of labour. | wording pins; `check-references`; ADR index |
| 11 | The pilot pin (`measure-prompt.test.mjs`) and the QA pin (`qa-preview.test.mjs`) each move by exactly what their wording costs. There is no co-pilot pin. | the pin diff, named in the PR |
| 12 | One **Status** tab replaces Graph and Status, showing the selected ticket's status table and graph read from its own record. The default selection is the implementing ticket, else concluding, else planning. With no lane held it shows the newest run with a table, as today. | render test: three lanes, the yellow record's table and graph drawn |
| 13 | The Status tab carries a selector over the held lanes' tickets (links, `?ticket=<id>`). Choosing one shows that ticket's record. With one held lane there is no selector. A planning ticket with no record shows "no slice table yet". | render tests per case; scratch deck in a browser |
| 14 | *added (found, built now)*: the daemon refuses a gate1 from any stamped author but the pilot, and a gate2 from any but the pilot or QA. `deck_ticket` is stamped like `deck_post`, and a stamped author other than the pilot may only `merge`, and only as the architect. | store tests per author; deck-author hook test |
| 15 | A landing that refuses or ends short (refused, `pr ready failed`, merge-first `unknown`) wakes the pilot's parked `pilot wait` and holds its Stop hook the way a user reply does, with the landing line as the text, whoever owns the gate2. | wait test; stop-gate test |
| 16 | When the gate2's worktree is gone, the landing recreates it from `origin/feat/<slug>` at the gate2's `sha` and runs, and its line says so. | landing test with the worktree removed |
| 17 | When GitHub is unreachable, merge-first falls back to the local `origin/HEAD` and the open gate2s' PRs in the store, and says so. A push refused only because origin could not be asked is retried once. A tip already on origin reads `landed` with its SHA. | land test with a stubbed origin |
| 18 | A gate2 whose landing has run stays signed: a later Dismiss is no dismissal, and the closing report posts against it. | items test |
| 19 | The pilot's step 9 names the wake and no longer says "the user signs again" for a refused landing. | wording pin (pin moves under 11) |

## 3. Findings

- **The lane model** lives in `deck/items.mjs`. `liveTicketOf` (:550) returns the first live ticket.
  `nextTicketOf` (:582) picks red or green with yellow-open urgency. `inHandOf` (:595) and
  `deckStateOf` (:612) build on those. `LANE_STATES` (:600) is `main: red, green; co-pilot: yellow`.
  `switchOf` (:603) reads `switches[repo].main` and `switches[repo].coPilot` (ADR 0106).
- **Single-live writers** are in `deck/store-tickets.mjs`. `takeTicket` (:81) refuses while another ticket
  is live. `takeIn` (:115) parks any live ticket. `mergeTicket`'s host lookup is at :252.
  `requestSwitch` (:179) and `cancelSwitch` (:233) both act on one live ticket. `chain.mjs:90` declines
  while any ticket is live. Gates name a live ticket (`store-items.mjs:185`); questions name any ticket.
- **The lanes seam** is `deck/lanes.mjs`'s `lanesFrom`. It is read by `/api/record` (`server-routes.mjs:601`),
  `hooks/session-handoff.js:362` (the strict `MAIN_LINE`, which would drop a new shape silently),
  `scripts/handoff.mjs:159` and `server-tools.mjs:354` (`both()`). Its `refusal` is read by `hooks/stop-gate.js:230`.
  The same composition is re-derived in `render-rail.mjs:487-494` and `tabs.mjs:145`.
- **Graph and Status** are two `<details>` in `deck/ui/strips.html:68-73`, filled by `renderStrips`
  (`render-rail.mjs:456`). The record shown is the newest run with a table (:462). `renderRunGraph(run, name)` and
  `renderRunStatus(run, index, name)` (`render-strip.mjs:70,147`) take any record. View state lives in the URL
  (`server-routes.mjs:110-132`). The tab names are pinned by `status.test.mjs:438` and `tabs.test.mjs:848,892`.
- **Authors** are stamped by `hooks/deck-author.js` from `agent_type`, overwriting the caller's value. The matcher
  (`hooks.json:52`) skips `deck_ticket` and `deck_status`, so the architect's `deck_ticket merge` reads as the pilot's.
  `postItem` has no author gate on any kind (`store-items.mjs:75-82`). Only an owner resolves its thread, and the
  pilot may pass any thread to itself (`mayWrite`, `store-items.mjs:446`). A qa-authored gate2 is owned by `qa`.
- **Origin and Host**: every route checks `isOwnHost`, and every POST checks `isTrustedOrigin` (`server-wait.mjs:239,259`).
  A `GET /?ticket=` link changes no state.
- **Landing**: the press starts `startLanding` (`landing.mjs:146`). Its line is stored with no `seq` and `from: 'pilot'`
  (`store-items.mjs:365`), and `repliesSince` takes only `from: 'user'` with a seq (`store-runs.mjs:91`), so nothing
  wakes. A gone worktree is refused in `worktreeFor` (`landing.mjs:41-64`). `remoteDefaultBranch` asks origin with no
  fallback (`scripts/pilot-branch.mjs:91`). `mergeFirst` asks `gh` (`land.mjs:325`). A Dismiss on a gate2 stores
  `DISMISSED_BY_USER` (`store-items.mjs:617`), and a report then refuses (:193).
- **Pins**: the pilot is at 11063.75 (`measure-prompt.test.mjs:163`) and QA at 4638.75 (`qa-preview.test.mjs:151`).
  The co-pilot and the architect have none.
- **pilot-state-line** (live, #670) calls `liveTicketOf(items, dir)` with no stage and owns `render-pages.mjs` and the
  `GET /` call. S6 reaches both, so it starts after #670 lands on `pilot`.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `deck/lanes.mjs` | `laneOf(items, repo, lane, { switching, co-pilot })`, `lanesFrom(items, repo, opts)` | The live, next, state and pending composition that `lanesFrom`, `render-rail.mjs:487-494`, `tabs.mjs:145` and `chain.mjs:86-90` each re-derive | In-process |
| `deck/items.mjs` stage primitives | `liveTicketOf(items, dir, state?)`, `nextTicketOf(items, repo, state)`, `LANE_STATES`, `isBehind(item, items)` | Which state is which lane, once | In-process |
| `deck/store-tickets.mjs` moves | `takeTicket(id)`, `requestSwitch(repo, to, opts)`, `cancelSwitch(repo, lane)` | One-live-per-stage and per-lane switch records | Local-substitutable (store under `PILOT_DECK_HOME`) |
| `deck/ui/render-rail.mjs` Status | `renderStrips(tab, tabs, items, { ticket })`, `statusTicketOf(tab, items)` | Which record the Status tab draws | In-process |
| `deck/store-items.mjs` posts | `postItem(given)`, `dismissItem(id)`, `settleLanding(id, outcome)` | Who may post which gate; the landing line as a wake; a landed gate2 stays signed | In-process |
| `deck/landing.mjs` / `scripts/land.mjs` | `worktreeFor(gate)`, `mergeFirst(cwd, gh)`, `remoteDefaultBranch(cwd)` | Recreate, fallback, retry | True external (git, `gh`), stubbed |

Deletion test: `laneOf` earns its keep, because without it four callers re-spell the lane composition.
`livePhaseOf` has no caller, but it is not on this feature's path and stays. No existing module is shallow
enough to fold in a slice of its own: S1 creates `laneOf`, and S3 and S4 move their readers onto it as
they change those lines anyway.

## 4. Ubiquitous language

- **Stage**: planning (red), implementing (yellow) or concluding (green), a ticket's state. The prose says the stage.
- **Lane**: what holds one ticket of a stage. `planning` and `concluding` are the pilot's, `co-pilot` is the co-pilot's.
- **Live ticket**: a ticket with `live: true`. At most one per stage per repository; never an implementing ticket.
- **Held lane**: a lane with a live ticket, or for `co-pilot` a live co-pilot's ticket. The Status selector lists these.
- **Landing line**: the line a landing settles with, written to the gate2 thread.

## 5. Locked decisions

- **L1 Grilling depth: forks** (itm_b34af1076111). Only decisions whose paths give materially different deliverables
  are asked; the rest are assumed and listed at Gate 1.
- **L2 The lane is the ticket's stage; `live: true` stays.** No new field, no store version, no migration.
  Rejected: a stored `lane` field, which could disagree with the state.
- **L3 Colours from the code**: red is planning and green is concluding (ADR 0147; corrected with main).
- **L4 Switch records keyed `planning` and `concluding`.** A stored `main` record reads as the lane of its `to`.
  Rejected: a store migration for a record that lives seconds.
- **L5 The pushback rides the existing pass.** The pilot's `deck_reply to: "pilot"` takes an architect's or QA's
  thread (`mayWrite`), so no daemon change is needed. Rejected: letting the architect pass, which widens `PASS_KINDS`.
- **L6 QA owns its gate2**, as the poster does today. Its wait hears the press, and it sends main `signed <id>`.
  Rejected: forcing gate2 ownership to the pilot, which would route the user's gate2 replies away from QA.
- **L7 The landing line wakes the pilot whoever owns the gate2**: the landing is the pilot's (spec 8). It is stored as
  `{ from: 'deck', seq }`, heard by the pilot kind, and answered by any later message or the close. Rejected: a
  synthetic `from: 'user'` message, which would write a lie into the transcript.
- **L8 The selector is links**, `?run=<repo>&ticket=<id>`, server-rendered with no script, the URL as view state
  (`server-routes.mjs:110`). An id that names no held lane's ticket is ignored, never echoed.
- **L9 ADR 0151** (0149 and 0150 are taken).
- **L11 Spec agreed** by the user (itm_398770b361e1), lines 1 to 19 as above.
- **L10 QA's and the architect's tool lists are unchanged**: they already carry what spec 8 and 9 use.
- **L12 One QA per ticket** (itm_2ee3bfc4aa11, was A1). Two QA agents may be live at once on different tickets,
  never two on one ticket. `agents/pilot.md`'s "Two QA agents are never live at once" becomes "never two QA agents
  on one ticket", and each QA counts within `pilot budget` (Yellow's QA-on-demand paragraph; S8). Rejected: one QA
  deck-wide, which serialises a concluding retest behind a co-pilot's step 8.
- **L13 QA environment: scratch deck** (itm_1d164c8cb8f9, was A2). `pilot deck --scratch` with a planted store
  holding one ticket per stage, and a scratch repository with a bare `origin` for the landing lines. Rejected: the
  live deck on 4321.
- **L14 Stamp both** (itm_71a1491c4e03, was A3). A gate1 is accepted only from the pilot, and a gate2 from the pilot
  or QA. `deck_ticket` is stamped like `deck_post`, and a stamped author other than the pilot may only `merge`, and
  only as the architect. Unstamped HTTP callers read as the pilot. Rejected: gating the gates only, which leaves
  every `deck_ticket` holder acting as the pilot.

## 6. Assumed decisions

A1 to A3 were locked by the user and are L12 to L14.

- **A4 The chain fills concluding first, then planning**, each lane from its own head; the hand-off names both.
  Tradeoff: a hand-off item carrying two tickets.
- **A5 The Status default order is implementing, concluding, planning**, over held lanes only. A yellow ticket with no
  live co-pilot is not listed. Tradeoff: between co-pilots, the yellow record is a click on Tickets away.
- **A6 The Overview keeps one Status section per tab** at that tab's default selection, with no selector.
- **A7 The merge-first fallback's PR list** is the open gate2 items' `pr` in this repository. Tradeoff: a feature PR
  with no gate2 posted yet is missed, and the line says "from the deck's gate2s".
- **A8 A Dismiss on a gate2 whose landing has run** stores `landed <sha7>` or `refused` as its resolution, not a
  dismissal. Tradeoff: the user cannot unsign a landed feature by Dismiss; a revert is the path.
- **A9 The architect stays alive through step 3**, waiting on its own questions, and stops after Gate 1 is posted.
  Tradeoff: its context spends on waits; it hands off by the context notice like any crew agent.

## 7. Out of scope

The later vocabulary rename (`itm_8b75a1e6b83d`, runs after). Any change to the yellow lane
or the co-pilot's moves. A store migration. Script on the Status tab. Stamping `deck_status`. `livePhaseOf`'s removal.
The pilot-state-line's line for two live tickets: it keeps naming the first live ticket until it chooses otherwise.

## 8. Slices

Width 6; longest stem 4

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | A planning and a concluding ticket are live at once (walking skeleton) | 1, 2, 3, 4 | `deck/items.mjs`, `deck/lanes.mjs`, `deck/store-tickets.mjs`, `hooks/session-handoff.js`, `scripts/handoff.mjs`, `deck/test/three-lanes.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | A switch moves one lane and leaves the other live | 5 | `deck/store-tickets.mjs`, `deck/server-routes.mjs`, `deck/test/three-lanes-switch.test.mjs` (new) | S1 (`deck/store-tickets.mjs`) | `pilot:typescript-reviewer` | [S2](slices/S2.md) |
| S3 | The Tickets rail marks both live tickets | 6 | `deck/ui/render-rail.mjs`, `deck/tabs.mjs`, `deck/tickets.mjs`, `deck/ui/deck.css`, `deck/test/three-lanes-rail.test.mjs` (new) | S1 (`laneOf`) | `pilot:typescript-reviewer` | [S3](slices/S3.md) |
| S4 | A chained start fills both empty lanes | 7 | `deck/chain.mjs`, `deck/test/three-lanes-chain.test.mjs` (new) | S2 (`deck/store-tickets.mjs` switch refusal) | `pilot:typescript-reviewer` | [S4](slices/S4.md) |
| S5 | One Status tab draws the implementing ticket's record | 12 | `deck/ui/render-rail.mjs`, `deck/ui/strips.html`, `deck/ui/deck.css`, `deck/ui/js/live.mjs`, `deck/ui/js/size.mjs`, `deck/test/status.test.mjs`, `deck/test/tabs.test.mjs` | S3 (`deck/ui/render-rail.mjs`) | `pilot:typescript-reviewer`, `pilot:react-reviewer` | [S5](slices/S5.md) |
| S6 | The Status selector chooses whose record | 13 | `deck/ui/render-rail.mjs`, `deck/ui/render-pages.mjs`, `deck/server-routes.mjs`, `deck/test/three-lanes-status.test.mjs` (new) | S5 (`renderStrips`), S2 (`deck/server-routes.mjs`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S6](slices/S6.md) |
| S7 | Only the pilot posts a gate1 and only the pilot or QA a gate2 | 14 | `deck/store-items.mjs`, `deck/server-tools.mjs`, `hooks/hooks.json`, `hooks/deck-author.js`, `deck/test/posters.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S7](slices/S7.md) |
| S8 | QA carries concluding to the Gate 2 press | 8, 11, 19 | `agents/pilot-qa.md`, `agents/pilot.md`, `scripts/test/qa-preview.test.mjs`, `scripts/test/measure-prompt.test.mjs`, `scripts/test/three-lanes-qa-wording.test.mjs` (new), `deck/test/qa-gate2.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S8](slices/S8.md) |
| S9 | The architect carries the planning relay | 9, 11 | `agents/pilot-architect.md`, `agents/pilot.md`, `scripts/test/measure-prompt.test.mjs`, `scripts/test/three-lanes-architect-wording.test.mjs` (new), `deck/test/architect-relay.test.mjs` (new) | S8 (`agents/pilot.md`, the pilot pin) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S9](slices/S9.md) |
| S10 | The prose says planning and concluding; ADR 0151 | 10, 11 | `agents/pilot.md`, `agents/pilot-co-pilot.md`, `skills/ticket-making/SKILL.md`, `CONTEXT.md`, `docs/adr/0151-three-lanes.md` (new), `docs/adr/README.md`, `scripts/test/measure-prompt.test.mjs`, `scripts/test/three-lanes-wording.test.mjs` (new) | S9 (`agents/pilot.md`, the pilot pin) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S10](slices/S10.md) |
| S11 | A landing that ends short wakes the pilot | 15 | `deck/store-items.mjs`, `deck/store-runs.mjs`, `hooks/lib/deck.js`, `deck/test/landing-wake.test.mjs` (new) | S7 (`deck/store-items.mjs`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S11](slices/S11.md) |
| S12 | A gone worktree is recreated and landed | 16 | `deck/landing.mjs`, `deck/test/landing-recreate.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S12](slices/S12.md) |
| S13 | Merge-first and the push survive an unreachable GitHub | 17 | `scripts/land.mjs`, `scripts/pilot-branch.mjs`, `scripts/test/land-offline.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S13](slices/S13.md) |
| S14 | A landed gate2 stays signed | 18 | `deck/store-items.mjs`, `deck/test/gate2-stays-signed.test.mjs` (new) | S11 (`deck/store-items.mjs`) | `pilot:typescript-reviewer` | [S14](slices/S14.md) |

S1 keeps `lanesFrom`'s `mainClause` field and changes only its words, so `server-tools.mjs`'s `both()` is untouched there
and S7 owns that file alone.

Stems: S1 → S3 → S5 → S6; S1 → S2 → S4; S7 → S11 → S14; S8 → S9 → S10. S12 and S13 stand alone.
S6 also waits on #670 (pilot-state-line) landing on `pilot`, because it owns `render-pages.mjs` and `GET /`.

## 9. Acceptance evidence

On a scratch deck with a scratch repository (L13), in the order a user meets it:

1. A planning ticket is live. The user takes a concluding ticket from Tickets, and both rows carry the in-hand mark (spec 1, 6).
2. A second planning take is refused, naming the live one. `pilot wait` with the concluding lane emptied prints that lane's refusal (1, 3).
3. A new session prints `planning:`, `concluding:` and `co-pilot:` lines (3). A chained start with both queued fills both (7).
4. A planning switch completes while the concluding ticket stays live (5). Both tickets' threads stay in the queue (4).
5. The Status tab opens on the implementing ticket's table and graph. The selector shows three entries; choosing the
   concluding one draws its record, and a planning ticket with no record reads "no slice table yet" (12, 13).
6. QA's walkthrough, questions and gate2 appear on the concluding ticket under QA's byline, with no pilot post between
   `need` and the press. The pilot's `pilot landing` follows the press (8). The architect's questions appear under its
   byline on the planning ticket, and its artefact commit carries the answer (9).
7. A gate1 posted as QA, and a gate2 posted as the architect, are refused (14).
8. With the worktree removed, the landing recreates it and lands (16). With origin stubbed unreachable it falls back
   and says so (17). A refused landing wakes the parked `pilot wait` with the line (15). A Dismiss after the landing
   leaves the report postable (18).
9. The prose, ADR 0151 and the pin diff read as specified (10, 11, 19).

## 10. Status

| Slice | State | Branch | PR | Worktree | Blockers | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1, 2, 3, 4 |
| S2 | planned | | | | S1 | 5 |
| S3 | planned | | | | S1 | 6 |
| S4 | planned | | | | S2 | 7 |
| S5 | planned | | | | S3 | 12 |
| S6 | planned | | | | S5, S2 | 13 |
| S7 | planned | | | | – | 14 |
| S8 | planned | | | | – | 8, 11, 19 |
| S9 | planned | | | | S8 | 9, 11 |
| S10 | planned | | | | S9 | 10, 11 |
| S11 | planned | | | | S7 | 15 |
| S12 | planned | | | | – | 16 |
| S13 | planned | | | | – | 17 |
| S14 | planned | | | | S11 | 18 |
| three-lanes | planned | `feat/three-lanes` | | | – | 1–19 |
