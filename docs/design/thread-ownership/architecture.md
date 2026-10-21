# Thread ownership: one assigned agent answers each deck thread

Feature `thread-ownership` · branch `feat/thread-ownership` · base `origin/main` at `f69d562`

## 1. Problem

"i want to fix how the deck notifies more than one agent to respond. each thread should have an
assigned agent, whether that is the main pilot or for example the qa. if another agent should
respond, the dedicated agent should pass the thread to an agent, or just a question for the
handling agent to relay back to the thread."

The evidence is walkthrough `itm_ed5218ea663f` on 2026-09-27. The user's usage-log question
(05:45:42Z) was answered twice: by QA at 05:46:00Z and by the pilot at 05:46:16Z. Each of the
user's next two replies was delivered to both agents. The pilot's inbox hook, the pilot's
`deck_wait` and QA's own `deck_wait` all woke on them.

## 2. Spec

Each line is *assumed* until the pilot relays the user's agreement.

| # | Behaviour | Evidence |
|---|---|---|
| 1 | Every item has one **owner**, an agent kind. It is set when the item is posted, to the poster's stamped author. Chat threads and Create threads are always the pilot's. An item stored before this feature reads as its `author`, or `pilot` if it has none. | The thread header's owner line reads `qa` on a QA walkthrough and `pilot` on the pilot's question, each in its byline colour (the user's word at Gate 2, itm_8dc56c0d58cd). |
| 2 | A user reply is handed to its thread's owner and to no other agent. `deck_wait`, `deck_read`'s hand-off, the pilot's inbox hook and the pilot's Stop hook all skip replies on threads the caller does not own. The store records who received each reply. | One user message on a QA-owned thread wakes QA and leaves the pilot parked. The bar reads `qa has it`. One answer appears, not two. |
| 3 | The owner can pass a thread to another agent kind. From then on that kind is the owner and receives the replies. The pilot may take any thread back. | The owner shown changes, the passing message appears, and the next user reply wakes only the new owner. |
| 4 | A non-owner cannot reply on a thread or close it. Its `deck_reply` or `deck_resolve` is refused, and the refusal names the owner. It sends its point to the owner, which relays it. The one exception: the pilot's helpers (teacher, explorer) may reply on a thread the pilot owns. | The pilot's `deck_reply` on QA's walkthrough fails with "owned by qa". The relayed text appears under QA. A teacher's step still lands on a question. |
| 5 | A user reply waits for its owner, and a busy owner keeps its thread. The pilot takes the thread, and is handed the reply, once it has gone unclaimed for 30 seconds, or once the owner picked it up and has not answered on the thread in 5 minutes, **and** either way the owner kind has made no tool call and held no wait for 90 seconds (L6, L7). No reply is ever delivered to nobody. | Let the QA agent end, then reply on its walkthrough: the pilot wakes within about 30 to 90 seconds, and the thread header's owner changes from `qa` to `pilot`, live; no note beside it (the user on itm_8dc56c0d58cd: "get rid of this ... - bloat"). A QA still making tool calls keeps its thread and receives the reply when it next waits. |
| 6 | Pressing "Sign off" on a walkthrough hands that reply to the pilot as Gate 2, as well as to the owner (**L2**). | Press Sign off on a QA walkthrough: the pilot wakes on it and records Gate 2, and only QA writes in the thread. |

## 3. Findings

Re-verified against `origin/main` at `f69d562`.

- **Routing is by repository only.** ADR 0039 removed thread binding and `threadFilter`, so
  every run on a repository hears every thread of it. `deck/server.mjs:716-735` `runTool`
  filters with `heard = (reply) => forRun(reply, repo)` (`forRun` at `:498`) and hands off
  only what was heard (`:733`). Owner routing is a second predicate composed into that same
  `heard`, re-reading the deck when each reply arrives.
- **Author is already stamped, and an old item's author is already its default owner.**
  `hooks/deck-author.js` stamps `author` from `agent_type` on `deck_(post|reply|resolve)` only
  (`hooks/hooks.json:53`, matcher `^mcp__plugin_pilot_deck__deck_(post|reply|resolve)$`).
  `deck/items.mjs:348` `authorKind` maps the raw type to a kind (`AUTHOR_KINDS` at `:335`).
  A QA walkthrough already stores `author: 'qa'` (ADR 0027).
- **The cursor is per process, and every agent of a session shares that process.**
  `deck/client.mjs:62` holds one module-level `cursor` and `:70` one `handed` set; only a wait
  moves the cursor (`:269`). ADR 0027 says the stdio client "serves every agent of a session
  through one process". While everyone hears everything, sharing loses nothing. Once waits
  are filtered by owner, a QA wait would return the whole-deck `seq`, and the pilot's next
  wait would start past its own replies. So both must be keyed by kind, which needs the
  author stamped on `deck_wait` and `deck_read` too.
- **Only the pilot and QA can wait.** Among the `agents/*.md` tool lists, `deck_wait` and
  `deck_read` appear on `pilot-qa.md:5` and `pilot.md:5` only. `pilot-auditor.md:5` holds no
  deck tool. `pilot-teacher.md:5` and `pilot-explorer.md:5` hold `deck_reply` alone: ADR 0020
  has the teacher reply in-thread, and `agents/pilot.md:48-50` sends a question on a Create
  thread to an explorer that "answers there". Neither ever waits.
- **Nothing on the deck says an agent has ended.** The roster (`deck/agents.mjs`, ADR 0024)
  counts an agent as live while it made a tool call within 90 s (`LIVE_WINDOW_MS`). A QA
  parked in a 55-minute `deck_wait` makes no tool call, so the roster alone would call it
  ended. The client re-polls every ≤120 s (`MAX_POLL_MS`, `tools.mjs:79`), and each poll
  reaches the daemon. A parked wait wakes only on a write (`server.mjs:408`
  `waitForReplies`) or its own timeout, so a fallback that comes due with no write needs a
  timer of its own (A7). The wait's `since` has already moved past a reply the caller did not
  own (`client.mjs:269`), so finding an overdue reply cannot be done by cursor.
- **The pilot-only hooks.** `hooks/inbox-alert.js:242` and `hooks/stop-gate.js:222` return
  early on `agent_id`. The inbox hook calls `deck_wait` over HTTP with no author and, since
  ADR 0039, no thread (`inbox-alert.js:156-160`). The Stop hook reads items with `deck_read`
  and blocks on any answered thread (`stop-gate.js:245`). That is how the pilot woke on QA's
  thread.
- **A contradiction in the crew text.** `skills/pilot/SKILL.md:366-371` has the pilot close
  the walkthrough when it records Gate 2. `agents/pilot-qa.md:146-150` has QA close it.
- **There is no deck-written line any more.** ADR 0039 removed `endSession` and "the deck's
  own line in a thread". `render.mjs:127` `renderMessage` now draws only `you` or an author
  byline. So S5's fallback line needs `from: 'deck'` drawn again, which is about 10 lines in
  `deck/ui/render.mjs`.
- The walkthrough's Sign off is the fixed reply `SIGN_OFF` (`items.mjs:116`), recognised by
  kind in `server.mjs:161-170` `replyFrom`.
- **The version is stated in five places, and one test pins them equal.**
  `scripts/test/toolbox.test.mjs:230` checks `package.json:3`, `.claude-plugin/plugin.json:4`,
  `package-lock.json:3` and `:9` (the root and `packages['']`), and `deck/client.mjs:384`.
  `.claude-plugin/marketplace.json` carries no version.

## 4. Ubiquitous language

- **Owner**: the agent kind (`pilot` or `qa`) that a thread's user replies are handed to, and
  the only kind that may write on the thread or close it. Stored as `owner` on the item.
- **Pass**: the owner, or the pilot, making another kind the owner by saying so on the
  thread (`deck_reply` with `to`).
- **Helper**: a kind that writes on a pilot-owned thread for the pilot and never waits:
  `teacher`, `explorer`.
- **Relay**: a non-owner sending its point to the owner by `SendMessage`, and the owner
  saying it on the thread.
- **Fallback**: the deck passing a thread to the pilot because a reply on it is overdue:
  unclaimed for `OWNER_PICK_UP_MS`, or picked up and unanswered for `OWNER_ANSWER_MS`, with
  the owner kind quiet for `LIVE_WINDOW_MS` (L6, L7).
- **Delivery** (CONTEXT.md): now recorded with its recipient, `deliveredTo`.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
|---|---|---|---|
| L1 | Grilling depth: **forks**. Only decisions whose paths produce materially different deliverables are asked. The rest are assumed and listed at Gate 1. | Answered by the user on `itm_facf13c9455c`, 2026-09-27T06:16:04Z. | *every*, *none* |
| L3 | **Agents only.** There is no reassign control on the deck. The owner passes a thread, the pilot can take one back, and the user asks in words. | Answered by the user on `itm_6fd4f573dc15`, 2026-09-27T06:22:54Z. | An owner picker on the thread page. |
| L4 | *Superseded by L6 and L7.* **Grace period.** A reply waits for its owner. The pilot takes the thread only once that reply has sat unclaimed (no `deliveredTo`) for `OWNER_GRACE_MS` (5 min), **and** the owner kind has shown no activity (no roster heartbeat, no parked or polled wait) in that time. What it trades, in the user's words: when QA really has ended, they wait up to 5 minutes for the pilot. | Answered by the user on `itm_fb68e51fb8b3`, 2026-09-27T06:23:11Z. | Deciding when the reply arrives, on the 90 s roster window: a QA inside one long command (a gate run over 90 s) would count as ended and lose its own walkthrough. |
| L2 | Pressing Sign off on a walkthrough hands that reply to the pilot as well as to the owner. This is the only reply delivered twice. | It is the user's own spec line 6 on ticket `itm_c568131275e3`. The pilot learns Gate 2 from the user's press, not from an agent's word, and its in-thread reply is refused (spec 4), so only one answer appears. | QA relaying the Sign off by `SendMessage`: an agent's message is never the user's consent. |
| L5 | **A patch version bump, 0.7.2 to 0.7.3, for when the PR lands.** It is carried by S6, the last slice, in all five places the version is stated (§3). | The user's words on `itm_009058cdf9a0`, 2026-09-27T06:30:11Z: "make a small bump to the version for when the pr lands". `scripts/test/toolbox.test.mjs:230` fails if any one of the five is missed. | A minor bump; a bump in each slice. |
| L6 | **Pick-up.** Supersedes L4's pick-up half. The pilot takes a thread when a user reply has sat unclaimed (no `deliveredTo`) for `OWNER_PICK_UP_MS` (30 s) **and** its owner kind has made no tool call and held no wait for `LIVE_WINDOW_MS` (90 s). A busy owner keeps its thread. | Answered by the user on `itm_c002827378c4` at Gate 2: "a 5 min wait is too long. make it 5 mins for a response, 30 seconds for it to pick up the question." | L4's 5 minutes unclaimed. |
| L7 | **Answer.** New. Once the owner has picked a reply up, the pilot takes the thread and is handed that reply as well when `OWNER_ANSWER_MS` (5 min) have passed since the pick-up with no answer from the owner on the thread **and** the owner kind has been quiet for `LIVE_WINDOW_MS`. An owner still working keeps its thread. The reply is recorded as handed to both kinds, the second reply after the Sign off (L2) to be delivered twice. | Answered by the user on `itm_4ec1a1055344` at Gate 2, in the words under L6. | A picked-up reply staying the owner's for good, which strands it when the owner ends mid-answer. |

## 6. Assumed decisions

A1 to A10 are the architect's own calls under L1, listed for Gate 1. No fork is open.

| # | Default taken | Tradeoff / rejected alternative |
|---|---|---|
| A1 | Owners are agent **kinds**, never agent ids. `OWNER_KINDS = ['pilot', 'qa']`, the kinds that hold `deck_wait`. Any other poster's item is owned by `pilot`. | A kind survives `/clear`, a hand-off and a fresh QA, and it is what the hook can stamp. Two live agents of one kind in one session would both hear the thread (today's behaviour, no worse). This cannot arise today: one QA per feature, and ADR 0039 left no daemon-started session to share a process with. Rejected: `agent_id`, which dies with the agent and would orphan the thread on every hand-off. |
| A2 | An old item's owner is derived on read: `owner ?? author ?? 'pilot'`. Nothing is migrated. `STORE_VERSION` stays 1. | An old QA walkthrough reads `qa`, and fallback (spec 5) passes it to the pilot at its next reply. Rejected: a migration pass that writes `owner` onto every item (a write to a store the daemon guards, for a value the read already gives). |
| A3 | A pass is `deck_reply { id, text, to }`: one message plus the ownership change, in one write. | Every tool description is paid on every turn by every agent granted it (independence spec 9), and a pass should be said aloud to the user anyway. Rejected: a new `deck_pass` tool. |
| A4 | Besides the owner, **the pilot may pass any thread**, so it can take one back. | The pilot is the orchestrator. A hung QA must not hold a thread until the fallback fires. Rejected: owner-only passes. |
| A5 | Teacher and explorer are **helpers**: on a pilot-owned thread their `deck_reply` is accepted, and their message carries no `seq`, so it wakes nobody. | Keeps ADR 0020's teacher and `agents/pilot.md:48-50`'s Create-thread explorer as they are, at zero pilot context. Rejected: passing the thread to them (they never wait, so the user's next reply would reach nobody); the pilot relaying their text (ADR 0020 rejected paying the pilot's context for the lesson). |
| A6 | `deck_resolve` follows the same rule as `deck_reply`: the owner only. QA closes its own walkthrough, and the pilot records Gate 2 from the Sign-off delivery (spec 6). `SKILL.md:366-371` is corrected. | One write rule for a thread. Rejected: the pilot closing any thread (this re-creates the two-voices problem on the close). |
| A7 | **The mechanism under L6 and L7.** The daemon keeps `lastActive` per repository and kind, in memory in `deck/agents.mjs`. It is fed by every roster heartbeat (mapped through `authorKind`) and by the return of a `deck_wait` of that kind, and a kind holding a parked wait counts as active until it returns (`holdWait`). A reply is **overdue** when its owner is not the pilot, the owner kind is quiet (`quietAt`: `LIVE_WINDOW_MS` after its `lastActive`), and either it is unclaimed and `repliedAt` is `OWNER_PICK_UP_MS` old, or the owner was handed it, has written nothing on the thread since, and `deliveredAt` is `OWNER_ANSWER_MS` old. Because the fallback is no longer decided on arrival, what fires it is a **timer in the pilot's parked wait**: on every park, and on every change it wakes for, the daemon computes the earliest moment an unclaimed foreign reply could become overdue (`fallbackDue`'s `nextAt`) and sets one `setTimeout` for it. When it fires, the wait hands the overdue reply to the pilot through `fallBack`: one write that sets the owner to `pilot` and `deliveredTo` to `'pilot'`, or to `['qa', 'pilot']` for a reply QA had already been handed. Overdue replies are found by a query that ignores the wait's cursor (`since`), because the pilot's cursor has already moved past a reply it did not own. So the inbox hook's 1 ms wait receives them too. A daemon restart empties `lastActive`, so an absent value counts from the daemon's start, never from zero. Tests drive the timer with `node:test`'s `mock.timers` (`setTimeout`, `Date`) and pass `now` into the pure functions. | The roster has no end event (ADR 0024). A daemon-wide sweep timer was rejected: it would pass threads while no pilot is listening to be handed them. Relying on the client's ≤120 s re-poll alone was rejected too: it adds up to 2 minutes on top of the due time. `deliveredTo` (A9) keeps a QA returning after the fallback from getting the reply as well. |
| A8 | A `deck_wait` or `deck_read` with **no author** is the pilot's. The inbox hook and the Stop hook call over HTTP without the stamping hook, and they only run for the pilot. | Keeps both hooks' calls unchanged. Rejected: making the hooks send `author` (a second spelling of "who is the pilot" on the CommonJS side). |
| A9 | A reply is handed to at most one kind, recorded as `deliveredTo` when `deliveredAt` is first written. A wait skips a reply already delivered to another kind. The Sign off under L2, and a reply its owner left unanswered under L7, are the exceptions. | This makes "exactly one" a store invariant rather than a timing accident, and it closes the A7 race. Rejected: a filter only, which a fallback racing a slow owner would break. |
| A10 | **At most one live QA per session, and the pilot skill says so.** Within one session the pilot spawns QA once per feature (step 8). A QA hand-off at the context guard's threshold ends the old QA before the fresh one starts, so two never overlap. Across sessions, each session is its own stdio process with its own per-kind cursors. Since ADR 0039, every run on a repository hears every thread of it. If two QAs ever did run in one session, they would share the `qa` cursor, and one QA's wait would carry the other past a reply. So this is stated as an invariant in `SKILL.md` step 8 (S6), not engineered around. | Two pilot sessions in one repository already both hear every reply there today (ADR 0039). Their QAs would both hear `qa` threads: the same double delivery this feature removes within a session, left as it is across sessions. Rejected: owners keyed by agent id plus a cursor per id, which dies on every hand-off (A1) and needs the id on every call, which the harness gives only to subagents. |

