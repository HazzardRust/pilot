# handoff-closed-on-pickup — architecture

Ticket itm_f481a236668b, with itm_bb099abeeae4 ("No grilling") and itm_1b5e5e286e36 (a ticket
proposal goes up as its own thread) merged in (itm_49c81b9a024e). Base: `origin/pilot` 26547862.

## 1. Problem

A session that picks up a hand-off replies on the `handoff` item saying it holds the run, then
leaves the item open. The item's "Handoff failed" button stays live, and a stray press briefs a
fresh agent and treats the live session as lost (the user, on itm_426f2958ea8e: "also that needs
a ticket of its own, the failure to close"). It happened again today: itm_cd42c668734e was open
after the previous session's hand-off and was closed by hand.

Merged in: the user wants a third grilling depth, **No grilling**, that goes straight from the
agreed spec to Gate 1. They also missed a ticket proposal that was posted as a chat reply because
the thread it came from had just closed; a proposal has to be an item of its own.

## 2. Spec

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | The session that picks up a hand-off makes `deck_reply` on the `handoff` item (it holds the run) and then `deck_resolve` on it as its first two tool calls, before any read. The lane's notice says so in one sentence, and `agents/pilot.md` "When your own context fills" pins the same wording. | `hooks/test/session-handoff.test.js`: the notice's second sentence names both calls in that order, and no later "Resolve its thread" sentence is left. `deck/test/handoff-ack.test.mjs` pins the pilot.md wording. `measure-prompt` is green with the pin unmoved or lower. |
| 2 | While the `handoff` item this session was handed is still open, the Stop hook blocks the turn's end, names the item's id and tells the session to `deck_resolve` it. It does not block the session that posted the hand-off, a plain (non-pilot) session the lane released it from, a subagent, or any session once the item is resolved. | `hooks/test/held-handoff.test.js`, run against a real daemon on a free port: held marker and open item → `decision: 'block'` with the id in the reason; item resolved → `null` and the marker is gone; poster without a marker → `null`; after `plainPickup` → `null`. |
| 3 | The depth question has a third option, **No grilling**. The spec is still agreed with the user. After that no design question is posted, step 3's standing QA-environment question included, every decision the architect stashed stands *assumed* in the artefact, and the `gate1` is the next item. | The D25 pin in `scripts/test/pilot-agents.test.mjs` reads three options, including No grilling and the skip of step 3. `measure-prompt` is green with the pin unmoved or lower. |
| 4 | The pilot's ticket proposal (the cut table awaiting the user's yes) is posted as a `question` of its own with the options Yes and Change, naming the thread the jobs came from. It is never a chat reply and never posted on a thread that is closed or closes in the same turn. The ticket-making skill and pilot.md's thread clause both say so. | Pins on `skills/ticket-making/SKILL.md` "The proposal" (`scripts/test/ticket-making.test.mjs`) and on pilot.md's thread clause (`scripts/test/pilot-agents.test.mjs`). `measure-prompt` is green. |
| 5 | A ticket posted from such a proposal names the proposal item's id as its thread. | "The body" item 3 says so, and the worked example shows a proposal id as the thread (`ticket-making.test.mjs`). |

## 3. Findings

| Where | What exists | What this leans on |
| --- | --- | --- |
| `hooks/session-handoff.js:154-176` `notice()` | Sentence 2: "Your first tool call, before any read: deck_reply on <id> saying you hold the run." Later, mid-paragraph: "Resolve its thread (<id>) once you are holding the run." | Spec 1 was already written down and failed anyway. Spec 2 is the fix; spec 1 tightens the wording into one sentence. |
| `hooks/session-handoff.js:381-388, 427-439, 469-503` `run`, `markPickup`, `deliver` | A delivered non-chain hand-off sets `result.pickup = {session, claim, item}`, and `deliver` calls `markPickup` after a successful write. A chain hand-off (`item.next`) is resolved by the lane itself. | The held marker is written at the same point, and only for a non-chain pick-up. |
| `hooks/post-tool.js:67-91` `plainPickup` | Reads and **deletes** `pickups/<session>.json` at the first tool call (judge once). For a non-pilot session it releases the claim and says "do not resolve". | The pickup marker is gone before any Stop, so the gate needs a marker of its own. `plainPickup` must drop it too. |
| `hooks/lib/deck.js:572` `pickupPath`, `:612` `sweep` | `stateDir()/pickups/<key>.json`; `sweep` removes files older than 7 days from `pickups/`. | The held marker lives in `pickups/`, so `sweep` already ages it out. |
| `hooks/stop-gate.js:239-306` `run` | Guards: `stop_hook_active` and `agent_id` → `null`; no state and no posts → `null`; deck down → `null` once. Reads the open items (`OPEN_READ_LIMIT` 20), blocks on an answered thread, holds on the pilot's own unanswered post. | The held check slots in after `answered` and before the wait-on-user hold, under the same guards. |
| `agents/pilot.md:205-215, 548-575, 49-55` | The depth question ("two options: *every* … *forks*"); the hand-off rule ("then it resolves the thread"); the thread clause for agreed work. | The three pilot.md edits for spec 1, 3 and 4. |
| `scripts/test/measure-prompt.test.mjs:136` | The pilot's own share is pinned at ≤ 10088. Measured on 26547862: **10087.75**, so 0.25 tokens (1 byte) of headroom, not 7.25. The pilot preloads no skill. | Every pilot.md byte added is paid for inside pilot.md. Skill edits (spec 4, 5) are free. |
| `scripts/test/pilot-agents.test.mjs:1113-1145` (D25), `deck/test/handoff-ack.test.mjs:20-27`, `hooks/test/session-handoff.test.js:870-885` | Pins on "two options", on "first tool call is a `deck_reply` … holds the run", and on the notice's `Resolve its thread`. | Each is re-pointed by the slice that changes its text. |
| `skills/ticket-making/SKILL.md:77-118, 130-160` | "The proposal" puts the table "in the thread"; "The body" item 3 is "The thread's id". | Spec 4 and 5. |
| `hooks/test/inbox.test.js:93-110` `deckFor` | Starts `deck/daemon.mjs` with a temporary `PILOT_DECK_DIR` on a free `PILOT_DECK_PORT`. | The S1 test harness and the QA environment. `pilot deck --scratch` does not exist yet: it is audit F4, itm_f323d36f1473. |

