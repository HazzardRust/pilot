# A signed gate2 lands the feature from the deck

Ticket `itm_0e8a129d4e4d` · slug `gate2-lands` · base `pilot` 178c7e5e · merge: none (itm_22876426c896) ·
stands beside fix A, `install-allow-land` (itm_d56afbf23351, design 165bc1d6), which it does not need to land first.

## 1. Problem

On 2026-10-08, after the user pressed Sign off on Gate 2 (itm_44285f624faa), Claude Code's auto-mode
classifier refused the pilot's `pilot land` as "Merge Without Review" (itm_38b3049df6ba). The classifier
reads the command text and cannot see the gate. Fix A allows the command in the install. This is fix B:
the Sign off press itself is the act that lands, so no landing passes through the pilot's tool calls and
no classifier stands between the user's sign-off and the merge onto `pilot`.

## 2. Spec

Lines 1–4 are the user's ticket text sharpened against the code, 5–9 the implied lines; all agreed (itm_446da1a9dcf2).

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | On a Sign off press of a `gate2`, the daemon starts `pilot land` with no arguments (its own `bin/pilot.mjs` under `node`, no shell), its working directory the ticket's run-record `worktree`. The test command is the repository's (fix A L9, L11), not one the deck passes. The gate2 thread reads "landing: running pilot land in <worktree>" at once, then land's own lines: `landed feat/<slug> on pilot at <sha7>` and `merge first: …`, or `NOT landed: …`. | Scratch deck and scratch clone (L12): the press fast-forwards the bare origin's `pilot` to the feature tip and the thread carries both lines. With `npm test` red, `pilot` is unmoved and the thread carries `NOT landed: …` with the failing names. `deck/test/landing.test.mjs` with an injected spawn. |
| 2 | Step 9 no longer runs `pilot land`. After the press the pilot runs `pilot landing <gate2>` in the background, which exits once the deck has settled the landing and prints its line. On `landed` the pilot posts the closing report with that SHA and `merge first` line, runs `gh pr ready`, and tells QA to tear down; on `NOT landed` it routes the line as a human step. | The step-9 wording pin in `scripts/test/pilot-branch-rules.test.mjs` moved to the new sentence; `measure-prompt.test.mjs` green at 10044.25 or under, the budget unmoved. |
| 3 | The sign-off stays the user's. Only a Sign off press on a gate2 starts a landing: Not yet, Dismiss, a typed reply and a press the deck refuses for open questions start nothing. A Sign off on a gate2 whose landing is running or landed is refused, lands on its thread (ADR 0096) naming the state and the SHA, and runs nothing. | Store and server tests: Not yet, a gate2 refused over an open question, a press while running, a press after landed; the spawn stub is never called in any of them. |
| 4 | The deck refuses on the thread by name, and runs nothing, when no run record names the ticket, the record has no `worktree`, the worktree is gone, or it is not a checkout of the gate2's repository. | `deck/test/landing.test.mjs`: the record's worktree removed reads "NOT landed: the worktree <path> is gone; nothing run". |
| 5 | The deck stays live while land runs (70–107 s of tests): the landing is a child process the daemon waits on asynchronously. | A server test: `GET /` answers 200 while the stubbed child has not exited. |
| 6 | One landing per repository at a time: a second gate2's Sign off in the same repository while one runs is refused naming the running gate2. | Store test. |
| 7 | A landing the daemon outlived (a restart mid-run) reads "landing interrupted: the deck restarted; check origin/pilot" on the next read of it, and Sign off may be pressed again. A landing still running after 30 minutes has its own child tree killed and reads `NOT landed: timed out after 30 min`. | Store test with a stored pid that is not the daemon's; landing test with an injected clock. |
| 8 | Land's output is capped at its last 2000 characters; output the store's credential check refuses is withheld and the line says so, with the exit code. | Landing test with a credential-shaped stdout. |
| 9 | The daemon starting a third fixed command, and step 9 no longer running land, is recorded as an ADR amending ADR 0050 and ADR 0083's L14. | `docs/adr/0111-a-signed-gate2-lands-from-the-deck.md` and its README row; `adr-index` and `adr-format` tests green. |

**Cannot mean here.** "With the run's test command" as an argument: fix A removes `--test` and the deck passes
none. A landing from MCP, curl or any caller without the page's Origin: a gate's Sign off is already refused
403 there (`deck/server.mjs:1205-1210`).

## 3. Findings

