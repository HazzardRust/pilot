# The yellow phase is a subagent of the main session

Feature `yellow-agent` · ticket `itm_8e6896cb4c7b` · base `pilot` at `492fc62b` (0.7.20, the hotfix
`SUBDECK_ON_SIGN = false` in) · supersedes `yellow-is-the-subdecks` (itm_3f7d6b78e22a, abandoned)

## 1. Problem

Yellow work (a ticket whose plan is signed) is meant to run while the user is away. Today it runs
in a second Claude session in a wrapper, the sub-deck (`pilot run --sub`). Its first start here
stuck on Claude Code's "2 new MCP servers found" prompt, and every change to Claude's CLI or
environment adds a way for it to break. The user wants one subagent of the main session to run
the yellow phase, with a low-fidelity link: a question only the user can answer is passed up; if
it is still unanswered when the yellow phase ends, it stays stored with the ticket, the ticket turns
red, and the agent moves to the next yellow ticket. The main session's `/clear`, a closed terminal,
nesting and the missing transcript are answered through systems that already exist.

## 2. Spec

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | A yellow ticket is implemented by the **co-pilot**, a subagent the main session spawns, never by a second session: `pilot run --sub`, `deck/subdeck.mjs`, the sub-deck worktree, the daemon's sub start, `/subdeck/pause` and the sub tab are gone. | `pilot --help` and `deck/run.mjs` carry no `--sub`; `deck/subdeck.mjs` and the nine `deck/test/subdeck-*.test.mjs` are deleted; a test pins that a signed gate1's `deck_resolve` and `/api/chain` start no process; the page draws no sub tab. |
| 2 | When the main session holds no live co-pilot, it spawns one for the head of the directory's yellow queue, with a brief built from the ticket's signed plan (artefact, branch, sha), its `brief.md` and its run record. | On a scratch deck with one yellow ticket, the main session's first turn spawns `pilot:pilot-co-pilot` (its transcript); the deck's Agents section shows `pilot-co-pilot` live. |
| 3 | The co-pilot runs steps 4 to 8 (slices, integration, the principles review and its fix round, QA until the ticket is red, L9) in the background and writes the ticket's rows with `deck_status` under the ticket's slug; it never sets `finished`, never posts a gate and never answers for the user. It never waits on a permission prompt: a refused call is recorded as a blocked step and never retried or routed around (L17). | `agents/pilot-co-pilot.md` and its pins; a scratch run whose slice rows move on the deck while the main session is idle. |
| 4 | A question only the user can answer reaches the deck under its yellow ticket and shows as a card on the main page while open. The co-pilot sends it to `main`, which posts it `blocking` with `ticket`; a crew agent's question reaches `main` as today. A question the co-pilot can decide, it decides with its recommended default and lists in its hand-back; nothing is posted (L16). | `isBehind` no longer hides an item of a yellow ticket (render test); a blocking question posted under a scratch yellow ticket shows on the home page. |
| 5 | The co-pilot hands back when its ticket hits red as ADR 0066 defines it, the user is needed and nothing more can move without them: QA's walkthrough is posted, or only open blocking questions are left, or the work is finished and has nothing to walk. The main session calls `deck_ticket need` (the ticket turns red, the question stays open with it), or posts the `gate2` where neither a walkthrough nor a question names the ticket (a posted `gate2` turns its ticket red itself), and spawns a fresh co-pilot for the next yellow ticket. An answer that lands while the co-pilot is live is relayed to it by `main`. | A scratch run with two yellow tickets and one unanswered blocking question: the first is red with the question open, the second has rows moving under a new co-pilot. |
| 6 | The main session's `/clear` hand-off and a closed terminal do not lose a yellow run: the fresh session's SessionStart notice names the yellow head with its record's `next`, and the session re-spawns the co-pilot, which restarts at most the slice in flight from its pushed branch. Not named when another live run in the directory registered before the record's last save, or on `compact`. | `hooks/test/session-handoff.test.js`: a hand-off delivery and a recovery each carry the yellow lane; a held one and a `compact` do not. A scratch run across a `/clear` resumes at the next slice. |
| 7 | The orchestration rule and `pilot budget` give the co-pilot its lane: three levels below the main session (main, co-pilot, role agent, helper), counted against the same eight; `pilot budget` prints `main` and `yellow`. | `rules/orchestration.md` names the level and the install ledger knows the old copy; `pilot budget` prints `budget main 3 yellow 5`; a test pins it. |
| 8 | From yellow-is-the-subdecks §2 lines 1, 5, 6: a main session is never handed a yellow ticket's record to resume as its own run; the deck parks a ticket in the write that turns it yellow, and one stored live and unheld reads as not live; a stored `mode` key is removed on the next write. | As written there: `GET /api/record?repo=<main>` serves `record: null` for a yellow newest record; a Sign off and a pivot leave the ticket not live; `deck/test/mode-gone.test.mjs` finds no `mode` after a write. |
| 9 | The four yellow tickets waiting here (user-thread-listener, deck-press-feedback, audit-fixes, deep-modules) start under the co-pilot on the first main start after this lands, one at a time, with no new sign-off. | The real deck after merge and restart: the Agents section shows `pilot-co-pilot` and user-thread-listener's rows move. |

