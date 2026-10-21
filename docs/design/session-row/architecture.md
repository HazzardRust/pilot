# session-row: one session keeps one run, a thread read is windowed, green goes first with no yellow

Ticket `itm_723a6a8120d1` · branch `design/session-row` from `origin/pilot` 45f5729f · merge: none (`itm_fdf2f38175b6`)

## 1. Problem

Three deck jobs on one surface, in the user's words on the ticket.

1. "A client-side register timeout after the store has already created the run shows one session as two run rows." One session must be one row.
2. A `deck_read` of the chat came back at 1,334 lines and overflowed Claude Code's tool-result cap: "we need to give the agent functionality to call only the messages that it needs ... make it the default if it is under 5 messages long, otherwise default should be last 5 messages."
3. "When i come back after a long overnight session, there will be no yellow, probably a bunch of green and a bunch of red ... if there are no yellow tickets, it defaults to a green ticket, such that whilst i am working on red, there is still work being implemented in the background."

**Pushback on job 1, verified by `main`**: the duplicate row does not happen. `registerRun` (`deck/store-runs.mjs:442-466`) already drops the row with the same pid and repo, pinned by `deck/test/daemon.test.mjs:274`, and registration is synchronous, so two registrations cannot interleave. #537's reviewer note ("`registerRun` does not dedupe by pid") was wrong. What is real: a retry mints a **new** run id and a fresh row, losing the feature name and the slice table. Spec 1 is sharpened to that.

## 2. Spec

Signed as posted on `itm_28315245798b` ("Spec stands"), lines 1-10; line 11 added by the user on `itm_3b13457d5d0f` ("Add it").

| # | Behaviour | Evidence |
|---|---|---|
| 1 | A session that registers again (a client timeout, a join retry) keeps its run: same id, same `startedAt`, feature name and slice table; only `lastSeenAt` moves. A new session that reuses a dead session's pid in the same repo gets a fresh row. | S1 tests 1 and 2: register twice with one session key, one row, one id; a second key with the same pid, a fresh id. |
| 2 | Over HTTP the second `POST /api/runs` answers 200 with that same run; `JOIN_ATTEMPTS` and the startup retry are unchanged. | S1 test 3; `deck/test/startup.test.mjs` unchanged and green. |
| 3 | Under load the two-sessions daemon test shows exactly two rows for two sessions. | 10 of 10 loaded `npm run test:quiet` runs, log in S1's PR. |
| 4 | `deck_read` takes `messages`: `N` the last N of a thread's messages (its post, then its replies), `-N` the first N, `"all"` the whole; `0` or anything else is refused naming the field. The answer says how many it left out and the total. | S2 tests 1-3 on a 10-message thread. |
| 5 | With no `messages`, a thread under 5 messages comes back whole and a longer one as its last 5. | S2 tests 4-5 on 4- and 6-message threads; a ~127k-character chat fixture comes back under 3k. |
| 6 | Every place an agent is told to read a thread names the window it wants: the pilot's first-turn read and its reply read, the grilling skill's answer read, QA's walkthrough read. | S4's wording pins on `agents/pilot.md`, `skills/grilling/SKILL.md`, `agents/pilot-qa.md`. |
| 7 | `nextTicketOf` takes a ticket with a queued question first; then, with no open yellow ticket in the directory, the green head before red; with one open, red before green as today. The pilot's Yellow section says the same rule. | S3 tests 1-3; S4's pin on `agents/pilot.md` Yellow. |
| 8 | The idle-main-lane refusal line, the SessionStart lane line and the chain's hand-off `next` name the pick that rule makes. | S3 test 4 on `lanesFrom` with no yellow names the green pick. |
| 9 | The window applies per item to every full read, not only a read by id; a `brief` read is unchanged. | S2 test 6: an `open: true` read of a 6-message thread returns its last 5. |
| 10 | Only the messages a read shows are handed over; a reply windowed out stays untaken, so `pilot wait` still delivers it and the page never says the pilot has words no agent read. | S2 test 7. |
| 11 | The deck's own code readers (the hooks, `pilot` status) still see whole threads: each passes `messages: "all"` explicitly, so the default protects agents' context and a gate reply older than the last 5 is never unseen (L6). | S2 test 8; the hook suites green unchanged in their assertions. |

## 3. Findings