| What | Where |
| --- | --- |
| The Sign off on a gate is taken only from the deck's own page (Origin present and equal to Host); every route also requires a loopback Host. | `deck/server.mjs:1199-1212`, `fromOwnPage` :1058, `isOwnHost` :351-360 |
| `addReply` refuses a gate2 Sign off over open questions (`refuseSignOffAsked`) before it writes, and dedupes a double click inside 10 s. | `deck/store.mjs:748-797`, :915-921 |
| A refused press lands on its thread as `?refused=<reason>`; `landRefusedPress` serves `/reply`. | ADR 0096; `deck/server.mjs` `landRefusedPress` |
| The precedent for the daemon starting a process: one module, one fixed command, the directory as `cwd` only, `sessionEnv` scrubbing the parent session's markers, a test switch in `no-open.mjs`, spawn injected in tests. | `deck/session.mjs:1-120`; ADR 0050; `deck/test/no-open.mjs:23` |
| `land()` is synchronous (`spawnSync` for git, `gh` and the tests); `main` prints `landed … at <sha7>` and `merge first: …` and exits 0, or `NOT landed: …` and exits 1 or 3. | `scripts/land.mjs:37-132` |
| `merge first` needs `gh pr list`; with no GitHub origin it reads `unknown (gh pr list failed: …)` and the landing still counts. | `scripts/land.mjs:83-87`, :124 |
| A run record is found by ticket: `recordForTicket(repo, ticketId)` → `{ record, ticket }`; `record.worktree` is absolute, written only through `deck_status`. | `deck/store.mjs:1961-1968`; `deck/runs.mjs:326,357-360` |
| `repoOf(dir)` names the repository a worktree belongs to; `sameRepo` compares spellings. | `deck/runs.mjs:103-115`; `deck/items.mjs` |
| Only `from: 'user'` replies with a `seq` are handed to a session; a pilot-kind message wakes nobody. Ten sites read that rule. | `deck/store.mjs:1441,1452,1480,1535`; `deck/client.mjs:90`; `deck/items.mjs:605,864` |
| A deck-written message needs no new kind: `{ from: 'pilot', author, text, repliedAt }` is the pilot-kind shape; an unknown author renders as `other`. | `deck/store.mjs:820`; `deck/items.mjs:506-511` |
| Step 9 runs `pilot land` in the feature worktree; its wording is pinned. | `agents/pilot.md:482`; `scripts/test/pilot-branch-rules.test.mjs:26` |
| The pilot prompt's own share is held at 10044.25 tokens. | `scripts/test/measure-prompt.test.mjs:127-133` |
| `pilot wait` is the background-command pattern for a pilot that must be woken; it is a client of the daemon over HTTP. | `deck/wait.mjs:1-60`; `bin/pilot.mjs:207` |
| Fix A: `pilot land` takes no arguments and reads the test command from the repository. | `design/install-allow-land` §2 spec 6, §5 L9, L11, S2 |

## 4. Ubiquitous language