**Seams** (deepening pass): the deletion test was run on each module the feature touches. No fold
was needed, so there is no fold slice.

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| held hand-off marker (`hooks/lib/deck.js`) | `holdHandoff(sessionId, itemId)`, `heldHandoff(sessionId)`, `dropHeldHandoff(sessionId)` | The marker's path, JSON shape and id check, which would otherwise be repeated in three callers (session-handoff, post-tool, stop-gate). Delete it and that complexity reappears in all three. | local-substitutable (`PILOT_HOME` / state dir) |
| the Stop gate (`hooks/stop-gate.js`) | `run(input)` → block, notice or `null`; `heldReason(item)` | The new held check, beside the existing answered and awaiting checks. | remote but owned (the deck; tests use a real daemon on a free port) |
| the hand-off notice (`hooks/session-handoff.js`) | `notice(item, record)`, `deliver(result, write)` | Unchanged shape; `deliver` also writes the held marker. | in-process |
| the pilot's prompt (`agents/pilot.md`) | headings `### 1. Problem and spec`, `## When your own context fills`, the thread clause | Prose; budget-pinned. | in-process (prompt file) |
| the ticket-making skill (`skills/ticket-making/SKILL.md`) | headings `## The proposal`, `## The body`, `## Worked example` | Prose. | in-process (prompt file) |

## 4. Ubiquitous language