## 7. Out of scope

- A user-facing reassign control (L3).
- Between-turn reply injection into a crew agent. QA hears its own threads through
  `deck_wait` only; the inbox hook stays pilot-only.
- Ownership by any kind but `pilot` and `qa`. Implementers, the architect and the
  fundamentalist hold no deck tools.
- A `SubagentStart`/`SubagentStop` hook, and persisting the roster (ADR 0024 stands).
- Session tokens on the loopback API. An HTTP caller can still claim an `author`, the same
  trust ADR 0027 accepted.

## 8. Slices

Every slice runs `node --test` on its own test files plus the whole suite at its gate.
S2 runs in parallel with S3 onward, because its files are all under `hooks/` and
disjoint from theirs. S3 to S6 are sequential because they share `deck/store.mjs` and
`deck/server.mjs`.

| Slice | Title | Spec | Files owned | After | File |
|---|---|---|---|---|---|
| S1 | Walking skeleton: a QA-owned thread wakes only QA's wait | 1, 2 (wait) | `deck/items.mjs`, `deck/store.mjs`, `deck/server.mjs`, `deck/client.mjs`, `deck/tools.mjs`, `hooks/deck-author.js`, `hooks/hooks.json`, `deck/ui/render.mjs`, `deck/test/owner.test.mjs` (new), `hooks/test/deck-author.test.js`, `docs/adr/0041-*.md` (new) | – | [S1](slices/S1.md) |
| S2 | The pilot's hooks ignore threads it does not own | 2 (hooks) | `hooks/stop-gate.js`, `hooks/inbox-alert.js`, `hooks/lib/deck.js`, `hooks/test/owner-hooks.test.js` (new), `hooks/test/join.test.js` | S1 | [S2](slices/S2.md) |
| S3 | Reads hand over only your own threads, and delivery names its recipient | 2 (read, `deliveredTo`, bar) | `deck/store.mjs`, `deck/server.mjs`, `deck/client.mjs`, `deck/items.mjs`, `deck/test/owner-read.test.mjs` (new) | S1 | [S3](slices/S3.md) |
| S4 | Pass a thread, and a non-owner is refused | 3, 4 | `deck/store.mjs`, `deck/server.mjs`, `deck/tools.mjs`, `agents/pilot.md`, `agents/pilot-qa.md`, `deck/test/pass.test.mjs` (new) | S3 | [S4](slices/S4.md) |
| S5 | A reply its quiet owner leaves unclaimed for 30 s, or unanswered for 5 min, falls back to the pilot | 5 | `deck/agents.mjs`, `deck/store.mjs`, `deck/server.mjs`, `deck/ui/render.mjs`, `deck/test/fallback.test.mjs` (new) | S4 | [S5](slices/S5.md) |
| S6 | Sign off reaches the pilot as Gate 2, and the version goes to 0.7.3 (L5) | 6 | `deck/server.mjs`, `deck/store.mjs`, `skills/pilot/SKILL.md`, `agents/pilot-qa.md`, `deck/test/signoff-owner.test.mjs` (new), `package.json`, `.claude-plugin/plugin.json`, `package-lock.json`, `deck/client.mjs` | S5 | [S6](slices/S6.md) |