- **Landing**: one run of `pilot land` the daemon started for one gate2, from the press to its settled line.
- **Settled**: a landing that has written its last line, `landed` or `NOT landed`; running is the only unsettled state.
- **The landing line**: land's own stdout as the deck writes it on the thread and `pilot landing` prints it.
- **The record's worktree**: `recordForTicket(gate2.repo, gate2.ticket).record.worktree`, the only directory a landing runs in.
- **The press**: a Sign off reply on a gate2 taken from the deck's own page and stored by `addReply`.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
| --- | --- | --- | --- |
| L1 | The landing starts in `/reply`, after `addReply` has stored a pressed Sign off on a gate2, and nowhere else. | The press is already the one place the gate passes (ADR 0064) and is page-only. | A separate Land button (a second press the user did not ask for); an MCP tool (an agent could call it). |
| L2 | The command is fixed: `spawn(process.execPath, [PILOT_BIN, 'land'], { cwd, shell: false, windowsHide: true, env: sessionEnv(process.env) })`. Nothing from the request or the store reaches argv. | No shell, no argument to inject; `sessionEnv` keeps the parent session's markers out, as Start does. | Calling `land()` in the daemon: its `spawnSync` would freeze every page for 100 s. `cmd /c pilot land`: a shell parses it. |
| L3 | The `cwd` is the record's worktree, checked at press time: absolute, a directory, and `repoOf` of it the gate2's repository. | `deck_status` wrote it, but the disk may have changed since; spec 4. | The gate2's `branch` or a `feat/<slug>` path guessed from the slug. |
| L4 | The state lives on the gate2 item as `landing: { state, pid?, startedAt, at?, sha?, line? }`, written by the store; the thread's messages are written in the same write, as `{ from: 'pilot', author: 'deck' }`. | The store is the one place a refusal can read it (spec 3, 6) and it survives a restart (spec 7). | An in-memory latch as Start's: harmless to lose for a window, not for a push. A new `from: 'deck'` that wakes sessions: ten sites to change (A2). |
| L5 | The trust boundary is unchanged (user, itm_0d75cf73e8c0): loopback Host on every route, and Origin equal to Host for a gate's Sign off. It is not a boundary against a local process forging Origin (ADR 0064); such a process could run `pilot land` itself. | The classifier's concern is the pilot's own tool calls; a forged press would be one, and visible to it. | A per-press token held by the page (offered as a fork, declined; ADR 0050 rejected it too); a second confirm. |
| L6 | Only the landing's own child is ever killed, by the handle the daemon holds (`taskkill /T /F /PID` on Windows), never by a stored pid. | ADR 0035's rule: a pid after a restart may be someone else's. | Killing by `landing.pid`. |
| L7 | `pilot land` stays a command for the user's own hand; step 9 stops running it. | The user may land by hand after a refusal. | Removing the CLI. |
| L8 | `pilot landing <gate2>` is read-only: it polls `GET /api/landing?id=<gate2>` every 3 s until settled or 40 min, prints the landing line, and exits 0 for landed, 1 for NOT landed, 2 for a deck that will not answer. | The pilot is woken by the press already; it needs the result, not a second wake mechanism. | Making the deck's message deliverable (A2). |
| L9 | The output written is land's stdout; stderr only when stdout is empty; the last 2000 characters; withheld when `refuseCredentials` refuses it. | A failed write would leave the landing unsettled forever. | Writing stderr always (git's progress noise). |
| L10 | `PILOT_DECK_NO_LAND`, set in `deck/test/no-open.mjs`, makes a press write "landing is turned off on this deck" and run nothing; unit tests inject `spawn`. | No test can push. | Relying on the injected spawn alone. |
| L11 | No hard dependency on fix A: the deck passes no `--test`, which works before and after A's S2 (`land()` defaults to `npm test`). | The user ordered A first; B need not wait on its merge. | Stacking B on A's branch. |
| L12 | QA runs a scratch deck (`PILOT_DECK_PORT`, `PILOT_DECK_DIR`) started from the feature worktree, a scratch clone whose `origin` is a local bare repository with `main` and `pilot`, a `feat/x` worktree with a `package.json` whose `npm test` is green or red by a file, a ticket, a run record naming the worktree, and a gate2, pressed in a real browser. | The press, the push and the thread are all real; `merge first` reads `unknown (…)` with no GitHub origin, which is land's own line. | The user's deck or a GitHub repository. |
| L13 | Grilling depth is **forks** (user, itm_939986fc3250), overriding the recommended every. Overridden: the daemon-side push guards (L2, L3, L5) are not walked one by one before Gate 1; the pilot objected that re-opening one after Gate 1 re-cuts a slice. | The user set it for this run. | Every branch. |
| L14 | The pilot hears the result through `pilot landing <gate2>` (L8) (user, itm_7a3c297929c5). | One read-only command and route; the delivery rule stays one rule. | A deck-written message that wakes sessions: the ten `from === 'user'` delivery sites change. |

## 6. Assumed decisions awaiting the user

| # | Default taken | Tradeoff |
| --- | --- | --- |
| A1 | *Taken as assumed by the pilot, not asked.* After `NOT landed`, Sign off on the same gate2 may be pressed again and starts a new landing. | Retry costs one press; the alternative (a new gate2 per attempt) re-asks a sign-off on code that may not have changed. If a fix changes the code, the pilot posts a new gate2 anyway. |
| A3 | *Taken as assumed by the pilot, not asked.* A landing over 30 minutes is killed and reads timed out; a restart mid-run reads interrupted (spec 7). | Without it a hung test blocks the gate2 forever; the cost is the daemon now kills one kind of process, its own. |
| A4 | *Taken as assumed by the pilot, not asked.* One landing per repository at a time (spec 6). | Two at once would each run the suite and race for `pilot`; land's one retake handles the race, so this is load, not safety. |
| A5 | *Taken as assumed by the pilot, not asked.* The ADR is numbered 0111, after fix A's 0110, renumbered at integration if taken. | — |

## 7. Out of scope

- Fix A's install rules and `--test` removal; `assertPushable`; `land.mjs` itself.
- `gh pr ready` and the closing report moving to the deck: they stay the pilot's (spec 2).
- Rendering the deck's byline specially: `author: 'deck'` renders as the existing `other` byline.
- A landing for anything but a gate2; landing on Start or on a walkthrough's Sign off.

## 8. Slices

