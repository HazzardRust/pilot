# A pilot hand-off never waits on the co-pilot

Feature `handoff-no-wait` · ticket `itm_d129dcf82505` · base `main` at `da9a644` · amends ADR 0089 and
held-handoff (its hold), builds beside ADR 0208 and handoff-self-close (`settleCrew`) without changing them

## 1. Problem

When the pilot fills its context it hands off and the session is cleared. The co-pilot and its implementers
are children of that session. So today the pilot first sends the co-pilot a pause and waits for its `paused`
hand-back. The hand-off mod also holds the `/clear` for up to 20 minutes while the deck says a co-pilot is
live. During that wait the pilot does nothing. Field case, 2026-11-22: a co-pilot was told to pause at 10:23
and was still working at 11:20. Its second hand-back was refused ("one report per result") while its
implementers ran, so the clear waited on a message that could not arrive. The user: "we have to make sure
they are able to survive."

## 2. Spec

| # | Behaviour | Evidence and bar |
| --- | --- | --- |
| 1 | A context or chain hand-off clears at the first turn end after `pilot handoff`, whatever the co-pilot is doing. No pause is sent and no hold is applied. | `run-look.test.mjs`: with a live co-pilot, `turn` answers `clear` (0 `held`). Scratch run: `pilot handoff` to the fresh session's first prompt is under 60 s. |
| 2 | The co-pilot and its implementers keep working through the clear. | Scratch run: the implementer's slice branch gains 1 or more commits after the `cleared` trace row, and the co-pilot's agent id is the same before and after. Probe E3: a depth-2 worker wrote 67 s after the clear. |
| 3 | The deck records the live co-pilot's agent id, and the fresh session's SessionStart notice names it. The fresh pilot addresses that co-pilot by `SendMessage <id>` and spawns no second one. | Test: one `pilot:pilot-co-pilot` heartbeat after a grant stamps `agent` on the entry, and `/api/record` serves it. Test: the notice reads `co-pilot <agentId> is live on <ticket>`. Scratch run: 0 extra co-pilot spawns. |
| 4 | Crew reports reach the next pilot session. (a) A message sent after the clear is delivered to the fresh session. (b) A message the old context read but had not acted on is recovered: the fresh pilot's first message to the co-pilot is `resync <clearedAt>`, and the co-pilot repeats every question and hand-back it sent `main` since that time. (c) The one class the clear drops is named: queued task-notifications of task-type `tool_call` (the cleared conversation's own backgrounded tool calls). No crew message is of that type. | Probe E5: a SendMessage to `main` 56 s after the clear is read by the fresh session. Test: the notice carries the `resync <clearedAt>` line. Read: the co-pilot's Hand-back section has the resync clause. Read: §3 F4 names the `LZt` filter. Scratch run: a report sent during the clear is read by the fresh session, by id. |
| 5 | A new Claude Code process still releases the directory's co-pilot (handoff-mod L13), since the crew dies with the process. *practitioner: SRE* | The existing `start` case in `run-look.test.mjs` stays green: 1 release. |
| 6 | The hold is gone. No hand-off card reads `held`, `/api/hold` answers 404, and the mod arms no hold timer. | Tests: 0 `held` notes, a 404 on `POST /api/hold`, a fake host with 0 `every` timers after any `turn` outcome. A grep of `deck/` and `hooks/` finds 0 `HOLD_BOUND_MS`. |
| 7 | One command re-proves survival on this machine's Claude Code, to run after any update. Survival is undocumented host behaviour. *practitioner: Claude Code plugin author* | `node scripts/probe-clear-survival.mjs` exits 0 in under 4 minutes and prints `survived`, the seconds the worker wrote after the clear, `sendmessage ok` and `report reached`. It exits 1 and names the step that failed. |
| 8 | The user's three options and a fourth are researched before the cut. | §3's Options table: 4 rows, each with what was read and why it was taken or rejected. |

Lines 3, 4b, 5 and 7 are implied, not asked for. Line 2's "or a resumable stop" is gone: the user tightened it.

## 3. Findings

**Options (spec 8)**