S4 and S6 both own `agents/pilot-qa.md`; S1, S3 and S6 own `deck/client.mjs`; S1 and S5 own
`deck/ui/render.mjs`. All of those are sequential. Each slice is sized under
about 400 changed lines. S1 is the largest, at about 350, because the per-kind cursor cannot
be split from the owner filter without losing the pilot's replies in between (§3).

## 9. Acceptance evidence, in the order the user meets it

1. Run QA through a feature. Its walkthrough's thread header's owner reads `qa`, in QA's
   colour. The pilot's questions read `pilot`. (spec 1)
2. Type a question on the walkthrough. Only QA answers; the pilot's session shows no notice and
   stays parked. The bar reads `qa has it`. (spec 2)
3. QA passes the thread to the pilot with a line saying so. The owner shows `pilot`, and the
   next reply wakes only the pilot. (spec 3)
4. Ask the pilot, in its chat, to answer on QA's walkthrough. The pilot is refused, sends the
   point to QA, and it appears under QA. (spec 4)
5. Press Sign off. The pilot records Gate 2, and only QA writes in the thread. (spec 6)
6. After QA has ended, reply on an old walkthrough. About 5 minutes later the pilot wakes, and
   the thread header's owner changes to `pilot`, with no note (itm_8dc56c0d58cd). (spec 5)

## 10. Status

| Slice | State | Branch | PR | Worktree | Blocker | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 1, 2 |
| S2 | planned | | | | S1 | 2 |
| S3 | planned | | | | S1 | 2 |
| S4 | planned | | | | S3 | 3, 4 |
| S5 | planned | | | | S4 | 5 |
| S6 | planned | | | | S5 | 6 |
| feature | planned | `feat/thread-ownership` | | | S1–S6 | 1–6 |
