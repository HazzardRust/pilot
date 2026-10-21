# Start/End session: a deck starts and ends its own `pilot run` — architecture artefact

Feature: **start-end-session** · slug `start-end-session` · integration branch `feat/start-end-session` · base
`main` (A1, decided on itm_272bda0826ee; PR #206 merged 2026-09-30T09:25Z as 06fd469) · architect branch
`design/start-end-session`. Four slices, one run. Grilling depth: *forks* (itm_f50290f8a427).

## 1. Problem

In the deck-polish walkthrough (itm_d6f563bb50b2, 2026-09-30) the user asked for "a way to start a session in a deck whose
session has ended... a button on the right side, with a confirm step. it should just do 'pilot run' in the respective
directory". They widened it to "any deck with no active session in it", and added: "when there is a live session in that
deck, we should flip that button to give it the functionality to end the 'pilot run' function related to that run."

## 2. Spec

| # | Behaviour | Evidence |
|---|---|---|
| 1 | A tab with no live session (ended, or added by path and never run) shows **Start** in the right rail beside Close. The server refuses Start for a repository with a live run. | An ended tab shows Start and a live tab does not. A POST to `/start-session` for a live repository answers 409 and no process starts. |
| 2 | Pressing Start asks once. Confirming opens a new visible terminal window in the deck's directory running `pilot run`, and the tab turns live when that session registers. | A window opens with the pilot in that directory, and within a few seconds the tab loses its ended look with no reload. |
| 3 | While a Start is in flight for a repository, another Start there is refused. The latch holds until the run registers or 60 s pass. | Two quick presses (or two POSTs) open one window. |
| 4 | Start in a directory that no longer exists, or is not a directory, is refused with the reason and nothing is spawned. | Rename the folder and press Start: the page shows the refusal and no window opens. |
| 5 | On a live tab whose session `pilot run` started, the control reads **End**. Confirming it makes that repository's `pilot run` end its own session, and only that repository's. | Press End and confirm: the window closes, the tab reads ended within a few seconds, and a second live deck is untouched. |
| 6 | Start runs only in a directory the deck already has as a tab, and only when the deck's own page asks. The spawned command never carries the path. | A POST from another origin, or with no Origin, answers 403. A POST naming a directory that is not a tab answers 404. Neither starts a process. |
| 7 | When a `pilot run` session exits by any route (End, `/exit`, the window closed by hand), its tab turns ended live. | Close the window by hand: the tab flips within a few seconds with no reload. |
| 8 | A live session that `pilot run` did not start (plain `claude`) shows neither Start nor End on its tab (A5, *assumed*). | Open `claude --agent pilot:pilot` by hand: the tab is live and shows no End. |

Lines 1–5 are the user's draft, sharpened. Lines 6–8 are *assumed*: they are implied by the draft or forced by the code (F2, F4,
F6), and the user has not confirmed them yet. Start and End are drawn on win32 only (A7, *assumed*).

## 3. Findings

- **F1 Liveness.** A tab is `ended` when none of its runs' pids answers `process.kill(pid, 0)` (`deck/tabs.mjs:135`,
  `deck/runs.mjs:143-155`). This is judged when a page renders. A pid dying emits no change, so today a tab turns ended only
  on the next write or reload. Registration does announce (`deck/server.mjs:1178-1186`), so a start already turns a tab live.
- **F2 The registered pid is not the session.** It is the stdio MCP client's own pid (`deck/client.mjs:182-186`,
  `runs.mjs:4-6`), a child of `claude`. Killing it would drop the deck connection and leave `claude` running. A stored pid
  may also have been reused after a restart, which is why ADR 0035 rejected killing by it.
- **F3 `pilot run` needs a terminal.** `startUnderPty` (`deck/run.mjs:561`) puts stdin into raw mode and draws through
  ConPTY with `useConptyDll`. The daemon is spawned `detached`, `stdio: 'ignore'`, `windowsHide` (`client.mjs:145-151`), so
  it has no console to lend. Opening a new console through `cmd /c start` is already what `deck/open.mjs` does for the browser.
- **F4 The wrapper owns its session.** `run()` holds the pty and kills it on SIGINT/SIGTERM (`run.mjs:646`). It streams
  `/events` from the daemon (`run.mjs:435-453`, the loop in `watch` at `:479`), so a message the daemon puts on that stream
  reaches exactly the process that can end the session cleanly. node-pty's Windows kill takes every process attached to
  the console with it.
- **F5 Write guards.** Every route passes `isOwnHost` (DNS rebinding, `server.mjs:327`). Create, Remove and Full auto also
  require `fromOwnPage`: Origin present and equal to Host (`server.mjs:834`, and `:1051` on deck-polish). A cross-site page
  cannot forge Origin, and a local process can already run anything, so no token would add a boundary.