- **Runs**: `newRun` (`deck/runs.mjs:119`) mints `run_<hex>` every call; `registerRun` (`deck/store-runs.mjs:442`) filters out `existing.pid === run.pid && existing.repo === run.repo` and appends the fresh row; `POST /api/runs` (`deck/server-routes.mjs:652`) reads `{ repo, pid }`; `registerSession` (`deck/client.mjs:184`) posts `process.cwd()` and `process.pid`. `setSlices` (`deck/store-runs.mjs:534`) keys the table and feature name on the run id, so a fresh id empties the tab. ADR 0023 calls the id "fresh at every registration"; the number is keyed on the directory, so keeping the id within one session moves nothing it rests on. ADR 0120 is the join retry.
- **Reads**: `selectItems` (`deck/read.mjs:15`) is the one pure selection `deck_read` makes (audit-f1-f7 L1); the handler (`deck/server-tools.mjs:217-262`) returns full items and `handOff`s every message of the owned items it returns. `messagesOf` (`deck/items.mjs:417`) is the replies list; the post is `item.body`. Schema at `deck/tools.mjs:197`. Code readers through the same tool: `hooks/stop-gate.js:219` (by id), `hooks/inbox-alert.js:178`, `hooks/session-handoff.js:399` (reads `item.body`, :133), `hooks/context-size-guard.js:558`, `deck/run.mjs:233`, `deck/wait.mjs:153` (counts items only; no change).
- **Prompt cost**: `scripts/measure-prompt.mjs:84` counts each granted deck tool's schema JSON in an agent's share, so `deck_read`'s schema is paid by the pilot (pin 10219.5, 0 headroom, `scripts/test/measure-prompt.test.mjs:142`) and QA (pin 4583.5, `scripts/test/qa-preview.test.mjs:147`).
- **Pick**: `nextTicketOf` (`deck/items.mjs:568`) takes the first non-yellow ticket that is red or asked, else the green head. Callers: `deck/chain.mjs:86`, `deck/store-tickets.mjs:93`, `inHandOf` (`items.mjs:579`) and through it the deck state, the overview and `deck/ui/render-rail.mjs:487`; on `feat/idle-main-lane` (PR #548, not on `pilot`) `deck/lanes.mjs:20` `lanesFrom`, whose `deck/test/lanes.test.mjs:27` pins "a red ticket is named before an earlier green one" with no yellow, which this rule flips. Prose: `agents/pilot.md:139-140`.
- **Overlaps**: idle-main-lane edits `hooks/session-handoff.js`, `hooks/stop-gate.js`, `deck/wait.mjs`; bigger-jobs edits `agents/pilot.md`, `agents/pilot-qa.md`, `skills/grilling/SKILL.md` and both prompt pins; clean-landing S10 edits `agents/pilot.md`. gate-stays-signed has landed.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| run registration (`deck/store-runs.mjs`) | `registerRun({ repo, pid, session? }) -> Run` | the keep-or-replace decision, today split between `newRun` minting and the filter; `newRun` stays the row's constructor | 2. local-substitutable (the store file under `PILOT_DECK_DIR`) |
| session identity (`deck/client.mjs`) | `registerSession(timeoutMs?) -> Run`, `SESSION_KEY` | the per-process key, minted once at module load | 1. in-process |
| read selection (`deck/read.mjs`) | `selectItems(items, { id, open, limit, brief, messages }) -> Item[]`, `windowOf(item, messages) -> WindowedItem` | the window rule and its default; the handler hands off `messagesOf` what came back, not the stored item; a thread the read's fallback took comes back whole | 1. in-process |
| the pick (`deck/items.mjs`) | `nextTicketOf(items, repo) -> Ticket \| undefined` | the yellow-open test, inside it; `lanesFrom`, the chain and the rail stay readers | 1. in-process |

Deletion test: `read.mjs` earns its keep (one selection, three readers would re-derive the window); `lanesFrom` would scatter its strings across three hooks, so it stays and is only re-pinned. No shallow module here needs a fold slice.

## 4. Ubiquitous language

- **Session key**: a random string one client process mints once and sends at every registration; the store keeps a row only for the same pid, repo and key.
- **Message**: a thread's post (`body`) or one of its replies, counted in that order; the post is message 1.
- **Window**: the messages a read returns of a thread, named by `messages`; `left` is how many it did not return, `total` how many there are.
- **Pick**: what `nextTicketOf` returns; every surface that names "next" names the pick.
- **Yellow open**: an open ticket in `yellow` state in the directory, live or queued.

## 5. Locked decisions

- **L0** Grilling depth: forks (the user, `itm_02e384848d6d`). Only a decision whose paths give materially different deliverables goes to the user.
- **L1** Keep the row when pid, repo and session key all match; replace it as today otherwise. Rejected: pid and repo alone (an OS reusing a dead session's pid in the same repo would hand a new session the old feature name and table).
- **L2** A row with no session key (an older client) is replaced as today. Rejected: refusing a register without a key, which breaks a session mid-upgrade.
- **L3** The post is message 1; `N`, `-N` and the default count post plus replies, a pass included. Rejected: replies only (the user's words were "messages", and a 1-message window must not be empty on a fresh question).
- **L4** The answer carries `window: { shown, total, left: 'earliest' | 'latest' }` on a windowed item and drops `body` when the post is outside the window; title, kind, state and owner always stay.
- **L5** Hand off only the messages shown (spec 10). Rejected: hand off all (the page would say the pilot has a reply nobody read).
- **L6** Code readers in `hooks/` and `deck/run.mjs` pass `messages: "all"` explicitly; the rule lives once, in `read.mjs`. Rejected: a whole-thread default on HTTP with the window applied in the MCP client (two defaults for one tool).
- **L7** "Yellow open" is any open yellow ticket in the directory, held by a co-pilot or queued. Rejected: only a live co-pilot (a queued yellow is refilling already; picking green would plan a second run beside it).
- **L8** A questioned ticket stays first in both cases; with yellow open the rule is today's (first red-or-asked in deck order, then green).
- **L9** `messages` is validated in the daemon: a nonzero integer or `"all"`; the schema is one property, `type: ['integer', 'string']`.
- **L10** QA runs on a scratch deck (`pilot deck --scratch`), never the user's deck at :4321 (the user, `itm_a439848cf2b8`). Rejected: the user's deck, whose store and runs the QA pass would write into.

## 6. Assumed decisions

- **A1** The session key comes from the client (`crypto.randomUUID()` at module load), sent in the register body. Default taken; told to `main`. Tradeoff: one line in `deck/client.mjs` against pid-only matching, which is exposed to pid reuse.
- **A2** Locked by the signed spec (line 9): the window applies to every full read. Tradeoff kept for the record: the pilot's first-turn `open: true` read (where the chat is) can no longer overflow, but it sees only the last 5 messages of each long thread unless it asks.
- **A3** The prompt pins rise to the measured cost with a dated comment, as research-first did, rather than paying by cuts elsewhere. Default taken.
- **A4** ADRs (S4 writes three: the session's run, the read window, the pick) take the next free numbers on `pilot` when S4 lands; in-flight features hold 0123 and above.

## 7. Out of scope

`deck_wait`'s payload (already replies only); a byte cap on reads; the UI's thread page; the startup retry loop; changing `JOIN_ATTEMPTS`; a session token on the HTTP API (the loopback trust of `client.mjs:206` is unchanged).

## 8. Slices

Width 3; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | A session that registers again keeps its run (walking skeleton) | 1, 2, 3 | `deck/runs.mjs`, `deck/store-runs.mjs`, `deck/server-routes.mjs`, `deck/client.mjs`, `deck/test/register-again.test.mjs` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | A thread read returns the window asked for | 4, 5, 9, 10, 11 | `deck/read.mjs`, `deck/tools.mjs`, `deck/server-tools.mjs`, `deck/run.mjs`, `hooks/stop-gate.js`, `hooks/inbox-alert.js`, `hooks/session-handoff.js`, `hooks/context-size-guard.js`, `deck/test/read-window.test.mjs`, `scripts/test/measure-prompt.test.mjs`, `scripts/test/qa-preview.test.mjs` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |
| S3 | With no yellow open, the pick is green | 7, 8 | `deck/items.mjs`, `deck/test/next-ticket.test.mjs`, `deck/test/lanes.test.mjs` | – | `pilot:typescript-reviewer` | [S3](slices/S3.md) |
| S4 | Every read names its window, and the pilot names the pick | 6, 7 | `agents/pilot.md`, `agents/pilot-qa.md`, `skills/grilling/SKILL.md`, `scripts/test/read-window-wording.test.mjs`, `scripts/test/measure-prompt.test.mjs`, `scripts/test/qa-preview.test.mjs`, `docs/adr/README.md`, three ADRs | S2 (`deck_read`'s `messages`; both prompt pins), S3 (`nextTicketOf`'s rule) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S4](slices/S4.md) |

Outside the DAG: S2 and S3 start once idle-main-lane (PR #548) is on `pilot` (S2 shares two hooks with it, S3 its `lanes.test.mjs`); S4 once bigger-jobs (#549) and clean-landing S10 (#559) are, or rebases onto them. S1 needs nothing. Estimated diffs: S1 ~120, S2 ~240, S3 ~80, S4 ~120 changed lines, each under the 300-line limit. Every slice carries `pilot:security-reviewer`: S1 changes a route's input, S2 a tool's input and four hooks, S4 agent configuration.

## 9. Acceptance evidence

1. On a scratch deck, start a pilot session, kill the daemon's answer to its first register (S1's test harness), and watch the page: one row, and its feature name survives the retry (spec 1, 2).
2. 10 loaded full-suite runs green, the log in S1's PR (spec 3).
3. In a session on the scratch deck, `deck_read` the chat after 6 messages: the last 5 and `window` `{ shown: 5, total: 6, left: 'earliest' }` (L4: the count left out is total less shown; co-pilot, 2026-10-12); `messages: -2`, `messages: "all"`, `messages: 0` refused (spec 4, 5, 9).
4. The deck page still shows the windowed-out reply as not handed over; `pilot wait` delivers it (spec 10).
5. With a red and a green ticket queued and no yellow, the overview marks the green one `next`, and the SessionStart lane line names it; post a yellow and the pick is red (spec 7, 8).
6. `grep` the four read instructions in the three prompt files for their window (spec 6).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 1, 2, 3 |
| S2 | planned | | | | – | 4, 5, 9, 10, 11 |
| S3 | planned | | | | – | 7, 8 |
| S4 | planned | | | | S2, S3 | 6, 7 |
| session-row | planned | | | | S1–S4 | 1–11 |