| Slice | Title | Spec | Files owned | After | File |
| --- | --- | --- | --- | --- | --- |
| S1 | A Sign off press on a gate2 lands the feature (walking skeleton) | 1, 4, 5, 8, 9 | `deck/landing.mjs` (new), `deck/store.mjs` (`beginLanding`, `settleLanding`), `deck/server.mjs` (`/reply`), `deck/test/landing.test.mjs` (new), `deck/test/no-open.mjs`, `docs/adr/0111-…md` (new), `docs/adr/README.md` | – | [S1](slices/S1.md) |
| S2 | A gate2 lands once, one at a time, and never hangs | 3, 6, 7 | `deck/store.mjs` (`addReply`'s landing refusal, `settleLanding`'s interrupted read), `deck/landing.mjs` (timeout), `deck/test/landing-guard.test.mjs` (new) | S1 | [S2](slices/S2.md) |
| S3 | The pilot reads the landing instead of running it | 2 | `deck/landing-wait.mjs` (new), `bin/pilot.mjs` (`landing`), `deck/server.mjs` (`GET /api/landing`), `deck/test/landing-wait.test.mjs` (new), `agents/pilot.md` (step 9), `scripts/test/pilot-branch-rules.test.mjs` (:26), `scripts/test/measure-prompt.test.mjs` (comment only) | S1 | [S3](slices/S3.md) |

S2 and S3 own disjoint files and run in parallel after S1.

## 9. Acceptance evidence

In the L12 scratch environment, in the order the user meets it:

1. Press Sign off on the gate2: the thread reads "landing: running pilot land in <worktree>" within a second, and the overview stays live.
2. The thread then reads `landed feat/x on pilot at <sha7>` and `merge first: unknown (…)`; `git -C <bare> rev-parse pilot` equals the feature tip.
3. Press Sign off again: the thread shows "The deck refused that press: gate2 … is landed at <sha7>", and nothing runs.
4. With the test file set red on a second feature: the thread reads `NOT landed: …` with the failing names, and the bare `pilot` is unmoved; pressing again after the fix lands it (A1).
5. Remove the record's worktree and press: the thread reads "NOT landed: the worktree <path> is gone; nothing run".
6. `pilot landing <gate2>` prints the landing line and exits 0, or 1 for the red one.
7. `npm test` green, including the moved step-9 pin and the unmoved budget; ADR 0111 read.

## 10. Status

| Slice | State | Branch | PR | Worktree | Blocker | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1, 4, 5, 8, 9 |
| S2 | planned | | | | S1 | 3, 6, 7 |
| S3 | planned | | | | S1 | 2 |
| gate2-lands | planned | feat/gate2-lands | | | S1, S2, S3 | 1–9 |

## 11. Principles findings (co-pilot's verdicts on PR #456 at 10d4ef1e)

| # | Verdict | Why |
| --- | --- | --- |
| F1 | kept | A start-up sweep in `daemon.mjs` settles every `running` landing as interrupted; the pid, `orphaned`, `interruptOrphan` and `landingOf`'s write go. One removal fixes the orphan-shows-running and pid-reuse findings; spec 7's behaviour is unchanged. |
| F2 | kept | `render.mjs` stops importing the store. |
| F3 | kept | `beginLanding` before `spawn`, so a failed write runs nothing. |
| F4 | kept | POSIX tree kill (`detached` + `process.kill(-pid)`); a timeout must not unlock Sign off while a push runs. |
| F5, F7, F8 | kept | Missing assertions on the command step 9 runs and on L9. |
| F6 | kept | `--timeout` has no caller; the 40-minute default (L8) stays. |
| F9 | kept | ADR 0111 records the kill, one landing per repository, the route and the CLI. |
| F10 | kept | Recorded in S2's seam changes; no code. |
| N1–N6 | kept | Each a removal or zero-net. |
| (c) URL credential in land's output | dropped | Land's stdout is its own fixed lines; git's stderr is shown only when stdout is empty (L9); a fix belongs in `findCredential`, outside this feature. |
| QA taste: deck byline "other", header "THE PILOT REPLIED"; lost indent on `failing:` | dropped | §7 puts the byline out of scope; the indent is cosmetic. |
| Fix-round reviewer MEDIUM: a landing child outlives a restarted daemon, so interrupted may be pressed again while land still pushes | dropped (assumed) | The race predates F1 on every platform (Windows never kills a child with its parent); spec 7 accepts it ("check origin/pilot", Sign off may be pressed again), and land's own retake makes a second landing load, not unsafety (A4). Killing held landings on shutdown is new behaviour no spec line asks for. |