| Option | What was read | Verdict |
| --- | --- | --- |
| Clear the pilot and keep the crew (Claude mods) | Probes E1-E5 on CC 2.1.330 (headless; `/clear` sent as a prompt, the path `$.command.run` queues). The binary's `clearConversation`, which keeps live `local_agent` tasks and exports `hasAgentTaskSurvivingClear`. Field transcripts: agents `aa0549be` and `a86fb100` were spawned in session c29cddc1 and resumed from fe85c2d4 after the mod's 07:41Z clear | **Taken** (A1 posted). Survival needs no new mod call: the existing clear already keeps the crew. What made the pilot wait was the pilot's own hold. |
| A faster co-pilot pause | `agents/pilot-co-pilot.md:123-135`, ADR 0089, the field transcript (a second SubagentHandback refused while children ran) | Rejected. Any pause still costs the slice in flight or waits for it, and the hand-back cannot land while children run. |
| Crew outside the pilot session (a separate `claude` process) | CC sub-agents docs (cross-session messaging, background agents); ADR 0183 A8 (no host call ends or starts a detached session from a mod) | Rejected by default (A1). It also survives a crash, but needs a cross-session channel, its own permissions and window, and a new spawn path. Survival makes it unnecessary. |
| `$.session.compact` in place of `/clear` | handoff-mod §3 (the `$.session` surface); sub-agents docs: compaction leaves subagent transcripts alone | Rejected. A summary carries context forward, which defeats a fresh session, and the clear already keeps the crew. |

**Probes** (scripts in the session scratchpad; the logs are the evidence)

| # | Setup | Result |
| --- | --- | --- |
| E1 | Background agent; clear at once; fresh session sends SendMessage by id | The agent wrote 47 s after the clear. The session id changed and the fresh context remembered nothing. SendMessage returned success. The agent's completion reached the fresh session. |
| E2 | Depth 2; the co-pilot ends its turn with its worker live | The worker wrote 62.7 s after the clear. The worker's notice went to main and the co-pilot never resumed. |
| E4 | E2 without the clear (control) | Same loss as E2. It is harness behaviour, already forbidden: "Never end a turn with a child live" (`pilot-co-pilot.md:131`). |
| E3 | Depth 2; the co-pilot keeps its turn open | The worker wrote 67 s after the clear. The co-pilot's report reached the fresh session. |
| E5 | The agent sends SendMessage to `main` 56 s after the clear | Delivered and read by the fresh context. |

**What exists**

- F1 The hold. `deck/run-look.mjs:140` (`holdFor`) gates `turn` (:255-277) on `/api/record`'s `coPilot.live`, up to
  `HOLD_BOUND_MS` (`deck/run-claim.mjs:15`, 20 minutes). `sayHeld` (:167) marks it through `POST /api/hold`
  (`deck/hold-route.mjs`, `deck/server-routes.mjs:720`, `markHold` at `deck/store-items.mjs:358`, a re-arm at :331).
  The card text is `deck/items.mjs:311,325,505-516,788`. The mod's hold timers are `hooks/handoff-mod.mjs:31-76`.
- F2 The pause is said in three places: `hooks/lib/guard-advice.js:33-39`, `scripts/handoff.mjs:200-210`, and the
  Yellow, Yield and SWITCH lines of `agents/pilot.md:147,163`. Only the hand-off use goes; Yield and SWITCH keep the
  pause, because there the co-pilot really does stop.
- F3 The co-pilot entry `deck.coPilots[repoKey] = { ticket, live, at }` (`deck/store-core.mjs:718-731`). It is set
  by `setCoPilot` (`deck/store-runs.mjs:366`) and released at a new process's `start` (`run-look.mjs:329`). It holds
  no agent id, so the notice (`hooks/session-handoff.js:337-360`) can only say "may have survived".
- F4 The clear (CC 2.1.330 `clearConversation`) keeps every live task outside its isolation kill-set. It drops queued
  task-notifications that match `LZt`: `<task-notification>` with `<task-type>tool_call</task-type>`, the backgrounded
  tool calls of the cleared conversation. Agent notifications are `local_agent` and outside that filter.
- F5 The roster heartbeat (`hooks/agent-roster.js`, `noteAgent` at `deck/agents.mjs:163`) already carries `agentId`,
  `agentType` and `cwd` for every crew tool call. It is in memory with a 90 s window. The deck observes it, so a
  stamp taken from it fits ADR 0208 L1.