- **F6 Wrappers count as browsers.** Wrappers listen on the same emitter event as pages, so `browserCount`
  (`server.mjs:354`) counts them.
- **F7 The environment leaks.** The daemon inherits the environment of whichever session started it (`client.mjs:147`).
  An inherited `CLAUDE_PROJECT_DIR` makes a session claim its parent's repository (`client.mjs:175-178`).
- **F8 Deck polish (#206, unmerged).** It adds added-by-path tabs (`deck.added`, `tabsOf(..., added)` at `tabs.mjs:87`
  there) and the Close control (`renderRemove`, `deck/ui/render.mjs:1165` there, drawn in `renderEverything` `:1054`).
  Its L4 says the deck "never reads, lists or runs anything in" an added path. This feature reverses that for Start alone.
- **F9 ADR 0039** says "the daemon starts no session". ADR 0035's headless launcher and its Stop-by-pid were removed.
  The no-sweep rule, never an image-wide kill, is in `agents/pilot-implementer.md:62-66` and `agents/pilot-qa.md:110`.

## 4. Ubiquitous language

- **Start**: the tab control that opens a new terminal window running `pilot run` in the tab's directory.
- **End**: the tab control that asks that directory's wrappers to end their sessions.
- **Wrapper**: a `pilot run` process. It owns the session's pty, and it is the only thing that ever ends a session.
- **Wrapper stream**: a wrapper's own `/events` connection, tagged with its repository. Its presence is what "End
  available" means, and its closing is what turns a tab ended live.
- **Starting latch**: the daemon's in-memory, per-repository mark that a Start is in flight.

## 5. Locked decisions