Not meant: "a yellow ticket carries an agent id on the deck". The roster (`deck/agents.mjs`) knows
agents by directory and type only, and that is enough: there is one co-pilot per main session.

## 3. Findings

| Where | What exists | What this leans on |
| --- | --- | --- |
| `agents/pilot.md:5` | `Agent(...)` list; the inherited cap for every spawn (`rules/orchestration.md:73`). | Gains `pilot:pilot-co-pilot`; its text is frontmatter, not counted by the prompt pin. |
| `agents/pilot.md:134-174` | "Sub-deck" section, about 40 lines: role, questions, as sub-deck, paused, red, pivot, QA on demand. | Replaced by a shorter "Yellow" section; the difference pays for every other pilot.md sentence. |
| `scripts/measure-prompt.mjs:87`, `scripts/test/measure-prompt.test.mjs:119` | Measures `agents/pilot*.md` body + skills + deck tool schemas; pilot pinned at 10258.25, measured exactly that. | `agents/pilot-co-pilot.md` gets an unpinned row; only pilot.md's body costs the pin. |
| `scripts/test/pilot-agents.test.mjs:28-51,125-145,170-193,213` | `CREW`, the Models-table model ceiling, the Agent-list closure, `deck_ticket` held only by pilot and architect. | The co-pilot joins `CREW` and the Models table; it holds no `deck_ticket`. |
| `hooks/session-handoff.js:271-283` `recover()`, `:251` `heldElsewhere`, `:154` `notice()` | Hands a fresh session a hand-off item or the newest unfinished record; claim once per save; source deliberately unread. | The yellow lane is appended to both notices, guarded by the same `heldElsewhere` and a claim. |
| `deck/server.mjs:1525` `/api/record`; `deck/store.mjs:1821,1843` `recordFor`, `recordForTicket` | Record per (home, slug), newest last; per-ticket lookup by `record.ticket`. | `/api/record` adds a `yellow` field; S3 adds `resumableRecordFor` (old S1, research reused). |
| `deck/server.mjs:912-951` `deck_status` | The stdio client stamps the session's run id (`deck/client.mjs:203`), so a subagent writes under the main run; `finished` calls `chainNext`. | The co-pilot writes its ticket's slug and never sends `finished`. |
| `deck/items.mjs:698-732` `nextTicketOf`, `isBehind` | `role='sub'` branch; main never takes yellow; a yellow ticket's items are behind, so hidden (`deck/status.mjs:498`). | Sub branch goes; `isBehind` exempts a yellow ticket's items (spec 4). |
| `deck/store.mjs:1130-1169` `needTicket`, `pivotTicket` | `need` turns yellow red only with an open question, walkthrough or gate2 naming it; questions stay open. | The "stored with the ticket" of spec 5 is this, unchanged: no separate queue exists (`isQueued`, `items.mjs:644`). |
| `deck/agents.mjs`, `hooks/agent-roster.js` | Roster by directory and agent type from tool-call heartbeats, 90 s TTL, no ticket. | Spec 2 and 9 evidence; not used for liveness (a co-pilot waiting on children is silent). |
| `deck/budget.mjs:14` | `{ main: 3, sub: 5 }`, ceiling 8; `pilot budget [--main N] [--sub N]`. | `sub` renamed `yellow`; the stored key read as `yellow`. |
| `scripts/install-rules.mjs`, `scripts/shipped-rules.json` | Replaces an installed rule whose bytes match a shipped version; an unknown copy is left. | Editing `rules/orchestration.md` needs `scripts/build-rules-ledger.mjs` re-run, or upgrades leave the old rule. |
| Claude Code docs (sub-agents, hooks) | Nesting to three layers below main by default (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`); a background subagent's permission prompts surface in the main session; SessionStart `source` is startup, resume, clear, compact, fork; `/clear`'s effect on a running background agent is undocumented. | Depth fits (main, co-pilot, implementer, reviewer). Prompts would stall a co-pilot while the user is away (L17). `/clear` survival is probed first in S6. |
| Sub-deck footprint | About 1,570 lines of `deck/test/subdeck-*.test.mjs`; about 700 lines across `run.mjs`, `subdeck.mjs`, `session.mjs`, `server.mjs`, `store.mjs`, `chain.mjs`, `items.mjs`, `tabs.mjs`, `client.mjs`, `wait.mjs`, `runs.mjs`, `ui/render.mjs`, `ui/deck.css`, `CONTEXT.md`, `agents/pilot-qa.md:147`. | Cut into removal slices S8 to S11 by module. |

## 4. Ubiquitous language

- **Co-pilot**: the subagent the main session spawns to carry one yellow ticket through steps 4 to 8. One per main session at a time.
- **Yellow lane**: the co-pilot and its children, three levels below the main session, holding the `yellow` half of the budget.
- **Re-brief**: a co-pilot spawned for a ticket that already has a run record, starting from the record's `next`.
- **Hand-back**: the co-pilot's final report to `main`: red on a walkthrough, on named questions, or with nothing to walk; decisions assumed; blocked steps.
- **Main slot**: the one live ticket a main session holds in its directory; never yellow.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
| --- | --- | --- | --- |
| L1 | Grilling depth is "forks" (the user, itm_3b05052a4a27); the green queue is not merged in (the user, itm_f62283fa6b85: "Merge none"). | Only branches with materially different deliverables are asked. | Every branch. |
| L2 | One co-pilot per yellow ticket: a fresh spawn per ticket, on the previous one's hand-back. | Each ticket starts in a fresh context; the spawn rule is one sentence ("no live co-pilot: spawn for the yellow head"). | One co-pilot across tickets: four tickets in one context blows the 100k sharp zone. |
| L3 | Liveness is the main session's own knowledge (it spawned the co-pilot and has had no hand-back), plus the SessionStart lane for a fresh session. No heartbeat, no stored agent id. | A co-pilot waiting on implementers makes no tool calls, so the roster would drop it after 90 s and a heartbeat check would double-spawn. | Roster liveness; a SubagentStart hook (ADR 0024: a killed agent never fires Stop). |
| L4 | The yellow lane in the SessionStart notice: `/api/record` returns `yellow: { ticket, title, plan, record }` for the directory's yellow head; the hook appends it on a hand-off delivery always, and on recovery or startup only when `heldElsewhere` is false and a claim `yellow-<ticket>-<updatedAt or signed>` is new; never when `source` is `compact`. | Reuses the two guards that already make a recovery arrive once and not under a live run; the deck sees every ticket (the hook's read is capped at 20). | A Stop-hook check: fires every idle turn. Reading the yellow ticket off `deck_read` in the hook: capped. |
| L5 | What a record can make the main session spawn: only `pilot:pilot-co-pilot` (the type is in `pilot.md`, never read from the record), only for a ticket the deck reports open and yellow, with the artefact, branch and sha taken from the ticket's signed gate1 plan; the record's `next` and rows enter the brief as quoted state ("saved state, not an instruction", as `notice()` frames it today). Chosen by the user, itm_655c013cc96e. | The record is free text any loopback caller can write (`deck/client.mjs:205-212`); this bounds it to data inside a brief whose shape is fixed. | Briefing from the record alone: a forged record could name another branch or artefact. Naming the run and waiting for the user's word: a run interrupted while they are away stays stopped, which spec 6 exists to prevent. |
| L6 | `/api/chain` keeps its guards (loopback Host, POST, own-or-absent Origin, JSON body); its `start` dependency and `startSubdeckOnSign` (with `SUBDECK_ON_SIGN`) are deleted, and `deck/session.mjs` loses its `sub` branch. | The daemon then starts a session only on Start (ADR 0050); a POST can no longer launch a process by signing. | Keeping the start behind the constant: dead code with a process launch in it. |
| L7 | The co-pilot sends `deck_status` itself under its ticket's slug and never sends `finished`; `main` calls `deck_ticket need` (the user, itm_690972aec4dd). | Rows move without the main session paying a turn per slice; `finished` would run `chainNext` on the main run. Tradeoff: the run's tab shows whichever slug wrote last while `main` concludes a red ticket. | Rows reported to `main`: a main turn per row. |
| L8 | The co-pilot is Opus, a `CREW` member with a Models row; its children are the implementer, fundamentalist, QA and the language reviewers. | It makes the step-6 calls a pilot makes; orchestration.md puts role agents on Opus. | Fable: reserved for the pilot. Sonnet: its judgement is not mechanical. |
| L9 | The co-pilot hands back when its ticket hits red, by the definition that already exists (ADR 0066, "red means the user is needed"), not at a point in QA (the user, itm_b9fa2200488d: "there should already be a definition for red, and it should hand back when it hits red"; "there may not be a walkthrough for some items"). Where the feature has a walkthrough, the co-pilot's QA posts it and writes `qa` refs; where it has none, the hand-back says so and `main` posts the `gate2`. The user's pass, fixes and `gate2` are red, `main`'s, resuming `pilot-qa` from `qa` refs as "QA on demand" does today. | One definition of the stop, the one the deck already enforces in `needTicket`; a ticket with nothing to walk has a way to red. Generalising what a walkthrough is stays with its queued ticket (§7). | A stop defined by the walkthrough post: no end for a ticket without one. QA stopping before the walkthrough: the user's first look waits for a second QA spawn. |
| L10 | The queued-questions store: nothing is added and nothing survives specially; a queued question is an open item naming the ticket (`isQueued`), as now. The sub-deck's stamps (`subdeck` on items and records), `waiterFilter`'s sub branch and the pause notice go. Answers that grilling line. | Questions now reach `main` directly; the deck already stores them with the ticket. | A per-ticket queue: a second store of the same thing. |
| L11 | Old S1, S2 (yellow-is-the-subdecks L2 to L5, L7) are taken as written there: `resumableRecordFor`, the park in the write that turns a ticket yellow, `mode` dropped in `readDeck`. Their ADR 0087 is written here as "the main slot is never yellow". | Researched and agreed before; nothing in this change touches their reasoning. | Re-deriving them. |
| L12 | ADR 0088 "The yellow phase is a subagent of the main session" supersedes ADRs 0084, 0085's sub-deck half and 0086's mechanism (its refuse-and-record rule survives in the co-pilot). | Structural reversal is recorded. | Editing the old ADRs. |
| L13 | QA environment: a scratch deck in a scratch repository (`PILOT_DECK_DIR`, `PILOT_DECK_PORT` its own), never the live daemon on 4321; the user's last look is on the real deck after merge and restart. Confirmed by the user, itm_3f59755861cc. No migrations, no database. | The live daemon carries this run; restarting it on unreviewed code drops the run. | The live deck. |
| L14 | The agent is **`pilot-co-pilot`** (the user, itm_2df784a14d33). | It says what the agent does: it directs implementers through one yellow ticket and writes no code itself. | `pilot-builder` (the architect's default: a near-synonym of implementer); `pilot-yellow` (names the phase, not the job). |
| L15 | No Pause control (the user, itm_c2d680a9308e): it goes with the sub-deck and is not replaced. The user stops yellow work by telling the main session, in the terminal or the deck chat, which stops the co-pilot (`TaskStop`) after the slice in flight is integrated. | One less control and no new wiring through the listener. Tradeoff: a stop is a sentence, not a press. | A deck Pause the main session's `pilot wait` hears: about one more slice, in the module itm_79cbc557a1de is about to change. |
| L16 | A plain question is decided by the co-pilot with its recommended default and listed in its hand-back; nothing is posted (the user, itm_85a2215fdb2b). The user reads the list in the `gate2` report. A blocking question is always posted under the ticket (spec 4). | The user wants little correspondence with the yellow lane; no main-session turn per question and no auto-answered cards. Tradeoff: a plain decision cannot be overruled while the ticket is building. | `main` posts each one non-blocking and the deck answers with the default, as yellow does today: a main turn per question. |
| L17 | The co-pilot's lane never waits on a permission prompt (the user, itm_6e66656b1064, amended on itm_08d89950086b: "i just want to make sure that it doesnt get stuck on a permission prompt for the user"). Under a main session in auto mode, which is how the user's sessions start, auto mode governs the co-pilot and its crew as it governs every crew agent: the frontmatter's `permissionMode: dontAsk` has no effect there (S1's interactive probe, PR #346), and a call the classifier blocks is the refused call, recorded as a blocked step and never retried or routed around. `dontAsk` stays in the frontmatter for a main session in any other mode. The co-pilot has no allowlist of its own: `SUBDECK_ALLOW` goes. Probed after S2 (F1, PR #348): an `ask` rule still prompts under auto mode, in the main terminal, and the lane waited on it. Amended by the user on itm_9099ba09c0a3 ("A hook refuses it"): a `PermissionRequest` hook of the plugin denies a prompt raised by one of its crew agents, with the blocked-step instruction as its message, and leaves the main session's prompts to the user (slice A1). Assumed by the pilot: the hook acts only on this plugin's agents (`agent_type` starting `pilot:`), in every session, not only under a co-pilot. | As first locked ("the user's allow rules are the whole grant") it was unenforced under auto mode and unworkable without it: those rules allow no git, node or npm, so every slice step would be a blocked step. What the user wants is no stall. Tradeoff: the strict allow list the sub-deck had is gone; the classifier is the gate. | The sub-deck's allow list brought back: not enforceable from an agent file while the main session is in auto mode. Prompts in the main terminal. |

## 6. Assumed decisions

| # | Default taken | Tradeoff | Alternatives |
| --- | --- | --- | --- |
| A1 | Locked as L14 (the name). | | |
| A2 | Locked as L15. | | |
| A3 | One run of 11 slices, about 7 h; the removal is cut by module (S8 to S11) and whole-file deletions are not counted against the 400-line slice cap. | Without the exemption the nine deleted test files (about 1,570 lines) alone need four more slices of pure deletion. | Count every line: about 15 slices, still one run. |
| A4 | The co-pilot hands back at the end of its ticket and the main session spawns the next; it does not chain itself. | Needs the main session alive between tickets; it is, while the terminal is open, and spec 6 covers the rest. | The co-pilot looping over the yellow queue: one context across tickets (L2). |
| A5 | Locked as L16. | | |
| A6 | Locked as L17. | | |

## 7. Out of scope

- A worktree's listener and listener clean-up (itm_79cbc557a1de); its spec 4 (a sub-deck worktree resolves to its main deck) becomes moot, and the removal slices delete what it pins.
- The walkthrough's content (itm_9792c6d0e6d0).
- Moving steps 4, 5 and 7 out of `agents/pilot.md`: the co-pilot reads them there (S1); a move is a later subtraction.
- The stuck `pilot-subdeck` worktree on this machine: left as it is.
- A stored agent id on a ticket, a ticket column in the Agents section.

## 8. Slices

| Slice | Title | Spec | Files owned | After | File |
| --- | --- | --- | --- | --- | --- |
| S1 | The main session spawns a co-pilot for the yellow head (walking skeleton) | 2, 3 | `agents/pilot-co-pilot.md` (new), `agents/pilot.md` (Agent list, Models row, Sub-deck section to Yellow), `scripts/test/pilot-agents.test.mjs`, `scripts/test/measure-prompt.test.mjs`, `scripts/test/ticket-states.test.mjs`, `scripts/test/pilot-need.test.mjs`, `scripts/test/yellow-co-pilot.test.mjs` (new) | – | [S1](slices/S1.md) |
| S2 | A blocked yellow ticket turns red and the next one starts | 5 | `agents/pilot.md` (Yellow section, step 6), `agents/pilot-co-pilot.md` (hand-back), `scripts/test/yellow-co-pilot.test.mjs` | S1 | [S2](slices/S2.md) |
| S3 | A main session is not handed a yellow run as its own | 8 | `deck/store.mjs` (`resumableRecordFor`), `deck/server.mjs` (`/api/record`), `deck/chain.mjs` (start read), `deck/test/yellow-resume.test.mjs` (new), `docs/adr/0087-the-main-slot-is-never-yellow.md` (new) | – | [S3](slices/S3.md) |
| S4 | The deck never leaves a yellow ticket in the main slot | 8 | `deck/store.mjs` (`readDeck`, sign, `pivotTicket`), `deck/items.mjs` (`nextTicketOf`), `deck/test/yellow-park.test.mjs` (new), `deck/test/mode-gone.test.mjs` | S3 | [S4](slices/S4.md) |
| S5 | A yellow ticket's questions show on the main page | 4 | `deck/items.mjs` (`isBehind`), `deck/test/yellow-shown.test.mjs` (new), `agents/pilot.md` (question sentence) | S2, S4 | [S5](slices/S5.md) |
| S6 | A fresh session re-briefs the co-pilot after `/clear` or a closed terminal | 6, 9 | `hooks/session-handoff.js`, `hooks/test/session-handoff.test.js`, `deck/server.mjs` (`/api/record` `yellow`), `deck/store.mjs` (`yellowHeadOf`), `agents/pilot.md` (first-turn sentence) | S5 | [S6](slices/S6.md) |
| S7 | The budget and the rule name the yellow lane | 7 | `deck/budget.mjs`, `deck/store.mjs` (budget split), `bin/pilot.mjs` (budget flags), `deck/test/budget.test.mjs`, `scripts/test/cli-wiring.test.mjs`, `rules/orchestration.md`, `scripts/shipped-rules.json` | S6, S8 | [S7](slices/S7.md) |
| S8 | `pilot run --sub` is gone | 1 | `deck/run.mjs`, `deck/subdeck.mjs` (deleted), `deck/session.mjs`, `bin/pilot.mjs` (help, `--sub`), `deck/test/subdeck.test.mjs` (deleted), `deck/test/run.test.mjs`, `docs/adr/0088-the-yellow-phase-is-a-subagent.md` (new) | – | [S8](slices/S8.md) |
| S9 | The daemon starts, waits and pauses no sub-deck | 1 | `deck/server.mjs` (`startSubdeckOnSign`, `/subdeck/pause`, `waiterFilter`, `stopReason`, Start on a sub tab), `deck/chain.mjs` (sub branches), `deck/client.mjs`, `deck/wait.mjs`, `deck/test/subdeck-{start,pause,wait,chain}.test.mjs` (deleted), `deck/test/chain.test.mjs`, `deck/test/wait.test.mjs` | S3, S6, S8 | [S9](slices/S9.md) |
| S10 | The store holds no sub-deck state | 1 | `deck/store.mjs` (sub stamps, `takeTicket` sub slot, `homeOf` role, pause, `subdeckToStart`, run parent), `deck/items.mjs` (`liveTicketOf` holder, `inHandOf` role), `deck/runs.mjs`, `deck/test/subdeck-{home,record,take}.test.mjs` (deleted), `deck/test/next-ticket.test.mjs`, `deck/test/in-hand.test.mjs`, `CONTEXT.md` | S7, S9 | [S10](slices/S10.md) |
| S11 | The page draws no sub tab | 1 | `deck/ui/render.mjs`, `deck/ui/deck.css`, `deck/tabs.mjs`, `deck/test/subdeck-panel.test.mjs` (deleted), `deck/test/tabs.test.mjs`, `agents/pilot-qa.md:147` | S10 | [S11](slices/S11.md) |
| F1 | The co-pilot's lane never waits on a prompt (L17), added | 3 | `agents/pilot-co-pilot.md`, its pins | S2 | PR #348 |
| A1 | A crew agent's permission prompt is refused by a hook, added on itm_9099ba09c0a3 | 3 | `hooks/permission-refuse.js` (new), `hooks/hooks.json`, `hooks/test/permission-refuse.test.js` (new) | – | [A1](slices/A1.md) |

Parallel: S1 with S3 and S8 (disjoint files). S2 after S1; S4 after S3. Everything touching
`deck/store.mjs` or `agents/pilot.md` is serial. Prompt-pin payment per slice is in each slice
file; S1's removal of the Sub-deck section pays for S2, S5 and S6.

## 9. Acceptance evidence

On a scratch deck in a scratch repository (L13), never the live daemon:

1. A yellow ticket seeded with a signed plan: the main session's first turn spawns `pilot-co-pilot`; the Agents section shows it (spec 2).
2. The ticket's slice rows move on the deck while the main session sits idle (spec 3).
3. A blocking question the co-pilot raised appears as a card on the home page under that ticket (spec 4).
4. Left unanswered, the ticket turns red with the question open, and a second yellow ticket's rows start moving (spec 5).
5. `/clear` mid-slice: the fresh session's notice names the yellow lane and a co-pilot resumes at the next slice (spec 6).
6. `pilot budget` prints `budget main 3 yellow 5` (spec 7); a fresh main start beside a yellow record says no "Recovering" and the store has no `mode` (spec 8).
7. `pilot --help` has no `--sub`; signing a gate1 opens no window; the page has no sub tab (spec 1).

The user's last look, after merge and a daemon restart: start the main session here and watch the
Agents section show `pilot-co-pilot` and user-thread-listener's rows move (spec 9).

## 10. Status

| Slice | State | Branch | PR | Worktree | Blocker | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 2, 3 |
| S2 | planned | | | | S1 | 5 |
| S3 | planned | | | | – | 8 |
| S4 | planned | | | | S3 | 8 |
| S5 | planned | | | | S2, S4 | 4 |
| S6 | planned | | | | S5 | 6, 9 |
| S7 | planned | | | | S6, S8 | 7 |
| S8 | planned | | | | – | 1 |
| S9 | planned | | | | S3, S6, S8 | 1 |
| S10 | planned | | | | S7, S9 | 1 |
| S11 | planned | | | | S10 | 1 |
| A1 | planned (added) | | | | – | 3 |
| yellow-agent | planned | feat/yellow-agent | | | – | 1-9 |