**Seams**

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| The look's `turn` (`deck/run-look.mjs`) | `turn(repo, pid, turnEndedAt, deps) -> Outcome` (`clear` or `none`) | `holdFor`'s co-pilot gate and `sayHeld`, deleted, not folded | local-substitutable (deps fakes) |
| The co-pilot entry (`deck/store-runs.mjs`) | `noteCoPilotAgent(repo, agentId, agentType, now) -> boolean`; `/api/record`'s `coPilot` gains `agent` | the stamp rule (live entry, heartbeat after `at`, type `pilot:pilot-co-pilot`) | in-process (scratch store) |
| The notice (`hooks/session-handoff.js`) | `yellowNotice(yellow, coPilot) -> string` | the adopt and resync wording | in-process |
| The mod (`hooks/handoff-mod.mjs`) | `register(on)` | its hold timers, deleted | true external (fake `on` and `$`) |
| The probe (`scripts/probe-clear-survival.mjs`) | `node scripts/probe-clear-survival.mjs [--keep]` -> exit 0 or 1, one line per step | the E1/E3/E5 probes as one script | true external (a real `claude` process) |

The deletion test: `hold-route.mjs` and the mod's timers do nothing once `turn` never holds, so they are deleted
and not kept as shallow modules. No other fold is needed.

## 4. Ubiquitous language

- **Survivor**: a co-pilot (and its children) still running after its pilot session's `/clear`.
- **Hold**: the mod not clearing while a co-pilot is live. This feature removes it.
- **Pause**: the message that makes a co-pilot drain and hand back `paused`. It is kept for Yield and SWITCH only.
- **Resync**: the fresh pilot's first message to a survivor, `resync <clearedAt>`. The survivor answers by repeating what it sent `main` since then.
- **Agent stamp**: the co-pilot's agent id on the deck's co-pilot entry, written from the first heartbeat after the grant.

## 5. Locked decisions

- **L1** Grilling depth is forks: the user's press on itm_cb8ba7aa307c. Only A‹n› whose paths fork are posted.
- **L2** A hand-off clears with no regard to the co-pilot. `turn` answers `clear` or `none`, never `held`. The
  rationale is §3: the clear already keeps the crew. Rejected: a faster pause (§3).
- **L3** The hold is deleted, not disabled: `holdFor`'s co-pilot gate, `sayHeld`, `/api/hold`, `markHold` and its
  re-arm, the `held` card note, `HOLD_BOUND_MS`, and the mod's hold timers. It amends ADR 0089 and held-handoff
  (L4-L6). ADR NNNN records it. Rejected: a flag that turns the hold off, which would be dead code with a switch.
- **L4** The agent stamp is observed by the deck from a roster heartbeat: type `pilot:pilot-co-pilot`, this repo, a
  live entry, and a time after its `at`. The latest such heartbeat wins. Rejected: the spawn hook parsing the Agent
  tool's result (ADR 0208 rejects deck writes from parsed text), and the co-pilot reporting its own id (an agent is
  not told its id).
