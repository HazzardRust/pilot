# The threads page shows the pilot's state, inferred by the deck

Ticket `itm_959d1977b78c` · feature `pilot-state-line` · base `pilot` 671567e4 · ADR 0149

## 1. Problem

The user opened the deck's threads page, saw no threads and could not tell why; the CLI showed the
pilot was handing off at its context limit. They want the deck itself to say what is happening, as one
line at the foot of the threads list and alone on an empty list, in a few deterministic states no agent
manages: the deck infers them from what it already sees.

## 2. Spec

| # | Behaviour a user can watch | Evidence |
| --- | --- | --- |
| 1 | The home queue (`/`, the threads page) carries one state line under the last card, and under "Nothing is waiting on you." on an empty tab. | `renderHomePage` test, populated and empty tab, line after the queue. |
| 2 | `handing off`: an open `handoff` item in the repository (what `pilot handoff` posts, or a chain hand-off); its time is the item's `postedAt`. | Planted open handoff → line reads `handing off` with that time. |
| 3 | `picked up`: the repository's newest `handoff`, resolved in the last 5 minutes (the fresh session's `deck_resolve`, or the lane's `picked up` on a chain hand-off); its time is `resolvedAt`. | Planted resolved handoff → `picked up` at +4 min, not at +6 min. |
| 4 | `listening`: a `deck_wait` (any `pilot wait --as <kind>`) is parked for the repository; its time is when the first parked wait began. | Over HTTP, a parked wait → `listening`; after it returns, not. |
| 5 | `working`: a deck write from the repository in the last 10 minutes (a run's `lastSeenAt`), or a live crew agent on the roster; its time is the newest of those signals. | Planted `lastSeenAt` / roster agent → `working`; at +11 min, not. |
| 6 | `quiet` (L11): a live run in the repository with none of the above; its time is its last signal. | Live run, `lastSeenAt` 20 min old → `quiet`. |
| 7 | `no session`: no live run in the repository. | No runs, or only dead pids → `no session`. |
| 8 | The line names the live ticket (`no live ticket` without one) and the state's time as an absolute `<time>`, which the page's `time.mjs` shows relative. | Planted ticket title and timestamp read back from the line. |
| 9 | No agent sets or clears the state: nothing stores it and no tool argument names it; it is read at render time from items, runs, the roster and the wait registry. | Pure-function tests per state; `git grep -n pilotState deck/tools.mjs deck/store*.mjs` prints nothing. |
| 10 | (L10) An open page follows the state without a reload: a wait parking and returning, and a 5- or 10-minute window lapsing, each announce to the pages. | SSE test sees `changed` at hold, at release and at the lapse. |
| 11 | (L9) On the Overview the line is one per tab, each prefixed with the tab's name. | Overview with two tabs → two lines, each with its name. |

Precedence when several signals hold (L3): handing off > listening > no session > picked up > working > quiet (amended by the user on itm_291acc92a53d, as §5 L3 records).
The draft's "or `pilot handoff` ran" cannot mean more than its post here: `scripts/handoff.mjs` commits and
pushes the record first and writes nothing to the deck until it posts, so those seconds read `working`.

## 3. Findings

- **The threads page** is the home queue: `GET /` (`deck/server-routes.mjs:113-145`) calls `renderHomePage`
  (`deck/ui/render-pages.mjs:227`), which picks the Overview or a repo tab (`tabsOf`, `landingFor`,
  `tabFor`, `deck/tabs.mjs:87,178,196`) and draws `renderQueue` (`:176`), whose empty case is
  `<p class="empty">Nothing is waiting on you.</p>`, pinned by `deck/test/status.test.mjs:398`,
  `deck/test/days.test.mjs:258`, `deck/test/add-deck.test.mjs:189`. The queue sits inside
  `<main data-live="queue">` (`deck/ui/home.html:24`), swapped on every SSE `changed` (`deck/ui/js/live.mjs:335,361`).
- **Times** are absolute on the server: `renderTime` (`deck/ui/render-parts.mjs:93`, not exported) writes
  `<time datetime>`, and `time.mjs` makes it relative; the page is never re-rendered on a timer (D1).
- **`pilot handoff`** posts one `handoff` item (`scripts/handoff.mjs:116-171`; `postItem`,
  `deck/store-items.mjs:65,109-122`): `kind`, `title`, `body`, `repo`, `postedAt`, `owner: 'pilot'`, no ticket.
  It is queued (`isQueued`, `deck/items.mjs:512`), so while open it already shows as a card.
- **The pickup**: SessionStart (`hooks/session-handoff.js:425-533`) delivers the newest open `handoff` for
  the directory; the fresh session resolves a plain one with `deck_resolve`, the lane resolves a chain one
  (`item.next`) with `picked up`. Either way `resolvedAt` is set (`deck/store-items.mjs:442-471`).
- **The wait registry**: `held` in `deck/agents.mjs:205-217`, a count keyed `kind repoKey`, in memory, no
  start time and no reader but `quietAt`. `holdWait` is called from `runTool` (`deck/server-tools.mjs:450`)
  and released in its `finally` (`:461-464`); a dead `pilot wait` drops its socket and so its hold.
  `watchAgents(announceChange)` (`deck/server-wait.mjs`) is the callback the roster already announces through.
- **Activity**: a run's `lastSeenAt` (`deck/runs.mjs:144`) is stamped by `touchRuns`
  (`deck/store-core.mjs:322`) on every post, reply, resolve, ticket call and `deck_status`, persisted. The
  roster (`noteAgent`, `deck/agents.mjs:170-180`) holds crew agents seen in the last 90 s and reaches each
  tab as `tab.agents` (`deck/tabs.mjs:136`); the main session is never on it. `tab.ended` means no live run.
- **Live ticket**: `liveTicketOf(items, dir)` (`deck/items.mjs:537`).
- **Timed announces**: `handoffTimers` (`deck/server-wait.mjs:318-335`) arms one `announceChange` per open
  hand-off at its `HANDOFF_ACK_MS` lapse; the state's windows follow that pattern.
- **Adjacency**: yellow-lane edits `deck/server-routes.mjs` (the `/api/record` hunk, not `GET /`),
  `deck/server-tools.mjs`, `deck/ui/render-parts.mjs`, `deck/ui/render-rail.mjs`, `deck/items.mjs`,
  `deck/runs.mjs`, `deck/store-runs.mjs`; this design owns `deck/server-routes.mjs` (one argument in the
  `GET /` call) and `deck/ui/render-parts.mjs` (one `export` word) of those. report-record owns
  `deck/items.mjs`, `deck/store-items.mjs`, `deck/ui/render-cards.mjs`, `deck/store-runs.mjs`,
  `hooks/lib/deck.js`: none is owned here. A base carrying both rebases this cleanly.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `deck/pilot-state.mjs` (new) | `pilotStateOf(tab, items, held, now)`, `PICKED_UP_MS`, `WORKING_MS` | The precedence, the windows, the live-ticket lookup and the choice of time | In-process |
| `deck/agents.mjs` wait registry | `holdWait(repo, kind)`, `heldWaits()` | The count per kind and repository, its start time, the announce on first hold and last release | In-process (in-memory state) |
| `deck/ui/render-pages.mjs` home page | `renderHomePage(..., lanes, held)`, `renderStateLine(line)` | Where the line sits, its markup, per tab or per Overview | In-process |
| `deck/server-wait.mjs` timers | `armStateTimers(items, runs)` | One announce at each window's lapse | In-process (clock) |

Deletion test: `pilot-state.mjs` earns its keep (without it the precedence is spread over the renderer and
its tests); `heldWaits` is the registry's first reader beyond `quietAt` and stays behind `agents.mjs`;
nothing existing is shallow enough to fold, so there is no fold slice.

## 4. Ubiquitous language

- **State line**: the one line naming the pilot's state for a repository, under the queue.
- **Pilot state**: one of `handing off`, `listening`, `picked up`, `working`, `quiet`, `no session`.
- **Held wait**: a `deck_wait` parked in the daemon for a repository, of any kind.
- **Window**: how long a past signal still counts: `PICKED_UP_MS` 5 min, `WORKING_MS` 10 min.
- **Signal time**: the time a state is shown with, the moment its signal began.

## 5. Locked decisions

Grilling depth: **forks** (itm_c253206cfd3e, 2026-10-14): only decisions with materially different deliverables are
asked; the rest are assumed and listed at Gate 1, no walk.

- **L1 Derived, never stored** (ADR 0105's precedent): `pilotStateOf` is pure over what the page already
  reads; no item field, no tool argument, no store write. Rejected: a `deck_status` field the pilot sets,
  the agent-managed state the user ruled out.
- **L2 A new module** `deck/pilot-state.mjs`, not beside `accentOf` in `deck/items.mjs`: `items.mjs` is
  owned by both adjacent runs. Rejected: `items.mjs`, three runs rebasing on one file.
- **L3 Precedence** handing off > listening > no session > picked up > working > quiet (amended by the user on itm_291acc92a53d: an ended session never reads `picked up` or `working`): an open hand-off is
  the fact the user needs most; a parked wait is fresher than a pickup; a pickup is news for its window.
  Rejected: newest-signal-wins, which flickers between a wait's hold and its own write.
- **L4 Signals**: `handing off` from any open `handoff` (plain or chain) in the repository; `crew-handoff`
  is a crew agent's, not the pilot's, and is ignored. `working` from `lastSeenAt` or `tab.agents`.
  Rejected: a new per-call stamp in `runTool`, which duplicates `lastSeenAt` on yellow-lane's file.
- **L5 The registry carries its start**: `held` maps a key to `{ count, since }`; `heldWaits()` returns
  `{ [repoKey]: since }`, the earliest across kinds. In memory like the rest of the registry: a daemon
  restart drops every wait, and so every hold, together.
- **L6 Announce through the existing seams**: `holdWait` calls the `watchAgents` callback on a key's first
  hold and last release; `armStateTimers` mirrors `handoffTimers` for `resolvedAt + PICKED_UP_MS` and
  `lastSeenAt + WORKING_MS`. Rejected: a client-side timer (D1 forbids page timers).
- **L7 Markup**: `<p class="pilot-state" data-pilot-state="<state>">` inside `data-live="queue"`, after
  `renderQueue`'s output; the empty paragraph's text is untouched (three tests pin it). Time through
  `renderTime`, exported from `render-parts.mjs`. Ticket titles through `escapeHtml`.
- **L8 QA environment** (standing): a scratch deck, `pilot deck --scratch`.
- **L9 Where the line shows** (question itm_a23a7a7510aa, answered 2026-10-15): on a repo tab its one line; on
  the Overview one line per tab, each prefixed with the tab's name. The rail and strip stay as they are.
  Rejected: tab only, which leaves the Overview, the likeliest landing page with no run live, silent.
- **L10 Live update** (question itm_d9d3c97f8a57, answered 2026-10-15): a wait's hold and release and each
  window's lapse announce to open pages (S3, S4), so the line follows without a reload. Rejected: on reload
  only, where a page left open shows `listening` after the pilot stopped listening.
- **L11 A sixth state, `quiet`** (question itm_c4d8ff64d4ea, answered 2026-10-15): a live run with no signal in
  its window reads `quiet`, so `no session` means only "no live run in this repository". Rejected: five states,
  where a live pilot thinking for 11 minutes reads `no session`, the very confusion.

## 6. Assumed decisions

- **A3 Windows.** Default: `picked up` 5 min, `working` 10 min (the draft's N). Tradeoff: shorter reads
  `quiet` during long tool calls; longer keeps `working` on after a crash.
  Verdict: stands — nothing queued moves the windows; three-lanes (itm_7c9becb5d765) adds lanes, not signals, and
  the numbers are two pins a later run flips in one line.

## 7. Out of scope

A state from the context guard's notice (yellow-lane rewrites `hooks/context-size-guard.js`); a crew
agent's own `crew-handoff`; the yellow co-pilot's lane (its threads carry its state, ADR 0105); the rail,
the strip and the thread page; any change to `pilot handoff` or the SessionStart lane.

## 8. Slices

Width 3; longest stem 3

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | A repo tab shows `handing off` or `no session` under its queue (walking skeleton) | 1, 2, 7, 8, 9 | `deck/pilot-state.mjs` (new), `deck/ui/render-pages.mjs`, `deck/ui/render-parts.mjs`, `deck/ui/deck.css`, `deck/test/pilot-state.test.mjs` (new), `deck/test/pilot-state-render.test.mjs` (new), `docs/adr/0149-the-pilots-state-is-read-never-set.md` (new), `docs/adr/README.md` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | `picked up`, `working` and `quiet` read from their windows | 3, 5, 6 | `deck/pilot-state.mjs`, `deck/test/pilot-state-windows.test.mjs` (new) | S1 (`deck/pilot-state.mjs`) | `pilot:typescript-reviewer` | [S2](slices/S2.md) |
| S3 | A parked `pilot wait` reads `listening`, live | 4, 10 | `deck/agents.mjs`, `deck/server-routes.mjs`, `deck/test/pilot-state-wait.test.mjs` (new) | S1 (`renderHomePage` `held`) | `pilot:typescript-reviewer` | [S3](slices/S3.md) |
| S4 | A lapsing window refreshes the open page | 10 | `deck/server-wait.mjs`, `deck/test/pilot-state-lapse.test.mjs` (new) | S2 (`PICKED_UP_MS`, `WORKING_MS`) | `pilot:typescript-reviewer` | [S4](slices/S4.md) |
| S5 | The Overview shows one line per tab | 11 | `deck/ui/render-pages.mjs`, `deck/test/pilot-state-overview.test.mjs` (new) | S1 (`deck/ui/render-pages.mjs`) | `pilot:typescript-reviewer` | [S5](slices/S5.md) |

S3 and S5 run beside S2; S4 waits on S2 only. S5 stands (L9); S4 and S3's announce stand (L10).

## 9. Acceptance evidence

On a scratch deck (`pilot deck --scratch`) with a scratch repository registered:
1. The tab with no session open reads `no session · no live ticket` under "Nothing is waiting on you." (7, 1, 8).
2. A run registered and a `deck_post` made: the line reads `working` with the ticket's title and a time (5, 8).
3. `pilot wait --as pilot` started in the repository: the line turns `listening` without a reload; stopped, it turns back (4, 10).
4. A `handoff` posted (as `pilot handoff` does): `handing off` under the hand-off's card (2, 1).
5. The hand-off resolved: `picked up`; past 5 minutes the page turns `working` or `quiet` on its own (3, 10, 6).
6. The Overview shows one such line per tab, each named (11).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1, 2, 7, 8, 9 |
| S2 | planned | | | | S1 | 3, 5, 6 |
| S3 | planned | | | | S1 | 4, 10 |
| S4 | planned | | | | S2 | 10 |
| S5 | planned | | | | S1 | 11 |
| pilot-state-line | planned | feat/pilot-state-line | | | S1, S2, S3, S4, S5 | 1–11 |