- **Hand-off**: the `handoff` item the pilot posts through `pilot handoff`. It is not a `crew-handoff` and not a chain hand-off (one carrying `next`).
- **Pick-up**: the lane delivering a hand-off to a fresh session. That session **holds** the hand-off until it resolves it.
- **Held marker**: `pickups/<session>.held.json`, which names the item a session holds.
- **No grilling**: the third depth. The spec is agreed, then no design question is asked.
- **Proposal**: the cut table awaiting the user's yes, posted as a `question` of its own.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
| --- | --- | --- | --- |
| L1 | The grilling depth is *forks* (the user, itm_60747bec8d54). | It was answered on the deck. | *every*. |
| L2 | QA runs against a scratch deck on a free port with a temporary store and a seeded `handoff` for a scratch directory. The Stop hook is run against it with the item open and then closed, and the notice is read as a fresh session gets it. It never touches the deck on 4321 (the user, itm_4dc6b2af987f). Until `pilot deck --scratch` lands (audit F4) the deck is started as `node deck/daemon.mjs` with `PILOT_DECK_DIR` and `PILOT_DECK_PORT`. | The user's answer. The command it names is not on `pilot` yet. | The live deck. |
| L3 | Merged bb099 and 1b5e and left bc0f and 22ad (the user, itm_49c81b9a024e). | bb099 and 1b5e share pilot.md and its budget pin with this ticket. | Three runs, each rebasing the others' byte-neutral trims. |
| L4 | The block is scoped to **the session that was handed the item**, through the held marker, not to every open `handoff` of the directory. | The posting session must end its turn so `pilot run` can type `/clear`. A directory-wide check would trap it, and any second session in the same directory. | Directory-wide (the draft's wording). |
| L5 | The held marker is a file of its own, written in `deliver()` right after `markPickup` on a successful write. `plainPickup` drops it; the gate drops it when the item is not open. | `post-tool.js` deletes the pickup marker to judge once (ADR 0080), and that rule is left as it is. | Keeping the pickup marker alive past its judgement. |
| L6 | The gate is never a trap. It stands aside on `stop_hook_active` (told once per stop, and it blocks again at the next fresh stop), a dead deck never blocks, and the held check never waits `HOLD_MS`. | These are the gate's own invariants (`stop-gate.js:33-46`). Resolving is the session's own act, so there is nothing to wait for. | A literal hold until resolved: a loop the gate promises it never is. |
| L7 | `crew-handoff` and chain hand-offs are excluded from spec 2. | A crew-handoff is never picked up through the lane. The pilot resolves it once the successor is spawned (`pilot.md:135, 571-575`), so holding the pilot's turn on it would trap the pilot while the successor works. A chain hand-off is resolved by the lane on delivery. | Covering every hand-off kind. |
| L8 | The held check runs after `answered` and before the wait-on-user hold. The early return becomes "no state, no posts and no held marker". | A user's answer outranks it. A just-cleared session may not yet have posted anything. | A separate Stop hook process: a second deck read on every stop. |
| L9 | All pilot.md edits (spec 1, 3, 4) go in one slice, paid for within the file. The pin goes down or stays, and is never raised. | 0.25 tokens of headroom, and one file. | Spreading the edits across slices that each fight for the same byte. |
| L10 | Under No grilling, step 3 is skipped whole, the standing QA question with it. The QA environment is the architect's assumed default. | The spec line says so. | Asking the QA question anyway. |

## 6. Assumed decisions

| # | Default taken | Tradeoff |
| --- | --- | --- |
| A1 | The pilot never recommends No grilling; the user picks it. The recommendation rule (*every* for schema, auth, money, a public API or irreversible data, *forks* otherwise) is unchanged. | Fewer runs skip grilling by accident; the user presses one more option. |
| A2 | The held marker sits beside the pickup marker in `pickups/`, so `sweep` covers it (main: fine). | Two files per pick-up instead of one. |
| A3 | A held id missing from the 20-item open read counts as not open, and the marker is dropped (main: fine). | On a deck with 20 newer open threads the gate is silent rather than blocking. A hand-off is posted just before `/clear`, so it is at the front of that read. |
| A4 | Three slices, width 3 (main: fine). | — |

## 7. Out of scope

- A confirmation on "Handoff failed" (itm_6d4847d9f1ad, #492).
- `deck_read` by `id` (audit F1) and `pilot deck --scratch` (audit F4).
- Closing a `crew-handoff` (L7).
- itm_bc0fbea3ab2b and itm_22ad234ca009 (not merged).

## 8. Slices

Width 3; longest stem 1

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | A picked-up hand-off holds its session's turn until resolved (walking skeleton) | 1 (lane), 2 | `hooks/lib/deck.js`, `hooks/stop-gate.js`, `hooks/session-handoff.js`, `hooks/post-tool.js`, `hooks/test/held-handoff.test.js` (new), `hooks/test/session-handoff.test.js`, `hooks/test/plain-pickup.test.js`, `docs/adr/0115-a-picked-up-hand-off-holds-its-session.md` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | pilot.md: the pick-up resolve, No grilling, the proposal item | 1 (pilot.md), 3, 4 (pilot.md) | `agents/pilot.md`, `scripts/test/pilot-agents.test.mjs`, `deck/test/handoff-ack.test.mjs`, `scripts/test/measure-prompt.test.mjs` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |
| S3 | ticket-making: the proposal is its own question, and its id is the ticket's thread | 4 (skill), 5 | `skills/ticket-making/SKILL.md`, `scripts/test/ticket-making.test.mjs` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S3](slices/S3.md) |

S1 is the walking skeleton and the dominant risk: a wrong call blocks every session's turn. All
three slices are disjoint and run side by side.

## 9. Acceptance evidence

On the scratch deck (L2), in the order a user meets it:

1. Seed a `handoff` for a scratch directory and start a session there. The notice's second sentence says to `deck_reply` and then `deck_resolve` the item as the first two tool calls (spec 1).
2. Before resolving, end the turn. The Stop hook prints `decision: block` naming the item's id. Resolve the item, end the turn again: silence, and `pickups/<session>.held.json` is gone (spec 2).
3. From the posting side, with no held marker and the item open, the Stop hook passes (spec 2).
4. `agents/pilot.md` shows three depth options with No grilling, and the hand-off rule names both calls. `node --test scripts/test/measure-prompt.test.mjs` is green (spec 1, 3).
5. `skills/ticket-making/SKILL.md` "The proposal" says a `question` of its own with Yes / Change, and "The body" names the proposal id as the thread (spec 4, 5).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1, 2 |
| S2 | planned | | | | – | 1, 3, 4 |
| S3 | planned | | | | – | 4, 5 |
| handoff-closed-on-pickup | planned | feat/handoff-closed-on-pickup | | | S1, S2, S3 | 1–5 |