- **L1 The daemon kills nothing.** End is an `end` event on the wrappers' streams for that repository. Each wrapper kills
  its own pty (`run.mjs:646`'s `stop`). *Rejected*: the daemon running `taskkill /T /F` on the run's pid, which is the MCP
  client's (F2) and may have been reused; and killing the parent of that pid, which makes the same pid guess one level up.
- **L2 Start spawns one fixed shape.** The command is `cmd.exe /d /c start "pilot run" <process.execPath> <package
  bin/pilot.mjs> run`, with `shell: false`, `detached`, `windowsHide` (which hides only `cmd`'s own window), and `unref`.
  The deck's directory reaches the child as `cwd` only, never on a command line, so `&`, `^` or `%` in a path cannot be
  parsed by `cmd`. A package path containing `"` or `%` is refused. *Rejected*: putting the directory in `start /D`, where
  `cmd` would parse it; a headless pty (ADR 0039).
- **L3 A Start is guarded four ways.** `fromOwnPage`. The repository must be the `repo` of an existing tab (`tabFor` over
  the stored `tabsOf`), and the tab's own spelling is used. `fs.stat` must say it is a directory at press time. The tab must
  have no live run and no starting latch. *Rejected*: a CSRF token held by the page, which adds nothing over Origin (F5).
- **L4 The spawned environment is scrubbed.** It drops every marker of the session that launched the daemon (F7):
  `CLAUDECODE`, `CLAUDE_PROJECT_DIR`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_SSE_PORT`, `CLAUDE_CODE_CHILD_SESSION`,
  `CLAUDE_CODE_AGENT`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_SESSION_ATTENDED`, `CLAUDE_CODE_MESSAGING_SOCKET`,
  `CLAUDE_CODE_MESSAGING_TOKEN`, `CLAUDE_CODE_EXECPATH` and `CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP`, one exported
  list in `deck/session.mjs`. Any other `CLAUDE_CODE_*` name is configuration and stays. It keeps
  `PILOT_DECK_PORT`/`PILOT_DECK_DIR`, so a scratch deck starts sessions that talk to that same deck. The permission mode
  is whatever `pilot run` by hand gives, with no flag added. *Amended during S1* (2026-09-30): the four-name list left
  `CLAUDE_CODE_CHILD_SESSION` through, and a started session then ran with transcript saving off; the pilot listed the
  markers a live session carries and widened the list to them. *Rejected*: a `CLAUDE_CODE_*` wildcard, which would drop
  settings such as `CLAUDE_CODE_USE_BEDROCK`.
- **L5 The wrapper stream is `GET /events?wrapper=<cwd>`.** It is refused when an Origin is present, because a wrapper
  sends none and a cross-site `EventSource` does. It uses its own emitter event, so wrappers stop counting as browsers
  (F6). Its close calls `announceChange`, which is spec 7. It is held in memory only, and a daemon restart forgets it until
  the wrapper reconnects (`watch` retries every 2 s).
- **L6 Start and End are one rail control.** It is Start when `tab.ended`, End when the tab is live and has a wrapper
  stream (`tab.wrapped`), and nothing otherwise. It is drawn with `renderRemove`'s two-step confirm (`js/confirm.mjs`).
  Both routes answer 303 to the tab, and a refusal lands back on the tab with its reason drawn in the control
  (`?sessionRefused=`), as an Add's lands beside the + box. *Amended in the fix round* (2026-09-30): the bare
  `text/plain` refusal page left the user on a dead end. A tab that draws neither control (a live plain-`claude`
  tab, the overview) draws no reason either: its own state is the answer, and a bare line widened the rail (QA,
  0970de0).
- **L7 The suite never opens a window.** `PILOT_DECK_NO_START`, set in `deck/test/no-open.mjs` beside `PILOT_DECK_NO_OPEN`,
  makes `startSession` refuse. Unit tests inject `spawn`. A scratch deck on its own port does start sessions, unlike
  `openDeck`, because QA needs it to.
- **L8 An ADR supersedes ADR 0039 in part** (`docs/adr/0050-a-deck-starts-a-visible-pilot-run-when-pressed.md`, S1): the
  daemon may start a visible `pilot run`, only from the Start route, and the rest of 0039 stands.

## 6. Assumed decisions (awaiting the user)

| # | Decision | Default taken | Tradeoff |
|---|---|---|---|
| A1 | Base branch | **Decided** (itm_272bda0826ee): `main`, after #206 merged (06fd469, 09:25Z). The design branch is rebased onto that tip at Gate 1 and `feat/start-end-session` is cut from it; the feature PR targets `main`. | Rejected: branching from `feat/deck-polish` and retargeting later. |
| A2 | Which window | `cmd /c start`, the user's default terminal (Windows Terminal on Win11 when it is the default) | conhost if WT is not the default. `wt.exe` fails where WT is not installed, and it parses `;` itself. |
| A3 | End mid-turn | **Decided** (itm_9077651d77ca): a plain stop. The run record survives, and the next Start's resume prompt resumes | That turn's unwritten state is lost. Rejected: a hand-off first, which would make End take minutes and could hang. |
| A4 | The command | The daemon's own `node bin/pilot.mjs run` | A different `pilot` on PATH (a dev checkout) is not the one used. |
| A5 | A plain-`claude` live tab | No End (spec 8) | Some live tabs cannot be ended from the deck. |
| A6 | Two wrappers on one repository | End ends both (a tab is a repository, D3) | There is no per-run End. |
| A7 | Platform | win32 only. Neither control is drawn elsewhere | macOS and Linux users get no Start. |
| A8 | QA environment | **Decided** (itm_a4cc9a7b6213): a scratch deck on port 4397, started from the branch, own store, a registered test repo | The 4321 deck sees nothing until the feature is merged. |

## 7. Out of scope

A headless or background session. Starting from a thread or from Create. Killing by pid or by process name. A hand-off
before End (A3). Start on macOS and Linux (A7). Choosing a permission mode or a model per Start. Surviving a daemon restart
mid-start (the latch is in memory). The `/api/chain` start-up path, which a started wrapper runs unchanged.

## 8. Slices

Estimate: 4 × ~40–50 min ≈ 3 h, within one run (`skills/ticket-making/SKILL.md`, Size). Every slice owns `deck/server.mjs`,
so the DAG is a chain.

| Slice | Delivers | Files owned | After | Detail |
|---|---|---|---|---|
| **S1 Start opens a `pilot run` window on an ended tab** (walking skeleton) | 1, 2, 6 | `deck/session.mjs` (new), `deck/server.mjs`, `deck/ui/render.mjs`, `deck/ui/deck.css`, `deck/test/no-open.mjs`, `deck/test/start-session.test.mjs` (new), `docs/adr/0050-a-deck-starts-a-visible-pilot-run-when-pressed.md` (new) | – | [S1](slices/S1.md) |
| **S2 Start refuses a missing directory and a second press** | 3, 4 | `deck/session.mjs`, `deck/server.mjs`, `deck/test/start-session.test.mjs` | S1 | [S2](slices/S2.md) |
| **S3 A wrapper's stream turns its tab ended live** | 7 | `deck/run.mjs`, `deck/server.mjs`, `deck/session.mjs`, `deck/test/run.test.mjs`, `deck/test/wrapper-stream.test.mjs` (new) | S2 | [S3](slices/S3.md) |
| **S4 End ends that deck's `pilot run`** | 5, 8 | `deck/run.mjs`, `deck/server.mjs`, `deck/session.mjs`, `deck/tabs.mjs`, `deck/ui/render.mjs`, `deck/test/run.test.mjs`, `deck/test/end-session.test.mjs` (new) | S3 | [S4](slices/S4.md) |

## 9. Acceptance evidence, in the order the user meets it

On a scratch deck (port 4397, A8), started from this branch:

1. An ended tab and an added-by-path tab each show Start beside Close, and a live tab shows none (1, 8).
2. Start, then confirm: a terminal window opens in that directory with the pilot answering, and the tab turns live without
   a reload (2).
3. Pressing Start twice quickly opens one window (3). Start on a renamed folder shows the refusal and opens no window (4).
4. `curl -X POST` to `/start-session`, once with a foreign Origin and once with none, answers 403 and nothing starts (6).
5. End, then confirm, on the started tab: the window closes and the tab reads ended within seconds. A second live deck
   keeps running (5).
6. Start again, then close the window by hand: the tab flips to ended within seconds (7).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Delivers |
|---|---|---|---|---|---|---|
| S1 Start opens a `pilot run` window on an ended tab | planned | | | | – | 1, 2, 6 |
| S2 Start refuses a missing directory and a second press | planned | | | | S1 | 3, 4 |
| S3 A wrapper's stream turns its tab ended live | planned | | | | S2 | 7 |
| S4 End ends that deck's `pilot run` | planned | | | | S3 | 5, 8 |
| feature start-end-session | Gate 2 signed 2026-09-30T13:22Z on itm_1bad7a7629df, at 0970de0 | `feat/start-end-session` | #215 | | S1–S4 | 1–8 |

## 11. Principles findings

The feature-level principles review of 31faac7 and QA's pass over it, as the pilot weighed them. The IDs are the
review's own, not §3's findings. Kept rows landed in the fix round (`fix/start-end-session-review`).

| Finding | What | Decision | Why |
|---|---|---|---|
| F1 | The NO_START, win32-only and `"`/`%` guard tests ran on a missing directory, so the directory check refused first | kept | Their mutants all survived; they now run on a real directory and assert 403, 400 and the offending value |
| F2 | The marker test built its input from `PARENT_MARKERS` | kept | Asserted against L4's twelve names, written out |
| F3 | The quoted `execPath` and `windowsVerbatimArguments` were unasserted | kept | Both asserted on the recorded spawn |
| F4 | No test failed if the daemon stopped passing `listWrapped()` to the page | kept | A route test opens a wrapper stream and reads End on the tab's page |
| F5 | The confirm step's `hidden` and button text were unasserted | kept | Asserted for Start and End, scoped to their own step |
| F6 | — | dropped | A cheap defence, and its equivalence rests on event timing |
| F7 | `if (!settle) return;` in `startUnderPty` could not be reached | kept | Deleted: both callers use `settle?.()` after it is nulled |
| F8 | `{ started: true }` and `{ ended: n }` were never read | kept | Deleted, with the two assertions that read them |
| F9 | The stored-tab lookup was written three times | kept | `storedTabFor(repo)` in `store.mjs`, called by `addDeck` and both routes |
| F10 | A `stat` failure other than a missing path was rethrown as a 500 | kept | Every one is a 400 naming `err.code`, as `addDeck` does |
| F11 | The S1, S3 and S4 Interface blocks and L6 had drifted from the code | kept | Amended to the code |
| N1 | — | dropped | A refactor past this run |
| N2 | `SessionRefusal` duplicated `DeckRefusal` | kept | `DeckRefusal` takes an optional status; `SessionRefusal` and its catch branch are gone |
| N3 | — | dropped | Net 0 lines |
| N4 | `WRAPPER_GONE_MS` was exported and unused outside the module | kept | The export is dropped |
| N5 | The wrapper stream's comment said its close told no wrapper or waiter | kept | Corrected: the close and its two timers are `announceChange`, which wakes them all |
| N6 | Nothing asserted that a `data:` line with no `event:` is not a change | kept | One assertion in `run.test.mjs` |
| N7 | — | dropped | Predates the feature |
| N8 | — | dropped | The existing shape |
| QA | A Start or End refusal landed on a bare `text/plain` page | kept | It lands back on the tab, its reason drawn in the control (L6 amended) |
| QA | Start's confirm wrapped the absolute path to seven lines at 18rem | kept | It names the tab (`D<n>`), as End's does |
| QA | The 403 own-page copy | dropped | The generic guard fires first; harmless |
| QA | The ended-banner copy | dropped | Predates the feature |
| QA (re-probe) | A refusal landing on a tab with neither control drew its bare reason in the vertical rail | fixed by QA, 0970de0 | Nothing is drawn there; a test pins it |