- **L5** The notice names the survivor by id and says `SendMessage <agentId> resync <clearedAt>`, spawn none. With
  no answer, `deck_ticket release`, then spawn (held-handoff's fallback, kept).
- **L6** Resync is the recovery for spec 4b. The deck already holds questions and rows; the resync covers the hand-back
  and questions the old context read but had not acted on. Rejected: buffering crew messages on the deck, a second
  channel for what SendMessage already delivers.
- **L7** A process start still releases the entry (L13 kept), and the co-pilot's own self-pause at its own mark is
  unchanged (ADR 0208, handoff-self-close).
- **L8** Yield and SWITCH keep the pause. Only the hand-off's pause goes.
- **L9** The probe is a script, not a test in the suite. It costs model calls and needs a signed-in `claude`, so QA
  runs it, and anyone runs it after a Claude Code update.

## 6. Assumed decisions

- **A1** How the crew survives the pilot's `/clear` (itm_1134e81c665c). Default: clear and keep. The hold and the
  pause go, and the deck stamps the co-pilot's id. Tradeoff: it rests on undocumented host behaviour, guarded by
  spec 7's probe, and a crash still kills the crew. Rejected path: crew outside the session (§3), which survives
  crashes but costs roughly 3x the slices and a cross-session channel.
  Answer: "Clear and keep (default)", the user on itm_1134e81c665c.
- red team: E2 and E4 show a co-pilot that ends its turn with a child live loses that child's report, clear or no
  clear. That is already forbidden (`pilot-co-pilot.md:131`), so S5 restates it in the resync clause rather than
  adding a slice.
- red team: S1 deletes the `pilot.md` pause line that S5 rewrites next to, so S5 comes after S1 (`agents/pilot.md`). S4 and S2 both edit `server-routes.mjs` (the heartbeat route and `/api/hold`), so S2 comes after S4; a stamp from inside `agents.mjs` was rejected because `noteAgent` is in-memory roster code with no store import.
  S2 and S1 both edit `run-look.mjs`, so S2 comes after S1. S3 relies on `turn` never answering `held`, so S3 comes
  after S1 (the `turn` Outcome).
- red team: `setCoPilot` refuses a grant while a chain hand-off is open (`store-runs.mjs:376`). That stays: it is
  the chain's successor rule, not a hold. Attacked it, found no change needed.

## 7. Out of scope

Crew that survives a process exit or crash. The co-pilot's own context hand-off (ADR 0208). How the deck closes
crew-handoffs (handoff-self-close). Yield and SWITCH pauses. Interactive-mode automation of the probe.

## 8. Slices

Width 4; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | A hand-off clears with a live co-pilot (walking skeleton) | 1, 2 | `deck/run-look.mjs` (`holdFor`, `turn`), `scripts/handoff.mjs`, `hooks/lib/guard-advice.js`, `agents/pilot.md` (hand-off and advisory lines), `docs/adr/NNNN-handoff-no-wait.md` (new), `deck/test/run-look.test.mjs`, `scripts/test/handoff.test.mjs`, `hooks/test/guard-advice.test.js` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | The deck holds no hand-off | 5, 6 | `deck/hold-route.mjs` (deleted), `deck/server-routes.mjs`, `deck/store-items.mjs`, `deck/items.mjs`, `deck/run-claim.mjs`, `deck/run-look.mjs` (`sayHeld`, re-arm), `deck/test/handoff-hold.test.mjs` (deleted), `deck/test/run-look.test.mjs` | S1 (`deck/run-look.mjs`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |
| S3 | The mod arms no hold timer | 6 | `hooks/handoff-mod.mjs`, `hooks/test/handoff-mod.test.mjs` | S1 (the `turn` Outcome) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S3](slices/S3.md) |
| S4 | The deck knows the co-pilot's agent id | 3 | `deck/store-runs.mjs` (`noteCoPilotAgent`, `coPilotFor`), `deck/server-routes.mjs` (heartbeat route), `deck/test/co-pilot-agent.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S4](slices/S4.md) |
| S5 | The fresh pilot adopts and resyncs the survivor | 3, 4 | `hooks/session-handoff.js` (`yellowNotice`), `agents/pilot.md` (Yellow first-turn rule), `agents/pilot-co-pilot.md` (Hand-back), `hooks/test/session-handoff-yellow.test.js`, `scripts/test/handoff-no-wait-prompts.test.mjs` (new) | S1 (`agents/pilot.md`), S4 (`/api/record`'s `coPilot.agent`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S5](slices/S5.md) |
| S6 | One command re-proves survival | 2, 4, 7, 8 | `scripts/probe-clear-survival.mjs` (new), `scripts/test/probe-clear-survival.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S6](slices/S6.md) |

The estimate was 4 slices. It is 6 because the hold deletion is cut from S1 to keep each diff under 400 lines,
and the probe is its own slice.

## 9. Acceptance evidence

1. In a scratch run, the pilot runs `pilot handoff` with a co-pilot holding a live implementer. The fresh session's
   first prompt starts in under 60 s, and nothing says "held" (spec 1, 6).
2. The fresh session's notice names `co-pilot <agentId> is live on <ticket>`. The pilot sends `resync`, and the
   co-pilot repeats its last report. No second co-pilot is spawned (spec 3, 4).
3. The slice branch gains a commit after the clear, and the co-pilot's next report arrives by the same id (spec 2, 4).
4. `node scripts/probe-clear-survival.mjs` prints `survived` and exits 0 (spec 7).
5. §3's Options table, read at Gate 1 (spec 8).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1, 2 |
| S2 | planned | | | | S1, S4 | 5, 6 |
| S3 | planned | | | | S1 | 6 |
| S4 | planned | | | | – | 3 |
| S5 | planned | | | | S1, S4 | 3, 4 |
| S6 | planned | | | | – | 2, 4, 7, 8 |
| handoff-no-wait | planned | feat/handoff-no-wait | | | S1-S6 | 1-8 |
